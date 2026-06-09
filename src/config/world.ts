/** 世界常量 — 按飞书文档 v6.0 */
export const WORLD = {
  /** Tick no delay */
  TICK_INTERVAL_MS: 0,
  /** Map width */
  MAP_WIDTH: 50,
  /** Map height */
  MAP_HEIGHT: 55,
  /** Season rotation */
  SEASONS: ['spring', 'summer', 'autumn', 'winter'] as const,
  /** 初始分配铜钱 */
  INITIAL_WEALTH: 100,
  /** 最高自然寿命 */
  MAX_AGE: 80,
  /** 成年年龄 */
  ADULT_AGE: 18,
  /** 生育年龄下限 */
  FERTILITY_MIN_AGE: 16,
  /** 生育年龄上限（女性） */
  FERTILITY_MAX_AGE: 49,
  /** 婚姻最低年龄 */
  MARRIAGE_MIN_AGE: 18,
  /** 每季移民触发概率（base） */
  IMMIGRATION_CHANCE: 0.15,
  /** 移民人数范围 */
  IMMIGRANTS_MIN: 1,
  IMMIGRANTS_MAX: 3,
  /** 人口上限（移民触发上限） */
  POPULATION_CAP: 80,
  /** 婚姻关系阈值 */
  MARRIAGE_THRESHOLD: 60,
  /** 每对夫妻每年生育基准概率（每季检查） */
  BASE_FERTILITY: 0.12,
  /** 新生儿存活率 */
  INFANT_SURVIVAL_RATE: 0.85,
  /** 难产死亡率 */
  CHILDBIRTH_MORTALITY: 0.08,
  /** 基础死亡率（>MAX_AGE后每年） */
  BASE_MORTALITY_RATE: 0.15,
  /** 疾病年概率 */
  DISEASE_RATE: 0.08,
  /** 每个角色每季消耗粮食 */
  FOOD_PER_TICK: 1,
  /** 是否允许移民（设为 false 可完全暂停移民涌入） */
  ENABLE_IMMIGRATION: false,
} as const;

export type WorldConfig = typeof WORLD;
