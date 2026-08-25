import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app';
import { ThemeProvider } from '@/hooks/use-theme';
import '@/styles/base.css';
import '@/styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ThemeProvider>
            <App />
        </ThemeProvider>
    </React.StrictMode>,
);
