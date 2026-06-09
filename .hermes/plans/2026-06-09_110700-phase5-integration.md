# 桃源镇 Phase 5: 新模块集成主循环 — 实施计划

> **For Hermes:** Execute this plan step-by-step. Each task is 2-5 minutes of focused work.

**Goal:** 将 8 个已开发、已测试的新模块注入 `src/index.ts` 主循环，通过类型检查、测试全绿、端到端可运行。

**架构：** 每个新模块封装为一个 `*Phase()` 辅助函数（对标现有 `populationPhase` / `economicPhase` 等），在主循环 `while` 块中串联执行。各模块的输出（string[]）统一收集，经 `EventEmitter.emitAll()` 格式化为带标签叙事文本，汇入 chronicle。

**当前状态：**
- 40 源文件，241/241 测试通过 ✅
- 主循环仍跑旧 8 阶段，未接入新模块
- 需导入的 8 个模块均已写好并有单测覆盖

---

## 模块 API 对照表

| 模块 | 类/构造函数 | 关键方法 | 返回 |
|------|-------------|---------|------|
| `RumorMill` | `new RumorMill(state, rng)` | `seedRumors(events[]): []`, `processSpread(): []` | string[] |
| `GroupSystem` | `new GroupSystem(state, rng)` | `processGroups(): []` | string[] |
| `TownEvents` | `new TownEvents(state, rng)` | `processEvents(): []` | string[] |
| `TechChecker` | `new TechChecker(state)` | `getUnlockableNodes(): InnovationNode[]` | — |
| `DiscoveryEvents` | `new DiscoveryEvents(state, rng)` | `processDiscoveries(): []` | string[] |
| `FestivalSystem` | `new FestivalSystem(state, rng)` | `processFestivals(): []` | string[] |
| `ArchiveSystem` | `new ArchiveSystem(state, rng)` | `processArchives(): []` | string[] |
| `EventEmitter` | `new EventEmitter(state, rng)` | `emitAll(subsystemEvents)`, `recordAllToChronicle([])` | string[] |

---

## 任务分解

### Task 1: 导入所有新模块到 index.ts

**Objective:** 在 index.ts 头部添加 import 语句。

**文件：** `src/index.ts:1-20`（import 区域）

**步骤：**
在现有 import 块末尾，添加：

```typescript
import { RumorMill } from './agents/rumor-mill.js';
import { GroupSystem } from './agents/group-system.js';
import { TownEvents } from './agents/town-events.js';
import { TechChecker } from './innovation/tech-checker.js';
import { DiscoveryEvents } from './innovation/discoveries.js';
import { FestivalSystem } from './society/festivals.js';
import { ArchiveSystem } from './society/archives.js';
import { EventEmitter, type SubsystemEvents } from './narrative/event-emitter.js';
import { NarrativeTemplates } from './narrative/templates.js';
```

**验证：** `npx tsc -b` 应通过（或只有预存错误）。

---

### Task 2: 创建新模块的 Phase 函数

**Objective:** 在主函数之前，添加各新模块的封装函数。

**文件：** `src/index.ts`，在 `// ─── 存档 ────` 之前或 `// ─── 主函数 ──` 之前的区域。

**步骤 2a: 谣言+群体+城镇事件 Phase**

```typescript
// ─── 新模块 Phase 函数 ────────────────────────

function rumorPhase(state: WorldState, rng: SeededRNG, allEvents: string[]): string[] {
  const rm = new RumorMill(state, rng);
  const rumors = rm.seedRumors(allEvents);
  const spread = rm.processSpread();
  return [...rumors, ...spread];
}

function groupPhase(state: WorldState, rng: SeededRNG): string[] {
  const gs = new GroupSystem(state, rng);
  return gs.processGroups();
}

function townEventPhase(state: WorldState, rng: SeededRNG): string[] {
  const te = new TownEvents(state, rng);
  return te.processEvents();
}
```

**步骤 2b: 创新+发现 Phase**

```typescript
function innovationPhase(state: WorldState, rng: SeededRNG): string[] {
  const checker = new TechChecker(state);
  const unlocked = checker.getUnlockableNodes();
  // 解锁可用节点（如果有）
  const events: string[] = [];
  for (const node of unlocked) {
    if (rng.chance(0.2)) { // 20% 概率解锁
      state.innovations.push({ id: node.id, name: node.name, discoveredYear: state.year });
      events.push(`${node.name}被成功研发！`);
    }
  }
  return events;
}

function discoveryPhase(state: WorldState, rng: SeededRNG): string[] {
  const de = new DiscoveryEvents(state, rng);
  return de.processDiscoveries();
}
```

**步骤 2c: 社会文化 Phase**

```typescript
function festivalPhase(state: WorldState, rng: SeededRNG): string[] {
  const fs = new FestivalSystem(state, rng);
  return fs.processFestivals();
}

function archivePhase(state: WorldState, rng: SeededRNG): string[] {
  const as = new ArchiveSystem(state, rng);
  return as.processArchives();
}
```

