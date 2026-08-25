/**
 * Обёртки над localStorage. Нечувствительные настройки — в localStorage,
 * ключи сессии — только в памяти (см. types.ts SessionKeys).
 */

const CFG_PREFIX = 'acoldp_cfg_';

export type CfgKey = 'provider' | 'base-url' | 'jira-project' | 'worker-url';

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

export function getWorkerUrl(): string {
  return loadCfg('worker-url');
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
