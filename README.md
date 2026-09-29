# AI Context Orchestrator · ACOLDP

**Русский** · [English](README.en.md)

> Хаос из чатов, заметок и выгрузок LLM → структурированные артефакты:
> **Отчёт** · **Дайджест** · **Кейс UX42**. Jira-синк — внутренний инструмент,
> а не отдельный продукт.

Веб-приложение, где вы вставляете сырой материал (дамп переписки, дневник,
конспект, экспорт чата) — а на выходе получаете готовый Markdown-артефакт,
который не нужно переписывать руками. Ключи от LLM и Jira вводит сам
пользователь: воркер — прозрачный прокси, серверных секречей не требует.

---

## Что умеет сейчас

| Возможность | Детали |
|---|---|
| **3 режима генерации** | `Отчёт` (дневной/этапный отчёт по дневникам и чатам), `Дайджест` (конспекты, книги, курсы → структурированный дайджест), `Кейс UX42` (материалы проекта → черновик кейса из 8 секций Case Study Builder) |
| **SSE-стриминг** | Текст появляется по мере генерации (первый байт уходит сразу → нет `524` от Cloudflare на длинных входах) |
| **Кнопка Stop** | Прерывает генерацию, частичный результат сохраняется как артефакт |
| **История артефактов** | Все генерации сохраняются локально в IndexedDB: дата, режим, заголовок, превью → открыть, удалить |
| **«Дополнить» (REFINE)** | Добавить новый кусок материала к готовому артефакту — обновление без перегенерации с нуля |
| **Jira-синк** | Разбор задач + дедупликация по открытым тикетам → `CREATE` / `UPDATE_PRIORITY` / `ADD_COMMENT` |
| **Экспорт** | Скачать `.md`, копировать, «Google Docs» (копирует текст + открывает новый документ) |
| **Демо-режим** | Полный интерфейс и предзаготовленные результаты без единого ключа |
| **Ч/б темы** | Светлая и тёмная, переключатель в шапке, выбор сохраняется |

**Лимиты:** вход до 100 000 символов (≈25k токенов) — предохранитель от
случайного гигантского ввода; при входе >30 000 символов UI предупреждает, что
генерация займёт больше времени (стриминг снимает риск таймаута).

---

## Стек

- **Cloudflare Worker** — API-прокси (ES modules, `nodejs_compat`). Ключи
  пользователя приходят в теле каждого запроса; воркер их не хранит.
- **React 19 + TypeScript + Vite 8 + Tailwind CSS v4** — SPA, MD3-токены
  (`--md-sys-color-*`), типографика Inter + JetBrains Mono.
- **Radix UI** — подложка примитивов; **lucide-react** — иконки;
  `clsx` + `tailwind-merge` + `class-variance-authority` — утилиты.
- Проверено на Node 24 (Vite 8 требует Node 20.19+ / 22.12+).

---

## Архитектура

```
GitHub Repo
├── worker/
│   └── index.js              Cloudflare Worker: роутинг режимов, валидация,
│                             JSON-ответы, SSE-хелпер для стриминга
├── src/
│   ├── api/                  Plain JS — импортируется воркером напрямую
│   │   ├── gemini.js         LLM: Google Gemini (native) + OpenAI-compatible,
│   │   │                     авто-выбор моделей, ретраи, SSE-стриминг
│   │   ├── jira.js           Atlassian REST: список проектов, открытые тикеты,
│   │   │                     create / update / comment (с троттлингом)
│   │   └── prompts.js        Системные промпты: REPORT, LEARNING_DIGEST,
│   │                         CASE_DRAFT, REFINE, DEDUP + JSON Schema
│   ├── relay/
│   │   └── jira-relay.ts     Edge-relay для Jira (Next.js), см. «Известные моменты»
│   └── ui/                   React SPA (root сборки Vite)
│       ├── index.html        HTML-шаблон
│       ├── main.tsx          React entry: ThemeProvider + App
│       ├── app.tsx           Корень: сессия, режимы, стриминг, история, REFINE
│       ├── types.ts          Общие типы, лейблы режимов, лимиты
│       ├── demo-data.ts      Демо-вход + три согласованных демо-артефакта
│       ├── components/
│       │   ├── auth-overlay.tsx      Вход в сессию (ключи только в памяти)
│       │   ├── input-panel.tsx       Ввод: режим, модель, textarea, drop-zone
│       │   ├── results-panel.tsx     Результат / История / Jira / Stop
│       │   ├── settings-dialog.tsx   Base URL, Worker URL, Jira-креды
│       │   ├── status-badge.tsx      Плавающая плашка статуса + useStatus()
│       │   ├── theme-toggle.tsx      Переключатель light/dark
│       │   └── ui/                   Примитивы (@/components/ui) — адаптация UX42
│       ├── hooks/use-theme.tsx       Контекст темы + localStorage
│       ├── lib/
│       │   ├── api.ts                POST к воркеру + SSE-клиент streamReport
│       │   ├── artifact-store.ts     IndexedDB-хранилище артефактов
│       │   ├── parse-case-completeness.ts  Парсер секции Completeness кейса
│       │   ├── storage.ts            localStorage: настройки + черновик ввода
│       │   └── utils.ts              cn() = clsx + tailwind-merge
│       └── styles/
│           ├── base.css       Tailwind v4 @theme, типографика MD3, glass, .field-surface
│           └── theme.css      Ч/б токены light/dark через data-theme
├── ui from UX42/              Исходники примитивов UX42 (адаптированы в src/ui/components/ui)
├── Docs/                      Спецификация, дизайн-система, handoff-пакеты, роадмап
├── dist/ui/                   Прод-сборка SPA (в .gitignore)
├── wrangler.toml              Конфиг воркера (name: ai-orchestrator-api)
├── vite.config.ts             root = src/ui, alias @ → src/ui, outDir = dist/ui
└── package.json
```

