// ============================================================
// AI Context Orchestrator — UI Application Logic
// ============================================================

import { SAMPLE_RAW_INPUT, SAMPLE_REPORT } from "./demo-data.js";

// Max input size — prevents long-context degradation (v10.x blocker)
const MAX_INPUT_CHARS = 15000;

// ── State ────────────────────────────────────────────────────
const state = {
  apiKey: "",
  jiraDomain: "",
  jiraEmail: "",
  jiraToken: "",
  lastReport: "",
  processingTimer: null,
  processingSeconds: 0
};

// ── DOM refs ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const authOverlay   = $("auth-overlay");
const authForm      = $("auth-form");
const sessApiKey    = $("session-api-key");
const sessJiraDomain = $("session-jira-domain");
const sessJiraEmail = $("session-jira-email");
const sessJiraToken = $("session-jira-token");
const inputArea     = $("input-area");
const modelSelect   = $("model-select");
const reportBtn     = $("report-btn");
const syncBtn       = $("sync-btn");
const clearBtn      = $("clear-btn");
const copyBtn       = $("copy-btn");
const dlMdBtn       = $("dl-md-btn");
const convertBtn    = $("convert-btn");
const statusBadge   = $("status-badge");
const logoutBtn     = $("logout-btn");
const settingsBtn   = $("settings-btn");
const settingsModal = $("settings-modal");
const settingsClose = $("settings-close");
const settingsCancel = $("settings-cancel");
const settingsSave  = $("settings-save");
const loadProjectsBtn = $("cfg-jira-load-projects");
const cfgProvider   = $("cfg-provider");
const baseUrlGroup  = $("base-url-group");
const resultsPlaceholder = $("results-placeholder");
const resultsContent = $("results-content");
const fileInput     = $("file-input");
const dropZone      = $("drop-zone");
const demoBtn       = $("demo-btn");
const charCount     = $("char-count");
const charLimit     = $("char-limit");

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Session setup — required when Worker URL is configured
  const hasWorker = !!localStorage.getItem("acoldp_cfg_worker-url");
  if (hasWorker) {
    // Show session setup overlay — keys never persist to localStorage
    authOverlay.classList.remove("hidden");
  } else {
    hideAuth(); // demo mode — no Worker, no auth
  }

  // Draft
  const draft = localStorage.getItem("acoldp_draft");
  if (draft) inputArea.value = draft;

  // Char counter
  updateCharCounter();

  // Settings
  loadSettings();
});

// ── Session Setup ────────────────────────────────────────────
authForm.addEventListener("submit", e => {
  e.preventDefault();
  const apiKey = sessApiKey.value.trim();
  if (!apiKey) { showStatusBadge("Введите LLM API Key"); return; }
  state.apiKey = apiKey;
  state.jiraDomain = sessJiraDomain.value.trim();
  state.jiraEmail = sessJiraEmail.value.trim();
  state.jiraToken = sessJiraToken.value.trim();
  hideAuth();
  inputArea.focus();

  // Clear sensitive fields from DOM
  sessApiKey.value = "";
  sessJiraToken.value = "";

  showStatusBadge("✓ Сессия начата. Ключи в памяти браузера.");
});

logoutBtn.addEventListener("click", () => {
  state.apiKey = "";
  state.jiraDomain = "";
  state.jiraEmail = "";
  state.jiraToken = "";
  authOverlay.classList.remove("hidden");
  showStatusBadge("✓ Сессия завершена. Ключи удалены из памяти.");
});

function hideAuth() {
  authOverlay.classList.add("hidden");
}

// ── Auto-save draft ───────────────────────────────────────────
let saveTimeout;
inputArea.addEventListener("input", () => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    localStorage.setItem("acoldp_draft", inputArea.value);
    showStatusBadge("✓ Черновик сохранён");
  }, 500);
  updateCharCounter();
});

function updateCharCounter() {
  const len = inputArea.value.length;
  charCount.textContent = `${len.toLocaleString("ru-RU")} символов`;
  const over = len > MAX_INPUT_CHARS;
  charCount.classList.toggle("text-red-400", over);
  charCount.classList.toggle("text-white/30", !over);
  charLimit.classList.toggle("text-red-400", over);
  charLimit.classList.toggle("text-white/30", !over);
}

