/**
 * 世界引擎（WorldEngine）——模拟的核心循环。
 *
 * 负责：
 * - 创建和加载 WorldState
 * - 按年推进模拟（tick）
 * - 季节/天气管理
 * - 通过 EventBus 对外发送事件
 *
 * WorldState 本身是纯数据；所有变更逻辑在此类中实现。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import type { WorldState, TileMap, TileType, Season, WeatherType, Building, Item } from './types.js';
import { EVENTS, EventBus } from './event-bus.js';
import { SeededRNG } from './rng.js';
import { createAllAgents } from '../agents/agent-factory.js';
import { CHARACTERS } from '../config/characters.js';
import { ITEMS } from '../config/items.js';
import { BUILDING_OWNERS } from '../agents/trade-system.js';
import { MapSystem } from '../world/map.js';

/** 4×4 安全整数（2^31-1），避免 seedrandom 浮点精度问题。 */
const SEED_MOD = 2 ** 31 - 1;

/** 季节名称数组，用于推进。 */
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** 天气列表，用于随机选择。 */
const WEATHERS: WeatherType[] = ['sunny', 'rainy', 'windy', 'snowy', 'extreme'];

/** 地图尺寸：50 列 × 55 行。 */
const MAP_WIDTH = 50;
const MAP_HEIGHT = 55;

/** 地形类型及其权重（越靠后越稀少）。 */
const TERRAIN_PROBABILITY: Array<{ type: TileType; weight: number }> = [
  { type: 'plains', weight: 60 },
  { type: 'forest', weight: 20 },
  { type: 'water', weight: 10 },
  { type: 'mountain', weight: 5 },
  { type: 'farmland', weight: 4 },
  { type: 'road', weight: 1 },
];

/** 建筑初始定义 — 按飞书文档 v6.0 街道布局。 */
const INITIAL_BUILDINGS = [
  // 北街（y=26）：花圃 | 客栈 | 画室 | 空地（集市日用）
  { id: 'flower_garden', name: '花圃', type: 'agriculture', x: 20, y: 26, description: '王翠花的菜地花圃，四季种花种菜' },
  { id: 'inn', name: '客栈', type: 'commerce', x: 25, y: 26, description: '老王经营的茶馆客栈，楼下茶座楼上三间客房' },
  { id: 'studio', name: '画室', type: 'cultural', x: 28, y: 26, description: '小野的画室，朝街小屋，窗外能看到街景' },
  // 南街（y=28）：面摊 | 学堂 | 铁匠铺
  { id: 'noodle_stall', name: '面摊', type: 'commerce', x: 21, y: 28, description: '陈大江的竹棚面摊，三口铁锅一个案板' },
  { id: 'school', name: '学堂', type: 'education', x: 25, y: 28, description: '周建国的私塾，三五个学童念书' },
  { id: 'blacksmith', name: '铁匠铺', type: 'production', x: 29, y: 28, description: '张大山的手拉风箱铁匠铺' },
  // 后街（y=30-31）：诊所 | 草药摊 | 社区大屋 | 木工坊
  { id: 'clinic', name: '医馆', type: 'medical', x: 21, y: 30, description: '白若兰的中医诊所，一柜子干草药' },
  { id: 'herb_stall', name: '草药摊', type: 'commerce', x: 24, y: 30, description: '苏灵儿的采药摊，路边一张桌' },
  { id: 'workshop', name: '木工坊', type: 'production', x: 27, y: 30, description: '小林的工作间，堆满木料零件和齿轮模型' },
  { id: 'town_hall', name: '社区大屋', type: 'civic', x: 23, y: 31, description: '赵长河和马秀英的住所兼议事处，全镇最大的房子' },
  // 外围（山脚/码头）
  { id: 'hot_spring', name: '温泉', type: 'recreation', x: 15, y: 34, description: '林美琪看管的天然地热泉，草棚围一圈' },
];

/** 生成随机地形权重，用于 RNG 选择。 */
function getTerrainWeights(): number[] {
  return TERRAIN_PROBABILITY.map(t => t.weight);
}

/** 创建 50×55 随机地图。使用 MapSystem 统一的地图生成逻辑。 */
function createMap(rng: SeededRNG): TileMap {
  return MapSystem.generateMap(rng);
}

