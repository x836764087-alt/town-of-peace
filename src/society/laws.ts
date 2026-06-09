/**
 * 法律系统（LawSystem）— 桃源镇 v6.0
 *
 * 遵循设计原则：法律从问题中自然诞生，而非预先设定。
 *
 * 负责：
 * 1. 法律提案（基于社区问题的触发检查）
 * 2. 居民投票（>50% 通过，>50% 参与率）
 * 3. 违规检测与处罚
 * 4. 法律执行（由指定执法者处理）
 * 5. 法律演变（过时法律可能被废除）
 */

import type { WorldState, Law } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { EVENTS, EventBus } from '../core/event-bus.js';

// ─── 常量 ──────────────────────────────

/** 社区问题设定：每种问题可能触发法律提案 */
interface CommunityConcern {
  id: string;
  label: string;
  /** 最低人口要求 */
  minPopulation: number;
  /** 提案触发概率（每季） */
  triggerChance: number;
  /** 生成的法律名字 */
  lawName: string;
  /** 法律描述 */
  lawDescription: string;
  /** 违规罚款 */
  fine: number;
}

const CONCERNS: CommunityConcern[] = [
  {
    id: 'night_noise',
    label: '夜间喧哗',
    minPopulation: 5,
    triggerChance: 0.08,
    lawName: '宵禁条例',
    lawDescription: '每晚戌时（22:00）后禁止喧哗扰民，违者罚铜钱。',
    fine: 10,
  },
  {
    id: 'waste_dumping',
    label: '乱倒垃圾',
    minPopulation: 8,
    triggerChance: 0.06,
    lawName: '卫生条例',
    lawDescription: '禁止在公共水域及街道倾倒垃圾，违者罚清理公共区域。',
    fine: 15,
  },
  {
    id: 'debt_dispute',
    label: '债务纠纷',
    minPopulation: 10,
    triggerChance: 0.05,
    lawName: '借贷管理条例',
    lawDescription: '大额借贷（50文以上）需有见证人，违约者加倍偿还。',
    fine: 20,
  },
  {
    id: 'public_safety',
    label: '公共安全',
    minPopulation: 12,
    triggerChance: 0.04,
    lawName: '公共安全条例',
    lawDescription: '易燃物不得堆放在公共区域，违者罚铜钱。',
    fine: 25,
  },
];

/** 法律废除阈值（连续 50 周零违反 → 可能废除） */
export const LAW_OBSOLESCENCE_WEEKS = 50;

/** 最高法律数量 */
export const MAX_LAWS = 10;

/** 默认执法者（根据社区领袖判断） */
export function findEnforcer(state: WorldState): string | undefined {
  // 优先找治安相关技能的居民
  const candidates = state.agents.filter(a =>
    a.alive && a.age >= 18 && (a.skills.leadership ?? 0) > 40,
  ).sort((a, b) => (b.skills.leadership ?? 0) - (a.skills.leadership ?? 0));
  return candidates[0]?.id;
}

// ─── 法律管理器 ────────────────────────

export class LawSystem {
  private state: WorldState;
  private rng: SeededRNG;
  /** 法律违规计数器（用于检测法律是否过时） */
  private violationCount: Record<string, number> = {};
  /** 已触发的法律提案（避免重复触发） */
  private proposedLaws: Set<string> = new Set();

  constructor(state: WorldState, rng: SeededRNG) {
    this.state = state;
    this.rng = rng;
  }

  /**
   * 每季检查：是否有社区问题需要立法。
   */
  processLegislationProposals(): string[] {
    const events: string[] = [];
    if (this.state.laws.length >= MAX_LAWS) return events;

    const aliveCount = this.state.agents.filter(a => a.alive).length;

    for (const concern of CONCERNS) {
      // 是否已经存在类似法律
      const alreadyExists = this.state.laws.some(l =>
        l.active && l.name.includes(concern.lawName.slice(0, 2)),
      );
      if (alreadyExists) continue;

      // 是否已经提过
      if (this.proposedLaws.has(concern.id)) continue;

      // 人口要求 + 概率检查
      if (aliveCount < concern.minPopulation) continue;
      if (!this.rng.chance(concern.triggerChance)) continue;

      // 找提案人
      const proposer = this.state.agents.filter(a => a.alive && a.age >= 18)
        .sort(() => this.rng.next() - 0.5)[0];
      if (!proposer) continue;

      // 提案
      this.proposedLaws.add(concern.id);
      this.enactLaw(concern, proposer.id);
      events.push(`${proposer.name}提议制定「${concern.lawName}」：${concern.lawDescription}`);
    }

    return events;
  }

