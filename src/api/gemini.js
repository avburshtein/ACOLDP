// ============================================================
// AI Context Orchestrator — LLM Universal Caller
// Supports: Google Gemini (native) + OpenAI-compatible APIs
// ============================================================

// Fallback chain for Google — only verified production models
const GOOGLE_FALLBACK_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

/**
 * Universal LLM caller with provider switching and fallback
 * @param {string} provider - 'google' | 'alibaba' | 'openai' | 'custom'
 * @param {string} baseUrl  - Custom base URL (for 'custom' provider)
 * @param {string} apiKey   - API key
 * @param {string} model    - Model name or 'AUTO' for fallback chain
 * @param {string} systemPrompt - System instruction
 * @param {string} userText - User input
 * @param {object} schema   - JSON schema for structured output (optional)
 * @returns {Promise<string>} - Raw text response
 */
export async function callLLM(provider, baseUrl, apiKey, model, systemPrompt, userText, schema = {}) {
  if (provider === 'google') {
    return callGoogle(apiKey, model, systemPrompt, userText, schema);
  } else {
    return callOpenAICompatible(provider, baseUrl, apiKey, model, systemPrompt, userText, schema);
  }
}

// ── Google Gemini (Native API) ───────────────────────────────
async function callGoogle(apiKey, model, systemPrompt, userText, schema) {
  const models = (model && model !== "AUTO")
    ? [model]
    : GOOGLE_FALLBACK_MODELS;

  const hasSchema = schema && Object.keys(schema).length > 0;

  let lastError = "";

  for (const m of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const body = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userText }] }],
          generationConfig: {
            thinkingConfig: { thinkingBudget: 0 }, // disable thinking for speed
            ...(hasSchema && {
              response_mime_type: "application/json",
              response_schema: schema
            })
          }
        };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        // Overloaded — wait and retry
        if (res.status === 503) {
          lastError = `[${m}] 503 перегрузка`;
          await sleep(1500);
          continue;
        }

        // Quota exhausted or model not found — try next model
        if (res.status === 429 || res.status === 404) {
          const reason = res.status === 429 ? "квота исчерпана" : "модель не найдена";
          lastError = `[${m}] ${res.status} ${reason}`;
          break;
        }

        if (!res.ok) {
          const errText = await res.text();
          lastError = `[${m}] ${res.status}: ${errText.slice(0, 200)}`;
          break;
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;

        lastError = `[${m}] Empty response`;
      } catch (e) {
        lastError = e.message;
      }
    }
  }

  throw new Error(`Gemini: все модели недоступны (${lastError}). Проверьте ключ: https://aistudio.google.com/apikey`);
}

// ── OpenAI-Compatible (Alibaba/Qwen, OpenAI, Custom) ────────
async function callOpenAICompatible(provider, baseUrl, apiKey, model, systemPrompt, userText, schema) {
  const BASE_URLS = {
    alibaba: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    openai: "https://api.openai.com/v1",
    custom: baseUrl
  };

  const finalBaseUrl = BASE_URLS[provider] || baseUrl;
  if (!finalBaseUrl) throw new Error("Base URL не указан в настройках для Custom провайдера");

  const DEFAULT_MODELS = {
    alibaba: "qwen-max",
    openai: "gpt-4o-mini",
    custom: "gpt-4o-mini"
  };

  const finalModel = (model && model !== "AUTO") ? model : (DEFAULT_MODELS[provider] || "gpt-4o-mini");
  const url = `${finalBaseUrl.replace(/\/$/, "")}/chat/completions`;

  const hasSchema = schema && Object.keys(schema).length > 0;
  const systemContent = hasSchema
    ? `${systemPrompt}\n\nCRITICAL: Output ONLY valid JSON matching this schema:\n${JSON.stringify(schema)}`
    : systemPrompt;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: finalModel,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userText }
      ],
      ...(hasSchema && { response_format: { type: "json_object" } })
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[${provider.toUpperCase()}] API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Helpers ─────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
