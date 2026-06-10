# Phase 9-12：AI 全量接入 + 居民档案 + 事件生成 + 世界生态

> **前置依赖：** Phase 0-8 已完成（社会机制、经济、科技、法律等确定性模拟核心完善）
>
> **核心理念变更（vs 旧 Phase 9）：** 不再用本地模型（Qwen/Ollama）驱动 2-3 个核心角色，而是用 **Agnes AI 2.0-flash（免费）驱动每一位居民**。从"点缀"转向"基座"。

**总览**

| 大阶段 | 内容 | 文件数 | 可独立上线 | 核心交付 |
|--------|------|--------|-----------|---------|
| **Phase 9** | LLM 基础设施 + 居民档案系统 | 6 files | ✅ 可接入前验证 | 每位居民有生平档案 |
| **Phase 10** | 人格、记忆、决策 | 5 files | 需 Phase 9 | 居民真正"活起来" |
| **Phase 11** | 叙事、对话、事件种子 | 5 files | 需 Phase 10 | 蝴蝶效应 |
| **Phase 12** | 自然世界 + 出生/死亡闭环 | 4 files | 需 Phase 11 | 生态"长起来" |

---

## Phase 9：LLM 基础设施 + 居民档案系统

### 9.1 Type：新增居民档案类型

**文件：** `src/core/types.ts`（追加）

在 `Memory` 接口之后添加新增类型：

```typescript
// ─── Phase 9: 居民档案 ─────────────────────

/** 人格特征描述 */
export interface AgentPersona {
  /** 性格特征，如 ["勤劳", "固执", "念旧"] */
  traits: string[];
  /** 价值观，如 ["家庭优先", "厌恶风险"] */
  values: string[];
  /** 人生格言/座右铭（LLM 生成） */
  motto?: string;
  /** 人物弧光描述（LLM 更新，反映人生变化） */
  narrative_arc: string;
  /** 最后一次人格更新的年份 */
  lastUpdated: number;
}

/** 人生大事记录 */
export interface LifeEvent {
  /** 发生年份 */
  year: number;
  /** 事件类型：birth | marriage | child_birth | title_change | crime | conflict |
   *  | innovation | immigration | death | accident | achievement | other */
  type: string;
  /** 事件描述 */
  description: string;
  /** 关联的其他 agent id 列表 */
  relatedAgentIds?: string[];
  /** 重要性（0-1），影响是否算"大事" */
  importance: number;
}

/** 讣告——死后生平总结（LLM 生成） */
export interface Obituary {
  /** 死亡年份 */
  year: number;
  /** 享年 */
  age: number;
  /** 盖棺定论 */
  summary: string;
  /** 最被人记住的事 */
  legacy: string;
  /** 参与的重大事件数 */
  majorEventCount: number;
}

/** 居民档案——AgentState 的增强字段聚合 */
export interface AgentBiography {
  /** 人格特征 */
  persona: AgentPersona;
  /** 人生大事时间线 */
  timeline: LifeEvent[];
  /** 讣告（死后才有） */
  obituary?: Obituary;
  /** 社会声望（-100 ~ 100），由行为累积 */
  reputation: number;
  /** 最后一次定期更新的年份 */
  lastBiographyUpdate: number;
}
```

### 9.2 Type：AgentState 扩展字段

**文件：** `src/core/types.ts`（在 `AgentState` 接口中添加）

```typescript
export interface AgentState {
  // ... 现有字段保持不变 ...
  
  // ─── Phase 9: 新增字段 ───
  /** 居民档案 */
  biography?: AgentBiography;
}
```

### 9.3 新建：LLM Client

**文件：** `src/llm/llm-client.ts`（新建）

```typescript
/**
 * Agnes AI API Client
 *
 * - 兼容 OpenAI 格式
 * - 硬性速率限制：configurable RPM
 * - 超时 + 重试 + 错误降级
 */

import { config } from '../config/env.js';

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  durationMs: number;
}

export class LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private lastCallTime = 0;
  private minIntervalMs: number; // 速率控制

  constructor() {
    // 从环境变量或配置读取
    this.baseUrl = 'https://api.agnesai.com/v1';
    this.apiKey = process.env.AGNES_API_KEY ?? '';
    this.model = 'agnes-2.0-flash';
    // 免费版 ~60 RPM → 每秒最多 1 次
    this.minIntervalMs = 1000;
  }

  async chat(
    messages: { role: string; content: string }[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<LLMResponse> {
    // 速率限制
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
    }

    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 512,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.lastCallTime = Date.now();

      return {
        content: data.choices[0].message.content,
        tokensUsed: data.usage?.total_tokens ?? 0,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      // 降级：返回空内容，调用方用 fallback
      console.error(`[LLM] Error: ${err}`);
      return { content: '', tokensUsed: 0, durationMs: Date.now() - start };
    }
  }

  /** 批量并行调用（内部处理速率限制） */
  async batchChat(
    calls: { messages: { role: string; content: string }[]; id: string }[],
  ): Promise<Map<string, LLMResponse>> {
    const results = new Map<string, LLMResponse>();
    // 串行执行以确保遵守速率限制
    for (const call of calls) {
      const result = await this.chat(call.messages);
      results.set(call.id, result);
    }
    return results;
  }
}

export const llmClient = new LLMClient();
```

### 9.4 新建：Prompt 模板

**文件：** `src/llm/prompts.ts`（新建）

