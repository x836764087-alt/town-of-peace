/**
 * 自然生态动态系统（Phase 12.1）
 *
 * 模拟人口、建筑、农业活动对生态环境的压力，
 * 以及自然的自我恢复能力。每季调用 tick() 更新生态状态。
 */

import type { Season } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ── 生态状态 ───────────────────────────────────────────────

export interface EcologyState {
  /** 森林覆盖率（0-100） */
  forestCoverage: number;
  /** 土壤肥力（0-100） */
  soilFertility: number;
  /** 河流健康度（0-100） */
  riverHealth: number;
  /** 野生动物丰富度（0-100） */
  wildlifeAbundance: number;
}

// 初始值常量（与 state 初始值一致）
const INITIAL_FERTILITY = 70;

// 危险阈值
const FOREST_DANGER_THRESHOLD = 30;
const WILDLIFE_DANGER_THRESHOLD = 20;
const SOIL_DANGER_THRESHOLD = 30;
const RIVER_DANGER_THRESHOLD = 40;

// 森林覆盖率 → 狩猎产出倍率 映射关键点
// 0 → 0.5, 50 → 1.0, 100 → 1.5（线性插值）
const FOREST_MOD_MIN = 0.5;
const FOREST_MOD_BASE = 1.0;
const FOREST_MOD_MAX = 1.5;

// 农业产出倍率：土壤肥力 0→0.5, 100→2.0（线性插值）
const FARMING_MOD_MIN = 0.5;
const FARMING_MOD_MAX = 2.0;

// ── EcologySystem ──────────────────────────────────────────

export class EcologySystem {
  private state: EcologyState;
  private warned = new Set<string>();

  constructor(private rng: SeededRNG) {
    this.state = {
      forestCoverage: 80,
      soilFertility: 70,
      riverHealth: 75,
      wildlifeAbundance: 65,
    };
  }

  /** 获取当前生态状态（只读副本） */
  getState(): EcologyState {
    return { ...this.state };
  }

  /**
   * 每季更新生态状态。
   * @returns 当指标首次进入危险区时产生的警告消息数组
   */
  tick(
    season: Season,
    population: number,
    buildingCount: number,
    farmingIntensity: number,
  ): string[] {
    const s = this.state;

    // 1. 人口压力
    s.forestCoverage -= population * 0.01;
    s.wildlifeAbundance -= population * 0.005;

    // 2. 建筑压力
    s.forestCoverage -= buildingCount * 0.1;
    s.soilFertility -= buildingCount * 0.05;

    // 3. 农业压力 (farmingIntensity: 0-10)
    s.soilFertility -= 0.2 * farmingIntensity;

    // 4. 自然恢复
    s.soilFertility = Math.min(s.soilFertility + 0.5, INITIAL_FERTILITY);
    s.riverHealth += 0.3;

    // 5. 季节因子
    const seasonEffect = this.seasonEffect(season);
    s.forestCoverage += seasonEffect * 0.5;
    s.soilFertility += seasonEffect * 0.5;
    s.riverHealth += seasonEffect * 0.3;
    s.wildlifeAbundance += seasonEffect * 0.5;

    // 6. 边界钳制 [0, 100]
    s.forestCoverage = clamp(s.forestCoverage);
    s.soilFertility = clamp(s.soilFertility);
    s.riverHealth = clamp(s.riverHealth);
    s.wildlifeAbundance = clamp(s.wildlifeAbundance);

    // 7. 检查危险阈值，首次触发才通知
    const messages: string[] = [];
    if (s.forestCoverage < FOREST_DANGER_THRESHOLD && !this.warned.has('forest')) {
      messages.push('森林面积大幅减少，生态平衡受到威胁');
      this.warned.add('forest');
    }
    if (s.wildlifeAbundance < WILDLIFE_DANGER_THRESHOLD && !this.warned.has('wildlife')) {
      messages.push('野生动物已经很少见了');
      this.warned.add('wildlife');
    }
    if (s.soilFertility < SOIL_DANGER_THRESHOLD && !this.warned.has('soil')) {
      messages.push('土地越来越贫瘠，收成堪忧');
      this.warned.add('soil');
    }
    if (s.riverHealth < RIVER_DANGER_THRESHOLD && !this.warned.has('river')) {
      messages.push('河水变得浑浊，鱼类大量死亡');
      this.warned.add('river');
    }

    return messages;
  }

  /** 重置生态（模拟开始时调用） */
  initialize(): void {
    this.state = {
      forestCoverage: 80,
      soilFertility: 70,
      riverHealth: 75,
      wildlifeAbundance: 65,
    };
    this.warned.clear();
  }

  /**
   * 获取森林覆盖率对狩猎产出的倍率：
   * 0→0.5, 50→1.0, 100→1.5（线性插值）
   */
  getForestModifier(): number {
    const t = this.state.forestCoverage / 100;
    return FOREST_MOD_MIN + t * (FOREST_MOD_MAX - FOREST_MOD_MIN);
  }

  /**
   * 获取土壤肥力对农业产出的倍率：
   * 0→0.5, 100→2.0（线性插值）
   */
  getFarmingModifier(): number {
    const t = this.state.soilFertility / 100;
    return FARMING_MOD_MIN + t * (FARMING_MOD_MAX - FARMING_MOD_MIN);
  }

  /**
   * 获取河流健康度 + 野生动物丰富度的均值对疾病抵抗的倍率：
   * 均值 0→0.5, 100→2.0（线性插值）
   */
  getHealthModifier(): number {
    const avg = (this.state.riverHealth + this.state.wildlifeAbundance) / 2;
    const t = avg / 100;
    return FARMING_MOD_MIN + t * (FARMING_MOD_MAX - FARMING_MOD_MIN);
  }

  /** 获取季节对生态的影响因子：春 +1, 夏/秋 0, 冬 -1 */
  private seasonEffect(season: Season): number {
    switch (season) {
      case 'spring':
        return 1;
      case 'summer':
      case 'autumn':
        return 0;
      case 'winter':
        return -1;
    }
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
