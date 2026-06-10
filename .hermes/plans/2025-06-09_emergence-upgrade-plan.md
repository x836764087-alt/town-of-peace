# 桃源小镇涌现式升级计划

**依据**：自然度审查报告识别出的系统性问题——从"决定论模拟+随机装饰"转向"涌现式文明模拟"

**核心理念**：不是加更多"东西"，而是让现有系统之间产生**因果链**和**真正的约束**。每个改动都应让"某件事的发生是因为另一件事"，而不是"因为RNG骰子掷到了X"。

---

## 概述

| 阶段 | 内容 | 依赖关系 | 预计文件变更 |
|------|------|----------|------------|
| **Phase 0** | 修复+基础准备 | 无 | 4 files |
| **Phase 1** | 遗传+教育+社会冲突 | Phase 0 | 6 files |
| **Phase 2** | 地图激活+位置系统 | Phase 0 | 3 files |
| **Phase 3** | 资源约束+真实生产链 | Phase 1, 2 | 7 files |
| **Phase 4** | 科技效果实装+失败机制 | Phase 3 | 4 files |
| **Phase 5** | 文化涌现+节日生成 | Phase 1 | 4 files |
| **Phase 6** | 劳动力市场+经济分层 | Phase 3 | 4 files |
| **Phase 7** | 治理+司法系统 | Phase 5 | 4 files |
| **Phase 8** | 疾病+意外死亡 | Phase 1 | 2 files |
| **Phase 9（远期）** | LLM Agent / MCP / 可视化 | Phase 0-8 | 大量 |

---

## Phase 0: 基础修复（1天）

### 0.1 修正第二代技能为空的问题
- **文件**：`src/agents/lifecycle-system.ts`
- **问题**：`birthChild()` 中 `skills: {}` 直接留空
- **改法**：先在 `types.ts` 的 `AgentState.skills` 增加 `Record<string, number>` 保持兼容。在 `birthChild()` 中，从父母各继承 30-50% 的技能（取交集+并集），并添加随机变异 ±10%。
- **关键代码**：
  ```typescript
  // 从父母继承技能
  const inheritedSkills: Record<string, number> = {};
  const allSkillKeys = new Set([
    ...Object.keys(father.skills), 
    ...Object.keys(mother.skills)
  ]);
  for (const key of allSkillKeys) {
    const paternal = father.skills[key] ?? 0;
    const maternal = mother.skills[key] ?? 0;
    const base = Math.round((paternal + maternal) / 2 * this.rng.uniform(0.3, 0.5));
    inheritedSkills[key] = Math.max(0, Math.min(100, base + this.rng.int(-10, 10)));
  }
  ```
- **验证**：运行模拟10年，`data/saves/last-save.json` 中的 newborn agent 应有非空 skills

### 0.2 修正新生儿属性值
- **文件**：`src/agents/lifecycle-system.ts`
- **问题**：所有新生儿 `strength:30, intelligence:30, dexterity:30, charisma:30, health:50`
- **改法**：使用父母属性加权平均（父亲0.4 + 母亲0.4 + 随机0.2）生成
  ```typescript
  const newStats = {
    strength: Math.round(father.stats.strength * 0.4 + mother.stats.strength * 0.4 + this.rng.int(0, 20)),
    intelligence: Math.round(father.stats.intelligence * 0.4 + mother.stats.intelligence * 0.4 + this.rng.int(0, 20)),
    // ... 同理
  };
  ```
- **验证**：新生儿 stats 不再是固定值，而是随父母变化

### 0.3 增加 Tag 继承
- **文件**：`src/agents/lifecycle-system.ts`
- **改法**：新生儿从父母各继承 1-2 个 tags，加上出生随机 tag

### 0.4 修复标题（title）继承问题
- **文件**：`src/agents/lifecycle-system.ts`
- **改法**：新生儿不继承父母 title（title 应该是后来获得的），但增加 `title: undefined`

---

## Phase 1: 社会机制增强（2天）