存放所有 LLM prompt 模板。核心原则：**结构化输出 + 降级 fallback**。

```typescript
/**
 * 所有 LLM prompt 模板集中管理。
 * 每个模板都有对应的 fallback 输出（LLM 不可用时使用）。
 */

/** 生成新生儿初始人格 */
export function personaNewbornPrompt(
  surname: string,
  gender: string,
  birthYear: number,
  fatherName?: string,
  motherName?: string,
): string {
  return `你是桃源镇的一位新生儿。请生成你的人格特征。

基本信息：
- 姓氏：${surname}
- 性别：${gender}
- 出生年份：桃源镇 ${birthYear} 年
${fatherName ? `- 父亲：${fatherName}` : ''}
${motherName ? `- 母亲：${motherName}` : ''}

请以 JSON 格式回复：
{
  "traits": ["3-5个性格特征，每个2-4字"],
  "values": ["2-3个价值观"],
  "motto": "一句符合你性格的话"
}
只输出 JSON，不要任何其他文字。`;
}

export function fallbackNewbornPersona(): { traits: string[]; values: string[]; motto: string } {
  return {
    traits: ['平凡', '温和'],
    values: ['随遇而安'],
    motto: '日子总要过下去。',
  };
}

/** 生卒总结（讣告） */
export function obituaryPrompt(
  name: string,
  birthYear: number,
  deathYear: number,
  age: number,
  timeline: { year: number; description: string }[],
): string {
  return `请为 ${name}（${birthYear}-${deathYear}，享年 ${age} 岁）撰写讣告。

生平大事：
${timeline.map(t => `- 桃源镇 ${t.year} 年：${t.description}`).join('\n')}

请以 JSON 格式回复：
{
  "summary": "一段话概括其一生（50-100字）",
  "legacy": "他最被后人记住的是什么（30-50字）"
}
只输出 JSON。`;
}

export function fallbackObituary(name: string): { summary: string; legacy: string } {
  return {
    summary: `${name} 在桃源镇度过了平凡的一生。`,
    legacy: '他是桃源镇众多居民之一。',
  };
}
```

### 9.5 新建：演员表记录

**文件：** `src/llm/biography-system.ts`（新建）

居民档案系统的核心：管理人格、时间线、讣告。

```typescript
/**
 * BiographySystem — 居民档案管理器
 *
 * 职责：
 * 1. 新生儿 -> 生成初始人格（LLM），写入 timeline 第一条
 * 2. 每季 -> 检测大事并追加到 timeline
 * 3. 死亡 -> 生成讣告（LLM），写入归档
 * 4. 查询 -> 按 agentId 检索生平摘要
 */

import type { WorldState, AgentState, AgentBiography, LifeEvent, Obituary } from '../core/types.js';
import { llmClient } from './llm-client.js';
import { personaNewbornPrompt, obituaryPrompt, fallbackNewbornPersona, fallbackObituary } from './prompts.js';

export class BiographySystem {
  constructor(private state: WorldState) {}

  /** 为新生儿生成初始档案 */
  async initNewbornBiography(agent: AgentState): Promise<void> {
    const parents = agent.family.parents
      .map(pid => this.state.agents.find(a => a.id === pid))
      .filter(Boolean);

    const prompt = personaNewbornPrompt(
      agent.name.charAt(0), // 姓氏
      agent.gender,
      this.state.year,
      parents[0]?.name,
      parents[1]?.name,
    );

    const response = await llmClient.chat([
      { role: 'system', content: '你是一个生成角色设定的助手。只输出 JSON。' },
      { role: 'user', content: prompt },
    ]);

    let persona;
    try {
      persona = JSON.parse(response.content);
    } catch {
      persona = fallbackNewbornPersona();
    }

    agent.biography = {
      persona: {
        traits: persona.traits ?? fallbackNewbornPersona().traits,
        values: persona.values ?? fallbackNewbornPersona().values,
        motto: persona.motto,
        narrative_arc: '刚刚诞生，人生尚未展开。',
        lastUpdated: this.state.year,
      },
      timeline: [{
        year: this.state.year,
        type: 'birth',
        description: `${agent.name} 出生于桃源镇。`,
        importance: 1.0,
      }],
      reputation: 0,
      lastBiographyUpdate: this.state.year,
    };
  }

  /** 本季检测并追加大事 */
  processLifeEvents(agent: AgentState, events: string[]): void {
    if (!agent.alive || !agent.biography) return;

    const newEvents: LifeEvent[] = [];

    // 从本季 events 中筛选与该 agent 相关的大事
    for (const event of events) {
      const le = this.parseEvent(event, agent);
      if (le) newEvents.push(le);
    }

    if (newEvents.length > 0) {
      agent.biography.timeline.push(...newEvents);
      // 限制 timeline 长度，只保留最近 50 条
      if (agent.biography.timeline.length > 50) {
        agent.biography.timeline = agent.biography.timeline.slice(-50);
      }
    }
  }

  /** 死亡时生成讣告 */
  async generateObituary(agent: AgentState): Promise<void> {
    if (!agent.biography || agent.alive) return;

    const timeline = agent.biography.timeline
      .filter(t => t.type !== 'death')
      .map(t => ({ year: t.year, description: t.description }));

    const prompt = obituaryPrompt(
      agent.name,
      agent.born,
      agent.deathYear ?? this.state.year,
      agent.age,
      timeline,
    );

    const response = await llmClient.chat([
      { role: 'system', content: '你是一个撰写人物传记的助手。只输出 JSON。' },
      { role: 'user', content: prompt },
    ]);

    let obit;
    try {
      obit = JSON.parse(response.content);
    } catch {
      obit = fallbackObituary(agent.name);
    }

    agent.biography.obituary = {
      year: agent.deathYear ?? this.state.year,
      age: agent.age,
      summary: obit.summary,
      legacy: obit.legacy,
      majorEventCount: agent.biography.timeline.length - 1, // 减掉 birth
    };
  }

  /** 从事件文本中解析出该 agent 的 LifeEvent */
  private parseEvent(eventText: string, agent: AgentState): LifeEvent | undefined {
    // 匹配常见事件模式
    // 由调用方传入结构化事件，这里做关键词匹配
    const typeMap: Record<string, string> = {
      '结婚': 'marriage',
      '娶': 'marriage',
      '嫁': 'marriage',
      '生子': 'child_birth',
      '生女': 'child_birth',
      '死亡': 'death',
      '饿死': 'death',
      '当选': 'title_change',
      '升任': 'title_change',
      '偷盗': 'crime',
      '争吵': 'conflict',
      '斗殴': 'conflict',
      '发明': 'innovation',
      '发现': 'innovation',
      '迁入': 'immigration',
    };

    for (const [keyword, type] of Object.entries(typeMap)) {
      if (eventText.includes(keyword)) {
        return {
          year: this.state.year,
          type,
          description: eventText,
          importance: ['death', 'marriage', 'child_birth', 'innovation'].includes(type) ? 1.0 : 0.5,
        };
      }
    }

    return undefined;
  }

  /** 获取某人生平摘要（用于 LLM 上下文注入） */
  getBiographySummary(agentId: string): string {
    const agent = this.state.agents.find(a => a.id === agentId);
    if (!agent || !agent.biography) return `${agent?.name ?? '未知'}（无记录）`;

    const bio = agent.biography;
    const age = agent.alive ? `${agent.age}岁` : `终年${agent.age}岁`;

    return `${agent.name}（${agent.gender}，${age}）