function showStatusBadge(text) {
  statusBadge.textContent = text;
  statusBadge.classList.remove("hidden");
  statusBadge.style.opacity = "1";
  setTimeout(() => { statusBadge.style.opacity = "0"; }, 2000);
}

// ── File handling ─────────────────────────────────────────────
fileInput.addEventListener("change", e => handleFiles(e.target.files));
dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

async function handleFiles(files) {
  for (const file of files) {
    try {
      const text = await file.text();
      inputArea.value += `\n\n--- [Файл: ${file.name}] ---\n${text}\n---\n`;
      localStorage.setItem("acoldp_draft", inputArea.value);
    } catch {
      alert(`Не удалось прочитать файл: ${file.name}`);
    }
  }
}

// ── Clear ─────────────────────────────────────────────────────
clearBtn.addEventListener("click", () => {
  if (!inputArea.value.trim()) return;
  if (confirm("Очистить входные данные?")) {
    inputArea.value = "";
    localStorage.removeItem("acoldp_draft");
    resetResults();
  }
});

// ── Demo ────────────────────────────────────────────────────
demoBtn.addEventListener("click", () => {
  inputArea.value = SAMPLE_RAW_INPUT;
  localStorage.setItem("acoldp_draft", inputArea.value);
  updateCharCounter();
  showStatusBadge("✓ Демо-пример загружен");
  inputArea.focus();
});

// ── Main actions ──────────────────────────────────────────────
reportBtn.addEventListener("click", () => sendRequest("REPORT"));
syncBtn.addEventListener("click",   () => sendRequest("JIRA_SYNC"));

convertBtn.addEventListener("click", () => {
  if (!state.lastReport) return;
  inputArea.value = state.lastReport;
  localStorage.setItem("acoldp_draft", state.lastReport);
  sendRequest("JIRA_SYNC");
});

async function sendRequest(mode) {
  const text = inputArea.value.trim();
  if (!text) { alert("Введите или вставьте данные для обработки"); return; }

  // ── Input size guard (prevents long-context degradation) ──
  if (text.length > MAX_INPUT_CHARS) {
    renderError(`Слишком большой объём: ${text.length.toLocaleString("ru-RU")} символов. Лимит — ${MAX_INPUT_CHARS.toLocaleString("ru-RU")}. Сократите текст или разбейте на части.`);
    return;
  }

  setLoading(true);

  // ── Demo mode: no Worker URL configured → show pre-baked result ──
  const workerUrl = localStorage.getItem("acoldp_cfg_worker-url") || "";
  if (!workerUrl) {
    try {
      if (mode === "REPORT") {
        await sleep(900); // brief delay to show loading state
        state.lastReport = SAMPLE_REPORT;
        renderReport(SAMPLE_REPORT);
        renderDemoBanner();
      } else {
        renderError("Демо-режим: синхронизация с Jira недоступна. Чтобы включить — укажите Worker API URL и Jira-креды в ⚙️ Settings.");
      }
    } finally {
      setLoading(false);
    }
    return;
  }

  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        raw_text: text,
        mode,
        selected_model: modelSelect.value,
        user_config: getConfig()
      })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (mode === "REPORT") {
      state.lastReport = data.report_markdown;
      renderReport(data.report_markdown);
    } else {
      renderJiraResults(data);
    }

  } catch (err) {
    renderError(err.message);
  } finally {
    setLoading(false);
  }
}

// ── Rendering ─────────────────────────────────────────────────
function renderReport(markdown) {
  convertBtn.classList.remove("hidden");
  show(resultsContent, `
    <div class="result-card report">
      <div class="result-key mb-2">📋 DAILY REPORT</div>
      <div class="report-text custom-scrollbar">${escHtml(markdown)}</div>
    </div>
  `);
}

