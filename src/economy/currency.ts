/**
 * 货币与经济稳定机制 — 桃源镇 v6.0
 *
 * 核心职责：
 *   1. 总货币量管理（铸造/回收/流通）
 *   2. 价格稳定器（丰年收粮、荒年放粮，平抑物价）
 *   3. 通货膨胀/紧缩检测
 *   4. 银钱兑换率管理
 */

import type { WorldState, EconomyState, TradeDeal, MarketPrice } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ────────────────────────────────────────

/** 银钱基准兑换率（1 两白银 = X 文） */
export const SILVER_RATE = 1000;

/** 价格波动阈值 — 超过此比例触发稳定操作 */
export const PRICE_VOLATILITY_THRESHOLD = 0.3;

/** 市场深度系数 — 影响稳定器干预力度 */
export const MARKET_DEPTH_FACTOR = 0.1;

/** 通货膨胀警戒线（年价格涨幅 > X%） */
export const INFLATION_THRESHOLD = 0.15;

/** 通货紧缩警戒线 */
export const DEFLATION_THRESHOLD = -0.1;

// ─── 价格稳定器 ──────────────────────────────────

/**
 * 计算当前市场价格。
 * 基于 basePrice + 供需调整 + 季节系数。
 */
export function calculateMarketPrice(
  item: { id: string; basePrice: number; category: string },
  economy: EconomyState,
  season: string,
  supplyRatio: number = 1.0,
  demandRatio: number = 1.0,
): MarketPrice {
  const base = item.basePrice;
  
  // 供需影响
  const supplyDemandFactor = demandRatio / supplyRatio;
  
  // 价格历史趋势
  const history = economy.priceHistory[item.id] ?? [];
  const historicalAvg = history.length > 0
    ? history.reduce((a, b) => a + b, 0) / history.length
    : base;
  
  // 价格收敛：向历史均值靠拢
  const meanReversion = (historicalAvg - (base * supplyDemandFactor)) * 0.1;
  
  // 季节系数
  const seasonalMod = getSeasonalModifier(item.category, season);
  
  // 最终价格
  let currentPrice = (base * supplyDemandFactor + meanReversion) * seasonalMod;
  
  // 价格上下限：基准价的 50% - 300%
  const minPrice = base * 0.5;
  const maxPrice = base * 3.0;
  currentPrice = Math.max(minPrice, Math.min(maxPrice, currentPrice));
  
  return {
    itemId: item.id,
    basePrice: base,
    currentPrice: Math.round(currentPrice),
    tradedVolume: 0, // 由交易记录更新
  };
}

/** 获取季节性价格系数 */
function getSeasonalModifier(category: string, season: string): number {
  // 默认返回 1.0
  return 1.0;
}

// ─── 通货膨胀检测 ────────────────────────────────

/**
 * 检测当前通胀/通缩状态。
 * @returns 0 = 正常, 1 = 通胀, -1 = 通缩
 */
export function detectInflation(state: WorldState): number {
  const econ = state.economy;
  const history = econ.priceHistory;
  
  // 计算所有物品的平均价格变化率
  let totalChange = 0;
  let count = 0;
  
  for (const [itemId, prices] of Object.entries(history)) {
    if (prices.length >= 2) {
      const latest = prices[prices.length - 1];
      const previous = prices[prices.length - 2];
      if (previous > 0) {
        totalChange += (latest - previous) / previous;
        count++;
      }
    }
  }
  
  if (count === 0) return 0;
  
  const avgChange = totalChange / count;
  
  if (avgChange > INFLATION_THRESHOLD) return 1;
  if (avgChange < DEFLATION_THRESHOLD) return -1;
  return 0;
}

/**
 * 检测货币过剩/短缺。
 * 货币量 / 商品总量 > 阈值 = 通胀压力
 */
export function detectMonetaryImbalance(state: WorldState): 'inflation' | 'deflation' | 'balanced' {
  const totalCurrency = state.economy.totalCurrency;
  const activeAgents = state.agents.filter(a => a.alive);
  const avgWealth = activeAgents.length > 0
    ? activeAgents.reduce((s, a) => s + a.wealth, 0) / activeAgents.length
    : 0;
  
  // 人均持有货币 / 基准物价（假设小麦 = 1 单位）
  const currencyPerCapita = totalCurrency / activeAgents.length;
  const wheatBase = 3; // 小麦每斗 3 文
  
  if (currencyPerCapita > wheatBase * 50) return 'inflation';
  if (currencyPerCapita < wheatBase * 10) return 'deflation';
  return 'balanced';
}

// ─── 经济稳定操作 ────────────────────────────────

/**
 * 执行经济稳定干预。
 * 在通胀时回收货币（抛售储备粮），在通缩时投放货币（收购）。
 */
