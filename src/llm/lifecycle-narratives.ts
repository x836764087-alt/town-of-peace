/**
 * LifecycleNarratives — LLM 驱动的生命周期叙事增强
 *
 * 在居民出生和死亡时调用 LLM 生成个性化叙事句子，
 * 为编年史提供更丰富的文本。LLM 不可用时回退到模板。
 */

import { llmClient } from './llm-client.js';
import { SeededRNG } from '../core/rng.js';

// ─── Types ────────────────────────────────────────────────────────────

/** 父母信息（用于出生叙事） */
export interface ParentInfo {
  name: string;
  title?: string;
}

// ─── Constants ────────────────────────────────────────────────────────

const BIRTH_PROMPT = (
  babyName: string,
  babyGender: string,
  parents: ParentInfo[],
): string =>
  `你是一个桃源镇的记录员。请为这个新生儿写一句中文祝福/叙事（20-40字）。\n\n` +
  `婴儿：${babyName}（${babyGender}）\n` +
  `父母：${parents.map(p => p.title ? `${p.name}（${p.title}）` : p.name).join('和')}\n\n` +
  `要求：一句中文，温暖有诗意，不超过40字，以句号结尾。只输出句子本身。`;

const DEATH_PROMPT = (
  agentName: string,
  agentAge: number,
  agentTitle: string | undefined,
  cause: string | undefined,
  obituary: string | undefined,
): string =>
  `你是一个桃源镇的记录员。请为逝者写一句中文悼念叙事（20-40字）。\n\n` +
  `姓名：${agentName}${agentTitle ? `（${agentTitle}）` : ''}\n` +
  `年龄：${agentAge}岁\n` +
  (cause ? `死因：${cause}\n` : '') +
  (obituary ? `生平概要：${obituary}\n` : '') +
  `\n要求：一句中文，庄重有感情，不超过40字，以句号结尾。只输出句子本身。`;

// ─── Fallback templates ───────────────────────────────────────────────

const birthFallback = (babyName: string, parents: ParentInfo[]): string =>
  `${babyName}来到了这个世界，给${parents.map(p => p.name).join('和')}带来了欢乐。`;

const deathFallbackByAge = (name: string, age: number): string => {
  if (age < 15) {
    return `${name}年幼夭折，令人惋惜。`;
  }
  if (age >= 65) {
    return `${name}寿终正寝，享年${age}岁。`;
  }
  return `${name}离开了这个世界。`;
};

// ─── Class ────────────────────────────────────────────────────────────

/**
 * LLM 驱动的生命周期叙事。
 * 在出生和死亡时生成个性化中文叙事。
 */
export class LifecycleNarratives {
  constructor(private rng: SeededRNG) {}

  /**
   * 生成新生儿祝福/叙事。
   * @param babyName     婴儿名字
   * @param babyGender   性别
   * @param parents      父母信息
   * @returns 一句 20-40 字的中文叙事
   */
  async generateBirthNarrative(
    babyName: string,
    babyGender: string,
    parents: ParentInfo[],
  ): Promise<string> {
    const response = await llmClient.chat(
      [{ role: 'user', content: BIRTH_PROMPT(babyName, babyGender, parents) }],
      { temperature: 0.8 },
    );

    if (response.success && response.content.trim().length > 0) {
      return response.content.trim();
    }

    return birthFallback(babyName, parents);
  }

  /**
   * 生成死亡叙事。
   * @param agentName   死者姓名
   * @param agentAge    死者年龄
   * @param agentTitle  死者头衔（可选）
   * @param cause       死因（可选）
   * @param obituary    讣告摘要（可选）
   * @returns 一句 20-40 字的中文悼念叙事
   */
  async generateDeathNarrative(
    agentName: string,
    agentAge: number,
    agentTitle: string | undefined,
    cause: string | undefined,
    obituary: string | undefined,
  ): Promise<string> {
    const response = await llmClient.chat(
      [{ role: 'user', content: DEATH_PROMPT(agentName, agentAge, agentTitle, cause, obituary) }],
      { temperature: 0.8 },
    );

    if (response.success && response.content.trim().length > 0) {
      return response.content.trim();
    }

    return deathFallbackByAge(agentName, agentAge);
  }
}
