import type { JiraProject, JiraResult, SyncStats, UserConfig } from '@/types';

/** Единая точка POST к Worker с нормализацией ошибок */
async function post<T>(workerUrl: string, payload: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Нет соединения с Worker API. Проверьте URL в ⚙️ Settings.');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data['error'] ?? `HTTP ${res.status}`));
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