function renderJiraResults(data) {
  convertBtn.classList.add("hidden");
  const { stats, results } = data;

  let html = "";

  // Stats bar
  if (stats) {
    html += `
      <div class="stats-bar">
        <div class="stat-item stat-created">
          <div class="stat-num">${stats.created}</div>
          <div class="stat-lbl">Создано</div>
        </div>
        <div class="stat-item stat-updated">
          <div class="stat-num">${stats.updated}</div>
          <div class="stat-lbl">Обновлено</div>
        </div>
        <div class="stat-item stat-commented">
          <div class="stat-num">${stats.commented}</div>
          <div class="stat-lbl">Коммент.</div>
        </div>
        <div class="stat-item stat-errors">
          <div class="stat-num">${stats.errors}</div>
          <div class="stat-lbl">Ошибок</div>
        </div>
      </div>`;
  }

  // Ticket cards
  for (const r of (results || [])) {
    if (r.status === "created") {
      html += `
        <div class="result-card created flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="result-key">🆕 ${r.jira_key} · ${r.issue_type || "Task"} · ${r.priority || ""}</div>
            <div class="result-summary">${escHtml(r.summary)}</div>
          </div>
          <a href="${r.jira_url}" target="_blank" class="result-link shrink-0">Открыть →</a>
        </div>`;
    } else if (r.status === "updated") {
      html += `
        <div class="result-card updated flex items-start gap-3">
          <div class="flex-1">
            <div class="result-key">⬆️ ${r.jira_key} · Приоритет повышен</div>
            <div class="result-meta">${r.old_priority} → <strong class="text-white">${r.new_priority}</strong></div>
          </div>
          <a href="${r.jira_url}" target="_blank" class="result-link shrink-0">Открыть →</a>
        </div>`;
    } else if (r.status === "commented") {
      html += `
        <div class="result-card commented flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="result-key">💬 ${r.jira_key} · Добавлен комментарий</div>
            <div class="result-summary truncate">${escHtml(r.comment_summary || "")}</div>
          </div>
          <a href="${r.jira_url}" target="_blank" class="result-link shrink-0">Открыть →</a>
        </div>`;
    } else {
      html += `
        <div class="result-card error">
          <div class="result-key">❌ Ошибка</div>
          <div class="result-meta" style="color:#ff8080">${escHtml(JSON.stringify(r.error))}</div>
        </div>`;
    }
  }

  if (!results?.length) {
    html += `<div class="text-center py-8 text-white/30 text-sm">Изменений не требуется</div>`;
  }

  show(resultsContent, html);
}

function renderError(msg) {
  show(resultsContent, `
    <div class="result-card error">
      <div class="result-key">❌ Ошибка</div>
      <div class="result-summary">${escHtml(msg)}</div>
    </div>
  `);
}

function renderDemoBanner() {
  const banner = document.createElement("div");
  banner.className = "result-card commented";
  banner.style.borderColor = "#facc15";
  banner.innerHTML = `
    <div class="result-key" style="color:#facc15">ℹ️ Демо-режим</div>
    <div class="result-summary">Показан предзаготовленный результат. Для реальной генерации укажите свой API Key и Worker API URL в ⚙️ Settings.</div>
  `;
  resultsContent.prepend(banner);
}

