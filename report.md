# AI小镇项目全景汇报

> 报告时间：2026-06-09 09:55
> 覆盖范围：桃源镇（主线项目） + Alicization Town（参考项目）

---

## 一、项目总览

| 项目 | 路径 | 大小 | 类型 | 状态 |
|------|------|------|------|------|
| **桃源镇** 🏆 | `/home/ching/town-of-peace/` | 68MB | 文明模拟器（单人CLI） | **主力开发中** |
| Alicization Town | `/home/ching/alicization-town/` | 142MB | 去中心化像素沙盒 | 参考/借鉴，非主线 |

**核心定位**：桃源镇是主线项目，基于彻底真实主义设计原则。Alicization Town 是开源参考项目，用于借鉴架构。

---

## 二、桃源镇 — 详细状态

### 2.1 技术栈

- TypeScript ES2022 + Node.js v22
- Deterministic RNG（seedrandom）用于可复现模拟
- vitest 测试框架，207 测试全部通过 ✅
- tsx 开发运行器
- **零外部运行时依赖**（仅 seedrandom）

### 2.2 进度概览

| 模块 | 权重 | 完成度 | 文件数 | 说明 |
|------|------|--------|--------|------|
| config/ | 10% | **100%** ✅ | 9/9 | 角色、物品、技能、事件池等 |
| core/ | 12% | **100%** ✅ | 4/4 | 世界引擎、RNG、EventBus、类型 |
| world/ | 10% | **100%** ✅ | 4/4 | 地图、建筑、资源、季节 |
| index.ts | 6% | **100%** ✅ | 1/1 | 主循环、CLI、存档 |
| agents/ | 20% | **62.5%** | 5/8 | 对话系统已加；待完成：谣言、群体、城镇事件 |
| economy/ | 12% | **40%** | 2/5 | 货币+雇佣已完；待完成：市场、库存、交易 |
| society/ | 14% | **20%** | 1/5 | 法律系统已加；待完成：节日、群体、档案 |
| innovation/ | 8% | **33%** | 1/3 | 创新树已完；待完成：技术检测、发现事件 |
| narrative/ | 8% | **25%** | 1/4 | 编年史生成器已加；待完成：chronicle存储、事件触发、模板 |

**总体进度：65%**（27/43 源文件，7,570 行代码）

### 2.3 模块详情

#### ✅ 已完成
- **config/**: 18个初始角色（面馆世家、铁匠铺、中医馆等），119种物品，19个科技节点，技能体系，市场经济配置
- **core/**: WorldEngine（存档/读档/快照），SeededRNG（确定性），EventBus（10种事件类型），完整类型系统
- **world/**: 50×55网格地图（6种地形），建筑系统（升级/衰败/维修/效率），四季+天气，资源采集与再生
- **index.ts**: CLI（新游戏/继续/重播），中文姓名生成，季节叙事，主循环

#### ✅ 本轮新增（2026-06-09）
- **world/map.ts**: MapSystem — 确定性地图生成，地块查询，资源产量，地形统计
- **world/buildings.ts**: BuildingSystem — 衰败/升级/维修/效率，支持所有者绑定
- **narrative/chronicle-generator.ts**: 编年史生成 — 季节叙事、年终总结、事件分级（peaceful→epochal）
- **society/laws.ts**: 法律系统 — 提案触发、执法检测、违规罚款、法律统计
- **agents/dialogue-topics.ts**: 对话生成 — 7类话题、情感倾向、关系值更新、社会互动

#### ⏳ 待完成
| 优先级 | 模块 | 文件 | 说明 |
|--------|------|------|------|
| P0 | economy/ | market.ts | 市场价格波动与供需 |
| P0 | economy/ | inventory.ts | 库存管理与物品流转 |
| P0 | economy/ | trade.ts | 自主交易逻辑 |
| P1 | agents/ | rumor-mill.ts | 谣言传播系统 |
| P1 | agents/ | group-system.ts | 社会群体/组织 |
| P1 | agents/ | town-events.ts | 城镇级随机事件 |
| P1 | innovation/ | tech-checker.ts | 技术前提检查 |
| P1 | innovation/ | discoveries.ts | 发现事件逻辑 |
| P2 | society/ | festivals.ts | 节日庆典 |
| P2 | society/ | groups.ts | 社会组织 |
| P2 | society/ | archives.ts | 历史档案 |
| P2 | narrative/ | chronicle.ts + event-emitter.ts | 编年史存储+事件触发 |

### 2.4 测试状态

- **12 个测试文件，全部通过** ✅
- **207 个测试用例，0 失败**
- 覆盖：RNG、EventBus、配置校验、创新树、知识传承、资源系统、建筑系统、地图系统、法律系统、编年史、对话系统、集成测试

### 2.5 设计原则

1. **WorldState 纯数据** — 所有逻辑在 Manager/System 类中
2. **EventBus 通信** — 模块间通过事件解耦
3. **确定性模拟** — 同一种子 + 相同操作序列 = 完全相同输出
4. **文化自发生成** — 法律从不满足中诞生，节日从庆祝中起源，不预设

---

## 三、Alicization Town — 参考项目

### 3.1 基本信息
- **来源**：GitHub 开源项目（AlicizationTown）
- **大小**：142MB（含 node_modules + GIF 素材）
- **版本**：0.7.0
- **最后一次提交**：README 更新（非开发性提交）

### 3.2 架构特点
- **Monorepo** 多包结构（6个包）
- 基于 MCP（Model Context Protocol）的架构
- 服务端渲染 + Web 前端
- 包含奇幻元素（地牢系统、RPG系统）
- Node.js 运行时

### 3.3 模块结构
| 包名 | 功能 | 状态 |
|------|------|------|
| server/ | 主服务器 + Web 静态页面 | 完整 |
| core-interfaces | 核心接口定义 | 完整 |
| dungeon | 地牢系统（含测试） | 完整 |
| mcp-bridge | MCP 桥接层 | 完整 |
| rpg-advanced | RPG 战斗/升级系统 | 完整 |
| town-cli | CLI 管理工具 | 完整 |

### 3.4 适用性评估

| 方面 | Alicization Town | 桃源镇 |
|------|-----------------|--------|
| 模拟深度 | 浅（偏向游戏化） | 深（文明模拟） |
| 真实主义 | ❌ 含地牢/怪物/魔法 | ✅ 彻底真实世界逻辑 |
| 架构参考价值 | ⭐⭐⭐ 事件驱动设计 | — |
| 代码可直接复用 | ⭐⭐ 通信层 | — |

**结论**：Alicization Town 的 **MCP 通信设计**和**事件驱动架构**有参考价值，但其奇幻设定与桃源镇的真实主义原则冲突。不宜直接复用业务代码。

---

## 四、下一步建议

### 短期（1-2轮开发）
1. **经济系统补齐** — 市场（market.ts）、库存（inventory.ts）、交易（trade.ts），这是模拟能否"活起来"的关键
2. **编年史存储** — chronicle.ts + event-emitter.ts，让事件能持久化并被引用

### 中期（3-5轮开发）
3. **社会系统深化** — 节日、群体、档案
4. **谣言传播** — 信息在 Agent 间的扩散
5. **创新事件** — 技术发现与突破的逻辑

### 长期
6. **集成到 index.ts 主循环** — 将所有新系统接入 tick
7. **Web 前端** — 或保持 CLI 纯模拟器
