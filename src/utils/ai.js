import { useState, useRef, useEffect, useCallback, createContext, useContext } from "react";

// ─── AI Provider ─────────────────────────────────────────────────────────────
// Reads provider + keys from window.__smai_settings (synced by App on every settings change)
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
const GEMINI_MODELS = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"];

async function callAI(userPrompt, system = "You are Study Mate AI, a brilliant academic assistant. Be concise and helpful. Never use markdown symbols like # or **.", maxTokens = 2000) {
  const cfg = window.__smai_settings || {};
  const provider = cfg.provider || "claude";

  // ── Groq (Free) ──────────────────────────────────────────────────────────
  if (provider === "groq") {
    const apiKey = cfg.groqKey || "";
    if (!apiKey) throw new Error("Groq API key not set. Go to Settings → AI Provider → Groq.");
    const model = cfg.groqModel || GROQ_MODELS[0];
    // Groq free tier: 12,000 TPM - cap tokens and retry on rate limit
    const groqMaxTokens = Math.min(maxTokens, 1500);
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model, max_tokens: groqMaxTokens, messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }] }),
      });
      const data = await res.json();
      if (data.error?.code === "rate_limit_exceeded" || res.status === 429) {
        const retryMatch = data.error?.message?.match(/try again in ([\d.]+)s/i);
        const waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500 : (attempt + 1) * 6000;
        if (attempt < 3) { await delay(waitMs); continue; }
        throw new Error("Groq rate limit hit. Please wait a moment and try again, or switch to Claude in Settings.");
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data.choices?.[0]?.message?.content || "";
    }
  }

  // ── OpenAI (ChatGPT) ─────────────────────────────────────────────────────
  if (provider === "openai") {
    const apiKey = cfg.openaiKey || "";
    if (!apiKey) throw new Error("OpenAI API key not set. Go to Settings → AI Provider → ChatGPT.");
    const model = cfg.openaiModel || OPENAI_MODELS[0];
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }] }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.choices?.[0]?.message?.content || "";
  }

  // ── Google Gemini ─────────────────────────────────────────────────────────
  if (provider === "gemini") {
    const apiKey = cfg.geminiKey || "";
    if (!apiKey) throw new Error("Gemini API key not set. Go to Settings → AI Provider → Gemini.");
    const model = cfg.geminiModel || GEMINI_MODELS[0];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  // ── Claude / Anthropic (default) ──────────────────────────────────────────
  const apiKey = cfg.claudeKey || "";
  if (!apiKey) throw new Error("Claude API key not set. Go to Settings → AI Provider → Claude.");
  const res = await fetch("/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system, messages: [{ role: "user", content: userPrompt }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || "";
}

// Alias — all existing callClaude calls still work
const callClaude = callAI;

// ─── Chunked summarization for large texts ────────────────────────────────────
// Splits text into ~6000 char chunks, summarizes each, then combines into final summary
async function summarizeLargeText(text, mode = "points") {
  const cfg = window.__smai_settings || {};
  const provider = cfg.provider || "claude";
  const isGroq = provider === "groq";

  // Groq free tier has strict TPM limits — use smaller chunks and sequential calls
  const CHUNK_SIZE = isGroq ? 3000 : 6000;
  const CHUNK_TOKENS = isGroq ? 800 : 1500;
  const FINAL_TOKENS = isGroq ? 1200 : 3000;
  const DELAY_MS = isGroq ? 5000 : 0; // 5s between Groq calls to avoid TPM limit

  const modePrompt = mode === "points"
    ? "as clear bullet points using plain dashes, no markdown"
    : "as a concise paragraph";

  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  if (text.length <= CHUNK_SIZE) {
    return callAI(
      `Summarize the following study material ${modePrompt}. Plain text only, no # or ** symbols:\n\n${text}`,
      "You are Study Mate AI, a brilliant academic assistant. Be concise and helpful. Never use markdown symbols like # or **.",
      FINAL_TOKENS
    );
  }

  // Split into chunks
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }

  // Summarize chunks — sequential for Groq (rate limit), parallel for others
  const chunkSummaries = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0 && DELAY_MS > 0) await delay(DELAY_MS);
    const summary = await callAI(
      `Summarize this section (part ${i + 1} of ${chunks.length}) of a study document. Extract key points only, plain text, no markdown:\n\n${chunks[i]}`,
      "You are Study Mate AI. Extract only the most important information. Plain text, no markdown.",
      CHUNK_TOKENS
    );
    chunkSummaries.push(summary);
  }

  // Combine into final summary
  if (DELAY_MS > 0) await delay(DELAY_MS);
  const combined = chunkSummaries.join("\n\n");
  return callAI(
    `Here are section-by-section summaries of a study document. Combine them into one unified, well-organized summary ${modePrompt}. Remove repetition. Plain text only, no # or ** symbols:\n\n${combined}`,
    "You are Study Mate AI, a brilliant academic assistant. Be concise and helpful. Never use markdown symbols like # or **.",
    FINAL_TOKENS
  );
}


export { callAI, callClaude, summarizeLargeText };
