/**
 * Парсер секции `## Completeness` из черновика кейса UX42 (см. HANDOFF 01).
 * Секция остаётся в markdown — здесь только извлекаем числа для UI-баннера.
 */

export interface CaseCompleteness {
  /** Заполнено из ввода (N) */
  filled: number;
  /** Всего текстовых полей (M) */
  total: number;
  /** Строка «Требует данных дизайнера: …» (обрезана ~120 символов) */
  needsDesigner?: string;
}

const FILLED_RE = /Заполнено из ввода:\s*(\d+)\s*\/\s*(\d+)/;
const NEEDS_RE = /Требует данных дизайнера:\s*(.+)/;
const NEEDS_MAX = 120;

/**
 * Возвращает `{ filled, total, needsDesigner? }` или `null`, если секции нет
 * либо числа не распознаны (тогда баннер не показываем — UI не ломаем).
 */
export function parseCaseCompleteness(markdown: string): CaseCompleteness | null {
  if (!markdown.includes('## Completeness')) return null;

  const filledMatch = markdown.match(FILLED_RE);
  if (!filledMatch) return null;

  const filled = Number(filledMatch[1]);
  const total = Number(filledMatch[2]);
  if (!Number.isFinite(filled) || !Number.isFinite(total) || total <= 0) return null;

  let needsDesigner: string | undefined;
  const needsMatch = markdown.match(NEEDS_RE);
  if (needsMatch) {
    const raw = needsMatch[1].trim();
    if (raw && raw !== '❓') {
      needsDesigner =
        raw.length > NEEDS_MAX ? `${raw.slice(0, NEEDS_MAX - 1).trimEnd()}…` : raw;
    }
  }

  return { filled, total, needsDesigner };
}
