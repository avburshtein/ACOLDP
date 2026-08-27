import { type ReactNode } from 'react';

export default function FormBox({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <main className={`max-w-container-form ${className}`}>{children}</main>
    );
}
