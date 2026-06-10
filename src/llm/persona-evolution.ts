/**
 * PersonaEvolution — 人格随经历渐变系统。
 *
 * 每隔 10 年，根据最近 10 年的 timeline 事件 + 最近 memories，
 * 调用 LLM 评估是否需要更新 agent 的人格特征（traits / values / motto / arc）。
 */

import { llmClient } from './llm-client.js';
import type { AgentState } from '../core/types.js';

// ─── Constants ────────────────────────────────────────────────────────────

/** 人格更新的周期（年） */
const PERSONA_UPDATE_INTERVAL = 10;

/** LLM 解析失败时的顺延年数 */
const FALLBACK_DEFER_YEAR = 5;

/** LLM 返回的 JSON 结构 */
interface PersonaUpdatePayload {
  traits: string[];
  values: string[];
  motto?: string;
  arc: string;
}

// ─── Prompt builder ───────────────────────────────────────────────────────

/**
 * 构建人格演化 prompt。
 *
 * 传入当前人格 + 最近事件，让 LLM 决定是否更新人格特征。
 */
function buildEvolutionPrompt(
  agent: AgentState,
  recentEvents: string[],
  recentMemories: string[],
): string {
  const currentTraits = agent.biography!.persona.traits.join('、') || '无';
  const currentValues = agent.biography!.persona.values.join('、') || '无';
  const currentMotto = agent.biography!.persona.motto ?? '无';
  const currentArc = agent.biography!.persona.narrative_arc;

  const eventsList = recentEvents.length > 0
    ? recentEvents.map((e) => `- ${e}`).join('\n')
    : '  无明显事件。';

  const memoriesList = recentMemories.length > 0
    ? recentMemories.map((m) => `- ${m}`).join('\n')
    : '  无记忆。';

  return `你是桃源镇的人物演化专家。请根据居民的近期经历，判断其人格特征是否需要更新。

居民信息：
- 姓名：${agent.name}
- 年龄：${agent.age} 岁
- 性别：${agent.gender}

当前人格：
- 性格特征：${currentTraits}
- 价值观：${currentValues}
- 座右铭：${currentMotto}
- 人物弧光：${currentArc}

最近 10 年经历：
${eventsList}

最近记忆：
${memoriesList}

请判断上述人格是否需要更新。如果需要更新，请输出新的 traits/values/motto/arc。
如果人格保持稳定无需变化，请原样返回当前人格数据。

请以 JSON 格式回复，只输出 JSON，不要任何其他文字：
{
  "traits": ["更新后的性格特征，3-5个"],
  "values": ["更新后的价值观，2-3个"],
  "motto": "更新后的座右铭，或保留当前",
  "arc": "更新后的人物弧光总结，30-60字"
}`;
}

// ─── Class ────────────────────────────────────────────────────────────────

/**
 * PersonaEvolution — 人格随经历渐变。
 *
 * 由 BiographySystem 或世界引擎在每年结束时调用 updateIfNeeded()。
 */
export class PersonaEvolution {
  /**
   * 检查当前 agent 是否到了人格更新时间，如果是则调用 LLM 评估更新。
   *
   * @param agent   - 目标居民
   * @param stateYear - 当前世界年份
   */
  async updateIfNeeded(agent: AgentState, stateYear: number): Promise<void> {
    // 无 biography → 跳过
    if (!agent.biography) return;

    // 已死亡 → 跳过
    if (!agent.alive) return;

    const persona = agent.biography.persona;
    const yearsSinceUpdate = stateYear - persona.lastUpdated;

    // 不到 10 年 → 不触发
    if (yearsSinceUpdate < PERSONA_UPDATE_INTERVAL) return;

    // 收集最近 10 年的 timeline 事件
    const recentEvents: string[] = [];
    const eventThreshold = stateYear - PERSONA_UPDATE_INTERVAL;
    for (const evt of agent.biography.timeline) {
      if (evt.year >= eventThreshold) {
        recentEvents.push(evt.description);
      }
    }

    // 收集最近 memories（最多取最近 10 条）
    const recentMemories = agent.memories.slice(-10).map((m) => m.content);

    // 构建 prompt 并调用 LLM
    const prompt = buildEvolutionPrompt(agent, recentEvents, recentMemories);

    try {
      const response = await llmClient.chat([
        { role: 'system', content: '你是桃源镇的人物演化专家。只输出 JSON。' },
        { role: 'user', content: prompt },
      ]);

      // LLM 失败或返回空 content → 顺延 5 年，不修改人格
      if (!response.success || !response.content) {
        persona.lastUpdated += FALLBACK_DEFER_YEAR;
        return;
      }

      // 尝试解析 JSON
      let payload: PersonaUpdatePayload;
      try {
        payload = JSON.parse(response.content) as PersonaUpdatePayload;
      } catch {
        // JSON 解析失败 → 顺延 5 年，不修改人格
        persona.lastUpdated += FALLBACK_DEFER_YEAR;
        return;
      }

      // 验证必要字段存在
      if (!Array.isArray(payload.traits) || !Array.isArray(payload.values) || !payload.arc) {
        persona.lastUpdated += FALLBACK_DEFER_YEAR;
        return;
      }

      // 更新人格
      persona.traits = payload.traits;
      persona.values = payload.values;
      persona.motto = payload.motto ?? persona.motto;
      persona.narrative_arc = payload.arc;
      persona.lastUpdated = stateYear;
    } catch {
      // LLM 调用抛异常 → 顺延 5 年
      persona.lastUpdated += FALLBACK_DEFER_YEAR;
    }
  }
}
