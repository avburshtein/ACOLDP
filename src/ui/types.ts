/** Общие типы приложения и константы */

export type Provider = 'google' | 'alibaba' | 'openai';

export const PROVIDER_NAMES: Record<string, string> = {
  google: 'Gemini',
  alibaba: 'Alibaba (Qwen)',
  openai: 'OpenAI',
};

/** Максимум символов входного текста. 100 000 ≈ 25k токенов — безопасно для
 *  Gemini 1.5 (1M), Qwen-max / GPT-4o (128k). Поднимайте при необходимости;
 *  это лишь предохранитель от случайного «гигантского» ввода, а не жёсткий лимит.
 */
export const MAX_INPUT_CHARS = 100000;

/** Креды сессии — живут ТОЛЬКО в памяти (не попадают в localStorage) */
export interface SessionKeys {
  apiKey: string;
  jiraDomain: string;
  jiraEmail: string;
  jiraToken: string;
}

/** Полный конфиг, уходящий в Worker с каждым запросом */
export interface UserConfig {
  provider: string;
  api_key: string;
  base_url: string;
  jira_domain: string;
  jira_project: string;
  jira_email: string;
  jira_token: string;
}

export type Mode = 'REPORT' | 'JIRA_SYNC';

export interface JiraResult {
  status: 'created' | 'updated' | 'commented' | 'error';
  jira_key?: string;
  jira_url?: string;
  issue_type?: string;
  priority?: string;
  summary?: string;
  old_priority?: string;
  new_priority?: string;
  comment_summary?: string;
  error?: unknown;
}

export interface SyncStats {
  total: number;
  created: number;
  updated: number;
  commented: number;
  errors: number;
}

export interface JiraProject {
  key: string;
  name: string;
}
