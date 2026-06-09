/**
 * 知识传承系统 — 桃源镇 v6.0
 *
 * 基于跨代积累机制，让技术知识不因居民死亡而凭空消失。
 *
 * 知识传承四要素（飞书文档 section 十二.3）：
 *   1. 文字记录 — 写了才能留下来  (周建国的日记、小林的实验笔记)
 *   2. 师徒传授 — 教了才能学会    (学徒制)
 *   3. 实物遗存 — 东西在就能仿制   (留下的原型)
 *   4. 集体记忆 — 大家记得这件事   (陈老爷爷当年点亮过一盏灯)
 *
 * 失传规则：
 *   - 仅有集体记忆 + 记忆者死亡 → 失传
 *   - 仅有文字记录 + 记录者死亡 → 失传
 *   - 有师徒传授 → 徒弟继承，记录者死也不失传
 *   - 有实物遗存 → 后人可仿制（永不失传）
 *   - 有文字记录 + 实物遗存 → 即使记录者死，后人可仿制
 *
 * 集体记忆衰减：
 *   - 每年有 5% 概率遗忘一段集体记忆
 *   - 每次有新事件发生时，旧记忆重要性降低
 */

import type { AgentState, WorldState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { EVENTS, EventBus } from '../core/event-bus.js';

// ─── 常量定义 ──────────────────────────────

/** 集体记忆每年遗忘概率 */
export const COLLECTIVE_MEMORY_FORGET_CHANCE = 0.05;

/** 知识记录的最大存活年数（无其他载体时） */
export const KNOWLEDGE_MAX_AGE = 50;

// ─── 类型定义 ──────────────────────────────

/** 知识记录的四种载体类型 */
export type KnowledgeRecordType = 'written' | 'apprenticeship' | 'artifact' | 'collective_memory';

/** 知识记录的四种载体名（中文） */
export const KNOWLEDGE_TYPE_NAMES: Record<KnowledgeRecordType, string> = {
  written: '文字记录',
  apprenticeship: '师徒传授',
  artifact: '实物遗存',
  collective_memory: '集体记忆',
};

/** 一条知识记录 */
export interface KnowledgeRecord {
  /** 全局唯一 ID */
  id: string;
  /** 载体类型 */
  type: KnowledgeRecordType;
  /** 内容描述 */
  content: string;
  /** 持有者/记录者 agent id */
  holderId: string;
  /** 死亡后记录失效的年数（从 holder 死亡年起算） */
  expires: number;
  /** 关联的技术节点 id */
  techId: string;
  /** 创建时的模拟年份 */
  createdYear: number;
  /** 是否已被继承/继承过（用于师徒传授） */
  inherited: boolean;
  /** 已继承的学徒 agent id 列表 */
  apprentices: string[];
  /** 集体记忆的重要性权重（初始 1.0，随事件衰减） */
  importance: number;
}

/** 知识失传信息 */
export interface KnowledgeLostInfo {
  /** 失传的知识记录 ID */
  recordId: string;
  /** 关联的技术节点 id */
  techId: string;
  /** 技术名称 */
  techName: string;
  /** 失传原因 */
  reason: string;
  /** 失去该知识记录的 agent id */
  holderId: string;
  /** 载体类型名 */
  typeName: string;
}

/** 知识传承事件信息 */
export interface KnowledgeTransferInfo {
  /** 从谁传给谁 */
  fromAgentId: string;
  /** 传给谁 */
  toAgentId: string;
  /** 技术节点 id */
  techId: string;
  /** 载体类型 */
  type: KnowledgeRecordType;
  /** 叙事描述 */
  narrative: string;
}

// ─── 工具函数 ──────────────────────────────

/** 生成知识记录 ID */
let nextRecordId = 0;

function generateRecordId(): string {
  return `kr-${++nextRecordId}`;
}

/** 重置记录 ID 计数器（用于测试） */
export function resetRecordIdCounter(): void {
  nextRecordId = 0;
}

// ─── 核心功能 ──────────────────────────────

/**
 * 创建一条知识记录。
 *
 * @param techId 关联的技术节点 id
 * @param type   载体类型
 * @param holderId 持有者/记录者
 * @param content 内容描述
 * @param currentYear 当前模拟年份（用于计算 expires）
 * @param maxAge 最大存活年数，默认 KNOWLEDGE_MAX_AGE
 */
export function createRecord(
  techId: string,
  type: KnowledgeRecordType,
  holderId: string,
  content: string,
  currentYear: number,
  maxAge: number = KNOWLEDGE_MAX_AGE,
): KnowledgeRecord {
  // 不同载体类型的默认过期年数
  let expires: number;
  switch (type) {
    case 'written':
      // 文字记录：载体本身可长期存在，但如果记录者死且无备份则 20 年内可能失传
      expires = currentYear + 20;
      break;
    case 'apprenticeship':
      // 师徒传授：师傅死也不失传，只要徒弟还在
      expires = currentYear + maxAge; // 徒弟继承后按徒弟寿命算
      break;
    case 'artifact':
      // 实物遗存：东西在就能仿制，永不失传
      expires = currentYear + 9999;
      break;
    case 'collective_memory':
      // 集体记忆：记录者死后 10 年内会因遗忘而逐渐消失
      expires = currentYear + 10;
      break;
  }

  return {
    id: generateRecordId(),
    type,
    content,
    holderId,
    expires,
    techId,
    createdYear: currentYear,
    inherited: type === 'apprenticeship', // 师徒传授默认已"传授"
    apprentices: type === 'apprenticeship' ? [] : undefined as unknown as string[],
    importance: 1.0,
  };
}

/**
 * 检查 Agent 能否获取某项知识。
 *
 * 判断依据：
 *   - 如果 Agent 自身 skills 中已有该技术的对应技能 → 直接返回 true
 *   - 如果存在有效的 KnowledgeRecord（记录者活着，或记录未过期）→ 可以获取
 *   - 师徒传授：即使师傅死了，徒弟也会
 *   - 实物遗存：永远存在，所有人都能接触
 */
export function canAccessKnowledge(
  agentId: string,
  techId: string,
  state: WorldState,
  records: KnowledgeRecord[],
): boolean {
  const agent = state.agents.find(a => a.id === agentId);
  if (!agent) return false;

  // Agent 自身已有相关技能
  const techNode = state.innovations.find(t => t.id === techId);
  if (techNode) {
    const requiredSkill = techNode.requiredSkill;
    if (agent.skills && agent.skills[requiredSkill] >= techNode.requiredSkillLevel) {
      return true;
    }
  }

  const validRecords = getValidRecords(records, state, techId);

  for (const record of validRecords) {
    // 实物遗存：所有人可接触
    if (record.type === 'artifact') {
      return true;
    }

    // 师徒传授：检查 Agent 是否在学徒列表中
    if (record.type === 'apprenticeship') {
      if (record.apprentices.includes(agentId)) {
        return true;
      }
      // 师傅还活着的情况
      const holder = state.agents.find(a => a.id === record.holderId);
      if (holder?.alive) {
        return true;
      }
      // 师傅死了，但学徒继承了
      const aliveApprentices = record.apprentices
        .map(aid => state.agents.find(a => a.id === aid))
        .filter((a): a is AgentState => !!a && a.alive);
      if (aliveApprentices.length > 0) {
        // 徒弟还活着，知识在传承链中
        continue; // 对徒弟来说 already handled above
      }
    }

    // 文字记录/集体记忆：持有者活着则可直接获取
    if (record.type === 'written' || record.type === 'collective_memory') {
      const holder = state.agents.find(a => a.id === record.holderId);
      if (holder?.alive) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 从一组记录中筛选出仍然"有效"的记录。
 *
 * 有效定义：
 *   - 持有者还活着，或
 *   - 记录未过期（当前年份 < expires），或
 *   - 是实物遗存（永不失效）
 */
function getValidRecords(
  records: KnowledgeRecord[],
  state: WorldState,
  techId?: string,
): KnowledgeRecord[] {
  const filtered = records.filter(r => techId ? r.techId === techId : true);
  const now = state.year;

  return filtered.filter(record => {
    // 实物遗存永远有效
    if (record.type === 'artifact') return true;

    const holder = state.agents.find(a => a.id === record.holderId);

    // 持有者还活着 → 有效
    if (holder?.alive) return true;

    // 持有者死了，但记录未过期 → 有效
    if (now < record.expires) return true;

    // 师徒传授：检查是否有活着的学徒
    if (record.type === 'apprenticeship') {
      const hasAliveApprentice = record.apprentices.some(
        aid => {
          const apprentice = state.agents.find(a => a.id === aid);
          return !!apprentice?.alive;
        },
      );
      if (hasAliveApprentice) return true;
    }

    return false;
  });
}

/**
 * 检查是否有知识会随死亡失传。
 *
 * 返回所有将失传的知识记录列表。
 *
 * 失传判定：
 *   - 集体记忆：记忆者死亡 → 失传
 *   - 文字记录：记录者死亡，且无其他有效记录 → 失传
 *   - 师徒传授：师傅死亡但徒弟活着 → 不失传
 *   - 实物遗存：永不失传
 */
export function checkKnowledgeLoss(
  state: WorldState,
  records: KnowledgeRecord[],
  techTree: { id: string; name: string }[],
): KnowledgeLostInfo[] {
  const now = state.year;
  const lost: KnowledgeLostInfo[] = [];

  for (const record of records) {
    const holder = state.agents.find(a => a.id === record.holderId);
    if (holder?.alive) continue; // 持有者还活着，不会失传

    const techName = techTree.find(t => t.id === record.techId)?.name ?? record.techId;

    // 实物遗存永不失传
    if (record.type === 'artifact') continue;

    // 师徒传授：检查是否有活着的学徒
    if (record.type === 'apprenticeship') {
      const hasAliveApprentice = record.apprentices.some(
        aid => state.agents.some(a => a.id === aid && a.alive),
      );
      if (hasAliveApprentice) continue; // 徒弟在，不失传
      // 所有学徒都已死亡 → 师徒传授链断裂，知识失传
      lost.push({
        recordId: record.id,
        techId: record.techId,
        techName,
        reason: `师徒传授链断裂：师傅「${holder?.name ?? '未知'}」与所有学徒均已离世`,
        holderId: record.holderId,
        typeName: KNOWLEDGE_TYPE_NAMES[record.type],
      });
      continue;
    }

    // 集体记忆：记忆者死亡 → 失传
    if (record.type === 'collective_memory') {
      lost.push({
        recordId: record.id,
        techId: record.techId,
        techName,
        reason: `${holder?.name ?? '未知'}已死亡，集体记忆逐渐遗忘`,
        holderId: record.holderId,
        typeName: KNOWLEDGE_TYPE_NAMES[record.type],
      });
      continue;
    }

    // 文字记录：记录者死亡且已过期 → 失传
    if (record.type === 'written' && now >= record.expires) {
      // 检查是否有其他载体（实物遗存或师徒传授）覆盖同一技术
      const hasBackup = records.some(
        r => r.techId === record.techId
          && (r.type === 'artifact' || r.type === 'apprenticeship')
          && getValidRecords([r], state, record.techId).length > 0,
      );
      if (!hasBackup) {
        lost.push({
          recordId: record.id,
          techId: record.techId,
          techName,
          reason: `文字记录随记录者「${holder?.name ?? '未知'}」离世而失传`,
          holderId: record.holderId,
          typeName: KNOWLEDGE_TYPE_NAMES[record.type],
        });
      }
    }
  }

  return lost;
}

/**
 * Agent 死亡时处理知识传承。
 *
 * - 集体记忆 → 立即标记为即将失传（importance 降为 0）
 * - 文字记录 → 标记为过期（expires 设为当年）
 * - 师徒传授 → 学徒继承（如果已有学徒）
 * - 实物遗存 → 不受影响
 *
 * @returns 传承事件列表
 */
export function onAgentDeath(
  agentId: string,
  state: WorldState,
  records: KnowledgeRecord[],
): KnowledgeTransferInfo[] {
  const transfers: KnowledgeTransferInfo[] = [];

  for (const record of records) {
    if (record.holderId !== agentId) continue;

    const agent = state.agents.find(a => a.id === agentId);
    const agentName = agent?.name ?? '未知';

    switch (record.type) {
      case 'collective_memory':
        // 集体记忆：记忆者死亡 → 记忆逐渐遗忘，立即失效
        record.expires = state.year;
        break;

      case 'written':
        // 文字记录：记录者死亡 → 记录本身还在，但失去维护者
        // expires 已设为 currentYear + 20，不受影响
        // 但如果有学徒可以继承
        const writtenApprentices = record.apprentices ?? [];
        if (writtenApprentices.length > 0) {
          const aliveApprentices = record.apprentices
            .filter(aid => state.agents.some(a => a.id === aid && a.alive));
          if (aliveApprentices.length > 0) {
            // 由活着的学徒继承记录
            for (const apprenticeId of aliveApprentices) {
              const apprentice = state.agents.find(a => a.id === apprenticeId);
              if (apprentice) {
                transfers.push({
                  fromAgentId: agentId,
                  toAgentId: apprenticeId,
                  techId: record.techId,
                  type: 'written',
                  narrative: `「${agentName}」的书稿被「${apprentice.name}」继承，继续传承这项知识。`,
                });
              }
            }
          }
        }
        break;

      case 'apprenticeship':
        // 师徒传授：检查是否有活着的学徒继承
        const apprenticeList = record.apprentices ?? [];
        const aliveApprentices = apprenticeList
          .filter(aid => state.agents.some(a => a.id === aid && a.alive));
        if (aliveApprentices.length > 0) {
          // 已有学徒继承，知识仍在传承链中
          // 不需要额外操作
        }
        break;

      case 'artifact':
        // 实物遗存：东西还在，不受影响
        break;
    }
  }

  return transfers;
}

/**
 * 师徒传授：师傅将知识传授给学徒。
 *
 * @param masterId 师傅 agent id
 * @param apprenticeId 学徒 agent id
 * @param techId 技术节点 id
 * @param state WorldState 引用
 * @param records 知识记录列表
 * @returns 传承事件或 null（失败）
 */
export function transferToApprentice(
  masterId: string,
  apprenticeId: string,
  techId: string,
  state: WorldState,
  records: KnowledgeRecord[],
): KnowledgeTransferInfo | null {
  const master = state.agents.find(a => a.id === masterId);
  const apprentice = state.agents.find(a => a.id === apprenticeId);

  if (!master?.alive || !apprentice?.alive) return null;

  // 学徒不能太年轻
  if (apprentice.age < 12) return null;

  // 检查师傅是否已有该技术的知识记录
  const existingRecord = records.find(
    r => r.techId === techId
      && r.holderId === masterId
      && r.type === 'apprenticeship',
  );

  if (existingRecord) {
    // 已有师徒传授记录，添加学徒到继承列表
    if (!existingRecord.apprentices.includes(apprenticeId)) {
      existingRecord.apprentices.push(apprenticeId);
    }

    return {
      fromAgentId: masterId,
      toAgentId: apprenticeId,
      techId,
      type: 'apprenticeship',
      narrative: `「${master.name}」收了「${apprentice.name}」为徒，传授${techId}相关的技艺。`,
    };
  }

  // 创建新的师徒传授记录
  const newRecord: KnowledgeRecord = {
    id: generateRecordId(),
    type: 'apprenticeship',
    content: `${master.name} 向 ${apprentice.name} 传授 ${techId} 技艺`,
    holderId: masterId,
    expires: state.year + KNOWLEDGE_MAX_AGE,
    techId,
    createdYear: state.year,
    inherited: true,
    apprentices: [apprenticeId],
    importance: 1.0,
  };

  records.push(newRecord);

  return {
    fromAgentId: masterId,
    toAgentId: apprenticeId,
    techId,
    type: 'apprenticeship',
    narrative: `「${master.name}」收了「${apprentice.name}」为徒，开始传授 ${techId} 相关的技艺。`,
  };
}

/**
 * Agent 自发发现并记录一项知识。
 *
 * 发现概率取决于：
 *   - Agent 的 intelligence 属性
 *   - Agent 的 literacy（识字）水平
 *   - 是否有相关技能基础
 *   - 随机因素（SeededRNG）
 *
 * @returns 创建的知识记录或 null（发现失败）
 */
export function discoverKnowledge(
  agentId: string,
  techId: string,
  state: WorldState,
  records: KnowledgeRecord[],
  rng: SeededRNG,
): KnowledgeRecord | null {
  const agent = state.agents.find(a => a.id === agentId);
  if (!agent?.alive) return null;

  // 识字是发现知识的前提
  const literacy = agent.skills?.literacy ?? 0;
  if (literacy < 20) return null;

  // 计算发现概率
  const intelligenceBonus = agent.stats.intelligence / 200; // 最高 0.5
  const literacyBonus = literacy / 200; // 最高 0.5
  const baseChance = 0.05; // 基础 5%
  const totalChance = Math.min(baseChance + intelligenceBonus + literacyBonus, 0.8);

  if (!rng.chance(totalChance)) return null;

  // 选择载体类型
  let type: KnowledgeRecordType;
  const typeRoll = rng.next();
  if (literacy >= 60) {
    // 识字高 → 更可能写下来
    if (typeRoll < 0.4) {
      type = 'written';
    } else if (typeRoll < 0.65) {
      type = 'collective_memory';
    } else if (typeRoll < 0.85) {
      type = 'artifact';
    } else {
      type = 'apprenticeship';
    }
  } else {
    // 识字低 → 更多依靠口头/实物
    if (typeRoll < 0.2) {
      type = 'collective_memory';
    } else if (typeRoll < 0.6) {
      type = 'artifact';
    } else if (typeRoll < 0.8) {
      type = 'apprenticeship';
    } else {
      type = 'written';
    }
  }

  // 生成内容描述
  const content = `${agent.name} 自发记录下关于 ${techId} 的知识。`;

  const record = createRecord(techId, type, agentId, content, state.year);
  records.push(record);

  return record;
}

/**
 * 集体记忆衰减：每年按概率遗忘一段集体记忆。
 *
 * @returns 被遗忘的记录列表
 */
export function decayCollectiveMemory(
  state: WorldState,
  records: KnowledgeRecord[],
  rng: SeededRNG,
): KnowledgeRecord[] {
  const memories = records.filter(r => r.type === 'collective_memory');
  const forgotten: KnowledgeRecord[] = [];

  for (const record of memories) {
    // 集体记忆：每年有 5% 概率遗忘
    if (rng.chance(COLLECTIVE_MEMORY_FORGET_CHANCE * record.importance)) {
      record.expires = state.year; // 标记为已过期
      forgotten.push(record);
    }

    // 重要性衰减：每过一年降低 2%
    const yearsSinceCreation = state.year - record.createdYear;
    record.importance = Math.max(0, 1.0 - yearsSinceCreation * 0.02);
  }

  return forgotten;
}

/**
 * 按技术节点分组获取知识记录。
 */
export function getRecordsByTech(
  records: KnowledgeRecord[],
  techId: string,
): KnowledgeRecord[] {
  return records.filter(r => r.techId === techId);
}

/**
 * 获取某项技术的所有有效记录。
 */
export function getActiveRecords(
  records: KnowledgeRecord[],
  state: WorldState,
  techId: string,
): KnowledgeRecord[] {
  return getValidRecords(records, state, techId);
}

/**
 * 获取所有知识记录的摘要（用于叙事生成）。
 */
export function getKnowledgeSummary(
  records: KnowledgeRecord[],
  state: WorldState,
): Array<{ techId: string; typeName: string; holderName: string; alive: boolean }> {
  return records.map(record => {
    const holder = state.agents.find(a => a.id === record.holderId);
    return {
      techId: record.techId,
      typeName: KNOWLEDGE_TYPE_NAMES[record.type],
      holderName: holder?.name ?? '未知',
      alive: !!holder?.alive,
    };
  });
}

// ─── 事件类型扩展 ──────────────────────────

/**
 * 知识失传事件。
 * 在 EventBus 中通过 emit 发送。
 */
interface KnowledgeLostEventData {
  recordId: string;
  techId: string;
  holderId: string;
  typeName: string;
}

declare module '../core/event-bus.js' {
  interface EventMap {
    KNOWLEDGE_LOST: KnowledgeLostEventData;
  }
}