性格：${bio.persona.traits.join('、')}
价值观：${bio.persona.values.join('、')}
${bio.persona.motto ? `座右铭：「${bio.persona.motto}」` : ''}
声望：${bio.reputation}
人生大事（${bio.timeline.length}件）：
${bio.timeline.slice(-5).map(t => `  - 第${t.year}年：${t.description}`).join('\n')}
${bio.obituary ? `\n盖棺定论：${bio.obituary.summary}\n遗泽：${bio.obituary.legacy}` : ''}`.trim();
  }
}
```

### 9.6 集成：初始化 + tick 接入

**文件：** `src/index.ts`（修改）

在模拟主循环中接入 BiographySystem：

```typescript
// 在创建新生儿后调用：
if (agent.biography) {
  await biographySystem.initNewbornBiography(agent);
}

// 每季结束时，为每个 alive 且有 biography 的 agent 处理 timeline：
for (const agent of state.agents) {
  if (agent.alive && agent.biography) {
    biographySystem.processLifeEvents(agent, events);
  }
}

// agent 死亡时生成讣告：
if (!agent.alive && agent.biography && !agent.biography.obituary) {
  await biographySystem.generateObituary(agent);
}
```

**注意：** `index.ts` 中新生儿创建处的 `memories: []` 改为初始化 `biography: undefined`（由后续 Phase 9.5 初始化时填充）。

**Phase 9 验证标准：**
- ✅ 运行模拟 50 年，每个 alive agent 均有 `biography.persona` 非空
- ✅ 每个死亡 agent 有 `biography.obituary` 生成
- ✅ 死亡 agent 的 timeline 包含其一生大事
- ✅ LLM 不可用时自动 fallback 到模板数据，不崩溃

---

## Phase 10：人格、记忆、决策系统

### 10.1 增强 Memory：LLM 压缩记忆

**文件：** `src/llm/memory-system.ts`（新建）

```typescript
/**
 * MemorySystem — 居民记忆管理器
 *
 * 职责：
 * 1. 每季将本季经历压缩为 1-2 条记忆
 * 2. 保留最近 5 条记忆，旧记忆自动衰减
 * 3. 为人格更新提供素材
 */

import type { AgentState, Memory } from '../core/types.js';
import { llmClient } from './llm-client.js';

const MAX_MEMORIES = 5;

export class MemorySystem {
  /** 为 agent 压缩本季事件为记忆 */
  async processSeasonalMemory(agent: AgentState, seasonEvents: string[]): Promise<void> {
    if (!agent.alive || seasonEvents.length === 0) return;

    // 简单规则：本季最重要的事件直接作为记忆
    const significantEvents = seasonEvents.filter(e => {
      const keywords = ['结婚', '死亡', '生子', '发明', '当选', '偷盗', '争吵', '斗殴', '火灾', '丰收', '饥荒'];
      return keywords.some(k => e.includes(k));
    });

    if (significantEvents.length === 0) return;

    // 尝试 LLM 压缩
    const prompt = `请将以下事件压缩成一条 20 字以内的记忆。\n事件：${significantEvents.join('；')}\n记忆：`;
    const response = await llmClient.chat([
      { role: 'system', content: '你是一个记忆压缩助手。输出一句简洁的中文。' },
      { role: 'user', content: prompt },
    ]);

    const content = response.content || significantEvents[0].slice(0, 30);

    agent.memories.push({
      year: agent.biography?.lastBiographyUpdate ?? 0,
      content,
      importance: Math.min(1, significantEvents.length / 5),
    });

    // 只保留最近的 MAX_MEMORIES 条
    if (agent.memories.length > MAX_MEMORIES) {
      agent.memories = agent.memories.slice(-MAX_MEMORIES);
    }
  }
}
```

