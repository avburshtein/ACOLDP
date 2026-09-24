# ACOLDP — Project Context for Claude (Agent Router)

Проект: **AI Context Orchestrator (ACOLDP)** — хаос из чатов и заметок → артефакты:
Отчёт / Дайджест / Кейс UX42 (+ Jira-синк как внутренний инструмент).
Стек: Cloudflare Worker (API-прокси, ключи клиента) + React SPA (Vite + TypeScript +
Tailwind v4 + MD3-токены, ч/б темы light/dark).

## Перед задачей — прочитай релевантный документ (анти-жадно: только нужный)

1. **Любое изменение UI** → `Docs/Design-System.md` (поверхности) + `Docs/UI-Rules.md`
   (реализация). Оба обязательны.
2. Генерация/стриминг/Worker → `Docs/HANDOFF_03_STREAMING_AND_STABILITY.md` (SSE-контракт §3).
3. История/REFINE → `Docs/HANDOFF_04_HISTORY_AND_REFINE.md`.
4. Промпты/эмодзи/атрибуция → `Docs/HANDOFF_04B_PROMPT_HYGIENE_AND_ATTRIBUTION.md`.
5. План работ и границы скоупа → `Docs/MVP_ROADMAP.md`.
6. Спецификация/видение (не MVP!) → `Docs/AI Context Orchestrator & Living Documentation Specification.md`.

## Жёсткие правила UI

- Стекло — только кнопки; поля — плоские `.field-surface`; фокус полей — бордером (`outline-active`), НЕ ring.
- Цвета — только токены `--md-sys-color-*` из `theme.css`; сырые HEX/rgb в компонентах запрещены.
- Иконки — только `lucide-react`, монохромные; эмодзи — только в текстах статусов/заголовков.
- Отступы кратны 4px (полушаг 2px); радиусы: кнопки `rounded-full`, поля/дропдауны `rounded-md`, карточки `rounded-xl`.
- Типографика — только typescale-утилиты из `base.css` (`text-title-sm`, `text-body-sm`, …); Inter + JetBrains Mono.
- `datalist`, инлайн-стили, новые UI-библиотеки — запрещены. UI-примитивы — `@/components/ui`.
- Перед коммитом UI: чеклист ревью §13 из `Docs/UI-Rules.md` + `npm run typecheck`.

## Процесс

- Работы идут пакетами: handoff-файлы в `Docs/`. Не выходить за скоуп пакета;
  раздел «Не трогать» в handoff-е — свят.
- Порядок пакетов и статус — в `Docs/MVP_ROADMAP.md`.
- Коммиты: conventional (feat/fix/docs/style…), сообщение на английском.

## Карта кода

- `worker/index.js` — точка входа API (режимы REPORT/LEARNING_DIGEST/CASE_DRAFT/REFINE/JIRA_SYNC/JIRA_PROJECTS).
- `src/api/` — интеграции: `gemini.js` (LLM + стрим), `jira.js` (Atlassian), `prompts.js` (промпты).
- `src/ui/` — SPA: `app.tsx` (корень), `components/` (панели, оверлеи), `components/ui/` (примитивы),
  `lib/` (api, storage, artifact-store), `styles/` (base.css, theme.css).