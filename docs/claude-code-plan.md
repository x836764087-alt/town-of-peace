# 桃源镇 LIVING TOWN 需求与设计文档（通宵开发蓝图）

> 版本：v1.0（Plan Mode）  
> 依据文档：
> - `/home/ching/.hermes/plans/town-of-peace-live-transformation.md`
> - `/home/ching/town-of-peace/frontend/index.html`
> - `/home/ching/alicization-town/server/web/js/game.js`
> - `/home/ching/alicization-town/server/web/css/game.css`
> - `/home/ching/alicization-town/server/src/engine/world-engine.js`
> - `/home/ching/town-of-peace/data/saves/last-save.json`

---

## 0. 目标与范围

### 0.1 产品目标

把当前离线存档播放器改造成 **LIVING TOWN**：

1. 后端 Node.js 服务持续运行，世界时间按现实时间推进。
2. 居民由 LLM（SiliconFlow Nex-N2-Pro）辅助决策，具备日常需求、社交、记忆与关系演化。
3. 前端使用 Canvas 单页实时围观小镇：地图、居民、建筑、天气、昼夜、编年史、活动日志。
4. 保留现有存档的数据资产，迁移 33 名居民、11 栋建筑、编年史、经济、创新、节日、法律、文化记忆等。
5. 无 LLM、API 限流、断线、重启等情况下，世界仍能 deterministic fallback 运行。

### 0.2 当前代码可复用点

#### 现有桃源镇前端（`frontend/index.html`）

- 数据模型来自 `data/last-save.json`：
  - 顶层：`year`, `season`, `weather`, `agents`, `economy`, `buildings`, `map`, `innovations`, `laws`, `festivals`, `groups`, `archives`, `relations`, `seed`, `chronicle`, `snapshots`, `cultureValue`, `oralTraditions`, `artworks`, `placeNames`。
  - 居民：`id`, `name`, `title`, `age`, `alive`, `gender`, `stats`, `skills`, `inventory`, `relationships`, `family`, `conditions`, `memories`, `biography`, `x`, `y`, `currentBuilding`。
  - 建筑：`id`, `name`, `type`, `x`, `y`, `description`, `level`, `ownerId`, `builtYear`。
- 渲染方式：
  - 单 Canvas + 静态 offscreen terrain canvas。
  - 地图来自 `map.tiles[row][col]`，tile 类型包括 `plains`, `forest`, `water`, `mountain`, `farmland`, `road`, `desert`, `tundra`。
  - 居民用程序化 16x16 像素网格精灵渲染，带方向、帧、眨眼、移动、社交气泡。
  - UI：顶部时间、右侧编年史/关系图、仪表盘、居民详情 Modal、搜索、通知、季节粒子、萤火虫、彩纸。
- 可迁移为新版 Canvas 渲染层的视觉风格、配色、HUD 信息密度、Modal 内容结构。

#### Alicization-Town 参考

- `server/web/js/game.js`：
  - Tiled TMJ 地图加载、tileset 绘制、Tiled GID flip/rotation 处理。
  - Camera 系统：拖拽、滚轮、触摸、小地图点击、跟随模式。
  - Y-sort 角色绘制、hover card、选中高亮、活动日志、AI 列表、小地图。
  - EventSource 实时接收状态、聊天、交互、活动。
- `server/web/css/game.css`：
  - 像素风 UI、侧边栏、状态点、AI panel、聊天日志、loading screen。
- `server/src/engine/world-engine.js`：
  - TMJ 加载后生成 collision map。
  - SemanticZones/objectgroup 生成 `mapDirectory`。
  - A* 寻路、move/chat/interact/look 等动作。
  - 玩家 presence、heartbeat、cleanup timer、broadcast/event emitter。
  - 可作为世界引擎、地图/区域、活动广播、路径系统的架构参考。

---

## 1. 需求分析

### 1.1 MUST

| ID | 需求 | 验收标准 | 边界/错误处理 |
|---|---|---|---|
| M-001 | 后端持续运行 | `server/main.js` 启动 Express 5 + Socket.IO，默认 2s heartbeat，世界时间按配置推进 | 服务启动失败需写日志并退出非 0；端口占用返回清晰错误 |
| M-002 | 现实时间加速 | 支持 `REAL_WEEKS_PER_GAME_YEAR=1`，按 `gameMinute = startMinute + elapsedMs * gameMinutesPerRealMs` 推进 | 服务器停机恢复时 catch-up 有上限，避免一次性补跑数月 |
| M-003 | 2 秒 tick | 每 2s 执行 tick：推进时间、触发例行行为、更新世界、广播 delta | tick 超时不能阻塞下一 tick；使用 `Promise.allSettled` 与并发限额 |
| M-004 | AI 居民决策 | 每名居民有 needs、plan、cooldown、LLM fallback；LLM 返回结构化 JSON | LLM 超时/429/5xx 时使用 Utility AI fallback，并记录 `llm_jobs.error` |
| M-005 | SQLite 持久化 | 所有关键状态写入 SQLite：居民、建筑、关系、记忆、编年史、世界状态、LLM 任务 | 写失败重试；事务失败回滚；数据库损坏启动时拒绝进入 tick |
| M-006 | Socket.IO 实时前端 | 浏览器打开即可看到地图、居民移动、编年史、活动日志实时更新 | 断线重连发送 snapshot；事件 schema validation 失败只记录 error，不广播脏数据 |
| M-007 | Canvas 像素前端 | 单 HTML 加载 TMJ 地图、tileset、sprite sheet，支持 Camera 拖拽/缩放/跟随 | 资源加载失败显示占位图与 loading error；Canvas 不可用时显示降级 DOM 状态 |
| M-008 | 现有存档迁移 | `last-save.json` 可一键导入，迁移 33 名居民、11 栋建筑、chronicle、economy 等 | 缺字段使用默认值；重复 ID 拒绝或加 suffix；迁移前 dry-run 输出冲突报告 |
| M-009 | 编年史与活动日志 | 关键事件写入 `chronicles`，实时活动写入 `events/activity_log` | 编年史限流，避免每 tick 写入；重复事件通过 `event_key` 去重 |
| M-010 | 性能与资源保护 | 60fps 前端渲染、后端 LLM 并发限额、SQLite WAL、批处理写入 | 无连接时进入 low-power 模式；LLM 队列满时降级为 fallback |

