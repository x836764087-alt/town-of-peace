/**
 * 技术依赖树 — 16 项可发明的技术（基于飞书文档 section 十二）
 *
 * 分两个层级：
 * - 改良型 (tier = 'improvement')：需要 skillThreshold ≥ 3
 * - 原理型 (tier = 'principle')：需要 skillThreshold ≥ 5
 *
 * 每项技术通过 requires[] 声明前置依赖，不允许跳步。
 * 每个节点通过 unlocks[] 声明解锁的新物品/建筑类型。
 */

import { SeededRNG } from '../core/rng.js';

/** 技术分类 */
export type TechCategory =
  | 'mechanical'
  | 'electrical'
  | 'medical'
  | 'agricultural'
  | 'construction'
  | 'food'
  | 'communication'
  | 'other';

/** 技术层级：改良型 vs 原理型 */
export type TechTier = 'improvement' | 'principle';

/** 技术节点定义（配置阶段使用，不含运行时状态） */
export interface InnovationNode {
  /** 唯一标识符，如 `'improved_bellows'` */
  id: string;
  /** 显示名称，如 `'改良风箱'` */
  name: string;
  /** 技术描述 */
  description: string;
  /** 所属分类 */
  category: TechCategory;
  /** 前置技术 id 列表 — 全部解锁后才能研究此项 */
  requires: string[];
  /** 所需最低技能等级 (3–9) */
  skillThreshold: number;
  /** 基础成功率 (0–1) */
  probability: number;
  /** 技术层级 */
  tier: TechTier;
  /** 解锁的新物品/建筑类型 */
  unlocks: string[];
}

/** 全部 16 项技术节点的配置数据 */
export const INNOVATION_TREE: InnovationNode[] = [
  // === 改良型创新 (skillThreshold 3-5) ===

  /** 1. 改良风箱 — 加阀门提高风压 */
  {
    id: 'improved_bellows',
    name: '改良风箱',
    description: '加阀门提高风压',
    category: 'mechanical',
    requires: [],
    skillThreshold: 3,
    probability: 0.6,
    tier: 'improvement',
    unlocks: ['bellows_improved', 'iron_quality_boost'],
  },

  /** 2. 井口辘轳 — 辘轳提水省力 */
  {
    id: 'well_winch',
    name: '井口辘轳',
    description: '辘轳提水省力',
    category: 'mechanical',
    requires: [],
    skillThreshold: 3,
    probability: 0.6,
    tier: 'improvement',
    unlocks: ['well_winch_device', 'water_access_boost'],
  },

  /** 3. 炉灶烟道 — 烟道减少室内烟 */
  {
    id: 'stove_flue',
    name: '炉灶烟道',
    description: '烟道减少室内烟',
    category: 'construction',
    requires: [],
    skillThreshold: 3,
    probability: 0.5,
    tier: 'improvement',
    unlocks: ['flue_stove', 'indoor_air_quality_up'],
  },

  /** 4. 面条配料 — 多放配料更好吃 */
  {
    id: 'noodle_variety',
    name: '面条配料',
    description: '多放配料更好吃',
    category: 'food',
    requires: [],
    skillThreshold: 3,
    probability: 0.8,
    tier: 'improvement',
    unlocks: ['noodle_deluxe', 'food_happiness_up'],
  },

  /** 5. 砖烧制 — 烧砖替代夯土 */
  {
    id: 'brick_kiln',
    name: '砖烧制',
    description: '烧砖替代夯土',
    category: 'construction',
    requires: [],
    skillThreshold: 4,
    probability: 0.4,
    tier: 'improvement',
    unlocks: ['brick_production', 'construction_quality_up'],
  },

  /** 6. 玻璃制作 — 沙子烧制成玻璃 */
  {
    id: 'glass_making',
    name: '玻璃制作',
    description: '沙子烧制成玻璃',
    category: 'construction',
    requires: ['brick_kiln'],
    skillThreshold: 5,
    probability: 0.3,
    tier: 'improvement',
    unlocks: ['glass', 'glassware', 'lens'],
  },

  /** 7. 酱油工业化 — 稳定酱油醋生产 */
  {
    id: 'soy_brewing',
    name: '酱油工业化',
    description: '稳定酱油醋生产',
    category: 'food',
    requires: [],
    skillThreshold: 3,
    probability: 0.5,
    tier: 'improvement',
    unlocks: ['soy_sauce', 'vinegar', 'seasoning_pack'],
  },

  /** 9. 基础医学 — 总结常见医疗经验 */
  {
    id: 'basic_medicine',
    name: '基础医学',
    description: '总结常见疾病治疗经验',
    category: 'medical',
    requires: [],
    skillThreshold: 3,
    probability: 0.5,
    tier: 'improvement',
    unlocks: ['herbal_remedies', 'basic_treatment', 'surgery_basic'],
  },

  /** 10. 织布机改良 — 提高织布效率 */
  {
    id: 'improved_loom',
    name: '织布机改良',
    description: '提高织布效率',
    category: 'mechanical',
    requires: [],
    skillThreshold: 3,
    probability: 0.5,
    tier: 'improvement',
    unlocks: ['loom_improved', 'cloth_quality_up', 'fine_cloth'],
  },

  // === 原理型创新 (skillThreshold 5-9) ===

  /** 11. 电磁感应 — 发现电磁感应原理 */
  {
    id: 'electromagnetism',
    name: '电磁感应',
    description: '发现电磁感应原理',
    category: 'electrical',
    requires: ['glass_making', 'improved_loom'],
    skillThreshold: 7,
    probability: 0.1,
    tier: 'principle',
    unlocks: ['electromagnet', 'wire', 'electric_generator'],
  },

  /** 12. 蒸汽机 — 蒸汽压力转化为机械能 */
  {
    id: 'steam_engine',
    name: '蒸汽机',
    description: '蒸汽压力转化为机械能',
    category: 'mechanical',
    requires: ['brick_kiln', 'improved_bellows'],
    skillThreshold: 8,
    probability: 0.08,
    tier: 'principle',
    unlocks: ['steam_engine', 'steam_pump', 'industrial_machinery'],
  },

  /** 13. 摄影术 — 感光材料记录影像 */
  {
    id: 'photography',
    name: '摄影术',
    description: '感光材料记录影像',
    category: 'communication',
    requires: ['glass_making'],
    skillThreshold: 6,
    probability: 0.15,
    tier: 'principle',
    unlocks: ['camera', 'photograph', 'lens_camera'],
  },

  /** 14. 细菌理论 — 理解微生物致病 */
  {
    id: 'germ_theory',
    name: '细菌理论',
    description: '理解微生物致病',
    category: 'medical',
    requires: ['basic_medicine'],
    skillThreshold: 7,
    probability: 0.1,
    tier: 'principle',
    unlocks: ['germ_theory_knowledge', 'antiseptic', 'microscope'],
  },

  /** 15. 现代外科 — 消毒手术和麻醉 */
  {
    id: 'modern_surgery',
    name: '现代外科',
    description: '消毒手术和麻醉',
    category: 'medical',
    requires: ['germ_theory'],
    skillThreshold: 8,
    probability: 0.05,
    tier: 'principle',
    unlocks: ['surgical_kit', 'anesthetic', 'hospital_wing'],
  },

  /** 16. 活字印刷 — 活字排版批量印刷 */
  {
    id: 'movable_type',
    name: '活字印刷',
    description: '活字排版批量印刷',
    category: 'communication',
    requires: ['brick_kiln'],
    skillThreshold: 5,
    probability: 0.2,
    tier: 'principle',
    unlocks: ['movable_type_print', 'printed_book', 'newspaper'],
  },

  /** 17. 自来水加压 — 管道加压供水 */
  {
    id: 'water_pressure',
    name: '自来水加压',
    description: '管道加压供水',
    category: 'construction',
    requires: ['well_winch', 'brick_kiln'],
    skillThreshold: 6,
    probability: 0.15,
    tier: 'principle',
    unlocks: ['water_pipe', 'water_tower', 'city_water_system'],
  },

  /** 18. 造纸术改良 — 树皮麻头改良造纸 */
  {
    id: 'papermaking_improved',
    name: '造纸术改良',
    description: '树皮麻头改良造纸',
    category: 'construction',
    requires: ['stove_flue'],
    skillThreshold: 5,
    probability: 0.3,
    tier: 'principle',
    unlocks: ['quality_paper', 'cheap_paper', 'paper_production_boost'],
  },
];

