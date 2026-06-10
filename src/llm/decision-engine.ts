/**
 * DecisionEngine — LLM-driven key decision support for agent actions.
 *
 * Given an agent's state and a situation with multiple choices, the engine
 * either calls the LLM (when the agent has a biography) to get weighted
 * decision suggestions informed by personality/memories, or falls back to
 * equal weights. `selectDecision` performs a weighted-random pick.
 */

import type { AgentState, Memory } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { llmClient } from './llm-client.js';

// ─── Types ───────────────────────────────────────────────────────────────

/** A single decision option with a reason. */
export interface DecisionOption {
  /** The action identifier, e.g. `'farm'`, `'trade'`, `'rest'`. */
  action: string;
  /** Weight from 0 to 100 — higher means more likely. */
  weight: number;
  /** Human-readable reason for this weight. */
  reason: string;
}

/** Parsed LLM decision response. */
interface LLMDecisionResponse {
  decisions: Array<{ action: string; weight: number; reason: string }>;
}

// ─── Constants ───────────────────────────────────────────────────────────

/** Maximum recent memories included in the LLM prompt. */
const MAX_RECENT_MEMORIES = 3;

/** Maximum length of the situation description (chars). */
const MAX_SITUATION_LENGTH = 200;

/** Maximum length of a memory content (chars). */
const MAX_MEMORY_CONTENT_LENGTH = 80;

/** Weight for each fallback decision option. */
function equalWeight(count: number): number {
  if (count <= 0) return 0;
  return Math.floor(100 / count);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Truncate a string to `maxLen` characters. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

/** Build the LLM prompt for decision suggestions. */
function buildDecisionPrompt(
  agent: AgentState,
  choices: string[],
  situation: string,
  recentMemories: Memory[],
): string {
  const { name, age, gender } = agent;
  const persona = agent.biography?.persona;

  let personaInfo = '';
  if (persona) {
    const traits = persona.traits.join('、') || '未定义';
    const values = persona.values.join('、') || '未定义';
    const motto = persona.motto || '未定义';
    personaInfo = [
      `人格特征：${traits}`,
      `价值观：${values}`,
      `座右铭：${motto}`,
    ].join('\n');
  }

  let memoriesSection = '（无记忆）';
  if (recentMemories.length > 0) {
    memoriesSection = recentMemories
      .map(
        (m) =>
          `[第${m.year}年] ${truncate(m.content, MAX_MEMORY_CONTENT_LENGTH)}`,
      )
      .join('\n');
  }

  const choicesList = choices.map((c, i) => `${i + 1}. ${c}`).join('\n');

  return [
    '你是桃源镇的一位居民，正在面临一个关键决策。请根据你的性格、价值观和经历，从以下选项中选择最合适的行动。',
    '',
    '【你的信息】',
    `姓名：${name}`,
    `年龄：${age}`,
    `性别：${gender}`,
    personaInfo,
    '',
    '【最近记忆】',
    memoriesSection,
    '',
    '【当前处境】',
    truncate(situation, MAX_SITUATION_LENGTH),
    '',
    '【可选行动】',
    choicesList,
    '',
    '请以 JSON 格式回复：',
    '{',
    '  "decisions": [',
    '    { "action": "选项action", "weight": 0-100, "reason": "选择理由" }',
    '  ]',
    '}',
    '权重 (weight) 范围 0-100，表示你选择该选项的倾向程度。',
    'weight 总和不需要等于 100，每个选项独立评分。',
    '只输出 JSON，不要任何其他文字。',
  ].join('\n');
}

/** Try to parse a JSON string into LLMDecisionResponse. */
function parseDecisionResponse(
  content: string,
): LLMDecisionResponse | null {
  try {
    const parsed = JSON.parse(content);
    if (
      parsed &&
      Array.isArray(parsed.decisions) &&
      parsed.decisions.every(
        (d: unknown) => d && typeof (d as Record<string, unknown>).action === 'string' && typeof (d as Record<string, unknown>).weight === 'number' && typeof (d as Record<string, unknown>).reason === 'string',
      )
    ) {
      return parsed as LLMDecisionResponse;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Class ───────────────────────────────────────────────────────────────

/**
 * DecisionEngine provides LLM-assisted decision suggestions for agents.
 *
 * When an agent has a biography (personality, memories, etc.), the engine
 * constructs a rich prompt and calls the LLM for weighted suggestions.
 * Falls back to equal-weight options when the LLM is unavailable or
 * the agent lacks a biography.
 */
export class DecisionEngine {
  constructor(private rng: SeededRNG) {}

  /**
   * Generate decision suggestions for an agent in a given situation.
   *
   * @param agent       The agent making the decision.
   * @param context     Choices available and situation description.
   * @returns Decision options sorted by weight descending.
   */
  async suggestDecisions(
    agent: AgentState,
    context: { choices: string[]; situation: string },
  ): Promise<DecisionOption[]> {
    const { choices, situation } = context;

    // Guard against empty choices
    if (!choices || choices.length === 0) {
      return [];
    }

    // --- Fallback: no biography → equal weights ---
    if (!agent.biography) {
      return choices.map((action) => ({
        action,
        weight: equalWeight(choices.length),
        reason: '无档案信息，等权重分配',
      }));
    }

    // Get recent memories (last MAX_RECENT_MEMORIES)
    const recentMemories = agent.memories.slice(-MAX_RECENT_MEMORIES);

    // Build prompt and call LLM
    const prompt = buildDecisionPrompt(agent, choices, situation, recentMemories);

    let response: Awaited<ReturnType<typeof llmClient.chat>>;
    try {
      response = await llmClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.7, maxTokens: 500 },
      );
    } catch {
      // LLM call failed → fallback
      response = { content: '', tokensUsed: 0, durationMs: 0, success: false };
    }

    // Try to parse LLM response
    let decisions: DecisionOption[] | null = null;
    if (response.success && response.content.trim()) {
      const parsed = parseDecisionResponse(response.content);
      if (parsed) {
        // Map LLM decisions to DecisionOptions, filtering out unknown actions
        decisions = parsed.decisions
          .filter((d) => choices.includes(d.action))
          .map((d) => ({
            action: d.action,
            weight: Math.max(0, Math.min(100, d.weight)),
            reason: d.reason,
          }));
      }
    }

    // Fallback: equal weights for all choices
    if (!decisions || decisions.length === 0) {
      decisions = choices.map((action) => ({
        action,
        weight: equalWeight(choices.length),
        reason: 'LLM 不可用或无法解析，等权重分配',
      }));
    }

    // Sort by weight descending
    return decisions.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Select a single decision from weighted options using weighted random.
   *
   * @param options Decision options (must have weights > 0).
   * @returns The selected action string.
   */
  selectDecision(options: DecisionOption[]): string {
    if (options.length === 0) {
      throw new Error('Cannot select from empty options');
    }

    // Filter out zero-weight options
    const validOptions = options.filter((o) => o.weight > 0);
    if (validOptions.length === 0) {
      // All weights are 0, pick uniformly
      return this.rng.pick(validOptions.length > 0 ? validOptions : options).action;
    }

    // Weighted pick
    const actions = validOptions.map((o) => o.action);
    const weights = validOptions.map((o) => o.weight);
    return this.rng.weightedPick(actions, weights);
  }
}