### 1.1 教育系统实装
- **文件**：`src/agents/lifecycle-system.ts`, `src/index.ts`
- **问题**：当前学校只是 tag `attending_school`，无实际效果
- **改法**：
  - 在 `populationPhase()` 中的年龄处理分支，当 age 5-12 且建筑 `school` 存在时，每年：
    - 随机 1-3 点 `intelligence` 提升
    - 父母技能中有 `>20` 的技能，以 20% 概率传承（学校教通识课外的实用技能）
    - `literacy`（识字率）每年 +5（上限 80），最多 12 年
  - 如果周建国（zhou-jianguo）作为塾师存活，学习效率 ×1.5
  - 辍学机制：如果家庭财富 < 50（交不起束脩），50% 概率辍学
- **验证**：上学 12 年的角色 intelligence 应比未受教育角色高 12-36 点，且 literacy 非零

### 1.2 少年阶段有用化
- **文件**：`src/agents/lifecycle-system.ts`, `src/index.ts`
- **改法**：13-17 岁少年：
  - 可做"学徒"（短工，收入为成人的 30-50%）
  - 跟随父母学习：每年父母主要技能 +2（上限父母水平的 70%）
  - 可参与基础采集（产出为成人的 40%）
- **验证**：少年不再"空转"

### 1.3 社会冲突系统
- **文件**：`src/agents/town-events.ts`, `src/index.ts`
- **问题**：100 年 0 起犯罪，完全不真实
- **改法**：在 `TownEvents` 中增加冲突事件池，每季检查：
  - **偷盗**（~3%/季）：触发条件——某 agent wealth < 20 且偷窃技能 > 与目标关系值。后果：目标损失 1-5 单位粮食/物品，偷盗者获得，若被抓（关系值下降 15-30，被罚款）
  - **争吵**（~5%/季）：随机两人，关系值 < 0 → 概率升级。后果：关系值再跌 10-20，旁观者站队
  - **斗殴**（~0.5%/季）：争吵升级，或酒后。后果：双方 health 减 5-15，可能掉技能
  - **纵火**（~0.1%/季）：极端事件，概率极小
  - 冲突频率受 `happiness` 平均值影响——幸福感越低，冲突越高
- **增加执法效果**：有 Law（治安法）时，盗窃被抓概率从 30%→60%
- **验证**：100 年模拟至少应有 10-20 起冲突记录

### 1.4 负面事件后果链
- **文件**：`src/agents/town-events.ts`
- **改法**：重大犯罪（盗窃/斗殴）会：
  - 降低全镇 `happiness` 平均值 1-3 点（持续 2-3 年）
  - 增加 LawSystem 中 "治安法" 被提议的概率
  - 受害者家族成员对犯罪者关系值 -30
- **验证**：事件影响应能传导到其他系统

---

## Phase 2: 地图激活+位置系统（1.5天）

### 2.1 Agent 位置追踪
- **文件**：`src/core/types.ts`, `src/index.ts`, `src/agents/lifecycle-system.ts`
- **改法**：`AgentState` 增加坐标 `{ x: number, y: number }` + `currentBuilding?: string`
- 初始位置设为 agent 的 `initialBuilding` 坐标
- 每季更新：默认在建筑处 idle，有交易需求时移动到对应建筑
- **验证**：`state.agents[n].x` 和 `state.agents[n].y` 非零

### 2.2 距离影响社交
- **文件**：`src/agents/dialogue-topics.ts`, `src/agents/trade-system.ts`
- **改法**：
  - 社交概率 = 基础概率 × `(1 - distance / maxRange)`
  - 距离 > 20 格：几乎不社交
  - 交易也受距离影响——不会有人从地图这一端跑到另一端买一碗面
  - 婚姻匹配：距离 < 10 格的配偶候选概率 ×2
- **验证**：地图中心区域（建筑聚集区）社交/交易密度显著高于边缘

### 2.3 建筑内 Agent 聚合
- **文件**：`src/index.ts`
- **改法**：每季记录每个建筑内有多少 Agent，作为"社区活力"指标
- 人多的地方（客栈、面摊）社交概率倍增

---

## Phase 3: 资源约束+真实生产链（3天）

