/**
 * 交易系统（TradeSystem）— 桃源镇经济核心。
 *
 * 实现 v6.0 文档的交易功能：
 * 1. Agent 间铜钱交易（谈判影响价格）
 * 2. 以物易物（铜钱不足时的替代方案）
 * 3. 赊账系统（基于信任的信用借贷）
 * 4. 供需驱动的市场价格波动
 *
 * 设计原则：面谈式交易，没有商店标价牌。交易以"两人相遇、谈价、成交"呈现。
 */

import type {
  WorldState,
  AgentState,
  TradeDeal,
  CreditRecord,
  Building,
} from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 基础价格表（文/每单位）───

export const BASE_PRICES: Record<string, number> = {
  noodle: 7,
  rice: 5,
  vegetables: 4,
  herbal_medicine: 8,
  tools: 35,
  knife: 50,
  wood: 6,
};

/** 建筑→产出物品映射 */
export const BUILDING_PRODUCTS: Record<string, { itemId: string; min: number; max: number }[]> = {
  noodle_stall: [
    { itemId: 'noodle', min: 10, max: 20 },
    { itemId: 'rice', min: 2, max: 5 },
  ],
  blacksmith: [
    { itemId: 'tools', min: 1, max: 2 },
    { itemId: 'knife', min: 0, max: 1 },
  ],
  flower_garden: [
    { itemId: 'vegetables', min: 8, max: 15 },
    { itemId: 'rice', min: 3, max: 8 },
  ],
  clinic: [{ itemId: 'herbal_medicine', min: 2, max: 5 }],
  herb_stall: [{ itemId: 'herbal_medicine', min: 3, max: 7 }],
  workshop: [{ itemId: 'wood', min: 2, max: 5 }],
};

/** 建筑→所有者 Agent ID 映射 */
export const BUILDING_OWNERS: Record<string, string> = {
  noodle_stall: 'chen-dajiang',
  inn: 'lao-wang',
  blacksmith: 'zhang-dashan',
  flower_garden: 'wang-cuihua',
  clinic: 'bai-ruolan',
  herb_stall: 'su-linger',
  hot_spring: 'lin-meiqi',
  workshop: 'xiao-lin',
  school: 'zhou-jianguo',
  studio: 'xiao-ye',
  town_hall: 'zhao-changhe',
};

/** 服务性建筑收入（每天/文） */
export const SERVICE_INCOME: Record<string, { min: number; max: number }> = {
  inn: { min: 15, max: 40 },
  hot_spring: { min: 5, max: 15 },
};

export class TradeSystem {
  private trades: TradeDeal[] = [];

  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  // ─── 主循环 ────────────────────────────────

  /**
   * 执行一个完整的经济阶段（每季度调用一次）：
   * 1. 建筑产出
   * 2. Agent 间交易
   * 3. 以物易物
   * 4. 服务收入
   * 5. 食物消耗
   * 6. 市场更新
   * 7. 赊账结算
   */
  processEconomicPhase(): string[] {
    const events: string[] = [];

    // 阶段 1: 建筑产出
    events.push(...this.buildingProduction());

    // 阶段 2: Agent 间交易（铜钱买卖）
    events.push(...this.tradeCycle());

    // 阶段 3: 以物易物
    events.push(...this.barterCycle());

    // 阶段 4: 服务收入
    events.push(...this.serviceIncome());

    // 阶段 5: 食物消耗
    events.push(...this.foodConsumption());

    // 阶段 6: 年末结算赊账
    if (this.state.season === 'winter') {
      events.push(...this.settleCredits());
    }

    // 更新交易总额
    this.state.economy.annualTradeVolume += this.trades.reduce((sum, t) => sum + t.price, 0);

    return events;
  }

  // ─── 阶段 1：建筑产出 ─────────────────────

  private buildingProduction(): string[] {
    const events: string[] = [];

    // 基础生存产出：每个成年人可以自给自足采集/打猎/捕鱼
    for (const agent of this.state.agents) {
      if (!agent.alive) continue;
      if (agent.age < 13) {
        // 儿童消耗少，但还是要续命
        agent.inventory.items.rice = (agent.inventory.items.rice ?? 0) + 1;
        continue;
      }
      // 每个成年人可获得基础口粮（采集/打猎/帮工）
      const forage = this.rng.int(2, 5);
      agent.inventory.items.rice = (agent.inventory.items.rice ?? 0) + forage;
    }

    // 建筑专项产出（额外收入）
    for (const building of this.state.buildings) {
      const ownerId = building.ownerId;
      if (!ownerId) continue;
      const agent = this.state.agents.find(a => a.id === ownerId);
      if (!agent?.alive) continue;

      const products = BUILDING_PRODUCTS[building.id];
      if (!products) continue;

      for (const prod of products) {
        const amount = this.rng.int(prod.min, prod.max);
        if (amount > 0) {
          agent.inventory.items[prod.itemId] = (agent.inventory.items[prod.itemId] ?? 0) + amount;
        }
      }
    }

    return events;
  }

