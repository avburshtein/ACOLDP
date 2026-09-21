import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, ExternalLink, FileText, History, PencilLine, Sparkles, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { JiraResult, Mode, SyncStats } from '@/types';
import { MODE_LABELS } from '@/types';
import { cn } from '@/lib/utils';
import { parseCaseCompleteness } from '@/lib/parse-case-completeness';
import { listArtifacts, type Artifact } from '@/lib/artifact-store';

export type ResultsView =
  | { kind: 'placeholder' }
  | { kind: 'loading'; seconds: number }
  | { kind: 'streaming'; markdown: string; mode: Mode; seconds: number }
  | { kind: 'report'; markdown: string; demo: boolean; mode: Mode }
  | { kind: 'sync'; stats?: SyncStats; results: JiraResult[]; demo: boolean }
  | { kind: 'error'; message: string };

type ResultTab = 'result' | 'history';

interface ResultsPanelProps {
  view: ResultsView;
  onConvert: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onGoogleDocs: () => void;
  onStop: () => void;
  onRefine: () => void;
  onOpenArtifact: (id: string) => void;
  onDeleteArtifact: (id: string) => void;
  busy: boolean;
  historyVersion: number;
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

/** Заголовок карточки результата зависит от режима генерации */
function resultTitle(mode: Mode): string {
  if (mode === 'REPORT') return '📋 Отчёт';
  if (mode === 'LEARNING_DIGEST') return '📚 Дайджест';
  if (mode === 'CASE_DRAFT') return '🎨 Кейс UX42';
  return MODE_LABELS[mode] ?? mode;
}

/** Эмодзи режима для карточек истории (контент текста карточки, не иконка кнопки) */
const MODE_EMOJI: Record<string, string> = {
  REPORT: '📋',
  LEARNING_DIGEST: '📚',
  CASE_DRAFT: '🎨',
};

/** Дата артефакта: «сегодня 14:32», «вчера», иначе DD.MM.YYYY */
function formatArtifactDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return `сегодня ${hhmm}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'вчера';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Превью артефакта: 1–2 непустые строки после заголовка */
function artifactPreview(markdown: string): string {
  const lines = markdown
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.slice(1, 3).join(' · ');
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
  onGoogleDocs,
  onStop,
  onRefine,
  onOpenArtifact,
  onDeleteArtifact,
  busy,
  historyVersion,
}: ResultsPanelProps) {
  const [tab, setTab] = useState<ResultTab>('result');
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  const reloadHistory = useCallback(() => {
    void listArtifacts().then(setArtifacts);
  }, []);

  // Список перечитывается при открытии вкладки «История» и после каждого сохранения
  useEffect(() => {
    if (tab === 'history') reloadHistory();
  }, [tab, historyVersion, reloadHistory]);

  // Открытие артефакта из истории / завершение генерации → вернуться на «Результат»
  useEffect(() => {
    if (view.kind === 'report') setTab('result');
  }, [view]);

  return (
    <section className="flex h-full flex-col gap-3 p-4">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ResultTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-title-sm font-semibold text-[var(--md-sys-color-on-surface)]">
            2. Результаты
          </h2>
          <TabsList className="h-8">
            <TabsTrigger value="result" className="h-6 px-2.5">
              Результат
            </TabsTrigger>
            <TabsTrigger value="history" className="h-6 px-2.5">
              История
            </TabsTrigger>
          </TabsList>
        </div>
        {view.kind === 'report' && (
          <div className="flex items-center gap-1.5">
            <span className="text-label-sm text-[var(--md-sys-color-on-surface-variant)] mr-1">
              {MODE_LABELS[view.mode]}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefine}
              disabled={view.demo || busy}
              title="Дополнить артефакт материалом из левой панели"
            >
              <PencilLine className="h-3.5 w-3.5 mr-1" /> Дополнить
            </Button>
            {view.mode === 'REPORT' && (
              <Button
                variant="default"
                size="sm"
                onClick={onConvert}
                title="Отправить результат в Jira как входные данные"
              >
                <FileText className="h-3.5 w-3.5 mr-1" /> В тикеты
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onGoogleDocs} title="Открыть в Google Docs">
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onCopy} title="Копировать">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDownload} title="Скачать .md">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        )}
        {view.kind === 'streaming' && (
          <div className="flex items-center gap-1.5">
            <span className="text-label-sm text-[var(--md-sys-color-on-surface-variant)] mr-1">
              {MODE_LABELS[view.mode]}
            </span>
            <span className="text-label-sm text-[var(--md-sys-color-on-surface-variant)]">
              Генерация…
            </span>
            <span className="w-10 text-right font-mono text-label-sm text-[var(--md-sys-color-on-surface)]">
              {formatTime(view.seconds)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={onStop}
              title="Остановить и сохранить часть"
            >
              <Square className="h-3.5 w-3.5 mr-1" /> Stop
            </Button>
          </div>
        )}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        <TabsContent value="result" className="mt-0 h-full">
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
            {view.mode === 'CASE_DRAFT' && (
              <CompletenessBanner markdown={view.markdown} />
            )}
            <div className={cardCls}>
              <p className="mb-2 text-label-md font-semibold tracking-wide">
                {resultTitle(view.mode)}
              </p>
              <pre className="custom-scrollbar max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words font-mono text-body-sm leading-relaxed text-[var(--md-sys-color-on-surface)]">
                {view.markdown}
              </pre>
            </div>
          </div>
        )}

        {view.kind === 'streaming' && (
          <div className="space-y-3">
            {view.mode === 'CASE_DRAFT' && (
              <CompletenessBanner markdown={view.markdown} />
            )}
            <div className={cardCls}>
              <p className="mb-2 text-label-md font-semibold tracking-wide">
                {resultTitle(view.mode)}
              </p>
              <StreamingPre markdown={view.markdown} />
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
        </TabsContent>

        <TabsContent value="history" className="mt-0 h-full">
          {artifacts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[var(--md-sys-color-on-surface-variant)]">
              <History className="h-10 w-10" aria-hidden />
              <p className="text-body-md">
                Пока пусто — сгенерированные отчёты, дайджесты и кейсы появятся здесь
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {artifacts.map((a) => (
                <div key={a.id} className={cn(cardCls, 'flex items-start justify-between gap-3')}>
                  <div className="min-w-0">
                    <p className="truncate text-label-md font-semibold text-[var(--md-sys-color-on-surface)]">
                      {MODE_EMOJI[a.mode] ?? '📄'} {a.title}
                    </p>
                    <p className="mt-0.5 text-label-sm text-[var(--md-sys-color-on-surface-variant)]">
                      {formatArtifactDate(a.updatedAt)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
                      {artifactPreview(a.markdown)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => onOpenArtifact(a.id)}>
                      Открыть
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить артефакт"
                      title="Удалить артефакт"
                      onClick={() => {
                        if (confirm('Удалить артефакт?')) onDeleteArtifact(a.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </div>
      </Tabs>
    </section>
  );
}

/** Live-рендер стрима: тот же pre, но с автопрокруткой вниз по мере генерации (MVP) */
function StreamingPre({ markdown }: { markdown: string }) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [markdown]);

  return (
    <pre
      ref={ref}
      className="custom-scrollbar max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words font-mono text-body-sm leading-relaxed text-[var(--md-sys-color-on-surface)]"
    >
      {markdown || '…'}
    </pre>
  );
}

function CompletenessBanner({ markdown }: { markdown: string }) {
  const info = parseCaseCompleteness(markdown);
  if (!info) return null;
  return (
    <div className={cn(cardCls, 'border-dashed')}>
      <p className="text-label-md font-semibold">
        Заполнено {info.filled}/{info.total} текстовых полей
      </p>
      {info.needsDesigner && (
        <p className="mt-1 text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
          Ещё нужно: {info.needsDesigner}
        </p>
      )}
    </div>
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
