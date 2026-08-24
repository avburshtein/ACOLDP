// ============================================================
// AI Context Orchestrator — LLM Universal Caller
// Supports: Google Gemini (native) + OpenAI-compatible APIs
// ============================================================

/**
 * Universal LLM caller with provider switching and fallback
 * @param {string} provider - 'google' | 'alibaba' | 'openai' | 'custom'
 * @param {string} baseUrl  - Custom base URL (for 'custom' provider)
 * @param {string} apiKey   - API key
 * @param {string} model    - Model name or 'AUTO' for auto-discovery
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
  const hasSchema = schema && Object.keys(schema).length > 0;

  // ── If user specified a model → use it directly (single attempt, no fallback) ──
  if (model && model !== "AUTO") {
    return callGeminiModel(apiKey, model, systemPrompt, userText, hasSchema, schema);
  }

  // ── AUTO: discover available models dynamically from the API key ──
  const availableModels = await fetchAvailableGeminiModels(apiKey);
  if (availableModels.length === 0) {
    throw new Error("Gemini: не найдено ни одной доступной модели. Проверьте ключ: https://aistudio.google.com/apikey");
  }

  // Prefer flash models, sorted by recency (higher generation = preferred)
  const flashModels = availableModels.filter(m => m.includes("flash"));
  const candidates = flashModels.length > 0 ? flashModels : availableModels;

  let lastError = "";
  for (const m of candidates) {
    try {
      return await callGeminiModel(apiKey, m, systemPrompt, userText, hasSchema, schema);
    } catch (e) {
      lastError = e.message;
      // If this model is overloaded/quota-exceeded, try next
      if (!lastError.includes("503") && !lastError.includes("429")) throw e;
    }
  }

  throw new Error(`Gemini: все модели недоступны (${lastError})`);
}

async function callGeminiModel(apiKey, modelName, systemPrompt, userText, hasSchema, schema) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const genConfig = {};
      // Skip thinkingConfig for older/lightweight models — they don't support it
      if (!modelName.includes("lite") && !modelName.includes("1.5") && !modelName.includes("1.0")) {
        genConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      if (hasSchema) {
        genConfig.response_mime_type = "application/json";
        genConfig.response_schema = schema;
      }

      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userText }] }],
        generationConfig: genConfig
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      // 400 INVALID_ARGUMENT — retry without thinkingConfig
      if (res.status === 400 && genConfig.thinkingConfig) {
        const errText = await res.text();
        if (errText.includes("INVALID_ARGUMENT")) {
          const res2 = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, generationConfig: { response_mime_type: genConfig.response_mime_type, response_schema: genConfig.response_schema } })
          });
          if (!res2.ok) {
            const errText2 = await res2.text();
            throw new Error(`[${modelName}] ${res2.status}: ${errText2.slice(0, 200)}`);
          }
          const data2 = await res2.json();
          const text2 = data2.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text2) return text2;
          throw new Error(`[${modelName}] пустой ответ`);
        }
        throw new Error(`[${modelName}] ${res.status}: ${errText.slice(0, 200)}`);
      }

      if (res.status === 503) {
        if (attempt < 2) { await sleep(1500); continue; }
        throw new Error(`[${modelName}] 503 перегрузка`);
      }

      if (res.status === 429) throw new Error(`[${modelName}] 429 квота исчерпана`);
      if (res.status === 404) throw new Error(`[${modelName}] 404 модель не найдена`);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`[${modelName}] ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      throw new Error(`[${modelName}] пустой ответ`);
    } catch (e) {
      if (attempt < 2 && (e.message.includes("503") || e.message.includes("перегрузка"))) continue;
      throw e;
    }
  }

  throw new Error(`[${modelName}] все попытки исчерпаны`);
}

// ── Dynamic model discovery ──────────────────────────────────
async function fetchAvailableGeminiModels(apiKey) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name.replace("models/", ""))
      .filter(name => !name.includes("vision") && !name.includes("embedding") && !name.includes("aqa"))
      // Sort: flash first, then by generation number descending
      .sort((a, b) => {
        const aFlash = a.includes("flash") ? 1 : 0;
        const bFlash = b.includes("flash") ? 1 : 0;
        if (aFlash !== bFlash) return bFlash - aFlash;
        return b.localeCompare(a); // higher version first
      });
    return models;
  } catch (e) {
    console.error("Failed to fetch Gemini models:", e.message);
    return [];
  }
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
