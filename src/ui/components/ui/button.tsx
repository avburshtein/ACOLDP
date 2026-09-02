import React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const glassCls = 'glass glass-shadow';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 rounded-full text-button font-medium transition-all focus-visible:outline-none disabled:pointer-events-none cursor-pointer',
    {
        variants: {
            variant: {
                default: `${glassCls} glass-accent`,
                destructive: `${glassCls}`,
                outline: `${glassCls}`,
                secondary: `${glassCls}`,
                ghost: `${glassCls} glass-ghost`,
                link: 'bg-transparent text-[var(--md-sys-color-primary)] underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-10 px-5',
                sm: 'h-9 px-4',
                lg: 'h-11 px-7',
                icon: 'h-10 w-10 rounded-full',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

export interface ButtonProps
    extends
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
export default Button;
