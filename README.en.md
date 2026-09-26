# AI Context Orchestrator · ACOLDP

[Русский](README.md) · **English**

> Chaos from chats, notes and LLM exports → structured artifacts:
> **Report** · **Digest** · **UX42 Case Draft**. Jira sync is an internal tool,
> not a separate product.

A web app where you paste raw material (chat dumps, a work journal, lecture
notes, an exported conversation) and get back a finished Markdown artifact that
you don't have to rewrite by hand. LLM and Jira keys are entered by the user:
the Worker is a transparent proxy and requires no server-side secrets.

---

## What it does today

| Feature | Details |
|---|---|
| **3 generation modes** | `Report` (daily/phase report from journals and chats), `Digest` (notes, books, courses → structured learning digest), `UX42 Case` (project material → draft of the 8-section UX42 Case Study Builder) |
| **SSE streaming** | Text appears as it is generated (first byte leaves immediately → no Cloudflare `524` on long inputs) |
| **Stop button** | Interrupts generation; the partial result is saved as an artifact |
| **Artifact history** | Every generation is stored locally in IndexedDB: date, mode, title, preview → open, delete |
| **Refine ("Дополнить")** | Feed more material into a finished artifact — updated in place, never regenerated from scratch |
| **Jira sync** | Task extraction + deduplication against open tickets → `CREATE` / `UPDATE_PRIORITY` / `ADD_COMMENT` |
| **Export** | Download `.md`, copy, "Google Docs" (copies the text and opens a new document) |
| **Demo mode** | Full UI and canned results without a single API key |
| **B/W themes** | Light and dark, toggle in the header, choice is persisted |

**Limits:** input up to 100,000 characters (~25k tokens) — a guard against
accidental giant inputs; above 30,000 characters the UI warns that generation
will take longer (streaming removes the timeout risk).

---

## Stack

- **Cloudflare Worker** — API proxy (ES modules, `nodejs_compat`). User keys
  arrive in the body of every request; the Worker never stores them.
- **React 19 + TypeScript + Vite 8 + Tailwind CSS v4** — SPA, MD3 tokens
  (`--md-sys-color-*`), Inter + JetBrains Mono typography.
- **Radix UI** — primitives foundation; **lucide-react** — icons;
  `clsx` + `tailwind-merge` + `class-variance-authority` — utilities.
- Verified on Node 24 (Vite 8 requires Node 20.19+ / 22.12+).

## Architecture

```
GitHub Repo
├── worker/
│   └── index.js              Cloudflare Worker: mode routing, validation,
│                             JSON responses, SSE helper for streaming
├── src/
│   ├── api/                  Plain JS — imported by the Worker directly
│   │   ├── gemini.js         LLM: Google Gemini (native) + OpenAI-compatible,
│   │   │                     model auto-discovery, retries, SSE streaming
│   │   ├── jira.js           Atlassian REST: project list, open tickets,
│   │   │                     create / update / comment (throttled)
│   │   └── prompts.js        System prompts: REPORT, LEARNING_DIGEST,
│   │                         CASE_DRAFT, REFINE, DEDUP + JSON Schema
│   ├── relay/
│   │   └── jira-relay.ts     Edge relay for Jira (Next.js) — see "Known caveats"
│   └── ui/                   React SPA (Vite root)
│       ├── index.html        HTML template
│       ├── main.tsx          React entry: ThemeProvider + App
│       ├── app.tsx           Root: session, modes, streaming, history, REFINE
│       ├── types.ts          Shared types, mode labels, limits
│       ├── demo-data.ts      Demo input + three consistent demo artifacts
│       ├── components/
│       │   ├── auth-overlay.tsx      Session login (keys kept in memory only)
│       │   ├── input-panel.tsx       Input: mode, model, textarea, drop-zone
│       │   ├── results-panel.tsx     Result / History / Jira / Stop
│       │   ├── settings-dialog.tsx   Base URL, Worker URL, Jira credentials
│       │   ├── status-badge.tsx      Floating status pill + useStatus()
│       │   ├── theme-toggle.tsx      light/dark switch
│       │   └── ui/                   Primitives (@/components/ui), adapted from UX42
│       ├── hooks/use-theme.tsx       Theme context + localStorage
│       ├── lib/
│       │   ├── api.ts                POST to the Worker + SSE client streamReport
│       │   ├── artifact-store.ts     IndexedDB artifact storage
│       │   ├── parse-case-completeness.ts  Parses the case Completeness section
│       │   ├── storage.ts            localStorage: settings + input draft
│       │   └── utils.ts              cn() = clsx + tailwind-merge
│       └── styles/
│           ├── base.css       Tailwind v4 @theme, MD3 type scale, glass, .field-surface
│           └── theme.css      B/W tokens for light/dark via data-theme
├── ui from UX42/              Original UX42 primitives (adapted into src/ui/components/ui)
├── Docs/                      Spec, design system, handoff packages, roadmap
├── dist/ui/                   Production build of the SPA (gitignored)
├── wrangler.toml              Worker config (name: ai-orchestrator-api)
├── vite.config.ts             root = src/ui, alias @ → src/ui, outDir = dist/ui
└── package.json
```

