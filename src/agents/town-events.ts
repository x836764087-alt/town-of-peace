/**
 * 城镇事件系统（TownEvents）— 桃源镇 v6.0
 *
 * 自动化生成影响全城的随机事件：自然灾害、重大发现、外来者等。
 *
 * 核心功能：
 *   1. 按季节/概率生成随机事件
 *   2. 事件对 Agent 状态产生实际影响
 *   3. 事件叙事化输出
 */

import type { WorldState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

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
  {
    type: 'conflict', severity: 'minor',
    title: '小纠纷', description: '街坊因琐事发生口角。',
    baseChance: 0.08,
    effect: (state, rng) => {
      const alive = state.agents.filter(a => a.alive);
      if (alive.length < 2) return [];
      const a = rng.pick(alive);
      const b = rng.pick(alive.filter(x => x.id !== a.id));
      if (!a || !b) return [];
      a.relationships[b.id] = (a.relationships[b.id] ?? 0) - 10;
      b.relationships[a.id] = (b.relationships[a.id] ?? 0) - 10;
      return [`${a.name}与${b.name}因琐事发生口角。`];
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
          agent.stats.health = Math.max(0, agent.stats.health - 10);
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
}

export default TownEvents;