### 1.2 SHOULD

| ID | 需求 | 说明 |
|---|---|---|
| S-001 | 小地图与区域导航 | 复用 Alicization 小地图点击定位、viewport 框、区域高亮 |
| S-002 | 居民详情面板 | 显示 stats、skills、needs、关系、记忆、当前计划、最近活动 |
| S-003 | 天气/季节/昼夜 | 服务器权威天气，前端按季节/天气渲染粒子与遮罩 |
| S-004 | 关系演化 | 互动后更新双向关系分、标签、最近互动时间 |
| S-005 | 经济轻模拟 | 资源产出、交易、货币总量、价格历史，每游戏日结算 |
| S-006 | 史官系统 | 每日/事件驱动生成编年史，支持 severity 分级 |
| S-007 | 管理端基础 API | pause/resume、speed、trigger LLM、flush failed jobs |
| S-008 | 可观测性 | `/api/health`, `/api/admin/metrics`, 结构化日志 |
| S-009 | 前端虚拟列表 | 居民列表、编年史、活动日志使用 limit/virtualization |
| S-010 | 存档快照 | 每游戏日或每现实 30 分钟写快照，支持 rollback |

### 1.3 COULD

| ID | 需求 | 说明 |
|---|---|---|
| C-001 | 围观者昵称 | 只读观察者可选昵称，不参与世界状态 |
| C-002 | 多浏览器同步围观 | 多个浏览器同时看同一世界，通过 Socket.IO room 广播 |
| C-003 | 语音/音效开关 | 复用 Alicization SFX/BGM 思路，但默认关闭 |
| C-004 | 居民日记 | 每日生成短日记，进入记忆摘要 |
| C-005 | 传说/艺术演化 | 迁移 `oralTraditions`, `artworks`, `cultureValue`，在编年史中体现 |
| C-006 | 手动干预 | 管理员可临时设置天气、触发节日、调整速度 |
| C-007 | 离线导出 | 定期导出 JSON snapshot，兼容旧前端播放 |

---

## 2. 数据模型设计（SQLite）

### 2.1 设计原则

1. `world_state` 保存全局权威状态；实体表保存居民/建筑/关系/记忆等。
2. JSON 字段用于复杂对象，但查询关键字段必须拆列并建索引。
3. 所有时间统一存：
   - `game_minute`：从世界起点累计分钟。
   - `real_time`：ISO 或 unix ms。
4. 事件与编年史可重放：事件是事实，编年史是叙事摘要。
5. LLM 调用必须持久化 prompt/response/error，便于审计与复现。

### 2.2 Schema

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS world_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  game_minute INTEGER NOT NULL,
  year INTEGER NOT NULL,
  season TEXT NOT NULL CHECK (season IN ('spring','summer','autumn','winter')),
  day_of_year INTEGER NOT NULL CHECK (day_of_year BETWEEN 1 AND 365),
  weather TEXT NOT NULL,
  economy_json TEXT NOT NULL DEFAULT '{}',
  culture_json TEXT NOT NULL DEFAULT '{}',
  population_alive INTEGER NOT NULL DEFAULT 0,
  population_total INTEGER NOT NULL DEFAULT 0,
  map_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  w INTEGER NOT NULL,
  h INTEGER NOT NULL,
  navigable INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL,
  gender TEXT NOT NULL DEFAULT '',
  alive INTEGER NOT NULL DEFAULT 1,
  x REAL NOT NULL,
  y REAL NOT NULL,
  current_zone_id TEXT,
  current_building_id TEXT,
  stats_json TEXT NOT NULL DEFAULT '{}',
  skills_json TEXT NOT NULL DEFAULT '{}',
  persona_json TEXT NOT NULL DEFAULT '{}',
  needs_json TEXT NOT NULL DEFAULT '{}',
  inventory_json TEXT NOT NULL DEFAULT '{}',
  wealth INTEGER NOT NULL DEFAULT 0,
  current_plan_json TEXT NOT NULL DEFAULT '{}',
  ai_state_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (current_zone_id) REFERENCES zones(id) ON DELETE SET NULL,
  FOREIGN KEY (current_building_id) REFERENCES buildings(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1,
  owner_id TEXT,
  built_year INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agent_family_links (
  agent_id TEXT NOT NULL,
  related_agent_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('spouse','child','parent','household')),
  PRIMARY KEY (agent_id, related_agent_id, relation_type),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (related_agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_a TEXT NOT NULL,
  agent_b TEXT NOT NULL,
  affinity INTEGER NOT NULL DEFAULT 0 CHECK (affinity BETWEEN -100 AND 100),
  trust REAL NOT NULL DEFAULT 0 CHECK (trust BETWEEN -1 AND 1),
  rivalry REAL NOT NULL DEFAULT 0 CHECK (rivalry BETWEEN 0 AND 1),
  tags_json TEXT NOT NULL DEFAULT '[]',
  last_interaction_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_a, agent_b),
  FOREIGN KEY (agent_a) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_b) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  game_minute INTEGER NOT NULL,
  year INTEGER NOT NULL,
  day_of_year INTEGER NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  source_event_id INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_biographies (
  agent_id TEXT PRIMARY KEY,
  persona_json TEXT NOT NULL DEFAULT '{}',
  timeline_json TEXT NOT NULL DEFAULT '[]',
  obituary_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_minute INTEGER NOT NULL,
  type TEXT NOT NULL,
  event_key TEXT,
  actor_id TEXT,
  target_id TEXT,
  zone_id TEXT,
  building_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(event_key)
);

