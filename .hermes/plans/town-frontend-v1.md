# 桃源镇前端可视化 — 实施计划

> 基于：桃源镇前端可视化详细设计报告 (Doc: OM7Zdr2cMoO5ldxrvfrciCA7nDb)
> 目标：开发 Stardew Valley 风格像素前端，用浏览器可视化桃源镇 20 年文明演化的数据

## 总体架构

```
frontend/
├── index.html              ← 主入口（单文件，内联所有 CSS/JS）
├── data/
│   └── last-save.json      ← 模拟存档（软链到 data/saves/last-save.json）
```

**关键决策：** 
- 纯 HTML + CSS + JS 单文件（零框架，零构建，file:// 可直接打开）
- Canvas 2D 渲染地图 + DOM 渲染 UI 面板
- 只读 save.json，前后端完全解耦
- 像素精灵由 Canvas 绘制代码生成（无需外部图片）

---

## Phase 0: 骨架与数据加载 [MVP]

**目标：** 单 HTML 文件，加载 save.json，显示布局骨架

### Task 0.1: 创建前端目录和项目骨架

**文件：** `frontend/index.html` (创建)

实现要点：
- 完整的 HTML5 骨架（`<!DOCTYPE html>`）
- CSS reset + CSS 变量（颜色体系：木色/羊皮纸/四季调色板）
- 基础布局：顶栏 + 地图区（左70%）+ 侧栏（右30%）
- 顶栏：季节指示器 + 年份 + 搜索框 + 全屏按钮
- 侧栏预留空容器：编年史区 + 仪表盘区
- JS 内联：`fetch('data/last-save.json')` → 解析 + 缓存到 `window.__STATE__`
- 字体栈：`'Zpix', 'Noto Sans SC', 'PingFang SC', sans-serif`
- `image-rendering: pixelated` 确保像素风格

**验证：** 浏览器打开 `index.html`，看到布局骨架，控制台输出 parsed data

### Task 0.2: 创建软链和数据准备

**命令：**
```bash
cd frontend && mkdir -p data
ln -sf ../../data/saves/last-save.json data/last-save.json
```

**验证：** `ls -la data/last-save.json` 显示软链存在且可读

---

## Phase 1: 地图渲染

**目标：** 55×50 像素网格渲染成彩色地形图，可平移缩放

### Task 1.1: Canvas 地图渲染引擎

**文件：** `frontend/index.html` (追加到 JS 内联)

实现要点：
- 在 `#map-container` 中创建 `<canvas>` 元素
- 读取 `window.__STATE__.map.tiles[55][50]`
- 每个 TileType 映射到颜色 + 纹理：
  - `plains` → `#a8e6cf` 草绿 + 随机草丛点
  - `forest` → `#4a9e3f` 深绿 + 三角形树木
  - `water` → `#3d84a8` 蓝 + 波纹动画
  - `mountain` → `#8B8682` 灰 + 岩石纹理
  - `farmland` → `#d4a373` 棕 + 条纹
  - `road` → `#e8d5a3` 米黄
  - `desert` → `#e6c280` 沙色
  - `tundra` → `#c4d1e0` 冰蓝
- 每格 32×32 px，总画布 1760×1600 px
- `fertility` 高 → 更亮 / `resource` → 矿脉标记
- 离屏 Canvas 缓存静态瓦片
- **相机控制**：鼠标拖拽平移 + 滚轮缩放 + 滚动条模式

**交互：**
- 鼠标左键拖拽平移地图
- 滚轮缩放（0.5x - 3x）
- 重置按钮（R键或按钮回中心）

**验证：** 看到完整的彩色桃源镇地图，能拖动和缩放

---

## Phase 2: 建筑 + 角色精灵

**目标：** 地图上出现建筑小房子和像素小人

### Task 2.1: 建筑精灵渲染

**文件：** `frontend/index.html` (追加)

实现要点：
- 读取 `buildings[]` (11座)，每座有 `{id, name, type, x, y, level, ownerId}`
- 坐标转换：`tileToPixel(building.x, building.y)` → Canvas 坐标
- 建筑类型 → 颜色 + 形状：
  - `agriculture` → 绿墙 + 茅草顶
  - `industrial` → 灰墙 + 瓦顶 + 烟囱
  - `commercial` → 红墙 + 红瓦
  - `residential` → 黄墙 + 棕瓦
  - `civic` → 蓝墙 + 蓝瓦
  - `culture` → 紫墙 + 八角顶
- 墙体：24×16 px 矩形，屋顶：三角形覆盖
- 等级标记：level>1 显示星标
- 鼠标悬停：显示建筑名 + 等级 tooltip
- 鼠标点击：高亮建筑（黄色边框）

**验证：** 地图上看到 11 座彩色小房子，悬停显示名字

### Task 2.2: 角色精灵渲染

**文件：** `frontend/index.html` (追加)

实现要点：
- 读取 `agents[]` (33人)
- 每个角色渲染为 16×32 px 像素小人
- 身体颜色：按职业/性别区分（`JOB_COLORS` 字典）
- 头部：`#ffd3b6` 肤色圆
- 名字悬浮（`agent.name` 显示在头上方）
- 已故角色：`opacity: 0.5` + 墓碑标记
- 鼠标悬停：高亮（光晕效果）
- 鼠标点击：触发 `onAgentClick(agent)` 事件

**验证：** 地图上看到 33 个小人，已故的半透明，悬停显示名字

---

## Phase 3: 居民详情面板

**目标：** 点击角色弹出羊皮纸风格详细信息面板

### Task 3.1: 居民面板 DOM

**文件：** `frontend/index.html` (追加)

