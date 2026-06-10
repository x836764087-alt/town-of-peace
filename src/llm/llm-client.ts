/**
 * LLM Client — OpenAI-compatible API wrapper with multi-key failover,
 * rate-limiting, and timeout control.
 */

import { ENV } from '../config/env';

// ─── Types ────────────────────────────────────────────────────────────

/** Response envelope from the LLM client. */
export interface LLMResponse {
  content: string;
  tokensUsed: number;
  durationMs: number;
  success: boolean;
}

/** A single call inside a batch. */
export interface BatchCall {
  messages: { role: string; content: string }[];
  id: string;
}

// ─── Constants ────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;
const KEY_COOLDOWN_MS = 30_000;

// ─── Internal response shape (OpenAI-like) ────────────────────────────

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string; type?: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Build the request payload for an OpenAI-compatible endpoint. */
function buildPayload(
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number },
): Record<string, unknown> {
  const body: Record<string, unknown> = { model: '', messages: [] };
  body.model = ''; // filled by caller with this.model
  body.messages = messages;
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.maxTokens !== undefined) body.maxTokens = options.maxTokens;
  return body;
}

// ─── Class ────────────────────────────────────────────────────────────

/**
 * LLMClient manages a pool of API keys with automatic failover,
 * per-key cooldown after failures, rate-limiting, and request timeout.
 */
export class LLMClient {
  private baseUrl: string;
  private apiKeys: string[];
  private model: string;
  private rpm: number;
  private keyIndex = 0;
  private coolingUntil: Map<number, number> = new Map();
  private lastCallTime = 0;

  constructor(config: {
    baseUrl: string;
    apiKeys: string[];
    model: string;
    rpm: number;
  }) {
    this.baseUrl = config.baseUrl;
    this.apiKeys = config.apiKeys;
    this.model = config.model;
    this.rpm = config.rpm;
  }

  // ── Rate-limit helper ─────────────────────────────────────────────

  /** Wait until enough time has elapsed since the last call. */
  private async waitUntilNextSlot(): Promise<void> {
    const minIntervalMs = 60_000 / this.rpm;
    const elapsed = Date.now() - this.lastCallTime;
    if (elapsed < minIntervalMs) {
      const waitMs = minIntervalMs - elapsed;
      await this.sleep(waitMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Key rotation helpers ──────────────────────────────────────────

  /** Pick the next available key index, skipping keys that are cooling down. */
  private nextKeyIndex(): number | null {
    const len = this.apiKeys.length;
    if (len === 0) return null;

    let attempts = 0;
    while (attempts < len) {
      const idx = this.keyIndex % len;
      const cooldownUntil = this.coolingUntil.get(idx);
      if (!cooldownUntil || Date.now() >= cooldownUntil) {
        // Found a usable key
        return idx;
      }
      this.keyIndex = (idx + 1) % len;
      attempts++;
    }
    // All keys are cooling down
    return null;
  }

  /** Mark a key as cooling down for 30 seconds. */
  private coolDownKey(index: number): void {
    this.coolingUntil.set(index, Date.now() + KEY_COOLDOWN_MS);
  }

  // ── Single chat call ──────────────────────────────────────────────

  /**
   * Send a chat request with automatic key failover.
   */
  async chat(
    messages: { role: string; content: string }[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<LLMResponse> {
    await this.waitUntilNextSlot();

    const len = this.apiKeys.length;
    if (len === 0) {
      return this.fallbackResponse(0);
    }

    const base = this.baseUrl;
    const payload = buildPayload(messages, options);

    // Track which keys we've already tried (starting from keyIndex)
    const tried = new Set<number>();
    let bestErrorDuration = 0;

    while (tried.size < len) {
      const idx = this.nextKeyIndex();
      if (idx === null) break;

      tried.add(idx);
      const apiKey = this.apiKeys[idx];
      const url = `${base}/chat/completions`;

      // Clone payload to avoid mutation
      const body = { ...payload };
      (body as Record<string, unknown>).model = this.model;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        const startMs = Date.now();

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const durationMs = Date.now() - startMs;

        if (response.ok) {
          this.lastCallTime = Date.now();
          this.keyIndex = (idx + 1) % len;
          const data: OpenAIChatResponse = await response.json();
          const choice = data.choices?.[0];
          const content = choice?.message?.content ?? '';
          const tokens = data.usage?.total_tokens ?? 0;
          return { content, tokensUsed: tokens, durationMs, success: true };
        }

        // 429 or 5xx → try next key
        if (response.status === 429 || response.status >= 500) {
          this.coolDownKey(idx);
          bestErrorDuration = Math.max(bestErrorDuration, durationMs);
          continue;
        }

        // Other HTTP error (400, 401, etc.) — also failover
        this.coolDownKey(idx);
        bestErrorDuration = Math.max(bestErrorDuration, durationMs);
        continue;

      } catch (_err: unknown) {
        // Network error / timeout → try next key
        const durationMs = Date.now() - (payload.messages ? Date.now() : 0);
        this.coolDownKey(idx);
        continue;
      }
    }

    // All keys exhausted
    this.lastCallTime = Date.now();
    return this.fallbackResponse(bestErrorDuration);
  }

  // ── Batch support ─────────────────────────────────────────────────

  /**
   * Execute multiple chat calls sequentially with key failover per call.
   * Results are returned in a Map keyed by each call's `id`.
   */
  async batchChat(
    calls: BatchCall[],
  ): Promise<Map<string, LLMResponse>> {
    const results = new Map<string, LLMResponse>();

    for (const call of calls) {
      const resp = await this.chat(call.messages);
      results.set(call.id, resp);
    }

    return results;
  }

  // ── Fallback ──────────────────────────────────────────────────────

  private fallbackResponse(durationMs: number): LLMResponse {
    return { content: '', tokensUsed: 0, durationMs, success: false };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────

export const llmClient = new LLMClient(ENV.llm);