## Быстрый старт

```bash
npm install
npm run dev          # Vite dev-сервер → http://localhost:5173 (откроется сам)
```

Дальше — два пути:

- **Посмотреть интерфейс.** На экране входа нажмите **«Гостевой вход — демо без ключей»**.
  Работают все три режима на предзаготовленных данных: реальные LLM-запросы не уходят.
- **Работать по-настоящему.** Нужен задеплоенный воркер (раздел «Деплой») и свой API-ключ.

### Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | Dev-сервер Vite (SPA) на `http://localhost:5173` |
| `npm run dev:ui` | То же самое, явный алиас |
| `npm run dev:worker` | Локальный воркер через Wrangler (`worker/index.js`) |
| `npm run build` | Прод-сборка SPA → `dist/ui` |
| `npm run typecheck` | Проверка типов (`tsc --noEmit`) — гонять перед коммитом UI |
| `npm run deploy:worker` | `wrangler deploy worker/index.js` |
| `npm run deploy:pages` | Сборка + `wrangler pages deploy dist/ui --project-name=ai-orchestrator-ui` |

Тестового фреймворка и линтера в проекте нет — quality gate это
`npm run typecheck` + ручной прогон по чеклисту `Docs/UI-Rules.md` §13.

---

## Настройка приложения

Всё настраивается из UI, файл конфига не нужен.

**Экран входа (`auth-overlay.tsx`)** — при первом визите:
- **LLM Provider**: `Gemini` (native API) · `Alibaba (Qwen)` · `OpenAI` (все OpenAI-compatible);
- **LLM API Key** — уходит в воркер в теле запроса.

> ⚠️ Ключи живут **только в памяти вкладки**. Они не пишутся в localStorage и
> исчезают при перезагрузке страницы или выходе из сессии (кнопка «Завершить
> сессию» в шапке). Это осознанное решение: секретов на сервере нет вообще.

**⚙️ Settings**:
| Поле | Назначение |
|---|---|
| Base URL | Для кастомного OpenAI-compatible провайдера |
| Worker API URL | Адрес **воркера** (`*workers.dev`), а не сайта — обязательное поле |
| Jira Domain / Email / Token | Только для кнопки «В тикеты» |
| Jira Project | Выбирается из выпадающего списка после загрузки проектов кнопкой ⟳ |

**Что сохраняется в браузере** (`localStorage`):

| Ключ | Содержимое |
|---|---|
| `acoldp_cfg_worker-url` | Адрес воркера |
| `acoldp_cfg_provider` | Выбранный провайдер |
| `acoldp_cfg_base-url` | Base URL кастомного провайдера |
| `acoldp_cfg_jira-project` | Ключ Jira-проекта |
| `acoldp_cfg_mode` | Последний режим генерации |
| `acoldp_cfg_guest` | Флаг гостевого входа |
| `acoldp_draft` | Черновик ввода (автосохранение, debounce 600 мс) |
| `acoldp_theme` | `light` / `dark` |

