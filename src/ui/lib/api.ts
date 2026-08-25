import type { JiraProject, JiraResult, SyncStats, UserConfig } from '@/types';

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

  jiraProjects(workerUrl: string, config: UserConfig) {
    return post<ProjectsResponse>(workerUrl, {
      mode: 'JIRA_PROJECTS',
      user_config: config,
    });
  },
};
