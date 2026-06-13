# 桃源镇前端像素风格改造 Plan

## 心跳协议
- Heartbeat: `touch /tmp/hermes-heartbeat` 每步更新
- 待办清单: `~/.hermes/pending-tasks.md` 实时维护
- 如果中断，cron（每10分钟）检测到 stale heartbeat + 非空 pending-tasks → 唤醒继续

## 总体思路
**不做全量重写。** 在现有 1937 行单 HTML 上增量改造渲染层：
1. 在初始化时生成 48×48 像素精灵缓存（角色、建筑、瓦片）
2. 替换 drawAgent/drawBuilding 为精灵表渲染
3. 加入动画循环 + 视觉升级

## 实施步法

### Step 0: 侦察（~2分钟）
- [x] 读 Alicization Town game.js (1512行) 了解精灵表加载方式
- [x] 读完整前端 (1937行) 了解当前架构
- [x] 分析数据 JSON 结构

### Step 1: 精灵生成系统（核心）
- 在 `loadData()` 后/`init()` 中插入 SpriteGenerator 模块
- 角色精灵：48×48 offscreen canvas，预渲染所有方向+帧
  - 头部/身体/下肢分层，不同职业+发色变体
  - 4方向 × 4帧（待机+行走）
- 建筑精灵：48×48，按类型+等级渲染
  - level 1: 简陋小房 → level 3: 华丽大宅
- 瓦片精灵：地面/草地/路径/水
- 环境装饰：树、花、栅栏

### Step 2: 渲染引擎重写
- 保留现有 map/topbar/panel DOM 结构
- 重写 `drawAgent()` → 使用精灵表 + 平滑移动插值
- 重写 `drawBuilding()` → 使用建筑精灵 + 等级变化
- 重写 `drawTile()` → 环境瓦片 + 过渡混合
- 昼夜循环: canvas 叠加半透明遮罩
- 季节色调: 整体颜色偏移
- agent 动画: requestAnimationFrame 驱动，呼吸/闲逛/社交

### Step 3: 交互增强
- 建筑点击 → 详情弹窗（类型/等级/产量）
- 角色悬停 → 名字/状态 tooltip
- 资源面板（精简：人口/食物/木材/科技/信仰）
- 右下通知流（事件/死亡/发现）

### Step 4: 验证
- 在浏览器打开，截图对比改造前后
- 检查所有面板功能正常
- 检查动画流畅度

## 技术决策
- **单文件策略**：保持 index.html 单文件，所有 JS/CSS 内联
- **精灵源**：程序化生成（canvas offscreen），不依赖外部 PNG
- **Pixelify Sans**：保持 CDN 字体引用
- **性能**：48×48 精灵预渲染缓存，不每帧重新绘制精灵