Артефакты — в **IndexedDB** (`acoldp` → `artifacts`), не в localStorage:
дампы бывают по 100k символов, а localStorage синхронный и ограничен ~5 МБ.

---

## Деплой

### 1. Worker (API)

```bash
npm run deploy:worker
```

**Секреты настраивать НЕ нужно.** Воркер — прозрачный прокси: он не хранит и не
подставляет ни одного ключа, всё приходит от клиента в теле запроса
(`user_config`). Старые инструкции про `SECRET_KEY` / `GEMINI_API_KEY` /
`JIRA_TOKEN` в Cloudflare Dashboard больше неактуальны — их можно не заводить.

Имя воркера задано в `wrangler.toml`: `ai-orchestrator-api`. После деплоя он
доступен по адресу вида
`https://ai-orchestrator-api.<ваш-сабдомен>.workers.dev`
(или по custom domain). Этот URL вносится в ⚙️ Settings на стороне приложения.

### 2. UI (Cloudflare Pages)

**Вариант A — через GitHub (рекомендуется):**
1. Cloudflare Dashboard → Pages → Create project → Connect to Git
2. Выбрать репозиторий → Build settings:
   - Framework preset: `None` (или `Vite`)
   - Build command: `npm run build`
   - Build output directory: `dist/ui`
3. Deploy

**Вариант B — вручную из CLI:**
```bash
npm run deploy:pages   # = npm run build + wrangler pages deploy dist/ui
```

### 3. Домен и финальная настройка

1. Cloudflare Dashboard → Pages → проект → Custom domains → Add domain
   (например `ai.orchestrator.ux42.studio`; CNAME Cloudflare создаст сам)
2. Добавить новый Origin в allowlist воркера — либо он уже есть в
   `DEFAULT_ORIGINS`, либо задать переменную:
   ```toml
   # wrangler.toml
   [vars]
   ALLOWED_ORIGINS = "https://ai.orchestrator.ux42.studio,http://localhost:5173"
   ```
   Проверить можно так — чужой Origin должен получить 403:
   ```bash
   curl -i -X POST https://<worker> -H 'Origin: https://evil.example' \
     -H 'Content-Type: application/json' -d '{}' | head -1   # HTTP/2 403
   ```
3. Открыть сайт, нажать ⚙️ Settings, вставить **Worker API URL** (именно
   `*workers.dev`, а не адрес сайта) и Jira-креды
4. Нажать «Сохранить», затем войти с провайдером и API-ключом

> **Preview-деплои Pages.** У каждого деплоя свой поддомен
> (`<hash>.ai-orchestrator-ui-8vh.pages.dev`), и его Origin в allowlist не
> входит. Чтобы проверить конкретный деплой — добавьте его в
> `ALLOWED_ORIGINS`. Постоянные ссылки на проекте (алиас и свой домен)
> работают без правок.

> **Граница защиты.** Origin — это браузерный контроль, а не полноценная
> аутентификация: клиент без заголовка Origin (curl, серверный скрипт) её
> не проходит. Настоящую защиту от перебора и злоупотреблений даёт
> rate limiting / WAF в Cloudflare Dashboard — это отдельная настройка,
> и для публичного релиза её стоит включить.

---

## Режимы и контракт API

Воркер принимает **только POST**. CORS — по allowlist, а не `*`: Worker
отвечает только перечисленным Origin (список — `DEFAULT_ORIGINS` в
`worker/index.js`, переопределяется переменной `ALLOWED_ORIGINS` в
`wrangler.toml`). Так он не остаётся анонимным публичным релеем в
LLM-провайдеры.

| `mode` | Что делает | Стриминг | Ключ LLM |
|---|---|---|---|
| `REPORT` | Дневной/этапный отчёт по вводу | ✅ SSE | нужен |
| `LEARNING_DIGEST` | Дайджест по учебным материалам | ✅ SSE | нужен |
| `CASE_DRAFT` | Черновик кейса UX42 (8 секций) | ✅ SSE | нужен |
| `REFINE` | Обновление существующего артефакта дополнением | ❌ JSON | нужен |
| `JIRA_SYNC` | Дедупликация и запись тикетов в Jira | ❌ JSON | нужен + Jira |
| `JIRA_PROJECTS` | Список доступных проектов для выпадающего списка | ❌ JSON | только Jira |