CREATE TABLE IF NOT EXISTS chronicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_minute INTEGER NOT NULL,
  year INTEGER NOT NULL,
  day_of_year INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('epochal','dramatic','notable','peaceful')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  actor_ids_json TEXT NOT NULL DEFAULT '[]',
  building_ids_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_event_id INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS llm_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT,
  job_type TEXT NOT NULL CHECK (job_type IN ('decision','dialogue','scribe','summarize')),
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  prompt_json TEXT NOT NULL,
  response_json TEXT,
  decision_json TEXT,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('dry_run','applied','failed')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at INTEGER NOT NULL,
  applied_at INTEGER
);

CREATE INDEX idx_agents_zone ON agents(current_zone_id);
CREATE INDEX idx_agents_building ON agents(current_building_id);
CREATE INDEX idx_events_type_time ON events(type, game_minute);
CREATE INDEX idx_chronicles_time ON chronicles(game_minute DESC);
CREATE INDEX idx_memories_agent_time ON agent_memories(agent_id, game_minute DESC);
CREATE INDEX idx_relationships_pair ON relationships(agent_a, agent_b);
CREATE INDEX idx_llm_jobs_status ON llm_jobs(status, priority DESC);
```

### 2.3 TypeScript 类型定义

```ts
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'stormy';
export type Severity = 'epochal' | 'dramatic' | 'notable' | 'peaceful';
export type Direction = 'N' | 'S' | 'E' | 'W';
export type PresenceState = 'active' | 'thinking' | 'idle' | 'sleeping' | 'offline';

export interface Vec2 {
  x: number;
  y: number;
}

export interface WorldSnapshot {
  schemaVersion: number;
  world: WorldState;
  map: TiledMap;
  zones: Zone[];
  agents: AgentSnapshot[];
  buildings: BuildingSnapshot[];
  economy: EconomyState;
  culture: CultureState;
  recentEvents: GameEvent[];
  recentChronicles: Chronicle[];
  serverTime: number;
}

export interface WorldState {
  gameMinute: number;
  year: number;
  season: Season;
  dayOfYear: number;
  hour: number;
  minute: number;
  weather: Weather;
  populationAlive: number;
  populationTotal: number;
  mapVersion: string;
}

export interface AgentSnapshot {
  id: string;
  name: string;
  title: string;
  age: number;
  gender: string;
  alive: boolean;
  position: Vec2;
  direction: Direction;
  currentZoneId?: string;
  currentBuildingId?: string;
  stats: AgentStats;
  skills: Record<string, number>;
  needs: AgentNeeds;
  inventory: Record<string, number>;
  wealth: number;
  persona: Persona;
  currentPlan?: AgentPlan;
  presence: PresenceState;
  lastActionAt: number;
  updatedAt: number;
}

export interface AgentStats {
  strength: number;
  intelligence: number;
  dexterity: number;
  charisma: number;
  health: number;
  maxHealth: number;
  energy: number;
  happiness: number;
}

export interface AgentNeeds {
  hunger: number;        // 0 full, 100 starving
  fatigue: number;       // 0 rested, 100 exhausted
  social: number;        // 0 connected, 100 lonely
  safety: number;        // 0 safe, 100 danger
}

export interface Persona {
  traits: string[];
  values: string[];
  motto?: string;
  narrativeArc: string;
}

export interface AgentPlan {
  action: AgentActionType;
  targetId?: string;
  targetPosition?: Vec2;
  reason: string;
  durationMinutes: number;
  startedAtGameMinute: number;
}

export type AgentActionType =
  | 'sleep'
  | 'eat'
  | 'work'
  | 'socialize'
  | 'explore'
  | 'trade'
  | 'rest'
  | 'move'
  | 'wait';

export interface BuildingSnapshot {
  id: string;
  name: string;
  type: string;
  position: Vec2;
  description: string;
  level: number;
  ownerId?: string;
  builtYear: number;
}

export interface Zone {
  id: string;
  name: string;
  category: string;
  bounds: { x: number; y: number; w: number; h: number };
  navigable: boolean;
  description: string;
}

export interface EconomyState {
  totalCurrency: number;
  annualTradeVolume: number;
  annualSpoilage: number;
  priceHistory: Record<string, number[]>;
  priceCaps: Record<string, number>;
}

export interface CultureState {
  cultureValue: number;
  oralTraditions: string[];
  artworks: string[];
  placeNames: string[];
}

export interface GameEvent {
  id: number;
  gameMinute: number;
  type: string;
  actorId?: string;
  targetId?: string;
  zoneId?: string;
  buildingId?: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: number;
}

export interface Chronicle {
  id: number;
  gameMinute: number;
  year: number;
  dayOfYear: number;
  severity: Severity;
  title: string;
  content: string;
  actorIds: string[];
  buildingIds: string[];
  tags: string[];
}

export interface LlmDecisionResponse {
  ok: true;
  action: AgentActionType;
  targetId?: string;
  targetPosition?: Vec2;
  durationMinutes: number;
  reason: string;
  emotion?: string;
  memoryNote?: string;
  confidence: number;
}

