import { useRef, useState } from 'react';
import { BookOpen, CloudUpload, FileText, Palette, Play, Send, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MAX_INPUT_CHARS, MODE_LABELS, MODE_ACTION_LABEL, MODE_DESCRIPTIONS } from '@/types';
import type { Mode } from '@/types';
import { cn } from '@/lib/utils';

const MODEL_SUGGESTIONS = [
  'gemini-2.0-flash',
  'qwen-max',
  'qwen-flash',
  'gpt-4o-mini',
];

interface InputPanelProps {
  value: string;
  onChange: (value: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onDemo: () => void;
  onClear: () => void;
  onRun: (mode: Mode) => void;
  busy: boolean;
}

export function InputPanel({
  value,
  onChange,
  model,
  onModelChange,
  mode,
  onModeChange,
  onDemo,
  onClear,
  onRun,
  busy,
}: InputPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const overLimit = value.length > MAX_INPUT_CHARS;

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const parts: string[] = [];
    for (const file of Array.from(files)) {
      try {
        parts.push(`\n\n--- [Файл: ${file.name}] ---\n${await file.text()}\n---`);
      } catch {
        alert(`Не удалось прочитать файл: ${file.name}`);
      }
    }
    onChange(value + parts.join(''));
  };

  const isReportLike = mode === 'REPORT' || mode === 'LEARNING_DIGEST' || mode === 'CASE_DRAFT';

  const MODE_ICONS: Record<Mode, React.ElementType> = {
    REPORT: FileText,
    LEARNING_DIGEST: BookOpen,
    CASE_DRAFT: Palette,
    JIRA_SYNC: Send,
  };

  const modePlaceholder: Record<Mode, string> = {
    REPORT:
      'Вставьте текст, идеи, ответ AI, экспорт чата...\n\nПоддерживается любой формат:\n— свободные мысли\n— скопированный ответ из Claude/ChatGPT\n— экспорт чата из Kimi/Qwen',
    LEARNING_DIGEST:
      'Вставьте заметки, конспект, выдержки из книги, статьи или курса...\n\nЧто подходит:\n— заметки из книги\n— выдержки из статьи\n— конспект лекции\n— экспорт highlights',
    CASE_DRAFT:
      'Вставьте материалы проекта: логи обсуждений, заметки, скриншоты (опишите текстом), метрики...\n\nЧто подходит:\n— чат команды\n— заметки исследования\n— описание итераций\n— метрики до/после',
    JIRA_SYNC:
      'Вставьте отчёт или список задач для синхронизации с Jira...',
  };

  return (
    <section className="flex h-full flex-col gap-3 p-4">
      <div className="flex min-h-8 items-center justify-between">
        <h2 className="text-title-sm font-semibold text-[var(--md-sys-color-on-surface)]">
          1. Входные данные
        </h2>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onDemo} title="Демо-пример без API-ключа">
            <Play className="h-3.5 w-3.5" /> Демо
          </Button>
          <input
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            list="model-suggestions"
            placeholder="auto"
            title="Имя модели (auto — авто-выбор)"
            className={cn(
              'h-8 w-28 rounded-md border bg-[var(--md-sys-color-surface-variant)] px-2 text-button text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)]',
              'border-[var(--md-sys-color-outline-variant)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--md-sys-color-primary)]',
            )}
          />
          <datalist id="model-suggestions">
            {MODEL_SUGGESTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Mode selector */}
      <Select value={mode} onValueChange={(v) => onModeChange(v as Mode)}>
        <SelectTrigger className="h-9 w-full">
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = MODE_ICONS[mode];
              return <Icon className="h-4 w-4" />;
            })()}
            <SelectValue placeholder="Выберите режим" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="REPORT">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>{MODE_LABELS.REPORT}</span>
            </div>
          </SelectItem>
          <SelectItem value="LEARNING_DIGEST">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span>{MODE_LABELS.LEARNING_DIGEST}</span>
            </div>
          </SelectItem>
          <SelectItem value="CASE_DRAFT">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <span>{MODE_LABELS.CASE_DRAFT}</span>
            </div>
          </SelectItem>
          <SelectItem value="JIRA_SYNC">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              <span>{MODE_LABELS.JIRA_SYNC}</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <p className="text-label-sm leading-snug text-[var(--md-sys-color-on-surface-variant)]">
        {MODE_DESCRIPTIONS[mode]}
      </p>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={modePlaceholder[mode]}
        className="custom-scrollbar min-h-0 flex-1 resize-none rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-variant)] p-3.5 font-sans text-body-md leading-relaxed text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]"
      />

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-3 text-label-sm transition-colors',
          dragOver
            ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-variant)]'
            : 'border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-variant)]',
        )}
      >
        <CloudUpload className="h-4 w-4" />
        <span>
          Перетащите файл или{' '}
          <span className="underline">выберите</span>
        </span>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          accept=".txt,.md,.json,.js,.py,.csv"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Char counter */}
      <div
        className={cn(
          'flex justify-between px-1 text-xs',
          overLimit
            ? 'text-red-400'
            : 'text-[var(--md-sys-color-on-surface-variant)]',
        )}
      >
        <span>{value.length.toLocaleString('ru-RU')} символов</span>
        <span>лимит: {MAX_INPUT_CHARS.toLocaleString('ru-RU')}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          data-destructive
          onClick={onClear}
          disabled={!value || busy}
        >
          <Trash2 className="h-4 w-4" /> Очистить
        </Button>
        <div className="flex-1" />
        {isReportLike ? (
          <Button variant="default" size="sm" onClick={() => onRun(mode)} disabled={busy}>
            <Sparkles className="h-4 w-4" /> {MODE_ACTION_LABEL[mode]}
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={() => onRun('REPORT')} disabled={busy}>
            <FileText className="h-4 w-4" /> Отчёт
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => onRun('JIRA_SYNC')} disabled={busy}>
          <Send className="h-4 w-4" /> В Jira
        </Button>
      </div>
    </section>
  );
}
