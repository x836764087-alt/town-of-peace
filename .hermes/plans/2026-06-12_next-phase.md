# 桃源镇 — 下一阶段实施计划

> 基准：v6.0（40src, 10k+ LOC, 241 tests）
> 本次会话已完成：A(科技效果) B(事件链) D(意外死亡) E(婴儿死亡率)
> 上次剩余：C(审判系统) 核心代码写完但未连接 theft 事件

## 阶段 I — 收尾审判系统（Phase 7.3 完成）

### Task I-1: 连接 theft→审判流程

- **文件**: `src/agents/town-events.ts`
- **改动**: 
  - 在文件顶部导入 `LawSystem`（已存在 `import type { WorldState } from '../core/types.js'`）
  - 在 theft 的 `effect` 函数中，caught 分支替换为：
    1. 保留关系惩罚（family relationships）
    2. 不直接罚款，而是创建 `LawSystem` 实例并调用 `conductTrial(thief.id, target.id)`
    3. 将审判返回的 `narrative` 加入事件数组
  - 注意：`LawSystem` 需要 `WorldState` 和 `SeededRNG`，两者在 context 中已有
- **验证**: `npx tsc --noEmit` + `npm test`

### Task I-2: 为审判系统加测试

- **文件**: `tests/unit/town-events.test.ts`
- **改动**:
  - 在 theft 测试用例中，验证 caught 后的事件文案包含审判相关关键词（"宣判"/"罚款"/"苦役"）
  - 验证 crimes 计数器递增
- **验证**: `npm test` 全部通过

### Task I-3: 长模拟验证

- 运行：`npx tsx src/index.ts --new --seed 42 --years 20 --summary`
- 运行：`npx tsx src/index.ts --new --seed 9999 --years 20 --summary`
- 检查日志中是否有审判事件出现，无崩溃，无异常状态

## 阶段 II — 文化演变（Phase 5.2-5.4）

### Task II-1: 地名演化系统

- **文件**: 
  - `src/core/types.ts` — 为 `WorldState` 添加建成区域命名记录
  - `src/world/buildings.ts` 或新建 `src/world/place-names.ts` 
- **说明**:
  - 当建筑/聚居区存在 20+ 年，自动获得一个传说化的名称（如"铁匠巷"→"烈火巷"）
  - 有名望的居民逝世后，可能出现以他命名的场所
  - 地名变化记录在编年史中
- **验证**: 模拟 30 年后检查是否有演化后的地名在日志中

### Task II-2: 口头传说 / 民间故事

- **文件**: 新文件 `src/narrative/oral-traditions.ts`
- **说明**:
  - 每个季节有概率诞生一个"民间故事"
  - 故事主题：重大事件（灾难/英雄行为/奇闻）、著名居民生平
  - 故事有传播度属性（0-100），逐年自然扩散
  - 不同代际之间故事可能变异（简化：随机局部修改）
- **验证**: 模拟中产出 oral traditions 日志

### Task II-3: 艺术创作

- **文件**: 
  - `src/agents/agent-factory.ts` — 初始化时给部分 agent 添加艺术相关技能
  - `src/index.ts` — 每季检查艺术家创作
- **说明**:
  - 拥有 art 技能的居民有概率创作作品
  - 作品类型：诗歌/绘画/乐曲（取决于技能子类）
  - 作品质量 = skill level × rng
  - 高质量作品提升创作者声望 + 全镇文化值
- **验证**: 模拟中有艺术作品产出记录

## 验证与交付

### Task V-1: 全面回归测试
- `npm test` 全通过
- `npx tsc --noEmit` 零错误

### Task V-2: 双种子长模拟
- seed 42: 20年
- seed 9999: 20年
- 检查模拟输出无异常

### Task V-3: 更新 progress 文档 + git commit
- 更新 `.hermes/plans/2026-06-10_remaining-phases.md` 进度标记
- `git add -A && git commit -m "feat: 审判+文化演变系统"`