export interface LlmDecisionFallback {
  ok: false;
  reason: 'timeout' | 'rate_limit' | 'invalid_response' | 'server_error' | 'disabled';
  action: AgentActionType;
  targetId?: string;
  targetPosition?: Vec2;
  durationMinutes: number;
  reasonText: string;
}
```

---

## 3. API 设计

### 3.1 REST 端点

| Method | Endpoint | 用途 | 请求 | 响应 | 错误 |
|---|---|---|---|---|---|
| GET | `/api/health` | 健康检查 | — | `{ok:true, uptime, gameMinute, llmQueue}` | 503 如果 DB 不可用 |
| GET | `/api/world/snapshot` | 初始化前端状态 | — | `WorldSnapshot` | 500 DB/read map error |
| GET | `/api/world/state?sinceGameMinute=123` | 增量状态 | query | `{world, agentDeltas, buildingDeltas, events, chronicles}` | 400 since 非法 |
| GET | `/api/map` | Tiled 地图 | — | TMJ JSON | 404 map 缺失 |
| GET | `/api/agents` | 居民列表 | `?alive=true&limit=100` | `AgentSnapshot[]` | — |
| GET | `/api/agents/:id` | 居民详情 | — | `AgentSnapshot` + memories | 404 |
| GET | `/api/agents/:id/memories?limit=50` | 记忆 | — | `agent_memories[]` | 404 |
| GET | `/api/buildings` | 建筑列表 | — | `BuildingSnapshot[]` | — |
| GET | `/api/buildings/:id` | 建筑详情 | — | `BuildingSnapshot` | 404 |
| GET | `/api/chronicles?limit=100&sinceGameMinute=123` | 编年史 | query | `Chronicle[]` | 400 |
| GET | `/api/events?limit=200&sinceGameMinute=123` | 活动日志 | query | `GameEvent[]` | 400 |
| POST | `/api/admin/time/pause` | 暂停时间 | — | `{paused:true}` | 403 未授权 |
| POST | `/api/admin/time/resume` | 恢复时间 | `{catchUpLimitMinutes?: 1440}` | `{paused:false}` | 400 catchUp 非法 |
| POST | `/api/admin/time/speed` | 调整速度 | `{realSecondsPerGameDay: 1666}` | `{speed:...}` | 400 越界 |
| POST | `/api/admin/ai/trigger` | 手动触发 LLM | `{agentId, priority?: 2}` | `{queued:true, jobId}` | 404/429 queue full |
| GET | `/api/admin/metrics` | 运行指标 | — | `{tickMs, llmQueue, dbSize, fps?}` | 403 |
| POST | `/api/admin/migrations/last-save/dry-run` | 迁移预检 | multipart/file or body hash | `{conflicts, counts}` | 400 JSON 非法 |
| POST | `/api/admin/migrations/last-save/apply` | 应用迁移 | `{sourceHash, mode:'merge'|'replace'}` | `{ok:true, migrationId}` | 409 已迁移 |

### 3.2 Socket.IO 事件

#### Client → Server

```ts
type ClientSocketEvents = {
  'client:hello': (payload: { schemaVersion: number; viewport?: { w: number; h: number } }) => void;
  'world:snapshot:request': () => void;
  'agent:select': (payload: { agentId: string }) => void;
  'camera:follow': (payload: { agentId?: string; zoneId?: string }) => void;
  'admin:time:setSpeed': (payload: { realSecondsPerGameDay: number }) => void;
  'admin:ai:trigger': (payload: { agentId: string; priority?: number }) => void;
};
```

#### Server → Client

```ts
type ServerSocketEvents = {
  'server:hello': (payload: { schemaVersion: number; serverTime: number }) => void;
  'world:snapshot': (payload: WorldSnapshot) => void;
  'world:tick': (payload: {
    gameMinute: number;
    year: number;
    season: Season;
    dayOfYear: number;
    hour: number;
    minute: number;
    weather: Weather;
  }) => void;
  'agent:delta': (payload: {
    agents: Array<{
      id: string;
      position?: Vec2;
      direction?: Direction;
      currentZoneId?: string;
      currentBuildingId?: string;
      needs?: AgentNeeds;
      currentPlan?: AgentPlan;
      presence?: PresenceState;
      updatedAt: number;
    }>;
  }) => void;
  'agent:thinking': (payload: { agentId: string; isThinking: boolean; reason?: string }) => void;
  'agent:action': (payload: {
    eventId: number;
    agentId: string;
    action: AgentActionType;
    targetId?: string;
    zoneId?: string;
    text: string;
  }) => void;
  'building:delta': (payload: { buildings: BuildingSnapshot[] }) => void;
  'economy:delta': (payload: EconomyState) => void;
  'weather:changed': (payload: { weather: Weather }) => void;
  'season:changed': (payload: { season: Season }) => void;
  'event:new': (payload: GameEvent) => void;
  'chronicle:new': (payload: Chronicle) => void;
  'relationship:changed': (payload: {
    agentA: string;
    agentB: string;
    affinity: number;
    trust: number;
    rivalry: number;
  }) => void;
  'error': (payload: { code: string; message: string; retryable: boolean }) => void;
};
```

### 3.3 Payload 示例

#### `world:snapshot`

```json
{
  "schemaVersion": 1,
  "world": {
    "gameMinute": 10080,
    "year": 20,
    "season": "spring",
    "dayOfYear": 91,
    "hour": 8,
    "minute": 0,
    "weather": "sunny",
    "populationAlive": 33,
    "populationTotal": 33,
    "mapVersion": "taoyuan-v1"
  },
  "map": { "width": 50, "height": 55, "tilewidth": 28, "tileheight": 28, "layers": [] },
  "zones": [],
  "agents": [],
  "buildings": [],
  "economy": {
    "totalCurrency": 640,
    "annualTradeVolume": 9497,
    "annualSpoilage": 0,
    "priceHistory": {},
    "priceCaps": {}
  },
  "culture": {
    "cultureValue": 0,
    "oralTraditions": [],
    "artworks": [],
    "placeNames": []
  },
  "recentEvents": [],
  "recentChronicles": [],
  "serverTime": 1781230000000
}
```

#### LLM decision prompt context

```json
{
  "agent": {
    "id": "zhao-changhe",
    "name": "赵长河",
    "title": "里正",
    "age": 65,
    "persona": {
      "traits": ["平凡", "温和"],
      "values": ["随遇而安"],
      "motto": "日子总要过下去。"
    },
    "stats": { "health": 65, "energy": 10, "happiness": 100 },
    "needs": { "hunger": 35, "fatigue": 70, "social": 20, "safety": 5 },
    "inventory": { "rice": 40, "noodle": 0, "tools": 0 }
  },
  "world": {
    "year": 20,
    "season": "spring",
    "hour": 8,
    "weather": "sunny"
  },
  "nearbyAgents": [
    { "id": "ma-xiuying", "name": "马秀英", "distance": 2, "relationship": 98 }
  ],
  "availableActions": ["sleep", "eat", "work", "socialize", "explore", "trade", "move"],
  "instruction": "只返回 JSON，不要解释。若无法决定，选择最安全的日常行动。"
}
```

#### LLM decision response

```json
{
  "ok": true,
  "action": "socialize",
  "targetId": "ma-xiuying",
  "durationMinutes": 45,
  "reason": "上午精力尚可，配偶关系亲近，适合先交流家事再安排农活。",
  "emotion": "平和",
  "memoryNote": "和马秀英在春日早晨聊了家里的安排。",
  "confidence": 0.82
}
```

---

## 4. 组件架构

### 4.1 后端目录

```txt
server/
  main.js                  # Express 5 + Socket.IO + scheduler bootstrap
  routes.js                # REST routes
  engine/
    world-engine.js        # tick loop, state aggregation, broadcast
    time-system.js         # gameMinute/year/season/day/hour/weather
    world-evolution.js     # building aging, resources, festivals
    pathfinding.js         # A* / nearest walkable
    economy.js             # daily economy settlement
  agents/
    agent-engine.js        # decision scheduling + action execution
    agent-state.js         # needs, presence, plan
    agent-memory.js        # memory insert/summarize
    agent-relationships.js # relationship update
    character-defs.js      # sprite/persona mapping
  ai/
    llm-client.js          # SiliconFlow OpenAI-compatible client
    key-pool.js            # key rotation + 429 backoff
    prompts.js             # decision/dialogue/scribe prompts
  narrative/
    scribe.js              # chronicle generation
  persistence/
    store.js               # SQLite wrapper
    migrations.js          # last-save importer
  web/
    index.html
    css/game.css
    js/
      game.js
      camera.js
      renderer.js
      network.js
      ui.js
      store.js
    assets/map.tmj
    assets/sprites/
