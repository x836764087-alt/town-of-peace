// server/ai/llm-client.js — LLM 统一客户端 (OpenAI-compatible)
// 支持 SiliconFlow / Claude API / 任意 OpenAI 兼容接口

import config from '../config.js';
import KeyPool from './key-pool.js';

const DEBUG = process.env.NODE_ENV !== 'production';

export class LlmClient {
  constructor() {
    this.baseUrl = config.llm.baseUrl;
    this.model = config.llm.model;
    this.timeoutMs = config.llm.timeoutMs;
    this.maxRetries = config.llm.maxRetries;
    this.maxConcurrent = config.llm.maxConcurrent;
    this._activeCalls = 0;
    this.keyPool = new KeyPool();
  }

  get isBusy() {
    return this._activeCalls >= this.maxConcurrent;
  }

  async chat(messages, options = {}) {
    const apiKey = this.keyPool.getNextAvailable();
    if (!apiKey) {
      return { ok: false, reason: 'rate_limit', error: 'No available API key' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    this._activeCalls++;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || this.model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 512,
          response_format: options.responseFormat || undefined,
          stop: options.stop || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if (response.status === 429) {
          this.keyPool.reportFailure(apiKey);
          return { ok: false, reason: 'rate_limit', error: '429 rate limited' };
        }
        if (response.status === 401 || response.status === 403) {
          this.keyPool.reportFailure(apiKey);
          return { ok: false, reason: 'auth_error', error: `${response.status} auth failed` };
        }
        return { ok: false, reason: 'server_error', error: `${response.status}: ${body.slice(0, 200)}` };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (DEBUG) {
        console.log(`[LLM] ${this.model} | ${messages[0]?.role || '?'} → ${content.length} chars`);
      }

      // Try to parse as JSON if requested
      if (options.responseFormat === 'json_object' || options.parseJson) {
        try {
          const parsed = JSON.parse(content);
          return { ok: true, content, parsed, finishReason: data.choices?.[0]?.finish_reason };
        } catch {
          return { ok: true, content, finishReason: data.choices?.[0]?.finish_reason };
        }
      }

      return { ok: true, content, finishReason: data.choices?.[0]?.finish_reason };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { ok: false, reason: 'timeout', error: `LLM request timed out after ${this.timeoutMs}ms` };
      }
      this.keyPool.reportFailure(apiKey);
      return { ok: false, reason: 'server_error', error: err.message };
    } finally {
      clearTimeout(timeout);
      this._activeCalls--;
    }
  }

  async generateDecision(agentName, agentState, context, options = {}) {
    const systemPrompt = `You are the AI decision engine for "${agentName}", a resident of 桃源镇 (Town of Peace).

You decide what the character does next based on their current state and environment.

Current needs (0-100, higher = more urgent):
- hunger: ${agentState.needs.hunger}
- fatigue: ${agentState.needs.fatigue}  
- social: ${agentState.needs.social}

Your task: Choose the single most appropriate action. Respond in JSON format:
{
  "action": "sleep" | "eat" | "socialize" | "explore" | "work" | "rest" | "trade" | "wait",
  "reason": "Brief 1-sentence explanation in Chinese",
  "targetId": "optional building or agent ID",
  "durationMinutes": 15-60
}`;

    const userMsg = `Time: ${context.timeString || 'unknown'}
Location: ${context.location || 'unknown'}
Nearby: ${(context.nearby || []).join(', ') || 'no one nearby'}
Weather: ${context.weather || 'sunny'}

Choose what ${agentName} does next.`;

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ], { ...options, responseFormat: 'json_object', temperature: 0.3 });
  }

  async generateDialogue(speaker, listener, context) {
    const prompt = `You are ${speaker.name} in 桃源镇. 
${speaker.persona?.traits?.join(', ') || ''}

Generate a short, natural greeting or conversation starter in Chinese (1 sentence, max 30 chars).
${listener ? `Speaking to: ${listener.name}` : 'Talking to yourself'}
${context ? `Context: ${context}` : ''}`;

    return this.chat([
      { role: 'system', content: prompt },
      { role: 'user', content: 'Say something in character.' },
    ], { temperature: 0.8, maxTokens: 80 });
  }

  async generateChronicleEntry(events, timeContext) {
    const prompt = `You are the 史官 (scribe) of 桃源镇. Summarize the day's events in a brief, poetic Chinese chronicle entry (1-2 sentences).

Events: ${(events || []).slice(0, 5).map(e => JSON.stringify(e)).join('; ')}
Time: ${timeContext || 'unknown'}`;

    return this.chat([
      { role: 'system', content: 'You write concise, literary Chinese chronicle entries for a pixel-art town simulation.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.6, maxTokens: 150 });
  }
}

export default LlmClient;
