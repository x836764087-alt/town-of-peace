/**
 * 资源/物品质量体系
 *
 * 所有物品拥有质量等级，影响售价与使用寿命。
 * 物品按用途分为 food / tool / medicine / raw_material / craft / luxury 六类。
 *
 * 本模块是纯数据 + 工具函数，不含任何状态突变逻辑。
 */

import type { Item } from '../core/types.js';

/** 物品质量等级：劣 < 普通 < 好 < 精 */
export type Quality = 'poor' | 'normal' | 'good' | 'excellent';
export const QUALITY_CHAIN: Quality[] = ['poor', 'normal', 'good', 'excellent'];

/** 质量等级映射 — 倍率乘数 */
const QUALITY_MULTIPLIERS: Record<Quality, number> = {
  poor: 0.5,
  normal: 1.0,
  good: 1.5,
  excellent: 2.0,
};

/** 质量等级的中文名称 */
const QUALITY_NAMES: Record<Quality, string> = {
  poor: '劣',
  normal: '普通',
  good: '好',
  excellent: '精',
};

/** 兼容现有 types.ts 中 Item.category 的所有分类 */
const ALL_ITEM_CATS = new Set<string>([
  'food', 'tool', 'material', 'luxury', 'medicine', 'weapon',
  'raw_material', 'craft',
]);

/** 可升级的分类子集 */
const UPGRADEABLE_CATEGORIES: Set<string> = new Set([
  'tool', 'medicine', 'raw_material', 'craft',
]);

/** 物品的运行时实例（含动态 quality 属性） */
export interface QualityItem {
  /** 基础物品定义中的 id */
  baseId: string;
  /** 当前质量等级 */
  quality: Quality;
  /** 当前售价（basePrice × quality 倍率） */
  currentPrice: number;
  /** 当前耐久值（如果有） */
  currentDurability?: number;
}

/**
 * 返回质量等级对应的数值倍率。
 *
 * poor → 0.5, normal → 1.0, good → 1.5, excellent → 2.0
 */
export function getQualityValue(quality: Quality): number {
  return QUALITY_MULTIPLIERS[quality];
}

/**
 * 返回质量等级的中文名称。
 */
export function getQualityName(quality: Quality): string {
  return QUALITY_NAMES[quality];
}

/**
 * 判断物品是否可以升级到下一个质量等级。
 *
 * 规则：
 * - 质量不是最高级（excellent）
 * - 物品分类属于可升级类别（tool / medicine / raw_material / craft）
 * - 如果是 food / luxury，不能升级
 */
export function canUpgrade(item: Item): boolean {
  if (item.category === 'luxury' || item.category === 'food') {
    return false;
  }
  return UPGRADEABLE_CATEGORIES.has(item.category);
}

/**
 * 生成物品的描述文本。
 *
 * 格式：`{qualityName} {itemName} — {categoryName}`
 * 示例：`精 工具 — 工具`
 */
export function itemDescription(item: Item, quality: Quality): string {
  const qualityName = QUALITY_NAMES[quality];
  const categoryName = getItemCategoryName(item.category);
  return `${qualityName} ${item.name} — ${categoryName}`;
}

/**
 * 根据基础物品和品质计算当前售价。
 */
export function getPriceWithQuality(item: Item, quality: Quality): number {
  return Math.round(item.basePrice * QUALITY_MULTIPLIERS[quality]);
}

/**
 * 根据基础物品和品质计算当前耐久值。
 * 非耐久物品返回 undefined。
 */
export function getDurabilityWithQuality(
  item: Item,
  quality: Quality,
): number | undefined {
  if (item.durability == null) {
    return undefined;
  }
  return Math.round(item.durability * QUALITY_MULTIPLIERS[quality]);
}

/**
 * 获取物品下一质量等级；已是最高级则返回 undefined。
 */
export function nextQuality(current: Quality): Quality | undefined {
  const index = QUALITY_CHAIN.indexOf(current);
  if (index < 0 || index >= QUALITY_CHAIN.length - 1) {
    return undefined;
  }
  return QUALITY_CHAIN[index + 1];
}

/**
 * 根据物品分类返回中文分类名。
 * 接受 string 以兼容 types.ts 的 ItemCategory（material/weapon）
 * 与 resource-system 的 ItemCategory（raw_material/craft）两套命名体系。
 */
export function getItemCategoryName(category: string): string {
  const map: Record<string, string> = {
    food: '食物',
    tool: '工具',
    medicine: '药品',
    material: '材料',
    weapon: '武器',
    raw_material: '原材料',
    craft: '工艺品',
    luxury: '奢侈品',
  };
  return map[category] || category;
}

/**
 * 随机抽取一个质量等级（加权）：
 * poor 60%, normal 25%, good 12%, excellent 3%。
 */
export function randomQuality(rng: { next: () => number }): Quality {
  const r = rng.next();
  if (r < 0.60) return 'poor';
  if (r < 0.85) return 'normal';
  if (r < 0.97) return 'good';
  return 'excellent';
}
