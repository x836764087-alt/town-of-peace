/**
 * 库存系统（InventoryManager）— 桃源镇 v6.0
 *
 * 封装 Agent 库存的增删查改操作，提供面向全镇的库存统计。
 *
 * 核心功能：
 *   1. 添加/移除物品（带溢出检查）
 *   2. 库存查询（单 Agent / 全镇）
 *   3. 食物腐烂处理（每季消耗自然腐败量）
 *   4. 库存上限检查
 */

import type { WorldState, AgentState } from '../core/types.js';

// ─── 常量 ────────────────────────────────────────

/** 每个 Agent 的最大库存格数 */
export const MAX_INVENTORY_SLOTS = 20;

/** 食物类物品每季腐败率（百分比） */
export const FOOD_SPOILAGE_RATE = 0.05;

/** 食物类物品标识 */
const FOOD_ITEMS = new Set(['rice', 'noodle', 'vegetables', 'meat', 'fish']);

// ─── 库存管理器 ──────────────────────────────

export class InventoryManager {
  constructor(private state: WorldState) {}

  // ─── 单 Agent 操作 ────────────────────────

  /**
   * 向 Agent 添加物品。
   * 返回实际添加的数量（可能小于请求量，如果库存溢出）。
   */
  addItem(agentId: string, itemId: string, quantity: number): number {
    const agent = this.findAgent(agentId);
    if (!agent) return 0;

    const currentSlots = Object.keys(agent.inventory.items).length;
    if (currentSlots >= MAX_INVENTORY_SLOTS && !(agent.inventory.items[itemId] ?? 0)) {
      // 库存已满，且该物品是新品种 → 拒绝
      return 0;
    }

    agent.inventory.items[itemId] = (agent.inventory.items[itemId] ?? 0) + quantity;
    return quantity;
  }

  /**
   * 从 Agent 移除物品。
   * 返回实际移除的数量。如果库存不足，取两者较小的。
   */
  removeItem(agentId: string, itemId: string, quantity: number): number {
    const agent = this.findAgent(agentId);
    if (!agent) return 0;

    const current = agent.inventory.items[itemId] ?? 0;
    const actual = Math.min(current, quantity);
    agent.inventory.items[itemId] = current - actual;

    // 清理零值
    if (agent.inventory.items[itemId] <= 0) {
      delete agent.inventory.items[itemId];
    }

    return actual;
  }

  /**
   * 获取 Agent 某物品的数量。
   */
  getItemCount(agentId: string, itemId: string): number {
    const agent = this.findAgent(agentId);
    return agent ? (agent.inventory.items[itemId] ?? 0) : 0;
  }

  /**
   * 检查 Agent 是否有该物品。
   */
  hasItem(agentId: string, itemId: string, minQuantity: number = 1): boolean {
    return this.getItemCount(agentId, itemId) >= minQuantity;
  }

  /**
   * 获取 Agent 的总物品种类数。
   */
  getSlotCount(agentId: string): number {
    const agent = this.findAgent(agentId);
    return agent ? Object.keys(agent.inventory.items).length : 0;
  }

  // ─── 全镇操作 ─────────────────────────────

  /**
   * 全镇某物品总供给量。
   */
  totalSupply(itemId: string): number {
    let total = 0;
    for (const agent of this.state.agents) {
      if (!agent.alive) continue;
      total += agent.inventory.items[itemId] ?? 0;
    }
    return total;
  }

  /**
   * 全镇有某物品的 Agent 数。
   */
  countOwners(itemId: string): number {
    let count = 0;
    for (const agent of this.state.agents) {
      if (!agent.alive) continue;
      if ((agent.inventory.items[itemId] ?? 0) > 0) count++;
    }
    return count;
  }

  // ─── 食物腐败处理 ─────────────────────────

  /**
   * 每季执行食物腐败检查。
   * 食物库存按比例减少，返回各 Agent 的腐败事件。
   */
  processSpoilage(): string[] {
    const events: string[] = [];

    for (const agent of this.state.agents) {
      if (!agent.alive) continue;

      for (const itemId of Object.keys(agent.inventory.items)) {
        if (!FOOD_ITEMS.has(itemId)) continue;

        const qty = agent.inventory.items[itemId] ?? 0;
        if (qty <= 0) continue;

        // 腐败量 = 向下取整
        const spoiled = Math.floor(qty * FOOD_SPOILAGE_RATE);
        if (spoiled > 0) {
          agent.inventory.items[itemId] = qty - spoiled;
          if (agent.inventory.items[itemId] <= 0) {
            delete agent.inventory.items[itemId];
          }
        }
      }
    }

    return events;
  }

  // ─── 工具方法 ─────────────────────────────

  private findAgent(agentId: string): AgentState | undefined {
    return this.state.agents.find(a => a.id === agentId && a.alive);
  }
}

export default InventoryManager;