/**
 * 根据 id 查找技术节点。
 */
export function getInnovationNode(id: string): InnovationNode | undefined {
  return INNOVATION_TREE.find(node => node.id === id);
}

/**
 * 检查某项技术是否可以在给定技能等级下研究。
 * 如果技能等级低于 skillThreshold，返回 false。
 */
export function canResearch(node: InnovationNode, skillLevel: number): boolean {
  return skillLevel >= node.skillThreshold;
}

/**
 * 检查某项技术的所有前置技术是否都已满足（传入已解锁技术 id 集合）。
 */
export function prereqsSatisfied(
  node: InnovationNode,
  unlocked: Set<string>,
): boolean {
  return node.requires.every(req => unlocked.has(req));
}

/**
 * 计算某项技术的依赖深度（从根节点到该节点的最长路径）。
 * 无依赖的技术深度为 0。
 * 外部依赖（不在本树中的前置技术）被忽略。
 */
export function getDependencyDepth(
  node: InnovationNode,
  cache: Map<string, number> = new Map(),
): number {
  if (cache.has(node.id)) {
    return cache.get(node.id)!;
  }
  if (node.requires.length === 0) {
    cache.set(node.id, 0);
    return 0;
  }
  const internalDepths = node.requires
    .map(reqId => {
      const parent = getInnovationNode(reqId);
      return parent ? getDependencyDepth(parent, cache) : -1;
    })
    .filter(d => d >= 0);

  if (internalDepths.length === 0) {
    // 所有前置都是外部依赖，视为根节点
    cache.set(node.id, 0);
    return 0;
  }

  const maxParentDepth = Math.max(...internalDepths);
  const depth = maxParentDepth + 1;
  cache.set(node.id, depth);
  return depth;
}

