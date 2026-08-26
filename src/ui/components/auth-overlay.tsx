import { useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Provider, SessionKeys } from '@/types';
import { PROVIDER_NAMES } from '@/types';

interface AuthOverlayProps {
  open: boolean;
  defaultProvider: string;
  onSubmit: (session: SessionKeys & { provider: string }) => void;
}

const inputCls =
  'bg-[var(--md-sys-color-surface-variant)] border-[var(--md-sys-color-outline-variant)]';

/**
 * Полноэкранный оверлей входа в сессию.
 * Ключи живут только в памяти браузера и очищаются при logout/перезагрузке.
 */
export function AuthOverlay({ open, defaultProvider, onSubmit }: AuthOverlayProps) {
  const [provider, setProvider] = useState<Provider>(
    (defaultProvider as Provider) || 'google',
  );
  const [apiKey, setApiKey] = useState('');
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Введите LLM API Key');
      return;
    }
    setError('');
    onSubmit({
      provider,
      apiKey: apiKey.trim(),
      jiraDomain: domain.trim(),
      jiraEmail: email.trim(),
      jiraToken: token.trim(),
    });
    //Sensitive fields — clear from DOM immediately
    setApiKey('');
    setToken('');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-8 shadow-2xl"
      >
        <div className="text-center">
          <h2 className="text-title-lg font-bold text-[var(--md-sys-color-on-surface)]">
            ACOLDP Orchestrator
          </h2>
          <p className="mt-1 text-body-sm text-[var(--md-sys-color-on-surface-variant)]">
            Подключите свои API-ключи
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-variant)] p-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--md-sys-color-on-surface)]"
            aria-hidden="true"
          />
          <span>
            Ключи хранятся <strong>только в памяти браузера</strong> и исчезнут
            при закрытии вкладки. Ответственность за сохранность ключей лежит на вас.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">LLM Provider</Label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className={`flex h-10 w-full appearance-none rounded-md border px-3 text-button text-[var(--md-sys-color-on-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] ${inputCls}`}
            >
              {Object.entries(PROVIDER_NAMES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">LLM API Key</Label>
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza... или sk-..."
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Jira Domain</Label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            autoComplete="off"
            placeholder="your-domain.atlassian.net"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Jira Email</Label>
            <Input
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@gmail.com"
              className={inputCls}
            />
          </div>
          <div>
            <Label className="text-xs">Jira Token</Label>
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ATATT..."
              className={inputCls}
            />
          </div>
        </div>

        {error && (
          <p className="text-label-md text-red-400" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full">
          Войти
        </Button>
      </form>
    </div>
  );
}
