import type { Item } from '../core/types.js';
import { ITEMS } from './items.js';

export const basePrices: Record<string, number> = {};
for (const item of ITEMS) {
  basePrices[item.id] = item.basePrice;
}

/** Seasonal price modifiers — multiplier on base price per season. */
export const seasonalModifiers: Record<string, Record<string, number>> = {
  food: {
    spring: 1.1,   // early spring: scarce, prices high
    summer: 0.8,   // harvest: abundant, prices low
    autumn: 0.7,   // post-harvest: most abundant, prices lowest
    winter: 1.4,   // lean season: scarce, prices peak
  },
  tool: {
    spring: 1.0,   // farming tools in demand
    summer: 1.0,
    autumn: 0.9,   // post-farm: demand drops
    winter: 0.8,   // off-season: cheapest
  },
  material: {
    spring: 1.0,
    summer: 1.1,   // building season
    autumn: 1.0,
    winter: 0.9,   // less building
  },
  luxury: {
    spring: 1.0,
    summer: 0.9,
    autumn: 0.85,  // festivals: demand high but supply higher
    winter: 1.2,   // festive season
  },
  medicine: {
    spring: 1.1,   // allergy/flu season
    summer: 1.0,
    autumn: 0.95,
    winter: 1.3,   // cold/flu: highest demand
  },
  weapon: {
    spring: 1.0,
    summer: 1.0,
    autumn: 1.05,  // pre-harvest: protection needed
    winter: 1.0,
  },
};

/** Base price values for reference (copper coins / 文). */
export const priceReference: Record<string, { base: number; range: string; note: string }> = {
  wheat_seeds:        { base: 2,     range: '2-3',    note: '每斗' },
  millet_seeds:       { base: 2,     range: '2-3',    note: '每斗' },
  rice_seeds:         { base: 3,     range: '3-5',    note: '每斗' },
  bean_seeds:         { base: 2,     range: '2-3',    note: '每斗' },
  wheat:              { base: 3,     range: '2-5',    note: '每斗，丰年贱，荒年贵' },
  millet:             { base: 3,     range: '2-4',    note: '每斗' },
  rice:               { base: 5,     range: '4-8',    note: '每斗，相对金贵' },
  bean:               { base: 3,     range: '2-4',    note: '每斗' },
  salt:               { base: 5,     range: '4-6',    note: '每斤，官府管制' },
  soy_sauce:          { base: 4,     range: '3-6',    note: '每瓶' },
  soy_tofu:           { base: 2,     range: '1-3',    note: '每块' },
  pork:               { base: 10,    range: '8-15',   note: '每斤' },
  chicken:            { base: 8,     range: '6-12',   note: '每只' },
  fish:               { base: 5,     range: '3-8',    note: '每斤' },
  cotton:             { base: 4,     range: '3-6',    note: '每斤' },
  silk_thread:        { base: 15,    range: '12-20',  note: '每两' },
  cotton_thread:      { base: 5,     range: '4-7',    note: '每两' },
  iron_ingot:         { base: 20,    range: '15-30',  note: '每斤，波动大' },
  copper_coin:        { base: 1,     range: '1',      note: '基准单位' },
  silver_tael:        { base: 1000,  range: '900-1100', note: '约1000文/两' },
  wooden_tool:        { base: 15,    range: '10-20',  note: '锄头/镰刀' },
  iron_hoe:           { base: 50,    range: '40-70',  note: '铁锄头' },
  iron_sickle:        { base: 45,    range: '35-60',  note: '铁镰刀' },
  iron_axe:           { base: 60,    range: '50-80',  note: '铁斧' },
  iron_sword:         { base: 100,   range: '80-150', note: '制式武器' },
  cloth:              { base: 10,    range: '8-14',   note: '每匹' },
  silk_cloth:         { base: 50,    range: '40-70',  note: '每匹，贵重' },
  leather:            { base: 12,    range: '10-15',  note: '每张' },
  ceramic_bowl:       { base: 8,     range: '5-12',   note: '每只' },
  ceramic_pot:        { base: 15,    range: '10-25',  note: '每只' },
  paper:              { base: 5,     range: '3-8',    note: '每张' },
  ink_stick:          { base: 10,    range: '8-15',   note: '每根' },
  brush:              { base: 8,     range: '5-12',   note: '每支' },
  medicine_herb:      { base: 3,     range: '2-5',    note: '每帖' },
  basic_medicine:     { base: 10,    range: '8-15',   note: '每剂，感冒药' },
  honey:              { base: 6,     range: '4-8',    note: '每罐' },
  tea_leaves:         { base: 8,     range: '5-12',   note: '每两' },
  sugar:              { base: 7,     range: '5-10',   note: '每斤' },
  bamboo_tube:        { base: 3,     range: '2-4',    note: '每根' },
  bamboo_mat:         { base: 5,     range: '4-7',    note: '每张' },
  wood_plank:         { base: 4,     range: '3-6',    note: '每块' },
  rope:               { base: 6,     range: '4-8',    note: '每束' },
};
