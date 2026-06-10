/**
 * EventSeeder — LLM 驱动的事件种子生成器。
 *
 * 扩展现有的随机事件系统，通过 LLM 生成符合模拟世界观的多样化事件。
 * 在 LLM 不可用时自动回退到基于模板的随机选择。
 */

import { SeededRNG } from '../core/rng.js';
import { llmClient } from './llm-client.js';

// ─── Types ────────────────────────────────────────────────────────────

/** 事件类型（与 TownEventType 对齐） */
export type EventType = 'disaster' | 'discovery' | 'visitor' | 'celebration' | 'conflict';

/** 事件严重程度 */
export type Severity = 'minor' | 'notable' | 'dramatic';

/** 校验过的 LLM 事件种子 */
export interface LLMEventSeed {
  /** 事件类型 */
  type: EventType;
  /** 事件标题 */
  title: string;
  /** 事件描述 */
  description: string;
  /** 严重程度 */
  severity: Severity;
  /** 建议受影响人数 */
  affectedCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────

/** 合法的事件类型集合 */
const VALID_EVENT_TYPES: EventType[] = [
  'disaster', 'discovery', 'visitor', 'celebration', 'conflict',
];

/** 合法的严重程度集合 */
const VALID_SEVERITIES: Severity[] = ['minor', 'notable', 'dramatic'];

/** 事件类型 fallback 概率分布（conflict 最频繁，celebration 最稀少） */
const FALLBACK_WEIGHTS: Record<EventType, number> = {
  conflict: 30,
  disaster: 25,
  discovery: 20,
  visitor: 15,
  celebration: 10,
};

/** 标题去重比较时截取的前 N 个字符 */
const TITLE_DUPE_PREFIX = 10;

/** 编年史事件截取的最大字符数 */
const HISTORY_CHAR_LIMIT = 50;

// ─── Prompt Builder ───────────────────────────────────────────────────

/** 构建 LLM 请求的 prompt */
function buildPrompt(
  year: number,
  season: string,
  population: number,
  avgHappiness: number,
  recentHistory: string[],
): string {
  const historyBlock = recentHistory
    .slice(0, 5)
    .map((h) => '  - ' + h.slice(0, HISTORY_CHAR_LIMIT))
    .join('\n');

  return [
    '你是桃源镇文明模拟器的事件生成引擎。请根据以下信息，生成 1 到 3 个符合模拟世界观的随机事件种子。',
    '',
    `【当前状态】`,
    `年份：第 ${year} 年`,
    `季节：${season}`,
    `人口规模：${population} 人`,
    `全镇平均幸福感：${avgHappiness.toFixed(1)} / 100`,
    '',
    `【最近编年史事件】${historyBlock || '  （暂无）'}`,
    '',
    '请生成符合以下世界观的事件：',
    '- 古风中国小镇，自给自足的农业社区',
    '- 事件包括自然灾害、重大发现、外来者来访、喜庆活动、社会冲突',
    '- 事件应简洁、有叙事感',
    '- 不要生成与最近编年史重复的事件',
    '',
    '严格按以下 JSON 格式返回（不要返回任何其他内容）：',
    '{',
    '  "events": [',
    '    {',
    '      "type": "disaster|discovery|visitor|celebration|conflict",',
    '      "title": "事件标题（简短中文）",',
    '      "description": "事件描述（中文）",',
    '      "severity": "minor|notable|dramatic",',
    '      "affectedCount": 受影响人数（整数 ≥ 1）',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

// ─── LLM 输出解析 ────────────────────────────────────────────────────

/** 解析 LLM 返回的 JSON 内容 */
function parseLLMResponse(content: string): LLMEventSeed[] | null {
  try {
    const json = JSON.parse(content);
    const events = json.events;
    if (!Array.isArray(events) || events.length === 0) {
      return null;
    }

    const parsed: LLMEventSeed[] = [];
    for (const e of events) {
      const seed = validateEventSeed(e);
      if (seed) {
        parsed.push(seed);
      }
    }
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** 验证单个事件种子，返回校验后的 LLMEventSeed 或 null */
function validateEventSeed(raw: Record<string, unknown>): LLMEventSeed | null {
  if (!raw.type || !raw.title || !raw.description || raw.severity === undefined || raw.affectedCount === undefined) {
    return null;
  }

  const type = raw.type as string;
  const severity = raw.severity as string;
  const affectedCount = raw.affectedCount as number;

  if (!VALID_EVENT_TYPES.includes(type as EventType)) {
    return null;
  }
  if (!VALID_SEVERITIES.includes(severity as Severity)) {
    return null;
  }
  if (!Number.isInteger(affectedCount) || affectedCount < 1) {
    return null;
  }

  return {
    type: type as EventType,
    title: String(raw.title),
    description: String(raw.description),
    severity: severity as Severity,
    affectedCount,
  };
}

// ─── Fallback ─────────────────────────────────────────────────────────

/** 生成 fallback 事件种子（无 LLM 时） */
function generateFallbackSeeds(rng: SeededRNG, population: number, avgHappiness: number): LLMEventSeed[] {
  const numEvents = rng.int(1, 3);
  const seeds: LLMEventSeed[] = [];

  for (let i = 0; i < numEvents; i++) {
    const type = rng.weightedPick<EventType>(VALID_EVENT_TYPES, VALID_EVENT_TYPES.map((t) => FALLBACK_WEIGHTS[t]));
    const severity = rng.pick(VALID_SEVERITIES);
    const affectedCount = Math.max(1, Math.floor(rng.int(1, Math.max(1, Math.floor(population * 0.3)) - 1)));

    seeds.push({
      type,
      title: `发生了一起${type === 'disaster' ? '灾害' : type === 'discovery' ? '发现' : type === 'visitor' ? '外来' : type === 'celebration' ? '喜庆' : '冲突'}事件`,
      description: `全镇发生了一起${type}事件，影响 ${affectedCount} 人。`,
      severity,
      affectedCount,
    });
  }

  return seeds;
}

// ─── 标题去重 ────────────────────────────────────────────────────────

/** 根据 recentHistory 中的标题去重 */
function filterDuplicates(seeds: LLMEventSeed[], recentHistory: string[]): LLMEventSeed[] {
  if (recentHistory.length === 0) {
    return seeds;
  }

  const existingTitles = recentHistory
    .slice(0, 5)
    .map((h) => h.slice(0, TITLE_DUPE_PREFIX));

  return seeds.filter((seed) => {
    const prefix = seed.title.slice(0, TITLE_DUPE_PREFIX);
    return !existingTitles.some((t) => t === prefix);
  });
}

// ─── Class ────────────────────────────────────────────────────────────

/**
 * EventSeeder — LLM 驱动的事件种子生成器。
 *
 * 通过 LLM 生成符合模拟世界观的事件种子，在 LLM 不可用时
 * 自动回退到基于模板的随机选择。
 */
export class EventSeeder {
  constructor(private rng: SeededRNG) {}

  /**
   * 通过 LLM 生成 1-3 个随机事件种子。
   * 如果 LLM 调用失败或 JSON 解析失败，回退到 fallbackEvents。
   *
   * @param state — 当前模拟状态摘要
   * @param recentHistory — 最近的事件/编年史（最多 5 条）
   * @returns 校验后的事件种子数组
   */
  async generateEvents(
    state: { year: number; season: string; population: number; avgHappiness: number },
    recentHistory: string[],
  ): Promise<LLMEventSeed[]> {
    const prompt = buildPrompt(
      state.year,
      state.season,
      state.population,
      state.avgHappiness,
      recentHistory,
    );

    try {
      const response = await llmClient.chat([
        { role: 'system', content: '你是桃源镇事件生成引擎。只返回 JSON，不要添加任何其他文字。' },
        { role: 'user', content: prompt },
      ], { maxTokens: 1024 });

      if (!response.success || !response.content) {
        return this.fallbackEvents(state);
      }

      const parsed = parseLLMResponse(response.content);
      if (!parsed || parsed.length === 0) {
        return this.fallbackEvents(state);
      }

      // 去重
      return filterDuplicates(parsed, recentHistory);
    } catch {
      return this.fallbackEvents(state);
    }
  }

  /**
   * 无 LLM 时的回退事件生成。
   * 使用 SeededRNG 按概率分布随机选择事件类型并生成种子。
   *
   * @param state — 当前模拟状态摘要
   * @returns 随机生成的事件种子数组
   */
  fallbackEvents(state: { population: number; avgHappiness: number }): LLMEventSeed[] {
    return generateFallbackSeeds(this.rng, state.population, state.avgHappiness);
  }
}
