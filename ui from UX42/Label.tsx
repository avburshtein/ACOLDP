import React from 'react';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<
    HTMLLabelElement,
    React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
    <label
        ref={ref}
        className={cn(
            'inline-block',
            'text-label-md text-[var(--md-sys-color-on-surface)] peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-1',
            className,
        )}
        {...props}
    />
));
Label.displayName = 'Label';

export { Label };
export default Label;
