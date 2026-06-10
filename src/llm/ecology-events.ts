/**
 * EcologyEvents — 生态状态与事件系统的集成（Phase 12.3）
 *
 * 将 EcologySystem 的状态以叙事事件的形式暴露给主循环，
 * 让生态变化能够被居民感知。
 */

import { EcologySystem } from './ecology-system.js';
import { SeededRNG } from '../core/rng.js';

export class EcologyEvents {
  private ecology: EcologySystem;
  private rng: SeededRNG;

  constructor(ecology: EcologySystem, rng: SeededRNG) {
    this.ecology = ecology;
    this.rng = rng;
  }

  /** 根据生态状态生成生态相关叙事事件 */
  generateSeasonalEvents(_season: string): string[] {
    if (!this.rng.chance(0.5)) {
      return [];
    }

    const events: string[] = [];
    const eco = this.ecology.getState();

    // 丰收/歉收
    const farmingMod = this.ecology.getFarmingModifier();
    if (farmingMod > 1.2) {
      events.push('今年土地格外肥沃，庄稼长势喜人。');
    } else if (farmingMod < 0.7) {
      events.push('土地越来越贫瘠，收成一年不如一年。');
    }

    // 野生动物
    const forestMod = this.ecology.getForestModifier();
    if (forestMod > 1.2) {
      events.push('山林里野兽繁多，猎人们收获颇丰。');
    } else if (forestMod < 0.6) {
      events.push('附近的野兽越来越少了，猎人们要走很远才能找到猎物。');
    }

    // 疾病抵抗
    const healthMod = this.ecology.getHealthModifier();
    if (healthMod < 0.6) {
      events.push('水质变差了，镇上不少人闹肚子。');
    }

    // 最多 2 条
    return events.slice(0, 2);
  }

  /** 获取农业产出修正 */
  getFarmingOutputMultiplier(): number {
    return this.ecology.getFarmingModifier();
  }

  /** 获取森林狩猎产出修正 */
  getHuntingOutputMultiplier(): number {
    return this.ecology.getForestModifier();
  }

  /** 获取疾病抵抗力修正 */
  getDiseaseResistanceModifier(): number {
    return this.ecology.getHealthModifier();
  }
}