### 3.1 建筑产出需要消耗
- **文件**：`src/agents/trade-system.ts`, `src/config/items.ts`
- **问题**：花圃凭空产出 8-15 蔬菜+3-8 稻米，铁匠铺不消耗铁矿石
- **改法**：为每个建筑添加 `recipe`——输入→输出映射
  ```typescript
  export const BUILDING_RECIPES: Record<string, {
    inputs: { itemId: string; quantity: number }[];
    outputs: { itemId: string; min: number; max: number }[];
    laborRequired: number; // 需要多少人全职工作
  }[]> = {
    flower_garden: [
      { inputs: [{ itemId: 'water', quantity: 1 }], outputs: [{ itemId: 'vegetables', min: 5, max: 10 }], laborRequired: 1 },
    ],
    blacksmith: [
      { inputs: [{ itemId: 'iron_ore', quantity: 2 }, { itemId: 'charcoal', quantity: 1 }], 
        outputs: [{ itemId: 'tools', min: 1, max: 2 }], laborRequired: 1 },
    ],
    noodle_stall: [
      { inputs: [{ itemId: 'flour', quantity: 2 }], outputs: [{ itemId: 'noodle', min: 8, max: 15 }], laborRequired: 1 },
    ],
    // ...
  };
  ```
- 如果建筑所有者库存中没有足够原材料，产出减半或为零
- 建筑所有者需通过购买或采集获取原材料
- **验证**：无水/无铁→铁匠铺产出为 0

### 3.2 采集系统
- **文件**：`src/agents/lifecycle-system.ts` 或新建 `src/world/resources.ts`
- **改法**：
  - 每季度，无特殊工作的 Agent 可以"采集"——获取基础资源
  - 靠近森林 → 木头，靠近山地 → 石头/矿石，靠近水域 → 鱼
  - 采集技能影响产出数量（基础 1-3，技能高→2-6）
  - 采集产出受天气影响（雨天产出 -30%，雪天 -50%）
- **验证**：森林附近的 Agent 产出木头，水域附近的产出鱼

### 3.3 真正的饥饿机制
- **文件**：`src/agents/trade-system.ts`, `src/index.ts`
- **问题**：儿童食物不足会自动从父母扣除，"饥荒"不存在
- **改法**：
  - 每季度消耗：成人 3 单位粮食，儿童 2 单位
  - 粮食不足时：先吃库存，库存为 0 时 health 每季 -5，连续 4 季度 health=0 → 死亡（饿死）
  - 父母不会无条件供养成年子女（已分家）
  - 孤儿/贫困者由社区（town_hall 的 wealth）供养——赵长河作为里正有一定社会救助
- **验证**：连续三年粮食短缺应导致人口下降

### 3.4 季节性生产波动
- **文件**：`src/agents/trade-system.ts`
- **改法**：
  - 春天：种植期，产出少（植物生长中）
  - 夏天：部分产出
  - 秋天：丰收，产出 ×2.0
  - 冬天：产出 ×0.2
  - 极端天气极端减成
- **验证**：冬季粮食产出暴跌，秋季激增

---

## Phase 4: 科技效果实装（1.5天）

### 4.1 科技效果挂载
- **文件**：`src/innovation/discoveries.ts`, `src/config/innovation-tree.ts`
- **问题**：`unlocks` 字符串列表没有被任何系统检查
- **改法**：
  - 在 `WorldState` 增加 `unlockedFeatures: Set<string>`——每次创新成功后，将其 `unlocks` 全部注册
  - `buildingProduction()` 检查 `unlockedFeatures`：砖烧制解锁前只能用夯土（建筑升级受限），解锁后可用砖升级
  - 玻璃制作解锁后→ `clinic` 产出加成（玻璃器皿可用于医疗）
  - 电磁感应解锁后→新建筑"发电房"可用
- **验证**：解锁"砖烧制"后，建筑升级 cost 降低 30%

### 4.2 研究需要消耗资源
- **文件**：`src/innovation/discoveries.ts`
- **改法**：研究不仅需要智力，还需要实际资源投入：
  - 改良型：消耗 2-5 单位材料和 20-50 文
  - 原理型：消耗 5-15 单位和 100-300 文
  - 资源不足时不能开始研究
- **验证**：贫穷的小镇无法快速推进科技

### 4.3 研究失败有代价
- **文件**：`src/innovation/discoveries.ts`
- **改法**：
  - 失败时消耗的资源不退还
  - 失败可能造成人身伤害（炼金爆炸→ health -10，火灾等）
  - 连续失败后概率开始累积经验（下次 +5% 成功率）
- **验证**：研究者可能因实验失败而受伤或死亡

