import type { Item } from '../core/types.js';

export const ITEMS: Item[] = [
  { id: 'rice', name: '稻米', category: 'food', basePrice: 3, weight: 1, craftable: false },
  { id: 'wheat', name: '麦子', category: 'food', basePrice: 3, weight: 1, craftable: false },
  { id: 'vegetables', name: '蔬菜', category: 'food', basePrice: 2, weight: 1, craftable: false },
  { id: 'meat', name: '肉类', category: 'food', basePrice: 8, weight: 1, craftable: false },
  { id: 'fish', name: '鱼', category: 'food', basePrice: 6, weight: 1, craftable: false },
  {
    id: 'noodle', name: '面条', category: 'food', basePrice: 7, weight: 1,
    craftable: true,
    recipe: { inputs: [{ itemId: 'wheat', quantity: 2 }], skill: 'cooking', skillRequired: 20, output: 3 },
  },
  {
    id: 'bread', name: '饼', category: 'food', basePrice: 4, weight: 1,
    craftable: true,
    recipe: { inputs: [{ itemId: 'wheat', quantity: 1 }], skill: 'cooking', skillRequired: 10, output: 2 },
  },
  {
    id: 'cloth', name: '布匹', category: 'material', basePrice: 10, weight: 1,
    craftable: true,
    recipe: { inputs: [{ itemId: 'wheat', quantity: 3 }], skill: 'sewing', skillRequired: 20, output: 1 },
  },
  { id: 'wood', name: '木材', category: 'material', basePrice: 5, weight: 2, craftable: false },
  { id: 'iron', name: '生铁', category: 'material', basePrice: 15, weight: 3, craftable: false },
  { id: 'stone', name: '石材', category: 'material', basePrice: 3, weight: 3, craftable: false },
  {
    id: 'tools', name: '工具', category: 'tool', basePrice: 25, weight: 2, durability: 30,
    craftable: true,
    recipe: { inputs: [{ itemId: 'iron', quantity: 1 }, { itemId: 'wood', quantity: 2 }], skill: 'blacksmithing', skillRequired: 25, output: 1 },
  },
  {
    id: 'knife', name: '菜刀', category: 'tool', basePrice: 50, weight: 1, durability: 50,
    craftable: true,
    recipe: { inputs: [{ itemId: 'iron', quantity: 1 }], skill: 'blacksmithing', skillRequired: 20, output: 1 },
  },
  {
    id: 'hoe', name: '锄头', category: 'tool', basePrice: 35, weight: 2, durability: 40,
    craftable: true,
    recipe: { inputs: [{ itemId: 'iron', quantity: 1 }, { itemId: 'wood', quantity: 1 }], skill: 'blacksmithing', skillRequired: 15, output: 1 },
  },
  {
    id: 'pottery', name: '陶器', category: 'luxury', basePrice: 12, weight: 2, durability: 20,
    craftable: true,
    recipe: { inputs: [{ itemId: 'stone', quantity: 2 }], skill: 'pottery', skillRequired: 15, output: 2 },
  },
  {
    id: 'silk', name: '丝绸', category: 'luxury', basePrice: 30, weight: 1,
    craftable: true,
    recipe: { inputs: [{ itemId: 'cloth', quantity: 3 }], skill: 'weaving', skillRequired: 40, output: 1 },
  },
  { id: 'tea', name: '茶叶', category: 'luxury', basePrice: 8, weight: 1, craftable: false },
  {
    id: 'wine', name: '酒', category: 'luxury', basePrice: 15, weight: 2,
    craftable: true,
    recipe: { inputs: [{ itemId: 'rice', quantity: 3 }], skill: 'brewing', skillRequired: 25, output: 2 },
  },
  {
    id: 'herbal_medicine', name: '草药', category: 'medicine', basePrice: 20, weight: 1,
    craftable: true,
    recipe: { inputs: [{ itemId: 'vegetables', quantity: 2 }], skill: 'medicine', skillRequired: 20, output: 2 },
  },
  {
    id: 'bandage', name: '绷带', category: 'medicine', basePrice: 5, weight: 1,
    craftable: true,
    recipe: { inputs: [{ itemId: 'cloth', quantity: 1 }], skill: 'medicine', skillRequired: 10, output: 3 },
  },
];

export function getBasePrices(): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const item of ITEMS) prices[item.id] = item.basePrice;
  return prices;
}

export function getItem(id: string): Item | undefined {
  return ITEMS.find(i => i.id === id);
}
