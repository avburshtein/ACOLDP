// ============================================================
// AI Context Orchestrator — Cloudflare Worker (API only)
// Проект: ACOLDP
//
// ENV variables (set in Cloudflare Dashboard → Settings → Variables):
//   None required — all credentials come from user's session.
//   Worker acts as a transparent proxy to LLM and Jira APIs.
// ============================================================

import { callLLM } from "../src/api/gemini.js";
import { fetchProjects, fetchOpenTickets, processActionsThrottled } from "../src/api/jira.js";
import {
  REPORT_SYSTEM_INSTRUCTION,
  DEDUP_SYSTEM_INSTRUCTION,
  DEDUP_JSON_SCHEMA
} from "../src/api/prompts.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // Only POST
    if (request.method !== "POST") {
      return json({ error: "Only POST allowed" }, 405);
    }

    try {
      const body = await request.json();
      const { raw_text, mode, selected_model, user_config: uCfg = {} } = body;

      // All credentials come from user — no server-side env fallbacks
      const provider = uCfg.provider || "";
      const baseUrl  = uCfg.base_url || "";
      const apiKey   = uCfg.api_key || "";
      const model    = selected_model || "AUTO";

      // Validate provider is set
      if (!provider && mode !== "JIRA_PROJECTS") {
        return json({ error: "Провайдер не выбран. Укажите LLM Provider при входе в сессию." }, 400);
      }

      const jiraCfg = {
        domain:  uCfg.jira_domain  || "",
        project: uCfg.jira_project || "",
        email:   uCfg.jira_email   || "",
        token:   uCfg.jira_token   || ""
      };

      // ── MODE: JIRA_PROJECTS ─────────────────────────────────
      // Returns the list of accessible Jira projects for the dropdown.
      // Does NOT require raw_text or an LLM key.
      if (mode === "JIRA_PROJECTS") {
        const projects = await fetchProjects(jiraCfg);
        return json({ success: true, projects });
      }

      if (!raw_text) throw new Error("raw_text is required");
      if (!apiKey) throw new Error("API Key не задан. Укажите его при входе в сессию.");

      // Validate model/provider compatibility
      const modelLower = (model || "").toLowerCase();
      if (provider === "google" && modelLower.includes("qwen")) {
        return json({ error: `Модель '${model}' несовместима с провайдером Google Gemini. Переключите провайдер на Alibaba (Qwen) при входе в сессию.` }, 400);
      }
      if (provider === "alibaba" && modelLower.includes("gemini")) {
        return json({ error: `Модель '${model}' несовместима с провайдером Alibaba. Переключите провайдер на Google Gemini.` }, 400);
      }

      // Server-side input guard (defense in depth against long-context degradation)
      const MAX_INPUT_CHARS = 15000;
      const inputText = String(raw_text);
      if (inputText.length > MAX_INPUT_CHARS) {
        return json({ error: `Входной текст превышает лимит (${inputText.length} > ${MAX_INPUT_CHARS} символов). Сократите или разбейте на части.` }, 413);
      }

      // ── MODE: REPORT ────────────────────────────────────────
      if (mode === "REPORT") {
        const markdown = await callLLM(
          provider, baseUrl, apiKey, model,
          REPORT_SYSTEM_INSTRUCTION,
          raw_text,
          {} // no schema — free-form markdown
        );
        return json({ success: true, report_markdown: markdown });
      }

      // ── MODE: JIRA_SYNC ─────────────────────────────────────
      // 1. Fetch existing open tickets for deduplication context
      const existingTickets = await fetchOpenTickets(jiraCfg);

      // 2. Build prompt with backlog context
      const prompt = [
        "EXISTING OPEN JIRA TICKETS (for deduplication):",
        JSON.stringify(existingTickets, null, 2),
        "",
        "NEW INPUT TO PROCESS:",
        raw_text
      ].join("\n");

      // 3. Call LLM → get structured actions
      const outputText = await callLLM(
        provider, baseUrl, apiKey, model,
        DEDUP_SYSTEM_INSTRUCTION,
        prompt,
        DEDUP_JSON_SCHEMA
      );

      const actions = JSON.parse(outputText).actions || [];

      // 4. Execute actions in Jira — строго последовательно с паузой:
      // одновременный залп записей ловит burst rate-limit Atlassian (HTTP 429)
      // и повышает риск CAPTCHA-блокировки IP.
      const finalResults = await processActionsThrottled(actions, jiraCfg);

      // 5. Summary stats
      const stats = {
        total: finalResults.length,
        created:   finalResults.filter(r => r.status === "created").length,
        updated:   finalResults.filter(r => r.status === "updated").length,
        commented: finalResults.filter(r => r.status === "commented").length,
        errors:    finalResults.filter(r => r.status === "error").length
      };

      return json({ success: true, stats, results: finalResults });

    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};

// ── Helper ───────────────────────────────────────────────────
const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
