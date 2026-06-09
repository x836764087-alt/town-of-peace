/**
 * 雇佣系统（EmploymentSystem）— 桃源镇 v6.0
 *
 * 实现唐朝乡村的两种雇佣形式：
 *   1. 学徒制（长期）— 拜师仪式、三年出师、管吃管住、年底辛苦钱
 *   2. 短工/日结（临时）— 口头约定、做完付钱、无合同
 *
 * 设计原则：
 *   - 学徒制以年为单位跟踪，短工以周为单位跟踪
 *   - 学徒期间师傅管吃管住，没有正式工钱
 *   - 出师后可自立门户或继续当伙计（有周薪）
 *   - 短工口头约定，完工即付
 */

import type { WorldState, AgentState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { EVENTS, EventBus } from '../core/event-bus.js';

// ─── 常量定义 ──────────────────────────────

/** 学徒标准年限（年） */
export const APPRENTICESHIP_YEARS = 3;

/** 学徒最小年龄 */
export const MIN_APPRENTICE_AGE = 12;

/** 学徒最大年龄（超过此年龄难以拜师） */
export const MAX_APPRENTICE_AGE = 18;

/** 学徒每月口粮消耗（文）— 师傅承担 */
export const APPRENTICE_FOOD_COST_PER_YEAR = 36;

/** 年底辛苦钱比例 — 学徒期满后一次性发放 */
export const YEAR_END_BONUS_BASE = 10;

/** 短工每日工钱基准（文） */
export const SHORT_TERM_DAILY_WAGE = 5;

/** 短工默认工期（周） */
export const SHORT_TERM_DEFAULT_WEEKS = 2;

// ─── 类型定义 ──────────────────────────────

/** 学徒状态 */
export type ApprenticeshipStatus = 'apprentice' | 'journeyman' | 'independent';

/** 学徒制记录 */
export interface ApprenticeshipRecord {
  /** 全局唯一 ID */
  id: string;
  /** 师傅 agent id */
  masterId: string;
  /** 学徒 agent id */
  apprenticeId: string;
  /** 学习的技术 id */
  techId: string;
  /** 开始年份（模拟年） */
  startDate: number;
  /** 学制年限，默认 3 年 */
  apprenticeshipYears: number;
  /** 当前状态 */
  status: ApprenticeshipStatus;
  /** 出师后当伙计的周薪；独立门户后无薪 */
  wage: number;
  /** 累计已服务的年数 */
  yearsServed: number;
}

/** 短期工作记录 */
export type ShortTermJobStatus = 'active' | 'completed' | 'cancelled';

/** 短期雇佣记录（短工/日结） */
export interface ShortTermJob {
  /** 全局唯一 ID */
  id: string;
  /** 雇主 agent id */
  employerId: string;
  /** 工人 agent id */
  workerId: string;
  /** 做什么活（任务描述，如 '收割稻田'） */
  taskId: string;
  /** 工期（周） */
  durationWeeks: number;
  /** 已经过的周数 */
  weeksElapsed: number;
  /** 临时工钱（总价，管饭） */
  wage: number;
  /** 当前状态 */
  status: ShortTermJobStatus;
  /** 雇佣年份 */
  year: number;
}

/** 学徒叙事事件 */
export interface ApprenticeshipEvent {
  /** 师傅名称 */
  masterName: string;
  /** 学徒名称 */
  apprenticeName: string;
  /** 技术名称 */
  techId: string;
  /** 事件类型 */
  eventType: 'start' | 'complete' | 'journeyman';
  /** 叙事描述 */
  narrative: string;
}

/** 短期雇佣叙事事件 */
export interface ShortTermJobEvent {
  /** 雇主名称 */
  employerName: string;
  /** 工人名称 */
  workerName: string;
  /** 任务描述 */
  taskId: string;
  /** 叙事描述 */
  narrative: string;
}

// ─── 工具函数 ──────────────────────────────

/** 生成学徒记录 ID */
let nextApprenticeshipId = 0;

function generateApprenticeshipId(): string {
  return `appr-${++nextApprenticeshipId}`;
}

/** 重置学徒 ID 计数器（用于测试） */
export function resetApprenticeshipIdCounter(): void {
  nextApprenticeshipId = 0;
}

/** 生成短工记录 ID */
let nextJobId = 0;

function generateJobId(): string {
  return `job-${++nextJobId}`;
}

/** 重置短工 ID 计数器（用于测试） */
export function resetJobIdCounter(): void {
  nextJobId = 0;
}

/** 重置所有 ID 计数器（用于测试） */
export function resetAllIdCounters(): void {
  resetApprenticeshipIdCounter();
  resetJobIdCounter();
}

/** 查找想找学徒的 Agent */
export function findApprenticeSeekers(agents: AgentState[]): AgentState[] {
  return agents.filter(
    a => a.alive
      && a.age >= MIN_APPRENTICE_AGE
      && a.age <= MAX_APPRENTICE_AGE
      && !a.employer
      && !agents.some(
        x => x.alive
          && x.id !== a.id
          && x.skills.blacksmithing > 50
          && !x.tags.includes('already_master'),
      ),
  );
}

/** 查找有手艺可教人的师傅 */
export function findMasters(
  agents: AgentState[],
  techId: string,
): AgentState[] {
  const skillMap: Record<string, string> = {
    blacksmithing: 'blacksmithing',
    carpentry: 'carpentry',
    cooking: 'cooking',
    medicine: 'medicine',
    gardening: 'gardening',
    painting: 'painting',
    teaching: 'teaching',
  };

  const skillName = skillMap[techId] ?? techId;

  return agents.filter(
    a => a.alive
      && a.age >= 25
      && (a.skills[skillName] ?? 0) >= 50
      && !a.tags.includes('no_apprentices'),
  );
}

/**
 * 开始一段学徒制雇佣。
 *
 * 流程：拜师仪式 → 三年学艺 → 出师
 * 学徒期间师傅管吃管住，年底给辛苦钱。
 *
 * @param masterId 师傅 agent id
 * @param apprenticeId 学徒 agent id
 * @param techId 学习的技术
 * @param state 世界状态
 * @param records 学徒记录列表（就地修改）
 * @returns 叙事事件或 null（失败）
 */
export function startApprenticeship(
  masterId: string,
  apprenticeId: string,
  techId: string,
  state: WorldState,
  records: ApprenticeshipRecord[],
): ApprenticeshipEvent | null {
  const master = state.agents.find(a => a.id === masterId);
  const apprentice = state.agents.find(a => a.id === apprenticeId);

  if (!master?.alive) {
    return null;
  }
  if (!apprentice?.alive) {
    return null;
  }

  // 学徒年龄检查
  if (apprentice.age < MIN_APPRENTICE_AGE || apprentice.age > MAX_APPRENTICE_AGE) {
    return null;
  }

  // 师傅技能检查
  const requiredSkill = getRequiredSkill(techId);
  if ((master.skills[requiredSkill] ?? 0) < 50) {
    return null;
  }

  // 检查是否已有活跃学徒关系（同一人不能同时拜两个师）
  const existing = records.find(
    r => r.apprenticeId === apprenticeId
      && (r.status === 'apprentice')
      && (state.year - r.startDate) < r.apprenticeshipYears,
  );
  if (existing) {
    return null;
  }

  // 师傅不能已有同名技术的学徒（避免同时教多门）
  const existingTech = records.find(
    r => r.masterId === masterId
      && r.techId === techId
      && r.status === 'apprentice',
  );
  if (existingTech) {
    return null;
  }

  // 计算基础工资（出师后的周薪）
  const baseWage = Math.round((master.skills[requiredSkill] ?? 50) / 10);
  const wage = Math.max(5, Math.min(30, baseWage));

  // 创建学徒记录
  const record: ApprenticeshipRecord = {
    id: generateApprenticeshipId(),
    masterId,
    apprenticeId,
    techId,
    startDate: state.year,
    apprenticeshipYears: APPRENTICESHIP_YEARS,
    status: 'apprentice',
    wage,
    yearsServed: 0,
  };

  records.push(record);

  // 更新关系
  master.relationships[apprenticeId] = Math.min(100, (master.relationships[apprenticeId] ?? 0) + 20);
  apprentice.relationships[masterId] = Math.min(100, (apprentice.relationships[masterId] ?? 0) + 15);

  // 标记师傅
  master.tags = master.tags.filter(t => t !== 'no_apprentices');

  const masterName = master.title ? `${master.name}（${master.title}）` : master.name;
  const apprenticeName = apprentice.title ? `${apprentice.name}（${apprentice.name}）` : apprentice.name;

  const event: ApprenticeshipEvent = {
    masterName,
    apprenticeName,
    techId,
    eventType: 'start',
    narrative: `${masterName}收了${apprenticeName}为徒，传授${getTechName(techId)}技艺。`,
  };

  // 添加叙事到编年史
  state.chronicle.push({
    year: state.year,
    severity: 'notable',
    content: event.narrative,
  });

  return event;
}

/**
 * 完成学徒制（出师）。
 *
 * 学徒期满后，学徒可以选择：
 *   - 当伙计：继续在师傅手下工作，开始拿周薪
 *   - 自立门户：离开师傅，独立谋生
 *
 * @param apprenticeId 学徒 agent id
 * @param state 世界状态
 * @param records 学徒记录列表
 * @param chooseOption 'journeyman' | 'independent' — 出师后选择
 * @returns 叙事事件或 null（没有到期的学徒）
 */
export function completeApprenticeship(
  apprenticeId: string,
  state: WorldState,
  records: ApprenticeshipRecord[],
  chooseOption: 'journeyman' | 'independent' = 'independent',
): ApprenticeshipEvent | null {
  const apprentice = state.agents.find(a => a.id === apprenticeId);
  if (!apprentice?.alive) {
    return null;
  }

  // 找到该学徒的学徒记录
  const record = records.find(
    r => r.apprenticeId === apprenticeId
      && r.status === 'apprentice',
  );

  if (!record) {
    return null;
  }

  // 检查是否已满三年
  const yearsElapsed = state.year - record.startDate;
  if (yearsElapsed < record.apprenticeshipYears) {
    return null;
  }

  const master = state.agents.find(a => a.id === record.masterId);
  if (!master?.alive) {
    return null;
  }

  // 发放年底辛苦钱
  const bonus = YEAR_END_BONUS_BASE + Math.floor(master.wealth / 100);
  apprentice.wealth = (apprentice.wealth ?? 0) + bonus;
  master.wealth = Math.max(0, (master.wealth ?? 0) - bonus);

  // 根据选择更新状态
  let event: ApprenticeshipEvent;

  if (chooseOption === 'journeyman') {
    // 当伙计：继续跟师傅干活
    record.status = 'journeyman';
    apprentice.employer = master.id;
    master.employees = [...(master.employees ?? []), apprenticeId];

    const masterName = master.title ? `${master.name}（${master.title}）` : master.name;
    const apprenticeName = apprentice.title ? `${apprentice.name}（${apprentice.name}）` : apprentice.name;

    event = {
      masterName,
      apprenticeName,
      techId: record.techId,
      eventType: 'journeyman',
      narrative: `${apprenticeName}出师后，继续留在${masterName}手下当伙计，每周领取${record.wage}文。`,
    };
  } else {
    // 自立门户
    record.status = 'independent';
    apprentice.tags = [...apprentice.tags, 'independent'];

    const masterName = master.title ? `${master.name}（${master.title}）` : master.name;
    const apprenticeName = apprentice.title ? `${apprentice.name}（${apprentice.name}）` : apprentice.name;

    event = {
      masterName,
      apprenticeName,
      techId: record.techId,
      eventType: 'complete',
      narrative: `${apprenticeName}三年学成出师，在${masterName}的见证下自立门户，从此${getTechName(record.techId)}自给自足。`,
    };
  }

  // 添加到编年史
  state.chronicle.push({
    year: state.year,
    severity: 'notable',
    content: event.narrative,
  });

  return event;
}

/**
 * 雇用短期临时工（日结/短工）。
 *
 * 唐朝农村常见：雇主找力壮汉子干一天或几天的活，口头约定工钱，管饭。
 *
 * @param employerId 雇主 agent id
 * @param workerId 工人 agent id
 * @param taskId 做什么活（如 '收割稻田'）
 * @param wage 工钱（总价，文），不含饭钱
 * @param state 世界状态
 * @returns 短工记录或 null（失败）
 */
export function hireShortTerm(
  employerId: string,
  workerId: string,
  taskId: string,
  wage: number,
  state: WorldState,
  durationWeeks: number = SHORT_TERM_DEFAULT_WEEKS,
): ShortTermJob | null {
  const employer = state.agents.find(a => a.id === employerId);
  const worker = state.agents.find(a => a.id === workerId);

  if (!employer?.alive) {
    return null;
  }
  if (!worker?.alive) {
    return null;
  }

  // 工人必须年满 14 岁
  if (worker.age < 14) {
    return null;
  }

  // 工钱必须为正
  if (wage <= 0) {
    return null;
  }

  // 检查工人是否已有活跃短工
  const existing = state.__shortTermJobs?.find(
    j => j.workerId === workerId
      && j.status === 'active'
      && (state.year - j.year) * 52 + getWeekInYear(state) <= j.durationWeeks,
  );
  if (existing) {
    return null;
  }

  const job: ShortTermJob = {
    id: generateJobId(),
    employerId,
    workerId,
    taskId,
    durationWeeks,
    weeksElapsed: 0,
    wage,
    status: 'active',
    year: state.year,
  };

  // 存入世界状态（临时扩展）
  if (!state.__shortTermJobs) {
    state.__shortTermJobs = [];
  }
  state.__shortTermJobs.push(job);

  // 更新关系
  employer.relationships[workerId] = Math.min(100, (employer.relationships[workerId] ?? 0) + 5);
  worker.relationships[employerId] = Math.min(100, (worker.relationships[employerId] ?? 0) + 5);

  const employerName = employer.title ? `${employer.name}（${employer.title}）` : employer.name;
  const workerName = worker.title ? `${worker.title}「${worker.name}」` : worker.name;

  // 添加到编年史
  state.chronicle.push({
    year: state.year,
    severity: 'peaceful',
    content: `${employerName}雇了${workerName}去${taskId}，约定${wage}文工钱，管饭。`,
  });

  return job;
}

/**
 * 检查到期的学徒（到三年了）。
 *
 * 扫描所有活跃学徒，返回已满学制的记录。
 *
 * @param state 世界状态
 * @param records 学徒记录列表
 * @returns 到期的学徒记录列表
 */
export function checkApprenticeshipExpiry(
  state: WorldState,
  records: ApprenticeshipRecord[],
): ApprenticeshipRecord[] {
  return records.filter(
    r => r.status === 'apprentice'
      && (state.year - r.startDate) >= r.apprenticeshipYears,
  );
}

/**
 * 结算短期雇佣（完工付钱）。
 *
 * 短工期满后，雇主付钱给工人。
 *
 * @param jobId 短工记录 id
 * @param state 世界状态
 * @returns 叙事事件或 null（失败）
 */
export function completeShortTermJob(
  jobId: string,
  state: WorldState,
): ShortTermJobEvent | null {
  const jobs = state.__shortTermJobs ?? [];
  const job = jobs.find(j => j.id === jobId);

  if (!job || job.status !== 'active') {
    return null;
  }

  // 检查是否已完工
  const weeksElapsed = (state.year - job.year) * 52 + getWeekInYear(state);
  if (weeksElapsed < job.durationWeeks) {
    return null;
  }

  const employer = state.agents.find(a => a.id === job.employerId);
  const worker = state.agents.find(a => a.id === job.workerId);

  if (!employer?.alive || !worker?.alive) {
    job.status = 'cancelled';
    return null;
  }

  // 付钱
  if (employer.wealth >= job.wage) {
    employer.wealth -= job.wage;
    worker.wealth = (worker.wealth ?? 0) + job.wage;
    job.status = 'completed';
  } else {
    // 雇主没钱，按现有财产支付
    const paid = Math.max(0, employer.wealth);
    worker.wealth = (worker.wealth ?? 0) + paid;
    employer.wealth = 0;
    job.status = paid > 0 ? 'completed' : 'cancelled';

    if (paid === 0) {
      const event: ShortTermJobEvent = {
        employerName: employer.title ? `${employer.name}（${employer.title}）` : employer.name,
        workerName: worker.title ? `${worker.title}「${worker.name}」` : worker.name,
        taskId: job.taskId,
        narrative: `${employer.name}无力支付${job.wage}文工钱，${worker.name}白干了${job.durationWeeks}周的活。`,
      };
      state.chronicle.push({
        year: state.year,
        severity: 'dramatic',
        content: event.narrative,
      });
      return event;
    }
  }

  const employerName = employer.title ? `${employer.name}（${employer.title}）` : employer.name;
  const workerName = worker.title ? `${worker.title}「${worker.name}」` : worker.name;

  const event: ShortTermJobEvent = {
    employerName,
    workerName,
    taskId: job.taskId,
    narrative: `${workerName}完成了${job.taskId}，${employerName}付了${job.wage}文工钱。`,
  };

  state.chronicle.push({
    year: state.year,
    severity: 'peaceful',
    content: event.narrative,
  });

  return event;
}

/**
 * 取消一个未完成的短期雇佣。
 *
 * @param jobId 短工记录 id
 * @param state 世界状态
 * @returns 叙事事件或 null
 */
export function cancelShortTermJob(
  jobId: string,
  state: WorldState,
): ShortTermJobEvent | null {
  const jobs = state.__shortTermJobs ?? [];
  const job = jobs.find(j => j.id === jobId);

  if (!job || job.status !== 'active') {
    return null;
  }

  const employer = state.agents.find(a => a.id === job.employerId);
  const worker = state.agents.find(a => a.id === job.workerId);

  if (!employer?.alive || !worker?.alive) {
    job.status = 'cancelled';
    return null;
  }

  job.status = 'cancelled';
  const paid = Math.floor(job.wage * job.weeksElapsed / job.durationWeeks);
  if (paid > 0) {
    employer.wealth = Math.max(0, (employer.wealth ?? 0) - paid);
    worker.wealth = (worker.wealth ?? 0) + paid;
  }

  const employerName = employer.title ? `${employer.name}（${employer.title}）` : employer.name;
  const workerName = worker.title ? `${worker.title}「${worker.name}」` : worker.name;

  const event: ShortTermJobEvent = {
    employerName,
    workerName,
    taskId: job.taskId,
    narrative: `${employer.name}取消了${worker.name}的${job.taskId}工作。`,
  };

  state.chronicle.push({
    year: state.year,
    severity: 'peaceful',
    content: event.narrative,
  });

  return event;
}

/**
 * 按技术分类获取学徒记录。
 */
export function getApprenticeshipsByTech(
  records: ApprenticeshipRecord[],
  techId: string,
): ApprenticeshipRecord[] {
  return records.filter(r => r.techId === techId);
}

/**
 * 获取某位师傅的所有学徒记录。
 */
export function getApprenticeshipsByMaster(
  records: ApprenticeshipRecord[],
  masterId: string,
): ApprenticeshipRecord[] {
  return records.filter(r => r.masterId === masterId);
}

/**
 * 获取某位工人的所有活跃短工记录。
 */
export function getActiveShortTermJobs(
  state: WorldState,
  workerId: string,
): ShortTermJob[] {
  return (state.__shortTermJobs ?? []).filter(
    j => j.workerId === workerId && j.status === 'active',
  );
}

/**
 * 获取某位雇主的所有活跃短工记录。
 */
export function getEmployedShortTermJobs(
  state: WorldState,
  employerId: string,
): ShortTermJob[] {
  return (state.__shortTermJobs ?? []).filter(
    j => j.employerId === employerId && j.status === 'active',
  );
}

/**
 * 获取所有到期的学徒记录（用于季度检查）。
 */
export function getExpiringApprenticeships(
  records: ApprenticeshipRecord[],
  state: WorldState,
  weeksAhead: number = 0,
): ApprenticeshipRecord[] {
  return records.filter(r => {
    if (r.status !== 'apprentice') return false;
    const yearsElapsed = state.year - r.startDate;
    const remaining = r.apprenticeshipYears - yearsElapsed;
    const remainingWeeks = remaining * 52;
    return remainingWeeks <= weeksAhead;
  });
}

/**
 * 模拟一年内经过的周数（季度 → 周）
 * 每个季节约 13 周
 */
export function getWeekInYear(state: WorldState): number {
  switch (state.season) {
    case 'spring': return 13;
    case 'summer': return 26;
    case 'autumn': return 39;
    case 'winter': return 52;
  }
}

// ─── 技能/技术名称映射 ────────────────────────

/** 技术 id → 需要检查的技能名 */
function getRequiredSkill(techId: string): string {
  const map: Record<string, string> = {
    blacksmithing: 'blacksmithing',
    carpentry: 'carpentry',
    cooking: 'cooking',
    noodle_making: 'cooking',
    medicine: 'medicine',
    gardening: 'gardening',
    painting: 'painting',
    teaching: 'teaching',
    calligraphy: 'calligraphy',
  };
  return map[techId] ?? techId;
}

/** 技术 id → 中文名称 */
function getTechName(techId: string): string {
  const names: Record<string, string> = {
    blacksmithing: '打铁',
    carpentry: '木工',
    cooking: '烹饪',
    noodle_making: '做面',
    medicine: '医术',
    gardening: '园艺',
    painting: '绘画',
    teaching: '教学',
    calligraphy: '书法',
    accounting: '算账',
    herbalism: '采药',
    herbology: '草药',
  };
  return names[techId] ?? techId;
}

// ─── 导出默认 ────────────────────────────────

export default {
  APPRENTICESHIP_YEARS,
  MIN_APPRENTICE_AGE,
  MAX_APPRENTICE_AGE,
  SHORT_TERM_DAILY_WAGE,
  SHORT_TERM_DEFAULT_WEEKS,
  findApprenticeSeekers,
  findMasters,
  startApprenticeship,
  completeApprenticeship,
  checkApprenticeshipExpiry,
  hireShortTerm,
  completeShortTermJob,
  cancelShortTermJob,
  getApprenticeshipsByTech,
  getApprenticeshipsByMaster,
  getActiveShortTermJobs,
  getEmployedShortTermJobs,
  getExpiringApprenticeships,
  getWeekInYear,
  resetAllIdCounters,
};
