# Phase A: 核心引擎修复 — 让项目能跑起来

> **For Hermes:** Use hermes-subagent-workflow to implement this plan task-by-task.
> Implementer → Spec Reviewer → Quality Reviewer, fresh subagent per task.

**Goal:** 修复桃源镇 TypeScript 核心引擎的工具链断裂问题，让项目成功编译、测试全通过、基础模拟能运行。

**现状（2026-06-13）：**
- TypeScript 源码 54 文件，34 测试文件，全写在 vitest 语法下
- `vitest` 未安装（但 `vitest.config.ts` 存在）
- `tsx` 未安装（CLAUDE.md 规定用 tsx 运行）
- `typescript` 仅作为 transitive dep 存在，无本地安装
- `tsconfig.json` 排除了 `tests/` 目录
- `package.json` 的 `test` 脚本指向 `jest`（不兼容）
- `npm run dev` 脚本不存在
- TypeScript 编译错误数量未知

**关键路径：** 修工具链 → 过编译 → 过测试 → 能运行

---

### Task 1: 安装缺失开发依赖

**Objective:** 安装 vitest、tsx、typescript 到 devDependencies

**Files:**
- Modify: `package.json`

**Step 1:** 安装 vitest、tsx、typescript
```bash
cd /home/ching/town-of-peace
npm install -D vitest@latest tsx@latest typescript@latest
```
Expected: 安装成功，`node_modules/.bin/vitest` 和 `node_modules/.bin/tsx` 存在

**Step 2:** 删除无用的 jest 依赖
```bash
npm uninstall jest
```
Expected: package.json devDependencies 中 jest 被移除

**Step 3:** 验证二进制文件存在
```bash
ls node_modules/.bin/vitest node_modules/.bin/tsx node_modules/.bin/tsc
```
Expected: 三个文件都存在

**Verification:**
- [ ] vitest CLI 可用
- [ ] tsx CLI 可用
- [ ] tsc CLI 可用
- [ ] jest 已移除

---

### Task 2: 修复测试配置

**Objective:** 让 `vitest.config.ts` 有效，使 34 个测试可以被 vitest 发现和运行

**Files:**
- Modify: `vitest.config.ts`
- Modify: `package.json`（test script）
- Create: `.hermes/plans/tsconfig.tests.json`（临时）

**Step 1:** 更新 `vitest.config.ts`，确保 test 命令能找到所有测试文件并正确处理 tsconfig

```
当前 vitest.config.ts 内容：
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
});

问题：vitest 默认使用 tsconfig.json 编译测试文件，但 tsconfig.json 排除了 tests/。
需要在 vitest.config.ts 中指定独立的 tsconfig 或内联编译选项。
```

**Step 2:** 更新 `package.json` scripts
```
"test": "vitest run --reporter=verbose"
"test:watch": "vitest"
```

**Step 3:** 尝试运行一个测试验证
```bash
npx vitest run tests/unit/rng.test.ts --reporter=verbose
```
Expected: 测试文件能被发现，运行（可能失败于编译错误，那是正常的下一步）

**Verification:**
- [ ] vitest 能找到测试文件
- [ ] 测试文件被解析（即使编译失败）
- [ ] `npm test` 命令可用

---

### Task 3: 修复 TypeScript 编译错误 — 核心类型

**Objective:** 运行 `npx tsc --noEmit` 后识别所有编译错误，从核心类型/接口文件开始修复

**Files:** （可能涉及，取决于编译错误）
- Modify: `src/core/types.ts`
- Modify: 其他类型/接口文件
- Modify: `tsconfig.json`

**已知问题：**
- `tsconfig.json` 排除了 `tests/`，需要添加
- `target: ES2022` + `module: ESNext` + `moduleResolution: bundler` 组合可能需要在 vitest 中额外配置
- 新增的 `src/llm/` 模块可能有未定义的类型依赖

**Step 1:** 跑编译看看报了哪些错误
```bash
npx tsc --noEmit 2>&1 | tee /tmp/ts-errors.txt
```

**Step 2:** 逐个修复，每次修复后重跑验证

**Step 3:** 添加 tests 目录到 tsconfig（或为 tests 建独立的 tsconfig）

**Verification:**
- [ ] `npx tsc --noEmit` 无错误退出
- [ ] `npx vitest run tests/unit/rng.test.ts` 成功运行并通过

---

### Task 4: 修复测试失败 — RNG 测试

**Objective:** 让最基础的 seeded RNG 测试通过，验证测试基础设施正常

**Files:**
- Read: `tests/unit/rng.test.ts`
- Read: `src/core/rng.ts`
- Modify: 如有需要修复的类型问题

**Step 1:** 运行 RNG 测试
```bash
npx vitest run tests/unit/rng.test.ts --reporter=verbose
```

**Step 2:** 分析失败原因并修复

**Step 3:** 确认测试通过

**Verification:**
- [ ] RNG 测试通过
- [ ] 验证测试框架整体可用

---

### Task 5: 修复测试失败 — Core 模块测试

**Objective:** 让 core 模块（event-bus, world-engine）的测试全部通过

**Files:**
- Read: `tests/unit/event-bus.test.ts`
- Read: `src/core/event-bus.ts`
- Read: `src/core/world-engine.ts`

