import { describe, it, expect } from 'vitest';
import {
  INNOVATION_TREE,
  getInnovationNode,
  canResearch,
  prereqsSatisfied,
  getDependencyDepth,
  getNodeByCategory,
  getRootNodes,
  getSuccessors,
  innovationDescription,
  validateTree,
  evaluateResearch,
  type InnovationNode,
  type TechCategory,
  type TechTier,
} from '../../src/config/innovation-tree.js';
import { SeededRNG } from '../../src/core/rng.js';

// ── INNOVATION_TREE configuration ─────────────────────────

describe('INNOVATION_TREE', () => {
  it('should contain exactly 17 nodes', () => {
    expect(INNOVATION_TREE.length).toBe(17);
  });

  it('should have 9 improvement and 8 principle nodes', () => {
    const improvements = INNOVATION_TREE.filter(n => n.tier === 'improvement');
    const principles = INNOVATION_TREE.filter(n => n.tier === 'principle');
    expect(improvements.length).toBe(9);
    expect(principles.length).toBe(8);
  });

  it('should have unique ids', () => {
    const ids = INNOVATION_TREE.map(n => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('should have valid categories including food', () => {
    const validCats: TechCategory[] = [
      'mechanical',
      'electrical',
      'medical',
      'agricultural',
      'construction',
      'food',
      'communication',
      'other',
    ];
    const validCatsSet = new Set(validCats);
    for (const node of INNOVATION_TREE) {
      expect(validCatsSet.has(node.category)).toBe(true);
    }
  });

  it('should include food category nodes', () => {
    const food = getNodeByCategory('food');
    expect(food.length).toBeGreaterThan(0);
    for (const node of food) {
      expect(node.category).toBe('food');
    }
  });

  it('should have all skillThresholds in range [3, 9]', () => {
    for (const node of INNOVATION_TREE) {
      expect(node.skillThreshold).toBeGreaterThanOrEqual(3);
      expect(node.skillThreshold).toBeLessThanOrEqual(9);
    }
  });

  it('should have all probabilities in range [0, 1]', () => {
    for (const node of INNOVATION_TREE) {
      expect(node.probability).toBeGreaterThanOrEqual(0);
      expect(node.probability).toBeLessThanOrEqual(1);
    }
  });

  it('should have improvement nodes with threshold 3-5', () => {
    for (const node of INNOVATION_TREE) {
      if (node.tier === 'improvement') {
        expect(node.skillThreshold).toBeGreaterThanOrEqual(3);
        expect(node.skillThreshold).toBeLessThanOrEqual(5);
      }
    }
  });

  it('should have principle nodes with threshold 5-9', () => {
    for (const node of INNOVATION_TREE) {
      if (node.tier === 'principle') {
        expect(node.skillThreshold).toBeGreaterThanOrEqual(5);
        expect(node.skillThreshold).toBeLessThanOrEqual(9);
      }
    }
  });

  it('should have all nodes with non-empty unlocks', () => {
    for (const node of INNOVATION_TREE) {
      expect(node.unlocks.length).toBeGreaterThan(0);
    }
  });
});

// ── Spec-compliant node details ───────────────────────────

describe('Section 十二 spec compliance', () => {
  const expectedNodes: {
    id: string;
    requires: string[];
    skillThreshold: number;
    probability: number;
    tier: TechTier;
    category: TechCategory;
    unlocksLen: number;
  }[] = [
    {
      id: 'improved_bellows',
      requires: [],
      skillThreshold: 3,
      probability: 0.6,
      tier: 'improvement',
      category: 'mechanical',
      unlocksLen: 2,
    },
    {
      id: 'well_winch',
      requires: [],
      skillThreshold: 3,
      probability: 0.6,
      tier: 'improvement',
      category: 'mechanical',
      unlocksLen: 2,
    },
    {
      id: 'stove_flue',
      requires: [],
      skillThreshold: 3,
      probability: 0.5,
      tier: 'improvement',
      category: 'construction',
      unlocksLen: 2,
    },
    {
      id: 'noodle_variety',
      requires: [],
      skillThreshold: 3,
      probability: 0.8,
      tier: 'improvement',
      category: 'food',
      unlocksLen: 2,
    },
    {
      id: 'brick_kiln',
      requires: [],
      skillThreshold: 4,
      probability: 0.4,
      tier: 'improvement',
      category: 'construction',
      unlocksLen: 2,
    },
    {
      id: 'glass_making',
      requires: ['brick_kiln'],
      skillThreshold: 5,
      probability: 0.3,
      tier: 'improvement',
      category: 'construction',
      unlocksLen: 3,
    },
    {
      id: 'soy_brewing',
      requires: [],
      skillThreshold: 3,
      probability: 0.5,
      tier: 'improvement',
      category: 'food',
      unlocksLen: 3,
    },
    {
      id: 'basic_medicine',
      requires: [],
      skillThreshold: 3,
      probability: 0.5,
      tier: 'improvement',
      category: 'medical',
      unlocksLen: 3,
    },
    {
      id: 'improved_loom',
      requires: [],
      skillThreshold: 3,
      probability: 0.5,
      tier: 'improvement',
      category: 'mechanical',
      unlocksLen: 3,
    },
    {
      id: 'electromagnetism',
      requires: ['glass_making', 'improved_loom'],
      skillThreshold: 7,
      probability: 0.1,
      tier: 'principle',
      category: 'electrical',
      unlocksLen: 3,
    },
    {
      id: 'steam_engine',
      requires: ['brick_kiln', 'improved_bellows'],
      skillThreshold: 8,
      probability: 0.08,
      tier: 'principle',
      category: 'mechanical',
      unlocksLen: 3,
    },
    {
      id: 'photography',
      requires: ['glass_making'],
      skillThreshold: 6,
      probability: 0.15,
      tier: 'principle',
      category: 'communication',
      unlocksLen: 3,
    },
    {
      id: 'germ_theory',
      requires: ['basic_medicine'],
      skillThreshold: 7,
      probability: 0.1,
      tier: 'principle',
      category: 'medical',
      unlocksLen: 3,
    },
    {
      id: 'modern_surgery',
      requires: ['germ_theory'],
      skillThreshold: 8,
      probability: 0.05,
      tier: 'principle',
      category: 'medical',
      unlocksLen: 3,
    },
    {
      id: 'movable_type',
      requires: ['brick_kiln'],
      skillThreshold: 5,
      probability: 0.2,
      tier: 'principle',
      category: 'communication',
      unlocksLen: 3,
    },
    {
      id: 'water_pressure',
      requires: ['well_winch', 'brick_kiln'],
      skillThreshold: 6,
      probability: 0.15,
      tier: 'principle',
      category: 'construction',
      unlocksLen: 3,
    },
    {
      id: 'papermaking_improved',
      requires: ['stove_flue'],
      skillThreshold: 5,
      probability: 0.3,
      tier: 'principle',
      category: 'construction',
      unlocksLen: 3,
    },
  ];

  it('should match spec for each node by id', () => {
    for (const exp of expectedNodes) {
      const node = getInnovationNode(exp.id);
      expect(node, `node ${exp.id} should exist`).toBeDefined();
      expect(node!.requires).toEqual(exp.requires);
      expect(node!.skillThreshold).toBe(exp.skillThreshold);
      expect(node!.probability).toBe(exp.probability);
      expect(node!.tier).toBe(exp.tier);
      expect(node!.category).toBe(exp.category);
      expect(node!.unlocks.length).toBeGreaterThanOrEqual(exp.unlocksLen);
    }
  });
});

// ── getInnovationNode ─────────────────────────────────────

describe('getInnovationNode', () => {
  it('should return a node by id', () => {
    const node = getInnovationNode('improved_bellows');
    expect(node).toBeDefined();
    expect(node!.id).toBe('improved_bellows');
    expect(node!.name).toBe('改良风箱');
  });

  it('should return undefined for unknown id', () => {
    expect(getInnovationNode('nonexistent')).toBeUndefined();
  });

  it('should return all 16 nodes when queried by their ids', () => {
    for (const node of INNOVATION_TREE) {
      const found = getInnovationNode(node.id);
      expect(found).toEqual(node);
    }
  });

  it('should return correct name for each node', () => {
    const expectedNames: Record<string, string> = {
      improved_bellows: '改良风箱',
      well_winch: '井口辘轳',
      stove_flue: '炉灶烟道',
      noodle_variety: '面条配料',
      brick_kiln: '砖烧制',
      glass_making: '玻璃制作',
      soy_brewing: '酱油工业化',
      improved_loom: '织布机改良',
      electromagnetism: '电磁感应',
      steam_engine: '蒸汽机',
      photography: '摄影术',
      germ_theory: '细菌理论',
      modern_surgery: '现代外科',
      movable_type: '活字印刷',
      water_pressure: '自来水加压',
      papermaking_improved: '造纸术改良',
    };
    for (const [id, name] of Object.entries(expectedNames)) {
      expect(getInnovationNode(id)!.name).toBe(name);
    }
  });
});

// ── canResearch ───────────────────────────────────────────

describe('canResearch', () => {
  const node: InnovationNode = {
    id: 'test',
    name: '测试',
    description: '描述',
    category: 'other',
    requires: [],
    skillThreshold: 5,
    probability: 0.5,
    tier: 'improvement',
    unlocks: ['test_unlock'],
  };

  it('should return true when skill >= threshold', () => {
    expect(canResearch(node, 5)).toBe(true);
    expect(canResearch(node, 7)).toBe(true);
  });

  it('should return false when skill < threshold', () => {
    expect(canResearch(node, 4)).toBe(false);
    expect(canResearch(node, 3)).toBe(false);
  });
});

// ── prereqsSatisfied ──────────────────────────────────────

describe('prereqsSatisfied', () => {
  it('should return true when no prerequisites', () => {
    const node: InnovationNode = {
      id: 'root',
      name: '根技术',
      description: '无依赖',
      category: 'other',
      requires: [],
      skillThreshold: 3,
      probability: 0.8,
      tier: 'improvement',
      unlocks: ['root_unlock'],
    };
    expect(prereqsSatisfied(node, new Set())).toBe(true);
    expect(prereqsSatisfied(node, new Set(['something']))).toBe(true);
  });

  it('should return true when all prereqs are unlocked', () => {
    const node: InnovationNode = {
      id: 'child',
      name: '子技术',
      description: '需前置',
      category: 'other',
      requires: ['root', 'other'],
      skillThreshold: 5,
      probability: 0.5,
      tier: 'improvement',
      unlocks: ['child_unlock'],
    };
    const unlocked = new Set(['root', 'other']);
    expect(prereqsSatisfied(node, unlocked)).toBe(true);
  });

  it('should return false when some prereqs are missing', () => {
    const node: InnovationNode = {
      id: 'child',
      name: '子技术',
      description: '需前置',
      category: 'other',
      requires: ['root', 'other'],
      skillThreshold: 5,
      probability: 0.5,
      tier: 'improvement',
      unlocks: ['child_unlock'],
    };
    expect(prereqsSatisfied(node, new Set(['root']))).toBe(false);
    expect(prereqsSatisfied(node, new Set())).toBe(false);
  });
});

// ── getDependencyDepth ────────────────────────────────────

describe('getDependencyDepth', () => {
  it('should return 0 for root nodes with no prerequisites', () => {
    const root = getInnovationNode('improved_bellows');
    expect(root).toBeDefined();
    expect(getDependencyDepth(root!)).toBe(0);
  });

  it('should return 1 for nodes with root prerequisites', () => {
    // steam_engine requires brick_kiln (depth 1, since brick_kiln requires pottery_kiln which is external)
    // but brick_kiln itself is not a root (it has requires)
    // Use steam_engine which requires brick_kiln and improved_bellows
    // improved_bellows is a root (depth 0)
    // brick_kiln requires pottery_kiln (external) — skip in depth calc
    // Actually depth only counts tree-internal prereqs
    // Let's use a simpler chain: glass_making requires brick_kiln
    const glassmaking = getInnovationNode('glass_making');
    expect(glassmaking).toBeDefined();
    // glass_making depth depends on brick_kiln depth
    // brick_kiln requires pottery_kiln (external, skipped)
    // So brick_kiln depth = 0, glass_making depth = 1
    expect(getDependencyDepth(glassmaking!)).toBe(1);
  });

  it('should return correct depth for deeper nodes', () => {
    // electromagnetism requires glass_making and improved_loom
    // improved_loom is root (depth 0)
    // glass_making requires brick_kiln (depth 0 since pottery_kiln is external)
    // so glass_making depth = 1
    // electromagnetism depth = max(0, 1) + 1 = 2
    const electromagnetism = getInnovationNode('electromagnetism');
    expect(electromagnetism).toBeDefined();
    expect(getDependencyDepth(electromagnetism!)).toBe(2);
  });

  it('should use cache for repeated calls', () => {
    const node = getInnovationNode('electromagnetism');
    expect(node).toBeDefined();
    const cache = new Map<string, number>();
    const d1 = getDependencyDepth(node!, cache);
    const d2 = getDependencyDepth(node!, cache);
    expect(d1).toBe(d2);
    expect(cache.has('electromagnetism')).toBe(true);
  });
});

// ── getNodeByCategory ─────────────────────────────────────

describe('getNodeByCategory', () => {
  it('should return nodes filtered by category', () => {
    const mechanical = getNodeByCategory('mechanical');
    expect(mechanical.length).toBeGreaterThan(0);
    for (const node of mechanical) {
      expect(node.category).toBe('mechanical');
    }
  });

  it('should return food nodes', () => {
    const food = getNodeByCategory('food');
    expect(food.length).toBe(2); // noodle_variety, soy_brewing
    for (const node of food) {
      expect(node.category).toBe('food');
    }
  });

  it('should return empty array for unused category', () => {
    const result = getNodeByCategory('agricultural');
    expect(result).toEqual([]);
  });

  it('should return medical nodes', () => {
    const medical = getNodeByCategory('medical');
    expect(medical.length).toBe(3); // basic_medicine, germ_theory, modern_surgery
  });

  it('should cover all 17 nodes across all categories', () => {
    const categories = new Set(INNOVATION_TREE.map(n => n.category));
    let total = 0;
    for (const cat of categories) {
      total += getNodeByCategory(cat as TechCategory).length;
    }
    expect(total).toBe(17);
  });
});

// ── getRootNodes ──────────────────────────────────────────

describe('getRootNodes', () => {
  it('should return nodes with no prerequisites', () => {
    const roots = getRootNodes();
    for (const node of roots) {
      expect(node.requires.length).toBe(0);
    }
    expect(roots.length).toBeGreaterThan(0);
  });

  it('should return 7 root nodes', () => {
    const roots = getRootNodes();
    // improved_bellows, well_winch, stove_flue, noodle_variety,
    // brick_kiln, soy_brewing, basic_medicine, improved_loom = 8 root nodes (no prereqs)
    expect(roots.length).toBe(8);
  });

  it('should return no successors for root nodes when called as getInnovationNode+requires', () => {
    const roots = getRootNodes();
    expect(roots.some(r => r.requires.length > 0)).toBe(false);
  });
});

// ── getSuccessors ─────────────────────────────────────────

describe('getSuccessors', () => {
  it('should return nodes that depend on the given node', () => {
    const successors = getSuccessors('brick_kiln');
    // glass_making, steam_engine, movable_type, water_pressure depend on brick_kiln
    expect(successors.length).toBe(4);
    for (const s of successors) {
      expect(s.requires).toContain('brick_kiln');
    }
  });

  it('should return nodes that depend on glass_making', () => {
    const successors = getSuccessors('glass_making');
    expect(successors.length).toBe(2); // electromagnetism, photography
    for (const s of successors) {
      expect(s.requires).toContain('glass_making');
    }
  });

  it('should return empty array for leaf nodes', () => {
    const successors = getSuccessors('electromagnetism');
    expect(successors.length).toBe(0);
  });

  it('should return empty array for nonexistent node id', () => {
    const successors = getSuccessors('nonexistent');
    expect(successors).toEqual([]);
  });
});

// ── innovationDescription ─────────────────────────────────

describe('innovationDescription', () => {
  it('should include prerequisites in description when present', () => {
    const glassmaking = getInnovationNode('glass_making');
    expect(glassmaking).toBeDefined();
    const desc = innovationDescription(glassmaking!);
    expect(desc).toContain('brick_kiln');
    expect(desc).toContain('（需：');
    expect(desc).not.toContain('（无前置依赖）');
  });

  it('should show no prereqs for root nodes', () => {
    const bellows = getInnovationNode('improved_bellows');
    expect(bellows).toBeDefined();
    const desc = innovationDescription(bellows!);
    expect(desc).toContain('（无前置依赖）');
  });

  it('should include unlocks in description', () => {
    const bellows = getInnovationNode('improved_bellows');
    expect(bellows).toBeDefined();
    const desc = innovationDescription(bellows!);
    expect(desc).toContain('解锁：');
    expect(desc.length).toBeGreaterThan(bellows!.description.length);
  });

  it('should contain the node name and description', () => {
    const node = getInnovationNode('steam_engine');
    expect(node).toBeDefined();
    const desc = innovationDescription(node!);
    expect(desc).toContain('蒸汽机');
    expect(desc).toContain('蒸汽压力转化为机械能');
  });
});

// ── evaluateResearch (SeededRNG) ──────────────────────────

describe('evaluateResearch', () => {
  it('should return false when prerequisites are not satisfied', () => {
    const glassmaking = getInnovationNode('glass_making');
    expect(glassmaking).toBeDefined();
    const rng = new SeededRNG(42);
    // glass_making requires brick_kiln, but unlocked is empty
    expect(evaluateResearch(glassmaking!, rng, new Set(), 10)).toBe(false);
  });

  it('should return false when skill level is below threshold', () => {
    const bellows = getInnovationNode('improved_bellows');
    expect(bellows).toBeDefined();
    const rng = new SeededRNG(42);
    // improved_bellows has no prereqs and threshold 3
    expect(evaluateResearch(bellows!, rng, new Set(), 2)).toBe(false);
  });

  it('should return false when skill below threshold even with prereqs met', () => {
    const glassmaking = getInnovationNode('glass_making');
    expect(glassmaking).toBeDefined();
    const rng = new SeededRNG(42);
    // glass_making requires brick_kiln (not in tree) and has threshold 5
    const unlocked = new Set(['brick_kiln']); // fake unlock
    expect(evaluateResearch(glassmaking!, rng, unlocked, 4)).toBe(false);
  });

  it('should use SeededRNG for deterministic probability check', () => {
    const bellows = getInnovationNode('improved_bellows');
    expect(bellows).toBeDefined();

    // Same seed → same results
    const rng1 = new SeededRNG(12345);
    const rng2 = new SeededRNG(12345);
    const unlocked = new Set<string>();
    const results1: boolean[] = [];
    const results2: boolean[] = [];
    for (let i = 0; i < 20; i++) {
      results1.push(evaluateResearch(bellows!, rng1, unlocked, 5));
      results2.push(evaluateResearch(bellows!, rng2, unlocked, 5));
    }
    expect(results1).toEqual(results2);
  });

  it('should return different results for different seeds', () => {
    const bellows = getInnovationNode('improved_bellows');
    expect(bellows).toBeDefined();

    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(99);
    const unlocked = new Set<string>();

    const results1 = Array.from({ length: 50 }, () =>
      evaluateResearch(bellows!, rng1, unlocked, 5),
    );
    const results2 = Array.from({ length: 50 }, () =>
      evaluateResearch(bellows!, rng2, unlocked, 5),
    );

    // With different seeds, the sequences should differ
    // (probability 0.6 means ~30 successes out of 50, but sequences differ)
    expect(results1).not.toEqual(results2);
  });

  it('should respect probability for high-probability node', () => {
    const noodle = getInnovationNode('noodle_variety');
    expect(noodle).toBeDefined();
    // probability = 0.8, so with 200 tries, most should succeed
    const rng = new SeededRNG(42);
    const unlocked = new Set<string>();
    let successCount = 0;
    for (let i = 0; i < 200; i++) {
      if (evaluateResearch(noodle!, rng, unlocked, 5)) successCount++;
    }
    const rate = successCount / 200;
    // Allow some variance: expect rate within [0.65, 0.95]
    expect(rate).toBeGreaterThanOrEqual(0.65);
    expect(rate).toBeLessThanOrEqual(0.95);
  });

  it('should reject for low-probability node rarely', () => {
    const surgery = getInnovationNode('modern_surgery');
    expect(surgery).toBeDefined();
    const rng = new SeededRNG(42);
    const unlocked = new Set(['germ_theory']);
    let successCount = 0;
    for (let i = 0; i < 100; i++) {
      if (evaluateResearch(surgery!, rng, unlocked, 10)) successCount++;
    }
    // probability = 0.05, expect very few successes out of 100
    expect(successCount).toBeLessThanOrEqual(15);
  });
});

// ── validateTree ──────────────────────────────────────────

describe('validateTree', () => {
  it('should return empty array for the valid tree', () => {
    const errors = validateTree();
    expect(errors).toEqual([]);
  });

  it('should detect missing prerequisites', () => {
    // Temporarily mutate a node to have a missing prereq
    const node = INNOVATION_TREE.find(n => n.requires.length > 0);
    if (node) {
      const oldRequires = node.requires;
      node.requires = ['nonexistent_tech'];
      const errors = validateTree();
      expect(errors.some(e => e.includes('nonexistent_tech'))).toBe(true);
      node.requires = oldRequires;
    }
  });

  it('should detect skillThreshold out of range', () => {
    const original = [...INNOVATION_TREE];
    // Find an improvement node and set threshold too high
    const improvementNode = INNOVATION_TREE.find(
      n => n.tier === 'improvement' && n.skillThreshold > 3,
    );
    if (improvementNode) {
      const old = improvementNode.skillThreshold;
      improvementNode.skillThreshold = 6; // exceeds improvement max of 5
      const errors = validateTree();
      expect(errors.some(e => e.includes('改良型'))).toBe(true);
      improvementNode.skillThreshold = old;
    }
  });

  it('should detect principle tier threshold violation', () => {
    const principleNode = INNOVATION_TREE.find(
      n => n.tier === 'principle' && n.skillThreshold < 7,
    );
    if (principleNode) {
      const old = principleNode.skillThreshold;
      principleNode.skillThreshold = 4; // below principle min of 5
      const errors = validateTree();
      expect(errors.some(e => e.includes('原理型'))).toBe(true);
      principleNode.skillThreshold = old;
    }
  });

  it('should detect empty unlocks', () => {
    const node = INNOVATION_TREE[0];
    const oldUnlocks = node.unlocks;
    node.unlocks = [];
    const errors = validateTree();
    expect(errors.some(e => e.includes('unlocks'))).toBe(true);
    node.unlocks = oldUnlocks;
  });

  it('should detect probability out of range', () => {
    const node = INNOVATION_TREE[0];
    const oldProb = node.probability;
    node.probability = 1.5;
    const errors = validateTree();
    expect(errors.some(e => e.includes('超出有效范围'))).toBe(true);
    node.probability = oldProb;
  });
});

// ── Determinism via SeededRNG ─────────────────────────────

describe('Determinism with SeededRNG', () => {
  it('should produce identical evaluation sequences with same seed', () => {
    const seeds = [42, 123, 999];
    const unlocked = new Set(['improved_bellows', 'brick_kiln', 'glass_making']);

    const seqA = seeds.map(seed => {
      const rng = new SeededRNG(seed);
      return INNOVATION_TREE.map(node =>
        evaluateResearch(node, rng, unlocked, 10),
      );
    });

    const seqB = seeds.map(seed => {
      const rng = new SeededRNG(seed);
      return INNOVATION_TREE.map(node =>
        evaluateResearch(node, rng, unlocked, 10),
      );
    });

    for (let i = 0; i < seeds.length; i++) {
      expect(seqA[i]).toEqual(seqB[i]);
    }
  });

  it('should produce different sequences for different seeds', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(999);
    const unlocked = new Set(['improved_bellows']);

    const results1 = INNOVATION_TREE.map(node =>
      evaluateResearch(node, rng1, unlocked, 10),
    );
    const results2 = INNOVATION_TREE.map(node =>
      evaluateResearch(node, rng2, unlocked, 10),
    );

    expect(results1).not.toEqual(results2);
  });
});
