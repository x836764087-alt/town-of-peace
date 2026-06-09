# Phase 2: 经济与交易系统

## 任务

为桃源镇添加完整的 Agent 间交易/经济系统，替换当前 `src/index.ts` 中简陋的 `economicPhase`。

## 项目结构

```
town-of-peace/
├── src/
│   ├── index.ts          ← 主入口 (CLI 循环 + 各 phase 函数: populationPhase, economicPhase, socialPhase, narrativePhase)
│   ├── core/
│   │   ├── types.ts      ← 所有类型定义 (AgentState, Building, Inventory, EconomyState, TradeDeal, CreditRecord 等)
│   │   ├── world-engine.ts ← WordEngine (世界创建、tick、存档/读档)
│   │   ├── event-bus.ts    ← 全局 EventBus
│   │   └── rng.ts          ← SeededRNG
│   ├── config/
│   │   ├── characters.ts ← 18 位初始居民
│   │   ├── items.ts      ← 物品定义 (稻米、蔬菜、草药、面条、工具...)
│   │   ├── skills.ts     ← 技能定义
│   │   ├── world.ts      ← 世界常量
│   │   ├── events-pool.ts ← 事件池
│   │   └── tech-tree.ts  ← 科技树
│   └── agents/
│       └── agent-factory.ts ← 角色创建/移民
├── tests/
│   ├── unit/
│   └── integration/
│       └── full-cycle.test.ts
└── package.json
```

## 你需要做的事情

### 1. 新建 `src/agents/trade-system.ts`

核心交易引擎。API 设计：

```typescript
export class TradeSystem {
  constructor(private state: WorldState, private rng: SeededRNG) {}

  /** 执行一个交易周期：遍历所有 alive Agent，尝试互相交易 */
  processTradeCycle(): TradeEvent[]

  /** Agent A 找 Agent B 用铜钱购买物品 */
  attemptPurchase(buyer: AgentState, seller: AgentState, itemId: string): TradeResult | null

  /** Agent A 与 Agent B 以物易物 */
  attemptBarter(a: AgentState, b: AgentState): TradeResult | null

  /** 查询某个 Agent 的记账/赊账记录 */
  getCredit(creditorId: string, debtorId: string): CreditRecord | undefined
}
```

### 2. 在 `types.ts` 中新增类型

```typescript
/** 一条交易记录 */
export interface TradeDeal {
  buyerId: string;
  sellerId: string;
  itemId: string;
  quantity: number;
  price: number;           // 成交总价（文）
  type: 'coin' | 'barter';
  year: number;
}

/** 赊账记录 */
export interface CreditRecord {
  creditorId: string;       // 债主
  debtorId: string;         // 欠债人
  amount: number;           // 欠款（文）
  yearIncurred: number;
  dueYear: number;          // 默认年底还款
  settled: boolean;
}

/** 当前市场价格（受供需影响） */
export interface MarketPrice {
  itemId: string;
  basePrice: number;
  currentPrice: number;     // basePrice × (1 + demandFactor - supplyFactor)
  tradedVolume: number;     // 本年度已交易数量
}
```

### 3. 替换 `economicPhase` 实现

新逻辑（每季度触发）：

```
economicPhase(state, rng) {
  events = []

  // 阶段 1: 建筑产出
  //   遍历 buildings，根据 type 产出商品
  //   面摊 → 面条 (7文), 铁匠铺 → 工具+菜刀, 花圃 → 蔬菜+花, 草药摊 → 草药, 客栈 → 茶+住宿收入
  //   产出放到 building owner 的 inventory 中

  // 阶段 2: Agent 间交易 (TradeSystem.processTradeCycle)
  //   每个 agent 遍历邻居，尝试买卖
  //   交易逻辑：
  //     - agent 检查自己的库存，列出"想买的"（吃的不够→买粮）和"想卖的"（生产过剩→卖商品）
  //     - 按 charisma + negotiation 技能进行价格谈判（最终价 = basePrice * 谈判系数）
  //     - 钱不够时触发赊账（如果对方同意）
  //     - 返回 TradeDeal 列表

  // 阶段 3: 以物易物
  //   当铜钱不足时，agent 尝试用多余商品换所需商品
  //   双方各自评估物品价值（basePrice），协商差额

  // 阶段 4: 食物消耗
  //   每人每季消耗 1-2 单位粮食
  //   如果粮食不足→健康下降 (-5 health)

  // 阶段 5: 市场更新
  //   更新 MarketPrice（根据本年度供需）
  //   更新 EconomyState

  // 阶段 6: 技能提升 (已有逻辑保留)

  return events
}
```

### 4. 关键设计原则

- **对面交易，没有商店标价牌**：交易是两个人相遇、谈价、成交的过程
- **角色差异化**：
  - 陈秀兰（谈判60, 社交80）→ 谈判师
  - 老王（贸易65, 谈判50）→ 老练商人
  - 张大山（魅力45）→ 不善还价
  - 陈小飞（社交60）→ 可能因为跑腿知道谁需要什么
- **赊账规则**（符合 v6.0 文档）：
  - ≤100文：可以不写借条（靠信用）
  - >100文：需要有见证人或写借条
  - 年底结清
  - 不还后果：关系下降，下次别人不跟你交易
- **物物交换**：缺铜钱时，商品直接交换

### 5. 需要导入的已有常量

```typescript
// 物品:
import { ITEMS, getBasePrices } from '../config/items.js';
// ITEMS 结构: { id, name, category, basePrice, weight, craftable, recipe? }
// getBasePrices() 返回 Record<string, number>

// 世界常量:
import { WORLD } from '../config/world.js';
// WORLD.BASE_FERTILITY, WORLD.FERTILITY_MAX_AGE, 等

// 类型:
import type { WorldState, AgentState, EconomyState, Building, Item, TradeDeal, CreditRecord, MarketPrice } from '../core/types.js';
```

## 测试验证

完成后，`npx vitest run` 必须继续全过。
运行 `tsx src/index.ts --new --seed 42 --years 10 --summary` 应能看到交易事件而不是"0文交易额"。
