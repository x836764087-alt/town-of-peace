/**
 * 贸易匹配系统（TradeMatcher）— 桃源镇 v6.0
 *
 * 宏观贸易层：在 agents/trade-system.ts 的微观逐笔交易之上，
 * 提供贸易匹配、库存深度检测、以及面向全镇的贸易统计。
 *
 * 核心功能：
 *   1. 自动匹配供需 — 找出全镇范围内谁需要什么、谁有多余
 *   2. 贸易达成建议列表（不直接执行，供 TradeSystem 消费）
 *   3. 全镇贸易统计：净进出口品种、贸易伙伴分布
 *   4. 贸易路线检测（谁和谁经常交易）
 */

import type { WorldState, AgentState, TradeDeal } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';
import { BASE_MARKET_PRICES } from './market.js';
import { InventoryManager } from './inventory.js';

// ─── 常量 ────────────────────────────────────────

/** 一次匹配最多返回的候选交易数 */
export const MAX_MATCHES_PER_TICK = 5;

/** 贸易匹配的最小信任值（relationship > 此值才考虑交易） */
export const MIN_TRUST_FOR_TRADE = -20;

/** 消费品列表（非食物但有稳定需求） */
const CONSUMER_GOODS = new Set(['tools', 'knife', 'fabric', 'pottery']);

// ─── 匹配候选 ─────────────────────────────────

export interface TradeMatch {
  buyerId: string;
  sellerId: string;
  itemId: string;
  quantity: number;
  estimatedPrice: number;
  reason: string;  // 匹配原因描述
}

// ─── 贸易匹配器 ──────────────────────────────

export class TradeMatcher {
  private inv: InventoryManager;

  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {
    this.inv = new InventoryManager(state);
  }

  // ─── 供需匹配 ─────────────────────────────

  /**
   * 在全镇范围内找出最需要的交易匹配。
   * 扫描所有存活 Agent，配对 Buyers（缺货者）和 Sellers（盈余者）。
   */
  findTradeMatches(): TradeMatch[] {
    const matches: TradeMatch[] = [];
    const alive = this.state.agents.filter(a => a.alive && a.age >= 13);

    // 按数量排序的候选物品
    const allItemIds = Object.keys(BASE_MARKET_PRICES);

    for (const itemId of allItemIds) {
      if (matches.length >= MAX_MATCHES_PER_TICK) break;

      // 找出缺货者和盈余者
      const buyers: AgentState[] = [];
      const sellers: AgentState[] = [];

      for (const agent of alive) {
        const qty = agent.inventory.items[itemId] ?? 0;
        if (qty <= 0 && agent.wealth >= BASE_MARKET_PRICES[itemId]) {
          // 没有且买得起 → 潜在买家
          buyers.push(agent);
        } else if (qty >= 3) {
          // 有盈余 → 潜在卖家
          sellers.push(agent);
        }
      }

      if (buyers.length === 0 || sellers.length === 0) continue;

      // 随机配对一个买家和一个卖家
      const buyer = this.rng.pick(buyers);
      const seller = this.rng.pick(sellers);
      if (!buyer || !seller || buyer.id === seller.id) continue;

      // 检查信任
      const rel = seller.relationships[buyer.id] ?? 0;
      if (rel < MIN_TRUST_FOR_TRADE) continue;

      const basePrice = BASE_MARKET_PRICES[itemId] ?? 10;
      const sellerQty = seller.inventory.items[itemId] ?? 0;
      const qty = Math.min(3, sellerQty);

      matches.push({
        buyerId: buyer.id,
        sellerId: seller.id,
        itemId,
        quantity: qty,
        estimatedPrice: basePrice * qty,
        reason: this.getMatchReason(itemId, buyer, seller),
      });
    }

    return matches;
  }

  // ─── 全镇贸易统计 ─────────────────────────

  /**
   * 统计全镇经济指标：
   * - 最富裕/最贫穷的 Agent
   * - 价格波动最大的品类
   * - 各职业财富分布
   */
  computeTradeMetrics(): TradeMetrics {
    const alive = this.state.agents.filter(a => a.alive);
    const metrics: TradeMetrics = {
      totalWealth: 0,
      wealthGini: 0,
      richest: undefined,
      poorest: undefined,
      topTradedItems: [],
      occupationWealth: {},
    };

    if (alive.length === 0) return metrics;

    // 财富总额 & 极值
    let sorted = [...alive].sort((a, b) => (b.wealth ?? 0) - (a.wealth ?? 0));
    metrics.richest = sorted[0];
    metrics.poorest = sorted[sorted.length - 1];
    metrics.totalWealth = alive.reduce((s, a) => s + (a.wealth ?? 0), 0);

    // 基尼系数（简化版 — 按财富前 20% / 后 80% 比例估算）
    const top20 = sorted.slice(0, Math.ceil(sorted.length * 0.2));
    const top20wealth = top20.reduce((s, a) => s + (a.wealth ?? 0), 0);
    metrics.wealthGini = metrics.totalWealth > 0
      ? Math.round((top20wealth / metrics.totalWealth) * 100) / 100
      : 0;

    // 职业财富分布（按 title 分类）
    for (const agent of alive) {
      const occ = agent.title ?? agent.gender === 'male' ? '平民' : '民女';
      if (!metrics.occupationWealth[occ]) {
        metrics.occupationWealth[occ] = { sum: 0, count: 0 };
      }
      metrics.occupationWealth[occ].sum += agent.wealth ?? 0;
      metrics.occupationWealth[occ].count++;
    }

    // 最常交易物品（基于价格历史）
    const history = this.state.economy.priceHistory;
    const tradedVolumes: { itemId: string; volume: number }[] = [];
    for (const [itemId, prices] of Object.entries(history)) {
      if (prices.length > 0) {
        tradedVolumes.push({ itemId, volume: prices[prices.length - 1] });
      }
    }
    tradedVolumes.sort((a, b) => b.volume - a.volume);
    metrics.topTradedItems = tradedVolumes.slice(0, 5).map(t => t.itemId);

    return metrics;
  }

  // ─── 工具方法 ─────────────────────────────

  private getMatchReason(itemId: string, buyer: AgentState, seller: AgentState): string {
    const bName = buyer.title ? `${buyer.name}（${buyer.title}）` : buyer.name;
    const sName = seller.title ? `${seller.name}（${seller.title}）` : seller.name;
    return `${bName}缺${this.getItemName(itemId)}，${sName}有余。`;
  }

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

// ─── 类型定义 ──────────────────────────────────

export interface TradeMetrics {
  totalWealth: number;
  wealthGini: number;
  richest: AgentState | undefined;
  poorest: AgentState | undefined;
  topTradedItems: string[];
  occupationWealth: Record<string, { sum: number; count: number }>;
}

export default TradeMatcher;
