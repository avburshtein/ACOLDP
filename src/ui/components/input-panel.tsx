import { useRef, useState } from 'react';
import { BookOpen, ChevronDown, CloudUpload, Cpu, FileText, Palette, Play, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MAX_INPUT_CHARS,
  MODE_LABELS,
  MODE_ACTION_LABEL,
  MODE_DESCRIPTIONS,
  MODE_MODEL_HINTS,
  TIMEOUT_WARN_CHARS,
} from '@/types';
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
  const [modelOpen, setModelOpen] = useState(false);
  const overLimit = value.length > MAX_INPUT_CHARS;
  const filteredModels = MODEL_SUGGESTIONS.filter((m) =>
    m.toLowerCase().includes(model.trim().toLowerCase()),
  );

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

  const MODE_ICONS: Record<Mode, React.ElementType> = {
    REPORT: FileText,
    LEARNING_DIGEST: BookOpen,
    CASE_DRAFT: Palette,
    JIRA_SYNC: Send,
  };

  const RunIcon = MODE_ICONS[mode];

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
          <Button variant="secondary" size="sm" onClick={onDemo} title="Демо-пример без API-ключа">
            <Play className="h-3.5 w-3.5" /> Демо
          </Button>
          {/* Поле модели: свободный ввод + наш дропдаун подсказок (вместо
              нативного datalist — браузерный шеврон не стилизуется) */}
          <div className="relative">
            <input
              value={model}
              onChange={(e) => {
                onModelChange(e.target.value);
                setModelOpen(true);
              }}
              onFocus={() => setModelOpen(true)}
              onBlur={() => setModelOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setModelOpen(false);
              }}
              placeholder="auto"
              title="Имя модели (auto — авто-выбор)"
              role="combobox"
              aria-expanded={modelOpen}
              className="field-surface h-9 w-28 rounded-md pl-3 pr-8 text-body-md text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:outline-none"
            />
            {/* Тот же шеврон и те же отступы, что у селектора режимов (right-3) */}
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
              aria-hidden
            />
            {modelOpen && filteredModels.length > 0 && (
              <div
                role="listbox"
                // right-0: карточка имеет overflow-hidden, поле у правого края —
                // дропдаун раскрывается влево, чтобы не обрезаться контейнером
                className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] py-1 shadow-md"
              >
                {filteredModels.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={model === m}
                    // preventDefault — чтобы blur не закрыл список раньше клика
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onModelChange(m);
                      setModelOpen(false);
                    }}
                    className="block w-full cursor-pointer px-2.5 py-1.5 text-left text-body-md text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-variant)]"
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
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
          <SelectItem value="REPORT" icon={<FileText className="h-4 w-4" />}>
            {MODE_LABELS.REPORT}
          </SelectItem>
          <SelectItem value="LEARNING_DIGEST" icon={<BookOpen className="h-4 w-4" />}>
            {MODE_LABELS.LEARNING_DIGEST}
          </SelectItem>
          <SelectItem value="CASE_DRAFT" icon={<Palette className="h-4 w-4" />}>
            {MODE_LABELS.CASE_DRAFT}
          </SelectItem>
        </SelectContent>
      </Select>

      <p className="text-label-sm leading-snug text-[var(--md-sys-color-on-surface-variant)]">
        {MODE_DESCRIPTIONS[mode]}
      </p>
      <p className="flex items-start gap-1.5 text-label-sm leading-snug text-[var(--md-sys-color-on-surface-variant)]">
        <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <span className="text-[var(--md-sys-color-on-surface)]">Модель:</span>{' '}
          {MODE_MODEL_HINTS[mode]}
        </span>
      </p>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={modePlaceholder[mode]}
        className="custom-scrollbar field-surface min-h-0 flex-1 resize-none rounded-md p-3.5 font-sans text-body-md leading-relaxed text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:outline-none"
      />

      {/* Drop zone — пунктирный вариант .field-surface (Design-System §3) */}
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        data-dragover={dragOver || undefined}
        tabIndex={0}
        role="button"
        aria-label="Загрузить файлы: перетащите или выберите"
        className="field-surface-dashed flex cursor-pointer items-center justify-center gap-2 rounded-md p-3 text-label-sm text-[var(--md-sys-color-on-surface-variant)] focus-visible:outline-none"
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
      {value.length > TIMEOUT_WARN_CHARS && !overLimit && (
        <p className="px-1 text-xs text-amber-600 dark:text-amber-400">
          ⚠ Больше {TIMEOUT_WARN_CHARS.toLocaleString('ru-RU')} символов — на медленной модели
          возможен таймаут 524. Возьмите flash/mini или разбейте текст.
        </p>
      )}

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
        <Button variant="default" size="sm" onClick={() => onRun(mode)} disabled={busy}>
          <RunIcon className="h-4 w-4" /> {MODE_ACTION_LABEL[mode]}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onRun('JIRA_SYNC')} disabled={busy}>
          <Send className="h-4 w-4" /> В Jira
        </Button>
      </div>
    </section>
  );
}
