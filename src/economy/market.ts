/**
 * 市场系统（MarketSystem）— 桃源镇 v6.0
 *
 * 宏观经济层：追踪全镇供给/需求、计算动态价格、记录价格历史。
 * 与 agents/trade-system.ts 互补（后者处理微观逐笔交易）。
 *
 * 核心功能：
 *   1. 全市场供需统计
 *   2. 动态定价（basePrice × 供需系数 × 随机波动）
 *   3. 价格历史记录
 *   4. 市场深度分析
 */

import type { WorldState, MarketPrice, AgentState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ────────────────────────────────────────

/** 价格变动最大倍率（相对于 basePrice） */
export const MAX_PRICE_MULTIPLIER = 3.0;
export const MIN_PRICE_MULTIPLIER = 0.3;

/** 供需弹性系数 — 越大，供需变化对价格影响越大 */
export const SUPPLY_ELASTICITY = 0.15;
export const DEMAND_ELASTICITY = 0.12;

/** 随机波动幅度（±） */
export const RANDOM_VOLATILITY = 0.08;

/** 物品基础参考价（文/单位）— 对齐 TradeSystem BASE_PRICES */
export const BASE_MARKET_PRICES: Record<string, number> = {
  noodle: 7,
  rice: 5,
  vegetables: 4,
  herbal_medicine: 8,
  tools: 35,
  knife: 50,
  wood: 6,
  iron_ore: 12,
  stone: 3,
  fabric: 10,
  pottery: 15,
  paper: 8,
  ink: 5,
  tea: 20,
  wine: 25,
  meat: 12,
  fish: 10,
};

/** 食物类物品 — 用于需求计算 */
const FOOD_ITEMS = new Set(['rice', 'noodle', 'vegetables', 'meat', 'fish']);

/** 医疗类物品 */
const MEDICAL_ITEMS = new Set(['herbal_medicine']);

// ─── 市场系统 ────────────────────────────────

export class MarketSystem {
  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  // ─── 全市场统计 ───────────────────────────

  /**
   * 计算全镇总供应量（所有存活 Agent 的库存总和）。
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
   * 估算某物品的需求量。
   * 需求 = 人口基数 × 消耗速率系数 × 稀缺敏感度。
   */
  estimateDemand(itemId: string): number {
    const aliveCount = this.state.agents.filter(a => a.alive).length;
    if (aliveCount === 0) return 1;

    // 基本需求取决于人口
    let demand = aliveCount;

    // 食物：每人每季至少消耗 3 单位 → 需求更高
    if (FOOD_ITEMS.has(itemId)) {
      demand *= 2;
    }

    // 药品：只有生病的人有需求
    if (MEDICAL_ITEMS.has(itemId)) {
      const sickCount = this.state.agents.filter(
        a => a.alive && a.conditions.length > 0,
      ).length;
      demand = Math.max(1, sickCount * 1.5);
    }

    // 工具/奢侈品：富裕程度越高、需求越大
    const avgWealth = aliveCount > 0
      ? this.state.agents.filter(a => a.alive).reduce((s, a) => s + (a.wealth ?? 0), 0) / aliveCount
      : 0;
    const luxuryItems = new Set(['tea', 'wine', 'pottery', 'knife']);
    if (luxuryItems.has(itemId)) {
      demand = demand * (0.5 + avgWealth / 200);
    }

    return Math.max(1, Math.round(demand));
  }

  // ─── 动态定价 ─────────────────────────────

  /**
   * 根据供需计算当前市场价格。
   * 公式：currentPrice = basePrice × (1 + 供需系数) × (1 + 随机波动)
   */
  calculateMarketPrice(itemId: string): number {
    const basePrice = BASE_MARKET_PRICES[itemId] ?? 10;
    const supply = this.totalSupply(itemId);
    const demand = this.estimateDemand(itemId);

    // 供需比：supply/demand — >1 供过于求（降价），<1 供不应求（涨价）
    const ratio = supply / Math.max(1, demand);
    const supplyFactor = 1 + SUPPLY_ELASTICITY * (1 - ratio);

    // 随机波动
    const volatility = 1 + this.rng.int(-RANDOM_VOLATILITY * 100, RANDOM_VOLATILITY * 100) / 100;

    let price = basePrice * supplyFactor * volatility;
    price = Math.max(
      basePrice * MIN_PRICE_MULTIPLIER,
      Math.min(basePrice * MAX_PRICE_MULTIPLIER, price),
    );

    return Math.round(price);
  }

  /**
   * 获取多种物品的当前市场价格列表。
   */
  getAllMarketPrices(itemIds?: string[]): MarketPrice[] {
    const ids = itemIds ?? Object.keys(BASE_MARKET_PRICES);
    return ids.map(itemId => ({
      itemId,
      basePrice: BASE_MARKET_PRICES[itemId] ?? 10,
      currentPrice: this.calculateMarketPrice(itemId),
      tradedVolume: this.state.economy.priceHistory[itemId]?.slice(-1)[0] ?? 0,
    }));
  }

  // ─── 价格历史 ─────────────────────────────

  /**
   * 记录当前价格到历史曲线（每季调用一次）。
   */
  recordPriceHistory(): void {
    for (const itemId of Object.keys(BASE_MARKET_PRICES)) {
      if (!this.state.economy.priceHistory[itemId]) {
        this.state.economy.priceHistory[itemId] = [];
      }
      const price = this.calculateMarketPrice(itemId);
      this.state.economy.priceHistory[itemId].push(price);
    }
  }

  /**
   * 获取某物品的价格趋势。
   * 返回最近 N 个季度的价格数组。
   */
  getPriceTrend(itemId: string, quarters: number = 8): number[] {
    const history = this.state.economy.priceHistory[itemId] ?? [];
    return history.slice(-quarters);
  }

  // ─── 交易记录 ─────────────────────────────

  /**
   * 记录一笔交易（更新交易总量等经济指标）。
   */
  recordTrade(itemId: string, quantity: number, price: number): void {
    this.state.economy.annualTradeVolume += price * quantity;
  }

  // ─── 全市场处理（主循环入口）─────────────

  /**
   * 每季执行一次的市场处理：
   * 1. 记录价格快照
   * 2. 检测通货膨胀/紧缩
   * 3. 返回市场摘要事件
   */
  processMarket(): string[] {
    const events: string[] = [];

    // 记录价格快照
    this.recordPriceHistory();

    // 检测极端价格
    for (const itemId of Object.keys(BASE_MARKET_PRICES)) {
      const price = this.calculateMarketPrice(itemId);
      const base = BASE_MARKET_PRICES[itemId] ?? 10;
      const ratio = price / base;

      if (ratio > 2.0 && this.rng.chance(0.2)) {
        const itemName = this.getItemName(itemId);
        events.push(`📈 ${itemName}价格飙升至 ${price} 文（基准 ${base} 文）。`);
      } else if (ratio < 0.5 && this.rng.chance(0.15)) {
        const itemName = this.getItemName(itemId);
        events.push(`📉 ${itemName}价格跌至 ${price} 文，供过于求。`);
      }
    }

    return events;
  }

  // ─── 工具方法 ─────────────────────────────

  private getItemName(itemId: string): string {
    const names: Record<string, string> = {
      noodle: '面条', rice: '米', vegetables: '蔬菜',
      herbal_medicine: '草药', tools: '工具', knife: '菜刀',
      wood: '木料', iron_ore: '铁矿', stone: '石头',
      fabric: '布料', pottery: '陶器', paper: '纸张',
      ink: '墨', tea: '茶叶', wine: '酒',
      meat: '肉', fish: '鱼',
    };
    return names[itemId] ?? itemId;
  }
}

export default MarketSystem;