实现要点：
- `#agent-modal`：覆盖层（modal overlay）
- 羊皮纸设计：`background: #F5E6C8`, `border: 3px solid #8B5E3C`
- 头部：头像像素区域 + 名字 + 头衔 + 年龄 + 性别
- 状态条（6条）：心情/健康/体力/力量/智力/魅力 — 彩色进度条
- 技能列表：每个技能名 + 进度条（颜色渐变）
- 生平区：`biography?.persona?.narrative_arc` 或合成
- 回忆区：`memories[]` 最近5条
- 家族区：`family.spouse` + `family.children` + 显示名字
- 关闭按钮（× 或 点击遮罩关闭）

**数据源：**
- `agent.stats` → 状态条
- `agent.skills` → 技能条
- `agent.memories` → 回忆列表
- `agent.biography` → 生平/讣告
- `agent.family` → 家族信息

**验证：** 点击任一角色，弹出完整的羊皮纸面板

---

## Phase 4: 编年史 + 仪表盘

**目标：** 右侧面板显示完整编年史和仪表盘数据

### Task 4.1: 编年史时间线

**文件：** `frontend/index.html` (追加)

实现要点：
- 读取 `chronicle[]` (82条)
- 按 `year` 分组，年份标题（如 "Year 20"）
- 每条条目：`[severity图标] 内容`
- 严重度颜色标记：
  - `epochal` → 🌟 金色 `#E8C37B`
  - `dramatic` → ⚡ 红色 `#e74c3c`
  - `notable` → 📜 蓝色 `#3498db`
  - `peaceful` → 🌿 绿色 `#2ecc71`
- 可滚动，最新在最上
- 每条事件显示年份标签

**验证：** 侧栏看到按年份分组的编年史，颜色正确

### Task 4.2: 仪表盘面板

**文件：** `frontend/index.html` (追加)

实现要点：
- 分 4 块网格布局（2×2）：
  1. **经济概览**：货币总量 `economy.totalCurrency`、年贸易额 `economy.annualTradeVolume`
  2. **人口结构**：总人口33、健在27、已故6
  3. **科技/法律**：`innovations[]` 已发现数量、`laws[]` 数量
  4. **节日日历**：`festivals[]` 列表，按季节分组

**数据源：** `economy`, `agents[]` (计算 alive count), `innovations[]`, `laws[]`, `festivals[]`

**验证：** 仪表盘显示真实数据：640文货币、9,497贸易额、14项发明、4部法律、4个节日

### Task 4.3: 季节引擎

**文件：** `frontend/index.html` (追加)

实现要点：
- 读取 `season` 字段（"spring" / "summer" / "autumn" / "winter"）
- 4 个调色板定义（CSS 变量切换 + Canvas 色调叠加）
- 顶栏显示季节图标 + 文字（春季🌸 / 夏季☀️ / 秋季🍂 / 冬季❄️）
- 季节切换动画（2秒过渡）
- 粒子系统（简单 `requestAnimationFrame`）：
  - 春季：粉色花瓣飘落
  - 夏季：黄色光线闪耀
  - 秋季：橙色落叶飘落
  - 冬季：白色雪花飘落

**验证：** 看到当前季节风格，粒子动画运行

---

## Phase 5: 交互增强 (MVP+)

**目标：** 搜索角色、历史回退、导出截图、实时刷新

### Task 5.1: 搜索功能

**文件：** `frontend/index.html` (追加)

实现要点：
- 顶栏搜索框，输入名字/职业实时过滤
- 下拉列表显示匹配角色，点击跳转并高亮
- `Ctrl+F` 快捷键聚焦搜索

### Task 5.2: 时间滑块

**文件：** `frontend/index.html` (追加)

实现要点：
- 底部时间滑块（Year 0 → Year 20）
- 拖动时显示年份
- 基础版本：跳转到该年份的快照（`snapshots` 字段中查找）
- 简化版：跳过快照，直接显示当前

### Task 5.3: 全屏 + 导出

**文件：** `frontend/index.html` (追加)

实现要点：
- 顶栏全屏按钮 → `document.documentElement.requestFullscreen()`
- 导出截图：`canvas.toDataURL()` → 创建下载链接

---

## 实施顺序

```
Phase 0 (骨架) → Phase 1 (地图) → Phase 2 (精灵) → 
Phase 3 (居民面板) → Phase 4 (编年史+仪表盘+季节) → 
Phase 5 (搜索+历史+全屏)
```

**依赖关系：**
- Phase 0 是所有后续的基础
- Phase 1 (地图) 是 Phase 2 (精灵) 的前提
- Phase 2 (精灵) 是 Phase 3 (居民面板) 的前提
- Phase 4 (编年史+仪表盘) 独立于 Phase 3
- Phase 5 独立，可最后做

---

## 测试验证

| 阶段 | 验证方法 | 预期结果 |
|------|---------|---------|
| Phase 0 | 浏览器打开 index.html | 布局骨架可见，控制台输出 parsed JSON |
| Phase 1 | 查看地图区 | 55×50 彩色地形网格，可拖动缩放 |
| Phase 2 | 查看地图区 | 11 座建筑 + 33 个小人可见 |
| Phase 3 | 点击角色 | 弹出完整居民信息面板 |
| Phase 4 | 查看侧栏 | 编年史 + 仪表盘数据准确，季节效果正确 |
| Phase 5 | 测试搜索/全屏/导出 | 功能正常 |

---

## 排期估算

- Phase 0 + Phase 1: 一次会话
- Phase 2: 一次会话
- Phase 3 + Phase 4: 一次会话
- Phase 5: 一次会话

**总计：约 4 次会话完成 MVP**
