/**
 * 叙事模板系统（NarrativeTemplates）— 桃源镇 v6.0
 *
 * 为 chronicle 条目、对话、事件描述提供格式化模板。
 * 使叙事输出更丰富多样，避免机械重复。
 */

import { SeededRNG } from '../core/rng.js';

// ─── 模板集 ─────────────────────────────────────

type TemplateTable = Record<string, string[]>;

const TEMPLATES: TemplateTable = {
  // ── 季节更替 ──
  seasonSpring: [
    '冰雪消融，春回大地。',
    '柳树抽芽，桃花含苞。',
    '春雨绵绵，滋润万物。',
  ],
  seasonSummer: [
    '烈日当空，蝉鸣不止。',
    '炎炎夏日，农田需要灌溉。',
    '夏日的雷雨来得快也去得快。',
  ],
  seasonAutumn: [
    '金秋时节，稻谷飘香。',
    '落叶纷飞，秋意渐浓。',
    '收获的季节，人人面带喜色。',
  ],
  seasonWinter: [
    '寒风凛冽，大雪纷飞。',
    '冬日的炉火温暖了镇子。',
    '白雪覆盖了屋顶和街道。',
  ],

  // ── 人口事件 ──
  birth: [
    '一个新生命在 {agent} 家诞生了。',
    '{agent} 家添丁了，是个健康的孩子。',
    '婴儿的啼哭声给小镇带来了新的希望。',
  ],
  death: [
    '{agent} 离开了人世，小镇失去了一位居民。',
    '大家哀悼 {agent} 的离去。',
    '{agent} 的葬礼在雨中举行，令人恸容。',
  ],
  marriage: [
    '{agentA} 和 {agentB} 喜结连理。',
    '一对新人在镇上成婚，全城欢庆。',
  ],

  // ── 时代见证 ──
  milestone: [
    '小镇的人口突破了 {n} 人。',
    '这是第 {n} 个年头，小镇有了家园的模样。',
    '时光荏苒，小镇已历经 {n} 个春秋。',
  ],

  // ── 日常 ──
  daily: [
    '{agent} 在街上遇到了 {other}。',
    '{agent} 去河边打水。',
    '{agent} 在田里劳作了一整天。',
    '{agent} 在铁匠铺打铁。',
    '{agent} 在集市上叫卖货物。',
  ],

  // ── 恶劣事件 ──
  disaster: [
    '一场风暴席卷了小镇，所幸无人重伤。',
    '持续的干旱让庄稼减产了。',
    '一场火灾烧毁了部分房屋。',
  ],

  // ── 喜事 ──
  celebration: [
    '全镇上下喜气洋洋。',
    '人们聚在一起庆祝，欢声笑语不绝。',
    '{agent} 的成就让大家引以为傲。',
  ],
};

// ─── 叙事模板 ────────────────────────────────

export class NarrativeTemplates {
  constructor(private rng: SeededRNG) {}

  /**
   * 从模板集中随机选取一条模板。
   */
  pick(templateKey: string, vars?: Record<string, string | number>): string {
    const pool = TEMPLATES[templateKey];
    if (!pool || pool.length === 0) return `[缺少模板：${templateKey}]`;

    let text = this.rng.pick(pool);
    if (vars) {
      for (const [key, val] of Object.entries(vars)) {
        text = text.replace(`{${key}}`, String(val));
      }
    }
    return text;
  }

  /**
   * 获取某个季节的描述。
   */
  seasonTransition(season: string): string {
    const key = `season${season.charAt(0).toUpperCase() + season.slice(1)}`;
    return this.pick(key);
  }

  /**
   * 生成人口里程碑事件描述。
   */
  populationMilestone(count: number): string {
    return this.pick('milestone', { n: count });
  }

  /**
   * 生成日常事件描述。
   */
  dailyEncounter(agent: string, other: string): string {
    return this.pick('daily', { agent, other });
  }
}

export default NarrativeTemplates;
