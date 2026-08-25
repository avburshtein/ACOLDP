import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export default function PageTitle({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <h1
            className={cn(
                'text-display-sm text-[var(--md-sys-color-on-background)]',
                className,
            )}
        >
            {children}
        </h1>
    );
}