  // ─── 阶段 2：铜钱交易 ─────────────────────

  private tradeCycle(): string[] {
    const events: string[] = [];
    const traders = this.state.agents.filter(a => a.alive && a.age >= 13);
    if (traders.length < 2) return events;

    // 打乱顺序，每个人都有交易机会
    const shuffled = [...traders].sort(() => this.rng.int(0, 100) - 50);

    for (const buyer of shuffled) {
      // 如果没钱了或者想买的都买够了就跳过
      if (buyer.wealth < 3) continue;

      // 找 2-3 个潜在卖家
      const candidates = shuffled.filter(
        s => s.id !== buyer.id && s.alive && this.hasSaleItems(s),
      );
      if (candidates.length === 0) continue;

      const seller = this.rng.pick(candidates);

      // 找 buyer 需要且 seller 有货的物品
      const wanted = this.getWantedItems(buyer, seller);
      if (wanted.length === 0) continue;

      const itemId = this.rng.pick(wanted);
      const price = this.negotiatePrice(buyer, seller, itemId);

      if (buyer.wealth >= price) {
        // 成交！
        this.trades.push({
          buyerId: buyer.id,
          sellerId: seller.id,
          itemId,
          quantity: 1,
          price,
          type: 'coin',
          year: this.state.year,
        });

        buyer.wealth -= price;
        seller.wealth += price;
        seller.inventory.items[itemId] = (seller.inventory.items[itemId] ?? 1) - 1;
        buyer.inventory.items[itemId] = (buyer.inventory.items[itemId] ?? 0) + 1;

        const buyerName = buyer.title ? `${buyer.name}（${buyer.title}）` : buyer.name;
        const sellerName = seller.title ? `${seller.name}（${seller.title}）` : seller.name;
        events.push(`${buyerName}花了${price}文向${sellerName}买了一${itemId === 'rice' ? '袋' : '份'}${this.getItemName(itemId)}。`);
      } else if (this.rng.chance(0.3)) {
        // 钱不够但信用好 → 尝试赊账
        this.attemptCredit(buyer, seller, itemId, price, events);
      }
    }

    return events;
  }

  /** seller 是否有可卖的物品 */
  private hasSaleItems(agent: AgentState): boolean {
    const inv = agent.inventory.items;
    // 有至少一种可卖物品数量 > 0
    return Object.keys(BASE_PRICES).some(key => (inv[key] ?? 0) > 0);
  }

  /** buyer 可能需要的物品（对方有货的里面挑） */
  private getWantedItems(buyer: AgentState, seller: AgentState): string[] {
    const wanted: string[] = [];
    const sellInv = seller.inventory.items;
    const buyInv = buyer.inventory.items;

    // 粮食不够→优先买粮
    if ((buyInv.rice ?? 0) < 5 && (sellInv.rice ?? 0) > 0) {
      wanted.push('rice');
    }
    // 缺工具→买工具
    if (!buyInv.tools && (sellInv.tools ?? 0) > 0) {
      wanted.push('tools');
    }
    // 需要药→买药（如果有病）
    if (buyer.conditions.length > 0 && (sellInv.herbal_medicine ?? 0) > 0) {
      wanted.push('herbal_medicine');
    }
    // 随机看看有啥可买的
    for (const key of Object.keys(BASE_PRICES)) {
      if ((sellInv[key] ?? 0) > 0 && wanted.length < 3) {
        if (!wanted.includes(key)) wanted.push(key);
      }
    }

    return wanted;
  }

  /** 谈判定价：basePrice ± 谈判修正 */
  private negotiatePrice(buyer: AgentState, seller: AgentState, itemId: string): number {
    const base = BASE_PRICES[itemId] ?? 10;
    // 谈判筹码 = charisma + negotiation_skill / 5
    const buyerPower = (buyer.stats.charisma + (buyer.skills.negotiation ?? 0) / 5) / 10;
    const sellerPower = (seller.stats.charisma + (seller.skills.negotiation ?? 0) / 5) / 10;

    // 谈判差值：正=买家占优（价格偏低），负=卖家占优（价格偏高）
    const delta = buyerPower - sellerPower;
    // 修正范围：±30%
    const modifier = 1 + delta * 0.15 + this.rng.int(-10, 10) / 100;

    return Math.max(1, Math.round(base * modifier));
  }