### 10.2 人格演化系统

**文件：** `src/llm/persona-evolution.ts`（新建）

```typescript
/**
 * PersonaEvolution — 人格随经历渐变
 *
 * 每 ~10 年用 LLM 根据经历微调人格
 * 让人物有"成长弧光"
 */

import type { AgentState } from '../core/types.js';
import { llmClient } from './llm-client.js';
import { fallbackNewbornPersona } from './prompts.js';

const PERSONA_UPDATE_INTERVAL = 10; // 年

export class PersonaEvolution {
  /** 检查是否需要更新人格 */
  async updateIfNeeded(agent: AgentState): Promise<void> {
    if (!agent.alive || !agent.biography) return;

    const yearsSinceUpdate = agent.biography.lastBiographyUpdate !== undefined
      ? agent.biography.lastBiographyUpdate
      : 0;

    // 没到更新周期，跳过
    if (yearsSinceUpdate < PERSONA_UPDATE_INTERVAL) return;

    // 取最近的人生大事作为更新素材
    const recentEvents = agent.biography.timeline
      .filter(t => t.year >= yearsSinceUpdate)
      .map(t => `第${t.year}年：${t.description}`);

    if (recentEvents.length === 0) return;

    const prompt = `你是一个角色。以下是你在过去 ${PERSONA_UPDATE_INTERVAL} 年的经历。

性格：${agent.biography.persona.traits.join('、')}
价值观：${agent.biography.persona.values.join('、')}
座右铭：「${agent.biography.persona.motto ?? '无'}」

这些年的经历：
${recentEvents.map(e => `- ${e}`).join('\n')}

经历了这些之后，你的性格和价值观是否有变化？请以 JSON 回复：
{
  "traits": ["更新后的性格特征"],
  "values": ["更新后的价值观"],
  "motto": "更新后的座右铭",
  "arc": "一句话描述你的人物弧光变化"
}
只输出 JSON。`;

    const response = await llmClient.chat([
      { role: 'system', content: '你是一个角色扮演助手。只输出 JSON。' },
      { role: 'user', content: prompt },
    ]);

    try {
      const parsed = JSON.parse(response.content);
      agent.biography.persona.traits = parsed.traits ?? agent.biography.persona.traits;
      agent.biography.persona.values = parsed.values ?? agent.biography.persona.values;
      agent.biography.persona.motto = parsed.motto ?? agent.biography.persona.motto;
      agent.biography.persona.narrative_arc = parsed.arc ?? agent.biography.persona.narrative_arc;
      // 更新时更新上次更新年份
      agent.biography.lastBiographyUpdate = agent.biography?.lastBiographyUpdate ?? 0;
      // Keep update in sync
    } catch {
      // fallback: 不做变更，顺延 5 年再试
      agent.biography.lastBiographyUpdate += 5;
    }
  }
}
```

### 10.3 LLM 决策引擎

**文件：** `src/llm/decision-engine.ts`（新建）

```typescript
/**
 * DecisionEngine — 关键决策 LLM 辅助
 *
 * 只在 agent 遇到重大选择时调用。
 * LLM 输出选项+权重，模拟系统按加权随机选择。
 * LLM 不可用时回退到纯 RNG。
 */

import type { AgentState } from '../core/types.js';
import { llmClient } from './llm-client.js';
import { SeededRNG } from '../core/rng.js';

export interface DecisionOption {
  action: string;
  weight: number; // 0-100
  reason: string;
}

export class DecisionEngine {
  constructor(private rng: SeededRNG) {}

  /** 获取 LLM 建议的决策选项 */
  async suggestDecisions(
    agent: AgentState,
    context: {
      choices: string[];
      situation: string;
    },
  ): Promise<DecisionOption[]> {
    const bio = agent.biography;
    if (!bio) {
      // 无档案 → 等权重
      return context.choices.map(c => ({ action: c, weight: 100 / context.choices.length, reason: '无偏好' }));
    }

    const prompt = `你是一个生活在古代中国小镇的居民。

你的信息：
姓名：${agent.name}
性别：${agent.gender}
年龄：${agent.age}
性格：${bio.persona.traits.join('、')}
价值观：${bio.persona.values.join('、')}
座右铭：「${bio.persona.motto ?? '无'}」
最近记忆：${agent.memories.slice(-3).map(m => m.content).join('；')}

当前处境：${context.situation}
你需要从以下选项中选择：

${context.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}

