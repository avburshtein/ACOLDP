import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export default function FormBox({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <main className={cn('max-w-container-form mx-auto', className)}>
            {children}
        </main>
    );
}
