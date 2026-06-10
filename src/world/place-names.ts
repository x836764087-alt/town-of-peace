/**
 * 地名演化系统（PlaceNameSystem）— 桃源镇 v6.0
 *
 * 负责：
 * 1. 建筑存在 20+ 年后自动获得传说化名称
 * 2. 有名望居民逝世后，概率以他命名场所
 * 3. 地名变化记录推入事件列表，供主循环收集到编年史
 */

import type { WorldState, Building, AgentState, PlaceName } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 传说名后缀 ────────────────────────────

/** 建筑存在 20+ 年后附加的传说化后缀 */
const LEGENDARY_SUFFIXES: string[] = [
  '古巷', '旧街', '遗迹', '古渡', '名坊',
  '遗址', '古院', '故址', '遗风', '传说',
  '千秋', '百年', '沧桑', '岁月', '流芳',
];

// ─── 常量 ──────────────────────────────────

/** 传说名触发阈值 — 建筑存在年数 */
const LEGENDARY_AGE_THRESHOLD = 20;

/** 名人逝世纪念命名 — 技能阈值（最高单项技能） */
const MEMORIAL_SKILL_THRESHOLD = 80;

/** 名人逝世纪念命名 — 概率 */
const MEMORIAL_CHANCE = 0.3;

/** 纪念命名回溯年数（仅逝世 2 年内的名人） */
const MEMORIAL_LOOKBACK_YEARS = 2;

// ─── 核心函数 ──────────────────────────────

/**
 * 处理地名演化，返回事件描述列表。
 *
 * 每季调用一次，由 index.ts 的主循环驱动。
 * 结果会被收集到 allChronicle 中。
 *
 * @param state 当前世界状态
 * @param rng  随机数生成器
 * @param chronicle 编年史数组（直接推入新条目）
 * @return 事件描述字符串列表
 */
export function processPlaceNames(
  state: WorldState,
  rng: SeededRNG,
  chronicle: { year: number; content: string }[],
): string[] {
  const events: string[] = [];
  const year = state.year;

  // ═══ 1. 传说名：建筑存在 20+ 年 ═══
  if (state.buildings) {
    for (const building of state.buildings) {
      const existing = state.placeNames?.find((p) => p.buildingId === building.id);
      if (existing) continue;

      const builtYear = building.builtYear ?? year;
      const age = year - builtYear;
      if (age >= LEGENDARY_AGE_THRESHOLD) {
        const suffix = rng.pick(LEGENDARY_SUFFIXES);
        const legendaryName = `${building.name}${suffix}`;

        if (!state.placeNames) state.placeNames = [];
        state.placeNames.push({
          buildingId: building.id,
          originalName: building.name,
          legendaryName,
          yearNamed: year,
          reason: 'age',
        });

        const eventMsg = `「${building.name}」历经 ${age} 年岁月，镇上人称它为「${legendaryName}」。`;
        events.push(eventMsg);
        chronicle.push({
          year,
          content: eventMsg,
        });
      }
    }
  }

  // ═══ 2. 纪念命名：名人逝世 ═══
  const deadAgents = state.agents.filter(
    (a) => !a.alive && a.deathYear !== undefined,
  );

  for (const dead of deadAgents) {
    const yearsSinceDeath = dead.deathYear
      ? year - dead.deathYear
      : Infinity;
    if (yearsSinceDeath > MEMORIAL_LOOKBACK_YEARS) continue;

    const skillValues = Object.values(dead.skills ?? {});
    const maxSkill = skillValues.length > 0 ? Math.max(...skillValues) : 0;
    if (maxSkill < MEMORIAL_SKILL_THRESHOLD) continue;

    // 此逝者已被纪念过的不再重复
    const alreadyMemorialized = state.placeNames?.some(
      p => p.reason === 'memorial' && p.legendaryName.includes(dead.name)
    );
    if (alreadyMemorialized) continue;

    if (!rng.chance(MEMORIAL_CHANCE)) continue;

    // 找最老的无名建筑
    const unamedBuildings = state.buildings?.filter(
      (b) => !state.placeNames?.some((p) => p.buildingId === b.id),
    );
    if (!unamedBuildings || unamedBuildings.length === 0) continue;

    unamedBuildings.sort(
      (a, b) => (a.builtYear ?? 0) - (b.builtYear ?? 0),
    );
    const target = unamedBuildings[0];

    const memorialName = `${dead.name}故居`;

    if (!state.placeNames) state.placeNames = [];
    state.placeNames.push({
      buildingId: target.id,
      originalName: target.name,
      legendaryName: memorialName,
      yearNamed: year,
      reason: 'memorial',
    });

    const eventMsg = `为纪念 ${dead.name}（逝世于 ${dead.deathYear} 年），镇上将「${target.name}」改称为「${memorialName}」。`;
    events.push(eventMsg);
    chronicle.push({
      year,
      content: eventMsg,
    });

    // 每个逝者只命名一次
    break;
  }

  return events;
}

export default processPlaceNames;