  /** 物品中文名 */
  private getItemName(itemId: string): string {
    const names: Record<string, string> = {
      noodle: '面条',
      rice: '米',
      vegetables: '蔬菜',
      herbal_medicine: '草药',
      tools: '工具',
      knife: '菜刀',
      wood: '木料',
    };
    return names[itemId] ?? itemId;
  }

  // ─── 阶段 3：以物易物 ─────────────────────

  private barterCycle(): string[] {
    const events: string[] = [];
    const traders = this.state.agents.filter(a => a.alive && a.age >= 13 && this.hasSaleItems(a));
    if (traders.length < 2) return events;

    // 找铜钱少的 agent 尝试易物
    const poorTraders = traders.filter(a => (a.wealth ?? 0) < 20);
    if (poorTraders.length === 0) return events;

    for (const a of poorTraders) {
      const b = this.rng.pick(traders.filter(x => x.id !== a.id && this.hasSaleItems(x)));
      if (!b) continue;

      // A 有多余的，B 需要的
      const aSurplus = this.getSurplusItems(a);
      const bNeeds = this.getNeededItems(b);
      if (aSurplus.length === 0 || bNeeds.length === 0) continue;

      const giveItem = this.rng.pick(aSurplus);
      const takeItem = this.rng.pick(bNeeds);

      if (!giveItem || !takeItem) continue;
      if (giveItem === takeItem) continue;

      const givePrice = BASE_PRICES[giveItem] ?? 5;
      const takePrice = BASE_PRICES[takeItem] ?? 5;

      // 价值在 ±50% 以内可接受
      const ratio = givePrice / takePrice;
      if (ratio > 1.5 || ratio < 0.5) continue;

      // 成交！
      a.inventory.items[giveItem] = (a.inventory.items[giveItem] ?? 1) - 1;
      b.inventory.items[giveItem] = (b.inventory.items[giveItem] ?? 0) + 1;
      b.inventory.items[takeItem] = (b.inventory.items[takeItem] ?? 1) - 1;
      a.inventory.items[takeItem] = (a.inventory.items[takeItem] ?? 0) + 1;

      // 补差价（如果价值不等）
      if (givePrice > takePrice) {
        const diff = Math.round(givePrice - takePrice);
        b.wealth = (b.wealth ?? 0) + diff;
        a.wealth = (a.wealth ?? 0) - diff;
      } else if (takePrice > givePrice) {
        const diff = Math.round(takePrice - givePrice);
        a.wealth = (a.wealth ?? 0) + diff;
        b.wealth = (b.wealth ?? 0) - diff;
      }

      this.trades.push({
        buyerId: a.id,
        sellerId: b.id,
        itemId: takeItem,
        quantity: 1,
        price: Math.round(takePrice),
        type: 'barter',
        year: this.state.year,
      });

      const aName = a.title ? `${a.name}（${a.title}）` : a.name;
      events.push(`${aName}用${this.getItemName(giveItem)}换了${this.getItemName(takeItem)}。`);
    }

    return events;
  }

  /** agent 的可用盈余物品（> 3 单位） */
  private getSurplusItems(agent: AgentState): string[] {
    const surplus: string[] = [];
    const inv = agent.inventory.items;
    for (const key of Object.keys(BASE_PRICES)) {
      const qty = inv[key] ?? 0;
      if (qty >= 3) surplus.push(key);
    }
    return surplus;
  }

  /** agent 需要但缺少的物品 */
  private getNeededItems(agent: AgentState): string[] {
    const needed: string[] = [];
    const inv = agent.inventory.items;
    if ((inv.rice ?? 0) < 3) needed.push('rice');
    if (!inv.tools) needed.push('tools');
    if (agent.conditions.length > 0 && !inv.herbal_medicine) needed.push('herbal_medicine');
    // 如果缺度太低，补充一点随机
    if (needed.length === 0) {
      for (const key of Object.keys(BASE_PRICES)) {
        if (!inv[key]) needed.push(key);
      }
    }
    return needed;
  }

  // ─── 阶段 4：服务收入 ─────────────────────

  private serviceIncome(): string[] {
    const events: string[] = [];

    for (const building of this.state.buildings) {
      const incomeTable = SERVICE_INCOME[building.id];
      if (!incomeTable) continue;
      const agent = this.state.agents.find(a => a.id === building.ownerId);
      if (!agent?.alive) continue;

      const income = this.rng.int(incomeTable.min, incomeTable.max);
      agent.wealth = (agent.wealth ?? 0) + income;
    }

    return events;
  }

