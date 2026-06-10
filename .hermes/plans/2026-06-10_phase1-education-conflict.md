# 桃源镇 Phase 1：教育系统 + 社会冲突 — 实施计划

> 依据：升级路线图 Layer 1 社会深度 Phase 1
> 预计耗时：2-3 小时

---

## 总览

| 任务 | 文件 | 类型 | 预计耗时 |
|------|------|------|---------|
| 1.1 教育系统 | `src/agents/lifecycle-system.ts`, `src/index.ts` | 修改 | 40min |
| 1.2 少年阶段有用化 | `src/agents/lifecycle-system.ts`, `src/index.ts` | 修改 | 20min |
| 1.3 社会冲突系统 | `src/agents/town-events.ts`, `src/config/events-pool.ts` | 增强 | 40min |
| 1.4 负面事件后果链 | `src/agents/town-events.ts`, `src/index.ts` | 增强 | 20min |
| 集成验证 | 全测试 + 运行 | 验证 | 20min |

---

## Task 1.1：教育系统实装

**文件：** `src/agents/lifecycle-system.ts`, `src/index.ts`

### 需求
当前学校只是 tag `attending_school`，无实际教育效果。需要让 5-12 岁儿童真正受益于教育。

### 实现
在 `lifecycle-system.ts` 的年龄处理分支中，当 age 5-12 且建筑 school 存在时：
- 每年 int +1-3（随机）
- 父母技能中 >20 的，20% 概率传承
- 识字率 literacy 每年 +5（上限 80）
- 塾师（周建国）存活时学习效率 ×1.5
- 家庭财富 < 50 时 50% 辍学

需要在 `index.ts` 中增加 `educationPhase()` 阶段。

**验证：** 上学12年的角色 int 比未受教育者高 12-36，literacy 非零

---

## Task 1.2：少年阶段有用化

**文件：** `src/agents/lifecycle-system.ts`, `src/index.ts`

### 需求
13-17 岁少年目前空转，需要给他们可做的事情。

### 实现
在 `populationPhase()` 中：
- 13-17 岁可做学徒：收入为成人 30-50%
- 跟随父母学习：每年父母主要技能 +2（上限父母 70%）
- 可参与基础采集：产出为成人 40%

**验证：** 少年不再空转，有收入/技能增长

---

## Task 1.3：社会冲突系统

**文件：** `src/agents/town-events.ts`（增强），`src/config/events-pool.ts`（添加冲突相关事件）

### 需求
当前 100 年 0 起犯罪，完全不真实。需要让 Agent 之间产生冲突。

### 冲突类型
| 类型 | 概率 | 条件 | 后果 |
|------|------|------|------|
| 偷盗 | ~3%/季 | agent wealth<20 + 偷窃技能>关系值 | 目标损失1-5粮，被抓罚 |
| 争吵 | ~5%/季 | 随机两人关系<0 | 关系再跌10-20 |
| 斗殴 | ~0.5%/季 | 争吵升级/酒后 | health -5~15 |
| 纵火 | ~0.1%/季 | 极端情况 | 建筑 damage+ |

- 冲突频率受全镇平均 happiness 影响——幸福感越低，冲突越高
- 有治安法（LawSystem）时，盗窃被抓概率 30% → 60%

**验证：** 100 年模拟至少应有 10-20 起冲突记录

---

## Task 1.4：负面事件后果链

**文件：** `src/agents/town-events.ts`, `src/index.ts`

### 需求
事件影响需要传导到其他系统，形成因果链。

### 实现
重大犯罪（盗窃/斗殴）：
- 降低全镇 happiness 平均值 1-3 点（持续 2-3 年）
- 增加 LawSystem 中治安法被提议的概率
- 受害者家族成员对犯罪者关系值 -30

**验证：** 事件影响能传导到其他系统

---

## 验证标准

```bash
npm test                        # 全部通过
npx tsc --noEmit                # 编译零错误
npm run new -- --seed 42 --years 20 --summary  # 能跑完，输出含冲突/教育内容
```

## 风险

- 冲突概率太高可能导致小镇太快解体 → 初始设低值（偷盗 3%，争吵 5%）
- 教育效果太强产生"超级角色" → 每年 int+1-3，不会超过自然上限
- 少年采集产出太低无意义 → 设为成人 40%
