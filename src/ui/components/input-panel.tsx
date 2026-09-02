import { useRef, useState } from 'react';
import { CloudUpload, FileText, Play, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_INPUT_CHARS } from '@/types';
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
  onDemo: () => void;
  onClear: () => void;
  onReport: () => void;
  onSync: () => void;
  busy: boolean;
}

export function InputPanel({
  value,
  onChange,
  model,
  onModelChange,
  onDemo,
  onClear,
  onReport,
  onSync,
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

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          'Вставьте текст, идеи, ответ AI, экспорт чата...\n\nПоддерживается любой формат:\n— свободные мысли\n— скопированный ответ из Claude/ChatGPT\n— экспорт чата из Kimi/Qwen'
        }
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
        <Button variant="default" size="sm" onClick={onReport} disabled={busy}>
          <FileText className="h-4 w-4" /> Отчёт
        </Button>
        <Button size="sm" onClick={onSync} disabled={busy}>
          <Send className="h-4 w-4" /> В Jira
        </Button>
      </div>
    </section>
  );
}
