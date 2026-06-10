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

import type { WorldState, Law, AgentState } from '../core/types.js';
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

/** 苦役折算季度（每年 4 季，苦役 1 年 = 4 季） */
const LABOUR_SERVICE_QUARTERS = 4;

/** 默认里正（赵长河）的 agent id */
const TOWN_LEADER_ID = 'zhao-changhe';

/** 默认执法者（根据社区领袖判断） */
export function findEnforcer(state: WorldState): string | undefined {
  // 优先找治安相关技能的居民
  const candidates = state.agents.filter(a =>
    a.alive && a.age >= 18 && (a.skills.leadership ?? 0) > 40,
  ).sort((a, b) => (b.skills.leadership ?? 0) - (a.skills.leadership ?? 0));
  return candidates[0]?.id;
}

/** 获取审判官：优先里正，其次找最高 leadership 的活着的成年居民 */
function findJudge(state: WorldState): AgentState | undefined {
  const aliveAdults = state.agents.filter(a => a.alive && a.age >= 18);
  if (aliveAdults.length === 0) return undefined;
  // 优先赵长河
  const judge = aliveAdults.find(a => a.id === TOWN_LEADER_ID);
  if (judge) return judge;
  // 否则找最高 leadership
  aliveAdults.sort((a, b) => (b.skills.leadership ?? 0) - (a.skills.leadership ?? 0));
  return aliveAdults[0];
}

/** 审判判决 */
export interface TrialJudgment {
  verdict: 'fine' | 'labour' | 'exile';
  fine: number;
  narrative: string;
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

      // 犯罪潮影响：crimeWave 每 10 点增加 50% 触发概率
      const crimeBoost = 1 + (this.state.crimeWave ?? 0) / 20;
      const adjustedChance = Math.min(1, concern.triggerChance * crimeBoost);
      if (!this.rng.chance(adjustedChance)) continue;

      // 找提案人
      const proposer = this.state.agents.filter(a => a.alive && a.age >= 18)
        .sort(() => this.rng.next() - 0.5)[0];
      if (!proposer) continue;

      // 提案
      this.proposedLaws.add(concern.id);
      // 如果这是公共安全法，清除 pending 标记
      if (concern.id === 'public_safety') {
        this.state.pendingPublicOrderLaw = false;
      }
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
   * 审判流程：里正主持，根据犯罪次数判罚。
   * @param thiefId 被抓住的犯案者
   * @param victimId 受害者
   */
  conductTrial(thiefId: string, victimId: string): TrialJudgment {
    const thief = this.state.agents.find(a => a.id === thiefId);
    const victim = this.state.agents.find(a => a.id === victimId);
    const judge = findJudge(this.state);

    if (!thief || !victim) {
      return { verdict: 'fine', fine: 0, narrative: '无法审判' };
    }

    const judgeName = judge?.name ?? '里正';

    // 累加犯罪次数
    thief.crimes = (thief.crimes ?? 0) + 1;

    // 社会关系影响：受害者/审判官与犯案者的关系越好，判罚越轻
    const victimRelation = victim.relationships[thiefId] ?? 0;
    const judgeRelation = judge?.relationships?.[thiefId] ?? 0;
    const favorMod = Math.max(0.5, 1 - (Math.max(victimRelation, judgeRelation) / 100));

    if (thief.crimes >= 3) {
      // 3次+ → 驱逐
      thief.alive = false;
      thief.causeOfDeath = 'exiled';
      const msg = `${judgeName}宣判：${thief.name}屡教不改（第${thief.crimes}次犯案），驱逐出镇！`;
      return { verdict: 'exile', fine: 0, narrative: msg };
    }

    if (thief.crimes >= 2) {
      // 2次 → 苦役 1 年
      if (!thief.tags) thief.tags = [];
      if (!thief.tags.includes('labour_service')) {
        thief.tags.push('labour_service');
      }
      // 苦役影响：幸福感大幅降低
      thief.stats.happiness = Math.max(0, (thief.stats.happiness ?? 50) - 30);
      const msg = `${judgeName}宣判：${thief.name}再犯（第${thief.crimes}次），判苦役一年！`;
      return { verdict: 'labour', fine: 0, narrative: msg };
    }

    // 首次 → 罚款（受关系影响）
    const baseFine = this.rng.int(30, 50);
    const fine = Math.round(baseFine * favorMod);
    const canPay = thief.wealth >= fine;
    if (canPay) {
      thief.wealth -= fine;
      this.state.economy.totalCurrency += fine;
    } else {
      // 无力支付则记债，转为口头警告
      thief.wealth = Math.max(0, thief.wealth - fine / 2);
    }
    const fineMsg = canPay
      ? `${thief.name}缴纳了 ${fine} 文罚款。`
      : `${thief.name}无力支付 ${fine} 文罚款，减半缴纳 ${Math.round(fine/2)} 文。`;
    const msg = `${judgeName}宣判：${thief.name}偷窃罪成立（第1次犯案），${fineMsg}`;
    return { verdict: 'fine', fine, narrative: msg };
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