### 4.4 知识传播机制
- **文件**：`src/innovation/discoveries.ts`, `src/agents/dialogue-topics.ts`
- **改法**：
  - 当一项科技被发现后，通过社交网络传播
  - 每年传播：知识拥有者社交圈中有 20% 概率 +1 到该知识对应技能
  - 如果镇上有学堂且教师掌握该知识→学生在校期间有机会学到
- **验证**：造纸术发现 20 年后，20% 人口应知道造纸术相关知识

---

## Phase 5: 文化涌现（2天）

### 5.1 从事件生成节日
- **文件**：`src/society/festivals.ts` → 大改
- **问题**：节日是预设的 6 个模板
- **改法**：节日自然诞生机制：
  - 当 "epochal" 级事件发生时（如抗灾胜利、重大发现、英雄牺牲），有 30% 概率 → 形成节日
  - 节日名称 = 事件关键词 + "纪念日"/"节"
  - 节日属性：参与者投票决定是否延续，连续参与率 < 30% → 5 年后消亡
  - 每年参与节日 → 参与者的 happiness +3-5
  - 非预设模板的节日才有说服力
- **验证**：重大火灾后 2 年内可能诞生"防火纪念日"

### 5.2 地名演变
- **文件**：新建 `src/society/placenames.ts`
- **改法**：
  - 建筑/地点可以因事件获得别名："张武打架的那个街角"→"武街口"
  - 重要人物的故居可以成为地名
  - 地名记录在 chronicle 中，作为文化证据
- **验证**：100 年后地图上应有 3-5 个非原始名称的地点

### 5.3 口述传统和传说
- **文件**：`src/narrative/chronicle-generator.ts`
- **改法**：
  - 每年从 chronicle 中挑选"最重要"的事件（按 severity），作为"镇志"保留
  - 每 25 年由 System 自动整理一次"镇史"——不是 cold data，而是每年在节日或集会时被提及
  - 镇史提及 → 相关家族成员 happiness +2（荣誉感）
- **验证**：50 年时应有"建镇回望"类型的叙事输出

### 5.4 艺术创作
- **文件**：`src/agents/lifecycle-system.ts` 扩展
- **改法**：
  - 画室（小野）：每 5 年产出 1 幅"画作"，记录当年的重大事件
  - 文人（周建国/周晓月）：可能写诗、写日记
  - 产出作为 `ArchiveEntry` 记录
- **验证**：画室产出应包含叙事描述而非单纯物品数字

---

## Phase 6: 劳动力市场+经济分层（3天）

### 6.1 雇佣系统
- **文件**：`src/agents/trade-system.ts`, `src/index.ts`
- **问题**：所有人都是独立经济个体，没有雇佣关系
- **改法**：
  - 建筑所有者可雇佣 1-3 人
  - 雇佣条件：雇员技能 > 20，且 owner 有足够财富支付工资
  - 工资 = 基础 10 文/季 + floor(技能/10) × 3 文
  - 雇员工资从 owner 的 wealth 中扣除
  - 被雇佣者失去"自由采集"能力但获得稳定收入
- **验证**：系统中出现"工人"和"雇主"两个经济层级

### 6.2 学徒制系统
- **文件**：`src/index.ts`（已有 `apprenticeships` 结构但未使用）
- **改法**：
  - 13-17 岁少年可拜师：师父必须有该技能 > 50，徒弟每年该技能 +3
  - 学徒期间工资为正常工人的 30%
  - 出师（18 岁或技能 > 40）后可独立
  - 出师后与师父保持关系 +20
- **验证**：出师的徒弟应具有相关技能

### 6.3 财富不平等追踪
- **文件**：`src/agents/trade-system.ts` 或新建统计
- **改法**：
  - 每季度记录全镇财富分布的基尼系数（Gini coefficient）
  - 基尼系数 > 0.6 → 触发社会动荡（冲突概率 ×2）
  - 记录在 chronicle 中
- **验证**：贫富差距扩大后冲突应增加

### 6.4 物价受供需影响
- **文件**：`src/agents/trade-system.ts`
- **问题**：固定价格 ±30% 波动
- **改法**：
  - 跟踪过去 4 季度每种商品的成交量
  - 供过于求（成交量 > 平均×1.5）→ 价格 -20%
  - 供不应求（成交量 < 平均×0.5）→ 价格 +30%
  - 囤货居奇：如果某个 agent 持有物品总量 > 全镇总量的 50%→该物品价格上涨 +15%
