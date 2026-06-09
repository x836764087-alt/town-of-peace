/**
 * 谣言传播系统（RumorMill）— 桃源镇 v6.0
 *
 * Agent 之间自然传播的八卦、新闻、误解。
 * 谣言影响关系值、声誉和经济行为。
 *
 * 核心功能：
 *   1. 生成谣言种子（基于实际发生的事件）
 *   2. 在邻里间传播谣言
 *   3. 谣言变异（每次传播添加失真）
 *   4. 虚假谣言的自然消亡
 */

import type { WorldState, AgentState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 类型 ────────────────────────────────────────

export interface Rumor {
  id: string;
  /** 谣言主题（内容摘要） */
  topic: string;
  /** 谣言原始事实 */
  originalFact: string;
  /** 当前传播中的版本 */
  currentVersion: string;
  /** 造谣者 agent ID */
  originatorId: string;
  /** 当前已知此谣言的 agent IDs */
  knowers: Set<string>;
  /** 传播了多少轮 */
  spreadCount: number;
  /** 失真度（每次传播增加） */
  distortion: number;
  /** 生成时间 */
  year: number;
  /** 是否已消亡 */
  dead: boolean;
}

// ─── 常量 ────────────────────────────────────────

/** 每轮最多活跃谣言数 */
export const MAX_ACTIVE_RUMORS = 20;

/** 每轮最多新增谣言种子数 */
export const MAX_NEW_RUMORS_PER_TICK = 3;

/** 单次传播触达人数上限 */
export const SPREAD_TARGETS = 2;

/** 失真增量（每次传播） */
export const DISTORTION_INCREMENT = 0.1;

/** 最大失真度（超过则变为明显假消息） */
export const MAX_DISTORTION = 0.8;

/** 谣言每一轮的自然消亡概率 */
export const BASE_DEATH_CHANCE = 0.1;

let rumorCounter = 0;

// ─── 谣言工厂 ────────────────────────────────

export class RumorMill {
  private rumors: Rumor[] = [];

  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  // ─── 谣言生成 ─────────────────────────────

  /**
   * 基于事件构造谣言种子。
   * 可以从 events: string[] 中提取素材。
   */
  seedRumors(events: string[]): string[] {
    const seeded: string[] = [];
    let count = 0;

    for (const event of events) {
      if (count >= MAX_NEW_RUMORS_PER_TICK) break;
      if (!this.rng.chance(0.15)) continue; // 15% 概率变成谣言

      // 找一个相关 agent 作为造谣者
      const speakers = this.state.agents.filter(
        a => a.alive && a.age >= 13,
      );
      if (speakers.length === 0) continue;

      const originator = this.rng.pick(speakers)!;
      const rumor = this.createRumor(event, originator);
      this.rumors.push(rumor);

      const name = originator.title ? `${originator.name}（${originator.title}）` : originator.name;
      seeded.push(`${name}在散布谣言：「${rumor.currentVersion}」`);
      count++;
    }

    // 限制谣言数量
    this.pruneRumors();

    return seeded;
  }

  // ─── 谣言传播 ─────────────────────────────

  /**
   * 每季执行一次：活跃谣言在 agent 间传播。
   */
  processSpread(): string[] {
    const events: string[] = [];
    const alive = this.state.agents.filter(a => a.alive && a.age >= 13);

    for (const rumor of this.rumors) {
      if (rumor.dead) continue;

      // 传播给新的 knowers
      const potential = alive.filter(
        a => !rumor.knowers.has(a.id) && a.id !== rumor.originatorId,
      );
      // 随机选择 K 个潜在传播目标（shuffle 后取前 K）
      const shuffled = [...potential].sort(() => this.rng.int(0, 100) - 50);
      const targets = shuffled.slice(0, SPREAD_TARGETS);

      for (const target of targets) {
        rumor.knowers.add(target.id);

        // 关系影响：谣言内容影响听众对造谣者的看法
        const relShift = this.rng.int(-3, -1);
        target.relationships[rumor.originatorId] =
          (target.relationships[rumor.originatorId] ?? 0) + relShift;

        // 谣言变异
        rumor.distortion += DISTORTION_INCREMENT;
        rumor.currentVersion = this.distortMessage(rumor.originalFact, rumor.distortion);

        events.push(`${target.name}听说了「${rumor.currentVersion}」。`);
      }

      rumor.spreadCount++;

      // 消亡判定
      if (this.rng.chance(BASE_DEATH_CHANCE + rumor.distortion * 0.3)) {
        rumor.dead = true;
        events.push(`关于「${rumor.topic}」的传言渐渐无人提起。`);
      }
    }

    return events;
  }

  // ─── 查询 ─────────────────────────────────

  /**
   * 获取所有活跃谣言。
   */
  getActiveRumors(): Rumor[] {
    return this.rumors.filter(r => !r.dead);
  }

  /**
   * 获取某 agent 知道的谣言。
   */
  getKnownRumors(agentId: string): Rumor[] {
    return this.rumors.filter(r => !r.dead && r.knowers.has(agentId));
  }

  // ─── 内部方法 ─────────────────────────────

  private createRumor(eventText: string, originator: AgentState): Rumor {
    rumorCounter++;
    const topic = this.extractTopic(eventText);
    return {
      id: `rumor_${rumorCounter}`,
      topic,
      originalFact: eventText,
      currentVersion: this.distortMessage(eventText, 0.1),
      originatorId: originator.id,
      knowers: new Set([originator.id]),
      spreadCount: 0,
      distortion: 0.1,
      year: this.state.year,
      dead: false,
    };
  }

  /** 抽取谣言主题 */
  private extractTopic(event: string): string {
    // 简化：取前 12 个字
    return event.slice(0, 12) + (event.length > 12 ? '...' : '');
  }

  /** 模拟失真：加添油加醋 */
  private distortMessage(msg: string, distortion: number): string {
    const exaggerations = [
      '听说', '据传', '有人讲', '小道消息：',
    ];
    const suffixes = [
      '！', '，大家都这么说。', '，这还能有假？',
    ];

    if (distortion > 0.5 && this.rng.chance(0.3)) {
      // 严重失真：加情绪化修饰
      const prefix = this.rng.pick(exaggerations)!;
      const suffix = this.rng.pick(suffixes)!;
      return `${prefix}${msg}${suffix}`;
    }

    return `${this.rng.pick(exaggerations)}${msg}`;
  }

  /** 限制谣言队列大小 */
  private pruneRumors(): void {
    if (this.rumors.length <= MAX_ACTIVE_RUMORS) return;

    // 按活跃度排序，移除最老的
    this.rumors.sort((a, b) => {
      if (a.dead !== b.dead) return a.dead ? 1 : -1;
      return a.year - b.year;
    });
    this.rumors = this.rumors.slice(-MAX_ACTIVE_RUMORS);
  }
}

export default RumorMill;
