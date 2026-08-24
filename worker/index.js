// ============================================================
// AI Context Orchestrator — Cloudflare Worker (API only)
// Проект: ACOLDP | avburshtein.atlassian.net
//
// ENV variables (set in Cloudflare Dashboard → Settings → Variables):
//   SECRET_KEY     — access password for the UI
//   GEMINI_API_KEY — Google AI Studio API key
//   JIRA_DOMAIN    — avburshtein.atlassian.net
//   JIRA_PROJECT   — ACOLDP
//   JIRA_EMAIL     — av.burshtein@gmail.com
//   JIRA_TOKEN     — Atlassian API token
// ============================================================

import { callLLM } from "../src/api/gemini.js";
import { fetchProjects, fetchOpenTickets, processAction } from "../src/api/jira.js";
import {
  REPORT_SYSTEM_INSTRUCTION,
  DEDUP_SYSTEM_INSTRUCTION,
  DEDUP_JSON_SCHEMA
} from "../src/api/prompts.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Secret-Key"
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

    // Auth
    if (request.headers.get("X-Secret-Key") !== env.SECRET_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      const body = await request.json();
      const { raw_text, mode, selected_model, user_config: uCfg = {} } = body;

      // Resolve config: UI settings override env vars
      const provider = uCfg.provider || "google";
      const baseUrl  = uCfg.base_url || "";
      const apiKey   = uCfg.api_key  || env.GEMINI_API_KEY;
      const model    = selected_model || "AUTO";

      const jiraCfg = {
        domain:  uCfg.jira_domain  || env.JIRA_DOMAIN,
        project: uCfg.jira_project || env.JIRA_PROJECT,
        email:   uCfg.jira_email   || env.JIRA_EMAIL,
        token:   uCfg.jira_token   || env.JIRA_TOKEN
      };

      // ── MODE: JIRA_PROJECTS ─────────────────────────────────
      // Returns the list of accessible Jira projects for the dropdown.
      // Does NOT require raw_text or an LLM key.
      if (mode === "JIRA_PROJECTS") {
        const projects = await fetchProjects(jiraCfg);
        return json({ success: true, projects });
      }

      if (!raw_text) throw new Error("raw_text is required");
      if (!apiKey) throw new Error("API Key не задан. Откройте ⚙️ Settings.");

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

      // 4. Execute actions in Jira
      const results = await Promise.allSettled(
        actions.map(act => processAction(act, jiraCfg))
      );

      const finalResults = results.map(r =>
        r.status === "fulfilled" ? r.value : { status: "error", error: r.reason?.message }
      );

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
