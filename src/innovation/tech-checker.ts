/**
 * 技术前提检测系统（TechChecker）— 桃源镇 v6.0
 *
 * 检查创新树上的节点是否满足解锁前提条件。
 * 与 innovation-tree.ts 协作：后者定义树结构，前者评估可达性。
 */

import type { WorldState, TechNode } from '../core/types.js';
import { INNOVATION_TREE, getInnovationNode, prereqsSatisfied } from '../config/innovation-tree.js';
import type { InnovationNode } from '../config/innovation-tree.js';

// ─── 技术前提检测器 ──────────────────────────

export class TechChecker {
  constructor(private state: WorldState) {}

  // ─── 前提检查 ─────────────────────────────

  /**
   * 检查某个技术节点是否满足所有前提。
   */
  checkPrerequisites(nodeId: string): TechPrerequisiteResult {
    const node = INNOVATION_TREE.find(n => n.id === nodeId);
    if (!node) {
      return { satisfied: false, missing: [`节点 ${nodeId} 不存在`] };
    }

    if (node.requires.length === 0) {
      return { satisfied: true, missing: [] };
    }

    const researchedIds = new Set(this.state.innovations.map(i => i.id));
    const missing: string[] = [];

    for (const reqId of node.requires) {
      if (!researchedIds.has(reqId)) {
        const reqNode = INNOVATION_TREE.find(n => n.id === reqId);
        missing.push(reqNode?.name ?? reqId);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /**
   * 返回所有当前可解锁的技术节点。
   * 前提满足 + 尚未研究。
   */
  getUnlockableNodes(): InnovationNode[] {
    const researchedIds = new Set(this.state.innovations.map(i => i.id));
    return INNOVATION_TREE.filter(node => {
      if (researchedIds.has(node.id)) return false;
      return this.checkPrerequisites(node.id).satisfied;
    });
  }

  /**
   * 返回技术树中某个节点到根节点的路径。
   */
  getResearchPath(nodeId: string): string[] {
    const path: string[] = [];
    const visited = new Set<string>();
    let current = INNOVATION_TREE.find(n => n.id === nodeId);
    if (!current) return path;

    while (current && current.requires.length) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      path.unshift(current.name);
      const parentId: string = current.requires[0];
      current = INNOVATION_TREE.find(n => n.id === parentId);
    }

    if (current) path.unshift(current.name);
    return path;
  }

  /**
   * 统计技术覆盖率。
   */
  getCoverageStats(): TechCoverageStats {
    const researched = new Set(this.state.innovations.map(i => i.id));
    const total = INNOVATION_TREE.length;
    const done = INNOVATION_TREE.filter(n => researched.has(n.id)).length;
    const unlockable = this.getUnlockableNodes().length;

    const byCategory: Record<string, { total: number; done: number }> = {};
    for (const node of INNOVATION_TREE) {
      const cat = node.category ?? 'general';
      if (!byCategory[cat]) byCategory[cat] = { total: 0, done: 0 };
      byCategory[cat].total++;
      if (researched.has(node.id)) byCategory[cat].done++;
    }

    return {
      total,
      done,
      unlockable,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      byCategory,
    };
  }
}

// ─── 类型 ────────────────────────────────────────

export interface TechPrerequisiteResult {
  satisfied: boolean;
  missing: string[];
}

export interface TechCoverageStats {
  total: number;
  done: number;
  unlockable: number;
  pct: number;
  byCategory: Record<string, { total: number; done: number }>;
}

export default TechChecker;
