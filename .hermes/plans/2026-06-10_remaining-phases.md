# 桃源镇剩余阶段实施计划

> 升级文档地址：https://ycnzo7m6iolb.feishu.cn/docx/PCN4d6ouOoZcXjxaNYccPD1Gn3d
> 基础 v6.0 (40src文件, 10k+ LOC, 241 测试) ✅ 100%
> Phase 0-3 ✅ 已全部实现但未提交
> Phase 5-6 ✅ Festivals/Archives/Employment/Market
> Phase 7 ✅ 基本法律系统
> Phase 8 ✅ 疾病系统(11种)
> Phase 9-12: ❌ LLM 全量接入 未开始

## 当前Gap分析

| Gap | 状态 | 说明 |
|-----|------|------|
| Phase 4 科技效果 | ❌ | `tech-tree.ts` 被孤立,`effects[]`不被任何系统读取 |
| Phase 1.4 负面事件链 | ⚠️ | `crimeWave` 已跟踪但不产生连锁效应 |
| Phase 7.3 审判流程 | ❌ | 犯罪被抓后无正式审判过程 |
| Phase 8.2 意外死亡 | ❌ | 无职业伤害致死机制 |
| Phase 8.3 婴儿死亡率 | ⚠️ | 需核实现存数值 |
| Phase 5.2-5.4 文化演变 | ❌ | 地名演化/口头传说/艺术创作 未实现 |
| Phase 9-12 LLM | ❌ | 未开始 |

## 执行计划（按优先级）

### Task A: 科技效果系统 (Phase 4)
> 目标：让技术研究产生实际游戏效果

**文件修改：**
- `src/config/innovation-tree.ts` — 给每个 InnovationNode 添加 `effects: { type: string; value: number }[]`
- `src/core/types.ts` — InnovationNode 添加 effects 字段（如没有）
- `src/world/world-effects.ts` — 新建文件，处理科技效果的跨系统通知
- `src/index.ts` — 每季应用科技效果

**技术效果列表：**
- `farmland_yield` → 建筑产出倍率
- `health_recovery` → 疾病恢复速度
- `tool_quality` → 工具产出质量
- `fishing_output` → 渔业产出
- `archive_capacity` → 档案容量上限

### Task B: 负面事件连锁反应 (Phase 1.4)
> 目标：犯罪后产生持续影响

**文件修改：**
- `src/agents/town-events.ts` — 冲突后添加连锁效果
- `src/index.ts` — 每季检查 crimeWave 并应用效果
- `src/society/laws.ts` — 冲突增加法律提出概率

**连锁效应：**
- crimeWave > 50 → 全镇 happiness -2
- 冲突后 3 年内犯罪率提升 1.5x
- 被偷受害者家族关系 -30（已实现）
- crimeWave > 70 → 自动触发公共安全法提案

### Task C: 审判系统 (Phase 7.3)
> 目标：被抓的罪犯经历正式审判流程

**文件修改：**
- `src/society/laws.ts` — 添加审判函数
- `src/agents/town-events.ts` — 偷窃被抓后触发审判

**流程：**
- 里正(赵长河)主持审判
- 根据罪行严重度判罚：罚款/苦役/驱逐
- 社会关系影响判罚轻重

### Task D: 意外死亡机制 (Phase 8.2)
> 目标：职业相关意外死亡

**文件修改：**
- `src/agents/lifecycle-system.ts` — 添加意外死亡处理
- `src/config/world.ts` — 添加意外死亡率配置

**意外类型：**
- 铁匠：烧伤/烫伤 (0.5%/年)
- 搬运工：摔伤 (0.3%/年)
- 渔民：溺水 (1%/年)
- 矿工：坍塌 (0.5%/年)
- 猎人：野兽袭击 (1%/年)

### Task E: 婴儿死亡率调整 (Phase 8.3)
> 目标：让新生儿存活更现实

**文件修改：**
- `src/config/world.ts` — 调整 INFANT_SURVIVAL_RATE
- `src/index.ts` — 每季度检查婴儿健康状况
