/**
 * 资源系统（Resource System）— 桃源镇 v6.0
 *
 * 管理可采集自然资源：木材、铁矿、渔场、药草等。
 * 资源按地形分布，有可再生性差异。
 */

import type { TileMap, Tile, TileType } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 类型定义 ────────────────────────────────────

/** 资源类别 */
export type ResourceCategory = 'food' | 'material' | 'tool' | 'medicine' | 'luxury' | 'fuel';

/** 可再生资源节点 */
export interface RenewableResourceNode {
  id: string;
  name: string;
  category: ResourceCategory;
  /** 资源类型产出 */
  output: { itemId: string; minQuantity: number; maxQuantity: number };
  /** 再生时间（周） */
  regenerationWeeks: number;
  /** 当前枯竭度（0-100，100 表示枯竭） */
  depletion: number;
  /** 所在 tile 坐标 */
  x: number;
  y: number;
  /** 所属 tile 类型 */
  tileType: TileType;
}

/** 不可再生资源节点（矿脉等） */
export interface MineableResourceNode {
  id: string;
  name: string;
  category: ResourceCategory;
  output: { itemId: string; quantity: number };
  /** 剩余储量（0 表示枯竭） */
  remaining: number;
  /** 所在 tile 坐标 */
  x: number;
  y: number;
  tileType: TileType;
}

export type ResourceNode = RenewableResourceNode | MineableResourceNode;

// ─── 资源生成 ────────────────────────────────────

/** 资源 ID 计数器 */
let resourceCounter = 0;

function nextResourceId(): string {
  return `resource-${++resourceCounter}`;
}

/**
 * 根据地图生成资源节点。
 * 资源按地形分布：
 *   - forest → 木材（可再生）
 *   - mountain → 铁矿（不可再生）
 *   - water → 渔场（可再生）
 *   - farmland/plains → 药草（可再生）
 */
export function generateResources(
  map: TileMap,
  rng: SeededRNG,
  targetCount: number = 10,
): ResourceNode[] {
  const resources: ResourceNode[] = [];
  
  // 森林 → 木材
  const forestTiles: { x: number; y: number }[] = [];
  const waterTiles: { x: number; y: number }[] = [];
  const mountainTiles: { x: number; y: number }[] = [];
  const plainsTiles: { x: number; y: number }[] = [];
  
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y]?.[x];
      if (!tile) continue;
      
      switch (tile.type) {
        case 'forest':
          forestTiles.push({ x, y });
          break;
        case 'water':
          waterTiles.push({ x, y });
          break;
        case 'mountain':
          mountainTiles.push({ x, y });
          break;
        case 'plains':
          plainsTiles.push({ x, y });
          break;
      }
    }
  }
  
  // 森林资源：木材
  const treeCount = Math.min(forestTiles.length, Math.floor(targetCount * 0.3));
  const treePositions = shuffle(forestTiles, rng, treeCount);
  for (const pos of treePositions) {
    resources.push({
      id: nextResourceId(),
      name: '林场',
      category: 'fuel',
      output: { itemId: 'wood', minQuantity: 2, maxQuantity: 5 },
      regenerationWeeks: 26, // 半年再生
      depletion: 0,
      x: pos.x,
      y: pos.y,
      tileType: 'forest',
    });
  }
  
  // 山地资源：铁矿
  const mineCount = Math.min(mountainTiles.length, Math.floor(targetCount * 0.2));
  const minePositions = shuffle(mountainTiles, rng, mineCount);
  for (const pos of minePositions) {
    resources.push({
      id: nextResourceId(),
      name: '铁矿',
      category: 'material',
      output: { itemId: 'iron_ingot', quantity: 3 },
      remaining: 50, // 可开采 50 次
      x: pos.x,
      y: pos.y,
      tileType: 'mountain',
    });
  }
  
  // 水域资源：渔场
  const fishCount = Math.min(waterTiles.length, Math.floor(targetCount * 0.15));
  const fishPositions = shuffle(waterTiles, rng, fishCount);
  for (const pos of fishPositions) {
    resources.push({
      id: nextResourceId(),
      name: '渔场',
      category: 'food',
      output: { itemId: 'fish', minQuantity: 1, maxQuantity: 4 },
      regenerationWeeks: 13, // 一季再生
      depletion: 0,
      x: pos.x,
      y: pos.y,
      tileType: 'water',
    });
  }
  
  // 平原资源：药草
  const herbCount = Math.min(plainsTiles.length, Math.floor(targetCount * 0.15));
  const herbPositions = shuffle(plainsTiles, rng, herbCount);
  for (const pos of herbPositions) {
    resources.push({
      id: nextResourceId(),
      name: '药草坡',
      category: 'medicine',
      output: { itemId: 'medicine_herb', minQuantity: 1, maxQuantity: 3 },
      regenerationWeeks: 18,
      depletion: 0,
      x: pos.x,
      y: pos.y,
      tileType: 'plains',
    });
  }
  
  // 竹林资源
  const bambooCount = Math.min(forestTiles.length, Math.floor(targetCount * 0.2));
  const bambooPositions = shuffle(forestTiles.filter(p => !treePositions.includes(p)), rng, bambooCount);
  for (const pos of bambooPositions) {
    resources.push({
      id: nextResourceId(),
      name: '竹林',
      category: 'material',
      output: { itemId: 'bamboo_tube', minQuantity: 2, maxQuantity: 6 },
      regenerationWeeks: 20,
      depletion: 0,
      x: pos.x,
      y: pos.y,
      tileType: 'forest',
    });
  }
  
  return resources;
}