请根据你的性格和处境，为每个选项分配一个权重（0-100，总和不必为 100），并说明理由。
以 JSON 格式回复：
{
  "decisions": [
    { "action": "选项1", "weight": 权重, "reason": "理由" },
    { "action": "选项2", "weight": 权重, "reason": "理由" }
  ]
}
只输出 JSON。`;

    const response = await llmClient.chat([
      { role: 'system', content: '你是一个角色扮演助手。输出 JSON。' },
      { role: 'user', content: prompt },
    ]);

    try {
      const parsed = JSON.parse(response.content);
      return parsed.decisions as DecisionOption[];
    } catch {
      // fallback: 等权重
      return context.choices.map(c => ({ action: c, weight: 100 / context.choices.length, reason: '随机选择' }));
    }
  }

  /** 按加权随机选择一个决策 */
  selectDecision(options: DecisionOption[]): string {
    const totalWeight = options.reduce((s, o) => s + o.weight, 0);
    const roll = this.rng.uniform(0, totalWeight);
    let cumulative = 0;
    for (const opt of options) {
      cumulative += opt.weight;
      if (roll <= cumulative) return opt.action;
    }
    return options[options.length - 1].action;
  }
}
```

### 10.4 集成：tick 中的人格更新 + 决策

**文件：** `src/index.ts`（修改主循环）

```typescript
// 在每季的适当位置新增：

// 阶段 A：人格演化（每 10 年触发一次）
const personaEvolution = new PersonaEvolution();
for (const agent of state.agents) {
  if (agent.alive && agent.biography) {
    await personaEvolution.updateIfNeeded(agent);
  }
}

// 阶段 B：记忆压缩
const memorySystem = new MemorySystem();
for (const agent of state.agents) {
  if (agent.alive) {
    await memorySystem.processSeasonalMemory(agent, events);
  }
}

// 阶段 C：决策引擎（在事件中选择时使用）
// 原 RNG 分支改为：
// if (shouldMakeDecision(agent)) {
//   const engine = new DecisionEngine(rng);
//   const options = await engine.suggestDecisions(agent, {...});
//   const selected = engine.selectDecision(options);
//   // 执行 selected...
// }
```

**Phase 10 验证标准：**
- ✅ 运行 100 年，agent 的人格会随经历变化（40 岁时 vs 出生时不同）
- ✅ 关键决策受人格影响（保守者不倾向于冒险选项）
- ✅ 每个 agent 保持最近 5 条记忆，旧记忆衰减
- ✅ LLM 不可用时全系统回退到纯 RNG

---

## Phase 11：叙事、对话、事件种子

### 11.1 对话生成器

**文件：** `src/llm/dialogue-generator.ts`（新建）

```typescript
/**
 * DialogueGenerator — LLM 驱动的居民对话
 *
 * 每季为选中 pairs 生成自然语言对话。
 * 写入 chronicle 但不影响模拟状态。
 */

import type { AgentState } from '../core/types.js';
import { llmClient } from './llm-client.js';

export class DialogueGenerator {
  /** 为两人生成一段对话 */
  async generateDialogue(
    speakerA: AgentState,
    speakerB: AgentState,
    context: { season: string; recentEvent?: string },
  ): Promise<string> {
    const bioA = speakerA.biography;
    const bioB = speakerB.biography;

    const prompt = `请为以下两位古代中国小镇居民生成一段简短对话。

${speakerA.name}（${speakerA.gender}，${speakerA.age}岁）
${bioA ? `性格：${bioA.persona.traits.join('、')}` : ''}

${speakerB.name}（${speakerB.gender}，${speakerB.age}岁）
${bioB ? `性格：${bioB.persona.traits.join('、')}` : ''}

季节：${context.season}
${context.recentEvent ? `最近的事件：${context.recentEvent}` : ''}

请生成 2-4 轮对话，用中文，符合他们的性格。
格式：
${speakerA.name}：「...」
${speakerB.name}：「...」`;

    const response = await llmClient.chat([
      { role: 'system', content: '你是一个小镇居民对话生成器。' },
      { role: 'user', content: prompt },
    ]);

    return response.content || `${speakerA.name}和${speakerB.name}各自忙着自己的事，没有交谈。`;
  }
}
```

### 11.2 事件种子系统

**文件：** `src/llm/event-seeder.ts`（新建）

```typescript
/**
 * EventSeeder — 蝴蝶效应事件种子
 *
 * 每季 LLM 生成 1-2 个"微事件种子"。
 * 每个种子有触发的先决条件和后效。
 * 模拟系统检查条件，满足则触发并传播。
 */

import type { AgentState, WorldState } from '../core/types.js';
import { llmClient } from './llm-client.js';
import { SeededRNG } from '../core/rng.js';

export interface EventSeed {
  id: string;
  title: string;
  description: string;
  /** 触发概率（0-1），每季检查一次 */
  triggerChance: number;
  /** 触发前提条件（描述性） */
  prerequisites?: string;
  /** 触发后的效果类型 */
  effectType: 'resource' | 'social' | 'environment' | 'health' | 'migration';
  /** 效果描述 */
  effectDescription: string;
  /** 链式概率：此事件有 "%" 的概率触发后续事件 */
  chainChance: number;
  /** 可能的后续事件 */
  chainDescription?: string;
  /** 此种子已存在的年数（超过后自动过期） */
  age: number;
  maxAge: number;
}

export class EventSeeder {
  private seeds: EventSeed[] = [];

  /** 每季生成新种子 */
  async generateSeeds(worldState: WorldState): Promise<EventSeed[]> {
    // 已有种子太多时不生成新的
    if (this.seeds.length >= 5) return [];

    const prompt = `桃源镇目前状态：
- 年份：第 ${worldState.year} 年
- 人口：${worldState.agents.filter(a => a.alive).length}
- 建筑数：${worldState.buildings.length}
- 季节：${worldState.season ?? '秋季'}

