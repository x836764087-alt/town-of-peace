/**
 * 城镇事件系统（TownEvents）— 桃源镇 v6.0
 *
 * 自动化生成影响全城的随机事件：自然灾害、重大发现、外来者等。
 * 含社会冲突系统（Phase 1 升级）
 *
 * 核心功能：
 *   1. 按季节/概率生成随机事件
 *   2. 事件对 Agent 状态产生实际影响
 *   3. 社会冲突：偷盗/争吵/斗殴/纵火
 *   4. 冲突频率受全镇幸福感调节
 *   5. 事件叙事化输出
 */

import type { WorldState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { LawSystem } from '../society/laws.js';

// ─── 事件类型 ─────────────────────────────────

export interface TownEvent {
  id: string;
  type: TownEventType;
  title: string;
  description: string;
  severity: 'minor' | 'notable' | 'dramatic';
  /** 受影响的 agent IDs */
  affectedAgents: string[];
}

export type TownEventType =
  | 'disaster'      // 自然灾害（洪水/火灾/暴风雪）
  | 'discovery'     // 重大发现（矿藏/文物/新技法）
  | 'visitor'       // 外来者（游商/难民/旅人）
  | 'celebration'   // 喜庆事件（丰收/婚礼/新生儿潮）
  | 'conflict'      // 冲突（纠纷/偷盗/斗殴）
  ;

let eventCounter = 0;

// ─── 辅助函数 ──────────────────────────────────

/** 计算全镇平均幸福感（0-100） */
function avgHappiness(state: WorldState): number {
  const alive = state.agents.filter(a => a.alive);
  if (alive.length === 0) return 50;
  return alive.reduce((sum, a) => sum + a.stats.happiness, 0) / alive.length;
}

/** 检查是否有治安法 */
function hasPublicOrderLaw(state: WorldState): boolean {
  return state.laws?.some(l =>
    l.name.includes('治安') || l.name.includes('防盗') || l.name.includes('秩序'),
  ) ?? false;
}

/** 获取冲突概率修正系数（幸福感越低冲突越高） */
function conflictModifier(state: WorldState): number {
  const happiness = avgHappiness(state);
  // happiness 50 → 1.0x, happiness 20 → 2.0x, happiness 80 → 0.6x
  return Math.max(0.3, 2.0 - happiness / 50);
}

// ─── 事件配置 ─────────────────────────────────

interface EventDef {
  type: TownEventType;
  title: string;
  description: string;
  severity: TownEvent['severity'];
  /** 基础触发概率（每季） */
  baseChance: number;
  /** 事件的条件函数（返回 true 才可能触发） */
  condition?: (state: WorldState) => boolean;
  /** 影响函数（修改 state 并返回受影响 agent IDs） */
  effect: (state: WorldState, rng: SeededRNG) => string[];
}

const EVENT_TEMPLATES: EventDef[] = [
  // ── 轻微事件 ──
  {
    type: 'celebration', severity: 'minor',
    title: '邻里小聚', description: '有人家设宴，街坊同乐。',
    baseChance: 0.12,
    effect: (state, rng) => {
      const alive = state.agents.filter(a => a.alive);
      if (alive.length === 0) return [];
      const host = rng.pick(alive);
      for (const a of state.agents) {
        if (a.id !== host.id && a.alive) {
          a.stats.happiness = Math.min(100, a.stats.happiness + 2);
          a.relationships[host.id] = (a.relationships[host.id] ?? 0) + 2;
        }
      }
      return [host.name + '家设宴，邻里纷纷前来。'];
    },
  },

  // ── 社会冲突事件 ──

  // 争吵（~5%/季，受幸福感调节）
  {
    type: 'conflict', severity: 'minor',
    title: '口角之争', description: '两人因琐事发生争吵。',
    baseChance: 0.05,
    condition: (state) => state.agents.filter(a => a.alive).length >= 2,
    effect: (state, rng) => {
      const alive = state.agents.filter(a => a.alive);
      if (alive.length < 2) return [];
      // 概率受幸福感调节
      const mod = conflictModifier(state);
      if (!rng.chance(mod)) return [];

      const a = rng.pick(alive);
      const b = rng.pick(alive.filter(x => x.id !== a.id));
      if (!a || !b) return [];

      // 关系值越低越容易吵
      const rel = a.relationships[b.id] ?? 0;
      if (rel > 10) return []; // 关系好的不吵

      a.relationships[b.id] = Math.max(-100, (a.relationships[b.id] ?? 0) - rng.int(10, 20));
      b.relationships[a.id] = Math.max(-100, (b.relationships[a.id] ?? 0) - rng.int(10, 20));
      a.stats.happiness = Math.max(0, a.stats.happiness - 5);
      b.stats.happiness = Math.max(0, b.stats.happiness - 5);

      // 犯罪潮上升（轻微）
      state.crimeWave = Math.min(100, (state.crimeWave ?? 0) + 5);

      // 有围观者站队（只有在场人数多于2时才有围观）
      const bystanderCandidates = alive.filter(x => x.id !== a.id && x.id !== b.id);
      if (bystanderCandidates.length > 0) {
        const bystander = rng.pick(bystanderCandidates);
        bystander.relationships[a.id] = (bystander.relationships[a.id] ?? 0) - rng.int(1, 5);
        bystander.relationships[b.id] = (bystander.relationships[b.id] ?? 0) - rng.int(1, 5);
      }

      return [`${a.name}与${b.name}因琐事发生激烈争吵。`];
    },
  },

  // 偷盗（~3%/季）
  {
    type: 'conflict', severity: 'notable',
    title: '偷窃', description: '有人趁夜偷走了财物。',
    baseChance: 0.03,
    condition: (state) => {
      const alive = state.agents.filter(a => a.alive);
      // 必须有穷人(wealth<20)和富人(wealth>30)
      return alive.some(a => a.wealth < 20) && alive.some(a => a.wealth > 30);
    },
    effect: (state, rng) => {
      const alive = state.agents.filter(a => a.alive);
      const mod = conflictModifier(state);
      if (!rng.chance(mod)) return [];

      // 找贼（最穷的）
      const thief = rng.pick(alive.filter(a => a.wealth < 20));
      // 找目标（最富的几个之一）
      const target = rng.pick(alive.filter(a => a.wealth > 30 && a.id !== thief?.id));
      if (!thief || !target) return [];

      // 偷窃
      const stolen = rng.int(1, 5); // 1-5 单位粮食
      const actual = Math.min(stolen, Math.floor((target.inventory.items.rice ?? 0) / 2));
      if (actual <= 0) return [];

      target.inventory.items.rice = (target.inventory.items.rice ?? 0) - actual;
      thief.inventory.items.rice = (thief.inventory.items.rice ?? 0) + actual;
      thief.wealth = (thief.wealth ?? 0) + rng.int(1, 3);

      // 被抓概率：有治安法时 60%，否则 30%
      const hasLaw = hasPublicOrderLaw(state);
      const caught = rng.chance(hasLaw ? 0.6 : 0.3);

      if (caught) {
        // 关系恶化（保留社会后果）
        target.relationships[thief.id] = Math.max(-100, (target.relationships[thief.id] ?? 0) - 30);
        thief.relationships[target.id] = Math.max(-100, (thief.relationships[target.id] ?? 0) - 20);
        // 犯罪潮上升
        state.crimeWave = Math.min(100, (state.crimeWave ?? 0) + 10);
        // 受害者家族关系下降
        for (const childId of target.family.children) {
          const child = state.agents.find(a => a.id === childId);
          if (child?.alive) {
            child.relationships[thief.id] = Math.max(-100, (child.relationships[thief.id] ?? 0) - 15);
          }
        }
        // 正式审判
        const lawSystem = new LawSystem(state, rng);
        const judgment = lawSystem.conductTrial(thief.id, target.id);
        return [`${thief.name}偷了${target.name}家的粮食，被当场抓获！`, judgment.narrative];
      } else {
        // 没抓到
        target.wealth = Math.max(0, target.wealth - actual);
        target.stats.happiness = Math.max(0, target.stats.happiness - 10);
        return [`${target.name}家粮食被偷了${actual}斤，没找到贼。`];
      }
    },
  },

  // 斗殴（~0.5%/季）
  {
    type: 'conflict', severity: 'dramatic',
    title: '斗殴', description: '两人大打出手，有人受伤。',
    baseChance: 0.005,
    condition: (state) => state.agents.filter(a => a.alive).length >= 2,
    effect: (state, rng) => {
      const alive = state.agents.filter(a => a.alive);
      const mod = conflictModifier(state);
      if (!rng.chance(mod)) return [];

      const a = rng.pick(alive);
      const b = rng.pick(alive.filter(x => x.id !== a.id));
      if (!a || !b) return [];

      // 关系极差才打
      const relA = a.relationships[b.id] ?? 0;
      if (relA > -20) return [];

      // 互殴伤害
      const dmgA = rng.int(5, 15);
      const dmgB = rng.int(5, 15);
      a.stats.health = Math.max(1, a.stats.health - dmgA);
      b.stats.health = Math.max(1, b.stats.health - dmgB);
      a.stats.happiness = Math.max(0, a.stats.happiness - 20);
      b.stats.happiness = Math.max(0, b.stats.happiness - 20);
      a.relationships[b.id] = -100;
      b.relationships[a.id] = -100;

      // 犯罪潮大幅上升
      state.crimeWave = Math.min(100, (state.crimeWave ?? 0) + 20);

      // 旁观者站队
      const bystanderCandidates = alive.filter(x => x.id !== a.id && x.id !== b.id);
      for (let i = 0; i < 3 && i < bystanderCandidates.length; i++) {
        const idx = rng.int(0, bystanderCandidates.length - 1);
        const bystander = bystanderCandidates[idx];
        bystander.relationships[a.id] = (bystander.relationships[a.id] ?? 0) - rng.int(3, 10);
        bystander.relationships[b.id] = (bystander.relationships[b.id] ?? 0) - rng.int(3, 10);
      }

      return [`${a.name}与${b.name}大打出手！${a.name}${dmgA > 10 ? '伤得不轻' : '受了点伤'}，${b.name}${dmgB > 10 ? '伤得不轻' : '受了点伤'}。`];
    },
  },

  // 纵火（~0.1%/季，极端情况）
  {
    type: 'disaster', severity: 'dramatic',
    title: '纵火', description: '有人恶意纵火！',
    baseChance: 0.001,
    condition: (state) => {
      const alive = state.agents.filter(a => a.alive).length;
      return alive >= 5 && avgHappiness(state) < 30; // 幸福感极低时才有可能
    },
    effect: (state, rng) => {
      const events: string[] = [];
      // 找一个极不满的 agent
      const angry = rng.pick(state.agents.filter(a => a.alive && a.stats.happiness < 20));
      if (!angry) return [];

      // 烧一栋建筑
      const target = rng.pick(state.buildings.filter(b => b.level > 0));
      if (!target) return [];

      target.level = Math.max(1, target.level - 2);
      angry.stats.happiness = Math.max(0, angry.stats.happiness + 10); // 发泄后的满足感
      angry.relationships[target.ownerId ?? ''] = (angry.relationships[target.ownerId ?? ''] ?? 0) - 50;

      // 全镇震惊
      for (const agent of state.agents) {
        if (agent.alive) {
          agent.stats.happiness = Math.max(0, agent.stats.happiness - 5);
        }
      }

      // 犯罪潮飙升
      state.crimeWave = Math.min(100, (state.crimeWave ?? 0) + 40);

      events.push(`震惊！${target.name}被人纵火焚烧，损失惨重！`);
      events.push(`经查是${angry.name}所为，全镇为之震惊。`);
      return events;
    },
  },

  // ── 中等事件 ──
  {
    type: 'discovery', severity: 'notable',
    title: '新发现', description: '有人发现了有价值的自然资源。',
    baseChance: 0.06,
    condition: (state) => state.agents.filter(a => a.alive).length >= 5,
    effect: (state, rng) => {
      const finder = rng.pick(state.agents.filter(a => a.alive));
      if (!finder) return [];
      finder.wealth = (finder.wealth ?? 0) + rng.int(10, 30);
      finder.stats.happiness = Math.min(100, finder.stats.happiness + 10);
      return [`${finder.name}在野外发现了有价值的资源，赚了${rng.int(10, 30)}文。`];
    },
  },
  {
    type: 'visitor', severity: 'notable',
    title: '外来旅人', description: '路过的旅人在镇上歇脚。',
    baseChance: 0.05,
    condition: (state) => state.agents.filter(a => a.alive).length >= 5,
    effect: (state, rng) => {
      const host = rng.pick(state.agents.filter(a => a.alive));
      if (!host) return [];
      host.wealth = (host.wealth ?? 0) + rng.int(3, 10);
      // 散布一些外界信息（关系影响）
      for (const a of state.agents) {
        if (a.alive && a.id !== host.id) {
          a.relationships[host.id] = (a.relationships[host.id] ?? 0) + 1;
        }
      }
      return [`有位旅人在镇上歇脚，${host.name}招待了他。`];
    },
  },

  // ── 重大事件 ──
  {
    type: 'disaster', severity: 'dramatic',
    title: '暴风雨', description: '一场猛烈的暴风雨袭击了小镇。',
    baseChance: 0.04,
    condition: (state) => state.season === 'summer' || state.season === 'autumn',
    effect: (state, rng) => {
      const events: string[] = [];
      for (const building of state.buildings) {
        // 30% 概率建筑受损
        if (rng.chance(0.3)) {
          building.level = Math.max(1, building.level - 1);
          events.push(`${building.name}在暴风雨中受损。`);
        }
      }
      // 有人受轻伤
      for (const agent of state.agents) {
        if (agent.alive && rng.chance(0.15)) {
          agent.stats.health = Math.max(1, agent.stats.health - 10);
          events.push(`${agent.name}在暴风雨中受了伤。`);
        }
      }
      return events;
    },
  },
  {
    type: 'celebration', severity: 'dramatic',
    title: '大丰收', description: '全镇喜迎大丰收，粮仓满溢。',
    baseChance: 0.03,
    condition: (state) => state.season === 'autumn',
    effect: (state, rng) => {
      for (const agent of state.agents) {
        if (!agent.alive) continue;
        agent.inventory.items.rice = (agent.inventory.items.rice ?? 0) + rng.int(5, 15);
        agent.stats.happiness = Math.min(100, agent.stats.happiness + 15);
        agent.stats.health = Math.min(100, agent.stats.health + 5);
      }
      return ['全镇喜迎大丰收！粮仓满溢，人人笑逐颜开。'];
    },
  },
];

// ─── 城镇事件系统 ──────────────────────────

export class TownEvents {
  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  /**
   * 每季处理一次城镇事件。
   * 遍历事件模板，按概率触发适用的事件。
   */
  processEvents(): string[] {
    const events: string[] = [];

    // 犯罪潮指数每季衰减（先衰减再触发新事件）
    this.state.crimeWave = Math.max(0, (this.state.crimeWave ?? 0) - 8);

    // 犯罪潮后续影响（衰减后检查）
    const cw = this.state.crimeWave ?? 0;
    if (cw > 0) {
      this.applyCrimeAftermath(cw, events);
    }

    // 对每个事件模板，判断是否触发
    for (const template of EVENT_TEMPLATES) {
      // 检查条件
      if (template.condition && !template.condition(this.state)) continue;

      // 概率判定
      if (!this.rng.chance(template.baseChance)) continue;

      // 执行效果
      eventCounter++;
      const effectLines = template.effect(this.state, this.rng);

      for (const line of effectLines) {
        events.push(line);
      }

      // 重大事件最多触发一个
      if (template.severity === 'dramatic') break;
    }

    return events;
  }

  /**
   * 根据犯罪潮指数施加全镇后续影响。
   * @param cw 当前犯罪潮指数（已衰减）
   * @param events 用于追加叙事事件
   */
  private applyCrimeAftermath(cw: number, events: string[]): void {
    // 所有活着的 agent  happiness -2
    const affectedAgents: string[] = [];
    for (const agent of this.state.agents) {
      if (!agent.alive) continue;
      const drop = cw > 70 ? 3 : 2;
      agent.stats.happiness = Math.max(0, agent.stats.happiness - drop);
      affectedAgents.push(agent.name);
    }

    // 中等以上犯罪潮：通报治安恶化
    if (cw > 50) {
      events.push(`社会治安持续恶化，居民安全感下降。`);
    }

    // 严重犯罪潮：自动提出公共安全法
    if (cw > 70 && !this.state.pendingPublicOrderLaw) {
      this.state.pendingPublicOrderLaw = true;
      events.push(`治安恶化到令人不安的程度，居民纷纷呼吁政府制定公共安全法。`);
    }
  }
}

export default TownEvents;