- **验证**：丰收年粮食价格下降，歉收年上涨

---

## Phase 7: 治理+司法系统（2天）

### 7.1 里正权力实装
- **文件**：`src/society/laws.ts`, `src/index.ts`
- **问题**：赵长河的"里正"头衔无实际权力
- **改法**：
  - 里正拥有以下权力：
    - 可以提出新法律（+30% 被通过概率）
    - 可以裁决纠纷（冲突发生后调解，减少关系值损失）
    - 可以动用 town_hall 库存救济贫困
  - 里正由选举/继承产生（目前默认赵长河，出事后由威望最高者继任）
- **验证**：里正死亡后应有新里正继任

### 7.2 法律从事件中诞生
- **文件**：`src/society/laws.ts`
- **问题**：只有 4 种预设法律
- **改法**：法律自动生成机制：
  - 某类冲突累计发生 3 次+ → 触发对应法律提议
  - 偷盗 ×3 → "反盗窃法"提议
  - 斗殴 ×2 → "公共秩序法"提议
  - 投票机制：全成年人投票，赞成率 > 50% 通过
  - 赞成率 = 与提议者关系值归一化 + 该法律是否符合自身利益（有财产的人更支持防盗法）
- **验证**：连续盗窃发生后，应有"反盗窃法"被提出并投票

### 7.3 违规→审判流程
- **文件**：`src/society/laws.ts`
- **改法**：
  - 违规发生后，不是系统直接扣钱
  - 而是：违规→被目击/被发现→举报→里正裁决→惩罚
  - 惩罚类型：罚款（扣 wealth）、劳役（health -2/季）、驱逐（移除外来者）
  - 如果里正与违规者关系好（> 50）→从轻发落，关系不好（< -20）→从重
- **验证**：违规后不再立即扣钱，而是有流程描述

---

## Phase 8: 疾病+死亡机制增强（1天）

### 8.1 改良流行病模型
- **文件**：`src/agents/lifecycle-system.ts`
- **改法**：
  - 感染概率受人口密度影响：镇上人口 > 30 时，传染病传播概率 ×1.5，> 50 时 ×2.0
  - 感染后可以自愈（基础 20%），也可以传染给同建筑/同家庭成员
  - 有隔离行为：如果疫情持续 2 年以上，Agent 自动减少社交（社交概率降为 50%）
  - 草药（herbal_medicine）可以增加自愈率（+15%）
- **验证**：高密度社区疫情传播更快

### 8.2 意外死亡
- **文件**：`src/agents/lifecycle-system.ts`
- **改法**：
  - 铁匠：每年 2% 概率烧伤/工伤致死
  - 渔民/水边职业：每年 1% 概率溺亡
  - 建筑/施工：每年 1.5% 概率坠落/砸伤
  - 冬季取暖：每年 1% 概率一氧化碳中毒（有烟道科技后降为 0.2%）
  - 武器类工作（如果有）：战斗致死
- **验证**：100 年模拟中应有 3-8 例意外死亡

### 8.3 婴儿死亡率调高
- **文件**：`src/agents/lifecycle-system.ts`
- **改法**：
  - `INFANT_SURVIVAL_RATE` 从 0.90 降到 0.70（新生儿第一年存活率）
  - 有助产士（wang-xiuzhi，接生婆技能 > 60）时，存活率升至 0.80
  - 有草药时再加 0.05
- **验证**：婴儿死亡率从 10%→30%，更接近历史数据

---

## Phase 9: 远期架构（待定，2周+）

### 9.1 LLM Agent 集成（可选）
- 引入轻量级本地模型（Qwen2.5-7B/Ollama）驱动 2-3 个核心角色
- 使用 LLM 生成每日计划、社交对话、决策
- 其他非核心角色仍由系统 RNG 驱动
- 这需要设计**统一的 Agent 接口**——LLM 和 Procedural Agent 使用相同的行为接口

### 9.2 MCP 架构
- 借鉴 Alicization Town 的 MCP Bridge
- Agent 通过 MCP 工具调用与模拟世界交互（"move to building X", "buy item Y", "talk to person Z"）
- 每个 Agent 启动一个 MCP 客户端，模拟世界作为 MCP 服务器

