/**
 * DialogueGenerator — LLM-driven resident conversation generation.
 *
 * Produces natural Chinese dialogue between two agents based on their
 * biography traits, current season, and recent events.  Does NOT modify
 * any simulation state — purely a narrative output utility.
 */

import { AgentState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { llmClient } from './llm-client.js';

// ─── Constants ────────────────────────────────────────────────────────

/** Fallback message when LLM is unavailable. */
const FALLBACK = '和各自忙着自己的事，没有交谈。';

// ─── Helper ───────────────────────────────────────────────────────────

/** Build the system prompt that tells the LLM what format to produce. */
function systemPrompt(): string {
  return [
    '你是桃源镇的叙事者。请根据以下两位居民的信息，生成一段他们之间的自然对话。',
    '',
    '要求：',
    '- 使用中文',
    '- 对话 2–4 轮（即 2–4 句交替发言，共 4–8 句）',
    '- 对话应符合双方的性格特征和当前情境',
    '- 每行格式为：`姓名：「对话内容」`',
    '- 仅输出对话内容，不要添加任何说明或前缀',
  ].join('\n');
}

/** Build the user prompt containing agent details and context. */
function userPrompt(
  a: AgentState,
  b: AgentState,
  season: string,
  recentEvent?: string,
): string {
  const traitsA = a.biography?.persona?.traits ?? [];
  const traitsB = b.biography?.persona?.traits ?? [];
  const valuesA = a.biography?.persona?.values ?? [];
  const valuesB = b.biography?.persona?.values ?? [];

  let prompt = `居民A：\n`;
  prompt += `- 姓名：${a.name}\n`;
  prompt += `- 性别：${a.gender}\n`;
  prompt += `- 年龄：${a.age} 岁\n`;
  if (traitsA.length > 0) {
    prompt += `- 性格特征：${traitsA.join('、')}\n`;
  }
  if (valuesA.length > 0) {
    prompt += `- 价值观：${valuesA.join('、')}\n`;
  }

  prompt += `\n居民B：\n`;
  prompt += `- 姓名：${b.name}\n`;
  prompt += `- 性别：${b.gender}\n`;
  prompt += `- 年龄：${b.age} 岁\n`;
  if (traitsB.length > 0) {
    prompt += `- 性格特征：${traitsB.join('、')}\n`;
  }
  if (valuesB.length > 0) {
    prompt += `- 价值观：${valuesB.join('、')}\n`;
  }

  prompt += `\n当前季节：${season}\n`;
  if (recentEvent) {
    prompt += `最近事件：${recentEvent}\n`;
  }
  prompt += '\n请生成对话：';
  return prompt;
}

/** Build the LLM chat messages array. */
function buildMessages(
  a: AgentState,
  b: AgentState,
  season: string,
  recentEvent?: string,
): { role: string; content: string }[] {
  return [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: userPrompt(a, b, season, recentEvent) },
  ];
}

// ─── Class ────────────────────────────────────────────────────────────

/**
 * DialogueGenerator generates LLM-driven conversations between agents.
 *
 * It uses a SeededRNG for deterministic pair sampling, but the actual
 * dialogue text comes from the LLM so it is not deterministic.
 */
export class DialogueGenerator {
  constructor(private rng: SeededRNG) {}

  /**
   * Generate a conversation between two agents.
   *
   * @returns formatted dialogue string, e.g. `张三：「你好」\n李四：「你好」`
   *          or the fallback text when LLM fails.
   */
  async generateDialogue(
    speakerA: AgentState,
    speakerB: AgentState,
    context: { season: string; recentEvent?: string },
  ): Promise<string> {
    const messages = buildMessages(
      speakerA,
      speakerB,
      context.season,
      context.recentEvent,
    );

    try {
      const response = await llmClient.chat(messages, {
        temperature: 0.9,
        maxTokens: 500,
      });

      if (response.success && response.content.trim().length > 0) {
        return response.content.trim();
      }

      // LLM returned empty/unsuccessful → fallback
      return `${speakerA.name}${FALLBACK}`;
    } catch {
      // LLM threw → fallback
      return `${speakerA.name}${FALLBACK}`;
    }
  }

  /**
   * Sample `count` non-repeating pairs from alive agents.
   *
   * Each pair (a, b) satisfies a !== b.  If there are fewer agents
   * than needed, return as many pairs as possible.
   */
  samplePairs(
    agents: AgentState[],
    count: number,
  ): Array<[AgentState, AgentState]> {
    const alive = agents.filter((a) => a.alive);
    return this.rng.samplePairs(alive, count);
  }
}
