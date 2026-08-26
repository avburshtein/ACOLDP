import { Copy, Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { JiraResult, SyncStats } from '@/types';
import { cn } from '@/lib/utils';

export type ResultsView =
  | { kind: 'placeholder' }
  | { kind: 'loading'; seconds: number }
  | { kind: 'report'; markdown: string; demo: boolean }
  | { kind: 'sync'; stats?: SyncStats; results: JiraResult[]; demo: boolean }
  | { kind: 'error'; message: string };

interface ResultsPanelProps {
  view: ResultsView;
  onConvert: () => void;
  onCopy: () => void;
  onDownload: () => void;
}

function loadingHint(s: number): string {
  if (s < 10) return 'Анализирую контекст...';
  if (s < 25) return 'LLM обрабатывает...';
  if (s < 45) return 'Большой текст, подожди...';
  return 'Финализирую результат...';
}

function formatTime(totalSec: number): string {
  const mm = Math.floor(totalSec / 60);
  const ss = String(totalSec % 60).padStart(2, '0');
  return mm > 0 ? `${mm}:${ss}` : `${totalSec}с`;
}

const cardCls =
  'rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-4';

const linkCls =
  'shrink-0 text-label-md underline underline-offset-4 text-[var(--md-sys-color-primary)] hover:opacity-80';

export function ResultsPanel({
  view,
  onConvert,
  onCopy,
  onDownload,
}: ResultsPanelProps) {
  return (
    <section className="flex h-full flex-col gap-3 p-4">
      <div className="flex min-h-8 items-center justify-between">
        <h2 className="text-title-sm font-semibold text-[var(--md-sys-color-on-surface)]">
          2. Результаты
        </h2>
        {view.kind === 'report' && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="default"
              size="sm"
              onClick={onConvert}
              title="Отправить отчёт в Jira как входные данные"
            >
              В тикеты
            </Button>
            <Button variant="ghost" size="icon" onClick={onCopy} title="Копировать">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDownload} title="Скачать .md">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        {view.kind === 'placeholder' && (
          <div className="flex h-full select-none flex-col items-center justify-center gap-3 text-[var(--md-sys-color-on-surface-variant)]">
            <Sparkles className="h-10 w-10" />
            <p className="text-body-md">Результаты появятся здесь</p>
          </div>
        )}

        {view.kind === 'loading' && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-[var(--md-sys-color-on-surface-variant)]">
            <div
              className="h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--md-sys-color-outline-variant)] border-t-[var(--md-sys-color-on-surface)]"
              role="progressbar"
              aria-label="Загрузка"
            />
            <div className="font-mono text-2xl font-bold text-[var(--md-sys-color-on-surface)]">
              {formatTime(view.seconds)}
            </div>
            <p className="max-w-[220px] text-center text-body-sm">
              {loadingHint(view.seconds)}
            </p>
          </div>
        )}

        {view.kind === 'error' && (
          <div className={cn(cardCls, 'border-red-400/40')}>
            <p className="mb-1 text-label-md font-semibold text-red-400">❌ Ошибка</p>
            <p className="whitespace-pre-wrap break-words text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
              {view.message}
            </p>
          </div>
        )}

        {view.kind === 'report' && (
          <div className="space-y-3">
            <DemoBanner demo={view.demo} />
            <div className={cardCls}>
              <p className="mb-2 text-label-md font-semibold tracking-wide">
                📋 DAILY REPORT
              </p>
              <pre className="custom-scrollbar max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words font-mono text-body-sm leading-relaxed text-[var(--md-sys-color-on-surface)]">
                {view.markdown}
              </pre>
            </div>
          </div>
        )}

        {view.kind === 'sync' && (
          <div className="space-y-3">
            <DemoBanner demo={view.demo} />
            {view.stats && <StatsBar stats={view.stats} />}
            {view.results.map((r, i) => (
              <ResultCard key={i} result={r} />
            ))}
            {!view.results.length && (
              <p className="py-8 text-center text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
                Изменений не требуется
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DemoBanner({ demo }: { demo: boolean }) {
  if (!demo) return null;
  return (
    <div className={cn(cardCls, 'border-dashed')}>
      <p className="text-label-md font-semibold">ℹ️ Демо-режим</p>
      <p className="mt-1 text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
        Показан предзаготовленный результат. Для реальной генерации укажите Worker
        API URL и ключи в ⚙️ Settings.
      </p>
    </div>
  );
}

const STAT_ITEMS: Array<{ key: keyof SyncStats; label: string }> = [
  { key: 'created', label: 'Создано' },
  { key: 'updated', label: 'Обновлено' },
  { key: 'commented', label: 'Коммент.' },
  { key: 'errors', label: 'Ошибок' },
];

function StatsBar({ stats }: { stats: SyncStats }) {
  return (
    <div className="grid grid-cols-4 gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-variant)] p-3">
      {STAT_ITEMS.map(({ key, label }) => (
        <div key={key} className="text-center">
          <div className="text-xl font-bold">{stats[key]}</div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultCard({ result: r }: { result: JiraResult }) {
  if (r.status === 'error') {
    return (
      <div className={cn(cardCls, 'border-red-400/40')}>
        <p className="text-label-md font-semibold text-red-400">❌ Ошибка</p>
        <p className="mt-1 break-all font-mono text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
          {typeof r.error === 'string' ? r.error : JSON.stringify(r.error)}
        </p>
      </div>
    );
  }

  const icons = { created: '🆕', updated: '⬆️', commented: '💬' } as const;
  const titles: Record<string, string> = {
    created: `${r.jira_key} · ${r.issue_type ?? 'Task'}${r.priority ? ` · ${r.priority}` : ''}`,
    updated: `${r.jira_key} · Приоритет повышен`,
    commented: `${r.jira_key} · Добавлен комментарий`,
  };

  return (
    <div className={cn(cardCls, 'flex items-start justify-between gap-3')}>
      <div className="min-w-0">
        <p className="text-label-md font-semibold">
          {icons[r.status]} {titles[r.status]}
        </p>
        {r.status === 'created' && r.summary && (
          <p className="mt-1 truncate text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
            {r.summary}
          </p>
        )}
        {r.status === 'updated' && (
          <p className="mt-1 text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
            {r.old_priority || '—'} →{' '}
            <strong className="text-[var(--md-sys-color-on-surface)]">
              {r.new_priority}
            </strong>
          </p>
        )}
        {r.status === 'commented' && r.comment_summary && (
          <p className="mt-1 truncate text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
            {r.comment_summary}
          </p>
        )}
      </div>
      {r.jira_url && (
        <a href={r.jira_url} target="_blank" rel="noreferrer" className={linkCls}>
          Открыть →
        </a>
      )}
    </div>
  );
}
