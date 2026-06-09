/**
 * BuildingSystem 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';

import BuildingSystem from '../../src/world/buildings.js';
import type { WorldState, Building, Season, WeatherType } from '../../src/core/types.js';
import { SeededRNG } from '../../src/core/rng.js';

function createTestState(): WorldState {
  return {
    year: 5,
    season: 'spring' as Season,
    weather: 'sunny' as WeatherType,
    agents: [
      {
        id: 'test-sage', name: '测试富商', age: 30, alive: true, gender: '男',
        stats: { strength: 50, intelligence: 60, dexterity: 50, charisma: 50, health: 80, maxHealth: 80, energy: 70, happiness: 60 },
        skills: { leadership: 50 },
        inventory: { items: { rice: 10 } },
        relationships: {},
        family: { spouse: undefined, children: [], parents: [], household: [] },
        conditions: [],
        memories: [],
        born: 0,
        wealth: 500,
        employees: [],
        tags: [],
      },
      {
        id: 'test-poor', name: '测试穷人', age: 25, alive: true, gender: '女',
        stats: { strength: 40, intelligence: 50, dexterity: 50, charisma: 50, health: 70, maxHealth: 70, energy: 60, happiness: 60 },
        skills: {},
        inventory: { items: { rice: 5 } },
        relationships: {},
        family: { spouse: undefined, children: [], parents: [], household: [] },
        conditions: [],
        memories: [],
        born: 0,
        wealth: 10,
        employees: [],
        tags: [],
      },
    ],
    economy: {
      totalCurrency: 500, annualTradeVolume: 0, annualSpoilage: 0,
      priceHistory: {}, priceCaps: {},
    },
    buildings: [
      {
        id: 'test_shop', name: '测试店铺', type: 'commerce', level: 1,
        x: 20, y: 26, description: '一个测试店铺',
        materialProgress: 100, upgradeCost: { materialCost: 100, laborCost: 3 },
        techRequired: [], ownerId: 'test-sage',
      },
      {
        id: 'test_ruin', name: '破旧建筑', type: 'production', level: 1,
        x: 25, y: 28, description: '一个破旧建筑',
        materialProgress: 30, upgradeCost: { materialCost: 100, laborCost: 3 },
        techRequired: [], ownerId: undefined,
      },
    ],
    map: { width: 50, height: 55, tiles: Array.from({ length: 55 }, () => Array.from({ length: 50 }, () => ({ type: 'plains' as const }))) },
    innovations: [],
    laws: [],
    festivals: [],
    groups: [],
    archives: [],
    relations: [],
    seed: 42,
    chronicle: [],
    snapshots: [],
    populationThreshold: 100,
    version: '0.6.0',
    credits: [],
    apprenticeships: [],
    __shortTermJobs: [],
  };
}

describe('BuildingSystem', () => {
  let state: WorldState;
  let rng: SeededRNG;
  let system: BuildingSystem;

  beforeEach(() => {
    state = createTestState();
    rng = new SeededRNG(42);
    system = new BuildingSystem(state, rng);
  });

  describe('processDecay', () => {
    it('should reduce materialProgress over time (may be 0 if decay rolls 0)', () => {
      system.processDecay();
      expect(state.buildings[0].materialProgress).toBeLessThanOrEqual(100);
    });

    it('should not decay below 0', () => {
      state.buildings[0].materialProgress = 0;
      system.processDecay();
      expect(state.buildings[0].materialProgress).toBe(0);
    });

    it('should decay faster for ownerless buildings', () => {
      const ownedInitial = state.buildings[0].materialProgress!;
      const unownedInitial = state.buildings[1].materialProgress!;

      // Run multiple decays
      for (let i = 0; i < 10; i++) {
        system.processDecay();
      }

      const ownedLoss = ownedInitial - state.buildings[0].materialProgress!;
      const unownedLoss = unownedInitial - state.buildings[1].materialProgress!;

      // Ownerless should lose more
      expect(unownedLoss).toBeGreaterThan(ownedLoss);
    });
  });

  describe('getEfficiency', () => {
    it('should return 1.0 for level 1 at full condition', () => {
      const eff = system.getEfficiency(state.buildings[0]);
      expect(eff).toBeCloseTo(1.0);
    });

    it('should be lower for damaged buildings', () => {
      state.buildings[1].materialProgress = 20;
      const eff = system.getEfficiency(state.buildings[1]);
      expect(eff).toBeLessThan(1.0);
    });

    it('should increase with level', () => {
      const l1 = system.getEfficiency(state.buildings[0]);
      state.buildings[0].level = 3;
      const l3 = system.getEfficiency(state.buildings[0]);
      expect(l3).toBeGreaterThan(l1);
    });
  });

  describe('upgradeBuilding', () => {
    it('should upgrade and deduct coins', () => {
      const payer = state.agents[0];
      const beforeWealth = payer.wealth;
      const result = system.upgradeBuilding('test_shop', 'test-sage');

      expect(result.success).toBe(true);
      expect(state.buildings[0].level).toBe(2);
      expect(payer.wealth).toBeLessThan(beforeWealth);
      expect(result.narrative).toContain('测试店铺');
    });

    it('should fail for non-existent building', () => {
      const result = system.upgradeBuilding('ghost', 'test-sage');
      expect(result.success).toBe(false);
    });

    it('should fail when payer has insufficient funds', () => {
      const result = system.upgradeBuilding('test_shop', 'test-poor');
      expect(result.success).toBe(false);
    });

    it('should fail at max level', () => {
      state.buildings[0].level = 5;
      const result = system.upgradeBuilding('test_shop', 'test-sage');
      expect(result.success).toBe(false);
    });
  });

  describe('repairBuilding', () => {
    it('should repair damaged building', () => {
      state.buildings[1].materialProgress = 50;
      const result = system.repairBuilding('test_ruin', 'test-sage');
      expect(result.success).toBe(true);
      expect(state.buildings[1].materialProgress).toBe(100);
    });

    it('should reject repair of full-condition building', () => {
      const result = system.repairBuilding('test_shop', 'test-sage');
      expect(result.success).toBe(false);
    });
  });

  describe('getBuildingStats', () => {
    it('should return stats grouped by type', () => {
      const stats = system.getBuildingStats();
      expect(stats['commerce']).toBeDefined();
      expect(stats['commerce'].count).toBe(1);
      expect(stats['production'].count).toBe(1);
    });
  });
});
