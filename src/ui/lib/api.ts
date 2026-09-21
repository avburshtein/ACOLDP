import type { JiraProject, JiraResult, Mode, SyncStats, UserConfig } from '@/types';

/** Единая точка POST к Worker с нормализацией ошибок */
async function post<T>(workerUrl: string, payload: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Нет соединения с Worker API. Проверь URL в ⚙️ Settings и подключение к сети.');
  }

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // Ответ не JSON: HTML-страница Cloudflare, пустота, редирект и т.п.
    const snippet = raw.trim().slice(0, 140) || '(пустой ответ)';
    throw new Error(
      `Worker вернул не-JSON (HTTP ${res.status}). Начало ответа: «${snippet}». ` +
        'Проверь Worker API URL в ⚙️ Settings — там должен быть адрес воркера (*workers.dev), а не сайта.',
    );
  }

  if (!res.ok) {
    const msg = (data as Record<string, unknown>)['error'] ?? `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return data as T;
}

export interface ReportResponse {
  report_markdown: string;
}
export interface SyncResponse {
  stats?: SyncStats;
  results?: JiraResult[];
}
export interface ProjectsResponse {
  projects: JiraProject[];
}

export const api = {
  report(workerUrl: string, text: string, model: string, config: UserConfig) {
    return post<ReportResponse>(workerUrl, {
      raw_text: text,
      mode: 'REPORT',
      selected_model: model,
      user_config: config,
    });
  },

  jiraSync(workerUrl: string, text: string, model: string, config: UserConfig) {
    return post<SyncResponse>(workerUrl, {
      raw_text: text,
      mode: 'JIRA_SYNC',
      selected_model: model,
      user_config: config,
    });
  },

  learningDigest(workerUrl: string, text: string, model: string, config: UserConfig) {
    return post<ReportResponse>(workerUrl, {
      raw_text: text,
      mode: 'LEARNING_DIGEST',
      selected_model: model,
      user_config: config,
    });
  },

  caseDraft(workerUrl: string, text: string, model: string, config: UserConfig) {
    return post<ReportResponse>(workerUrl, {
      raw_text: text,
      mode: 'CASE_DRAFT',
      selected_model: model,
      user_config: config,
    });
  },

  jiraProjects(workerUrl: string, config: UserConfig) {
    return post<ProjectsResponse>(workerUrl, {
      mode: 'JIRA_PROJECTS',
      user_config: config,
    });
  },
};

// ── SSE-стриминг генерации ───────────────────────────────────

export interface StreamHandlers {
  onDelta: (delta: string, full: string) => void;
  signal?: AbortSignal;
}

/**
 * Стриминговый запрос генерации (SSE, HANDOFF 03 §3.1).
 * Fallback: если воркер ответил обычным JSON (старый деплой) — вернём
 * report_markdown целиком, вызвав onDelta один раз (UI единообразен).
 * При отмене пробрасывает AbortError как есть.
 */
export async function streamReport(
  workerUrl: string,
  text: string,
  mode: Mode,
  model: string,
  config: UserConfig,
  handlers: StreamHandlers,
): Promise<string> {
  const { onDelta, signal } = handlers;

  let res: Response;
  try {
    res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        raw_text: text,
        mode,
        stream: true,
        selected_model: model,
        user_config: config,
      }),
      signal,
    });
  } catch (err) {
    // AbortError пробрасываем как есть — app.tsx различает abort по err.name
    if ((err as { name?: string } | null)?.name === 'AbortError') throw err;
    throw new Error(
      'Нет соединения с Worker API. Проверь URL в ⚙️ Settings и подключение к сети.',
    );
  }

  const contentType = res.headers.get('content-type') ?? '';

  // ── Fallback: старый воркер (или ошибка) отвечает обычным JSON ──
  if (!contentType.includes('text/event-stream')) {
    const raw = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      const snippet = raw.trim().slice(0, 140) || '(пустой ответ)';
      throw new Error(
        `Worker вернул не-JSON (HTTP ${res.status}). Начало ответа: «${snippet}». ` +
          'Проверь Worker API URL в ⚙️ Settings — там должен быть адрес воркера (*workers.dev), а не сайта.',
      );
    }
    if (!res.ok) {
      const msg = (data as Record<string, unknown>)['error'] ?? `HTTP ${res.status}`;
      throw new Error(String(msg));
    }
    const full = String((data as ReportResponse).report_markdown ?? '');
    if (full) onDelta(full, full);
    return full;
  }

  // ── SSE-поток ──
  if (!res.body) throw new Error('Worker вернул пустой поток (нет body).');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let errorMessage = '';
  let finished = false;

  const handleBlock = (block: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    } catch {
      return; // невалидный JSON-чанк — пропускаем молча
    }

    if (event === 'delta') {
      const t = parsed['t'];
      if (typeof t === 'string' && t) {
        full += t;
        onDelta(t, full);
      }
    } else if (event === 'done') {
      finished = true;
    } else if (event === 'error') {
      finished = true;
      errorMessage = String(parsed['message'] ?? 'Неизвестная ошибка стрима');
    }
  };

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      handleBlock(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      if (finished) break;
      sep = buffer.indexOf('\n\n');
    }
  }
  if (!finished && buffer.trim()) handleBlock(buffer);

  if (errorMessage) throw new Error(errorMessage);
  if (!full) throw new Error('Модель вернула пустой ответ');
  return full;
}
