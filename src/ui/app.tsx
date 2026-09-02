import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { AuthOverlay } from '@/components/auth-overlay';
import { InputPanel } from '@/components/input-panel';
import { ResultsPanel, type ResultsView } from '@/components/results-panel';
import { SettingsDialog } from '@/components/settings-dialog';
import { StatusBadge, useStatus } from '@/components/status-badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { getWorkerUrl, loadCfg, loadDraft, saveCfg, saveDraft } from '@/lib/storage';
import { sleep } from '@/lib/utils';
import { SAMPLE_RAW_INPUT, SAMPLE_REPORT } from '@/demo-data';
import { MAX_INPUT_CHARS, PROVIDER_NAMES } from '@/types';
import type { SessionKeys, UserConfig } from '@/types';

export function App() {
  // Ключи сессии живут только в памяти
  const [session, setSession] = useState<SessionKeys | null>(null);
  const [provider, setProvider] = useState(() => loadCfg('provider'));
  const [authOpen, setAuthOpen] = useState(() => !!getWorkerUrl());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState(() => loadDraft());
  const [model, setModel] = useState('');
  const [lastReport, setLastReport] = useState('');
  const [view, setView] = useState<ResultsView>({ kind: 'placeholder' });
  const { message, visible, show } = useStatus();
  const busy = view.kind === 'loading';

  const buildConfig = useCallback(
    (): UserConfig => ({
      provider,
      api_key: session?.apiKey ?? '',
      base_url: loadCfg('base-url'),
      jira_domain: session?.jiraDomain ?? '',
      jira_project: loadCfg('jira-project'),
      jira_email: session?.jiraEmail ?? '',
      jira_token: session?.jiraToken ?? '',
    }),
    [provider, session],
  );

  // Автосохранение черновика (debounce 600 мс)
  const firstInput = useRef(true);
  useEffect(() => {
    if (firstInput.current) {
      firstInput.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      saveDraft(input);
      show('✓ Черновик сохранён');
    }, 600);
    return () => window.clearTimeout(id);
  }, [input, show]);

  // Секундомер загрузки
  useEffect(() => {
    if (view.kind !== 'loading') return;
    const id = window.setInterval(() => {
      setView((v) =>
        v.kind === 'loading' ? { ...v, seconds: v.seconds + 1 } : v,
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [view.kind]);

  const sendRequest = async (
    mode: 'REPORT' | 'JIRA_SYNC',
    textOverride?: string,
  ) => {
    const text = (textOverride ?? input).trim();
    if (!text) {
      alert('Введите или вставьте данные для обработки');
      return;
    }
    if (text.length > MAX_INPUT_CHARS) {
      setView({
        kind: 'error',
        message: `Слишком большой объём: ${text.length.toLocaleString('ru-RU')} символов. Лимит — ${MAX_INPUT_CHARS.toLocaleString('ru-RU')}. Сократите текст или разбейте на части.`,
      });
      return;
    }
    setView({ kind: 'loading', seconds: 0 });

    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      if (mode === 'REPORT') {
        await sleep(900);
        setLastReport(SAMPLE_REPORT);
        setView({ kind: 'report', markdown: SAMPLE_REPORT, demo: true });
      } else {
        setView({
          kind: 'error',
          message:
            'Демо-режим: синхронизация с Jira недоступна. Чтобы включить — укажите Worker API URL и Jira-креды в ⚙️ Settings.',
        });
      }
      return;
    }

    try {
      const config = buildConfig();
      const modelValue = model.trim();
      // «auto» в любом регистре → пустая строка: сервер сам выберет модель
      const modelParam = modelValue.toUpperCase() === 'AUTO' ? '' : modelValue;
      if (mode === 'REPORT') {
        const data = await api.report(workerUrl, text, modelParam, config);
        setLastReport(data.report_markdown);
        setView({ kind: 'report', markdown: data.report_markdown, demo: false });
        show('✓ Отчёт готов');
      } else {
        const data = await api.jiraSync(workerUrl, text, modelParam, config);
        setView({
          kind: 'sync',
          stats: data.stats,
          results: data.results ?? [],
          demo: false,
        });
        show('✓ Синхронизация завершена');
      }
    } catch (err) {
      setView({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleConvert = () => {
    if (!lastReport) return;
    setInput(lastReport);
    saveDraft(lastReport);
    void sendRequest('JIRA_SYNC', lastReport);
  };

  const handleCopy = () => {
    if (!lastReport) return;
    navigator.clipboard
      .writeText(lastReport)
      .then(() => show('✓ Скопировано!'))
      .catch(() => show('Не удалось скопировать'));
  };

  const handleDownload = () => {
    if (!lastReport) return;
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([lastReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `ACOLDP_Report_${date}.md`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    show('✓ Файл скачан');
  };

  const handleDemo = () => {
    setInput(SAMPLE_RAW_INPUT);
    saveDraft(SAMPLE_RAW_INPUT);
    show('✓ Демо-пример загружен');
  };

  const handleClear = () => {
    if (!input.trim() || !confirm('Очистить входные данные?')) return;
    setInput('');
    setLastReport('');
    setView({ kind: 'placeholder' });
    saveDraft('');
  };

  const handleAuthSubmit = (s: SessionKeys & { provider: string }) => {
    setSession({
      apiKey: s.apiKey,
      jiraDomain: s.jiraDomain,
      jiraEmail: s.jiraEmail,
      jiraToken: s.jiraToken,
    });
    setProvider(s.provider);
    saveCfg('provider', s.provider);
    setAuthOpen(false);
    show(
      `✓ Сессия: ${PROVIDER_NAMES[s.provider] || s.provider}. Ключи в памяти браузера.`,
    );
  };

  const handleLogout = () => {
    setSession(null);
    setAuthOpen(true);
    show('✓ Сессия завершена. Ключи удалены из памяти.');
  };

  const iconBtnCls =
    'inline-flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] focus-visible:ring-offset-2 transition-all glass glass-shadow';

  return (
    <div className="flex h-screen flex-col">
      <StatusBadge message={message} visible={visible} />
      <AuthOverlay
        open={authOpen}
        defaultProvider={provider}
        onSubmit={handleAuthSubmit}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        getConfig={buildConfig}
        showStatus={show}
        onSaved={() => {
          if (getWorkerUrl() && !session) setAuthOpen(true);
        }}
      />

      <header className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3.5">
        <h1 className="text-headline-lg text-[var(--md-sys-color-on-surface)]">
          AI Context Orchestrator
        </h1>
        <div className="flex items-center gap-2">
          {session ? (
            <Badge variant="surface">
              {PROVIDER_NAMES[provider] || provider}
            </Badge>
          ) : (
            <Badge variant="outline">Демо-режим</Badge>
          )}
          <ThemeToggle />
          <button
            type="button"
            aria-label="Настройки"
            title="Настройки"
            className={iconBtnCls}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-5 w-5" />
          </button>
          {session && (
            <button
              type="button"
              aria-label="Завершить сессию"
              title="Завершить сессию"
              className={iconBtnCls}
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <Card className="h-full min-h-0 overflow-hidden">
          <InputPanel
            value={input}
            onChange={setInput}
            model={model}
            onModelChange={setModel}
            onDemo={handleDemo}
            onClear={handleClear}
            onReport={() => void sendRequest('REPORT')}
            onSync={() => void sendRequest('JIRA_SYNC')}
            busy={busy}
          />
        </Card>
        <Card className="h-full min-h-0 overflow-hidden">
          <ResultsPanel
            view={view}
            onConvert={handleConvert}
            onCopy={handleCopy}
            onDownload={handleDownload}
          />
        </Card>
      </main>
    </div>
  );
}