// ── Loading state ─────────────────────────────────────────────
function setLoading(loading) {
  reportBtn.disabled = loading;
  syncBtn.disabled = loading;

  if (loading) {
    state.processingSeconds = 0;
    resultsPlaceholder.classList.remove("hidden");
    resultsContent.classList.add("hidden");

    state.processingTimer = setInterval(() => {
      state.processingSeconds++;
      const s = state.processingSeconds;
      const hint = s < 10 ? "Анализирую контекст..." :
                   s < 25 ? "Gemini обрабатывает..." :
                   s < 45 ? "Большой текст, подожди..." :
                   "Финализирую результат...";
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, "0");
      const time = mm > 0 ? `${mm}:${ss}` : `${s}с`;

      resultsPlaceholder.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <div class="loading-time">${time}</div>
          <div class="loading-hint">${hint}</div>
        </div>`;
    }, 1000);

    resultsPlaceholder.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <div class="loading-time">0с</div>
        <div class="loading-hint">Запускаю...</div>
      </div>`;
  } else {
    clearInterval(state.processingTimer);
  }
}

function resetResults() {
  resultsContent.classList.add("hidden");
  resultsPlaceholder.classList.remove("hidden");
  resultsPlaceholder.innerHTML = `
    <div class="h-full flex flex-col items-center justify-center text-white/20 gap-3 select-none">
      <span class="material-symbols-outlined text-5xl">auto_awesome</span>
      <p class="text-sm">Результаты появятся здесь</p>
    </div>`;
  convertBtn.classList.add("hidden");
}

function show(el, html) {
  resultsPlaceholder.classList.add("hidden");
  el.innerHTML = html;
  el.classList.remove("hidden");
}

// ── Export ────────────────────────────────────────────────────
copyBtn.addEventListener("click", () => {
  if (!state.lastReport) return;
  navigator.clipboard.writeText(state.lastReport);
  showStatusBadge("✓ Скопировано!");
});

dlMdBtn.addEventListener("click", () => {
  if (!state.lastReport) return;
  const date = new Date().toISOString().slice(0, 10);
  download(`ACOLDP_Report_${date}.md`, state.lastReport, "text/markdown");
});

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Settings ──────────────────────────────────────────────────
settingsBtn.addEventListener("click", () => {
  settingsModal.classList.remove("hidden");
  // Auto-load Jira projects if credentials are already filled in
  const cfg = getConfig();
  if (cfg.jira_domain && cfg.jira_email && cfg.jira_token) loadJiraProjects();
});
settingsClose.addEventListener("click",  () => settingsModal.classList.add("hidden"));
settingsCancel.addEventListener("click", () => settingsModal.classList.add("hidden"));

loadProjectsBtn?.addEventListener("click", loadJiraProjects);

async function loadJiraProjects() {
  const cfg = getConfig();
  const workerUrl = localStorage.getItem("acoldp_cfg_worker-url") || "";
  if (!workerUrl) { showStatusBadge("Укажите Worker API URL"); return; }
  if (!cfg.jira_domain || !cfg.jira_email || !cfg.jira_token) {
    showStatusBadge("Заполните Jira-креды при входе в сессию"); return;
  }

  loadProjectsBtn.disabled = true;
  const sel = $("cfg-jira-project");
  const previouslySelected = sel.value || localStorage.getItem("acoldp_cfg_jira-project") || "";
  sel.innerHTML = `<option value="">Загрузка…</option>`;

  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "JIRA_PROJECTS", user_config: cfg })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const projects = data.projects || [];
    sel.innerHTML = `<option value="">— выберите проект —</option>` +
      projects.map(p => `<option value="${escAttr(p.key)}">${escHtml(p.key)} · ${escHtml(p.name)}</option>`).join("");

    if (previouslySelected && projects.some(p => p.key === previouslySelected)) {
      sel.value = previouslySelected;
    }
    showStatusBadge(projects.length ? `✓ Проектов: ${projects.length}` : "Проекты не найдены");
  } catch (err) {
    sel.innerHTML = `<option value="">— ошибка загрузки —</option>`;
    showStatusBadge("Ошибка загрузки проектов");
    console.error(err);
  } finally {
    loadProjectsBtn.disabled = false;
  }
}

cfgProvider.addEventListener("change", () => {
  baseUrlGroup.classList.toggle("hidden", cfgProvider.value !== "custom");
});

settingsSave.addEventListener("click", () => {
  // Save only non-sensitive settings to localStorage
  const keys = ["provider","base-url","jira-project","worker-url"];
  keys.forEach(k => {
    localStorage.setItem(`acoldp_cfg_${k}`, $(`cfg-${k}`)?.value || "");
  });
  settingsModal.classList.add("hidden");

  // If Worker URL was just set → show session setup overlay
  const hasWorker = !!localStorage.getItem("acoldp_cfg_worker-url");
  if (hasWorker && !state.apiKey) {
    authOverlay.classList.remove("hidden");
  }

  showStatusBadge("✓ Настройки сохранены");
});

function loadSettings() {
  const keys = ["provider","base-url","jira-project","worker-url"];
  keys.forEach(k => {
    const el = $(`cfg-${k}`);
    if (el) el.value = localStorage.getItem(`acoldp_cfg_${k}`) || "";
  });
  baseUrlGroup.classList.toggle("hidden", cfgProvider.value !== "custom");
}

function getConfig() {
  return {
    provider:     localStorage.getItem("acoldp_cfg_provider")     || "google",
    api_key:      state.apiKey,
    base_url:     localStorage.getItem("acoldp_cfg_base-url")     || "",
    jira_domain:  state.jiraDomain,
    jira_project: localStorage.getItem("acoldp_cfg_jira-project") || "",
    jira_email:   state.jiraEmail,
    jira_token:   state.jiraToken
  };
}

// ── Helpers ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(str) {
  return escHtml(str).replace(/"/g, "&quot;");
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
