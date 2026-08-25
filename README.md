# AI Context Orchestrator · ACOLDP

Интеллектуальный оркестратор контекста: хаос из чатов и мыслей → структурированные задачи в Jira.

## Архитектура

```
GitHub Repo
    │
    ├── worker/          → Cloudflare Worker (API)
    │   └── index.js        api.yourdomain.com
    │
    └── src/
        ├── api/         → Модули (Gemini, Jira, Prompts) — plain JS, без сборки
        └── ui/          → React + TypeScript + Vite + Tailwind CSS v4
            ├── main.tsx            Точка входа React
            ├── app.tsx            Корневой компонент приложения
            ├── components/        Компоненты (включая UI-примитивы из UX42)
            │   ├── ui/            Библиотека примитивов (Button, Card, Dialog…)
            │   └── theme-toggle.tsx  Переключатель light/dark темы
            ├── hooks/             use-theme.tsx — контекст темы
            ├── lib/utils.ts       cn() для merge классов
            └── styles/
                ├── base.css       Tailwind v4 (@theme), типографика MD3
                └── theme.css      Ч/б палитра: light и dark через data-theme
```

## Дизайн-система

**Чёрно-белая палитра с переключаемыми темами** — акцент на контенте:

- **Light**: чисто белый фон (`#fff`) + чёрные акценты (`#000`)
- **Dark**: чисто чёрный фон (`#000`) + белые акценты (`#fff`)

Токены Material Design 3 (`--md-sys-color-*`) маппятся на ч/б значения в `src/ui/styles/theme.css`.
Переключение — атрибут `data-theme="dark|light"` на `<html>`, выбор сохраняется в localStorage.

**UI-компоненты** (из UX42, адаптированы): Avatar, Badge, Button, Card, Checkbox,
Dialog, DropdownMenu, FormBox, Input, Label, PageTitle, Select, Skeleton, Switch,
Tabs, Textarea, Title, Toast.

Импорт: `import { Button, Card, Dialog } from '@/components/ui';`

## Разработка

```bash
npm install
npm run dev          # Vite dev-сервер → http://localhost:5173
npm run build        # Прод-сборка в dist/ui
npm run typecheck    # Проверка типов TypeScript
```

## Деплой

### 1. Worker (API)

```bash
npm run deploy:worker
```

Добавь секреты в Cloudflare Dashboard → Workers → ai-orchestrator-api → Settings → Variables:

| Переменная     | Значение                  | Тип    |
|----------------|---------------------------|--------|
| SECRET_KEY     | твой пароль               | Secret |
| GEMINI_API_KEY | ключ из AI Studio         | Secret |
| JIRA_TOKEN     | Atlassian API Token       | Secret |

### 2. UI (Cloudflare Pages)

**Вариант A — через GitHub (рекомендуется):**
1. Cloudflare Dashboard → Pages → Create project → Connect to Git
2. Выбери репозиторий → Build settings:
   - Framework: None (или Vite)
   - Build command: `npm run build`
   - Output directory: `dist/ui`
3. Deploy!

**Вариант B — вручную:**
```bash
npm run deploy:pages   # = npm run build + wrangler pages deploy dist/ui
```

### 3. Привязать домен

Cloudflare Dashboard → Pages → твой проект → Custom domains → Add domain:
- `orchestrator.yourdomain.com`

Worker URL (для поля Settings в UI):
- `https://ai-orchestrator-api.YOUR_SUBDOMAIN.workers.dev`
- или `https://api.yourdomain.com` (если настроил custom domain)

### 4. Настроить UI

1. Открой `orchestrator.yourdomain.com`
2. Нажми ⚙️ Settings
3. Заполни Worker URL, Jira данные (или оставь пустыми — возьмёт из Worker ENV)

## Структура файлов

```
ai-orchestrator/
├── worker/
│   └── index.js              # Cloudflare Worker — точка входа API
├── src/
│   ├── api/                  # Plain JS, используются Worker'ом напрямую
│   │   ├── gemini.js         # LLM вызовы (Google + OpenAI-compatible)
│   │   ├── jira.js           # Jira REST API (fetch, create, update, comment)
│   │   └── prompts.js        # Системные промпты и JSON Schema
│   └── ui/                   # React SPA (Vite root)
│       ├── index.html        # HTML-шаблон с <div id="root">
│       ├── main.tsx          # React entry: ThemeProvider + App
│       ├── app.tsx           # Оркестратор: сессия, запросы к Worker, состояние
│       ├── types.ts          # Общие типы (UserConfig, JiraResult…) и константы
│       ├── demo-data.ts      # Демо-пример для режима без Worker
│       ├── components/
│       │   ├── auth-overlay.tsx    # Вход в сессию (ключи только в памяти)
│       │   ├── settings-dialog.tsx # Настройки + загрузка Jira-проектов
│       │   ├── input-panel.tsx     # Панель ввода: textarea, drop-zone, счётчик
│       │   ├── results-panel.tsx   # Отчёт / результаты Jira / loading / ошибки
│       │   ├── status-badge.tsx    # Статус-плашка с авто-скрытием
│       │   ├── theme-toggle.tsx    # Кнопка light/dark
│       │   └── ui/                 # UI-библиотека примитивов (из UX42)
│       ├── hooks/use-theme.tsx     # Контекст темы + localStorage
│       ├── lib/
│       │   ├── api.ts        # POST к Worker: REPORT / JIRA_SYNC / JIRA_PROJECTS
│       │   ├── storage.ts    # acoldp_cfg_* и черновик в localStorage
│       │   └── utils.ts      # cn() = clsx + tailwind-merge
│       └── styles/
│           ├── base.css      # Tailwind v4 @theme, типографика MD3
│           └── theme.css     # Ч/б палитра light/dark
├── dist/ui/                  # Прод-сборка (деплоится на Pages)
├── wrangler.toml             # Cloudflare Worker конфиг
├── vite.config.ts            # Vite: root=src/ui, alias @ → src/ui
├── tailwind.config.cjs       # Content paths (тема — в CSS через @theme)
├── postcss.config.cjs        # @tailwindcss/postcss
├── tsconfig.json
└── package.json
```

## Использование

1. Вставь текст в левую панель (идеи, ответ AI, экспорт чата)
2. Выбери режим:
   - **Отчёт** — сформировать структурированный дневной дайджест
   - **В Jira** — проанализировать и создать/обновить тикеты
3. Результаты появятся в правой панели
4. Нажми **⚡ В тикеты** прямо из отчёта для повторной обработки

## Модели

По умолчанию: авто-выбор с fallback цепочкой:
`gemini-2.5-flash → gemini-2.5-flash-lite → gemini-2.0-flash → gemini-2.0-flash-lite`

Можно выбрать конкретную модель или добавить Qwen/GPT через Settings.
