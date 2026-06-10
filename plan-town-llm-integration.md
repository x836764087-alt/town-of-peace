# 桃源镇 LLM 智能体整合方案 — 计划

> **目标**：将 Agnes AI 的 6 个 API Key 配置到桃源镇世界的各个层面，使 NPC 从"决定论+随机数"进化到"LLM 驱动"的智能体，实现自运转、自然生长、涌现式智能。

---

## 一、核心理念：不要把 LLM 当 RNG 替代品

当前桃源镇的 NPC 决策是 **RNG + 规则表**（如 `rng.chance(0.3)` → 决定是否上学）。LLM 的核心价值不是替代随机数，而是带来：

- **情境理解**：NPC 根据自身状态、关系、历史做推理
- **自然语言**：对话、谣言、叙事不再靠模板拼接
- **涌现行为**：无人预设的互动模式自然生成
- **记忆与人格**：每个 NPC 有持续演化的个性和记忆

**关键约束**：
- Agnes AI 的模型有速率限制和成本
- 不能每个 NPC 每 tick 都调 LLM（太慢、太贵）
- 必须保留规则系统作为 fallback（性能和可靠性）

---

## 二、6 个 API Key 的分配策略

| Key | 用途 | 模型建议 | 调用频次 |
|-----|------|---------|---------|
| key1 | **NPC 核心决策** — 每日/每季行为选择 | Agnes 1.5 Flash | 1 次/NPC/年 |
| key2 | **对话生成** — NPC 间的自然语言交流 | Agnes 1.5 Flash | 按需（社交事件触发） |
| key3 | **叙事与编年史** — Chronicle 美化、事件叙事 | Agnes 2.0 Flash | 1 次/季（总结回合） |
| key4 | **城镇治理** — 法律、节日、群体决策 | Agnes 1.5 Flash | 1 次/年（城镇会议） |
| key5 | **创新与技术突破** — LLM 驱动的科技树决策 | Agnes 2.0 Flash | 1 次/年（发现回合） |
| key6 | **备用/负载均衡** — 主 Key 限流时的 fallback | 动态选择 | 轮替 |

> 注意：实际使用中 6 个 Key 共享相同的 Rate Limit 池还是独立？需要验证 Agnes AI 的账户策略。如果是独立限流，这 6 个 Key 可以并行调用。

---

## 三、架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                 Town of Peace (TypeScript)            │
│  ┌──────────────────────────────────────────────┐    │
│  │           Simulation Core (现有)              │    │
│  │  WorldEngine · Economy · Seasons · Map        │    │
│  │  RNG-based 子系统 (保留作为 fallback)        │    │
│  └──────────────┬───────────────────────────────┘    │
│                 │                                     │
│  ┌──────────────▼───────────────────────────────┐    │
│  │         LLM Bridge (新增模块)                │    │
│  │  - LLMClient (OpenAI-compatible)             │    │
│  │  - KeyPool (6 Key 轮询/负载均衡)             │    │
│  │  - RateLimiter (调用频次控制)                │    │
│  │  - PromptTemplates (系统提示词模板)          │    │
│  │  - ResponseParser (LLM 输出→结构化数据)     │    │
│  └──────────────┬───────────────────────────────┘    │
│                 │                                     │
│  ┌──────────────▼───────────────────────────────┐    │
│  │         LLM Agent 子系统 (新增)              │    │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────────┐   │    │
│  │  │Decision │ │Dialogue  │ │Narrative     │   │    │
│  │  │Engine   │ │Engine    │ │Engine        │   │    │
│  │  └─────────┘ └──────────┘ └─────────────┘   │    │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────────┐   │    │
│  │  │Governance│ │Innovation│ │Image/Art    │   │    │
│  │  │Engine   │ │Engine    │ │Generator    │   │    │
│  │  └─────────┘ └──────────┘ └─────────────┘   │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────┘
                           │ HTTPS (OpenAI-compatible)
                           ▼
               ┌─────────────────────┐
               │  Agnes AI Gateway    │
               │  apihub.agnes-ai.com │
               └─────────────────────┘