export function applyEconomicStabilization(
  state: WorldState,
  rng: SeededRNG,
  year: number,
): { action: string; impact: string } | null {
  const inflation = detectInflation(state);
  if (inflation === 0) return null;
  
  const monetary = detectMonetaryImbalance(state);
  
  if (inflation === 1 && monetary === 'inflation') {
    // 通胀严重：政府抛售储备，回收货币
    const recoverAmount = Math.floor(state.economy.totalCurrency * 0.02); // 回收 2% 货币
    state.economy.totalCurrency -= recoverAmount;
    
    // 记录到年志
    state.chronicle.push({
      year,
      severity: 'notable',
      content: `朝廷开仓平粜，回收铜钱 ${recoverAmount} 文，以抑物价。`,
    });
    
    return { action: 'deflation', impact: `回收铜钱 ${recoverAmount} 文` };
  }
  
  if (inflation === -1 && monetary === 'deflation') {
    // 通缩：政府收购粮食/物资，投放货币
    const injectAmount = Math.floor(state.economy.totalCurrency * 0.015); // 投放 1.5% 货币
    state.economy.totalCurrency += injectAmount;
    
    state.chronicle.push({
      year,
      severity: 'notable',
      content: `官府收购粮食布匹，投放铜钱 ${injectAmount} 文，以活民生。`,
    });
    
    return { action: 'inflation', impact: `投放铜钱 ${injectAmount} 文` };
  }
  
  return null;
}

// ─── 银钱兑换 ─────────────────────────────────────

/**
 * 获取当前银钱兑换率（可能因货币过剩波动）。
 */
export function getSilverRate(state: WorldState): number {
  const monetary = detectMonetaryImbalance(state);
  if (monetary === 'inflation') {
    return SILVER_RATE + Math.floor(SILVER_RATE * 0.1); // 银价上升
  }
  if (monetary === 'deflation') {
    return SILVER_RATE - Math.floor(SILVER_RATE * 0.05); // 银价下降
  }
  return SILVER_RATE;
}

// ─── 交易手续费 ────────────────────────────────────

/**
 * 市场交易税费 — 政府从每笔交易中抽取少量作为税收。
 * 税率基于年景好坏：丰年略高，荒年减免。
 */
export function calculateTradeTax(deal: TradeDeal, state: WorldState): number {
  const baseTaxRate = 0.02; // 2% 基本税率
  
  // 荒年减免
  const inflation = detectInflation(state);
  if (inflation === -1) return Math.floor(deal.price * 0.005); // 0.5%
  
  return Math.floor(deal.price * baseTaxRate);
}

// ─── 价格曲线更新 ──────────────────────────────────

/**
 * 每年结束时更新价格历史曲线。
 */
export function updatePriceHistory(
  state: WorldState,
  marketPrices: Map<string, MarketPrice>,
): void {
  for (const itemId of Object.keys(marketPrices)) {
    const mp = marketPrices.get(itemId)!;
    if (!state.economy.priceHistory[itemId]) {
      state.economy.priceHistory[itemId] = [];
    }
    state.economy.priceHistory[itemId].push(mp.currentPrice);
    
    // 保留最近 200 年的数据
    if (state.economy.priceHistory[itemId].length > 200) {
      state.economy.priceHistory[itemId] = 
        state.economy.priceHistory[itemId].slice(-200);
    }
  }
}

// ─── 经济健康报告 ──────────────────────────────────

export interface EconomyReport {
  totalCurrency: number;
  silverRate: number;
  inflation: number;
  monetaryStatus: 'inflation' | 'deflation' | 'balanced';
  annualTradeVolume: number;
  activeAgents: number;
  avgWealth: number;
  wealthGini: number;
}

/**
 * 生成当前经济健康报告。
 */
export function generateEconomyReport(state: WorldState): EconomyReport {
  const activeAgents = state.agents.filter(a => a.alive);
  const totalWealth = activeAgents.reduce((s, a) => s + a.wealth, 0);
  const avgWealth = activeAgents.length > 0 ? totalWealth / activeAgents.length : 0;
  
  // 简易基尼系数
  const sorted = activeAgents.map(a => a.wealth).sort((a, b) => a - b);
  let cumWealth = 0;
  let giniNumerator = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumWealth += sorted[i];
    giniNumerator += (2 * (i + 1) - sorted.length - 1) * sorted[i];
  }
  const wealthGini = sorted.length > 0 && totalWealth > 0
    ? giniNumerator / (sorted.length * totalWealth)
    : 0;
  
  return {
    totalCurrency: state.economy.totalCurrency,
    silverRate: getSilverRate(state),
    inflation: detectInflation(state),
    monetaryStatus: detectMonetaryImbalance(state),
    annualTradeVolume: state.economy.annualTradeVolume,
    activeAgents: activeAgents.length,
    avgWealth,
    wealthGini: Math.round(wealthGini * 1000) / 1000,
  };
}
