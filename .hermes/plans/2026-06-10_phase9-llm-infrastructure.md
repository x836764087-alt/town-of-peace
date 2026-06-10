# Phase 9：LLM 基础设施 + 居民档案系统

> **前置依赖：** Phase 0-8 ✅（确定性模拟系统已完善，267 tests 通过）
>
> **设计文档：** `.hermes/plans/2026-06-09_phase9-llm-full-integration.md`（1326 行完整设计）
>
> **核心理念变更：** 从"本地模型点缀 2-3 个核心角色"转向"LLM 驱动每一位居民"。

## 架构概述

```
模拟主循环 → BiographySystem → LLMClient → Agnes AI / OpenRouter
                                  ↓
                            fallback (LLM 不可用时自动降级)
```

- **LLMClient**：OpenAI 兼容 HTTP 客户端，支持速率限制、超时、重试、错误降级
- **Prompts**：所有 prompt 模板集中管理，每个模板都有对应的 fallback 输出
- **BiographySystem**：管理居民档案（人格、时间线、讣告），是后续 Phase 10-12 的基础

## 任务分解

---

### Task 1：新增居民档案类型定义

**文件：** 修改 `src/core/types.ts`
**时间：** ~5 min
**测试：** 编译通过 + 类型检查

**内容：**
1. 在 `Memory` 接口之后添加 4 个新接口：
   - `AgentPersona` — 人格特征（traits, values, motto, narrative_arc, lastUpdated）
   - `LifeEvent` — 人生大事（year, type, description, relatedAgentIds, importance）
   - `Obituary` — 讣告（year, age, summary, legacy, majorEventCount）
   - `AgentBiography` — 居民档案聚合（persona, timeline, obituary, reputation, lastBiographyUpdate）
2. 在 `AgentState` 中添加 `biography?: AgentBiography`

**验证：** `npx tsc --noEmit` 零错误

---

### Task 2：创建环境配置模块（含多 Key 支持）

**文件：** 新建 `src/config/env.ts`
**时间：** ~5 min

**内容：**
- 从环境变量读取 LLM 配置（API URL、API Key 列表、Model name）
- 支持多个 API Key（`LLM_API_KEY_1`, `LLM_API_KEY_2`, ...）
- 提供合理默认值（OpenAI 兼容格式）

```typescript
export const ENV = {
  llm: {
    baseUrl: process.env.LLM_API_BASE ?? 'https://api.agnesai.com/v1',
    apiKeys: [
      process.env.LLM_API_KEY_1,
      process.env.LLM_API_KEY_2,
      process.env.LLM_API_KEY_3,
    ].filter((k): k is string => !!k),
    model: process.env.LLM_MODEL ?? 'agnes-2.0-flash',
    rpm: parseInt(process.env.LLM_RPM ?? '60', 10),
  },
};
```

**验证：** 编译通过，导入不报错

---

### Task 3：创建 LLM Client（含多 Key 故障转移）

**文件：** 新建 `src/llm/llm-client.ts`
**时间：** ~15 min
**测试：** 新增单元测试（Mock HTTP）

**内容：**
- `LLMClient` 类，封装 OpenAI 兼容 `/chat/completions` API
- **多 Key 轮询**：`apiKeys` 数组，按顺序使用；当前 key 失败（超时/429/5xx）时自动切换到下一个
- **故障转移机制**：失败 key 冷却 30s，冷却期不再使用
- 速率限制（基于 RPM，可配置）
- 超时控制（10s 默认）
- 错误降级：所有 key 均失败时返回空 content（不抛异常）
- 单例导出 `llmClient`

**验证：** `npm test` 全通过（新增 5-7 个测试）

---

### Task 4：创建 Prompt 模板

**文件：** 新建 `src/llm/prompts.ts`
**时间：** ~10 min
**测试：** 纯函数测试（不需要 mock LLM）

**内容：**
- `personaNewbornPrompt(surname, gender, birthYear, fatherName?, motherName?)` → 新生儿人格 prompt
- `obituaryPrompt(name, birthYear, deathYear, age, timeline)` → 讣告 prompt
- `fallbackNewbornPersona()` → LLM 不可用时返回默认人格
- `fallbackObituary(name)` → LLM 不可用时返回默认讣告