### 9.3 前端可视化
- 像素地图实时展示 Agent 位置和活动
- WebSocket 推送状态更新
- 终端 UI 或 Web 前端

---

## 变更总览（全文件清单）

```
Phase 0:
  src/agents/lifecycle-system.ts  ← 核心修改（birthChild）
  src/index.ts                ← 调整引用

Phase 1:
  src/agents/lifecycle-system.ts  ← 教育+少年阶段
  src/index.ts                    ← 主循环增加教育阶段
  src/agents/town-events.ts       ← 冲突系统
  src/agents/dialogue-topics.ts   ← 新话题

Phase 2:
  src/core/types.ts               ← AgentState +位置字段
  src/index.ts                    ← 位置更新
  src/agents/dialogue-topics.ts   ← 距离权重
  src/agents/lifecycle-system.ts  ← 出生位置

Phase 3:
  src/agents/trade-system.ts      ← 生产链重构
  src/config/items.ts             ← 新物品（iron_ore, charcoal, flour...）
  src/world/resources.ts          ← 新建：采集系统
  src/index.ts                    ← 采集+饥饿检查

Phase 4:
  src/innovation/discoveries.ts   ← 消耗+传播
  src/config/innovation-tree.ts   ← 效果定义增强
  src/agents/trade-system.ts      ← 检查 unlocks

Phase 5:
  src/society/festivals.ts        ← 重写：涌现节日
  src/society/placenames.ts       ← 新建
  src/narrative/chronicle-generator.ts  ← 口述传统

Phase 6:
  src/agents/trade-system.ts      ← 雇佣+工资+供需
  src/index.ts                    ← 劳动力市场阶段

Phase 7:
  src/society/laws.ts             ← 重写：事件驱动法律+司法流程
  src/index.ts                    ← 治理阶段

Phase 8:
  src/agents/lifecycle-system.ts  ← 意外+流行病+婴儿死亡率

Phase 9:
  大量新文件（可选）
```

---

## 执行策略

### 推荐执行顺序
1. **Phase 0 → Phase 1 → Phase 2** 并行启动（互不冲突）
2. **Phase 3** 在 Phase 1+2 之后（依赖地图位置进行资源匹配）
3. **Phase 4** 可在 Phase 3 同时进行
4. **Phase 5** 在 Phase 1 之后即可启动
5. **Phase 6** 在 Phase 3 之后（需要真实生产链作为经济基础）
6. **Phase 7** 在 Phase 1+5 之后
7. **Phase 8** 可在 Phase 1 之后随时插入

### 每阶段提交原则
每个 Phase 完成后：
1. 运行 `npx tsx src/index.ts --new --seed 42 --years 100` 验证不崩溃
2. 检查保存的 `data/saves/last-save.json` 中相关字段是否正确生成
3. 检查年度 chronicle 输出中出现预期的叙事事件
4. Git commit（如果项目已初始化 git）

### 验证闭环
升级的核心目标不是"更多功能"，而是**系统间因果链**。每个改动的验证标准：
- ❌ "加了这个机制" ← 不够
- ✅ "因为 A 发生了 X，所以 B 发生了 Y，影响了 C"

---

## 风险与权衡

| 风险 | 级别 | 缓解 |
|------|------|------|
| 真实生产链可能让人口无法存活（饥荒崩溃） | 中 | 初始参数保守，先调低消耗/调高产出 |
| 社会冲突可能让小镇太快解体 | 中 | 初始冲突概率设低值，逐渐调整 |
| 科技消耗资源可能锁定落后 | 低 | 资源需求先设可调整常量 |
| 教育的技能继承和代际累积可能造成"贵族" | 低 | 加随机衰退和变异平衡 |
| 法律投票可能太过复杂 | 中 | MVP 里正决定制代替全民投票 |

---

## 首期建议

如果时间有限，建议**优先做 Phase 0 + Phase 1 的 1.1 和 1.3**（教育+冲突）：
- 改动量最小（3-4 个文件）
- 效果最明显（角色不再"无技能"，社会有"事件感"）
- 不依赖后续 Phase

这两个改动可以在 1-2 天内完成验证。