/** 深拷贝世界状态，用于序列化/反序列化时的隔离。 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// 注意：存档功能由 src/index.ts 的 saveGame() 统一管理
// 以下函数已废弃，保留仅作为参考

export class WorldEngine {
  /** 当前世界状态（纯数据对象）。 */
  state: WorldState;

  /** 用于所有随机操作的 RNG 实例。 */
  private _rng: SeededRNG;

  constructor(state?: WorldState, rng?: SeededRNG) {
    if (state && rng) {
      this.state = state;
      this._rng = rng;
    } else {
      this.state = null as unknown as WorldState;
      this._rng = new SeededRNG(Date.now());
    }
  }

  /**
   * 创建新的世界状态。
   *
   * - 初始化地图（50×55 随机地形）
   * - 通过 AgentFactory 创建初始居民
   * - 设置初始经济、建筑
   */
  static createNew(
    seed: number,
    characters: typeof CHARACTERS = CHARACTERS,
    _items?: Item[], // used later for economy setup
  ): WorldEngine {
    const normalizedSeed = Math.abs(Math.round(seed)) % SEED_MOD;
    const rng = new SeededRNG(normalizedSeed);

    const map = createMap(rng);

    // 创建初始居民
    const agents = createAllAgents(characters, rng);

    // 设置初始建筑
    const initialYear = 0;
    const buildings = INITIAL_BUILDINGS.map(b => ({
      ...b,
      level: 1,
      ownerId: undefined as string | undefined,
      builtYear: initialYear,
    })) as Building[];
    // 设置建筑所有者
    for (const b of buildings) {
      const ownerEntry = BUILDING_OWNERS[b.id as keyof typeof BUILDING_OWNERS];
      if (ownerEntry) b.ownerId = ownerEntry;
    }

    // 初始化所有 Agent 的位置基于 initialBuilding
    for (const agent of agents) {
      if (agent.initialBuilding) {
        const bld = buildings.find(b => b.id === agent.initialBuilding);
        if (bld) {
          agent.x = bld.x + (rng.int(0, 2) - 1); // 小随机偏移
          agent.y = bld.y;
          agent.currentBuilding = bld.id;
        }
      }
      // 如果没有 initialBuilding，默认到社区大屋
      if (agent.x === 0 && agent.y === 0) {
        const townHall = buildings.find(b => b.id === 'town_hall');
        if (townHall) {
          agent.x = townHall.x;
          agent.y = townHall.y;
          agent.currentBuilding = townHall.id;
        }
      }
    }

    // 初始化经济
    const economy = {
      totalCurrency: 500, // 初始铜币总量
      annualTradeVolume: 0,
      annualSpoilage: 0,
      priceHistory: {},
      priceCaps: {},
    };

    const state: WorldState = {
      year: 0,
      season: 'spring',
      weather: 'sunny',
      agents,
      economy,
      buildings,
      map,
      innovations: [],
      laws: [],
      festivals: [],
      groups: [],
      archives: [],
      relations: [],
      seed: normalizedSeed,
      chronicle: [
        {
          year: 0,
          severity: 'epochal',
          content: '桃源镇初建，众贤齐聚，万事始成。',
        },
      ],
      snapshots: [],
      populationThreshold: 100,
      version: '0.6.0',
      credits: [],
      apprenticeships: [],
      __shortTermJobs: [],
      crimeWave: 0,
      pendingPublicOrderLaw: false,
      pendingTrials: [],
      placeNames: [],
      oralTraditions: [],
      artworks: [],
      cultureValue: 0,
    };

    return new WorldEngine(state, rng);
  }

  /**
   * 加载已保存的世界状态。
   */
  static loadFromDisk(): WorldEngine {
    const savePath = path.resolve(process.cwd(), 'data', 'saves', 'last-save.json');
    if (!fs.existsSync(savePath)) {
      throw new Error(`Save file not found: ${savePath}`);
    }

    const raw = fs.readFileSync(savePath, 'utf-8');
    const state = JSON.parse(raw) as WorldState;
    const rng = new SeededRNG(state.seed);

    return new WorldEngine(state, rng);
  }

  /**
   * 推进一年：季节→四季循环，天气变化，事件发送。
   */
  tick(): void {
    // 推进季节
    const currentSeasonIdx = SEASONS.indexOf(this.state.season);
    const nextSeasonIdx = (currentSeasonIdx + 1) % SEASONS.length;
    this.state.season = SEASONS[nextSeasonIdx];

    // 若从 winter 回到 spring，年份递增
    if (nextSeasonIdx === 0) {
      this.state.year += 1;
    }

    // 随机天气
    this.state.weather = WEATHERS[this._rng.int(0, WEATHERS.length - 1)];

    // 发送季节变化事件
    EventBus.emit(EVENTS.SEASON_CHANGED, {
      season: this.state.season,
      year: this.state.year,
    });
  }

  /**
   * 获取当前世界状态（返回只读引用）。
   */
  getState(): Readonly<WorldState> {
    return this.state;
  }

  /**
   * 获取当前 RNG 实例（供外部模拟逻辑使用）。
   */
  getRng(): SeededRNG {
    return this._rng;
  }
}

// 修正：指向项目根目录
const projectDir = path.resolve(process.cwd(), '..');

export default WorldEngine;
