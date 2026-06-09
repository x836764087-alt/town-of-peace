/**
 * 建筑系统（BuildingSystem）— 桃源镇 v6.0
 *
 * 负责：
 * 1. 建筑建造（需要蓝图 + 材料 + 人工）
 * 2. 建筑升级（消耗材料 + 铜钱，提升产出效率）
 * 3. 建筑自然衰败（每季 condition 下降）
 * 4. 建筑维护（花费材料修复 condition）
 * 5. 各建筑类型产出倍率管理
 */

import type { WorldState, Building, TileMap } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { EVENTS, EventBus } from '../core/event-bus.js';

// ─── 常量定义 ──────────────────────────────

/** 每季建筑自然磨损度（百分比） */
export const BUILDING_DECAY_PER_TICK = 1;

/** 建筑最大等级 */
export const MAX_BUILDING_LEVEL = 5;

/** 升级所需材料费 = baseCost × level */
export const UPGRADE_BASE_COST: Record<string, number> = {
  agriculture: 80,
  commerce: 100,
  production: 120,
  cultural: 60,
  education: 80,
  medical: 100,
  civic: 150,
  recreation: 70,
};

/** 升级所需人工 = baseLabor × level */
export const UPGRADE_BASE_LABOR: Record<string, number> = {
  agriculture: 2,
  commerce: 3,
  production: 4,
  cultural: 1,
  education: 2,
  medical: 2,
  civic: 5,
  recreation: 1,
};

/** 建筑类型 → 产出倍率（每级提升） */
export const BUILDING_EFFICIENCY_PER_LEVEL = 0.25;

/** 建筑类型映射说明 */
export const BUILDING_TYPE_NAMES: Record<string, string> = {
  agriculture: '农业',
  commerce: '商业',
  production: '工坊',
  cultural: '文化',
  education: '教育',
  medical: '医疗',
  civic: '市政',
  recreation: '休闲',
};

// ─── 建筑管理器 ────────────────────────────

export class BuildingSystem {
  private state: WorldState;
  private rng: SeededRNG;

  constructor(state: WorldState, rng: SeededRNG) {
    this.state = state;
    this.rng = rng;
  }

  /**
   * 每季处理建筑自然衰败。
   * condition 低于 40 时降低产出效率。
   */
  processDecay(): string[] {
    const events: string[] = [];
    for (const building of this.state.buildings) {
      const decay = this.rng.int(0, BUILDING_DECAY_PER_TICK);
      // 没人维护的建筑衰败更快
      const ownerExists = building.ownerId
        && this.state.agents.some(a => a.id === building.ownerId && a.alive);
      const actualDecay = ownerExists ? decay : decay * 2;

      // 将 condition 存储为隐性状态（用 materialProgress 作为 condition）
      // materialProgress 字段在此用作建筑状况（0-100）
      if (building.materialProgress !== undefined) {
        building.materialProgress = Math.max(0, building.materialProgress - actualDecay);
      }
    }
    return events;
  }

  /**
   * 获取建筑当前效率倍率（基于等级和状况）。
   * 1.0 = 基准产出。
   */
  getEfficiency(building: Building): number {
    const levelBonus = 1 + (building.level - 1) * BUILDING_EFFICIENCY_PER_LEVEL;
    const condition = building.materialProgress ?? 100;
    const conditionPenalty = condition < 40 ? 0.5 + (condition / 80) : 1.0;
    return levelBonus * conditionPenalty;
  }

  /**
   * 尝试升级建筑。
   * 返回升级结果描述，失败时包含原因。
   */
  upgradeBuilding(buildingId: string, payerId: string): { success: boolean; narrative: string } {
    const building = this.state.buildings.find(b => b.id === buildingId);
    if (!building) return { success: false, narrative: '找不到该建筑。' };

    if (building.level >= MAX_BUILDING_LEVEL) {
      return { success: false, narrative: `${building.name}已达最高等级。` };
    }

    const payer = this.state.agents.find(a => a.id === payerId);
    if (!payer) return { success: false, narrative: '找不到出资人。' };

    const cost = this.getUpgradeCost(building);
    if (payer.wealth < cost.materialCost) {
      return { success: false, narrative: `${payer.name}钱不够，升级${building.name}需要 ${cost.materialCost} 文。` };
    }

    // 扣钱
    payer.wealth -= cost.materialCost;

    // 等级提升
    building.level += 1;
    building.materialProgress = 100; // 升级后状况满值

    EventBus.emit(EVENTS.INNOVATION_COMPLETED, {
      nodeId: buildingId,
      result: `${building.name}升到 ${building.level} 级`,
    });

    return {
      success: true,
      narrative: `${payer.name}出资 ${cost.materialCost} 文，${building.name}升到 ${building.level} 级！`,
    };
  }

  /**
   * 维修建筑，恢复 condition。
   */
  repairBuilding(buildingId: string, repairerId: string): { success: boolean; narrative: string } {
    const building = this.state.buildings.find(b => b.id === buildingId);
    if (!building) return { success: false, narrative: '找不到该建筑。' };

    const repairer = this.state.agents.find(a => a.id === repairerId);
    if (!repairer) return { success: false, narrative: '找不到维修人。' };

    const currentCondition = building.materialProgress ?? 100;
    if (currentCondition >= 100) {
      return { success: false, narrative: `${building.name}完好无损，无需修缮。` };
    }

    const repairCost = Math.ceil(((100 - currentCondition) / 100) * 20);
    if (repairer.wealth < repairCost) {
      return { success: false, narrative: `${repairer.name}钱不够修缮，需要 ${repairCost} 文。` };
    }

    repairer.wealth -= repairCost;
    building.materialProgress = 100;

    return {
      success: true,
      narrative: `${repairer.name}花了 ${repairCost} 文修缮${building.name}。`,
    };
  }

  /**
   * 计算建筑升级所需费用。
   */
  getUpgradeCost(building: Building): { materialCost: number; laborCost: number } {
    const base = UPGRADE_BASE_COST[building.type] ?? 100;
    const labor = UPGRADE_BASE_LABOR[building.type] ?? 3;
    return {
      materialCost: base * building.level,
      laborCost: labor * building.level,
    };
  }

  /**
   * 统计各类型建筑数量。
   */
  getBuildingStats(): Record<string, { count: number; avgLevel: number }> {
    const stats: Record<string, { count: number; totalLevel: number }> = {};
    for (const b of this.state.buildings) {
      if (!stats[b.type]) stats[b.type] = { count: 0, totalLevel: 0 };
      stats[b.type].count++;
      stats[b.type].totalLevel += b.level;
    }
    const result: Record<string, { count: number; avgLevel: number }> = {};
    for (const [type, data] of Object.entries(stats)) {
      result[type] = {
        count: data.count,
        avgLevel: Math.round((data.totalLevel / data.count) * 10) / 10,
      };
    }
    return result;
  }

  /**
   * 获取建筑类型的产出倍率。
   * 基于该类型所有建筑的平均效率。
   */
  getTypeEfficiency(type: string): number {
    const buildings = this.state.buildings.filter(b => b.type === type);
    if (buildings.length === 0) return 1.0;
    const totalEff = buildings.reduce((sum, b) => sum + this.getEfficiency(b), 0);
    return totalEff / buildings.length;
  }
}

export default BuildingSystem;
