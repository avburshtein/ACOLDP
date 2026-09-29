/**
 * Обёртки над localStorage. Нечувствительные настройки — в localStorage,
 * ключи сессии — только в памяти (см. types.ts SessionKeys).
 */

const CFG_PREFIX = 'acoldp_cfg_';

export type CfgKey = 'provider' | 'base-url' | 'jira-project' | 'worker-url' | 'mode' | 'guest';

export function loadCfg(key: CfgKey): string {
  try {
    return localStorage.getItem(CFG_PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

export function saveCfg(key: CfgKey, value: string): void {
  try {
    if (value) localStorage.setItem(CFG_PREFIX + key, value);
    else localStorage.removeItem(CFG_PREFIX + key);
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Воркер деплоится один раз, адрес публичный (CORS *) — дефолт зашит здесь,
 *  чтобы поле Worker API URL не показывалось в Settings никому.
 *  Если адрес изменится (переезд воркера) — правится ТОЛЬКО эта константа. */
export const DEFAULT_WORKER_URL = 'https://ai-orchestrator-api.av-burshtein.workers.dev';

export function getWorkerUrl(): string {
  return loadCfg('worker-url') || DEFAULT_WORKER_URL;
}

const DRAFT_KEY = 'acoldp_draft';

export function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(value: string): void {
  try {
    if (value) localStorage.setItem(DRAFT_KEY, value);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