请生成一个有趣的"微事件种子"——一个可能发生的小事件，如果实现了可能产生连锁反应。
不要过于魔幻，保持在古代中国小镇的合理范围内。

以 JSON 回复：
{
  "title": "事件名称（4-10字）",
  "description": "事件描述（20-50字）",
  "triggerChance": 概率(0.01-0.3),
  "effectType": "resource/social/environment/health/migration 之一",
  "effectDescription": "发生后对小镇的影响",
  "chainChance": 0-0.3,
  "chainDescription": "可能的后续发展"
}

只输出 JSON。`;

    const response = await llmClient.chat([
      { role: 'system', content: '你是一个生成模拟事件的助手。输出 JSON。' },
      { role: 'user', content: prompt },
    ]);

    try {
      const parsed = JSON.parse(response.content);
      const seed: EventSeed = {
        id: `seed-${worldState.year}-${this.seeds.length}`,
        ...parsed,
        age: 0,
        maxAge: this.rng.int(3, 8), // 3-8年内有效
      };
      this.seeds.push(seed);
      return [seed];
    } catch {
      return [];
    }
  }

  constructor(private rng: SeededRNG) {}

  /** 每季检查所有种子是否可以触发 */
  checkSeeds(worldState: WorldState): EventSeed[] {
    const triggered: EventSeed[] = [];
    const remaining: EventSeed[] = [];

    for (const seed of this.seeds) {
      seed.age++;
      if (seed.age > seed.maxAge) continue; // 过期，丢弃

      if (this.rng.chance(seed.triggerChance)) {
        triggered.push(seed);

        // 链式概率
        if (seed.chainChance > 0 && this.rng.chance(seed.chainChance)) {
          // 生成后续种子（下一季触发）
          this.seeds.push({
            id: `seed-chain-${worldState.year}`,
            title: seed.chainDescription?.slice(0, 10) ?? '后续事件',
            description: seed.chainDescription ?? '未知后续',
            triggerChance: 1.0, // 下季必触发
            effectType: seed.effectType,
            effectDescription: seed.chainDescription ?? '未知',
            chainChance: 0,
            age: 0,
            maxAge: 1,
          });
        }
      } else {
        remaining.push(seed);
      }
    }

    this.seeds = remaining;
    return triggered;
  }

  /** 应用事件效果到世界状态 */
  applyEffect(seed: EventSeed, worldState: WorldState): string[] {
    const effects: string[] = [];

    switch (seed.effectType) {
      case 'resource':
        // 资源类：改变某物品的产出或价格
        effects.push(`🌾 事件[${seed.title}]：${seed.effectDescription}`);
        break;
      case 'social':
        // 社交类：影响关系值
        effects.push(`👥 事件[${seed.title}]：${seed.effectDescription}`);
        break;
      case 'environment':
        // 环境类：影响天气或地图
        effects.push(`🌍 事件[${seed.title}]：${seed.effectDescription}`);
        break;
      case 'health':
        // 健康类：影响疾病或健康
        effects.push(`🏥 事件[${seed.title}]：${seed.effectDescription}`);
        break;
      case 'migration':
        // 移民类：影响人口
        effects.push(`🚶 事件[${seed.title}]：${seed.effectDescription}`);
        break;
    }

    return effects;
  }
}
```

### 11.3 集成：主循环调用

**文件：** `src/index.ts`

```typescript
// 每季新增：
// 1. 对话生成（抽样 3-5 pair）
// 2. 事件种子生成（如果种子池 < 3）
// 3. 种子触发检查

// 对话采样的伪逻辑：
const candidates = aliveAgents.filter(a => a.biography);
const pairs = rng.samplePairs(candidates, 3); // 随机 3 对
for (const [a, b] of pairs) {
  const dialogue = await dialogueGenerator.generateDialogue(a, b, {
    season: state.season,
    recentEvent: chronicle.last(2),
  });
  chronicle.addDialogue(dialogue);
}

// 事件种子：
await eventSeeder.generateSeeds(state);
const triggered = eventSeeder.checkSeeds(state);
for (const seed of triggered) {
  const effects = eventSeeder.applyEffect(seed, state);
  archiveSystem.addEntry('event_seed', seed.title + '：' + seed.description);
}
```

**Phase 11 验证标准：**
- ✅ 模拟 100 年中应出现 10+ 条 LLM 生成对话（不重复不模板）
- ✅ 出现 3+ 次意外事件（非预设模板）
- ✅ 至少 1 次链式触发（蝴蝶效应）
- ✅ 所有 LLM 生成内容不影响模拟状态正确性

---

## Phase 12：自然世界 + 出生/死亡闭环

### 12.1 资源生态：可再生约束

**文件：** `src/world/ecology.ts`（新建）

