// ============================================================
// AI Context Orchestrator — Jira API Module
//
// ВАЖНО: *.atlassian.net прикрыт Cloudflare/edge-защитой Atlassian,
// которая режет запросы без браузерного User-Agent и с датацентровых
// IP (в т.ч. egress Cloudflare Workers). Раньше это проявлялось как
// «Unexpected token 'C', "Cloudflare"... is not valid JSON» —
// res.json() падал на HTML-странице блокировки. Теперь:
//   1) все запросы идут с браузерным набором заголовков;
//   2) тело читается через text(), ошибки — понятные, с контекстом.
// ============================================================

/** Браузерный UA — Atlassian отдаёт страницу блокировки клиентам без него */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const jiraHeaders = (email, token, extra = {}) => ({
  Authorization: `Basic ${btoa(`${email}:${token}`)}`,
  Accept: "application/json",
  "User-Agent": BROWSER_UA,
  ...extra,
});

/**
 * Разобрать ответ Jira: JSON или ПОНЯТНАЯ ошибка вместо SyntaxError.
 * context — человеческое описание операции («список проектов»…)
 */
async function parseJiraResponse(res, context, domain = "") {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(describeNonJson(res, text, context, domain));
  }
  if (!res.ok) {
    const apiMsg =
      (Array.isArray(data?.errorMessages) && data.errorMessages.join("; ")) ||
      (data?.errors && typeof data.errors === "object"
        ? Object.values(data.errors).join("; ")
        : "") ||
      data?.message ||
      `HTTP ${res.status}`;
    throw new Error(`Jira (${context}): ${apiMsg}`);
  }
  return data;
}

/**
 * Диагностика не-JSON ответа: страница блокировки Cloudflare, требование
 * CAPTCHA (Atlassian включает её после серии неуспешных Basic-попыток,
 * особенно с датацентровых IP) и прочие HTML-заглушки.
 */
function describeNonJson(res, text, context, domain = "") {
  const t = String(text || "");
  const plain = t
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  const deniedHeader =
    res.headers && typeof res.headers.get === "function"
      ? res.headers.get("x-authentication-denied-reason") || ""
      : "";
  const hay = `${deniedHeader}\n${t}`.toLowerCase();

  // CAPTCHA / временная блокировка аутентификации
  if (hay.includes("captcha")) {
    const loginHint = domain
      ? ` Проверь логин вручную на https://${domain}/login — успешный вход снимает блокировку.`
      : "";
    return (
      `Jira (${context}): ${res.status}, Atlassian требует CAPTCHA` +
      `${deniedHeader ? ` (${deniedHeader})` : " (обычно после нескольких неудачных попыток входа)"}.` +
      ` Подожди 15–30 минут перед повтором.${loginHint}`
    );
  }

  // Страница блокировки Cloudflare/WAF
  if (/attention required|access denied|cf-ray|just a moment|cloudflare/.test(hay)) {
    return (
      `Jira (${context}): запрос заблокирован защитой Cloudflare/Atlassian (HTTP ${res.status}). ` +
      `Egress-IP Cloudflare Workers часто попадает под ограничения. ` +
      `Повтори позже либо используй прокси вне Cloudflare.` +
      (plain ? ` Ответ: «${plain}»` : "")
    );
  }

  if (res.status === 401 || res.status === 403) {
    return (
      `Jira (${context}): ${res.status} — проверь Jira Domain, Email и API Token ` +
      `(токен создаётся на id.atlassian.com).` +
      (plain ? ` Ответ сервера: «${plain}»` : "")
    );
  }

  return `Jira (${context}): получен не-JSON ответ (HTTP ${res.status}). Начало: «${plain || "(пусто)"}»`;
}

/** Короткая выжимка из ошибочного ответа для карточек результатов */
function briefError(text, status) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const plain = String(text || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    return plain || `HTTP ${status}`;
  }
  return (
    (Array.isArray(data?.errorMessages) && data.errorMessages.join("; ")) ||
    (data?.errors && typeof data.errors === "object"
      ? JSON.stringify(data.errors)
      : "") ||
    data?.message ||
    `HTTP ${status}`
  );
}

/**
 * Fetch all accessible Jira projects (for the project selector dropdown).
 * Бросает ошибку с причиной — чтобы Settings показывал, что именно не так.
 */
