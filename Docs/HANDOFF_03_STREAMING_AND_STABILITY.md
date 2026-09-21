# HANDOFF 03 — Стриминг (SSE) + стабильность: 524, Stop, диагностика ошибок

**Для кого:** Cline / Claude / другой coding-агент
**Репо:** ACOLDP (`AI Context Orchestrator & Living Documentation Platform`)
**Зависит от:** HANDOFF 02 принят ✅
**Не делать в этом таске:** историю/IndexedDB, REFINE-режим, JSON-экспорт кейса, чанкинг длинного входа, стриминг JIRA_SYNC, кастомные режимы, голос, мультиагенты, правки промптов (`prompts.js`), рефакторинг архитектуры.

---

## 0. Как запускать этот handoff в Cline

1. Открыть **этот репозиторий ACOLDP**.
2. Вставить в чат блок **«Промпт для агента»** из раздела 8 целиком.
3. Приложить: `@Docs/HANDOFF_03_STREAMING_AND_STABILITY.md`
4. Критерий готовности: чеклист §7 — всё ✅.

---

## 1. Проблема

1. **524 на реальном сценарии.** Worker ждёт весь ответ LLM синхронно (`await callLLM`). Пока Cloudflare не получил первый байт ответа воркера, прокси отдаёт клиенту `524 A Timeout Occurred`. REPORT-промпт большой, вход до 100 000 символов — генерация регулярно идёт дольше таймаута. `TIMEOUT_WARN_CHARS` в UI — только предупреждение, проблему оно не решает. Дампы больших чатов — основной сценарий инструмента — работают нестабильно.
2. **Нет Stop.** Юзер ждёт вслепую; прервать нельзя; перезагрузка теряет всё.
3. **Диагностика 500 (кейс GLM).** У OpenAI-compatible провайдеров нет ни ретрая, ни fallback; сообщения об ошибках не всегда доносят статус и тело ответа API до юзера. Чинить чужой API мы не можем, обязаны честно показывать причину.

Цель: текст результата **появляется по мере генерации** (первый байт уходит сразу → 524 исчезает), генерацию можно **остановить** с сохранением частичного текста, ошибки содержат **провайдер, модель, HTTP-статус и тело ответа**.

---

## 2. Задачи (порядок)

### 2.1 `src/api/gemini.js` — стриминговый вызов `callLLMStream`

Добавить (не трогая существующий `callLLM` — он остаётся для JIRA_SYNC и fallback):

```js
export async function callLLMStream(provider, baseUrl, apiKey, model, systemPrompt, userText, { onDelta, signal })
```

- `onDelta(text)` — колбэк на каждый текстовый чанк; `signal` — AbortSignal из fetch-клиента.
- Возвращает Promise<void>; при неудаче — throw (формат ошибок — §3.4).