/** 从数组中随机取 n 个元素（Fisher-Yates 洗牌） */
function shuffle<T>(arr: T[], rng: SeededRNG, count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

// ─── 资源采集 ────────────────────────────────────

/** 采集结果 */
export interface HarvestResult {
  itemId: string;
  quantity: number;
  depleted: boolean;
  seasonModifier: number;
}

/**
 * 采集可再生资源的收获。
 * 考虑枯竭度和季节加成。
 */
export function harvestRenewable(
  resource: RenewableResourceNode,
  season: string,
  rng: SeededRNG,
): HarvestResult {
  // 枯竭度影响
  const depletionFactor = Math.max(0, 1 - resource.depletion / 100);
  
  // 季节加成
  const seasonMod = resource.category === 'food' ? (season === 'autumn' ? 1.5 : 1.0) : 1.0;
  
  // 如果枯竭则无法采集
  if (depletionFactor < 0.1) {
    return {
      itemId: resource.output.itemId,
      quantity: 0,
      depleted: true,
      seasonModifier: seasonMod,
    };
  }
  
  // 产出计算
  const min = resource.output.minQuantity;
  const max = resource.output.maxQuantity;
  const base = min + rng.next() * (max - min);
  const quantity = Math.max(1, Math.round(base * depletionFactor * seasonMod));
  
  return {
    itemId: resource.output.itemId,
    quantity,
    depleted: false,
    seasonModifier: seasonMod,
  };
}

/**
 * 采集不可再生资源（矿脉）。
 * 每次开采减少储量。
 */
export function harvestMineable(
  resource: MineableResourceNode,
): HarvestResult {
  if (resource.remaining <= 0) {
    return {
      itemId: resource.output.itemId,
      quantity: 0,
      depleted: true,
      seasonModifier: 1.0,
    };
  }
  
  const quantity = Math.min(resource.output.quantity, resource.remaining);
  resource.remaining -= quantity;
  
  return {
    itemId: resource.output.itemId,
    quantity,
    depleted: resource.remaining <= 0,
    seasonModifier: 1.0,
  };
}

/**
 * 更新资源枯竭度（每年一次）。
 * 可再生资源会逐渐恢复。
 */
export function updateResourceDepletion(
  resource: RenewableResourceNode,
  weeksPassed: number,
): void {
  if (resource.depletion > 0) {
    const recovery = (weeksPassed / resource.regenerationWeeks) * 20; // 每过一定周数恢复 20%
    resource.depletion = Math.max(0, resource.depletion - recovery);
  }
}

/**
 * 获取所有资源节点列表。
 */
export function getAllResources(
  renewable: RenewableResourceNode[],
  mineable: MineableResourceNode[],
): (RenewableResourceNode | MineableResourceNode)[] {
  return [...renewable, ...mineable];
}

/**
 * 按类别筛选资源。
 */
export function getResourcesByCategory(
  resources: ResourceNode[],
  category: ResourceCategory,
): ResourceNode[] {
  return resources.filter(r => r.category === category);
}

/**
 * 按坐标范围筛选资源。
 */
export function getResourcesNear(
  resources: ResourceNode[],
  x: number,
  y: number,
  radius: number,
): ResourceNode[] {
  return resources.filter(r => Math.abs(r.x - x) <= radius && Math.abs(r.y - y) <= radius);
}

/**
 * 重置资源计数器（用于测试）。
 */
export function resetResourceCounter(): void {
  resourceCounter = 0;
}