Тело запроса:
```jsonc
{
  "raw_text": "...",              // материал (для REFINE — только дополнение)
  "mode": "REPORT",
  "selected_model": "gemini-2.0-flash",  // "" или "AUTO" → авто-выбор
  "stream": true,                 // только для REPORT / DIGEST / CASE
  "artifact_markdown": "...",     // REFINE: текущий артефакт целиком
  "artifact_mode": "REPORT",      // REFINE: тип артефакта
  "user_config": {
    "provider": "google",         // google | alibaba | openai | custom
    "api_key": "...",             // ключ пользователя, не сохраняется
    "base_url": "",               // для custom-провайдера
    "jira_domain": "", "jira_project": "", "jira_email": "", "jira_token": ""
  }
}
```

SSE-события от воркера: `event: delta` `{t}` · `event: done` `{model}` ·
`event: error` `{message}`. Клиент умеет откатиться на обычный JSON, если
воркер старый или ответил ошибкой, — поэтому новый UI работает и со старым деплоем.

Ответы об ошибках содержат контекст, а не голый код: для LLM —
`[<provider>/<model>] HTTP <status>: <первые 400 символов тела ответа API>`, для
Jira — человеческое описание блокировки (CAPTCHA, Cloudflare-челлендж, XSRF).

---

## Модели

Поле «Модель» — свободный ввод с подсказками (`gemini-2.0-flash`, `qwen-max`,
`qwen-flash`, `gpt-4o-mini`). Значение `auto` (пустое поле) включает
авто-выбор:

- **Gemini** — список моделей запрашивается у API по вашему ключу
  (`/v1beta/models`), приоритет у flash-моделей, дальше по убыванию версии;
  перебор следующей модели при 503/429;
- **OpenAI-compatible** — дефолты: `alibaba` → `qwen-max`,
  `openai`/`custom` → `gpt-4o-mini`;
- явное имя модели = один прямой вызов, без перебора.

Несовместимая пара «провайдер ↔ модель» (например, Qwen при провайдере Google)
отсекается на воркере с понятным сообщением.

---

## Как пользоваться

1. Откройте сайт → экран входа: **гость** (демо) или **провайдер + ключ**.
2. ⚙️ Settings → укажите **Worker API URL** (и Jira-креды, если нужен Jira-синк).
3. Вставьте материал в левую панель — текстом, перетаскиванием файлов
   (`.txt`, `.md`, `.json`, `.js`, `.py`, `.csv`) или кнопкой «Демо».
4. Выберите режим и модель. Под полем режима — описание режима и подсказка
   «Рекомендации по LLM».
5. Нажмите CTA режима — текст результата появится в правой панели по мере
   генерации. **Stop** сохранит то, что успело сгенерироваться.
6. Дальше: «Дополнить» (докинуть материал), «В тикеты» (только для отчёта),
   копирование / скачивание `.md` / Google Docs, вкладка «История».

Подсказка по режимам:

| Режим | Когда брать |
|---|---|
| **Отчёт** | Дневник, итоги этапа, дамп обсуждения, расследование — «что произошло за день» |
| **Дайджест** | Конспекты, выдержки из книг/статей, лекции — «что я узнал» |
| **Кейс UX42** | Материалы проекта: чаты, метрики, итерации → черновик для портфолио |

---

## Дизайн-система

Ч/б-палитра с переключаемыми темами: **light** — белый фон, чёрные акценты;
**dark** — чёрный фон, белые акценты. Переключение — атрибут
`data-theme="light|dark"` на `<html>`, выбор в `localStorage` (`acoldp_theme`).
Токены Material Design 3 (`--md-sys-color-*`) заданы в `src/ui/styles/theme.css`.

Коротко о правилах (полные версии — в документации, они и есть источник истины):

- **Кнопки — стекло**: `backdrop-blur` + полупрозрачная заливка + переливающаяся
  кромка + спекулярный блик на hover. Варианты: `default` (CTA, единственная
  `default` на зону), `secondary` (значимое вторичное действие), `ghost`
  (иконочные/служебные, самый тихий hover), `ghost` + `data-destructive`
  («Очистить» — единственная кнопка с особым hover-цветом).
- **Поля ввода — плоские** (`.field-surface`): серый фон, серый бордер в покое,
  на hover/focus/открытом Select бордер подсвечивается токеном `outline-active`.
  Фокус полей — **только бордером**, `ring-*` запрещён. Стекло на полях не
  используется. Drop-zone — пунктирный вариант того же паттерта
  (`.field-surface-dashed`), доступен с клавиатуры.