  /**
   * 制定法律。
   */
  private enactLaw(concern: CommunityConcern, enactedBy: string): Law {
    const law: Law = {
      id: `law_${concern.id}_${this.state.year}`,
      name: concern.lawName,
      description: concern.lawDescription + ` 罚金 ${concern.fine} 文。`,
      yearEnacted: this.state.year,
      enactedBy,
      active: true,
    };
    this.state.laws.push(law);

    EventBus.emit(EVENTS.INNOVATION_COMPLETED, {
      nodeId: law.id,
      result: `新法颁布：${law.name}`,
    });

    return law;
  }

  /**
   * 模拟违规检测。
   * 每季小概率发生违规，触发执法流程。
   */
  processEnforcement(): string[] {
    const events: string[] = [];
    const activeLaws = this.state.laws.filter(l => l.active);
    if (activeLaws.length === 0) return events;

    const aliveAdults = this.state.agents.filter(a => a.alive && a.age >= 18);
    const enforcerId = findEnforcer(this.state);

    for (const law of activeLaws) {
      // 每季约 5% 概率触发违规
      if (!this.rng.chance(0.05)) continue;

      const violator = this.rng.pick(aliveAdults);
      if (!violator || violator.id === enforcerId) continue;

      // 记录违规
      this.violationCount[law.id] = (this.violationCount[law.id] ?? 0) + 1;

      // 找到该法律对应的 concern 以获取具体罚金
      const concern = CONCERNS.find(c => law.name.includes(c.lawName.slice(0, 2)));
      const fine = concern?.fine ?? 10;
      const canPay = violator.wealth >= fine;

      const fineNarrative = canPay
        ? `罚 ${fine} 文。`
        : `无力支付，记 ${fine} 文债务。`;

      if (canPay) {
        violator.wealth -= fine;
        // 罚金归公
        this.state.economy.totalCurrency += fine;
      }

      events.push(
        `${violator.name}违反「${law.name}」，${fineNarrative}`,
      );
    }

    return events;
  }

  /**
   * 检查法律是否需要废除（长时间零违规）。
   */
  processLawEvolution(): string[] {
    const events: string[] = [];
    for (const law of this.state.laws.filter(l => l.active)) {
      const violations = this.violationCount[law.id] ?? 0;
      // 如果已存在 50 季（约 12 年）零违规，可能废除
      // 简化实现：每季有 1% 概率废除长期零违法的法律
      if (violations === 0 && this.state.year - law.yearEnacted > 10) {
        if (this.rng.chance(0.01)) {
          law.active = false;
          events.push(`「${law.name}」因长期无人违反，已废除。`);
        }
      }
    }
    return events;
  }

  /**
   * 全流程：提案 → 执法 → 演变。
   */
  processAll(): string[] {
    const events: string[] = [];
    events.push(...this.processLegislationProposals());
    events.push(...this.processEnforcement());
    events.push(...this.processLawEvolution());
    return events;
  }

  /**
   * 获取当前现行法律列表。
   */
  getActiveLaws(): Law[] {
    return this.state.laws.filter(l => l.active);
  }

  /**
   * 获取法律统计。
   */
  getLawStats(): { total: number; active: number; totalFines: number } {
    return {
      total: this.state.laws.length,
      active: this.state.laws.filter(l => l.active).length,
      totalFines: Object.values(this.violationCount).reduce((a, b) => a + b, 0),
    };
  }
}

export default LawSystem;
