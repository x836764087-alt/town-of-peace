/**
 * 技术依赖树 — 16 项可发明的技术
 *
 * 分两个层级：
 * - 改良型 (tier = 'improvement')：需要 skillThreshold ≥ 3
 * - 原理型 (tier = 'principle')：需要 skillThreshold ≥ 5
 *
 * 每项技术通过 requires[] 声明前置依赖，不允许跳步。
 */

/** 技术分类 */
export type TechCategory =
  | 'mechanical'
  | 'electrical'
  | 'medical'
  | 'agricultural'
  | 'construction'
  | 'communication'
  | 'other';

/** 技术层级：改良型 vs 原理型 */
export type TechTier = 'improvement' | 'principle';

/** 技术节点定义（配置阶段使用，不含运行时状态） */
export interface InnovationNode {
  /** 唯一标识符，如 `'bellows_improved'` */
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
}

/** 全部 16 项技术节点的配置数据 */
export const INNOVATION_TREE: InnovationNode[] = [
  // === 改良型 (Lv.3+) ===
  {
    id: 'bellows_improved',
    name: '改良风箱',
    category: 'mechanical',
    description: '改进鼓风装置，提高熔炉温度，使冶铁更高效',
    requires: [],
    skillThreshold: 3,
    probability: 0.60,
    tier: 'improvement',
  },
  {
    id: 'well_crank',
    name: '井口辘轳',
    category: 'mechanical',
    description: '在井口安装辘轳装置，大幅提高提水效率',
    requires: [],
    skillThreshold: 3,
    probability: 0.65,
    tier: 'improvement',
  },
  {
    id: 'stove_flue',
    name: '炉灶烟道',
    category: 'construction',
    description: '改良灶台烟道设计，节约燃料并提高热效率',
    requires: [],
    skillThreshold: 3,
    probability: 0.70,
    tier: 'improvement',
  },
  {
    id: 'noodle_recipe',
    name: '面条配料',
    category: 'other',
    description: '发现多种面条配料搭配，丰富食物口味',
    requires: [],
    skillThreshold: 3,
    probability: 0.80,
    tier: 'improvement',
  },
  {
    id: 'brick_kiln',
    name: '砖烧制',
    category: 'construction',
    description: '掌握砖块烧制技术，建筑更坚固耐用',
    requires: [],
    skillThreshold: 4,
    probability: 0.55,
    tier: 'improvement',
  },
  {
    id: 'glassmaking',
    name: '玻璃制作',
    category: 'construction',
    description: '利用沙子和石灰烧制透明玻璃',
    requires: ['brick_kiln'],
    skillThreshold: 5,
    probability: 0.45,
    tier: 'improvement',
  },
  {
    id: 'soy_industrial',
    name: '酱油醋工业化',
    category: 'other',
    description: '将传统酿造工艺标准化，实现批量生产',
    requires: [],
    skillThreshold: 4,
    probability: 0.55,
    tier: 'improvement',
  },
  {
    id: 'loom_improved',
    name: '织布机改良',
    category: 'mechanical',
    description: '改进织布机结构，提高布匹产量和质量',
    requires: [],
    skillThreshold: 4,
    probability: 0.50,
    tier: 'improvement',
  },
  // === 原理型 (Lv.5+) ===
  {
    id: 'electromagnetism',
    name: '电磁感应',
    category: 'electrical',
    description: '发现电磁感应原理，为后续电气技术奠基',
    requires: ['bellows_improved', 'glassmaking'],
    skillThreshold: 6,
    probability: 0.30,
    tier: 'principle',
  },
  {
    id: 'steam_engine',
    name: '蒸汽机',
    category: 'mechanical',
    description: '利用蒸汽压力驱动机械，大幅提升生产力',
    requires: ['bellows_improved', 'stove_flue', 'loom_improved'],
    skillThreshold: 7,
    probability: 0.25,
    tier: 'principle',
  },
  {
    id: 'photography',
    name: '摄影术',
    category: 'other',
    description: '利用化学反应记录影像，开启新的记录方式',
    requires: ['glassmaking'],
    skillThreshold: 6,
    probability: 0.35,
    tier: 'principle',
  },
  {
    id: 'bacteria_theory',
    name: '细菌理论',
    category: 'medical',
    description: '发现微生物致病原理，推动现代医学发展',
    requires: [],
    skillThreshold: 6,
    probability: 0.35,
    tier: 'principle',
  },
  {
    id: 'modern_surgery',
    name: '现代外科',
    category: 'medical',
    description: '建立无菌手术流程，大幅提升救治成功率',
    requires: ['bacteria_theory'],
    skillThreshold: 7,
    probability: 0.25,
    tier: 'principle',
  },
  {
    id: 'movable_type',
    name: '活字印刷',
    category: 'communication',
    description: '发明活字排版技术，书籍传播效率大幅提升',
    requires: [],
    skillThreshold: 5,
    probability: 0.45,
    tier: 'principle',
  },
  {
    id: 'water_supply',
    name: '自来水加压',
    category: 'construction',
    description: '建立加压供水系统，改善居民生活卫生条件',
    requires: ['well_crank', 'brick_kiln'],
    skillThreshold: 6,
    probability: 0.35,
    tier: 'principle',
  },
  {
    id: 'papermaking_improved',
    name: '造纸术改良',
    category: 'communication',
    description: '改进造纸原料和工艺，纸张质量大幅提升',
    requires: ['movable_type'],
    skillThreshold: 6,
    probability: 0.40,
    tier: 'principle',
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
  const maxParentDepth = Math.max(
    ...node.requires.map(
      reqId => getDependencyDepth(getInnovationNode(reqId)!, cache),
    ),
  );
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
  return `${node.name} — ${node.description} [${prereqs}]`;
}

/**
 * 验证技术树的完整性：
 * - 每项有前置依赖的技术，其所有前置必须存在于树中
 * - 不能有循环依赖
 * - skillThreshold 在 3–9 范围内
 * - probability 在 0–1 范围内
 *
 * 返回错误信息数组（空数组表示验证通过）。
 */
export function validateTree(): string[] {
  const errors: string[] = [];
  const idSet = new Set(INNOVATION_TREE.map(n => n.id));

  for (const node of INNOVATION_TREE) {
    // 前置技术必须在树中
    for (const reqId of node.requires) {
      if (!idSet.has(reqId)) {
        errors.push(
          `技术 "${node.id}" 的前置 "${reqId}" 不存在于技术树中`,
        );
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
  }

  // 循环依赖检测（DFS 颜色法）
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of INNOVATION_TREE) color.set(n.id, WHITE);

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    const node = getInnovationNode(id);
    if (!node) return false;
    for (const reqId of node.requires) {
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