---

## Quick start

```bash
npm install
npm run dev          # Vite dev server → http://localhost:5173 (opens automatically)
```

Then pick one of two paths:

- **Just look at it.** On the login screen press **"Гостевой вход — демо без ключей"**
  (guest login). All three modes work on canned data; no real LLM requests are sent.
- **Use it for real.** You need a deployed Worker (see "Deployment") and your own API key.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (SPA) on `http://localhost:5173` |
| `npm run dev:ui` | Same, explicit alias |
| `npm run dev:worker` | Local Worker via Wrangler (`worker/index.js`) |
| `npm run build` | Production build → `dist/ui` |
| `npm run typecheck` | Type check (`tsc --noEmit`) — run before committing UI changes |
| `npm run deploy:worker` | `wrangler deploy worker/index.js` |
| `npm run deploy:pages` | Build + `wrangler pages deploy dist/ui --project-name=ai-orchestrator-ui` |

There is no test framework and no linter in the project — the quality gate is
`npm run typecheck` plus a manual pass over the `Docs/UI-Rules.md` §13 checklist.

---

## App configuration

Everything is configured from the UI; there is no config file to edit.

**Login screen (`auth-overlay.tsx`)** — shown on the first visit:
- **LLM Provider**: `Gemini` (native API) · `Alibaba (Qwen)` · `OpenAI` (any OpenAI-compatible);
- **LLM API Key** — sent to the Worker in the request body.

> ⚠️ Keys live **in the tab's memory only**. They are never written to
> localStorage and disappear on page reload or when you end the session (the
> "Завершить сессию" button in the header). This is deliberate: the server holds
> no secrets at all.

**⚙️ Settings**:
| Field | Purpose |
|---|---|
| Base URL | For a custom OpenAI-compatible provider |
| Worker API URL | The **Worker's** address (`*workers.dev`), not the site — required |
| Jira Domain / Email / Token | Only needed for the "В тикеты" (to tickets) button |
| Jira Project | Picked from a dropdown after loading projects with the ⟳ button |

**What is stored in the browser** (`localStorage`):

| Key | Contents |
|---|---|
| `acoldp_cfg_worker-url` | Worker address |
| `acoldp_cfg_provider` | Selected provider |
| `acoldp_cfg_base-url` | Base URL of the custom provider |
| `acoldp_cfg_jira-project` | Jira project key |
| `acoldp_cfg_mode` | Last generation mode |
| `acoldp_cfg_guest` | Guest-login flag |
| `acoldp_draft` | Input draft (autosave, 600 ms debounce) |
| `acoldp_theme` | `light` / `dark` |

Artifacts live in **IndexedDB** (`acoldp` → `artifacts`), not in localStorage:
dumps reach 100k characters while localStorage is synchronous and capped at ~5 MB.

---

## Deployment

### 1. Worker (API)

```bash
npm run deploy:worker
```

**No secrets need to be configured.** The Worker is a transparent proxy: it
stores and injects no keys at all — everything arrives from the client in the
request body (`user_config`). Older instructions about `SECRET_KEY` /
`GEMINI_API_KEY` / `JIRA_TOKEN` in the Cloudflare Dashboard are obsolete, skip them.

The Worker name is set in `wrangler.toml`: `ai-orchestrator-api`. After
deployment it is available at
`https://ai-orchestrator-api.<your-subdomain>.workers.dev`
(or via a custom domain). Paste that URL into ⚙️ Settings in the app.

### 2. UI (Cloudflare Pages)

**Option A — via GitHub (recommended):**
1. Cloudflare Dashboard → Pages → Create project → Connect to Git
2. Pick the repository → Build settings:
   - Framework preset: `None` (or `Vite`)
   - Build command: `npm run build`
   - Build output directory: `dist/ui`
3. Deploy

**Option B — manually from the CLI:**
```bash
npm run deploy:pages   # = npm run build + wrangler pages deploy dist/ui
```

### 3. Domain and final setup

