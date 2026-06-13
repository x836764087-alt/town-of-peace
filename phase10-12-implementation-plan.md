# 桃源镇 Phase 10-12：LLM 驱动与自然生态

> **前置依赖：** Phase 9 ✅（LLM 基础设施 + 居民档案系统已完成）
> **当前状态：** 348 tests，48 源文件，11,972 行代码
> **Git：** 6614f86（已推送）

---

## 总览

| 阶段 | 内容 | 新建文件 | 修改文件 | 预估测试 | 核心交付 |
|------|------|---------|---------|---------|---------|
| **Phase 10** | 人格演化/记忆/决策 | 3 | 2 | +20 | 居民"活起来" |
| **Phase 11** | 叙事对话/事件种子 | 2 | 3 | +15 | 蝴蝶效应 |
| **Phase 12** | 生态/出生死亡闭环 | 1 | 4 | +15 | 世界"长起来" |
| **合计** | | **6** | **9** | **+50** | **398 tests 收官** |

---

## Phase 10：人格演化、记忆、决策系统

**前置依赖：** Phase 9（BiographySystem、LLMClient、Prompt 模板）
**设计文档参考：** `2026-06-09_phase9-llm-full-integration.md` 第 494-760 行

### 10.1 MemorySystem — 记忆压缩器

**文件：** `src/llm/memory-system.ts`（新建）

**职责：**
- 每季检测该 agent 经历的重要事件（结婚/生子/死亡/发明/犯罪等）
- 用 LLM 将本季重要事件压缩为 1-2 条记忆（20 字以内）
- LLM 不可用时用规则降级（取首条事件截断 30 字）
- 每个 agent 保留**最近 5 条**记忆，旧记忆自动过期

**核心接口：**
```typescript
class MemorySystem {
  async processSeasonalMemory(agent, seasonEvents): Promise<void>
}
```

**实现要点：**
- 关键词匹配筛选重要事件（结婚/死亡/生子/发明/当选/偷盗/争吵等）
- 若无重要事件则跳过（不产生记忆）
- 记忆列表超过 5 条时截断，只保留最新的

**接入主循环位置：** `src/index.ts` 中 `lifecyclePhase`→`economicPhase` 等所有 Phase 完成后、`engine.tick()` 之前，插入记忆压缩阶段。

**测试验证：**
- agent 经历重要事件后产生记忆 ✅
- 记忆列表不超过 5 条 ✅
- LLM fallback 不抛异常 ✅

---

### 10.2 PersonaEvolution — 人格演化系统

**文件：** `src/llm/persona-evolution.ts`（新建）

**职责：**
- 每 10 年用 LLM 根据最近经历微调人格
- 让人物有"成长弧光"——保守者经历变故后可能改变
- LLM 不可用时顺延 5 年再试，不做变更

**核心接口：**
```typescript
class PersonaEvolution {
  async updateIfNeeded(agent): Promise<void>
}
```

**实现要点：**
- 检查 `agent.biography.persona.lastUpdated` 距当前是否 >= 10 年
- 收集最近 10 年的人生大事 → 构造 prompt
- LLM 输出新的 traits/values/motto/arc → 写入 biography
- JSON 解析失败 → 顺延 5 年，不下次 tick 重试

**接入主循环位置：** 每年初（第 0 季），对所有 alive agent 执行人格更新检查。

**测试验证：**
- 人格确实在 10 年后发生变化 ✅
- LLM 失败后顺延 5 年 ✅
- 新出生 agent 不会立即更新（不到 10 年） ✅

---

### 10.3 DecisionEngine — 关键决策引擎

**文件：** `src/llm/decision-engine.ts`（新建）

**职责：**
- 仅在 agent 遇到重大选择时调用
- LLM 输出选项+权重，系统按加权随机选择
- LLM 不可用时回退到纯 RNG（等权重）

**核心接口：**
```typescript
interface DecisionOption {
  action: string;
  weight: number;  // 0-100
  reason: string;
}

class DecisionEngine {
  async suggestDecisions(agent, context): Promise<DecisionOption[]>
  selectDecision(options): string  // 加权随机选择
}
```