```

### 4.2 前端架构

```txt
GameApp
 ├─ NetworkClient (Socket.IO)
 ├─ ClientStore (normalised entities + recent events)
 ├─ MapLoader (TMJ + tilesets)
 ├─ SpriteAtlas (resident/building sprites)
 ├─ Renderer
 │   ├─ LayerRenderer (BaseFloor/Floor/BaseNature/Nature/Building/BuildingTop)
 │   ├─ EntityRenderer (Y-sort agents/buildings)
 │   ├─ ParticleSystem
 │   └─ OverlayRenderer (hover cards, selection, labels)
 ├─ CameraController
 ├─ UIController
 │   ├─ TopBar
 │   ├─ Sidebar
 │   ├─ AgentPanel
 │   ├─ ChronicleFeed
 │   ├─ ActivityLog
 │   ├─ Minimap
 │   └─ Toasts
 └─ InputController (mouse/touch/keyboard)
```

### 4.3 渲染管线

1. `MapLoader.load('/api/map')`
   - 解析 TMJ layers。
   - 缓存 tileset images。
   - 生成 collision map 与 zone directory。
2. `Renderer.prepareStaticLayers()`
   - 对静态底层 `BaseFloor`, `Floor`, `BaseNature` 绘制到 offscreen canvas。
   - 对大型地图只做视口内 tile 绘制或分层缓存。
3. 每帧 `requestAnimationFrame`：
   - 更新 Camera smoothing。
   - 更新 entity interpolation：`display += (target - display) * min(1, dt * 8)`。
   - 清空主 Canvas。
   - 绘制静态层。
   - 绘制动态装饰、NPC 动物、建筑底座。
   - 按 `position.y` 排序绘制 agents 与遮挡建筑。
   - 绘制上层自然、建筑顶层。
   - 绘制天气/昼夜/季节 overlay。
   - 绘制屏幕层：hover card、selection ring、tooltip。
4. Socket delta 只更新 `ClientStore.target`，不直接重绘 DOM。
5. DOM 只更新：
   - 顶部时间（秒级或事件驱动）。
   - 编年史/活动日志（新事件追加）。
   - 选中居民详情（选中变化或关键状态变化）。

### 4.4 Camera 系统

- 状态：`x`, `y`, `targetX`, `targetY`, `zoom`, `targetZoom`, `followingAgentId?`。
- 输入：
  - 鼠标拖拽平移。
  - 滚轮缩放，围绕鼠标点缩放。
  - 触摸拖拽与双指 pinch。
  - 小地图点击定位。
  - 点击居民后跟随。
- 约束：
  - `minZoom = max(viewportW/mapPxW, viewportH/mapPxH)`。
  - `maxZoom = 4`。
  - Camera target clamp 到地图边界。
- 跟随模式：
  - target 中心 = agent.display + tile/2 - viewport/(2*zoom)。
  - 用户拖拽/滚轮自动取消 follow。

### 4.5 UI 组件

| 组件 | 数据源 | 说明 |
|---|---|---|
| TopBar | `world` | 年/季/日/时/天气/连接状态/速度 |
| Minimap | `map.zones`, `agents` | 区域、建筑、居民点、viewport 框 |
| ResidentList | `agents` | 搜索、状态点、点击选中 |
| AgentPanel | `AgentSnapshot` | 状态、技能、需求、关系、记忆、当前计划 |
| ChronicleFeed | `chronicles` | severity 图标、年份分组、限流 |
| ActivityLog | `events` | 实时活动、聊天/移动/互动 |
| Toasts | socket `error/event` | 短时通知，最多 3-5 条 |
| Modal | selected agent/building | 详情与最近事件 |

### 4.6 性能考虑

- 前端：
  - 静态地图离屏缓存。
  - 只绘制视口内 tile。
  - 实体按 Y-sort 但限制 DOM 更新频率。
  - 粒子数量上限：昼夜/季节粒子各 40-80。
  - Socket delta 合并：每 250ms flush 一次。
  - 编年史/活动日志只保留最近 N 条，旧数据走 API 分页。
- 后端：
  - SQLite WAL + transaction batching。
  - LLM 并发 `maxConcurrent=2`，每 tick 最多入队 2-3 个决策。
  - 无连接时 low-power：tick 仍运行但降低广播频率与 LLM 频率。
  - 长 tick 不串行阻塞，使用 `setInterval` + `isTicking` guard。
  - 世界 snapshot 缓存 1s，避免每个新连接重算。

---

## 5. 时间系统设计

### 5.1 时间比例

目标约束：**现实 1 周 = 游戏 1 年（365 天）**。

```ts
const REAL_SECONDS_PER_GAME_YEAR = 7 * 24 * 60 * 60;
const GAME_MINUTES_PER_YEAR = 365 * 24 * 60;
const REAL_MS_PER_GAME_MINUTE =
  (REAL_SECONDS_PER_GAME_YEAR * 1000) / GAME_MINUTES_PER_YEAR;
