import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface StatusState {
  text: string;
  visible: boolean;
}

/** Хук «статус-бейдж»: показывает текст и сам скрывает через ~2.2 сек */
export function useStatus() {
  const [state, setState] = useState<StatusState>({ text: '', visible: false });
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string) => {
    setState({ text, visible: true });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setState((s) => ({ ...s, visible: false })),
      2200,
    );
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message: state.text, visible: state.visible, show };
}

/** Плавающая плашка статуса сверху по центру */
export function StatusBadge({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed left-1/2 top-4 z-[90] -translate-x-1/2',
        'max-w-[90vw] truncate rounded-full border px-4 py-1.5 text-label-sm shadow-lg',
        'border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]',
        'transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {message}
    </div>
  );
}
