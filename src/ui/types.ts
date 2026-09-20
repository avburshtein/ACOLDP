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

export type Mode = 'REPORT' | 'LEARNING_DIGEST' | 'CASE_DRAFT' | 'JIRA_SYNC';

export const MODE_LABELS: Record<Mode, string> = {
  REPORT: 'Отчёт',
  LEARNING_DIGEST: 'Дайджест',
  CASE_DRAFT: 'Кейс UX42',
  JIRA_SYNC: 'В Jira',
};

export const MODE_ACTION_LABEL: Record<Mode, string> = {
  REPORT: 'Отчёт',
  LEARNING_DIGEST: 'Дайджест',
  CASE_DRAFT: 'Кейс',
  JIRA_SYNC: 'В Jira',
};

export const MODE_DESCRIPTIONS: Record<Mode, string> = {
  REPORT:
    'Структурирует сырые заметки, чаты и идеи в ежедневный отчёт с метриками, блокерами и задачами.',
  LEARNING_DIGEST:
    'Превращает конспекты, выдержки из книг и курсов в структурированный дайджест с ключевыми концепциями и action items.',
  CASE_DRAFT:
    'Собирает материалы проекта (чаты, метрики, итерации) в черновик UX-портфолио по шаблону UX42.',
  JIRA_SYNC:
    'Сравнивает задачи из отчёта с открытыми тикетами в Jira и предлагает создать, обновить или прокомментировать.',
};

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