**Google (native):**
- URL: `.../v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
- Body — как сейчас в `callGeminiModel` (system_instruction, contents, generationConfig с `thinkingConfig.thinkingBudget: 0` для не-lite/не-1.5 моделей; schema-режим в стриминге не используется).
- Ответ — SSE: строки `data: {JSON}`. Текст чанка: `candidates[0].content.parts[*].text` — **конкатенировать все parts**. Gemini при alt=sse НЕ присылает `[DONE]` — конец потока = завершение.
- Если в чанке нет текста, но есть `promptFeedback.blockReason` / `candidates[0].finishReason === "SAFETY"` → throw с понятным сообщением.
- При выбранной явной модели — одна модель. При `AUTO` — текущая логика discovery + цикл моделей, но выход из цикла **после первой дельты**: если модель упала с 503/429 ДО первой дельты — пробуем следующую; после первой дельты любые ошибки — throw.

**OpenAI-compatible (`callLLMStreamOpenAI`):**
- Body текущего запроса + `stream: true`.
- SSE: `data: {JSON}` с текстом в `choices[0].delta.content`; терминатор `data: [DONE]`.
- Один ретрай при HTTP 5xx/429 **до первой дельты** (короткая пауза ~800 мс, повторный fetch). После первой дельты — throw.

**Парсинг SSE (общий helper):** буферизовать частичные строки (чанк может рваться посреди JSON), нормализовать `\r\n` → `\n`, обрабатывать строки `data: ...`, события без `data:` пропускать. Невалидный JSON-чанк — пропустить молча (устойчивость к глюкам провайдера).

### 2.2 `worker/index.js` — SSE-ветка для трёх режимов

- В body опционально приходит `stream: true`.
- Для `REPORT` / `LEARNING_DIGEST` / `CASE_DRAFT` при `stream === true`:
  1. Все существующие валидации и лимиты (input guard, совместимость provider/model, наличие ключа) — **до** начала стрима, как сейчас.
  2. `packetHeader` — как сейчас.
  3. Вернуть `new Response(readable, { headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } })`, где `readable` — ReadableStream, пушащий события формата §3.1:
     - старт: ничего (первая дельта = первый байт);
     - каждая дельта: `event: delta` + `data: {"t":"..."}`;
     - успех: `event: done` + `data: {"model":"<фактическая модель>"}`;
     - ошибка: `event: error` + `data: {"message":"..."}`, затем close.
  4. Если апстрим закрылся без единой дельты и без ошибки → `error` «Модель вернула пустой ответ».
- `JIRA_SYNC` и `JIRA_PROJECTS` — без изменений (JSON).
- Клиент без `stream: true` → старый JSON-путь. Обратная совместимость обязательна.

### 2.3 `src/ui/lib/api.ts` — `streamReport`

```ts
export interface StreamHandlers {
  onDelta: (delta: string, full: string) => void;
  signal?: AbortSignal;
}
export async function streamReport(
  workerUrl: string, text: string, mode: Mode,
  model: string, config: UserConfig, handlers: StreamHandlers,
): Promise<string>
```

- POST: `{ raw_text, mode, stream: true, selected_model, user_config }`.
- По `res.headers.get('content-type')`:
  - `text/event-stream` → читать `res.body.getReader()` + TextDecoder, парсить события нашего формата (§3.1), `onDelta` на каждый `delta`, resolve полным текстом на `done`, throw на `error` с `message` из события.
  - иначе (JSON) — **старый воркер или ошибка**: если `!res.ok` → throw сообщение из JSON `error`; если ok → это ответ старого воркера: вернуть `report_markdown` целиком, вызвав `onDelta` один раз (UI единообразен). Так новый UI работает и со старым деплоем воркера.
- `fetch` выбросил `AbortError` (name === 'AbortError') → пробросить как есть (app.tsx различает abort по `err.name`).

### 2.4 `src/ui/app.tsx` — стриминговое состояние + Stop

- `const abortRef = useRef<AbortController | null>(null);`
- Для трёх генеративных режимов вместо `api.report/learningDigest/caseDraft` — `api.streamReport`:
  1. Старт: `abortRef.current = new AbortController();` и `setView({ kind: 'streaming', markdown: '', mode: targetMode, seconds: 0 })`.
  2. `onDelta`: `setView(v => v.kind === 'streaming' ? { ...v, markdown: v.markdown + delta } : v)`.
  3. `done`: `setLastReport(full); setLastMode(mode); setView({ kind: 'report', markdown: full, demo: false, mode });` + статус `✓ ... готов`.
  4. `catch`: если `err.name === 'AbortError'` → частичный текст: если накоплен > 0 — сохранить его как `report` (`lastReport` + view) и показать статус `⏹ Остановлено — частичный результат сохранён`; иначе — сообщение «Остановлено». Иначе обычный error view.
- `busy` = `view.kind === 'loading' || view.kind === 'streaming'` (кнопка Run и Демо блокируются во время стрима).
- `handleStop`: `abortRef.current?.abort()`. Также abort в `handleClear` и при повторном `sendRequest`.
- Демо-путь (гость) не трогать; секундомер `seconds` тикает и в streaming (расширить условие существующего effect: `loading | streaming`).

### 2.5 `src/ui/components/results-panel.tsx` — Stop + live-рендер

- `ResultsView` дополнить: `| { kind: 'streaming'; markdown: string; mode: Mode; seconds: number }`.
- Рендер streaming = как report-карточка (тот же `pre` с `resultTitle(mode)`), сверху бейдж «Генерация…» + секундомер, в шапке панели кнопка **Stop** (lucide `Square`, variant `secondary`, title «Остановить и сохранить часть»), `onClick={onStop}`.
- Автопрокрутка: `ref` на `pre`, при изменении markdown во время стрима `scrollTop = scrollHeight` (MVP-упрощение допустимо).
- В Props добавить `onStop: () => void`. Секундомер/hints переиспользовать.

### 2.6 Копия подсказки о таймауте

- `src/ui/types.ts` / `input-panel.tsx`: текст предупреждения для входов > `TIMEOUT_WARN_CHARS` заменить на смысл «большой вход: генерация займёт больше времени, ответ появится постепенно» (риск 524 со стримингом уходит). Сами константы (`MAX_INPUT_CHARS`, `TIMEOUT_WARN_CHARS`) не менять.

### 2.7 Диагностика ошибок OpenAI-compatible (случай GLM 500)

- Во всех сообщениях об ошибках LLM-вызовов формат: `[<provider>/<model>] HTTP <status>: <первые 400 символов тела>`.
- Нестриминговый `callOpenAICompatible`: тело ошибки обрезать до 400 символов (сейчас — целиком, раздувает UI), добавить имя модели в сообщение.
- В стриминговых ветках — тот же формат; до юзера доходят сообщения через `event: error`.
- **Не** менять параметры запросов к провайдерам «наугад» — только диагностика. Починка GLM, если воспроизведётся после этого пакета, — отдельный таск по логам тела ошибки.

---

## 3. Технический контракт

### 3.1 События Worker → клиент (наш формат, фиксированный)

```
event: delta
data: {"t":"<кусок текста, JSON-экранированный>"}

