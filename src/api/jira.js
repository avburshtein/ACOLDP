// ============================================================
// AI Context Orchestrator — Jira API Module
// ============================================================

/**
 * Fetch all accessible Jira projects (for the project selector dropdown)
 */
export async function fetchProjects(cfg) {
  if (!cfg.domain || !cfg.token) return [];

  const auth = basicAuth(cfg.email, cfg.token);
  const url = `https://${cfg.domain}/rest/api/2/project`;

  try {
    const res = await fetch(url, {
      headers: { "Authorization": auth, "Accept": "application/json" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .map(p => ({ key: p.key, name: p.name || p.key }))
      .sort((a, b) => a.key.localeCompare(b.key));
  } catch {
    return [];
  }
}

/**
 * Fetch all open Jira tickets for deduplication context
 */
export async function fetchOpenTickets(cfg) {
  if (!cfg.domain || !cfg.token || !cfg.project) return [];

  const auth = basicAuth(cfg.email, cfg.token);
  const jql = `project = "${cfg.project}" AND statusCategory != Done ORDER BY updated DESC`;
  const url = `https://${cfg.domain}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=key,summary,priority,status,issuetype&maxResults=100`;

  try {
    const res = await fetch(url, {
      headers: { "Authorization": auth, "Accept": "application/json" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.issues || []).map(i => ({
      key: i.key,
      summary: i.fields.summary,
      priority: i.fields.priority?.name || "Medium",
      type: i.fields.issuetype?.name || "Task",
      status: i.fields.status?.name || "To Do"
    }));
  } catch {
    return [];
  }
}

/**
 * Process a single action from LLM output
 */
export async function processAction(act, cfg) {
  const auth = basicAuth(cfg.email, cfg.token);
  const headers = {
    "Authorization": auth,
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
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

  const data = await res.json();

  if (res.ok) {
    return {
      status: "created",
      summary: act.summary,
      jira_key: data.key,
      jira_url: `https://${cfg.domain}/browse/${data.key}`,
      priority: act.priority || "Medium",
      issue_type: act.issue_type || "Task"
    };
  }

  return { status: "error", summary: act.summary, error: data.errors || data.errorMessages };
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

const basicAuth = (email, token) => `Basic ${btoa(`${email}:${token}`)}`;