// ≈ 27753.42 ms / game minute
```

若 heartbeat 固定 2 秒：

```ts
const TICK_MS = 2000;
const GAME_MINUTES_PER_TICK = TICK_MS / REAL_MS_PER_GAME_MINUTE;
// ≈ 0.7206 game minutes ≈ 43.24 seconds
```

若希望每次 tick 恰好推进 30 分钟，则 tick 间隔应为：

```ts
const TICK_MS_FOR_30_GAME_MINUTES = 30 * REAL_MS_PER_GAME_MINUTE;
// ≈ 832602 ms ≈ 13.88 分钟
```

因此设计为：

- `TICK_MS` 固定 2s，用于调度、广播、AI 队列。
- `gameMinutesPerTick` 由 `realSecondsPerGameYear` 配置计算。
- 可选 `realSecondsPerGameDay = 1666.2857`（一周/365天）作为默认。

### 5.2 TimeSystem

```ts
interface TimeSystemConfig {
  tickMs: number;                  // default 2000
  startGameMinute: number;         // from last-save year/day/hour
  realSecondsPerGameYear: number;  // default 604800
  maxCatchUpMinutes: number;       // default 1440
}

interface TimeTickResult {
  previousGameMinute: number;
  gameMinute: number;
  advancedMinutes: number;
  caughtUp: boolean;
  seasonChanged: boolean;
  dayChanged: boolean;
  hourChanged: boolean;
}
```

### 5.3 Tick 流程

```ts
async function gameTick() {
  if (worldEngine.isTicking) return;
  worldEngine.isTicking = true;

  try {
    const time = timeSystem.advance();
    await Promise.allSettled([
      routineSystem.onTimeChanged(time),
      agentEngine.enqueueDueDecisions(time),
      worldEvolution.tick(time),
      economy.tickIfDue(time),
      weatherSystem.tickIfDue(time),
    ]);

    await agentEngine.executeReadyActions(time);
    const chronicles = await scribe.tick(time);
    const snapshotDelta = worldEngine.collectDelta();

    store.persistDelta(snapshotDelta);
    worldEngine.broadcastDelta(snapshotDelta, chronicles);
  } catch (err) {
    logger.error('tick failed', err);
  } finally {
    worldEngine.isTicking = false;
  }
}
```

### 5.4 例行行为节点

| 游戏时间 | 行为 |
|---|---|
| 05:00-06:30 | 起床、洗漱、早餐 |
| 08:00-11:30 | 工作/农作/研究/商业 |
| 12:00-13:00 | 午餐/社交 |
| 13:00-17:30 | 下午工作/探索/交易 |
| 18:00-20:00 | 晚餐/家庭/节日 |
| 20:00-22:00 | 社交/讲述/创作 |
| 22:00-05:00 | 睡眠，紧急事件可打断 |

### 5.5 错误与边界

- 服务器停机：
  - 启动时计算 `elapsedMinutes`。
  - 若超过 `maxCatchUpMinutes`，只推进到上限，并生成 `time_jump_limited` event。
- tick 慢：
  - 若 tick 超过 1.5s，跳过非关键广播合并，不叠加执行。
- 跨年/跨季：
  - 先更新 `world_state`，再触发 `season:changed` 与节日逻辑。
- 时间暂停：
  - 仍允许前端连接、查看状态。
  - LLM 决策暂停，除非 admin 手动 trigger。

---

## 6. AI Agent 设计

### 6.1 决策分层

1. **生理/安全层（规则优先）**
   - 健康 < 20、饥饿 > 80、疲劳 > 85、危险天气：直接选择 rest/eat/sleep/shelter。
2. **日程层（Utility AI）**
   - 根据时间、职业、建筑、季节、关系计算候选行动分数。
3. **LLM 层（解释与选择）**
   - 在高价值场景调用：社交冲突、探索、创新、重要关系、低置信度。
4. **执行层**
   - move → interact/wait → update needs → memory → relationship → event。

### 6.2 决策频率

```ts
const DECISION_RULES = {
  criticalNeedCooldownMinutes: 30,
  routineCooldownMinutes: 180,
  socialCooldownMinutes: 240,
  maxDecisionsPerTick: 2,
  maxConcurrentLlmCalls: 2,
  llmTimeoutMs: 8000,
  llmRetries: 1,
};
```

- 每名居民每游戏日约 3-5 次决策。
- 每 tick 最多入队 2 个 LLM 决策。
- 高优先级队列：
  1. CRITICAL：饥饿/健康/安全。
  2. HIGH：对话、冲突、家庭、节日。
  3. MEDIUM：工作、探索、交易。
  4. LOW：叙事美化、日记摘要。

### 6.3 Agent State

```ts
interface AgentRuntimeState {
  id: string;
  lastDecisionAt: number;        // gameMinute
  lastLlmDecisionAt: number;
  currentPlan?: AgentPlan;
  actionStartedAt: number;
  actionTarget?: { type: 'agent' | 'building' | 'zone' | 'position'; id?: string; position?: Vec2 };
  path?: Vec2[];
  isThinking: boolean;
  fallbackReason?: string;
}
```

### 6.4 可用行动

```ts
const ACTION_SCHEMA = {
  sleep: {
    needs: ['fatigue'],
    targets: ['home_building', 'zone'],
    durationRange: [360, 480],
  },
  eat: {
    needs: ['hunger'],
    targets: ['home_building', 'commercial_building', 'inventory'],
    durationRange: [20, 45],
  },
  work: {
    needs: ['wealth', 'town_progress'],
    targets: ['owned_building', 'workplace_building'],
    durationRange: [60, 240],
  },
  socialize: {
    needs: ['social', 'relationship'],
    targets: ['nearby_agent'],
    durationRange: [15, 90],
  },
  explore: {
    needs: ['curiosity', 'resource'],
    targets: ['walkable_zone'],
    durationRange: [30, 180],
  },
  trade: {
    needs: ['wealth', 'inventory_balance'],
    targets: ['commercial_building', 'agent'],
    durationRange: [15, 60],
  },
  rest: {
    needs: ['health', 'energy'],
    targets: ['home_building', 'zone'],
    durationRange: [30, 120],
  },
};
```

### 6.5 LLM 调用流程

```ts
async function decideAgent(agentId: string, reason: DecisionReason) {
  const agent = await agentState.load(agentId);
  if (!agent.alive) return;
  if (!agentEngine.canDecide(agent, reason)) return;

  agentEngine.setThinking(agentId, true);
  const prompt = prompts.buildDecisionPrompt(agent);

  try {
    const response = await llmClient.decide(prompt, {
      timeoutMs: 8000,
      retries: 1,
      responseSchema: LlmDecisionResponseSchema,
    });

    if (!validateDecision(response)) throw new Error('invalid_response');

    await agentEngine.applyDecision(agentId, response);
    await llmJobs.markSucceeded(jobId, response);
  } catch (err) {
    const fallback = fallbackPolicy.decide(agent, reason, err);
    await agentEngine.applyDecision(agentId, fallback);
    await llmJobs.markFailed(jobId, err, fallback);
  } finally {
    agentEngine.setThinking(agentId, false);
  }
}
```

### 6.6 Fallback 策略

```ts
function fallbackDecide(agent, reason): AgentPlan {
  if (agent.needs.fatigue > 85 || hourInRange(22, 5)) return sleepPlan(agent);
  if (agent.needs.hunger > 70) return eatPlan(agent);
  if (agent.needs.social > 75) return socializePlan(agent);
  if (hourInRange(8, 17)) return workPlan(agent);
  if (hourInRange(18, 21)) return socializePlan(agent);
  return explorePlan(agent);
}
```

### 6.7 记忆与关系更新

- 每次行动结束：
  - 写入 `events`。
  - 若 `importance >= 0.5` 或 LLM `memoryNote` 存在，写入 `agent_memories`。
  - 每日结束生成记忆摘要。
- 社交行动：
  - 根据行动结果、关系基础、人格 traits 更新 `relationships`。
  - 双向关系必须一致或按方向独立保存；本设计使用 `agent_a < agent_b` 规范排序。
- 死亡：
  - `alive=0`，写入 `agent_biographies.obituary_json`。
  - 不再参与日常决策，但仍显示幽灵/墓碑或归档。

### 6.8 LLM 错误处理

| 错误 | 处理 |
|---|---|
| timeout | retry 1 次；仍失败则 fallback，`reason='timeout'` |
| 429 | key pool 标记冷却，换 key；无 key 则 fallback |
| 5xx | exponential backoff，本 tick 不阻塞 |
| invalid JSON/schema | fallback，保留 response 原文用于调试 |
| 内容违反行动 schema | fallback |
| 连续失败 > N | 降低该 agent LLM 频率，进入 deterministic mode 30 分钟 |

---

## 7. 迁移策略

### 7.1 迁移输入

- 源文件：`data/saves/last-save.json`
- 当前规模：
  - `agents`: 33
  - `buildings`: 11
  - `chronicle`: 82
  - `innovations`: 14
  - `festivals`: 4
  - `map`: 50 x 55 tile matrix
  - `economy`: total/annual trade/spoilage/price history/caps

### 7.2 迁移流程

```txt
1. 读取 JSON 并计算 source_hash。
2. dry-run：
   - 校验顶层字段。
   - 校验 agents/buildings 唯一 ID。
   - 统计缺失 x/y、无效关系、缺失建筑 owner。
   - 输出冲突报告。
