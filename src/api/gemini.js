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
    // Диагностика: provider/model + HTTP статус + первые 400 символов тела
    throw new Error(`[${provider}/${finalModel}] HTTP ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Streaming (SSE) ──────────────────────────────────────────
// Тот же контракт ошибок, что и у callLLM: [<provider>/<model>] HTTP <status>: <body ≤400>.
// Схема (schema) в стриминге не используется — только свободный текст.

const SSE_DONE = "[DONE]";

/**
 * Построчный SSE-парсер: буферизует частичные строки (чанк может рваться
 * посреди JSON), нормализует CRLF, отдаёт payload каждой строки `data:`.
 * События без `data:` и пустые строки пропускаются.
 */
async function streamSSE(res, onPayload) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === SSE_DONE) continue;
        onPayload(payload);
      }
    }
    // Флаш последней строки, если поток закрылся без завершающего \n
    if (buffer.startsWith("data:")) {
      const payload = buffer.slice(5).trim();
      if (payload && payload !== SSE_DONE) onPayload(payload);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

/** Текстовый чанк ответа Gemini: конкатенация ВСЕХ parts[].text. */
function geminiChunkText(chunk) {
  const parts = chunk && chunk.candidates && chunk.candidates[0] &&
    chunk.candidates[0].content && chunk.candidates[0].content.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("");
}

/**
 * Стриминговый вызов LLM: дельты текста отдаются в onDelta сразу по мере генерации.
 * @param {string} provider - 'google' | 'alibaba' | 'openai' | 'custom'
 * @param {(text: string) => void} onDelta - колбэк на каждый текстовый чанк
 * @param {AbortSignal} signal - отмена (Stop)
 * @returns {Promise<string>} имя фактически использованной модели
 */
export async function callLLMStream(provider, baseUrl, apiKey, model, systemPrompt, userText, { onDelta, signal } = {}) {
  const emit = typeof onDelta === "function" ? onDelta : () => {};
  if (provider === "google") {
    return callGoogleStream(apiKey, model, systemPrompt, userText, emit, signal);
  }
  return callOpenAICompatibleStream(provider, baseUrl, apiKey, model, systemPrompt, userText, emit, signal);
}

async function callGoogleStream(apiKey, model, systemPrompt, userText, onDelta, signal) {
  // Явная модель → одна попытка, без fallback
  if (model && model !== "AUTO") {
    return callGeminiStream(apiKey, model, systemPrompt, userText, onDelta, signal);
  }

  // AUTO: discovery + перебор моделей, но только ДО первой дельты
  const availableModels = await fetchAvailableGeminiModels(apiKey);
  if (availableModels.length === 0) {
    throw new Error("Gemini: не найдено ни одной доступной модели. Проверьте ключ: https://aistudio.google.com/apikey");
  }
  const flashModels = availableModels.filter((m) => m.includes("flash"));
  const candidates = flashModels.length > 0 ? flashModels : availableModels;

  let lastError = "";
  for (const m of candidates) {
    let emitted = false;
    const track = (t) => { emitted = true; onDelta(t); };
    try {
      return await callGeminiStream(apiKey, m, systemPrompt, userText, track, signal);
    } catch (e) {
      if ((e && e.name === "AbortError") || (signal && signal.aborted)) throw e;
      lastError = (e && e.message) || String(e);
      if (emitted) throw e; // после первой дельты fallback запрещён
      if (!lastError.includes("503") && !lastError.includes("429")) throw e;
    }
  }
  throw new Error(`Gemini: все модели недоступны (${lastError})`);
}

async function callGeminiStream(apiKey, modelName, systemPrompt, userText, onDelta, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const genConfig = {};
  // Skip thinkingConfig for older/lightweight models — they don't support it
  if (!modelName.includes("lite") && !modelName.includes("1.5") && !modelName.includes("1.0")) {
    genConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userText }] }],
      generationConfig: genConfig
    }),
    signal
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[google/${modelName}] HTTP ${res.status}: ${errText.slice(0, 400)}`);
  }

  let blocked = "";
  // Gemini при alt=sse не присылает [DONE]: конец потока = завершение чтения
  await streamSSE(res, (payload) => {
    let chunk;
    try { chunk = JSON.parse(payload); } catch { return; } // устойчивость к глюкам провайдера
    const text = geminiChunkText(chunk);
    if (text) { onDelta(text); return; }
    const candidate = chunk && chunk.candidates && chunk.candidates[0];
    const reason = (chunk && chunk.promptFeedback && chunk.promptFeedback.blockReason) ||
      (candidate && candidate.finishReason === "SAFETY" ? "SAFETY" : "");
    if (reason) blocked = reason;
  });

  if (blocked) throw new Error(`[google/${modelName}] ответ заблокирован: ${blocked}`);
  return modelName;
}

async function callOpenAICompatibleStream(provider, baseUrl, apiKey, model, systemPrompt, userText, onDelta, signal) {
  const BASE_URLS = {
    alibaba: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    openai: "https://api.openai.com/v1",
    custom: baseUrl
  };

  const finalBaseUrl = BASE_URLS[provider] || baseUrl;
  if (!finalBaseUrl) throw new Error("Base URL не указан в настройках для Custom провайдера");

  const DEFAULT_MODELS = { alibaba: "qwen-max", openai: "gpt-4o-mini", custom: "gpt-4o-mini" };
  const finalModel = (model && model !== "AUTO") ? model : (DEFAULT_MODELS[provider] || "gpt-4o-mini");
  const url = `${finalBaseUrl.replace(/\/$/, "")}/chat/completions`;

  const payload = {
    model: finalModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ],
    stream: true
  };

  let emitted = false;
  const attempt = async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      // Диагностика (кейс GLM 500): provider/model + статус + тело ответа API
      throw new Error(`[${provider}/${finalModel}] HTTP ${res.status}: ${errText.slice(0, 400)}`);
    }

    await streamSSE(res, (raw) => {
      let chunk;
      try { chunk = JSON.parse(raw); } catch { return; }
      const delta = chunk && chunk.choices && chunk.choices[0] &&
        chunk.choices[0].delta && chunk.choices[0].delta.content;
      if (typeof delta === "string" && delta) { emitted = true; onDelta(delta); }
    });
  };

  try {
    await attempt();
  } catch (e) {
    if ((e && e.name === "AbortError") || (signal && signal.aborted)) throw e;
    // Один ретрай при HTTP 5xx/429 — только до первой дельты
    const status = (String(e && e.message).match(/HTTP (\d{3})/) || [])[1];
    const retriable = !!status && (status.startsWith("5") || status === "429");
    if (!emitted && retriable) {
      await sleep(800);
      await attempt();
    } else {
      throw e;
    }
  }
  return finalModel;
}

// ── Helpers ─────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