```

### 3.2 LLM Bridge 模块设计

**LLMClient** — 核心 API 调用层
- OpenAI 兼容接口（chat/completions）
- 支持流式和非流式
- 超时/重试/错误处理

**KeyPool** — Key 管理
```typescript
interface KeyPoolEntry {
  key: string;       // api key 值
  usage: number;     // 今日调用次数
  lastError?: Date;  // 上次错误时间
  cooldownUntil?: Date; // 冷却到期时间
}
```
- 轮询（Round-Robin）分配
- 错误后自动冷却（ExpBackoff）
- 使用量统计

**RateLimiter** — 调用节流
- 每秒/每分钟最大调用数
- 按优先级队列（决策 > 对话 > 叙事）
- 队列满时自动降级到 RNG fallback

**PromptTemplates** — 提示词模板
- 每种 LLM 场景有独立模板
- 模板从 WorldState 提取上下文
- 输出格式化为 JSON（可解析的结构化输出）

---

## 四、各子系统的 LLM 改造方案

### 4.1 NPC 决策引擎（key1）

**现状**：NPC 行为由 `index.ts` 中的 `populationPhase()` 控制，用 RNG 决定工作、婚姻、生育等。

**改造**：

在每个 tick 中，为每个活跃的成年 NPC 调用一次 LLM，传入：
```
系统提示：你是桃源镇的居民{name}，{age}岁，{title}。
你的属性：力量{strength}，智力{intelligence}，魅力{charisma}...
你的技能：{skills}
你的关系：{relationships}
你的健康状况：{conditions}
当前季节：{season}，天气：{weather}
你的食物储备：{food}
你的财富：{wealth}文铜钱

请决定你今天做什么？格式：
{
  "action": "work|rest|socialize|trade|study|court|travel|craft",
  "target": "目标人或地点",
  "reason": "一句话推理"
}
```

**LLM 不调用时的 fallback**：使用现有的 RNG 规则决策。

**性能策略**：
- 成年 NPC 每 4 tick（1年）才调用一次 LLM
- 未成年人、老人调用频率减半
- 婴儿/幼儿不调用 LLM

### 4.2 对话引擎（key2）

**现状**：DialogueGenerator 用模板拼接对话，RumorMill 随机生成谣言。

**改造**：

当两个 NPC 有社交交互时（关系值变化、同处一地、家庭关系），触发 LLM 对话生成：

```
系统提示：生成一段桃源镇居民{name1}和{name2}之间的对话。
背景：{name1}是{role1}，{name2}是{role2}。
最近发生的事：{recentEvents}
{name1}对{name2}的好感度：{relationship}
场景：在{building}...

生成一句{name1}说的话（中文）：
```

**保存对话到 NPC Memory**，用于后续决策和关系变化。

**谣言系统改造**：谣言不再随机生成，而是从真实对话中提取"可传播的信息"。

### 4.3 叙事与编年史（key3）

**现状**：ChronicleGenerator 用模板生成编年史条目。

**改造**：

每季末调用 LLM 生成叙事总结：

```
系统提示：你是桃源镇的史官，记录这一季发生的事。
重要事件：{events}
人物动态：{agentChanges}
经济状况：{economy}

用一段优美的中文写一段编年史（100字以内）：
```

**生成内容**：
- 更生动的语言描述
- 识别重要趋势（而非罗列事件）
- 捕捉"人群情绪"

### 4.4 城镇治理（key4）

**现状**：法律、节日、群体决策靠预设配置。

**改造**：

每年城镇会议（或重大事件时）调用 LLM 进行治理决策：

```
系统提示：你是桃源镇的议事会。
当前问题：{issue}
可选方案：{options}
居民意见：{opinions}
资源约束：{resources}

请决定：{decision}
```

**场景**：
- 制定/修改法律
- 组织节日活动（选择类型、日期、预算）
- 分配公共资源
- 处理纠纷

### 4.5 创新引擎（key5）

**现状**：InnovationTree + TechChecker 按预设路径推进科技。

**改造**：

每年 LLM 根据当前世界状态推断可能的创新方向：

```
系统提示：桃源镇当前拥有以下科技：{techs}
当前问题：{problems}
可用资源：{resources}

