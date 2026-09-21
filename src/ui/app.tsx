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
import { api, streamReport } from '@/lib/api';
import { deleteArtifact, getArtifact, saveArtifact, updateArtifact } from '@/lib/artifact-store';
import { getWorkerUrl, loadCfg, loadDraft, saveCfg, saveDraft } from '@/lib/storage';
import { sleep } from '@/lib/utils';
import { SAMPLE_RAW_INPUT, SAMPLE_REPORT, SAMPLE_LEARNING_DIGEST, SAMPLE_CASE_DRAFT } from '@/demo-data';
import { MAX_INPUT_CHARS, PROVIDER_NAMES } from '@/types';
import type { Mode, SessionKeys, UserConfig } from '@/types';

export function App() {
  // Ключи сессии живут только в памяти
  const [session, setSession] = useState<SessionKeys | null>(null);
  const [provider, setProvider] = useState(() => loadCfg('provider'));
  // Оверлей входа: показываем при первом заходе, пока пользователь не
  // выбрал гостевой режим (guest-флаг). Worker URL не обязателен заранее —
  // его можно ввести в ⚙️ Settings или после входа с ключом.
  const [authOpen, setAuthOpen] = useState(() => !loadCfg('guest'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState(() => loadDraft());
  const [model, setModel] = useState('');
  // Селектор хранит только режимы создания контента; 'JIRA_SYNC' из старого
  // localStorage откатываем на REPORT (Jira теперь кнопка-действие, не режим)
  const [mode, setMode] = useState<Mode>(() => {
    const saved = loadCfg('mode') as Mode;
    return saved === 'REPORT' || saved === 'LEARNING_DIGEST' || saved === 'CASE_DRAFT'
      ? saved
      : 'REPORT';
  });
  const [lastReport, setLastReport] = useState('');
  const [lastMode, setLastMode] = useState<Mode>('REPORT');
  const [view, setView] = useState<ResultsView>({ kind: 'placeholder' });
  const { message, visible, show } = useStatus();
  const busy = view.kind === 'loading' || view.kind === 'streaming';
  // Стриминг: отмена (Stop) + накопленный частичный текст (сохраняем после Stop)
  const abortRef = useRef<AbortController | null>(null);
  const streamBufRef = useRef('');
  // Идентификатор запуска: гасит колбэки прерванного/устаревшего запроса
  const runIdRef = useRef(0);
  // История артефактов (HANDOFF 04): id артефакта на экране + версия списка для перечитки
  const currentArtifactIdRef = useRef<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

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

  // Секундомер загрузки и стриминга
  useEffect(() => {
    if (view.kind !== 'loading' && view.kind !== 'streaming') return;
    const id = window.setInterval(() => {
      setView((v) =>
        v.kind === 'loading' || v.kind === 'streaming'
          ? { ...v, seconds: v.seconds + 1 }
          : v,
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [view.kind]);

  const sendRequest = async (
    targetMode: Mode,
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
    // Прерываем предыдущий запрос (повторный запуск) и гасим его колбэки
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current += 1;
    const runId = runIdRef.current;
    streamBufRef.current = '';

    setView({ kind: 'loading', seconds: 0 });

    const workerUrl = getWorkerUrl();
    // Гость (нет ключа) или нет воркера — работаем на демо-данных
    if (!workerUrl || !session?.apiKey) {
      await sleep(900);
      if (runId !== runIdRef.current) return;
      let sample = SAMPLE_REPORT;
      let demoMode: Mode = 'REPORT';
      if (targetMode === 'LEARNING_DIGEST') {
        sample = SAMPLE_LEARNING_DIGEST;
        demoMode = 'LEARNING_DIGEST';
      } else if (targetMode === 'CASE_DRAFT') {
        sample = SAMPLE_CASE_DRAFT;
        demoMode = 'CASE_DRAFT';
      } else if (targetMode === 'JIRA_SYNC') {
        setView({
          kind: 'error',
          message:
            'Демо-режим: синхронизация с Jira недоступна. Чтобы включить — укажите Worker API URL и Jira-креды в ⚙️ Settings.',
        });
        return;
      }
      // Демо-артефакт в историю не пишем (HANDOFF 04 §2.3.5)
      currentArtifactIdRef.current = null;
      setLastReport(sample);
      setLastMode(demoMode);
      setView({ kind: 'report', markdown: sample, demo: true, mode: demoMode });
      return;
    }

    const config = buildConfig();
    const modelValue = model.trim();
    const modelParam = modelValue.toUpperCase() === 'AUTO' ? '' : modelValue;

    // ── JIRA_SYNC: без изменений, обычный JSON ──
    if (targetMode === 'JIRA_SYNC') {
      try {
        const data = await api.jiraSync(workerUrl, text, modelParam, config);
        if (runId !== runIdRef.current) return;
        setView({
          kind: 'sync',
          stats: data.stats,
          results: data.results ?? [],
          demo: false,
        });
        show('✓ Синхронизация завершена');
      } catch (err) {
        if (runId !== runIdRef.current) return;
        setView({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    // ── Генеративные режимы: SSE-стриминг + Stop ──
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ kind: 'streaming', markdown: '', mode: targetMode, seconds: 0 });

    try {
      const full = await streamReport(workerUrl, text, targetMode, modelParam, config, {
        signal: controller.signal,
        onDelta: (_delta, fullText) => {
          if (runId !== runIdRef.current) return;
          streamBufRef.current = fullText;
          setView((v) => (v.kind === 'streaming' ? { ...v, markdown: fullText } : v));
        },
      });
      if (runId !== runIdRef.current) return;
      abortRef.current = null;
      setLastReport(full);
      setLastMode(targetMode);
      setView({ kind: 'report', markdown: full, demo: false, mode: targetMode });
      // Автосохранение артефакта в историю (HANDOFF 04 §2.3.5)
      void saveArtifact(targetMode, full).then((saved) => {
        if (runId !== runIdRef.current) return;
        currentArtifactIdRef.current = saved.id;
        setHistoryVersion((v) => v + 1);
      });
      show(
        targetMode === 'REPORT'
          ? '✓ Отчёт готов'
          : targetMode === 'LEARNING_DIGEST'
            ? '✓ Дайджест готов'
            : '✓ Кейс готов',
      );
    } catch (err) {
      if (runId !== runIdRef.current) return;
      abortRef.current = null;
      // Stop: сохраняем частичный результат, если он успел накопиться
      if (err instanceof Error && err.name === 'AbortError') {
        const partial = streamBufRef.current;
        if (partial.trim()) {
          setLastReport(partial);
          setLastMode(targetMode);
          setView({ kind: 'report', markdown: partial, demo: false, mode: targetMode });
          show('⏹ Остановлено — частичный результат сохранён');
        } else {
          setView({ kind: 'placeholder' });
          show('⏹ Остановлено');
        }
        return;
      }
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
    const prefix: Record<Mode, string> = {
      REPORT: 'Report',
      LEARNING_DIGEST: 'Digest',
      CASE_DRAFT: 'Case',
      JIRA_SYNC: 'Report',
    };
    const blob = new Blob([lastReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `ACOLDP_${prefix[lastMode]}_${date}.md`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    show('✓ Файл скачан');
  };

  const handleGoogleDocs = () => {
    if (!lastReport) return;
    // Convert markdown to plain text for Google Docs
    const plainText = lastReport
      .replace(/^---[\s\S]*?---\n?/gm, '') // remove YAML frontmatter
      .replace(/#{1,6}\s+/g, '') // remove heading markers
      .replace(/\*\*|__/g, '') // remove bold/italic
      .replace(/`{1,3}/g, '') // remove code fences
      .replace(/^-\s+/gm, '• ') // convert list bullets
      .replace(/^\[([ x])\]\s+/gm, (_, checked) => (checked === 'x' ? '☑ ' : '☐ '));

    // Браузер не может вставить текст в чужую вкладку (безопасность), поэтому
    // честный флоу: копируем в буфер → открываем новый документ → Ctrl+V.
    // window.open синхронно — иначе popup-blocker может срезать окно.
    window.open('https://docs.google.com/document/create', '_blank', 'noopener');
    navigator.clipboard
      .writeText(plainText)
      .then(() => show('✓ Текст в буфере — в открывшемся Google Docs нажмите Ctrl+V'))
      .catch(() => show('Не удалось скопировать — скопируйте текст кнопкой «Копировать»'));
  };

  const handleDemo = () => {
    setInput(SAMPLE_RAW_INPUT);
    saveDraft(SAMPLE_RAW_INPUT);
    show('✓ Демо-пример загружен');
  };

  const handleStop = () => {
    // Останавливает активную стрим-генерацию; частичный текст сохранит catch в sendRequest
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const handleRefine = async () => {
    if (busy) return;
    const supplement = input.trim();
    if (!supplement) {
      alert('Вставь в левую панель новый материал (куски чатов, заметки), которым хочешь дополнить артефакт');
      return;
    }
    if (!lastReport) return;

    const workerUrl = getWorkerUrl();
    if (!workerUrl || !session?.apiKey) {
      alert('Для «Дополнить» нужен Worker API URL и API-ключ: в демо-режиме артефакт нельзя дополнить.');
      return;
    }

    // Прерываем активный стрим, если он вдруг идёт
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current += 1;
    const runId = runIdRef.current;

    const artifactMode = lastMode;
    const artifactMarkdown = lastReport;

    setView({ kind: 'loading', seconds: 0 });

    try {
      const config = buildConfig();
      const modelValue = model.trim();
      const modelParam = modelValue.toUpperCase() === 'AUTO' ? '' : modelValue;
      const data = await api.refine(
        workerUrl,
        supplement,
        { markdown: artifactMarkdown, mode: artifactMode },
        modelParam,
        config,
      );
      if (runId !== runIdRef.current) return;
      const updated = data.report_markdown;
      setLastReport(updated);
      setLastMode(artifactMode);
      setView({ kind: 'report', markdown: updated, demo: false, mode: artifactMode });

      // Обновляем существующую запись истории; если её нет (или хранилище не отдало) — новая
      if (currentArtifactIdRef.current) {
        const saved = await updateArtifact(currentArtifactIdRef.current, updated);
        if (saved) currentArtifactIdRef.current = saved.id;
      }
      if (!currentArtifactIdRef.current) {
        const created = await saveArtifact(artifactMode, updated);
        currentArtifactIdRef.current = created.id;
      }
      setHistoryVersion((v) => v + 1);
      show('✓ Артефакт дополнен');
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setView({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleOpenArtifact = (id: string) => {
    void (async () => {
      const artifact = await getArtifact(id);
      if (!artifact) {
        show('Не удалось открыть артефакт');
        return;
      }
      // REFINE по открытому артефакту обновит именно эту запись истории
      currentArtifactIdRef.current = artifact.id;
      setLastReport(artifact.markdown);
      setLastMode(artifact.mode);
      setView({ kind: 'report', markdown: artifact.markdown, demo: false, mode: artifact.mode });
    })();
  };

  const handleDeleteArtifact = (id: string) => {
    // Удаление из истории не трогает открытый результат на экране (§3.3)
    void deleteArtifact(id).then(() => setHistoryVersion((v) => v + 1));
  };

  const handleClear = () => {
    if (!input.trim() || !confirm('Очистить входные данные?')) return;
    runIdRef.current += 1; // гасим колбэки активного стрима
    abortRef.current?.abort();
    abortRef.current = null;
    streamBufRef.current = '';
    currentArtifactIdRef.current = null; // историю не трогаем, только отвязываем артефакт
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
    saveCfg('guest', ''); // реальный вход сбрасывает гостевой флаг
    setAuthOpen(false);
    show(
      `✓ Сессия: ${PROVIDER_NAMES[s.provider] || s.provider}. Ключи в памяти браузера.`,
    );
  };

  const handleGuest = () => {
    saveCfg('guest', '1');
    setAuthOpen(false);
    show('✓ Гостевой вход — демо-данные без ключей. Ключи можно добавить через «Демо-режим» → вход.');
  };

  const handleSaveJira = (jira: { jiraDomain: string; jiraEmail: string; jiraToken: string }) => {
    setSession((s) => ({
      apiKey: s?.apiKey ?? '',
      jiraDomain: jira.jiraDomain,
      jiraEmail: jira.jiraEmail,
      jiraToken: jira.jiraToken,
    }));
  };

  const handleLogout = () => {
    setSession(null);
    saveCfg('guest', '');
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
        onGuest={handleGuest}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        getConfig={buildConfig}
        showStatus={show}
        onSaveJira={handleSaveJira}
        onSaved={() => {
          if (getWorkerUrl() && !session) setAuthOpen(true);
        }}
      />

      <header className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3.5">
        <h1 className="text-headline-lg text-[var(--md-sys-color-on-surface)]">
          AI Context Orchestrator
        </h1>
        <div className="flex items-center gap-2">
          {session?.apiKey ? (
            <Badge variant="surface">
              {PROVIDER_NAMES[provider] || provider}
            </Badge>
          ) : (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              title="Гостевой режим. Нажмите, чтобы войти с API-ключом"
              className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] focus-visible:ring-offset-2"
            >
              <Badge variant="outline">Демо-режим</Badge>
            </button>
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
            mode={mode}
            onModeChange={(m) => {
              setMode(m);
              saveCfg('mode', m);
            }}
            onDemo={handleDemo}
            onClear={handleClear}
            onRun={(m) => void sendRequest(m)}
            busy={busy}
          />
        </Card>
        <Card className="h-full min-h-0 overflow-hidden">
          <ResultsPanel
            view={view}
            onConvert={handleConvert}
            onCopy={handleCopy}
            onDownload={handleDownload}
            onGoogleDocs={handleGoogleDocs}
            onStop={handleStop}
            onRefine={() => void handleRefine()}
            onOpenArtifact={handleOpenArtifact}
            onDeleteArtifact={handleDeleteArtifact}
            busy={busy}
            historyVersion={historyVersion}
          />
        </Card>
      </main>
    </div>
  );
}