所有 prompt 要求结构化 JSON 输出。

**验证：** `npm test` 全通过（新增 2-3 个测试）

---

### Task 5：创建 BiographySystem

**文件：** 新建 `src/llm/biography-system.ts`
**时间：** ~20 min
**测试：** 新增单元测试（Mock LLMClient）

**内容：**
- `BiographySystem` 类，接收 `WorldState` 构造
- `initNewbornBiography(agent)` → LLM 生成初始人格，写入 timeline 第一条（birth）
- `processLifeEvents(agent, events)` → 从本季事件中匹配该 agent 的 LifeEvent，追加 timeline
- `generateObituary(agent)` → 死亡时 LLM 生成讣告
- `getBiographySummary(agentId)` → 生成生平摘要（供后续 Phase LLM 上下文注入）
- 所有 LLM 调用失败时自动 fallback

**验证：** `npm test` 全通过（新增 5-7 个测试）

---

### Task 6：接入主循环

**文件：** 修改 `src/index.ts` + `src/agents/agent-factory.ts`
**时间：** ~10 min

**内容：**
1. `src/index.ts`：
   - 在 `main()` 中 `const bioSystem = new BiographySystem(engine.getState())`
   - 在新生儿创建后调用 `bioSystem.initNewbornBiography(agent)`
   - 每季结束时调用 `bioSystem.processLifeEvents(agent, allEvents)` 为所有 alive agent 处理
   - agent 死亡时调用 `bioSystem.generateObituary(agent)`
2. `src/agents/agent-factory.ts`：
   - 所有 `memories: []` 处添加 `biography: undefined`（保持迁移兼容）

**验证：** 编译 + `npm test` 全通过

---

### Task 7：集成测试 + 模拟验证

**时间：** ~10 min

**内容：**
1. 新增集成测试：`tests/unit/phase9-integration.test.ts`
   - 验证 newborn agent 有 `biography.persona`（即使 fallback）
   - 验证 death agent 有 `obituary`
   - 验证 timeline 随事件增长
2. 模拟运行验证：`npx tsx src/index.ts --new --seed 42 --years 20 --summary`
   - 不崩溃
   - 编年史输出正常
3. **双种子验证：** seed 42 + seed 9999 各 20 年

**验证：** `npm test` 267 + 新增 ≈ 285 全通过

---

## 依赖关系

```
Task 1 (types) ──→ Task 5 (biography-system) ──→ Task 6 (integration)
                                     ↑
Task 2 (env) ───→ Task 3 (llm-client) ─┘
                                     ↓
                              Task 4 (prompts)
                                    
Task 7 (tests + validation) ──→ 全部完成后做
```

**并行策略：** Task 1、2 可并行 → Task 3、4 可并行（依赖 Task 2）→ Task 5（依赖 1、3、4）→ Task 6（依赖 5）→ Task 7

---

## 验证标准

| 检查项 | 标准 |
|--------|------|
| TypeScript 编译 | `npx tsc --noEmit` 零错误 |
| 单元测试 | `npm test` 全部通过，新增 ≥15 个 |
| LLM 不可用时 | 系统自动 fallback，不崩溃 |
| 模拟 20 年 | seed 42 + seed 9999 均不崩溃 |
| 每位 agent | alive 时均有 `biography.persona` 非空 |
| 死亡 agent | 有 `biography.obituary` |

---

## 后续阶段预览（不在此轮实现）

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **Phase 10** | 人格、记忆、决策系统 | 需 Phase 9 |
| **Phase 11** | 叙事、对话、事件种子 | 需 Phase 10 |
| **Phase 12** | 自然世界 + 出生/死亡闭环 | 需 Phase 11 |

---

## 开工检查

- [ ] `npx tsc --noEmit` 当前零错误 → 基线确认
- [ ] `npm test` 当前 267 全通过 → 基线确认
- [ ] Git status clean → 基线确认