**实现要点：**
- 只在关键决策点调用——如"是否参战""移民去向""职业选择"
- 决策受人格影响：保守者不倾向于冒险选项
- `selectDecision` 使用 SeededRNG 按加权随机选择，保证确定性

**接入主循环位置：** 暂不主动接入（Phase 10 只创建引擎），由后续 Phase 在具体决策点调用。

**测试验证：**
- 返回选项权重正确 ✅
- LLM fallback 回退等权重 ✅
- selectDecision 按权重分布选中 ✅

---

### 10.4 集成：主循环（index.ts）

**修改文件：** `src/index.ts` + `src/config/env.ts`

**接入位置：** 在现有 Phase 9 的 biography 阶段之后、`engine.tick()` 之前，按顺序插入：

1. 记忆压缩（MemorySystem）— 每季运行
2. 人格演化（PersonaEvolution）— 每年初运行（第 0 季）
3. 决策引擎（DecisionEngine）— 暂不主动调用，创建单例供后续使用

**开关控制：** `env.ts` 添加 `LLM_SWITCHES.memory: boolean`、`LLM_SWITCHES.persona: boolean`，可用环境变量开关。

**代码示例（index.ts 主循环插入点，约第 676 行）：**
```typescript
// ─── Phase 10：记忆 + 人格 ───
const memorySystem = new MemorySystem();
for (const agent of state.agents) {
  if (agent.alive) {
    // 从本季所有 events 中筛选出该 agent 相关的
    // （events 由各 phase 收集后传入）
    await memorySystem.processSeasonalMemory(agent, phaseEvents);
  }
}

if (state.year !== (state as any).lastPersonaUpdateYear) {
  const personaEvolution = new PersonaEvolution();
  for (const agent of state.agents) {
    if (agent.alive && agent.biography) {
      await personaEvolution.updateIfNeeded(agent);
    }
  }
  (state as any).lastPersonaUpdateYear = state.year;
}
```

---

### Phase 10 验证标准

| # | 验证项 | 方法 |
|---|--------|------|
| 1 | 人格在 10 年后发生变化 | 模拟 100 年，比较 40 岁和出生时 traits 不同 |
| 2 | 记忆不超过 5 条 | 模拟 50 年，检查各 agent memories.length ≤ 5 |
| 3 | 关键决策受人格影响 | mock 测试：保守者 vs 冒险者，同一场景选不同 |
| 4 | LLM 不可用时全系统回退 | 模拟 `LLM_SWITCHES.all=false` 时原确定性系统运行正常 |
| 5 | 编译零错误 | `npx tsc --noEmit` |
| 6 | 测试全通过 | `npm test` |
| 7 | 双种子模拟 20 年不崩溃 | seed 42 + seed 9999 |

---

## Phase 11：叙事对话与事件种子

**前置依赖：** Phase 10（决策引擎支持事件分支）
**设计文档参考：** `2026-06-09_phase9-llm-full-integration.md` 第 763-1008 行

### 11.1 DialogueGenerator — 居民对话

**文件：** `src/llm/dialogue-generator.ts`（新建）

**职责：**
- 每季从 alive agent 中随机抽取 3 对
- 用 LLM 生成自然语言对话（2-4 轮）
- 对话写入 chronicle 作为叙事输出，不影响模拟状态
- LLM 不可用时生成占位文字「XX 和 XX 没有交谈」

**核心接口：**
```typescript
class DialogueGenerator {
  constructor(private rng: SeededRNG) {}
  generateDialogue(speakerA, speakerB, context): Promise<string>
}
```

**实现要点：**
- 从 alive agent 中采样 pairs（排除夫妻? 可选）
- context 传入当前季节 + 最近重大事件
- 对话内容写入 chronicle + archive
- 性能：每季最多 3 对，每对 1 次 API 调用

---

### 11.2 EventSeeder — 蝴蝶效应事件种子

**文件：** `src/llm/event-seeder.ts`（新建）

