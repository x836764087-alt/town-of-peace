/**
 * 档案系统（ArchiveSystem）— 桃源镇 v6.0
 *
 * 文明档案记录：记录重大事件、人物生平、技术发现等，
 * 形成可追溯的历史档案。
 */

import type { WorldState, ArchiveEntry } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ────────────────────────────────────────

/** 每轮最多添加的档案条目数 */
export const MAX_ARCHIVE_ENTRIES_PER_TICK = 5;

/** 档案最大条目数 */
export const MAX_ARCHIVE_ENTRIES = 500;

// ─── 档案系统 ────────────────────────────────

export class ArchiveSystem {
  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  /**
   * 每季自动记录一次常规事件。
   */
  processArchives(): string[] {
    const events: string[] = [];

    // 记录主要事件
    const newEntries = this.generateEntries();
    for (const entry of newEntries) {
      if (this.state.archives.length >= MAX_ARCHIVE_ENTRIES) break;
      this.state.archives.push(entry);
    }

    if (newEntries.length > 0) {
      events.push(`📜 档案书记录了 ${newEntries.length} 条新事件。`);
    }

    return events;
  }

  /**
   * 手动添加一条档案记录。
   */
  addEntry(type: string, content: string, agentIds?: string[]): void {
    if (this.state.archives.length >= MAX_ARCHIVE_ENTRIES) return;
    this.state.archives.push({
      year: this.state.year,
      type,
      content,
      agentIds,
    });
  }

  /**
   * 按条件查询档案。
   */
  query(options: ArchiveQuery): ArchiveEntry[] {
    return this.state.archives.filter(entry => {
      if (options.year !== undefined && entry.year !== options.year) return false;
      if (options.type !== undefined && entry.type !== options.type) return false;
      if (options.agentId !== undefined && !entry.agentIds?.includes(options.agentId)) return false;
      if (options.keyword !== undefined && !entry.content.includes(options.keyword)) return false;
      return true;
    });
  }

  /**
   * 生成档案概要统计。
   */
  getSummary(): ArchiveSummary {
    const typeCount: Record<string, number> = {};
    for (const entry of this.state.archives) {
      typeCount[entry.type] = (typeCount[entry.type] ?? 0) + 1;
    }
    return {
      total: this.state.archives.length,
      firstYear: this.state.archives.length > 0 ? this.state.archives[0].year : this.state.year,
      lastYear: this.state.archives.length > 0 ? this.state.archives[this.state.archives.length - 1].year : this.state.year,
      byType: typeCount,
    };
  }

  /**
   * 按季节生成常规事件并记录。
   */
  private generateEntries(): ArchiveEntry[] {
    const entries: ArchiveEntry[] = [];
    const alive = this.state.agents.filter(a => a.alive);

    // 记录出生
    for (const agent of this.state.agents) {
      if (!agent.alive) continue;
      if (agent.age === 0 && this.state.year > 0) {
        entries.push({
          year: this.state.year,
          type: 'birth',
          content: `${agent.name} 出生了。`,
          agentIds: [agent.id],
        });
      }
    }

    // 随机记录重大事件
    const notableAgents = alive.filter(() => this.rng.chance(0.1));
    for (const agent of notableAgents) {
      const title = agent.title ? `（${agent.title}）` : '';
      entries.push({
        year: this.state.year,
        type: 'notable',
        content: `${agent.name}${title} 今年 ${agent.age} 岁了。`,
        agentIds: [agent.id],
      });
    }

    return entries.slice(0, MAX_ARCHIVE_ENTRIES_PER_TICK);
  }
}

export interface ArchiveQuery {
  year?: number;
  type?: string;
  agentId?: string;
  keyword?: string;
}

export interface ArchiveSummary {
  total: number;
  firstYear: number;
  lastYear: number;
  byType: Record<string, number>;
}

export default ArchiveSystem;
