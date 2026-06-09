# 桃源镇剩余开发任务实施计划

> **目标**：将桃源镇从 65% 推进到 100%，所有模块可运行、测试覆盖完整。
> **当前状态**：27 源文件 / 7,570 行 TS / 207 测试通过 / 5 阶段主循环
> **关键发现**：7 个已有模块（MapSystem/BuildingSystem/LawSystem/ChronicleGenerator/DialogueGenerator/Seasons/Resources）尚未接入主循环

---

## 工作分区总览

```
Phase 0: 集成已有模块 → index.ts 主循环（改动 1 个文件）
Phase 1: 经济核心（market / inventory / trade）→ 3 个新文件 + 测试
Phase 2: 社交层（rumor-mill / group-system / town-events）→ 3 个新文件 + 测试
Phase 3: 创新层（tech-checker / discoveries）→ 2 个新文件 + 测试
Phase 4: 文化/叙事层（festivals / archives / chronicle-storage / event-emitter / templates）→ 5 个新文件 + 测试
Phase 5: 全系统集成测试 + 端到端验证
```

---

## Phase 0: 集成已有模块到主循环

**目标**：将 7 个已存在但未接入的模块接入 index.ts，添加新阶段到主循环。

**改动文件**：`src/index.ts`

### 新增主循环阶段

在现有 5 阶段之后插入以下阶段：

**阶段 6：建筑衰败阶段**
```typescript
import { BuildingSystem } from './world/buildings.js';
// 在 main() 循环中：
const bldEvents = buildingPhase(engine.getState());
function buildingPhase(state: WorldState): string[] {
  const bs = new BuildingSystem(state, rng);
  return bs.processDecay();
}
```

**阶段 7：对话生成阶段**
```typescript
import { DialogueGenerator } from './agents/dialogue-topics.js';
const diaEvents = dialoguePhase(engine.getState(), rng);
function dialoguePhase(state: WorldState, rng: SeededRNG): string[] {
  const dg = new DialogueGenerator(state, rng);
  return dg.generateAllDialogues();
}
```

**阶段 8：法律执行阶段**
```typescript
import { LawSystem } from './society/laws.js';
const lawEvents = lawPhase(engine.getState(), rng);
function lawPhase(state: WorldState, rng: SeededRNG): string[] {
  const ls = new LawSystem(state, rng);
  return ls.processLaws();
}
```

**阶段 9：编年史叙事阶段**
```typescript
import { ChronicleGenerator } from './narrative/chronicle-generator.js';
const chrEvents = chroniclePhase(engine.getState(), rng);
function chroniclePhase(state: WorldState, rng: SeededRNG): string[] {
  const cg = new ChronicleGenerator(state, rng);
  return cg.generateSeasonNarrative();
}
```

**阶段 10：年度总结增强**
在 `formatAnnualSummary` 中加入：建筑统计、法律统计、编年史统计

**更新叙事阶段**：同时替换原有简单的 `narrativePhase` 为新系统。

### 添加 imports 到 index.ts 顶部

```typescript
import { BuildingSystem } from './world/buildings.js';
import { MapSystem } from './world/map.js';
import { LawSystem } from './society/laws.js';
import { ChronicleGenerator } from './narrative/chronicle-generator.js';
import { DialogueGenerator } from './agents/dialogue-topics.js';
```

### 集成测试

添加 tests/integration/full-cycle.test.ts → 验证所有 10 阶段运行不崩溃

---

## Phase 1: 经济核心

### 1.1 economy/market.ts — 市场供需与价格波动

**设计**：
- 基于 item basePrice + 供需系数计算当前价格
- 供给 = 该物品当前所有库存量
- 需求 = Agent 职业/数量驱动的消耗速率
- 价格波动公式: `currentPrice = basePrice × (1 + volatilityFactor × (demand - supply) / max(demand, supply))`

**接口**：
```typescript
export class MarketSystem {
  constructor(private state: WorldState, private rng: SeededRNG) {}
  processMarket(): MarketEvent[]  // 每季执行
  getPrice(itemId: string): number  // 查询当前价格
  recordTrade(itemId: string, quantity: number, price: number): void
}
```

**测试**：12+ 用例覆盖价格计算、供需波动、交易记录

### 1.2 economy/inventory.ts — 库存管理

**设计**：
- 每个 Agent 的 inventory 自动管理（添加/移除/查询）
- 库存上限（按类型）
- 保质期/腐烂（食物类物品）
- 批量操作 API

**接口**：
```typescript
export class InventoryManager {
  addItem(agentId: string, itemId: string, quantity: number): void
  removeItem(agentId: string, itemId: string, quantity: number): boolean
  getItemCount(agentId: string, itemId: string): number
  processSpoilage(): SpoilageEvent[]  // 每季腐烂检查
  totalSupply(itemId: string): number  // 全镇总供应量
}
```

**测试**：10+ 用例覆盖加/减/查询/腐烂/上限

### 1.3 economy/trade.ts — 交易系统

**设计**：
- Agent 间自主交易（双人匹配）
- 以物易物 + 货币交易
- 交易记录与履约
- 赊账（CreditRecord 使用已有类型）

**接口**：
```typescript
export class TradeSystemExtended {
  constructor(private state: WorldState, private rng: SeededRNG) {}
  processTrade(): TradeEvent[]  // 每季执行交易匹配
  findTradePartners(agentId: string): string[]
  executeTrade(buyerId: string, sellerId: string, itemId: string, qty: number): boolean
}
```

