import React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-label-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)] focus:ring-offset-2',
    {
        variants: {
            variant: {
                default:
                    'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]',
                secondary:
                    'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]',
                destructive:
                    'bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)]',
                outline:
                    'border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)]',
                surface:
                    'bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

export interface BadgeProps
    extends
        React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    );
}

export { Badge, badgeVariants };
export default Badge;