**Step 1:** 运行 event-bus 测试
```bash
npx vitest run tests/unit/event-bus.test.ts --reporter=verbose
```

**Step 2:** 修复失败

**Step 3:** 确认通过

**Verification:**
- [ ] event-bus 测试通过
- [ ] 所有 core 模块测试通过

---

### Task 6: 修复测试失败 — Config 模块测试

**Objective:** 让 config 模块测试通过（env, resource-system, innovation-tree）

**Files:**
- Read: `tests/unit/env.test.ts`
- Read: `tests/unit/resource-system.test.ts`
- Read: `tests/unit/config-innovation-tree.test.ts`

**Step 1-3:** 逐个修复 config 测试

**Verification:**
- [ ] 所有 config 测试通过

---

### Task 7: 修复测试失败 — Economy 模块测试

**Objective:** 让 economy 模块测试通过（inventory, market, trade）

**Files:**
- Read: `tests/unit/inventory.test.ts`
- Read: `tests/unit/market.test.ts`
- Read: `tests/unit/trade.test.ts`

**Step 1-3:** 逐个修复

**Verification:**
- [ ] 所有 economy 测试通过

---

### Task 8: 修复测试失败 — Agent 模块测试

**Objective:** 让 agent 模块测试通过（dialogue-topics, group-system, rumor-mill, town-events, knowledge-transfer）

**Files:**
- Read 5+ test files and their corresponding source files

**Step 1-5:** 逐个修复

**Verification:**
- [ ] 所有 agent 模块测试通过

---

### Task 9: 修复测试失败 — Society + World + Narrative 模块测试

**Objective:** 让 society（laws）、world（map, buildings）、narrative（chronicle-generator, art-system, oral-traditions）模块测试通过

**Files:**
- Read 6+ test files and source files

**Step 1-6:** 逐个修复

**Verification:**
- [ ] 所有 society/world/narrative 测试通过

---

### Task 10: 修复测试失败 — LLM 模块测试

**Objective:** 让 LLM 集成模块测试通过，注意这些模块有 external API 依赖，需要 mock 或跳过集成测试

**Files:**
- Read: `tests/unit/llm-client.test.ts`
- Read: `tests/unit/biography-system.test.ts`
- Read: `tests/unit/decision-engine.test.ts`
- Read: `tests/unit/dialogue-generator.test.ts`
- Read: `tests/unit/memory-system.test.ts`
- Read: `tests/unit/persona-evolution.test.ts`
- Read: `tests/unit/prompts.test.ts`
- Read: `tests/unit/event-seeder.test.ts`
- Read: `tests/unit/ecology-events.test.ts`
- Read: `tests/unit/ecology-system.test.ts`
- Read: `tests/unit/lifecycle-narratives.test.ts`

**Step 1:** 判断 LLM 测试是否需要 API key 或 mock。对于需要 API 的测试，加 `conditional` 标签或用 `describe.skip`

**Step 2-12:** 逐个修复或跳过

**Verification:**
- [ ] 所有可运行的 LLM 模块测试通过
- [ ] 需要 API key 的测试被正确跳过或标记

---

### Task 11: 运行全部测试 + 集成测试

**Objective:** 确保全部 34 个测试文件全部通过

**Step 1:** 运行全量测试
```bash
npx vitest run --reporter=verbose
```

**Step 2:** 修复剩余失败

**Step 3:** 运行集成测试
```bash
npx vitest run tests/integration/ --reporter=verbose
```

**Verification:**
- [ ] 全部 34 个测试提供通过结果
- [ ] 集成测试通过

---

### Task 12: 创建 `dev` 脚本 + 验证模拟可运行

**Objective:** 创建 `npm run dev` 脚本，能用 tsx 运行模拟引擎

**Files:**
- Modify: `package.json`
- Modify: `src/index.ts`（如需要）

**Step 1:** 添加 dev 脚本
```json
"dev": "tsx src/index.ts",
"dev:seed": "tsx src/index.ts --seed 42 --years 10"
```

**Step 2:** 运行模拟
```bash
npm run dev:seed 2>&1
```
Expected: 模拟启动、运行、输出结果

**Step 3:** 如有运行时错误，修复

**Verification:**
- [ ] `npm run dev` 启动模拟无崩溃
- [ ] `npm run dev:seed` 带种子运行 10 年输出结果
- [ ] `npm test` 全部通过

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM 测试依赖 API key 无法运行 | 高 | 中 | 添加 conditional 标签，模拟环境跳过 |
| tsconfig 与 vitest 有编译选项冲突 | 中 | 高 | 用 vitest 内联配置覆盖 |
| `Readonly<WorldState>` 陷阱导致运行时赋值失败 | 中 | 高 | 参考 spec-driven-development 的 pitfall 记录 |
| 模块间循环依赖 | 低 | 高 | 先测编译，发现即重构 |
| server/ 的 JS 代码和 src/ 的 TS 代码需要桥接 | 中 | 中 | Phase B 再处理 |

---

## 执行顺序

```
T1 (装依赖) → T2 (配测试) → T3 (修编译) → T4-T10 (逐个修测试) → T11 (全量跑) → T12 (跑模拟)
```

每个 Task 使用 hermes-subagent-workflow：
1. Implementer subagent 实现
2. Spec Reviewer subagent 验证（读实际文件，不信任报告）
3. Quality Reviewer subagent 审查