3. apply：
   - 开启 transaction。
   - 写入 meta/map/zones/buildings/agents。
   - 写入 family links。
   - 写入 relationships。
   - 写入 memories/biographies。
   - 写入 economy/culture/world_state。
   - 写入 chronicles/events 摘要。
   - 写入 migrations(status='applied')。
4. commit。
5. 生成 migration summary。
```

### 7.3 字段映射

```ts
interface MigrationSummary {
  sourceHash: string;
  agents: { total: number; alive: number; dead: number; missingPosition: number };
  buildings: { total: number; missingOwner: number };
  relationships: { total: number; repairedSymmetry: number };
  memories: { total: number; imported: number; skippedLowImportance: number };
  chronicles: { total: number; imported: number };
  conflicts: MigrationConflict[];
}

interface MigrationConflict {
  code:
    | 'duplicate_agent_id'
    | 'duplicate_building_id'
    | 'missing_position'
    | 'invalid_relationship'
    | 'missing_owner'
    | 'invalid_stats'
    | 'memory_overflow';
  entityId?: string;
  message: string;
  resolution: 'default' | 'skip' | 'reject' | 'repair';
}
```

### 7.4 具体映射规则

| 旧字段 | 新表/字段 | 规则 |
|---|---|---|
| `year`, `season`, `weather` | `world_state` | 转 `gameMinute = (year-1)*525600 + dayOffset + hour*60 + minute` |
| `agents[]` | `agents` | 保留 id/name/title/age/gender/alive/stats/skills/inventory/wealth |
| `agents[].x/y` | `agents.x/y` | 缺失则用 `initialBuilding` 或 `currentBuilding` 坐标 |
| `agents[].currentBuilding` | `agents.current_building_id` | 若建筑不存在则 null |
| `agents[].family.spouse/children/parents/household` | `agent_family_links` | 规范化 relation_type |
| `agents[].relationships` | `relationships` | 对每对只存一次，`agent_a < agent_b`，affinity 取平均或主视角值 |
| `relations` | `relationships` | 与 agent.relationships 合并，冲突时保留较高绝对值并记录 summary |
| `agents[].memories` | `agent_memories` | 全部导入；若超过上限则按 importance 降序保留 |
| `agents[].biography` | `agent_biographies` | persona/timeline/obituary 原样 JSON 化 |
| `buildings[]` | `buildings` | 保留 owner/type/level/builtYear |
| `economy` | `world_state.economy_json` | 保留 priceHistory/priceCaps |
| `chronicle` | `chronicles` + `events` | chronicle 作为叙事，另建轻量 event 摘要 |
| `innovations`, `laws`, `festivals` | `culture_json` / `events` | 作为文化状态与已发生事件导入 |
| `oralTraditions`, `artworks`, `placeNames`, `cultureValue` | `culture_json` | 保留数组与数值 |
| `map.tiles` | `assets/map.tmj` 或 `tile_states` | MVP 生成 TMJ；动态资源写入 `tile_states` |

### 7.5 缺字段默认值

```ts
const DEFAULT_AGENT = {
  x: 0,
  y: 0,
  direction: 'S',
  stats: {
    strength: 50,
    intelligence: 50,
    dexterity: 50,
    charisma: 50,
    health: 80,
    maxHealth: 100,
    energy: 80,
    happiness: 60,
  },
  needs: {
    hunger: 30,
    fatigue: 30,
    social: 30,
    safety: 0,
  },
  inventory: {},
  wealth: 0,
  persona: {
    traits: ['平凡'],
    values: ['活下去'],
    narrativeArc: '刚迁入桃源镇。',
  },
};
```

### 7.6 边界情况

- 旧存档中 `health > maxHealth`：导入时 clamp 到 `maxHealth`。
- `alive=false`：
  - `agents.alive=0`。
  - 不参与 LLM 决策。
  - 前端显示墓碑/低透明度或归档入口。
- 关系缺失反向：
  - 自动补对称关系，summary 记录 `repairedSymmetry`。
- 建筑 owner 不存在：
  - `owner_id=null`，不阻断迁移。
- 记忆过多：
  - 默认导入最近 200 条 + 高 importance 历史。
- map 过大：
  - TMJ 保持原尺寸；前端只绘制视口内 tile。
- 重复迁移：
  - 同 `source_hash` 已 applied 则 409，除非 `mode='replace'`。
- 迁移失败：
  - transaction rollback，`migrations.status='failed'`，保留 error。

---

## 8. 验收标准与验证计划

### 8.1 Phase 0：服务器骨架

- `npm run server:dev` 启动 Express + Socket.IO。
- `GET /api/health` 返回 OK。
- `GET /api/map` 返回 TMJ。
- 首页 200。

### 8.2 Phase 1：世界与时间

- 服务启动后 world time 每 2s tick。
- `GET /api/world/snapshot` 返回 `year/season/day/hour/weather`。
- 暂停/恢复 API 生效。
- 重启后从 SQLite 恢复 `gameMinute`。

### 8.3 Phase 2：迁移

- dry-run 输出 counts/conflicts。
- apply 后：
  - agents=33
  - buildings=11
  - chronicles=82
  - relationships 至少覆盖旧 `agents.relationships` 非零项。
- 旧 `赵长河` 能在 `/api/agents/zhao-changhe` 查到。

### 8.4 Phase 3：AI

- 无 LLM key 时世界仍运行，居民按 fallback 行动。
- 有 LLM key 时 `llm_jobs` 有 succeeded/failed 记录。
- 单居民详情页能看到当前 plan、needs、最近记忆。

### 8.5 Phase 4：前端

- Canvas 显示 Tiled 地图、建筑、居民。
- 拖拽/滚轮/触摸/小地图点击正常。
- Socket 收到 `agent:delta` 后居民平滑移动。
- 编年史/活动日志实时追加。

### 8.6 Phase 5：性能

- 33 居民 + 11 建筑下前端稳定 60fps（常见笔记本）。
- Socket delta 合并后带宽 < 100 KB/s。
- SQLite WAL 文件增长可接受，定期 snapshot/compaction。
- LLM 并发不超过配置上限。

---

## 9. 推荐实施顺序

1. **Phase 0**：server 骨架、SQLite schema、health/map/snapshot API。
2. **Phase 1**：TimeSystem + tick loop + broadcast。
3. **Phase 2**：last-save migration dry-run/apply。
4. **Phase 3**：前端 TMJ renderer + Camera + Socket.IO client。
5. **Phase 4**：AgentState + fallback decision engine。
6. **Phase 5**：LLM client + prompt schema + key pool。
7. **Phase 6**：记忆、关系、编年史、活动日志。
8. **Phase 7**：世界演化、经济、天气、节日。
9. **Phase 8**：性能优化、错误恢复、管理端打磨。

---

## 10. 关键文件清单

| 文件 | 作用 |
|---|---|
| `server/main.js` | 启动 Express、Socket.IO、scheduler |
| `server/routes.js` | REST API |
| `server/engine/time-system.js` | 时间推进与年月日季换算 |
| `server/engine/world-engine.js` | tick loop、状态聚合、广播 |
| `server/engine/pathfinding.js` | 参考 Alicization A* 与 nearest walkable |
| `server/agents/agent-engine.js` | 决策调度与行动执行 |
| `server/agents/agent-state.js` | needs/presence/plan |
| `server/agents/agent-memory.js` | 记忆写入与摘要 |
| `server/agents/agent-relationships.js` | 关系更新 |
| `server/ai/llm-client.js` | SiliconFlow OpenAI-compatible 调用 |
| `server/ai/key-pool.js` | key 轮换、429 backoff |
| `server/narrative/scribe.js` | 编年史生成 |
| `server/persistence/store.js` | SQLite wrapper |
| `server/persistence/migrations.js` | last-save 导入 |
| `server/web/index.html` | 单 HTML 前端入口 |
| `server/web/js/network.js` | Socket.IO client |
| `server/web/js/store.js` | 前端状态缓存 |
| `server/web/js/game.js` | 主渲染循环 |
| `server/web/js/camera.js` | Camera 系统 |
| `server/web/js/renderer.js` | Tiled/实体/粒子渲染 |
| `server/web/js/ui.js` | HUD、侧边栏、Modal、日志 |
| `server/web/assets/map.tmj` | Tiled 地图 |
| `server/web/assets/sprites/` | 居民/建筑 sprite sheet |
