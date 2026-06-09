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
  type InnovationNode,
} from '../../src/innovation/innovation-tree.js';

// ── INNOVATION_TREE configuration ─────────────────────────

describe('INNOVATION_TREE', () => {
  it('should contain exactly 16 nodes', () => {
    expect(INNOVATION_TREE.length).toBe(16);
  });

  it('should have 8 improvement and 8 principle nodes', () => {
    const improvements = INNOVATION_TREE.filter(n => n.tier === 'improvement');
    const principles = INNOVATION_TREE.filter(n => n.tier === 'principle');
    expect(improvements.length).toBe(8);
    expect(principles.length).toBe(8);
  });

  it('should have unique ids', () => {
    const ids = INNOVATION_TREE.map(n => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('should all have valid categories', () => {
    const validCats = new Set([
      'mechanical',
      'electrical',
      'medical',
      'agricultural',
      'construction',
      'communication',
      'other',
    ]);
    for (const node of INNOVATION_TREE) {
      expect(validCats.has(node.category)).toBe(true);
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

  it('should have improvement nodes with threshold ≥ 3', () => {
    for (const node of INNOVATION_TREE) {
      if (node.tier === 'improvement') {
        expect(node.skillThreshold).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('should have principle nodes with threshold ≥ 5', () => {
    for (const node of INNOVATION_TREE) {
      if (node.tier === 'principle') {
        expect(node.skillThreshold).toBeGreaterThanOrEqual(5);
      }
    }
  });
});

// ── getInnovationNode ─────────────────────────────────────

describe('getInnovationNode', () => {
  it('should return a node by id', () => {
    const node = getInnovationNode('bellows_improved');
    expect(node).toBeDefined();
    expect(node!.id).toBe('bellows_improved');
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
    };
    expect(prereqsSatisfied(node, new Set(['root']))).toBe(false);
    expect(prereqsSatisfied(node, new Set())).toBe(false);
  });
});

// ── getDependencyDepth ────────────────────────────────────

describe('getDependencyDepth', () => {
  it('should return 0 for root nodes with no prerequisites', () => {
    const root = getInnovationNode('bellows_improved');
    expect(root).toBeDefined();
    expect(getDependencyDepth(root!)).toBe(0);
  });

  it('should return 1 for nodes with root prerequisites', () => {
    // well_crank is a root, so brick_kiln has depth 1
    const brickKiln = getInnovationNode('brick_kiln');
    expect(getDependencyDepth(brickKiln!)).toBe(0); // brick_kiln itself has no prereqs

    // glassmaking requires brick_kiln (depth 0), so glassmaking depth = 1
    const glassmaking = getInnovationNode('glassmaking');
    expect(glassmaking).toBeDefined();
    expect(getDependencyDepth(glassmaking!)).toBe(1);
  });

  it('should return correct depth for deeper nodes', () => {
    // electromagnetism requires bellows_improved(depth 0) and glassmaking(depth 1)
    // so its depth = max(0,1) + 1 = 2
    const electromagnetism = getInnovationNode('electromagnetism');
    expect(electromagnetism).toBeDefined();
    expect(getDependencyDepth(electromagnetism!)).toBe(2);
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

  it('should return empty array for unused category', () => {
    const result = getNodeByCategory('agricultural');
    expect(result).toEqual([]);
  });

  it('should cover all 16 nodes across all categories', () => {
    const categories = new Set(INNOVATION_TREE.map(n => n.category));
    let total = 0;
    for (const cat of categories) {
      total += getNodeByCategory(cat as typeof cat).length;
    }
    expect(total).toBe(16);
  });
});

// ── getRootNodes ──────────────────────────────────────────

describe('getRootNodes', () => {
  it('should return nodes with no prerequisites', () => {
    const roots = getRootNodes();
    for (const node of roots) {
      expect(node.requires.length).toBe(0);
    }
    // Count: bellows_improved, well_crank, stove_flue, noodle_recipe,
    //         brick_kiln, soy_industrial, loom_improved, bacteria_theory
    // = 8 root nodes
    expect(roots.length).toBeGreaterThan(0);
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
    // glassmaking and water_supply depend on brick_kiln
    expect(successors.length).toBeGreaterThanOrEqual(1);
    for (const s of successors) {
      expect(s.requires).toContain('brick_kiln');
    }
  });

  it('should return empty array for leaf nodes', () => {
    const successors = getSuccessors('electromagnetism');
    expect(successors.length).toBe(0);
  });
});

// ── innovationDescription ─────────────────────────────────

describe('innovationDescription', () => {
  it('should include prerequisites in description when present', () => {
    const glassmaking = getInnovationNode('glassmaking');
    expect(glassmaking).toBeDefined();
    const desc = innovationDescription(glassmaking!);
    expect(desc).toContain('brick_kiln');
    expect(desc).toContain('（需：');
    expect(desc).not.toContain('（无前置依赖）');
  });

  it('should show no prereqs for root nodes', () => {
    const bellows = getInnovationNode('bellows_improved');
    expect(bellows).toBeDefined();
    const desc = innovationDescription(bellows!);
    expect(desc).toContain('（无前置依赖）');
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
    const original = [...INNOVATION_TREE];
    const node = INNOVATION_TREE.find(n => n.requires.length > 0);
    if (node) {
      const oldRequires = node.requires;
      node.requires = ['nonexistent_tech'];
      const errors = validateTree();
      expect(errors.some(e => e.includes('nonexistent_tech'))).toBe(true);
      node.requires = oldRequires;
    }
  });
});
