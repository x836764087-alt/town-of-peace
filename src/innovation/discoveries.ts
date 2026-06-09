/**
 * 发现事件系统（DiscoveryEvents）— 桃源镇 v6.0
 *
 * 自动化生成与创新树相关的随机发现事件。
 * Agent 在研究某项技术时可能触发发现事件，产生额外成果或副作用。
 */

import type { WorldState, TechNode } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { INNOVATION_TREE } from '../config/innovation-tree.js';
import type { InnovationNode } from '../config/innovation-tree.js';

// ─── 常量 ────────────────────────────────────────

/** 每季最多发现事件数 */
export const MAX_DISCOVERIES_PER_TICK = 2;

/** 发现新品种时的品质分布 */
const DISCOVERY_QUALITIES = ['粗糙', '普通', '精良', '稀有'] as const;

// ─── 发现事件 ────────────────────────────────

export class DiscoveryEvents {
  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  /**
   * 每季执行一次发现事件：
   * 1. 随机选一个有研究能力的 Agent
   * 2. 尝试对某个可研究节点进行探索
   * 3. 成功则记录到 state.innovations
   */
  processDiscoveries(): string[] {
    const events: string[] = [];
    let count = 0;

    // 找有研究能力的 Agent（intelligence >= 4）
    const researchers = this.state.agents.filter(
      a => a.alive && a.age >= 16 && a.stats.intelligence >= 4,
    );
    if (researchers.length === 0) return events;

    // 随机选一些研究者尝试发现
    const shuffled = [...researchers].sort(() => this.rng.int(0, 100) - 50);
    for (const researcher of shuffled) {
      if (count >= MAX_DISCOVERIES_PER_TICK) break;
      if (!this.rng.chance(0.08)) continue; // 8% 概率

      const result = this.attemptDiscovery(researcher.id);
      if (result) {
        events.push(result);
        count++;
      }
    }

    return events;
  }

  /**
   * 尝试让某 Agent 进行一次发现。
   */
  attemptDiscovery(agentId: string): string | undefined {
    const agent = this.state.agents.find(a => a.id === agentId);
    if (!agent?.alive) return undefined;

    const researchedIds = new Set(this.state.innovations.map(i => i.id));

    // 找可研究节点：前提满足 + 未研究
    const candidates = INNOVATION_TREE.filter(node => {
      if (researchedIds.has(node.id)) return false;
      // 使用 config 中的 prereqsSatisfied 检查前提
      return node.requires.every(req => researchedIds.has(req));
    });

    if (candidates.length === 0) return undefined;

    // 加权选择（选概率高的更容易先被发现）
    const weights = candidates.map(n => n.probability * 100);
    const target = this.rng.weightedPick(candidates, weights);

    // 技能等级检查
    const skillLevel = agent.stats.intelligence;
    if (skillLevel < target.skillThreshold) return undefined;

    // 成功还是失败（钳制到 0–1 范围）
    const effectiveProb = Math.min(target.probability * (1 + skillLevel * 0.05), 1);
    const success = this.rng.chance(effectiveProb);

    const agentName = agent.title ? `${agent.name}（${agent.title}）` : agent.name;

    if (success) {
      // 发现成功 → 记录到 state.innovations
      this.state.innovations.push({
        id: target.id,
        name: target.name,
        description: target.description,
        discoveredYear: this.state.year,
        discoveredBy: agentId,
      } as TechNode);

      const quality = this.rng.pick([...DISCOVERY_QUALITIES]);
      const itemsUnlocked = target.unlocks.slice(0, 2).join('、');
      return `🔬 ${agentName}${quality}地发现了「${target.name}」！${itemsUnlocked ? `解锁了${itemsUnlocked}。` : ''}`;
    } else {
      // 尝试失败但有收获
      if (this.rng.chance(0.3)) {
        agent.stats.intelligence = Math.min(20, agent.stats.intelligence + 1);
        return `${agentName}尝试研究「${target.name}」未成功，但增长了见识。`;
      }
      return undefined;
    }
  }

  /**
   * 返回 Agent 的研究能力描述。
   */
  getResearchCapability(agentId: string): string {
    const agent = this.state.agents.find(a => a.id === agentId);
    if (!agent) return '未知';

    const int = agent.stats.intelligence;
    if (int >= 8) return '天赋异禀';
    if (int >= 6) return '聪慧过人';
    if (int >= 4) return '资质平平';
    return '愚钝';
  }
}

export default DiscoveryEvents;
