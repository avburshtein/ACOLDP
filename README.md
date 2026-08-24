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
        ├── api/         → Модули (Gemini, Jira, Prompts)
        └── ui/          → Cloudflare Pages (UI)
                            orchestrator.yourdomain.com
```

## Деплой

### 1. Worker (API)

```bash
npm install
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
   - Framework: None
   - Build command: *(пусто)*
   - Output directory: `src/ui`
3. Deploy!

**Вариант B — вручную:**
```bash
npm run deploy:pages
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
│   └── index.js          # Cloudflare Worker — точка входа API
├── src/
│   ├── api/
│   │   ├── gemini.js     # LLM вызовы (Google + OpenAI-compatible)
│   │   ├── jira.js       # Jira REST API (fetch, create, update, comment)
│   │   └── prompts.js    # Системные промпты и JSON Schema
│   └── ui/
│       ├── index.html    # Главная страница
│       ├── app.js        # UI логика
│       └── styles.css    # Стили
├── wrangler.toml         # Cloudflare Worker конфиг
├── package.json
└── README.md
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