/**
 * 按分类返回所有技术节点。
 */
export function getNodeByCategory(
  category: TechCategory,
): InnovationNode[] {
  return INNOVATION_TREE.filter(node => node.category === category);
}

/**
 * 返回所有无前置依赖的根技术节点。
 */
export function getRootNodes(): InnovationNode[] {
  return INNOVATION_TREE.filter(node => node.requires.length === 0);
}

/**
 * 返回某项技术的直接后继（该项技术解锁后可研究的项）。
 */
export function getSuccessors(nodeId: string): InnovationNode[] {
  return INNOVATION_TREE.filter(
    node => node.requires.includes(nodeId),
  );
}

/**
 * 生成技术节点的完整描述文本。
 */
export function innovationDescription(node: InnovationNode): string {
  const prereqs =
    node.requires.length > 0
      ? `（需：${node.requires.join('、')}）`
      : '（无前置依赖）';
  const unlockedItems =
    node.unlocks.length > 0
      ? ` [解锁：${node.unlocks.join('、')}]`
      : '';
  return `${node.name} — ${node.description} [${prereqs}]${unlockedItems}`;
}

/**
 * 使用 SeededRNG 评估某项技术的实际研发成功率。
 * 考虑到前置依赖满足情况，返回研发是否成功。
 */
export function evaluateResearch(
  node: InnovationNode,
  rng: SeededRNG,
  unlocked: Set<string>,
  skillLevel: number,
): boolean {
  // 前置依赖不满足则直接失败
  if (!prereqsSatisfied(node, unlocked)) return false;
  // 技能等级不够则直接失败
  if (!canResearch(node, skillLevel)) return false;
  // 按概率判定
  return rng.chance(node.probability);
}

/**
 * 验证技术树的完整性：
 * - 每项有前置依赖的技术，其所有前置要么存在于本树中，要么是外部依赖（跨树引用）
 * - 本树内部不能有循环依赖
 * - skillThreshold 在 3–9 范围内
 * - probability 在 0–1 范围内
 * - 每项都有非空的 unlocks 列表
 *
 * 返回错误信息数组（空数组表示验证通过）。
 */
export function validateTree(): string[] {
  const errors: string[] = [];
  const idSet = new Set(INNOVATION_TREE.map(n => n.id));

  for (const node of INNOVATION_TREE) {
    // 前置技术：在本树中或允许外部引用
    for (const reqId of node.requires) {
      // 仅检查：如果 prereq 是本树中其他节点的前置依赖，但它不在树中，则是错误
      // 即：prereq 被引用但未定义
      const isExternal = !idSet.has(reqId);
      if (isExternal) {
        // 检查是否有其他节点依赖这个 prereq（说明它应该是本树的一部分）
        const isRequiredByAnother = INNOVATION_TREE.some(
          n => n.requires.includes(reqId),
        );
        if (isRequiredByAnother) {
          errors.push(
            `技术 "${node.id}" 的前置 "${reqId}" 不存在于技术树中`,
          );
        }
      }
    }

    // skillThreshold 范围检查
    if (node.skillThreshold < 3 || node.skillThreshold > 9) {
      errors.push(
        `技术 "${node.id}" 的 skillThreshold=${node.skillThreshold} 超出有效范围 3–9`,
      );
    }

    // probability 范围检查
    if (node.probability < 0 || node.probability > 1) {
      errors.push(
        `技术 "${node.id}" 的 probability=${node.probability} 超出有效范围 0–1`,
      );
    }

    // unlocks 非空检查
    if (!node.unlocks || node.unlocks.length === 0) {
      errors.push(
        `技术 "${node.id}" 的 unlocks 列表为空`,
      );
    }

    // tier 一致性检查：改良型 skillThreshold 应在 3-5，原理型应在 5-9
    if (node.tier === 'improvement') {
      if (node.skillThreshold < 3 || node.skillThreshold > 5) {
        errors.push(
          `技术 "${node.id}" 是改良型但 skillThreshold=${node.skillThreshold} 超出 3–5 范围`,
        );
      }
    }
    else {
      if (node.skillThreshold < 5 || node.skillThreshold > 9) {
        errors.push(
          `技术 "${node.id}" 是原理型但 skillThreshold=${node.skillThreshold} 超出 5–9 范围`,
        );
      }
    }
  }

  // 循环依赖检测（DFS 颜色法）
  // 只在本树节点间检测
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of INNOVATION_TREE) color.set(n.id, WHITE);

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    const node = getInnovationNode(id);
    if (!node) return false;
    for (const reqId of node.requires) {
      if (!idSet.has(reqId)) continue; // 外部依赖，跳过
      const c = color.get(reqId);
      if (c === GRAY) return true; // 发现环
      if (c === WHITE && dfs(reqId)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const node of INNOVATION_TREE) {
    if (color.get(node.id) === WHITE) {
      if (dfs(node.id)) {
        errors.push(`技术树存在循环依赖，涉及 "${node.id}"`);
        break;
      }
    }
  }

  return errors;
}
