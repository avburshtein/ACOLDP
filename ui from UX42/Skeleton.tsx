import React from 'react';
import { cn } from '@/lib/utils';

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-[var(--md-sys-color-surface-variant)]',
                className,
            )}
            {...props}
        />
    );
}

export { Skeleton };
export default Skeleton;