**职责：**
- 每季 LLM 生成 1-2 个"微事件种子"
- 种子有触发条件、触发概率、后效、链式概率
- 系统每季检查所有种子，符合概率则触发
- 链式概率导致"蝴蝶效应"——一个种子触发后有概率产生后续事件
- LLM 不可时系统静默跳过，不生成新种子

**核心接口：**
```typescript
interface EventSeed {
  id: string;
  title: string;
  description: string;
  triggerChance: number;       // 0-1 每季检测
  effectType: 'resource'|'social'|'environment'|'health'|'migration';
  effectDescription: string;
  chainChance: number;         // 触发后链式概率
  chainDescription?: string;
  age: number;                 // 已存在的年数
  maxAge: number;              // 过期年数（3-8年随机）
}

class EventSeeder {
  generateSeeds(worldState): Promise<EventSeed[]>
  checkSeeds(worldState): EventSeed[]  // 检查触发
  applyEffect(seed, worldState): string[]  // 应用效果
}
```

**实现要点：**
- 种子池上限 5 个，满了不生成新的
- LLM 生成时传入当前世界状态（年份/人口/建筑/季节）
- `checkSeeds()` 用 SeededRNG 判断触发概率（确定性）
- `applyEffect()` 按 effectType 分类处理效果
- 链式种子下季必触发（triggerChance=1.0）

**EventSeeder 效果处理（applyEffect）：**

| 类型 | 效果 | 示例 |
|------|------|------|
| resource | 资源产出增减/价格浮动 | "药材大丰收，价格下降" |
| social | 居民关系/声望变动 | "邻里纠纷，两派对立" |
| environment | 天气/地形影响 | "连续暴雨，道路泥泞" |
| health | 疾病/健康影响 | "瘟疫初现，人心惶惶" |
| migration | 人口迁入/迁出 | "商旅带来外地消息" |

---

### 11.3 集成：主循环 + 编年史

**修改文件：** `src/index.ts`、`src/narrative/chronicle-generator.ts`、`src/society/archives.ts`

**接入位置（index.ts）：** 在 Phase 10 记忆压缩阶段之后、engine.tick()之前：

1. 对话生成 → 写入 chronicle（叙事层，不改变模拟状态）
2. 事件种子生成（种子池 < 5 时）→ 推入种子池
3. 种子触发检测 → 触发则调用 applyEffect，写入 archive

**接入位置（chronicle-generator.ts）：** 每年结束后增加"对话摘要"和"事件摘要"段落。

**接入位置（archives.ts）：** 给 archive 新增 `event_seed` 类型，记录被触发的事件种子。

**开关控制：** `env.ts` 添加 `LLM_SWITCHES.dialogue: boolean`、`LLM_SWITCHES.event_seeds: boolean`

---

### Phase 11 验证标准

| # | 验证项 | 方法 |
|---|--------|------|
| 1 | 模拟 100 年出现 10+ 条 LLM 生成对话 | 检查 chronicle 中对话数 |
| 2 | 出现 3+ 次意外事件（非预设模板） | 手动检查事件 seed 输出 |
| 3 | 至少 1 次链式触发（蝴蝶效应） | seed A→seed B 的 chain |
| 4 | LLM 生成内容不影响模拟正确性 | 种子只是增强叙事，不改变核心计算 |
| 5 | 超量种子自动过期（maxAge 限制）| 种子池不超过 5 |
| 6 | 编译零错误 | `npx tsc --noEmit` |
| 7 | 测试全通过 | `npm test` |

---

## Phase 12：自然生态 + 出生死亡闭环

**前置依赖：** Phase 11（事件种子会交互生态）
**设计文档参考：** `2026-06-09_phase9-llm-full-integration.md` 第 1012-1192 行

### 12.1 EcologySystem — 自然生态模型

**文件：** `src/world/ecology.ts`（新建）

**职责：**
- 轻量级生态模型：森林覆盖、野生动物（兔/鹿/狼/鱼）、土地肥力
- 年循环：森林再生、动物繁殖/捕食、鱼类再生
- 过度采集会消耗生态（砍树→森林缩小、捕鱼→鱼减少）
- 生态有自恢复能力（但不一定恢复到原始水平）
- 写入年度"自然风貌"叙事