**测试**：10+ 用例覆盖交易匹配、执行、赊账

---

## Phase 2: 社交层

### 2.1 agents/rumor-mill.ts — 谣言传播

**设计**：
- 从事件池/Agent 对话生成谣言
- 传播机制：每个 tick，每个 Agent 有概率向关系好的 Agent 传播
- 谣言有"可信度"和"热度"两个维度
- 热度随时间衰减，可信度影响 Agent 行为

**测试**：8+ 用例

### 2.2 agents/group-system.ts — 社会组织

**设计**：
- Agent 根据职业/兴趣/家族形成群体
- 群体有领导、成员列表、影响力
- 群体可发起集体行动（请愿、建设）
- 群体形成是自发的（基于关系网络）

**测试**：8+ 用例

### 2.3 agents/town-events.ts — 城镇级事件

**设计**：
- 从 events-pool.ts 中触发随机事件
- 事件影响范围：全镇或特定群体
- 事件类型：自然灾害、外来商队、节日、冲突等
- 事件有条件触发 + 概率触发

**测试**：8+ 用例

---

## Phase 3: 创新/科技层

### 3.1 innovation/tech-checker.ts — 技术前提检查

**设计**：
- 检查某项技术的前置条件是否满足
- 前置条件 = 已有技术 + 技能水平 + 材料储备
- 返回可研发的技术列表（按优先级排序）

**测试**：6+ 用例

### 3.2 innovation/discoveries.ts — 发现事件

**设计**：
- 基于现有科技树，触发随机"发现"事件
- 发现条件：拥有前置技术 + Agent 技能足够 + 随机概率
- 发现产生新的 InnovationProject
- 发现失败也有叙事价值（"小林实验失败，笔记被烧了"）

**测试**：8+ 用例

---

## Phase 4: 文化/叙事层

### 4.1 society/festivals.ts — 节日庆典

**设计**：
- 节日从社区事件中自然涌现（丰收→庆祝→固定为节日）
- 节日分类：季节节、丰收节、纪念日、宗教节
- 节日影响：居民 happiness 提升、经济活跃度上升

**测试**：8+ 用例

### 4.2 society/archives.ts — 历史档案

**设计**：
- 将 chronicle 条目整理为结构化 ArchiveEntry
- 自动分类：经济变动/人口变动/科技突破/天灾人祸
- 支持按年份/类型/Agent 查询
- 年度档案自动归档

**测试**：6+ 用例

### 4.3 narrative/chronicle-storage.ts — 编年史持久化存储

**设计**：
- 从 current ChronicleEntry[] 导出为结构化存档
- 支持增量追加（不重写整个文件）
- HTML 报告生成接口

**测试**：6+ 用例

### 4.4 narrative/event-emitter.ts — 事件叙事化触发器

**设计**：
- 监听 EventBus 事件 → 生成叙事文本
- 事件→ChronicleEntry 的映射逻辑
- 支持模板替换

**测试**：6+ 用例

### 4.5 narrative/templates.ts — 叙事模板库

**设计**：
- 预置叙事模板（重大事件、日常叙事、年度总结等）
- 多风格支持（简略/详细/文学）
- 模板变量替换

**测试**：4+ 用例

---

## Phase 5: 全系统集成测试 + 端到端验证

### 5.1 集成测试套件扩展

**目的**：验证所有模块协同工作

- `tests/integration/full-cycle.test.ts` — 扩展为验证所有 15+ 阶段
- `tests/integration/economy-cycle.test.ts` — 经济闭环测试（生产→交易→消耗）
- `tests/integration/social-cycle.test.ts` — 社交闭环测试（对话→关系→群体）
- `tests/integration/innovation-cycle.test.ts` — 创新闭环测试（检查→发现→应用）
- `tests/integration/cultural-cycle.test.ts` — 文化闭环测试（事件→节日→档案）

### 5.2 确定性复现测试

- `npm run test:replay` — 同一种子运行 10 次，输出必须完全一致
- 验证所有 RNG 调用路径的确定性

### 5.3 边界测试

- 人口为 0 时系统不崩溃
- 单 Agent 生存
- 大量 Agent（200+）性能测试
- 极端 seed 值（0, MAX_SAFE_INTEGER）

### 5.4 编译检查

```bash
npx tsc --noEmit  # 必须零错误
```

---

## 执行策略

### 并行计划

| 并行批次 | 任务 | 预计文件 |
|----------|------|---------|
| 第一批 | Phase 0: 集成（我自己做） | 1 |
| 第二批 (并行) | Phase 1: market + inventory + trade | 3 + 3 测试 |
| 第三批 (并行) | Phase 2: rumor-mill + group-system + town-events | 3 + 3 测试 |
| 第四批 (并行) | Phase 3 + 4: tech-checker + discoveries + festivals + archives + chronicle-storage + event-emitter + templates | 7 + 7 测试 |
| 第五批 | Phase 5: 集成测试 + 端到端验证 + 编译检查 | 5 + 编译 |

### TDD 流程

每个模块严格按照 测试→实现→验证 三步走。

### 验收标准

```bash
npm test                        # 所有测试通过
npx tsc --noEmit                # 编译零错误
npm run new -- --seed 42 --years 50 --summary  # 50 年模拟可运行
npm run test:replay             # 确定性验证通过
```