event: done
data: {"model":"gemini-2.5-flash"}

event: error
data: {"message":"<человекочитаемое сообщение>"}
```

- `data` — всегда валидный JSON. После `done`/`error` — поток закрывается.
- Клиент игнорирует события, кроме `delta`/`done`/`error`.

### 3.2 Апстрим (провайдеры)

- Gemini `alt=sse`: `data: {GenerateContentResponse}` … конец потока; текст в `candidates[0].content.parts[*].text`.
- OpenAI-compatible: `data: {choices:[{delta:{content}}]}` … `data: [DONE]`.

### 3.3 Совместимость

- Новый UI + старый воркер: `content-type: application/json` → одиночная дельта полным текстом.
- Старый UI + новый воркер: без `stream: true` → JSON-ответ как раньше.
- Кросс-домен: CORS-заголовки должны быть и на стрим-ответе.

### 3.4 Формат ошибок

`[<provider>/<model>] HTTP <status>: <body-slice ≤400>` — единый для `callLLM` и `callLLMStream`.

---

## 4. Файлы — ожидаемый дифф

| Файл | Изменение |
|------|-----------|
| `src/api/gemini.js` | + `callLLMStream` (+ SSE-парсер, ретраи до первой дельты); обрезка тела ошибок |
| `worker/index.js` | стрим-ветка для REPORT / LEARNING_DIGEST / CASE_DRAFT при `stream: true` |
| `src/ui/lib/api.ts` | + `streamReport` с fallback на JSON-ответ |
| `src/ui/app.tsx` | три режима на стрим-путь, AbortController, busy, Stop/Clear |
| `src/ui/components/results-panel.tsx` | kind `streaming`, кнопка Stop, автопрокрутка |
| `src/ui/types.ts` (+ input-panel) | только текст подсказки о большом входе |

**Не трогать:** `prompts.js`, `demo-data.ts`, `jira.js`, `jira-relay.ts`, `parse-case-completeness.ts`, стили/темы, компоненты `ui/*`.

---

## 5. Вне скоупа (следующие пакеты)

История артефактов + REFINE (HANDOFF 04) · JSON-экспорт кейса (05) · импорт в UX42 (06, репо ux42studio) · чанкинг входа map-reduce · стриминг JIRA_SYNC.

---

## 6. Ручная проверка владельцем

1. **Демо** без ключа — как раньше, ничего не сломалось.
2. **Отчёт** с реальным ключом: текст появляется **постепенно**; Stop в процессе → частичный текст остаётся как результат, статус «Остановлено».
3. **Дайджест** и **Кейс UX42** — так же; Completeness-баннер на кейсе работает и на дочитанном результате.
4. **Длинный вход >30k символов** — не 524: текст течёт (можно ~40k экспорт чата).
5. **Неверный API-ключ** — быстрая понятная ошибка с `[provider/model] HTTP 401…`, не зависание.
6. **JIRA_SYNC** — работает по-старому (JSON, не стрим).
7. `npm run typecheck` — чисто.

---

## 7. Definition of Done

- [ ] REPORT / LEARNING_DIGEST / CASE_DRAFT идут через SSE (новый воркер + `stream: true`)
- [ ] Fallback: новый UI + старый воркер (JSON) и старый UI + новый воркер — оба работают
- [ ] Stop останавливает генерацию и сохраняет частичный результат
- [ ] `busy` блокирует Run/Демо во время стрима; Stop доступен в шапке результатов
- [ ] Ошибки OpenAI-compatible содержат provider/model/status/тело (≤400 симв.)
- [ ] JIRA_SYNC, демо-режим, Completeness-баннер не сломаны
- [ ] `npm run typecheck` чисто; diff summary в ответе агента

---

## 8. Промпт для агента (копировать в Cline)

```
Задача: перевести генеративные режимы ACOLDP (REPORT, LEARNING_DIGEST, CASE_DRAFT) на SSE-стриминг из Cloudflare Worker, добавить Stop с сохранением частичного результата и улучшить диагностику ошибок OpenAI-compatible.

Прочитай и строго следуй:
@Docs/HANDOFF_03_STREAMING_AND_STABILITY.md

Сделай пункты 2.1–2.7. Контракт SSE-событий из §3.1 не отступать. Существующий callLLM и путь JIRA_SYNC не менять. Промпты (prompts.js), demo-data и стили не трогать.

После правок: список файлов + как проверить по §6.
```

---

## 9. После приёмки

Владелец пишет «03 ок» (проверив п. 4 на реальном дампе — это главный критерий) → следующий пакет **HANDOFF 04: История артефактов (IndexedDB) + REFINE**. Общий план — `Docs/MVP_ROADMAP.md`.