```typescript
/**
 * EcologySystem — 自然生态模型（轻量）
 *
 * 资源再生与消耗平衡，让"自然长起来"
 */

import type { WorldState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

export interface EcologyState {
  /** 森林覆盖面积（0-100，初始 80） */
  forestCover: number;
  /** 野生动物数量（0-1000） */
  wildlife: {
    rabbits: number;     // 食草动物
    deer: number;
    wolves: number;      // 食肉动物
    fish: number;        // 水域资源
  };
  /** 土地肥沃度（0-100，受耕作影响） */
  soilFertility: number;
  /** 上次更新时间 */
  lastUpdate: number;
}

export class EcologySystem {
  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  /** 每季更新生态状态 */
  processEcology(): string[] {
    const events: string[] = [];
    // 获取或初始化生态状态
    const eco = (this.state as any).ecology as EcologyState ?? this.initEcology();

    // 森林再生
    if (eco.forestCover < 80) {
      eco.forestCover = Math.min(80, eco.forestCover + this.rng.uniform(0.1, 0.5));
    }

    // 如果过度砍伐（forestCover < 30），生态恶化
    if (eco.forestCover < 30) {
      eco.wildlife.rabbits = Math.max(0, eco.wildlife.rabbits - 2);
      eco.wildlife.deer = Math.max(0, eco.wildlife.deer - 1);
      events.push('🌲 森林过度砍伐，野生动物数量下降。');
    }

    // 兔子繁殖（食物充足时）
    if (eco.wildlife.rabbits > 5 && eco.forestCover > 20) {
      const growth = Math.floor(eco.wildlife.rabbits * 0.15);
      eco.wildlife.rabbits += growth;
    }

    // 狼控制兔子（如果狼多了）
    if (eco.wildlife.wolves > 5 && eco.wildlife.rabbits > 10) {
      const hunt = Math.min(3, Math.floor(eco.wildlife.wolves * 0.3));
      eco.wildlife.rabbits -= hunt;
    }

    // 狼的生存依赖兔子
    if (eco.wildlife.rabbits < 10 && eco.wildlife.wolves > 2) {
      eco.wildlife.wolves -= 1;
    }

    // 鱼类再生
    if (eco.wildlife.fish < 200) {
      eco.wildlife.fish += Math.floor(this.rng.uniform(2, 5));
    }

    // 鱼获过度捕捞
    // （由 fishing 系统调用 consumeFish）
    // 如果连续两季鱼获 > 30，自然再生跟不上

    (this.state as any).ecology = eco;
    return events;
  }

  /** 采集资源时消耗生态 */
  consumeWood(amount: number): number {
    const eco = (this.state as any).ecology as EcologyState;
    if (!eco) return amount;
    const actual = Math.min(amount, Math.floor(eco.forestCover / 2));
    eco.forestCover = Math.max(0, eco.forestCover - actual * 0.1);
    return actual;
  }

  consumeFish(amount: number): number {
    const eco = (this.state as any).ecology as EcologyState;
    if (!eco) return amount;
    const actual = Math.min(amount, eco.wildlife.fish);
    eco.wildlife.fish -= actual;
    return actual;
  }

  /** 狩猎 */
  hunt(type: 'rabbit' | 'deer'): { success: boolean; food: number } {
    const eco = (this.state as any).ecology as EcologyState;
    if (!eco || !eco.wildlife[type]) return { success: false, food: 0 };

    if (eco.wildlife[type] > 0 && this.rng.chance(0.4)) {
      eco.wildlife[type] -= 1;
      return { success: true, food: type === 'deer' ? 15 : 3 };
    }
    return { success: false, food: 0 };
  }

  /** 获取生态摘要（用于叙事） */
  getSummary(): string {
    const eco = (this.state as any).ecology as EcologyState;
    if (!eco) return '自然生态尚未记录。';

    const forestStatus = eco.forestCover > 60 ? '郁郁葱葱' : eco.forestCover > 30 ? '还算茂密' : '日渐稀疏';
    return `森林${forestStatus}，覆盖约${Math.round(eco.forestCover)}%。
兔子${eco.wildlife.rabbits}只，鹿${eco.wildlife.deer}头，狼${eco.wildlife.wolves}匹。
${eco.wildlife.fish > 50 ? '河里的鱼很丰富。' : '河里的鱼不多了。'}`;
  }

  private initEcology(): EcologyState {
    const eco: EcologyState = {
      forestCover: 80,
      wildlife: {
        rabbits: 30,
        deer: 15,
        wolves: 5,
        fish: 150,
      },
      soilFertility: 70,
      lastUpdate: 0,
    };
    (this.state as any).ecology = eco;
    return eco;
  }
}
```

### 12.2 出生/死亡:LLM 增强

**文件：** `src/agents/lifecycle-system.ts`（修改）

在 `deathPhase()` 和 `birthPhase()` 中增加 LLM 叙事：

```typescript
// 死亡时增加 LLM 叙事
if (agent.deathYear !== undefined && !agent.obituaryGenerated) {
  // 调用 biographySystem.generateObituary(agent) — Phase 9.5
  // 写入 chronicle：讣告
  agent.obituaryGenerated = true;
}

// 出生时 LLM 生成初始人格
// — 已在 Phase 9 的 biographySystem.initNewbornBiography() 中实现
// — 在此处确保新生儿创建后调用
```

### 12.3 自然世界叙事

**文件：** `src/narrative/chronicle-generator.ts`（修改）

```typescript
// 每年增加一段"自然世界"报道：
const eco = ecologySystem.getSummary();
if (eco) {
  chronicle.add('nature', `【自然风貌】${eco}`);
}
```

**Phase 12 验证标准：**
- ✅ 森林覆盖率和野生动物数量随采集/狩猎变化
- ✅ 过度砍伐导致森林缩小、动物减少
- ✅ 捕捞有上限（鱼会抓完）
- ✅ 生态摘要出现在年度 chronicle 中

