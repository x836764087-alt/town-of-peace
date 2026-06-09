/**
 * 季节系统（Seasons System）— 桃源镇 v6.0
 *
 * 管理四季轮回、天气变化、季节效应和极端天气事件。
 */

import type { Season, WeatherType } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ────────────────────────────────────────

/** 一年的周数 */
export const WEEKS_PER_YEAR = 52;

/** 每季的周数 */
export const WEEKS_PER_SEASON = 13;

/** 季节权重数组（按春、夏、秋、冬顺序） */
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** 天气季节偏好 */
const WEATHER_WEIGHTS: Record<Season, Record<WeatherType, number>> = {
  spring: { sunny: 3, rainy: 4, windy: 2, snowy: 0, extreme: 1 },
  summer: { sunny: 5, rainy: 3, windy: 1, snowy: 0, extreme: 1 },
  autumn: { sunny: 4, rainy: 2, windy: 3, snowy: 0, extreme: 1 },
  winter: { sunny: 2, rainy: 0, windy: 3, snowy: 4, extreme: 1 },
};

/** 季节农业加成（1.0 = 基准） */
export const FARMING_BONUS: Record<Season, number> = {
  spring: 1.2,  // 春耕
  summer: 1.0,  // 夏耘
  autumn: 1.3,  // 秋收
  winter: 0.4,  // 冬藏，几乎不能农作
};

/** 季节健康风险（生病概率权重） */
export const HEALTH_RISK: Record<Season, number> = {
  spring: 0.8,  // 换季，流感
  summer: 0.6,  // 相对健康
  autumn: 0.7,  // 换季
  winter: 1.5,  // 寒冷，疾病高发
};

/** 季节情绪加成（-10 到 +10） */
export const MORALE_MOD: Record<Season, number> = {
  spring: 3,   // 万物复苏
  summer: 2,   // 温暖
  autumn: 5,   // 丰收喜悦
  winter: -2,  // 寒冷孤寂
};

// ─── 季节管理 ────────────────────────────────────

/**
 * 根据周数计算当前季节。
 */
export function getCurrentSeason(week: number): Season {
  const seasonIndex = Math.floor(week / WEEKS_PER_SEASON) % 4;
  return SEASONS[seasonIndex];
}

/**
 * 获取下一个季节。
 */
export function getNextSeason(current: Season): Season {
  const idx = SEASONS.indexOf(current);
  return SEASONS[(idx + 1) % 4];
}

/**
 * 获取季节对农业的影响系数。
 */
export function getFarmingBonus(season: Season): number {
  return FARMING_BONUS[season] ?? 1.0;
}

/**
 * 获取季节健康风险系数。
 */
export function getHealthRisk(season: Season): number {
  return HEALTH_RISK[season] ?? 1.0;
}

/**
 * 获取季节情绪加成。
 */
export function getMoraleMod(season: Season): number {
  return MORALE_MOD[season] ?? 0;
}

/**
 * 根据季节和随机种子生成天气。
 */
export function generateWeather(season: Season, rng: SeededRNG): WeatherType {
  const weights = WEATHER_WEIGHTS[season];
  const types: WeatherType[] = ['sunny', 'rainy', 'windy', 'snowy', 'extreme'];
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  
  let roll = rng.next() * totalWeight;
  for (let i = 0; i < types.length; i++) {
    roll -= weights[types[i]];
    if (roll <= 0) return types[i];
  }
  
  return 'sunny'; // 默认
}

/**
 * 生成当天的详细天气。
 * 极端天气有概率触发（旱灾、洪灾、寒潮）。
 */
export function generateDayWeather(
  week: number,
  rng: SeededRNG,
  year: number,
): { weather: WeatherType; isExtreme: boolean; extremeType?: string } {
  const season = getCurrentSeason(week);
  const weather = generateWeather(season, rng);
  
  let isExtreme = weather === 'extreme';
  let extremeType: string | undefined;
  
  if (isExtreme) {
    const extremeRoll = rng.next();
    if (season === 'summer') {
      extremeType = extremeRoll < 0.5 ? 'drought' : 'flood';
    } else if (season === 'winter') {
      extremeType = 'cold_wave';
    } else if (season === 'spring') {
      extremeType = extremeRoll < 0.5 ? 'late_spring_frost' : 'heavy_rain';
    } else {
      extremeType = extremeRoll < 0.5 ? 'strong_typhoon' : 'early_snow';
    }
  }
  
  return { weather, isExtreme, extremeType };
}

/**
 * 获取季节事件描述。
 */
export function getSeasonEvent(season: Season): string {
  switch (season) {
    case 'spring':
      return '春耕播种，万物复苏';
    case 'summer':
      return '夏耘除草，骄阳似火';
    case 'autumn':
      return '秋收冬藏，五谷丰登';
    case 'winter':
      return '寒冬封冻，休养生息';
  }
}

/**
 * 判断是否处于某个季节的特定阶段。
 */
export function isSeasonPhase(week: number, phase: 'early' | 'mid' | 'late'): boolean {
  const seasonWeek = week % WEEKS_PER_SEASON;
  if (phase === 'early') return seasonWeek < 4;
  if (phase === 'mid') return seasonWeek >= 4 && seasonWeek < 9;
  return seasonWeek >= 9;
}
