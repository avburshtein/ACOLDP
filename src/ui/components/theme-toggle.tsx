import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className={cn(
                'relative inline-flex h-10 w-10 items-center justify-center rounded-full',
                'border border-[var(--md-sys-color-outline-variant)]',
                'bg-[var(--md-sys-color-surface)]',
                'text-[var(--md-sys-color-on-surface)]',
                'hover:bg-[var(--md-sys-color-surface-variant)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]',
                'focus-visible:ring-offset-2',
                'transition-colors',
                className,
            )}
        >
            {theme === 'dark' ? (
                <Sun className="h-5 w-5" />
            ) : (
                <Moon className="h-5 w-5" />
            )}
        </button>
    );
}
