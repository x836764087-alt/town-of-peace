/**
 * 群体系统（GroupSystem）— 桃源镇 v6.0
 *
 * Agent 自发组成的社会群体：工会、宗教团体、兴趣小组、自卫队等。
 *
 * 核心功能：
 *   1. 群体创建（基于共同职业、志趣、人际关系）
 *   2. 成员管理（加入/退出/驱逐）
 *   3. 群体影响力（对内凝聚、对外声誉）
 *   4. 群体事件（集体行动、内部纠纷）
 */

import type { WorldState, Group, AgentState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ────────────────────────────────────────

/** 群体最小成员数 */
export const GROUP_MIN_MEMBERS = 3;

/** 群体最大成员数 */
export const GROUP_MAX_MEMBERS = 15;

/** 每季最多创建新群体数 */
export const MAX_NEW_GROUPS_PER_TICK = 1;

/** 群体创建所需的最小关系阈值 */
export const FORMATION_RELATIONSHIP_THRESHOLD = 30;

/** 群体类型池 */
export const GROUP_TYPES: { type: string; namePrefix: string; description: string }[] = [
  { type: 'trade', namePrefix: '商会', description: '同行互助组织' },
  { type: 'religious', namePrefix: '香堂', description: '共同信仰的团体' },
  { type: 'mutual_aid', namePrefix: '互助会', description: '邻里互助组织' },
  { type: 'cultural', namePrefix: '文社', description: '文化雅集' },
  { type: 'watch', namePrefix: '巡卫队', description: '社区巡防' },
];

let groupCounter = 0;

// ─── 群体系统 ────────────────────────────────

export class GroupSystem {
  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  // ─── 主处理逻辑 ───────────────────────────

  /**
   * 每季执行一次：
   * 1. 尝试创建新群体
   * 2. 更新现有群体成员
   * 3. 群体内部事件
   */
  processGroups(): string[] {
    const events: string[] = [];

    events.push(...this.tryFormNewGroup());
    events.push(...this.updateExistingGroups());

    return events;
  }

  // ─── 群体创建 ─────────────────────────────

  private tryFormNewGroup(): string[] {
    const events: string[] = [];
    if (this.state.groups.length >= 10) return events; // 上限
    if (!this.rng.chance(0.1)) return events; // 10% 概率

    const alive = this.state.agents.filter(a => a.alive && a.age >= 18);
    if (alive.length < GROUP_MIN_MEMBERS) return events;

    // 找关系紧密的 3-5 人小团体
    const founder = this.rng.pick(alive);
    const candidates = alive.filter(
      a => a.id !== founder.id && (a.relationships[founder.id] ?? 0) >= FORMATION_RELATIONSHIP_THRESHOLD,
    );
    if (candidates.length < GROUP_MIN_MEMBERS - 1) return events;

    const members = [founder.id, ...candidates.slice(0, GROUP_MIN_MEMBERS - 1).map(a => a.id)];
    if (members.length < GROUP_MIN_MEMBERS) return events;

    const groupType = this.rng.pick(GROUP_TYPES);
    groupCounter++;
    const group: Group = {
      id: `group_${groupCounter}`,
      name: `${groupType.namePrefix}·${founder.name.slice(0, 2)}`,
      description: groupType.description,
      members,
      formedYear: this.state.year,
      type: groupType.type,
    };

    this.state.groups.push(group);

    const founderName = founder.title ? `${founder.name}（${founder.title}）` : founder.name;
    events.push(`${founderName}牵头成立了「${group.name}」。`);
    return events;
  }

  // ─── 群体维护 ─────────────────────────────

  private updateExistingGroups(): string[] {
    const events: string[] = [];

    for (const group of this.state.groups) {
      // 移除已故成员
      group.members = group.members.filter(memberId => {
        const agent = this.state.agents.find(a => a.id === memberId);
        return agent?.alive ?? false;
      });

      // 群体解散（成员不足）
      if (group.members.length < GROUP_MIN_MEMBERS && this.rng.chance(0.3)) {
        events.push(`「${group.name}」因成员不足解散了。`);
        break; // marked for deletion
      }
    }

    // 清理解散的群体
    this.state.groups = this.state.groups.filter(g => g.members.length >= GROUP_MIN_MEMBERS);

    return events;
  }

  // ─── 查询 ─────────────────────────────────

  getGroupsForAgent(agentId: string): Group[] {
    return this.state.groups.filter(g => g.members.includes(agentId));
  }

  getGroupCount(): number {
    return this.state.groups.length;
  }
}

export default GroupSystem;