**核心接口：**
```typescript
interface EcologyState {
  forestCover: number;       // 0-100，初始 80
  wildlife: {
    rabbits: number;         // 食草动物
    deer: number;
    wolves: number;          // 食肉动物
    fish: number;
  };
  soilFertility: number;     // 0-100
}

class EcologySystem {
  processEcology(): string[]              // 每季更新
  consumeWood(amount): number             // 砍伐消耗
  consumeFish(amount): number             // 捕捞消耗
  hunt(type): { success: boolean; food: number }  // 狩猎
  getSummary(): string                    // 生态摘要
}
```

**实现要点：**
- 生态数据挂在 `(worldState as any).ecology`（不污染 WorldState 类型）
- 森林自恢复：在上限 80% 以内缓慢回升
- 过度砍伐（<30%）导致野生动物减少
- 狼捕食兔子维持自然平衡
- 鱼类再生上限 200 条，过度捕捞会抓完

**生态循环（processEcology）：**
```
森林 → 兔子的庇护所 → 狼捕食兔子
                    ↘ 狼少了 → 兔子泛滥 → 草不够
鹿 ← 森林覆盖影响鹿的数量
鱼 ← 独立水域系统，自回复
```

---

### 12.2 出生/死亡 LLM 增强

**修改文件：** `src/agents/lifecycle-system.ts`

**新增能力：**
- **出生：** Phase 9 已实现 -> 调用 `biographySystem.initNewbornBiography()`
- **死亡：** Phase 9 已实现 -> 调用 `biographySystem.generateObituary()`
- **增加叙事：** 死亡时将讣告写入 chronicle，出生时写入"新生儿降临"

具体改动：在 `lifecycle-system.ts` 中 deathPhase 完成后，调用 biographySystem 生成 obituary 并将讣告写入本季 events。

---

### 12.3 生态叙事集成

**修改文件：** `src/narrative/chronicle-generator.ts`、`src/index.ts`

**chronicle-generator.ts 改动：**
- 每年结束前加一段"自然世界报道"：`【自然风貌】森林...覆盖...%...`

**index.ts 改动：**
- 在所有 Phase 完成之后新增「生态阶段」`processEcology()`
- 将生态结果加入 chronicle

**trade-system.ts 改动（可选）：**
- 木材交易时调用 `ecologySystem.consumeWood()`
- 渔业交易时调用 `ecologySystem.consumeFish()`

---

### Phase 12 验证标准

| # | 验证项 | 方法 |
|---|--------|------|
| 1 | 森林覆盖和动物数量随采集/狩猎变化 | 模拟 50 年后数据趋势验证 |
| 2 | 过度砍伐导致森林缩小、动物减少 | 大量砍伐 → 检查 forestCover 下降 |
| 3 | 捕捞有上限（鱼会抓完） | 大量捕捞 → 鱼归零 |
| 4 | 生态摘要出现在年度 chronicle | 检查 chronicle 含「自然风貌」 |
| 5 | 编译零错误 | `npx tsc --noEmit` |
| 6 | 测试全通过 | `npm test` |
| 7 | 双种子模拟 20 年不崩溃 | seed 42 + seed 9999 |

---

## 执行顺序

```
Phase 9 ✅ → Phase 10 → Phase 11 → Phase 12
                ↓            ↓
            Persona + Memory   对话生成 ← 依赖记忆
                ↓            ↓
             决策引擎       事件种子 ← 依赖决策
                               ↓
                          生态模型 ← 相对独立
                               ↓
                        出生死亡闭环 ← 最终收尾
```

**推荐分批：**

### 第一批（Phase 10.1 + 10.2）：记忆 + 人格
- MemorySystem + PersonaEvolution
- ~2 文件新建 + 1 文件修改
- 让居民有"个性" + "记忆"

### 第二批（Phase 10.3 + 11.1）：决策 + 对话
- DecisionEngine + DialogueGenerator  
- ~2 文件新建 + 1 文件修改
- 居民能按性格决策、LLM 生成对话

### 第三批（Phase 11.2 + 12.1）：事件种子 + 生态
- EventSeeder + EcologySystem
- ~2 文件新建 + 3 文件修改
- 蝴蝶效应 + 自然生态

