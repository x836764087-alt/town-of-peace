/**
 * 生命周期与健康系统 — 桃源镇 v6.0
 *
 * 处理：
 * 1. Agent 年龄阶段判定（婴儿→儿童→少年→成年→中年→老年）
 * 2. 各阶段的属性修正、行为能力
 * 3. 学堂教育（儿童→学堂）、学徒制（少年→拜师）
 * 4. 中年后属性自然衰退
 * 5. 疾病系统：具体疾病、传染、治疗
 * 6. 死亡率随年龄增长
 */

import type { AgentState, Condition, WorldState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { WORLD } from '../config/world.js';
import { EVENTS, EventBus } from '../core/event-bus.js';
import { getTechEffect } from '../world/world-effects.js';

// ─── 年龄阶段 ──────────────────────────────

export type LifeStage = 'infant' | 'child' | 'teen' | 'adult' | 'middle_aged' | 'elderly';
export const LIFE_STAGE_NAMES: Record<LifeStage, string> = {
  infant: '婴儿',
  child: '儿童',
  teen: '少年',
  adult: '成年',
  middle_aged: '中年',
  elderly: '老年',
};

export function getLifeStage(age: number): LifeStage {
  if (age < 4) return 'infant';
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  if (age < 40) return 'adult';
  if (age < 55) return 'middle_aged';
  return 'elderly';
}

/** 当前阶段是否可以独立工作/交易 */
export function canWork(stage: LifeStage): boolean {
  return stage === 'teen' || stage === 'adult' || stage === 'middle_aged' || stage === 'elderly';
}

/** 当前阶段是否可以上学（周建国的学堂） */
export function canAttendSchool(stage: LifeStage): boolean {
  return stage === 'child' || stage === 'teen';
}

/** 当前阶段是否可以结婚 */
export function canMarry(stage: LifeStage): boolean {
  return stage === 'teen' || stage === 'adult' || stage === 'middle_aged' || stage === 'elderly';
}

// ─── 疾病定义 ──────────────────────────────

export interface DiseaseDef {
  id: string;
  name: string;
  /** 基础致死率（0-1），受治疗和体质调整 */
  baseMortality: number;
  /** 传染性（0-1），0=不传染 */
  contagion: number;
  /** 治疗难度（0-1），0=容易，1=极难 */
  treatmentDifficulty: number;
  /** 是否传染 */
  infectious: boolean;
  /** 季节倾向 */
  seasonPreference?: string; // 'winter' | 'summer' | 'spring' | 'autumn'
  /** 描述 */
  description: string;
}

export const DISEASES: DiseaseDef[] = [
  {
    id: 'wound_infection',
    name: '伤口感染',
    baseMortality: 0.15,
    contagion: 0,
    treatmentDifficulty: 0.4,
    infectious: false,
    description: '外伤后细菌感染，无抗生素时可能致命',
  },
  {
    id: 'pneumonia',
    name: '肺痨/肺炎',
    baseMortality: 0.2,
    contagion: 0.3,
    treatmentDifficulty: 0.5,
    infectious: true,
    seasonPreference: 'winter',
    description: '肺部感染，寒冷季节高发，无抗生素难以治愈',
  },
  {
    id: 'dysentery',
    name: '痢疾',
    baseMortality: 0.1,
    contagion: 0.4,
    treatmentDifficulty: 0.3,
    infectious: true,
    seasonPreference: 'summer',
    description: '肠道感染，与饮水卫生相关，腹泻脱水可致命',
  },
  {
    id: 'childbirth_fever',
    name: '产后热',
    baseMortality: 0.2,
    contagion: 0,
    treatmentDifficulty: 0.6,
    infectious: false,
    description: '分娩后感染，无有效消毒手段时高发',
  },
  {
    id: 'cold_fever',
    name: '风寒发热',
    baseMortality: 0.02,
    contagion: 0.2,
    treatmentDifficulty: 0.15,
    infectious: true,
    seasonPreference: 'winter',
    description: '普通感冒，多数能自愈，但体弱者可能恶化',
  },
  {
    id: 'food_poisoning',
    name: '食物中毒',
    baseMortality: 0.05,
    contagion: 0,
    treatmentDifficulty: 0.2,
    infectious: false,
    description: '吃了变质食物，上吐下泻',
  },
  {
    id: 'arthritis',
    name: '关节炎',
    baseMortality: 0,
    contagion: 0,
    treatmentDifficulty: 0.5,
    infectious: false,
    description: '关节疼痛，寒冷天气加重，不可治愈但可缓解',
  },
  {
    id: 'hearing_loss',
    name: '听力衰退',
    baseMortality: 0,
    contagion: 0,
    treatmentDifficulty: 1,
    infectious: false,
    description: '长期噪音或年龄导致听力下降，不可逆转',
  },
  {
    id: 'hypertension',
    name: '高血压',
    baseMortality: 0.1,
    contagion: 0,
    treatmentDifficulty: 0.6,
    infectious: false,
    description: '可引发中风，中医平肝潜阳调理可控制',
  },
  {
    id: 'stroke',
    name: '中风',
    baseMortality: 0.3,
    contagion: 0,
    treatmentDifficulty: 0.8,
    infectious: false,
    description: '脑血管意外，高致死率，幸存者可能偏瘫',
  },
  {
    id: 'toothache',
    name: '牙痛',
    baseMortality: 0.005,
    contagion: 0,
    treatmentDifficulty: 0.3,
    infectious: false,
    description: '蛀牙或牙龈发炎，无牙医手段，剧痛影响进食',
  },
];

export function getDisease(id: string): DiseaseDef | undefined {
  return DISEASES.find(d => d.id === id);
}

// ─── 生命周期系统 ──────────────────────────

export class LifecycleSystem {
  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  /**
   * 执行生命周期阶段处理（每季度/每年调用）
   * 返回叙事事件列表
   */
  processLifecycle(): string[] {
    const events: string[] = [];

    for (const agent of this.state.agents) {
      if (!agent.alive) continue;

      // 健康安全下限：确保 health 不低于 1
      agent.stats.health = Math.max(1, agent.stats.health);
      agent.stats.maxHealth = Math.max(1, agent.stats.maxHealth);

      const stage = getLifeStage(agent.age);

      // 1. 婴儿阶段：留在家庭中，不独立行动
      if (stage === 'infant') {
        this.processInfant(agent, events);
      }

      // 2. 儿童阶段：可以上学
      if (stage === 'child' || stage === 'teen') {
        this.processSchoolAge(agent, events);
      }

      // 3. 中年后属性衰退
      if (stage === 'middle_aged' || stage === 'elderly') {
        this.processAgeDegradation(agent, stage, events);
      }

      // 4. 疾病处理（所有阶段）
      this.processDiseases(agent, events);

      // 5. 老年阶段：更高死亡率（在 populationPhase 中已有部分实现）
    }

    return events;
  }

  /** 婴儿处理：消耗粮食，不独立 */
  private processInfant(agent: AgentState, events: string[]): void {
    // 婴儿死亡率（每季）：0-4 岁按 INFANT_QUARTERLY_SURVIVAL_RATE 判定
    if (this.rng.chance(1 - WORLD.INFANT_QUARTERLY_SURVIVAL_RATE)) {
      agent.alive = false;
      agent.deathYear = this.state.year;
      agent.causeOfDeath = 'infant_mortality';
      EventBus.emit(EVENTS.AGENT_DIED, { agentId: agent.id, cause: 'infant_mortality' });
      events.push(`婴儿「${agent.name}」夭折了。`);
    } else if (agent.age === 4 && agent.born !== this.state.year) {
      events.push(`${agent.name}已经${agent.age}岁了，到了上学的年纪。`);
    }
  }

  /** 学龄处理：教育系统 + 学徒制 */
  private processSchoolAge(agent: AgentState, events: string[]): void {
    const school = this.state.buildings.find(b => b.id === 'school');
    const stage = getLifeStage(agent.age);

    if (stage === 'child') {
      // ── 儿童教育系统 ──
      const isAttendingSchool = agent.tags.includes('attending_school');

      // 初次上学
      if (!isAttendingSchool && this.rng.chance(0.3)) {
        agent.tags.push('attending_school');
        events.push(`${agent.name}开始到学堂读书认字。`);
        return;
      }

      if (!isAttendingSchool) return;

      // 辍学检查：家庭财富 < 50 时 50% 辍学
      const parents = agent.family.parents
        .map(pid => this.state.agents.find(a => a.id === pid))
        .filter(Boolean);
      const familyWealth = parents.reduce((sum, p) => sum + (p?.wealth ?? 0), 0);
      if (familyWealth < 50 && this.rng.chance(0.5)) {
        const idx = agent.tags.indexOf('attending_school');
        if (idx >= 0) agent.tags.splice(idx, 1);
        events.push(`${agent.name}因家境贫寒，不得不辍学。`);
        return;
      }

      // 教育效果（每年）
      // 智力提升 1-3 点
      const intGain = this.rng.int(1, 3);
      agent.stats.intelligence = Math.min(100, agent.stats.intelligence + intGain);

      // 如果有塾师（周建国），学习效率 ×1.5
      const hasTeacher = school && this.state.agents.some(a =>
        a.alive && a.id === 'zhou-jianguo' && a.title === '塾师',
      );
      if (hasTeacher && this.rng.chance(0.5)) {
        agent.stats.intelligence = Math.min(100, agent.stats.intelligence + 1);
      }

      // 父母技能传承：父母技能 >20 的，20% 概率传给孩子
      for (const parent of parents) {
        if (!parent) continue;
        for (const [skill, level] of Object.entries(parent.skills)) {
          if (level > 20 && this.rng.chance(0.2)) {
            agent.skills[skill] = Math.min(50, (agent.skills[skill] ?? 0) + 1);
          }
        }
      }

      // 识字率 literacy 每年 +5（上限 80）
      agent.skills.literacy = Math.min(80, (agent.skills.literacy ?? 0) + 5);
    }

    if (stage === 'teen') {
      // ── 少年学徒制 ──
      // 学徒收入：为成人 30-50%（在 economicPhase 中处理）
      agent.tags.push('apprentice');

      // 跟随父母学习技能
      const parents = agent.family.parents
        .map(pid => this.state.agents.find(a => a.id === pid))
        .filter(Boolean);
      for (const parent of parents) {
        if (!parent) continue;
        // 找父母最高技能
        let bestSkill = '';
        let bestLevel = 0;
        for (const [skill, level] of Object.entries(parent.skills)) {
          if (level > bestLevel) { bestSkill = skill; bestLevel = level; }
        }
        if (bestSkill && this.rng.chance(0.7)) {
          const parentCap = Math.round(bestLevel * 0.7);
          agent.skills[bestSkill] = Math.min(parentCap, (agent.skills[bestSkill] ?? 0) + 2);
        }
      }

      // 如果之前上过学，识字继续增长（增速减半）
      if (agent.tags.includes('attending_school') || (agent.skills.literacy ?? 0) > 0) {
        agent.skills.literacy = Math.min(80, (agent.skills.literacy ?? 0) + 2);
      }
    }
  }

  /** 中年/老年属性衰退 */
  private processAgeDegradation(agent: AgentState, stage: LifeStage, events: string[]): void {
    if (stage === 'middle_aged') {
      // 中年：力量每年 -1%，精力 -1%
      agent.stats.strength = Math.max(20, agent.stats.strength - 0.5);
      agent.stats.energy = Math.max(20, agent.stats.energy - 0.5);
    } else if (stage === 'elderly') {
      // 老年：多项属性衰退
      agent.stats.strength = Math.max(10, agent.stats.strength - 1);
      agent.stats.energy = Math.max(10, agent.stats.energy - 1);
      agent.stats.dexterity = Math.max(10, agent.stats.dexterity - 0.5);
      agent.stats.maxHealth = Math.max(20, agent.stats.maxHealth - 1);

      // 老年慢性病随机出现
      if (this.rng.chance(0.05)) {
        this.grantChronicCondition(agent);
      }
    }
  }

  /** 赋予慢性病 */
  private grantChronicCondition(agent: AgentState): void {
    const existing = agent.conditions.map(c => c.id);
    const available = DISEASES.filter(d => d.baseMortality === 0 && !existing.includes(d.id));
    if (available.length === 0) return;
    const disease = this.rng.pick(available);
    agent.conditions.push({
      id: disease.id,
      name: disease.name,
      severity: this.rng.int(20, 60),
      duration: 0, // 0 = 永久
    });
  }

  /** 疾病处理 */
  private processDiseases(agent: AgentState, events: string[]): void {
    for (let i = agent.conditions.length - 1; i >= 0; i--) {
      const cond = agent.conditions[i];
      const def = getDisease(cond.id);
      if (!def) continue;

      if (def.baseMortality === 0) {
        // 慢性病：不致命，但影响生活
        // 关节炎影响 dexterity, 听力影响社交等
        this.applyChronicEffect(agent, cond, def);
      } else {
        // 急性病：可能致命，需要治疗
        this.processAcuteIllness(agent, cond, def, events);
      }

      // 持续时间减少（非慢性病）
      if (cond.duration > 0) {
        cond.duration--;
        if (cond.duration <= 0) {
          events.push(`${agent.name}的${cond.name}痊愈了。`);
          agent.conditions.splice(i, 1);
        }
      }
    }
  }

  /** 慢性病效果 */
  private applyChronicEffect(agent: AgentState, cond: Condition, def: DiseaseDef): void {
    switch (def.id) {
      case 'arthritis':
        agent.stats.dexterity = Math.max(10, agent.stats.dexterity - cond.severity / 100);
        break;
      case 'hearing_loss':
        // 听力影响社交
        break;
      case 'hypertension':
        // 每年有小概率触发中风
        if (this.rng.chance(0.02)) {
          agent.conditions.push({
            id: 'stroke',
            name: '中风',
            severity: this.rng.int(50, 90),
            duration: 0,
          });
        }
        break;
    }
  }

  /** 急性病处理 */
  private processAcuteIllness(agent: AgentState, cond: Condition, def: DiseaseDef, events: string[]): void {
    // 是否有医生治疗？
    const doctor = this.state.agents.find(a =>
      a.alive && (a.title === '女医' || a.title === '接生婆' || a.skills.medicine > 30),
    );

    const treated = doctor && doctor.id !== agent.id;
    let mortality = def.baseMortality;

    // 治疗修正
    if (treated) {
      const skill = doctor?.skills.medicine ?? 0;
      mortality = Math.max(0.01, mortality - skill / 500); // 每点医术降低 0.2% 致死率
      // 消耗药品
      if (doctor) {
        const herbs = doctor.inventory.items.herbal_medicine ?? 0;
        if (herbs > 0) {
          doctor.inventory.items.herbal_medicine = herbs - 1;
          mortality *= 0.7; // 有药降低 30% 致死率
        }
      }
    }

    // 体质修正
    mortality *= (100 - agent.stats.health) / 100;

    // 致死判定
    if (this.rng.chance(mortality)) {
      agent.alive = false;
      agent.deathYear = this.state.year;
      agent.causeOfDeath = cond.name;
      events.push(`${agent.name}因${cond.name}不治身亡。`);
    } else if (this.rng.chance(0.3)) {
      // 病情好转，受医学科技影响恢复速度
      const healthMod = getTechEffect(this.state, 'health_recovery');
      cond.severity = Math.max(0, cond.severity - Math.round(this.rng.int(10, 30) * healthMod));
      if (cond.severity <= 0) {
        events.push(`${agent.name}的${cond.name}好转了。`);
        agent.conditions.splice(agent.conditions.indexOf(cond), 1);
      }
    }
  }

  /**
   * 处理职业意外死亡。
   * 根据角色职业分配不同的意外概率：
   * - 矿工/石匠 (mining)：高风险，使用 ACCIDENT_SKILLED_RATE
   * - 铁匠/工匠 (blacksmithing, carpentry)：中等风险，ACCIDENT_BASE_RATE + 0.005
   * - 农民/渔夫 (farming, fishing)：低风险，ACCIDENT_BASE_RATE
   * - 其他/无职业：ACCIDENT_BASE_RATE
   *
   * 在春季（season === 'spring'）检查。
   * 返回死亡事件描述数组。
   */
  processAccidents(): string[] {
    const events: string[] = [];
    const isSpring = this.state.season === 'spring';
    if (!isSpring) return events;

    // 职业→技能名映射（用于叙事显示）
    const occSkillName: Record<string, string> = {
      mining: '矿工',
      stone_mining: '石匠',
      blacksmithing: '铁匠',
      carpentry: '木匠',
      farming: '农民',
      fishing: '渔夫',
    };

    // 各职业的技能名 → 风险等级
    const highRiskSkills = new Set(['mining', 'stone_mining']);
    const mediumRiskSkills = new Set(['blacksmithing', 'carpentry']);
    const lowRiskSkills = new Set(['farming', 'fishing']);

    for (const agent of this.state.agents) {
      if (!agent.alive) continue;
      if (agent.age <= 12) continue; // 儿童不参与劳动

      // 根据技能找出职业，确定意外概率
      let accidentChance = WORLD.ACCIDENT_BASE_RATE;
      const skills = agent.skills;
      let primaryOcc: string | undefined;

      // 找最高技能，用于判断职业
      let bestSkill = '';
      let bestLevel = 0;
      for (const [skill, level] of Object.entries(skills)) {
        if (level > bestLevel) {
          bestSkill = skill;
          bestLevel = level;
        }
      }

      // 如果最高技能匹配已知职业，使用对应的概率
      if (highRiskSkills.has(bestSkill)) {
        accidentChance = WORLD.ACCIDENT_BASE_RATE + 0.01;
        primaryOcc = occSkillName[bestSkill];
      } else if (mediumRiskSkills.has(bestSkill)) {
        accidentChance = WORLD.ACCIDENT_BASE_RATE + 0.005;
        primaryOcc = occSkillName[bestSkill];
      } else if (lowRiskSkills.has(bestSkill)) {
        accidentChance = WORLD.ACCIDENT_BASE_RATE;
        primaryOcc = occSkillName[bestSkill];
      }

      // 无已知职业则 primaryOcc 保持 undefined
      const occName = primaryOcc || '无业';
      if (this.rng.chance(accidentChance)) {
        agent.alive = false;
        events.push(`${agent.name}（${occName}）不幸因工伤事故身亡。`);
      }
    }
    return events;
  }

  /**
   * 感染季节性流行病（批量，由事件触发）
   */
  infectSeasonalDisease(diseaseId: string): string[] {
    const events: string[] = [];
    const def = getDisease(diseaseId);
    if (!def || !def.infectious) return events;

    const susceptible = this.state.agents.filter(a =>
      a.alive && !a.conditions.some(c => c.id === diseaseId),
    );

    for (const agent of susceptible) {
      if (this.rng.chance(def.contagion * 0.5)) {
        agent.conditions.push({
          id: def.id,
          name: def.name,
          severity: this.rng.int(30, 70),
          duration: this.rng.int(2, 5),
        });
        events.push(`${agent.name}染上了${def.name}。`);
      }
    }
    return events;
  }

  /**
   * 获取角色特有的起始健康条件（建镇时设置）
   */
  static getInitialConditions(agentId: string): Condition[] {
    switch (agentId) {
      case 'wang-xiuzhi':
        return [{ id: 'arthritis', name: '关节炎', severity: 40, duration: 0 }];
      case 'zhang-dashan':
        return [{ id: 'hearing_loss', name: '听力衰退', severity: 30, duration: 0 }];
      case 'zhou-jianguo':
        return [{ id: 'hypertension', name: '高血压', severity: 35, duration: 0 }];
      case 'zhao-changhe':
        return [{ id: 'toothache', name: '牙痛', severity: 20, duration: 2 }]; // 牙痛不是永久
      case 'chen-zhijie':
        return [{ id: 'toothache', name: '肩伤旧患', severity: 15, duration: 0 }]; // 左肩旧伤
      default:
        return [];
    }
  }
}