你认为居民最可能在哪方面取得突破？请输出一个 JSON：
{
  "innovation": "名称",
  "description": "描述",
  "prerequisites": ["前置科技"],
  "benefit": "带来的好处"
}
```

**混合模式**：LLM 提议新科技方向，但科技树定义的实际效果跑在规则系统上。

### 4.6 图像/视觉生成（key6）

**备选用途**：Agnes AI 也支持图像生成模型（Agnes Image 2.0 Flash）。

**应用场景**：
- 生成 NPC 肖像（按性格/职业生成）
- 生成城镇俯瞰图
- 生成关键事件插图（编年史配图）

---

## 五、NPC 记忆系统（贯穿所有子系统）

每个 NPC 需要一个**持久化记忆**，类似于人类的 episodic memory：

```typescript
interface NPCMemory {
  agentId: string;
  personality: string;        // LLM 生成的人格描述
  recentActions: ActionLog[]; // 最近 10 次行为（滑动窗口）
  relationships: Record<string, number>; // 已有（但 LLM 可修正）
  beliefs: string[];          // 信念（如"张三是个好人"）
  secrets: string[];          // 知道的秘密
  lastLLMDecision: number;    // 上次 LLM 调用的年
}
```

记忆帮助 NPC 做出**上下文一致**的决策，防止每次 LLM 调用都"失忆"。

---

## 六、调用频率与 Token 预算

假设小镇人口 50-70 人，模拟速度 1 年 = 4 tick：

| 功能 | 每次调用 | 年调用次数 | 年 Token 估算 |
|------|---------|-----------|-------------|
| NPC 决策 | 35 人/年 × 1 次 | 35 | ~210K (6K/次) |
| 对话 | 20 次社交/年 | 20 | ~160K (8K/次) |
| 编年史 | 4 季/年 | 4 | ~20K (5K/次) |
| 城镇治理 | 1 年 | 1 | ~10K |
| 创新 | 1 年 | 1 | ~8K |
| **总计** | | **61 次/年** | **~408K tokens/年** |

> 如果 Agnes 1.5 Flash 的定价合理（类似其他 Flash 模型），这个量级是完全可以承受的。

---

## 七、实现路线图

### Phase 1: 基础设施（1-2天）
1. 创建 `src/llm/` 目录，包含：
   - `LLMClient.ts` — OpenAI-compatible HTTP 客户端
   - `KeyPool.ts` — 6 Key 管理
   - `RateLimiter.ts` — 调用节流
   - `PromptBuilder.ts` — 提示词上下文组装
   - `ResponseParser.ts` — JSON 输出解析
2. 配置 Agnes AI Base URL + Key 到环境变量或配置文件
3. 单元测试：LLMClient 连接测试

### Phase 2: NPC 决策（2-3天）
1. 实现 `DecisionEngine.ts` — NPC 行为选择的 LLM 调用
2. 设计 NPC 提示词模板（含上下文组装）
3. 集成到 Simulation Tick 中（每 tick 触发 LLM 决策）
4. Fallback 机制：LLM 失败时使用 RNG 决策
5. 测试：对比 LLM 模式 vs RNG 模式的行为多样性

### Phase 3: 对话与记忆（2-3天）
1. 实现 `DialogueEngine.ts`
2. 实现 `NPCMemory.ts` — 持久化记忆
3. NPC 对话影响关系和记忆
4. 谣言系统对接 LLM 生成的真实对话

### Phase 4: 叙事与事件（1-2天）
1. 改造 `ChronicleGenerator` 接入 LLM
2. LLM 驱动的编年史生成
3. 事件叙事增强（不仅仅是数据罗列）

### Phase 5: 治理与创新（1-2天）
1. 城镇会议 LLM 模块
2. LLM 驱动的创新提议
3. 法律/节日 LLM 生成

### Phase 6: 调优与平衡（持续）
1. Prompt 优化（更稳定、更少幻觉）
2. 调用频率优化（哪些场景不需要 LLM）
3. Token 预算监控
4. 人格一致性保持
5. 速率限制处理（重试、降级）

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| LLM 输出不稳定（格式错误） | 高 | 中 | JSON Schema + 重试 + type-safe parser |
| API 速率限制 | 中 | 高 | KeyPool + 排队 + 降级到 RNG |
| Token 成本超预期 | 低 | 中 | 监控 + 调整调用频率 |
| NPC 行为太随机/不一致 | 中 | 中 | 记忆系统 + 人格约束 + 更精准的 prompt |
| LLM 响应太慢拖慢模拟 | 中 | 高 | 异步调用 + 超时 + 批量处理 |
| 模型中文能力不足 | 低 | 中 | 测试 Agnes 1.5 Flash 中文表现，备选 DeepSeek |

---

## 九、验证标准

1. **多样性**：同一场景下 LLM 驱动的 NPC 行为比 RNG 更多样
2. **合理性**：NPC 行为与其身份、状态、记忆一致
3. **涌现性**：出现无人预设的社会互动模式
4. **一致性**：同一 NPC 在不同时间的决策前后连贯
5. **性能**：模拟 100 年的速度不低于当前 RNG 模式的 50%
6. **成本**：年 Token 消耗在预算范围内

---

## 十、下一步行动

1. ✅ 你已有 6 个 Agnes AI API Key
2. ☐ 测试 Agnes AI 的 API 可用性（Base URL + Key 连通性）
3. ☐ 确认 6 个 Key 是否独立限流（影响并行策略）
4. ☐ 决定 Phase 1 的启动时间
5. ☐ 确认是否需要在 Hermes Agent 上配置 Agnes AI 作为 provider（用于你平时的聊天/任务）

> 这个方案的设计原则是**渐进增强**——现有规则系统作为地基，LLM 作为智能层逐步叠加。不是重写，而是进化。
