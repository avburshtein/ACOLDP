import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

type TitleTag = 'h1' | 'h2' | 'h3' | 'h4' | 'div';

type TitleVariant =
    | 'display-sm'
    | 'headline-lg'
    | 'headline-md'
    | 'headline-sm'
    | 'title-lg'
    | 'title-md'
    | 'title-sm';

const variantStyles: Record<TitleVariant, string> = {
    'display-sm': 'text-display-sm',
    'headline-lg': 'text-headline-lg',
    'headline-md': 'text-headline-md',
    'headline-sm': 'text-headline-sm',
    'title-lg': 'text-title-lg',
    'title-md': 'text-title-md',
    'title-sm': 'text-title-sm',
};

export default function Title({
    children,
    variant = 'headline-lg',
    tag = 'h2',
    className = '',
}: {
    children: ReactNode;
    variant?: TitleVariant;
    className?: string;
    tag?: TitleTag;
}) {
    const Tag = tag;
    return (
        <Tag
            className={cn(
                'font-medium leading-[1.2] mb-4',
                `${variantStyles[variant]}`,
                className,
            )}
        >
            {children}
        </Tag>
    );
}
