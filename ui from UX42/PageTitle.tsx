import { type ReactNode } from 'react';

export default function PageTitle({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <h1 className={`text-display-sm text-on-background ${className}`}>
            {children}
        </h1>
    );
}