**验证：** `npx tsc -b` 应无新错误。

---

### Task 3: 修改主循环 — 注入新 Phase

**Objective:** 在 `while` 循环中，插入新阶段。

**文件：** `src/index.ts:410-458`（主循环区域）

**步骤 3a: 粘贴新代码**

在当前循环内，`socialPhase` 和 `lawPhase` 之间/之后插入新阶段：

```typescript
    // 新模块 — 社会文化层
    const grpEvents = groupPhase(engine.getState(), rng);
    const twnEvents = townEventPhase(engine.getState(), rng);
    const fstEvents = festivalPhase(engine.getState(), rng);

    // 新模块 — 创新层
    const innEvents = innovationPhase(engine.getState(), rng);
    const disEvents = discoveryPhase(engine.getState(), rng);

    // 谣言传播（基于以上所有事件）
    const rumorEvents = rumorPhase(engine.getState(), rng, [...popEvents, ...lifeEvents, ...ecoEvents, ...socEvents, ...grpEvents, ...twnEvents, ...innEvents, ...disEvents, ...fstEvents]);

    // 档案系统记录
    const arcEvents = archivePhase(engine.getState(), rng);

    // 叙事整合
    const ee = new EventEmitter(engine.getState(), rng);
    const subsystemEvents: SubsystemEvents = {
      rumors: rumorEvents,
      groups: grpEvents,
      townEvents: twnEvents,
      discoveries: disEvents,
      festivals: fstEvents,
      archives: arcEvents,
      trade: ecoEvents,
    };
    const narratedEvents = ee.emitAll(subsystemEvents);
    ee.recordAllToChronicle(narratedEvents);
```

**步骤 3b: 更新 allEvents 合并行**

将当前 `const allEvents = [...popEvents, ...lifeEvents, ...bldEvents, ...diaEvents, ...ecoEvents, ...socEvents, ...lawEvents, ...chrEvents];` 替换为：

```typescript
    const allEvents = [...popEvents, ...lifeEvents, ...bldEvents, ...diaEvents, ...ecoEvents, ...socEvents, ...grpEvents, ...twnEvents, ...fstEvents, ...innEvents, ...disEvents, ...rumorEvents, ...lawEvents, ...arcEvents, ...chrEvents, ...narratedEvents];
```

**步骤 3c: 修改变量声明冲突**

因为 `rng` 已在循环顶部 `const rng = engine.getRng();` 处声明，所有 phase 函数可直接使用它。注意 `const ee = new EventEmitter(...)` 在循环内声明不会与已有变量冲突。

**验证：** `npx tsc -b` 检查类型错误。

---

### Task 4: TypeScript 编译检查

**Objective:** 确保编译无类型错误。

**命令：**
```bash
cd /home/ching/town-of-peace && npx tsc -b 2>&1
```

**预期输出：** 只有预存的 node_modules 相关错误（vite/#types 那些），src/ 文件应无新错误。

---

### Task 5: 运行完整测试套件

**Objective:** 所有 18 个测试文件全绿。

**命令：**
```bash
cd /home/ching/town-of-peace && npm test 2>&1
```

**预期：** 241+ 测试通过（可能会新增一些集成测试覆盖）。新老测试全部 pass。

---

### Task 6: 端到端运行验证

**Objective:** 实际运行仿真 10 年，验证输出含新模块内容。

**命令：**
```bash
cd /home/ching/town-of-peace && node dist/index.js --years 10 --summary --new 2>&1
```

**预期输出验证项：**
- 输出中含 【谣言】、【社群】、【事件】、【发现】、【节日】、【档案】等标签
- `第 N 年` 行正常打印
- 无 crash / runtime error

---

### Task 7: 更新 architecture-comparison.html

**Objective:** 将进度从 96% 更新为 100%，Phase 5 标记 ✅。

**文件：** `architecture-comparison.html`

**改动：**
- `overall.pct`: 96 → 100
- Phase 5 行: 🟡 → ✅
- 模拟循环图: 改为「已全部注入」
- 更新 `scannedAt` 时间戳

---

## 风险与注意事项

1. **RumorMill.seedRumors** 需要其他阶段的事件字符串作为输入 — 顺序很重要，先产生事件再传给谣言系统
2. **循环内 `const ee = new EventEmitter(...)`** — EventEmitter 每次 tick 重新构造是安全的，因为它只操作 state
3. **`const rng` 作用域** — 循环内已有 `const rng = engine.getRng()`，新 phase 函数直接用同一个 rng，不会冲突
4. **创新解锁逻辑** — `innovationPhase` 中写死了 20% 解锁概率，可能需要后续调优
5. **EventEmitter.recordAllToChronicle** 会将事件推入 `state.chronicle`，同时主循环也已推 entry，需避免重复录入

## 验证清单

- [ ] `npx tsc -b` 通过
- [ ] `npm test` 全部通过
- [ ] 端到端运行 10 年无 crash
- [ ] 输出含所有新标签（谣言/社群/事件/发现/节日/档案）
- [ ] HTML 进度更新到 100%