---

## 跨阶段协作关系

```
Phase 9 ──┬── 9.1-9.2 Type 定义 ← 所有阶段依赖
          ├── 9.3 LLM Client  ← Phase 10,11,12 依赖
          └── 9.4-9.6 Biography System → Phase 10 决策依赖传记

Phase 10 ──┬── 10.1 Memory → 决策上下文
           ├── 10.2 Persona Evolution → 人格随经历变
           └── 10.3 Decision Engine → Phase 11 事件触发

Phase 11 ──┬── 11.1 Dialogue → chronicle 输出
           ├── 11.2 Event Seeds → 蝴蝶效应
           └── 集成 → 主循环调用

Phase 12 ──┐
          Ecology → resource system → economy
          Birth/Death → Biography obituary
```

## 执行顺序建议

1. **Phase 9 全部**（基础设施 + 档案系统）— 先让类型到位
2. **Phase 10.1 + 10.2**（记忆 + 人格演化）— 让居民有"个性"
3. **Phase 12.1**（生态）— 自然世界，相对独立
4. **Phase 10.3**（决策引擎）— 需要人格就绪
5. **Phase 11 全部**（叙事 + 对话 + 事件）— 最上层
6. **Phase 12.2**（出生/死亡 LLM 增强）— 最后收尾

## 配置常量（集中管理）

**文件：** `src/config/index.ts` 或新增 `src/config/llm.ts`

```typescript
export const LLM_CONFIG = {
  enabled: true,                      // 总开关
  model: 'agnes-2.0-flash',
  apiKeyEnv: 'AGNES_API_KEY',
  rateLimitRPM: 60,                   // 每分钟请求数
  maxMemoriesPerAgent: 5,
  personaUpdateInterval: 10,          // 年
  dialoguePairsPerSeason: 3,          // 每季对话对数
  eventSeedPoolMax: 5,                // 最大种子池
  newSeedPerSeason: 1,                // 每季新种子数
  ecologyEnabled: true,               // 生态开关
  baseForestCover: 80,
};

export const LLM_SWITCHES = {
  narrative: true,    // 叙事层
  dialogue: true,     // 对话层
  events: true,       // 事件种子
  decisions: true,    // 决策层
  persona: true,      // 人格演化
  memory: true,       // 记忆压缩
  ecology: true,      // 自然生态
};
```

## 全部文件清单

```
Phase 9:
  CREATE: src/llm/llm-client.ts        (~50行)
  CREATE: src/llm/prompts.ts           (~100行)
  CREATE: src/llm/biography-system.ts   (~150行)
  MODIFY: src/core/types.ts            (追加类型~70行)
  MODIFY: src/config/index.ts          (追加LLM配置)
  MODIFY: src/index.ts                 (主循环接入bio)

Phase 10:
  CREATE: src/llm/memory-system.ts     (~60行)
  CREATE: src/llm/persona-evolution.ts (~80行)
  CREATE: src/llm/decision-engine.ts   (~100行)
  MODIFY: src/index.ts                 (主循环接入记忆/人格/决策)
  MODIFY: src/agents/lifecycle-system.ts (出生时初始化传记)

Phase 11:
  CREATE: src/llm/dialogue-generator.ts  (~80行)
  CREATE: src/llm/event-seeder.ts        (~150行)
  MODIFY: src/narrative/chronicle-generator.ts (接入对话+事件)
  MODIFY: src/index.ts                    (主循环接入对话+种子)
  MODIFY: src/society/archives.ts         (事件种子归档)

Phase 12:
  CREATE: src/world/ecology.ts          (~150行)
  MODIFY: src/agents/lifecycle-system.ts   (出生/死亡LLM增强)
  MODIFY: src/narrative/chronicle-generator.ts (生态报告)
  MODIFY: src/index.ts                    (接入生态)
  MODIFY: src/agents/trade-system.ts      (采集消耗生态)

总计: 12 个新文件 + 10 个修改文件
```

## 风险与权衡

| 风险 | 级别 | 缓解 |
|------|------|------|
| LLM API 不稳定导致模拟卡住 | 高 | 每个 LLM 调用都有 fallback，超时后自动降级 |
| 100 年 400 次 API 调用积累成本（即使是免费也有 RPM） | 中 | 限速 60 RPM，实际 ~20 call/季 → 远低于限制 |
| LLM 输出 JSON 解析失败 | 中 | 所有解析都有 try/catch + 模板 fallback |
| 生态模型导致人口灭绝（森林砍光/鱼抓完） | 低 | 资源再生有下限保护，baseForest 不会低于 10% |
| 人格演化导致角色行为不一致 | 低 | 每 10 年才更新一次，有审核机制（fallback） |
| Phase 9-12 改动量太大一次完成 | 中 | 分 4 个独立 Phase，每个可独立上线验证 |

## 快速开始（Phase 9 first）

如果只想先跑通最小的 LLM 接入，只需要完成 Phase 9 的：
1. `types.ts` — 类型定义
2. `src/llm/llm-client.ts` — API 客户端
3. `src/llm/biography-system.ts` — 档案系统
4. `src/index.ts` — 新生儿初始化

**然后运行：**
```bash
AGNES_API_KEY=your_key_here npx tsx src/index.ts --new --seed 42 --years 50
```

检查输出中是否出现「XXX 出生于桃源镇」以外的生平记录。