### 第四批（12.2 + 12.3）：闭环收尾
- lifecycle-system LLM 增强 + 生态叙事
- ~0 文件新建 + 3 文件修改
- 全部子系统拉通

---

## 文件清单

### 新建（6 文件）

| 文件 | 阶段 | 预估行数 | 核心类 |
|------|------|---------|--------|
| `src/llm/memory-system.ts` | P10 | ~60 | MemorySystem |
| `src/llm/persona-evolution.ts` | P10 | ~80 | PersonaEvolution |
| `src/llm/decision-engine.ts` | P10 | ~100 | DecisionEngine |
| `src/llm/dialogue-generator.ts` | P11 | ~80 | DialogueGenerator |
| `src/llm/event-seeder.ts` | P11 | ~150 | EventSeeder |
| `src/world/ecology.ts` | P12 | ~150 | EcologySystem |
| **合计** | | **~620** | |

### 修改（9 文件）

| 文件 | 阶段 | 改动 |
|------|------|------|
| `src/index.ts` | P10 | 加入记忆 + 人格阶段 |
| `src/index.ts` | P11 | 加入对话 + 事件种子阶段 |
| `src/index.ts` | P12 | 加入生态阶段 |
| `src/narrative/chronicle-generator.ts` | P11 | 接入对话 + 事件叙事 |
| `src/narrative/chronicle-generator.ts` | P12 | 生态报告 |
| `src/society/archives.ts` | P11 | 新增 event_seed 类型 |
| `src/agents/lifecycle-system.ts` | P12 | 出生/死亡 LLM 增强 |
| `src/agents/trade-system.ts` | P12（可选） | 采集消耗生态 |
| `src/config/env.ts` | P10-P12 | 新增开关 |

### 新建测试（预估 +50 个）

| 测试文件 | 覆盖 | 预估数 |
|---------|------|-------|
| `memory-system.test.ts` | 记忆压缩/LLM fallback/上限 | ~8 |
| `persona-evolution.test.ts` | 10年更新/顺延/arc | ~6 |
| `decision-engine.test.ts` | LLM决策/等权重/selectDecision | ~8 |
| `dialogue-generator.test.ts` | 对话生成/pair采样 | ~6 |
| `event-seeder.test.ts` | 种子生成/触发/链式/过期/applyEffect | ~10 |
| `ecology.test.ts` | 生态循环/carrying/consume | ~8 |
| `phase10-integration.test.ts` | 全链集成 | ~4 |
| **合计** | | **~50** |

---

## 风险与缓解

| 风险 | 级别 | 缓解 |
|------|------|------|
| LLM API 不稳定导致模拟卡住 | 高 | **每个 LLM 调用都有 fallback**，超时后自动降级 |
| Phase 10-12 改动量太大 | 中 | **分 4 批独立上线**，每批可单独验证 |
| 100 年模拟调 400+ 次 API | 中 | 限速 60 RPM，实际 ~20 call/季 → 远低于限制 |
| 人格演化导致行为不一致 | 低 | 每 10 年才更新一次，有审核机制（fallback） |
| 生态模型导致人口/动物灭绝 | 低 | 自恢复保护，下限不归零 |
| 对话/事件 LLM 内容与模拟矛盾 | 低 | 对话和事件只是**叙事增强**，不影响模拟状态 |

---

## 快速路线图

```
今日起
  │
  ├── 第一批：记忆 + 人格（Phase 10.1 + 10.2 约 2h）
  │   └── 通过：测试全绿 + 模拟 50 年
  │
  ├── 第二批：决策 + 对话（Phase 10.3 + 11.1 约 2h）
  │   └── 通过：测试全绿 + 模拟 50 年
  │
  ├── 第三批：事件种子 + 生态（Phase 11.2 + 12.1 约 3h）
  │   └── 通过：测试全绿 + 模拟 50 年
  │
  └── 第四批：闭环收尾（Phase 12.2 + 12.3 约 1h）
      └── 通过：测试 398+ 全绿 + 双种子 20 年
```

现在要开工第一批吗？
