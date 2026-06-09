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
    // 婴儿从家庭粮食中消耗（由父代 food consumption 覆盖）
    // 婴儿不产生独立事件，除非到了成长节点
    if (agent.age === 4 && agent.born !== this.state.year) {
      events.push(`${agent.name}已经${agent.age}岁了，到了上学的年纪。`);
    }
  }

  /** 学龄处理：是否可以上学 */
  private processSchoolAge(agent: AgentState, events: string[]): void {
    const school = this.state.buildings.find(b => b.id === 'school');
    if (!school) return;

    const isAttendingSchool = agent.tags.includes('attending_school');
    const stage = getLifeStage(agent.age);

    // 初次上学（儿童阶段）
    if (stage === 'child' && !isAttendingSchool && this.rng.chance(0.3)) {
      agent.tags.push('attending_school');
      events.push(`${agent.name}开始到学堂跟周建国读书认字。`);
    }

    // 少年阶段：可以从学徒制开始
    if (stage === 'teen' && !agent.skills || Object.keys(agent.skills).length === 0) {
      // 少年没有技能的可以开始学手艺
      // 这部分后续由 apprenticeship system 处理
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
      // 病情好转
      cond.severity = Math.max(0, cond.severity - this.rng.int(10, 30));
      if (cond.severity <= 0) {
        events.push(`${agent.name}的${cond.name}好转了。`);
        agent.conditions.splice(agent.conditions.indexOf(cond), 1);
      }
    }
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