1. Cloudflare Dashboard → Pages → your project → Custom domains → Add domain
2. Open the site, press ⚙️ Settings, paste the **Worker API URL** (the
   `*workers.dev` address, not the site address) and the Jira credentials
3. Press "Сохранить" (Save), then log in with your provider and API key

---

## Modes and API contract

The Worker accepts **POST only** (CORS: `Access-Control-Allow-Origin: *`).

| `mode` | What it does | Streaming | LLM key |
|---|---|---|---|
| `REPORT` | Daily/phase report from the input | ✅ SSE | required |
| `LEARNING_DIGEST` | Learning digest from study material | ✅ SSE | required |
| `CASE_DRAFT` | UX42 case draft (8 sections) | ✅ SSE | required |
| `REFINE` | Update an existing artifact with a supplement | ❌ JSON | required |
| `JIRA_SYNC` | Deduplicate and write tickets to Jira | ❌ JSON | required + Jira |
| `JIRA_PROJECTS` | List accessible projects for the dropdown | ❌ JSON | Jira only |

Request body:
```jsonc
{
  "raw_text": "...",              // material (for REFINE: the supplement only)
  "mode": "REPORT",
  "selected_model": "gemini-2.0-flash",  // "" or "AUTO" → auto-selection
  "stream": true,                 // REPORT / DIGEST / CASE only
  "artifact_markdown": "...",     // REFINE: the current artifact in full
  "artifact_mode": "REPORT",      // REFINE: artifact type
  "user_config": {
    "provider": "google",         // google | alibaba | openai | custom
    "api_key": "...",             // user's key, never stored
    "base_url": "",               // for the custom provider
    "jira_domain": "", "jira_project": "", "jira_email": "", "jira_token": ""
  }
}
```

SSE events from the Worker: `event: delta` `{t}` · `event: done` `{model}` ·
`event: error` `{message}`. The client falls back to plain JSON when the Worker
is old or returns an error, so the new UI keeps working with an old deployment.

Error responses carry context rather than a bare status code: for LLMs —
`[<provider>/<model>] HTTP <status>: <first 400 chars of the API response body>`;
for Jira — a human-readable description of the block (CAPTCHA, Cloudflare
challenge, XSRF).

---

## Models

The model field is a free-text input with suggestions (`gemini-2.0-flash`,
`qwen-max`, `qwen-flash`, `gpt-4o-mini`). Leaving it as `auto` (empty) enables
auto-selection:

- **Gemini** — the model list is fetched from the API with your key
  (`/v1beta/models`), flash models first, then by descending version; the next
  model is tried on 503/429;
- **OpenAI-compatible** — defaults: `alibaba` → `qwen-max`,
  `openai`/`custom` → `gpt-4o-mini`;
- an explicit model name means a single direct call, with no fallback chain.

Incompatible provider↔model pairs (e.g. Qwen with the Google provider) are
rejected by the Worker with a clear message.

---

## Usage

1. Open the site → login screen: **guest** (demo) or **provider + key**.
2. ⚙️ Settings → set the **Worker API URL** (plus Jira credentials if you need Jira sync).
3. Paste material into the left panel — as text, by dropping files
   (`.txt`, `.md`, `.json`, `.js`, `.py`, `.csv`), or with the "Демо" button.
4. Pick a mode and a model. Under the mode selector you'll see the mode
   description and an "Рекомендации по LLM" (LLM recommendations) hint.
5. Press the mode CTA — the result appears in the right panel as it streams in.
   **Stop** keeps whatever was generated.
6. Then: "Дополнить" (refine with more material), "В тикеты" (report only),
   copy / download `.md` / Google Docs, and the "История" tab.

Mode cheat sheet:

| Mode | When to use it |
|---|---|
| **Report** | Journal, phase summary, chat dump, incident investigation — "what happened today" |
| **Digest** | Notes, book/article excerpts, lectures — "what I learned" |
| **UX42 Case** | Project material: chats, metrics, iterations → a portfolio draft |

---

## Design system

A B/W palette with switchable themes: **light** — white background, black
accents; **dark** — black background, white accents. The switch is the
`data-theme="light|dark"` attribute on `<html>`, persisted in `localStorage`
(`acoldp_theme`). Material Design 3 tokens (`--md-sys-color-*`) live in
`src/ui/styles/theme.css`.

In short (the docs are the source of truth):

- **Buttons are glass**: `backdrop-blur` + translucent fill + a shimmering edge
  + a specular highlight on hover. Variants: `default` (CTA, the only `default`
  per zone), `secondary` (meaningful secondary action), `ghost` (icon/service
  actions, quietest hover), `ghost` + `data-destructive` ("Очистить"/Clear —
  the only button with a special hover color).
