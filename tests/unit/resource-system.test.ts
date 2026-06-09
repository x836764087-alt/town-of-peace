import { describe, it, expect } from 'vitest';
import type { Item } from '../../src/core/types.js';
import {
  getQualityValue,
  getQualityName,
  canUpgrade,
  itemDescription,
  getPriceWithQuality,
  getDurabilityWithQuality,
  nextQuality,
  getItemCategoryName,
  randomQuality,
  type Quality,
} from '../../src/config/resource-system.js';

// ── getQualityValue ───────────────────────────────────────

describe('getQualityValue', () => {
  it('should return 0.5 for poor', () => {
    expect(getQualityValue('poor')).toBe(0.5);
  });

  it('should return 1.0 for normal', () => {
    expect(getQualityValue('normal')).toBe(1.0);
  });

  it('should return 1.5 for good', () => {
    expect(getQualityValue('good')).toBe(1.5);
  });

  it('should return 2.0 for excellent', () => {
    expect(getQualityValue('excellent')).toBe(2.0);
  });
});

// ── getQualityName ────────────────────────────────────────

describe('getQualityName', () => {
  it('should return Chinese names', () => {
    expect(getQualityName('poor')).toBe('劣');
    expect(getQualityName('normal')).toBe('普通');
    expect(getQualityName('good')).toBe('好');
    expect(getQualityName('excellent')).toBe('精');
  });
});

// ── canUpgrade ────────────────────────────────────────────

describe('canUpgrade', () => {
  const makeItem = (
    overrides: Partial<Item> = {},
  ): Item => ({
    id: 'test',
    name: '测试物品',
    category: 'food',
    basePrice: 1,
    weight: 1,
    craftable: false,
    ...overrides,
  });

  it('should allow upgrading tools', () => {
    expect(canUpgrade(makeItem({ category: 'tool' }))).toBe(true);
  });

  it('should allow upgrading medicine', () => {
    expect(canUpgrade(makeItem({ category: 'medicine' }))).toBe(true);
  });

  it('should allow upgrading raw_material', () => {
    expect(canUpgrade(makeItem({ category: 'raw_material' }))).toBe(true);
  });

  it('should allow upgrading craft', () => {
    expect(canUpgrade(makeItem({ category: 'craft' }))).toBe(true);
  });

  it('should NOT allow upgrading food', () => {
    expect(canUpgrade(makeItem({ category: 'food' }))).toBe(false);
  });

  it('should NOT allow upgrading luxury', () => {
    expect(canUpgrade(makeItem({ category: 'luxury' }))).toBe(false);
  });
});

// ── itemDescription ───────────────────────────────────────

describe('itemDescription', () => {
  const makeItem = (
    overrides: Partial<Item> = {},
  ): Item => ({
    id: 'tools',
    name: '工具',
    category: 'tool',
    basePrice: 25,
    weight: 2,
    craftable: true,
    ...overrides,
  });

  it('should format description with quality prefix', () => {
    expect(itemDescription(makeItem(), 'excellent')).toBe(
      '精 工具 — 工具',
    );
    expect(itemDescription(makeItem(), 'poor')).toBe('劣 工具 — 工具');
  });

  it('should include category name', () => {
    expect(itemDescription(makeItem({ category: 'food' }), 'normal')).toBe(
      '普通 工具 — 食物',
    );
  });
});

// ── getPriceWithQuality ───────────────────────────────────

describe('getPriceWithQuality', () => {
  const makeItem = (basePrice: number): Item => ({
    id: 'iron',
    name: '生铁',
    category: 'raw_material',
    basePrice,
    weight: 3,
    craftable: false,
  });

  it('should multiply basePrice by quality factor', () => {
    const item = makeItem(10);
    expect(getPriceWithQuality(item, 'poor')).toBe(5);
    expect(getPriceWithQuality(item, 'normal')).toBe(10);
    expect(getPriceWithQuality(item, 'good')).toBe(15);
    expect(getPriceWithQuality(item, 'excellent')).toBe(20);
  });

  it('should round fractional prices', () => {
    const item = makeItem(7);
    expect(getPriceWithQuality(item, 'good')).toBe(11); // 7*1.5=10.5 → 11
  });
});

// ── getDurabilityWithQuality ──────────────────────────────

describe('getDurabilityWithQuality', () => {
  const makeItem = (durability: number): Item => ({
    id: 'tools',
    name: '工具',
    category: 'tool',
    basePrice: 25,
    weight: 2,
    durability,
    craftable: true,
  });

  it('should multiply durability by quality factor', () => {
    const item = makeItem(30);
    expect(getDurabilityWithQuality(item, 'poor')).toBe(15);
    expect(getDurabilityWithQuality(item, 'normal')).toBe(30);
    expect(getDurabilityWithQuality(item, 'good')).toBe(45);
    expect(getDurabilityWithQuality(item, 'excellent')).toBe(60);
  });

  it('should return undefined for consumable items', () => {
    const item: Item = {
      id: 'rice',
      name: '稻米',
      category: 'food',
      basePrice: 3,
      weight: 1,
      craftable: false,
    };
    expect(getDurabilityWithQuality(item, 'normal')).toBeUndefined();
  });
});

// ── nextQuality ───────────────────────────────────────────

describe('nextQuality', () => {
  it('should return the next higher quality', () => {
    expect(nextQuality('poor')).toBe('normal');
    expect(nextQuality('normal')).toBe('good');
    expect(nextQuality('good')).toBe('excellent');
  });

  it('should return undefined for the highest quality', () => {
    expect(nextQuality('excellent')).toBeUndefined();
  });
});

// ── getItemCategoryName ───────────────────────────────────

describe('getItemCategoryName', () => {
  it('should return Chinese category names', () => {
    expect(getItemCategoryName('food')).toBe('食物');
    expect(getItemCategoryName('tool')).toBe('工具');
    expect(getItemCategoryName('medicine')).toBe('药品');
    expect(getItemCategoryName('raw_material')).toBe('原材料');
    expect(getItemCategoryName('craft')).toBe('工艺品');
    expect(getItemCategoryName('luxury')).toBe('奢侈品');
  });
});

// ── randomQuality ─────────────────────────────────────────

describe('randomQuality', () => {
  it('should only return valid quality values', () => {
    const validSet = new Set(['poor', 'normal', 'good', 'excellent']);
    const rng = { next: () => 0.9999 };
    for (let i = 0; i < 20; i++) {
      const q = randomQuality(rng);
      expect(validSet.has(q as string)).toBe(true);
    }
  });

  it('should follow expected distribution over many samples', () => {
    // Use fixed next() values that map to each bucket:
    // 0.5 → poor (<0.60), 0.70 → normal (0.60–0.85),
    // 0.90 → good (0.85–0.97), 0.99 → excellent (≥0.97)
    const rngs = [
      { next: () => 0.5 },
      { next: () => 0.70 },
      { next: () => 0.90 },
      { next: () => 0.99 },
    ];
    expect(randomQuality(rngs[0])).toBe('poor');
    expect(randomQuality(rngs[1])).toBe('normal');
    expect(randomQuality(rngs[2])).toBe('good');
    expect(randomQuality(rngs[3])).toBe('excellent');
  });
});
