# Phase 3: 开源像素游戏研究分析报告

> 研究时间: 2026-06-12 04:30 CST
> 目标: 为桃源镇 Living Town 前端像素渲染查找最佳实践与参考实现

---

## 一、主要参考项目

### 1.1 Alicization-Town（本地直接参考）

| 项目 | 值 |
|------|-----|
| 位置 | `/home/ching/alicization-town/server/web/` |
| 前端引擎 | 72KB JavaScript (game.js) |
| 地图格式 | Tiled TMJ (50×55, 16px tiles, 7 layers) |
| 角色精灵 | 12种 PNG 精灵表 (Boy, Girl, Samurai, Villager 等) |
| 图块集 | 9种 (Desert, Field, Floor, House, Nature, Water 等) |
| 动画装饰 | FlagRed, Flower, WaterRipple |
| 粒子效果 | Leaf, LeafPink, Spark, Firefly |
| 动物NPC | Cat, Dog, Frog (区域绑定生成) |
| 音效 | interact, chat, magic, heal (WAV) |
| 背景音乐 | 36-Village.ogg |

**可复用的关键技术:**
- **多层 TMJ 地图渲染** — BaseFloor → Floor → BaseNature 分层绘制，Y-sort 角色遮挡
- **Camera 系统** — 拖拽/滚轮/触摸/pinch-zoom/跟随模式/viewport 限制
- **昼夜循环** — 基于本地时间的 Canvas 遮罩 (日出/白天/黄昏/夜晚各阶段)
- **粒子系统** — 萤火虫(夜晚)、落叶(树下)、水面闪烁(池塘)
- **Tiled GID 翻转处理** — 位运算处理水平/垂直/对角线翻转 + 90°旋转
- **轨迹渲染** — 玩家移动路径淡出效果
- **区域高亮** — 选中玩家所在区域脉冲边框
- **Hover 信息卡** — Canvas 直接绘制悬浮卡片(头像+名称+区域+状态)
- **聊天气泡** — 角色头顶动态表情+消息气泡

### 1.2 Heartbeat Town (心动小镇)

| 项目 | 值 |
|------|-----|
| 仓库 | kangarooking/heartbeat-town |
| 许可 | MIT License |
| 引擎 | 原生 JavaScript + HTML5 Canvas |
| 特点 | WASD 移动、NPC 对话、种植/收集、室内场景、背包、快捷栏、小地图、昼夜 |

**可借鉴的设计:**
- 像素小镇生活游戏的完整技术栈
- 室内/室外场景切换
- 物品系统与库存 UI
- AI NPC 对话（OpenAI-compatible API 可选）
- 本地 Python 静态服务 + AI 代理

### 1.3 其他参考

| 项目 | ⭐ | 说明 |
|------|---|------|
| idimetrix/pixel-game | 9 | 8bit Painter, Canvas 2D/3D 像素艺术工具 |
| pmateosx/Pixel-Keys | 7 | Canvas 像素冒险游戏，含地图移动与战斗 |
| theatrejs/theatrejs | 4 | JavaScript 2D 游戏引擎，专注像素艺术游戏 |
| subatomicglue/sprite_demo_js | - | Canvas sprite tile map 渲染基础教程 |

---

## 二、现有前端代码评估

### 当前 Town-of-Peace 前端状态

| 组件 | 状态 | 行数 | 说明 |
|------|------|------|------|
| `game.js` | ✅ 基础版 | 495行 | Canvas 渲染 + Camera + 程序化角色绘制 |
| `game.css` | ✅ 完整 | 282行 | 暗色像素风 UI 样式 |
| `index.html` | ✅ 基础版 | 90行 | 加载/游戏容器/侧边栏/底部栏结构 |
| `network.js` | ✅ 基础版 | ~80行 | Socket.IO 实时通信 |
| `ui.js` | ✅ 基础版 | - | Modal/侧边栏/统计面板 |

### 当前渲染能力

- ✅ Canvas 800×600 地图渲染（简单地形颜色网格）
- ✅ Camera 拖拽/缩放/跟随
- ✅ 程序化 16×16 像素角色（皮肤→头发→眼睛→衣服）
- ✅ 情绪指示器（😊/😰）
- ✅ Hover 信息卡（名称+头衔+状态）
- ✅ 迷你地图 + viewport 框
- ✅ 建筑简单绘制（box + 屋顶三角）
- ⬜ **缺失: Tiled TMJ 地图加载**（当前只有程序化地形颜色）
- ⬜ **缺失: 精灵表 sprite sheet 绘制**
- ⬜ **缺失: 粒子系统（天气/季节/萤火虫）**
- ⬜ **缺失: 昼夜循环叠加**
- ⬜ **缺失: 角色行走动画帧**
- ⬜ **缺失: 音效/BGM**

---

## 三、技术改进建议

### 3.1 优先级 P0（Phase 4 实施）

1. **TMJ/Tiled 地图渲染器**
   - 从 Alicization-Town 移植 `drawTile()` 函数
   - 支持多层 tilelayer + objectgroup
   - 支持 GID flip/rotation
   - 需要: tileset PNG 图片资源

2. **精灵表角色渲染**
   - 支持 sprite sheet (4方向 × 4帧 = 16帧)
   - 使用 `imageSmoothingEnabled=false` 保持像素清晰
   - Y-sort 绘制顺序

3. **粒子系统**
   - 移植 Alicization 粒子代码
   - 萤火虫（夜晚自动生成）
   - 落叶（树下区域）
   - 水面闪烁（池塘区域）

### 3.2 优先级 P1（Phase 4-5 改进）

4. **昼夜循环覆盖层**
   - 基于服务器 `gameMinute` 计算亮度
   - Canvas 半透明遮罩（晨/昼/暮/夜四段）
   - 日出日落颜色过渡

5. **角色动画**
   - 行走 4 帧动画循环
   - 待机呼吸/眨眼动画
   - 工作动画（根据当前 activity）

6. **音效系统**
   - 背景音乐循环
   - 交互/事件音效（可选）
   - 从 Alicization 移植 sfx toggle

### 3.3 资源需求

| 资源 | 来源 | 状态 |
|------|------|------|
| tileset PNG | 从 Alicization-Town 复制或 CC0 资源 | ⬜ 需要 |
| character sprite sheets | Alicization 有 12 种，或 Kenney.nl | ⬜ 需要 |
| 音效文件 | Alicization 有 WAV | ⬜ 可用 |
| BGM | Alicization 有 OGG | ⬜ 可用 |
| 地图 TMJ | 从存档数据生成或手动创建 | ⬜ 需要 |
| 像素字体 | Pixelify Sans (Google Fonts) | ✅ 已有 |

---

## 四、结论

**Alicization-Town 是当前最佳的直接代码参考**，它已经实现了以下桃源镇需要的所有核心像素渲染技术:
- Tiled 地图加载与分层渲染
- 精灵角色与动画
- Camera 系统
- 粒子与昼夜效果
- 实时多人活动跟踪

建议在 Phase 4 中优先将 Alicization-Town 的渲染引擎适配到 Town-of-Peace 的前端，替换当前程序化地形/角色的简单实现，同时保留已有的网络层、UI 层和 Socket.IO 实时通信。

> 本阶段研究内容将作为 Phase 4-5 完善方案与飞书文档的输入参考。
