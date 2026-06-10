# 桃源镇 Phase 2：地图激活 + 位置系统

> 依据：升级路线图 Layer 1 社会深度 Phase 2
> 预计耗时：2-3 小时

---

## 总览

| 任务 | 文件 | 类型 | 预计耗时 |
|------|------|------|---------|
| 2.1 Agent 位置追踪 | `src/core/types.ts`, `src/core/world-engine.ts`, `src/index.ts` | 新增+修改 | 40min |
| 2.2 距离影响社交 | `src/index.ts` (socialPhase) | 修改 | 30min |
| 2.3 建筑内 Agent 聚合 | `src/index.ts` | 新增 | 20min |
| 集成验证 | 全测试 + 编译 + 模拟 | 验证 | 20min |

---

## Task 2.1：Agent 位置追踪

### 改动 2.1a：AgentState 增加位置字段

**文件：** `src/core/types.ts`

在 `AgentState` 接口中增加：
```typescript
  /** 当前所在建筑 id（每季更新） */
  currentBuilding?: string;
  /** 地图 x 坐标 */
  x: number;
  /** 地图 y 坐标 */
  y: number;
```

### 改动 2.1b：初始化 Agent 位置

**文件：** `src/core/world-engine.ts` (createNew)

在创建 agent 后，根据其 `initialBuilding` 或所属建筑的坐标初始化位置：
- 如果 agent 有 `initialBuilding` → 设置到该建筑坐标
- 如果没有 → 随机分配到 town_hall 附近
- 新生儿出生时设置到父母所在建筑位置

### 改动 2.1c：每季更新位置

**文件：** `src/index.ts` — 新增 `positionPhase()`

```typescript
function positionPhase(state: WorldState, rng: SeededRNG): string[] {
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    // 已就业者呆在自己的建筑
    // 未就业者随机前往一个公共建筑（客栈/面摊/学堂）
    // 老年/儿童呆在最近的建筑
  }
}
```

**位置分配规则：**
- 建筑所有者：在自己的建筑
- 建筑雇员：在雇主建筑
- 儿童：在学校或在家
- 无固定职业者：随机前往公共建筑（面摊/客栈/集市）
- 老年：在家中或学堂

### 改动 2.1d：新生儿位置

**文件：** `src/index.ts` (populationPhase)

在 `populationPhase` 中创建新生儿时，继承父母位置。

---

## Task 2.2：距离影响社交

### 改动 2.2a：社交概率受距离影响

**文件：** `src/index.ts` (socialPhase)

当前社交随机匹配所有人，改为距离加权：
```typescript
// 距离计算
function agentDistance(a: AgentState, b: AgentState): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// 社交概率修正
const maxRange = 25; // 最大社交距离
const distance = agentDistance(a, b);
const distanceMod = Math.max(0, 1 - distance / maxRange);
// 距离 > 25 格：几乎不社交（mod=0）
// 距离 = 0 格：完全社交（mod=1）
```

**匹配策略变更：**
- 随机挑选两人时，先用距离过滤（只考虑距离 < 25 的配对）
- 社交频率 = base × (1 - distance/maxRange)
- 夫妻如果分处两地，关系值自然下降

### 改动 2.2b：婚姻匹配受距离影响

**文件：** `src/index.ts` (socialPhase)

当前婚姻匹配只看关系和年龄，改为也看距离：
- 候选配偶距离 < 10 格：概率 ×2
- 候选配偶距离 > 20 格：不能成婚

---

## Task 2.3：建筑内 Agent 聚合

### 改动 2.3a：建筑 occupancy 统计

**文件：** `src/index.ts` — 在 positionPhase 内

```typescript
// 每季统计每个建筑内的 Agent 数
const buildingOccupancy: Record<string, number> = {};
for (const agent of state.agents) {
  if (!agent.alive || !agent.currentBuilding) continue;
  buildingOccupancy[agent.currentBuilding] = (buildingOccupancy[agent.currentBuilding] ?? 0) + 1;
}
```

### 改动 2.3b：人多处社交概率倍增

**文件：** `src/index.ts` (socialPhase)

在社交匹配时，如果两个 agent 在同一个建筑内，额外 +50% 社交概率加成。
如果建筑内人数 > 3，进一步 +20%。

---

## 验证标准

```bash
npm test                        # 全部通过
npx tsc --noEmit                # 编译零错误
npm run new -- --seed 42 --years 10 --summary  # 能跑完
```

**具体验证：**
- 运行后 `data/saves/last-save.json` 中每个 agent 有非零 x/y
- 两个 agent 在同一个建筑时社交概率更高
- 距离远的 agent 几乎不社交
- 婚姻匹配在距离近的候选者中发生

---

## 风险

- 位置更新不合理可能让 agent 全部挤在一起 → 随机分散到不同建筑
- 距离社交可能让小镇分裂成小团体 → 保持基础社交概率 > 0（即使距离远也有低概率）
- 新生儿 x/y 为 0 → 确保继承父母坐标