export async function fetchProjects(cfg) {
  if (!cfg.domain || !cfg.token) return [];

  const url = `https://${cfg.domain}/rest/api/2/project`;
  const res = await fetch(url, { headers: jiraHeaders(cfg.email, cfg.token) });
  const data = await parseJiraResponse(res, "список проектов", cfg.domain);
  return (Array.isArray(data) ? data : [])
    .map(p => ({ key: p.key, name: p.name || p.key }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Fetch all open Jira tickets for deduplication context.
 * Бросает ошибку: если бэклог недоступен, синк мог бы создать дубликаты.
 *
 * Эндпоинт: POST /rest/api/3/search/jql — старый GET /rest/api/2/search
 * удалён Atlassian (changelog CHANGE-2046). Новый поиск пагинируется через
 * nextPageToken и не возвращает total.
 */
const TICKET_FIELDS = ["key", "summary", "priority", "status", "issuetype"];
const MAX_TICKETS = 100;

export async function fetchOpenTickets(cfg) {
  if (!cfg.domain || !cfg.token || !cfg.project) return [];

  const jql = `project = "${cfg.project}" AND statusCategory != Done ORDER BY updated DESC`;
  const url = `https://${cfg.domain}/rest/api/3/search/jql`;

  const issues = [];
  let nextPageToken;

  do {
    const body = { jql, fields: TICKET_FIELDS, maxResults: 100 };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const res = await fetch(url, {
      method: "POST",
      headers: jiraHeaders(cfg.email, cfg.token, {
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(body)
    });
    const data = await parseJiraResponse(res, `поиск тикетов (${cfg.project})`, cfg.domain);

    issues.push(...(data.issues || []));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken && issues.length < MAX_TICKETS);

  return issues.slice(0, MAX_TICKETS).map(i => ({
    key: i.key,
    summary: i.fields.summary,
    priority: i.fields.priority?.name || "Medium",
    type: i.fields.issuetype?.name || "Task",
    status: i.fields.status?.name || "To Do"
  }));
}

/**
 * Process a single action from LLM output
 */
export async function processAction(act, cfg) {
  const headers = jiraHeaders(cfg.email, cfg.token, {
    "Content-Type": "application/json"
  });
  const base = `https://${cfg.domain}/rest/api/2`;

  if (act.action_type === "CREATE") {
    return createTicket(act, cfg, base, headers);
  }

  if (act.action_type === "UPDATE_PRIORITY" && act.matched_jira_key) {
    return updatePriority(act, cfg, base, headers);
  }

  if (act.action_type === "ADD_COMMENT" && act.matched_jira_key) {
    return addComment(act, cfg, base, headers);
  }

  return { status: "skipped", reason: "Unknown action or missing jira_key" };
}

// ── Private helpers ──────────────────────────────────────────

async function createTicket(act, cfg, base, headers) {
  const acText = (act.acceptance_criteria || []).map(a => `• ${a}`).join("\n");
  const description = [
    act.description || "",
    acText ? `\n\n*Acceptance Criteria:*\n${acText}` : ""
  ].join("").trim();

  const body = {
    fields: {
      project: { key: cfg.project },
      summary: act.summary,
      description,
      issuetype: { name: act.issue_type || "Task" },
      priority: { name: act.priority || "Medium" },
      ...(act.labels?.length && { labels: act.labels }),
      ...(act.parent_key && { parent: { key: act.parent_key } })
    }
  };

  const res = await fetch(`${base}/issue`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  // Читаем текст один раз: страница блокировки тоже не должна ронять воркер
  const text = await res.text();

  if (res.ok) {
    let created;
    try {
      created = JSON.parse(text);
    } catch {
      return { status: "error", summary: act.summary, error: describeNonJson(res, text, "создание тикета", cfg.domain) };
    }
    return {
      status: "created",
      summary: act.summary,
      jira_key: created.key,
      jira_url: `https://${cfg.domain}/browse/${created.key}`,
      priority: act.priority || "Medium",
      issue_type: act.issue_type || "Task"
    };
  }

  return { status: "error", summary: act.summary, error: briefError(text, res.status) };
}

async function updatePriority(act, cfg, base, headers) {
  const res = await fetch(`${base}/issue/${act.matched_jira_key}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ fields: { priority: { name: act.new_priority || "High" } } })
  });

  if (res.ok) {
    return {
      status: "updated",
      jira_key: act.matched_jira_key,
      new_priority: act.new_priority,
      old_priority: act.old_priority || "—",
      jira_url: `https://${cfg.domain}/browse/${act.matched_jira_key}`
    };
  }

  return { status: "error", jira_key: act.matched_jira_key, error: "Failed to update priority" };
}

async function addComment(act, cfg, base, headers) {
  const res = await fetch(`${base}/issue/${act.matched_jira_key}/comment`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: act.comment_text || "Контекст обновлён из дневного дайджеста." })
  });

  if (res.ok) {
    return {
      status: "commented",
      jira_key: act.matched_jira_key,
      comment_summary: act.comment_text,
      jira_url: `https://${cfg.domain}/browse/${act.matched_jira_key}`
    };
  }

  return { status: "error", jira_key: act.matched_jira_key, error: "Failed to add comment" };
}
