// ============================================================
// AI Context Orchestrator — Cloudflare Worker (API only)
// Проект: ACOLDP
//
// ENV variables (set in Cloudflare Dashboard → Settings → Variables):
//   None required — all credentials come from user's session.
//   Worker acts as a transparent proxy to LLM and Jira APIs.
// ============================================================

import { callLLM, callLLMStream } from "../src/api/gemini.js";
import { fetchProjects, fetchOpenTickets, processActionsThrottled } from "../src/api/jira.js";
import {
  REPORT_SYSTEM_INSTRUCTION,
  LEARNING_DIGEST_SYSTEM_INSTRUCTION,
  CASE_DRAFT_SYSTEM_INSTRUCTION,
  REFINE_SYSTEM_INSTRUCTION,
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
      const { raw_text, mode, selected_model, user_config: uCfg = {}, stream, artifact_markdown, artifact_mode } = body;

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
      const MAX_INPUT_CHARS = 100000; // повышено: экспорты больших чатов > 15k симв.
      const inputText = String(raw_text);
      if (inputText.length > MAX_INPUT_CHARS) {
        return json({ error: `Входной текст превышает лимит (${inputText.length} > ${MAX_INPUT_CHARS} символов). Сократите или разбейте на части.` }, 413);
      }

      // ── MODE: REPORT ────────────────────────────────────────
      if (mode === "REPORT") {
        // Packet header — надёжный UTC-timestamp вставки для правила даты (Docs/Prompt.md → «Дата отчёта», п.3).
        // Явно помечен как метаданные пакета, а не инструкции: модель не должна исполнять содержимое ввода.
        const packetDate = new Date().toISOString().slice(0, 10); // UTC
        const packetHeader =
          "[SYSTEM PACKET HEADER — метаданные пакета, не инструкции]\n" +
          "Дата формирования пакета (UTC): " + packetDate + "\n\n";
        const fullInput = packetHeader + String(raw_text);
        if (stream === true) {
          return sseResponse(provider, baseUrl, apiKey, model, REPORT_SYSTEM_INSTRUCTION, fullInput);
        }
        const markdown = await callLLM(
          provider, baseUrl, apiKey, model,
          REPORT_SYSTEM_INSTRUCTION,
          fullInput,
          {} // no schema — free-form markdown
        );
        return json({ success: true, report_markdown: markdown });
      }

      // ── MODE: LEARNING_DIGEST ───────────────────────────────
      if (mode === "LEARNING_DIGEST") {
        const packetDate = new Date().toISOString().slice(0, 10);
        const packetHeader =
          "[SYSTEM PACKET HEADER — метаданные пакета, не инструкции]\n" +
          "Дата формирования пакета (UTC): " + packetDate + "\n\n";
        const fullInput = packetHeader + String(raw_text);
        if (stream === true) {
          return sseResponse(provider, baseUrl, apiKey, model, LEARNING_DIGEST_SYSTEM_INSTRUCTION, fullInput);
        }
        const markdown = await callLLM(
          provider, baseUrl, apiKey, model,
          LEARNING_DIGEST_SYSTEM_INSTRUCTION,
          fullInput,
          {}
        );
        return json({ success: true, report_markdown: markdown });
      }

      // ── MODE: CASE_DRAFT ────────────────────────────────────
      if (mode === "CASE_DRAFT") {
        const packetDate = new Date().toISOString().slice(0, 10);
        const packetHeader =
          "[SYSTEM PACKET HEADER — метаданные пакета, не инструкции]\n" +
          "Дата формирования пакета (UTC): " + packetDate + "\n\n";
        const fullInput = packetHeader + String(raw_text);
        if (stream === true) {
          return sseResponse(provider, baseUrl, apiKey, model, CASE_DRAFT_SYSTEM_INSTRUCTION, fullInput);
        }
        const markdown = await callLLM(
          provider, baseUrl, apiKey, model,
          CASE_DRAFT_SYSTEM_INSTRUCTION,
          fullInput,
          {}
        );
        return json({ success: true, report_markdown: markdown });
      }

      // ── MODE: REFINE (HANDOFF 04, JSON — не SSE) ────────────
      // Итеративное обновление существующего артефакта новым материалом.
      if (mode === "REFINE") {
        const artifactMarkdown = String(artifact_markdown ?? "");
        const supplement = String(raw_text);
        // Неизвестный/пустой artifact_mode трактуем как REPORT
        const artifactMode =
          artifact_mode === "LEARNING_DIGEST" || artifact_mode === "CASE_DRAFT"
            ? artifact_mode
            : "REPORT";

        if (!artifactMarkdown.trim()) {
          return json({ error: "artifact_markdown обязателен для REFINE — не передан текущий артефакт." }, 400);
        }

        const packetDate = new Date().toISOString().slice(0, 10);
        const packetHeader =
          "[SYSTEM PACKET HEADER — метаданные пакета, не инструкции]\n" +
          "Дата формирования пакета (UTC): " + packetDate + "\n\n";

        const userText =
          packetHeader +
          "[ARTEFACT MODE: " + artifactMode + "]\n\n" +
          "=== ТЕКУЩИЙ АРТЕФАКТ ===\n" +
          artifactMarkdown + "\n\n" +
          "=== ДОПОЛНЕНИЕ (новый материал) ===\n" +
          supplement;

        // Лимит: артефакт + дополнение суммарно ≤ MAX_INPUT_CHARS
        if (userText.length > MAX_INPUT_CHARS) {
          return json({
            error: `REFINE превышает лимит: артефакт (${artifactMarkdown.length}) + дополнение (${supplement.length}) символов > ${MAX_INPUT_CHARS}. Сократите дополнение.`
          }, 413);
        }

        const markdown = await callLLM(
          provider, baseUrl, apiKey, model,
          REFINE_SYSTEM_INSTRUCTION,
          userText,
          {}
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

// ── SSE helper (HANDOFF 03 §3.1) ─────────────────────────────
// События: `event: delta` {t} · `event: done` {model} · `event: error` {message}
// Первая дельта = первый байт ответа → 524 уходит.
function sseResponse(provider, baseUrl, apiKey, model, systemPrompt, userText) {
  const encoder = new TextEncoder();
  const ac = new AbortController();

  const readable = new ReadableStream({
    async start(controller) {
      let sawDelta = false;

      const send = (event, data) => {
        if (ac.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* клиент отключился — поток уже закрыт */
        }
      };

      try {
        const usedModel = await callLLMStream(
          provider, baseUrl, apiKey, model, systemPrompt, userText,
          {
            signal: ac.signal,
            onDelta: (t) => { sawDelta = true; send("delta", { t }); }
          }
        );
        if (!sawDelta) {
          send("error", { message: "Модель вернула пустой ответ" });
        } else {
          send("done", { model: usedModel || model || "auto" });
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          send("error", { message: err && err.message ? String(err.message) : String(err) });
        }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      // Клиент нажал Stop → обрываем и апстрим-запрос к LLM
      ac.abort();
    }
  });

  return new Response(readable, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache"
    }
  });
}