  // ─── 阶段 5：食物消耗 ─────────────────────

  private foodConsumption(): string[] {
    const events: string[] = [];
    const foodItems = ['rice', 'noodle', 'vegetables'];

    for (const agent of this.state.agents) {
      if (!agent.alive) continue;

      const need = this.rng.int(1, 2);
      let consumed = 0;

      // 依次消耗各种食物库存
      for (const item of foodItems) {
        if (consumed >= need) break;
        const qty = agent.inventory.items[item] ?? 0;
        if (qty > 0) {
          const take = Math.min(qty, need - consumed);
          agent.inventory.items[item] = qty - take;
          consumed += take;
        }
      }

      if (consumed < need) {
        agent.stats.health = Math.max(0, agent.stats.health - 5);
        // 只在成年人饥饿超过阈值时记录叙事（减少噪音）
        if (agent.age >= 18 && agent.stats.health < 30 && this.rng.chance(0.3)) {
          const name = agent.title ? `${agent.name}（${agent.title}）` : agent.name;
          events.push(`${name}粮食不足，健康堪忧。`);
        }
      }
    }

    return events;
  }

  // ─── 赊账系统 ─────────────────────────────

  private attemptCredit(
    buyer: AgentState,
    seller: AgentState,
    itemId: string,
    price: number,
    events: string[],
  ): void {
    // 检查买家信誉
    if (buyer.tags.includes('untrustworthy')) return;

    // 检查卖家是否愿意赊账（基于关系和 charisma）
    const relationship = seller.relationships[buyer.id] ?? 0;
    const willingness = Math.min(0.95, Math.max(0.05, (relationship + 50) / 100 + seller.stats.charisma / 100));
    if (!this.rng.chance(willingness)) return;

    // ≤100文不用写借条，>100文需要写
    const needContract = price > 100;

    this.state.credits.push({
      creditorId: seller.id,
      debtorId: buyer.id,
      amount: price,
      yearIncurred: this.state.year,
      dueYear: this.state.year + (needContract ? 2 : 1),
      settled: false,
    });

    // 物品转移
    seller.inventory.items[itemId] = (seller.inventory.items[itemId] ?? 1) - 1;
    buyer.inventory.items[itemId] = (buyer.inventory.items[itemId] ?? 0) + 1;

    const buyerName = buyer.title ? `${buyer.name}（${buyer.title}）` : buyer.name;
    const sellerName = seller.title ? `${seller.name}（${seller.title}）` : seller.name;
    if (needContract) {
      events.push(`${buyerName}向${sellerName}赊账${price}文${this.getItemName(itemId)}，写了借条。`);
    } else {
      events.push(`${buyerName}向${sellerName}赊了${price}文${this.getItemName(itemId)}，口头约定年底还。`);
    }
  }

  /** 年末结算赊账 */
  private settleCredits(): string[] {
    const events: string[] = [];

    for (const credit of this.state.credits) {
      if (credit.settled) continue;
      if (this.state.year < credit.dueYear) continue;

      const debtor = this.state.agents.find(a => a.id === credit.debtorId);
      const creditor = this.state.agents.find(a => a.id === credit.creditorId);

      if (!debtor?.alive || !creditor?.alive) {
        credit.settled = true;
        continue;
      }

      if (debtor.wealth >= credit.amount) {
        // 还清了
        debtor.wealth -= credit.amount;
        creditor.wealth += credit.amount;
        credit.settled = true;
        events.push(`${debtor.name}还清了欠${creditor.name}的${credit.amount}文。`);
      } else if (debtor.wealth > 0) {
        // 部分还款
        const paid = debtor.wealth;
        creditor.wealth += paid;
        credit.amount -= paid;
        debtor.wealth = 0;
        events.push(`${debtor.name}还了${paid}文，还欠${creditor.name}${credit.amount}文。`);
      } else if (creditor.relationships[debtor.id] !== undefined) {
        // 一分钱都没有→关系恶化
        creditor.relationships[debtor.id] = Math.max(-100, (creditor.relationships[debtor.id] ?? 0) - 30);
        if (!debtor.tags.includes('untrustworthy')) {
          debtor.tags.push('untrustworthy');
        }
        events.push(`${debtor.name}无力偿还欠${creditor.name}的${credit.amount}文，信用受损。`);
      }
    }

    return events;
  }
}
