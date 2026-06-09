/**
 * 编年史生成器（ChronicleGenerator）— 桃源镇 v6.0
 *
 * 负责：
 * 1. 从 WorldState 事件中生成结构化编年史条目
 * 2. 年度总结（人口、经济、大事记）
 * 3. 季节叙事（天气、农事、社区活动）
 * 4. 事件分级（peaceful / notable / dramatic / epochal）
 */

import type { WorldState, ChronicleEntry, Season, WeatherType } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ──────────────────────────────

/** 天气叙事模板 */
const WEATHER_NARRATIVES: Record<WeatherType, string[]> = {
  sunny: ['阳光明媚', '晴空万里', '风和日丽', '天朗气清'],
  rainy: ['细雨绵绵', '大雨滂沱', '阴雨霏霏', '烟雨朦胧'],
  windy: ['清风徐来', '秋风萧瑟', '朔风凛冽', '大风呼啸'],
  snowy: ['瑞雪纷飞', '白雪皑皑', '银装素裹', '朔雪漫天'],
  extreme: ['暴风骤雨', '狂风大作', '雷电交加', '天昏地暗'],
};

/** 季节开场白 */
const SEASON_OPENERS: Record<Season, string[]> = {
  spring: ['春回大地，万物复苏。', '春风送暖，冰雪消融。', '一年之计在于春。'],
  summer: ['夏日炎炎，草木茂盛。', '蝉鸣声声，暑气蒸人。', '盛夏时节，万物并秀。'],
  autumn: ['秋风送爽，金谷飘香。', '天高云淡，丹桂飘香。', '秋收时节，五谷丰登。'],
  winter: ['冬雪皑皑，万物蛰伏。', '寒风凛冽，天地萧瑟。', '岁暮天寒，围炉夜话。'],
};

/** 年度结束语句 */
const YEAR_END_TEMPLATES = [
  '桃源镇度过了平静的一年。',
  '这一年，小镇在风雨中稳步前行。',
  '回望本年，有欢笑也有泪水。',
  '岁月不居，时节如流。',
];

// ─── 编年史生成器 ─────────────────────

export class ChronicleGenerator {
  private state: WorldState;
  private rng: SeededRNG;

  constructor(state: WorldState, rng: SeededRNG) {
    this.state = state;
    this.rng = rng;
  }

  /**
   * 生成季节叙事条目。
   * 每季一条，描述天气和季节感。
   */
  generateSeasonEntry(): ChronicleEntry {
    const season = this.state.season;
    const weather = this.state.weather;
    const year = this.state.year;

    const opener = this.rng.pick(SEASON_OPENERS[season]);
    const weatherDesc = this.rng.pick(WEATHER_NARRATIVES[weather]);

    // 居民人数
    const aliveCount = this.state.agents.filter(a => a.alive).length;
    const populationNote = aliveCount > 10
      ? `镇上有 ${aliveCount} 人生活。`
      : `镇上仅有 ${aliveCount} 人居住。`;

    return {
      year,
      severity: 'peaceful',
      content: `${opener}${weatherDesc}。${populationNote}`,
    };
  }

  /**
   * 生成年度总结条目。
   * 包含人口变化、经济指标、重大事件统计。
   * 仅在冬季（winter）末生成。
   */
  generateYearSummary(): ChronicleEntry {
    const year = this.state.year;
    const agents = this.state.agents;
    const alive = agents.filter(a => a.alive);
    const dead = agents.filter(a => !a.alive);

    // 人口统计
    const births = agents.filter(a => a.born === year).length;
    const deaths = agents.filter(a => a.deathYear === year).length;

    // 年龄段统计
    const children = alive.filter(a => a.age < 14).length;
    const adults = alive.filter(a => a.age >= 14 && a.age < 60).length;
    const elderly = alive.filter(a => a.age >= 60).length;

    // 经济统计
    const totalWealth = alive.reduce((sum, a) => sum + (a.wealth ?? 0), 0);
    const avgWealth = alive.length > 0 ? Math.round(totalWealth / alive.length) : 0;
    const tradeVol = this.state.economy.annualTradeVolume;

    // 婚姻
    const married = alive.filter(a => a.family.spouse).length;
    const couples = Math.floor(married / 2);

    // 编年史条目数
    const chronicleCount = this.state.chronicle.length;

    // 叙事
    const severity: ChronicleEntry['severity'] = births > 0 || deaths > 0 ? 'notable' : 'peaceful';
    const closing = this.rng.pick(YEAR_END_TEMPLATES);

    const parts: string[] = [];
    parts.push(`【桃源镇 ${year} 年年终总结】`);
    parts.push(`人口 ${alive.length} 人（儿童 ${children} 人 / 成年 ${adults} 人 / 长者 ${elderly} 人），已婚 ${couples} 对。`);
    if (births > 0) parts.push(`本年新生儿 ${births} 人。`);
    if (deaths > 0) parts.push(`本年故去 ${deaths} 人。`);
    parts.push(`全年交易额 ${Math.round(tradeVol)} 文，人均财富 ${avgWealth} 文。`);
    parts.push(`编年史累计 ${chronicleCount} 条。`);
    parts.push(closing);

    return {
      year,
      severity,
      content: parts.join(' '),
    };
  }

  /**
   * 生成重大事件条目。
   */
  generateEventEntry(content: string, severity: ChronicleEntry['severity'] = 'notable'): ChronicleEntry {
    return {
      year: this.state.year,
      severity,
      content,
    };
  }

  /**
   * 从 currentYearChronicle 原始事件中提取 epochal 级别条目。
   * 用于处理外部系统传入的原始叙事文本。
   */
  processRawEvents(rawEvents: string[]): ChronicleEntry[] {
    const entries: ChronicleEntry[] = [];
    for (const event of rawEvents) {
      if (!event || event.trim().length === 0) continue;
      // 检测重要度关键词
      let severity: ChronicleEntry['severity'] = 'peaceful';
      if (event.includes('！！') || event.includes('重大')) severity = 'epochal';
      else if (event.includes('！') || event.includes('逝世') || event.includes('出生')) severity = 'dramatic';
      else if (event.includes('升级') || event.includes('发明') || event.includes('迁入')) severity = 'notable';

      entries.push({
        year: this.state.year,
        severity,
        content: event.trim(),
      });
    }
    return entries;
  }

  /**
   * 获取近期编年史摘要（最近5条）。
   */
  getRecentSummary(count: number = 5): string {
    const chron = this.state.chronicle.slice(-count);
    return chron.map(e => `[${e.year}年] ${e.content}`).join('\n');
  }

  /**
   * 统计各严重级别条目数。
   */
  getSeverityStats(): Record<string, number> {
    const stats: Record<string, number> = { peaceful: 0, notable: 0, dramatic: 0, epochal: 0 };
    for (const entry of this.state.chronicle) {
      stats[entry.severity] = (stats[entry.severity] ?? 0) + 1;
    }
    return stats;
  }
}

export default ChronicleGenerator;
