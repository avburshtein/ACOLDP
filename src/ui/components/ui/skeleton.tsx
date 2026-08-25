import React from 'react';
import { cn } from '@/lib/utils';

const Skeleton = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            'animate-pulse rounded-md bg-[var(--md-sys-color-surface-variant)]',
            className,
        )}
        {...props}
    />
));
Skeleton.displayName = 'Skeleton';

export { Skeleton };
export default Skeleton;
