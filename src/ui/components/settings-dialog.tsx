import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { loadCfg, saveCfg, type CfgKey } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { JiraProject, UserConfig } from '@/types';

const NONE = '__none__';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Полный конфиг, включая креды сессии из памяти */
  getConfig: () => UserConfig;
  showStatus: (text: string) => void;
  onSaved: () => void;
}

const inputCls =
  'bg-[var(--md-sys-color-surface-variant)] border-[var(--md-sys-color-outline-variant)]';

export function SettingsDialog({
  open,
  onOpenChange,
  getConfig,
  showStatus,
  onSaved,
}: SettingsDialogProps) {
  const [baseUrl, setBaseUrl] = useState('');
  const [workerUrl, setWorkerUrl] = useState('');
  const [project, setProject] = useState('');
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Каждый раз при открытии — читаем свежие значения из localStorage
  useEffect(() => {
    if (!open) return;
    setBaseUrl(loadCfg('base-url'));
    setWorkerUrl(loadCfg('worker-url'));
    setProject(loadCfg('jira-project') || NONE);
    setProjects([]);
    setLoadError('');
  }, [open]);

  const loadProjects = async () => {
    const url = workerUrl.trim();
    if (!url) {
      showStatus('Укажите Worker API URL');
      return;
    }
    const cfg = getConfig();
    if (!cfg.jira_domain || !cfg.jira_email || !cfg.jira_token) {
      showStatus('Заполните Jira-креды при входе в сессию');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const data = await api.jiraProjects(url, cfg);
      setProjects(data.projects ?? []);
      showStatus(
        data.projects?.length
          ? `✓ Проектов: ${data.projects.length}`
          : 'Проекты не найдены',
      );
    } catch (err) {
      setProjects([]);
      setLoadError(err instanceof Error ? err.message : String(err));
      showStatus('Ошибка загрузки проектов');
    } finally {
      setLoading(false);
    }
  };

  const save = () => {
    const values: Record<CfgKey, string> = {
      'base-url': baseUrl.trim(),
      'worker-url': workerUrl.trim(),
      'jira-project': project === NONE ? '' : project,
      provider: loadCfg('provider'), // provider меняется только на auth-экране
    };
    (Object.keys(values) as CfgKey[]).forEach((k) => saveCfg(k, values[k]));
    onOpenChange(false);
    showStatus('✓ Настройки сохранены');
    onSaved();
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
          <DialogDescription>
            Провайдер и API-ключ задаются при входе в сессию. Здесь — только
            дополнительные настройки.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-base-url">Base URL (для Custom провайдера)</Label>
            <Input
              id="cfg-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-worker-url">Worker API URL</Label>
            <Input
              id="cfg-worker-url"
              value={workerUrl}
              onChange={(e) => setWorkerUrl(e.target.value)}
              placeholder="https://ai-orchestrator-api.av-burshtein.workers.dev"
              className={inputCls}
            />
            <p className="text-label-sm text-[var(--md-sys-color-on-surface-variant)]">
              Адрес воркера API (*workers.dev), не сайта. Твой:{' '}
              <code className="font-mono">ai-orchestrator-api.av-burshtein.workers.dev</code>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-jira-project">Jira Project</Label>
            <div className="flex gap-2">
              <select
                id="cfg-jira-project"
                value={project || NONE}
                onChange={(e) => setProject(e.target.value)}
                className={`flex h-10 w-full appearance-none rounded-md border px-3 text-button text-[var(--md-sys-color-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] ${inputCls}`}
              >
                <option value={NONE}>— выберите проект —</option>
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} · {p.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Загрузить список проектов из Jira"
                disabled={loading}
                onClick={loadProjects}
                className="shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {loadError && (
              <p className="text-label-sm text-red-400">{loadError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={save}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
