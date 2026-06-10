/**
 * MemorySystem — resident memory compression for the Town of Peace simulator.
 *
 * Each season, important events involving the agent are compressed into
 * 1–2 short memories (≤ 20 chars each).  Memories older than 5 are dropped.
 * The resulting memories are stored on `agent.memories` and can be used
 * later for personality updates.
 */

import type { AgentState, Memory } from '../core/types.js';
import { llmClient } from './llm-client.js';

// ─── Constants ──────────────────────────────────────────────────────────

/** Keyword groups that mark an event as "important" for memory. */
const IMPORTANT_KEYWORDS: RegExp[] = [
  /结婚|娶|嫁/,          // marriage
  /死亡|饿死|病逝/,        // death
  /生子|生女|生男|怀孕|生了/,   // child birth
  /发明|发现|创造|研制/,  // innovation
  /当选|升任|就任/,        // election
  /偷盗|偷窃|偷|贼/,      // theft
  /争吵|斗殴|打架|殴/,    // conflict
  /火灾|着火|烧/,         // fire
  /丰收|大丰收/,           // harvest
  /饥荒|挨饿|断粮/,        // famine
];

/** Maximum memories kept per agent. */
const MAX_MEMORIES = 5;

/** Hard cap for LLM-generated memory content length (characters). */
const MAX_MEMORY_CONTENT_LENGTH = 20;

/** Hard cap for fallback truncated event length (characters). */
const MAX_FALLBACK_LENGTH = 30;

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Check whether an event string matches any "important" keyword.
 */
function isImportantEvent(event: string): boolean {
  for (const pattern of IMPORTANT_KEYWORDS) {
    if (pattern.test(event)) {
      return true;
    }
  }
  return false;
}

/**
 * Truncate a string to at most `maxLen` characters.
 */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

// ─── Class ──────────────────────────────────────────────────────────────

/**
 * Manages per-agent seasonal memory compression.
 */
export class MemorySystem {
  /**
   * Process events from a single season: filter important ones,
   * compress via LLM (or fallback), and store as memories on the agent.
   *
   * @param agent        The agent whose memories to update.
   * @param seasonEvents Array of event strings that happened this season.
   */
  async processSeasonalMemory(
    agent: AgentState,
    seasonEvents: string[],
  ): Promise<void> {
    if (!agent.alive) return;

    // 1. Filter important events
    const importantEvents = seasonEvents.filter(isImportantEvent);
    if (importantEvents.length === 0) {
      // No important events → skip
      return;
    }

    // 2. Try LLM compression
    let compressedContent: string;
    try {
      compressedContent = await this.compressWithLLM(importantEvents);
    } catch {
      // LLM call errored → fallback
      compressedContent = truncateText(
        importantEvents[0],
        MAX_FALLBACK_LENGTH,
      );
    }

    if (!compressedContent || !compressedContent.trim()) {
      // LLM returned empty → fallback
      compressedContent = truncateText(
        importantEvents[0],
        MAX_FALLBACK_LENGTH,
      );
    }

    // 3. Trim to max memory content length
    compressedContent = truncateText(compressedContent.trim(), MAX_MEMORY_CONTENT_LENGTH);

    if (!compressedContent) {
      return;
    }

    // 4. Build and push the new memory
    const newMemory: Memory = {
      year: agent.age,          // agent.age ≈ simulation year of birth offset
      content: compressedContent,
      importance: Math.min(importantEvents.length, 5) / 5,
    };

    agent.memories.push(newMemory);

    // 5. Keep only the most recent MAX_MEMORIES
    if (agent.memories.length > MAX_MEMORIES) {
      agent.memories.splice(0, agent.memories.length - MAX_MEMORIES);
    }
  }

  // ── LLM Compression ──────────────────────────────────────────────

  /**
   * Send important events to the LLM for summarization into one short
   * memory.  Falls back to the first event truncated.
   */
  private async compressWithLLM(events: string[]): Promise<string> {
    const prompt = `你是桃源镇的历史记录员。请将以下居民经历中的重要事件压缩为一条简短记忆（20字以内）：

${events.join('\n')}

只返回压缩后的记忆内容，不要其他解释。`;

    const response = await llmClient.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 40 },
    );

    if (response.success && response.content.trim()) {
      return response.content.trim();
    }

    // LLM returned failure → empty string triggers fallback in caller
    return '';
  }
}