- **Скругления**: кнопки `rounded-full`, поля и дропдауны `rounded-md`,
  крупные поверхности (панели, диалоги) `rounded-xl`.
- **Типографика**: только утилиты typescale из `base.css`
  (`text-title-sm`, `text-body-sm`, `text-label-md`, …). Inter + JetBrains Mono.
- **Иконки** — только `lucide-react`, монохромные; эмодзи — только в текстах
  статусов и заголовках карточек.
- **Отступы** кратны 4px, зазор между кнопками всегда `gap-2`, вертикальный
  ритм блоков внутри панели — `gap-3`.
- Сырые HEX/rgb в компонентах запрещены — только токены `--md-sys-color-*`.
  `datalist`, инлайн-стили и новые UI-библиотеки — тоже.

UI-примитивы (адаптация библиотеки UX42) — в `src/ui/components/ui/`:
Avatar, Badge, Button, Card, Checkbox, Dialog, DropdownMenu, FormBox, Input,
Label, PageTitle, Select, Skeleton, Switch, Tabs, Textarea, Title, Toast.

```ts
import { Button, Card, Dialog } from '@/components/ui';
```

---

## Документация

Всё важное лежит в `Docs/` — README не заменяет её.

| Документ | О чём |
|---|---|
| [`Docs/MVP_ROADMAP.md`](Docs/MVP_ROADMAP.md) | План работ, статус пакетов, что сознательно **не** в MVP |
| [`Docs/Design-System.md`](Docs/Design-System.md) | Визуальный язык: темы, токены, стекло, поля, drop-zone |
| [`Docs/UI-Rules.md`](Docs/UI-Rules.md) | Правила реализации UI: сетка, типографика, состояния, a11y, **чеклист ревью §13** |
| [`Docs/AI Context Orchestrator & Living Documentation Specification.md`](Docs/AI%20Context%20Orchestrator%20%26%20Living%20Documentation%20Specification.md) | Спецификация и видение платформы (шире, чем MVP) |
| [`Docs/ACOLDP_ AI Context Orchestrator — AI Manifesto.md`](Docs/ACOLDP_%20AI%20Context%20Orchestrator%20%E2%80%94%20AI%20Manifesto.md) | Философия продукта |
| [`Docs/Prompt.md`](Docs/Prompt.md) | Зеркало `REPORT_SYSTEM_INSTRUCTION` (правила отчёта) |
| `Docs/HANDOFF_01…04B_*.md` | Спецификации принятых пакетов: кейс UX42, полировка, стриминг, история+REFINE, гигиена промптов |
| `Docs/Project Handover Manifest.md` | Описание передачи проекта |

Для агентов есть роутеры по контексту: [`.clinerules`](.clinerules) и
[`CLAUDE.md`](CLAUDE.md) — «прочитай ровно один нужный документ, не читай всё подряд».

---

## Известные моменты

- **`src/relay/jira-relay.ts`** — edge-relay для Jira на Next.js, задумывался как
  обход блокировки egress-IP Cloudflare Workers на стороне Atlassian. Сейчас в
  рантайм не подключён: содержит плейсхолдер секрета и захардкоженный тенант,
  требует отдельного деплоя и настройки. В воркере не используется — не
  редактируйте вместе с `src/api/jira.js`.
- **Jira с воркеров** может отдавать 403 «Attention Required» или CAPTCHA —
  это защита Atlassian/Cloudflare на датацентровых IP. В `src/api/jira.js`
  есть разбор таких ответов с понятными сообщениями; запросы идут с
  нейтральным API-User-Agent и `X-Atlassian-Token: no-check` (иначе Atlassian
  отвечает «XSRF check failed»).
- **Лицензия**: файла `LICENSE` в репозитории нет. Публичная лицензия не задана.
- **Артефакты и черновик** живут только в этом браузере: очистка данных сайта
  удаляет историю. Экспортируйте нужное в `.md` или в Google Docs.

---

## Contributing

Работы идут пакетами по handoff-файлам в `Docs/`, порядок и статусы — в
[`Docs/MVP_ROADMAP.md`](Docs/MVP_ROADMAP.md). Перед правкой UI читайте
`Design-System.md` и `UI-Rules.md`; перед коммитом — чеклист `UI-Rules.md` §13
и `npm run typecheck`. Коммиты в формате conventional commits
(`feat`/`fix`/`docs`/`style`/…), сообщения — на английском.



