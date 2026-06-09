/**
 * 地图系统（MapSystem）— 桃源镇 v6.0
 *
 * 负责：
 * 1. 地图生成（50x55 网格，多地形分布）
 * 2. 资源区管理（森林→木材，山地→矿石，水域→鱼产）
 * 3. 地块查询（坐标→类型、资源、肥沃度）
 * 4. 道路/建筑用地管理
 * 5. 地图统计与视觉描述
 */

import type { WorldState, TileMap, Tile, TileType, Building } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ──────────────────────────────

/** 地图尺寸 */
export const MAP_WIDTH = 50;
export const MAP_HEIGHT = 55;

/** 中心城区范围（用于建筑用地标记） */
export const CENTER_X_MIN = 18;
export const CENTER_X_MAX = 31;
export const CENTER_Y_MIN = 24;
export const CENTER_Y_MAX = 33;

/** 资源倍率（每级地形标记可采集量） */
export const RESOURCE_YIELD: Record<string, { resource: string; baseYield: number }> = {
  forest: { resource: 'wood', baseYield: 3 },
  mountain: { resource: 'stone', baseYield: 2 },
  water: { resource: 'fish', baseYield: 2 },
  farmland: { resource: 'crop', baseYield: 4 },
};

/** 中文地形名 */
export const TILE_TYPE_NAMES: Record<TileType, string> = {
  plains: '平原',
  forest: '森林',
  water: '水域',
  mountain: '山地',
  farmland: '农田',
  road: '道路',
  building: '建筑',
};

/** 地形权重（用于随机生成） */
const TERRAIN_WEIGHTS: Array<{ type: TileType; weight: number }> = [
  { type: 'plains', weight: 60 },
  { type: 'forest', weight: 20 },
  { type: 'water', weight: 10 },
  { type: 'mountain', weight: 5 },
  { type: 'farmland', weight: 4 },
  { type: 'road', weight: 1 },
];

// ─── 地图管理器 ────────────────────────

export class MapSystem {
  private state: WorldState;
  private rng: SeededRNG;

  constructor(state: WorldState, rng: SeededRNG) {
    this.state = state;
    this.rng = rng;
  }

  /**
   * 随机生成地图（50x55）。
   * 中心区域（18-31, 24-33）标记为建筑用地。
   * 标注特定地块的可采集资源。
   */
  static generateMap(rng: SeededRNG): TileMap {
    const tiles: Tile[][] = [];

    for (let y = 0; y < MAP_HEIGHT; y++) {
      tiles[y] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        const isCenter = x >= CENTER_X_MIN && x <= CENTER_X_MAX
          && y >= CENTER_Y_MIN && y <= CENTER_Y_MAX;

        let type: TileType;
        if (isCenter) {
          // 中心区域：建筑用地 + 少量道路
          const centerTile = rng.pick(['building', 'building', 'building', 'road'] as TileType[]);
          type = centerTile;
        } else {
          // 外围区域按权重随机
          type = rng.weightedPick(
            TERRAIN_WEIGHTS.map(t => t.type),
            TERRAIN_WEIGHTS.map(t => t.weight),
          );
        }

        const tile: Tile = { type };

        // 为可采集地形添加资源标记
        const resourceInfo = RESOURCE_YIELD[type];
        if (resourceInfo) {
          tile.resource = resourceInfo.resource;
          // 肥沃度随机（仅 farmland）
          if (type === 'farmland') {
            tile.fertility = +(0.3 + rng.next() * 0.7).toFixed(2);
          }
        }

        tiles[y][x] = tile;
      }
    }

    return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles };
  }

  /**
   * 获取某坐标的地块信息。
   */
  getTile(x: number, y: number): Tile | undefined {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return undefined;
    return this.state.map.tiles[y]?.[x];
  }

  /**
   * 获取某坐标的建筑。
   */
  getBuildingAt(x: number, y: number): Building | undefined {
    return this.state.buildings.find(b => b.x === x && b.y === y);
  }

  /**
   * 获取所有指定类型的相邻地块坐标。
   */
  getAdjacentTiles(x: number, y: number, filterType?: TileType): Array<{ x: number; y: number; tile: Tile }> {
    const dirs = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
      { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ];
    const result: Array<{ x: number; y: number; tile: Tile }> = [];
    for (const { dx, dy } of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const tile = this.getTile(nx, ny);
      if (tile && (!filterType || tile.type === filterType)) {
        result.push({ x: nx, y: ny, tile });
      }
    }
    return result;
  }

  /**
   * 获取资源区的采集产出。
   */
  getResourceYield(x: number, y: number): { resource: string; amount: number } | null {
    const tile = this.getTile(x, y);
    if (!tile || !tile.resource) return null;
    const info = RESOURCE_YIELD[tile.type];
    if (!info) return null;
    const fertilityMod = tile.fertility ? 1 + tile.fertility : 1;
    return {
      resource: info.resource,
      amount: Math.floor(info.baseYield * fertilityMod),
    };
  }

  /**
   * 统计各地形面积。
   */
  getTerrainStats(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = this.state.map.tiles[y]?.[x];
        if (tile) {
          counts[tile.type] = (counts[tile.type] ?? 0) + 1;
        }
      }
    }
    return counts;
  }

  /**
   * 获取地形中文描述。
   */
  getTerrainDescription(): string {
    const stats = this.getTerrainStats();
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    const parts = Object.entries(stats)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => {
        const pct = Math.round((count / total) * 100);
        return `${TILE_TYPE_NAMES[type as TileType] ?? type} ${pct}%`;
      });
    return `桃源镇占地 ${MAP_WIDTH}×${MAP_HEIGHT}，其中 ${parts.join('、')}。`;
  }

  /**
   * 将建筑位置写入地图（标记为 building 类型）。
   */
  placeBuildingOnMap(building: Building): void {
    const tile = this.getTile(building.x, building.y);
    if (tile && tile.type !== 'building') {
      tile.type = 'building';
    }
  }
}

export default MapSystem;