- **Input fields are flat** (`.field-surface`): grey background and grey border
  at rest; on hover/focus/open Select the border highlights with the
  `outline-active` token. Field focus is **border-only**; `ring-*` is
  forbidden. No glass on fields. The drop-zone is a dashed variant of the same
  pattern (`.field-surface-dashed`) and is keyboard accessible.
- **Radii**: buttons `rounded-full`, fields and dropdowns `rounded-md`, large
  surfaces (panels, dialogs) `rounded-xl`.
- **Typography**: only the type-scale utilities from `base.css`
  (`text-title-sm`, `text-body-sm`, `text-label-md`, …). Inter + JetBrains Mono.
- **Icons** — `lucide-react` only, monochrome; emoji are allowed only in status
  texts and card headings.
- **Spacing** is a multiple of 4px, the gap between buttons is always `gap-2`,
  and the vertical rhythm of blocks inside a panel is `gap-3`.
- Raw HEX/rgb inside components is forbidden — only `--md-sys-color-*` tokens.
  So are `datalist`, inline styles and new UI libraries.

UI primitives (adapted from the UX42 library) live in `src/ui/components/ui/`:
Avatar, Badge, Button, Card, Checkbox, Dialog, DropdownMenu, FormBox, Input,
Label, PageTitle, Select, Skeleton, Switch, Tabs, Textarea, Title, Toast.

```ts
import { Button, Card, Dialog } from '@/components/ui';
```

---

## Documentation

Everything important lives in `Docs/` — this README does not replace it.

| Document | About |
|---|---|
| [`Docs/MVP_ROADMAP.md`](Docs/MVP_ROADMAP.md) | Work plan, package status, what is deliberately **out of** MVP |
| [`Docs/Design-System.md`](Docs/Design-System.md) | Visual language: themes, tokens, glass, fields, drop-zone |
| [`Docs/UI-Rules.md`](Docs/UI-Rules.md) | UI implementation rules: grid, typography, states, a11y, **review checklist §13** |
| [`Docs/AI Context Orchestrator & Living Documentation Specification.md`](Docs/AI%20Context%20Orchestrator%20%26%20Living%20Documentation%20Specification.md) | Platform spec and vision (broader than the MVP) |
| [`Docs/ACOLDP_ AI Context Orchestrator — AI Manifesto.md`](Docs/ACOLDP_%20AI%20Context%20Orchestrator%20%E2%80%94%20AI%20Manifesto.md) | Product philosophy |
| [`Docs/Prompt.md`](Docs/Prompt.md) | Mirror of `REPORT_SYSTEM_INSTRUCTION` (report rules) |
| `Docs/HANDOFF_01…04B_*.md` | Specs of accepted packages: UX42 case, polish, streaming, history+REFINE, prompt hygiene |
| `Docs/Project Handover Manifest.md` | Project handover description |

Agents get context routers: [`.clinerules`](.clinerules) and
[`CLAUDE.md`](CLAUDE.md) — "read exactly the one document you need, don't read everything".

---

## Known caveats

- **`src/relay/jira-relay.ts`** — a Next.js edge relay for Jira, conceived as a
  workaround for Cloudflare Workers egress IPs being blocked by Atlassian. It is
  not wired into the runtime right now: it contains a secret placeholder and a
  hard-coded tenant and needs its own deploy and setup. The Worker does not use
  it — don't edit it together with `src/api/jira.js`.
- **Jira from Workers** may return 403 "Attention Required" or a CAPTCHA — that
  is Atlassian/Cloudflare protection against data-center IPs. `src/api/jira.js`
  parses such responses into readable messages; requests are sent with a neutral
  API User-Agent and `X-Atlassian-Token: no-check` (otherwise Atlassian replies
  with "XSRF check failed").
- **License**: the repository has no `LICENSE` file. No public license is set.
- **Artifacts and the input draft** live only in this browser: clearing site data
  wipes the history. Export what you need to `.md` or to Google Docs.

---

## Contributing

Work is organised as packages described by the handoff files in `Docs/`; order and
status live in [`Docs/MVP_ROADMAP.md`](Docs/MVP_ROADMAP.md). Before changing UI,
read `Design-System.md` and `UI-Rules.md`; before committing, run the
`UI-Rules.md` §13 checklist and `npm run typecheck`. Commits follow conventional
commits (`feat`/`fix`/`docs`/`style`/…) with English messages.



