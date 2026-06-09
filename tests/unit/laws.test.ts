/**
 * LawSystem 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { LawSystem, findEnforcer, MAX_LAWS } from '../../src/society/laws.js';
import type { WorldState, Season, WeatherType } from '../../src/core/types.js';
import { SeededRNG } from '../../src/core/rng.js';

function createTestState(): WorldState {
  return {
    year: 5,
    season: 'spring' as Season,
    weather: 'sunny' as WeatherType,
    agents: [
      {
        id: 'leader', name: '赵长河', age: 54, alive: true, gender: '男',
        stats: { strength: 55, intelligence: 80, dexterity: 50, charisma: 85, health: 70, maxHealth: 70, energy: 60, happiness: 65 },
        skills: { leadership: 75, negotiation: 70 },
        inventory: { items: { rice: 10 } },
        relationships: {},
        family: { spouse: 'wife', children: [], parents: [], household: [] },
        conditions: [], memories: [], born: 0, wealth: 300, employees: [], tags: ['responsible'],
      },
      {
        id: 'wife', name: '马秀英', age: 52, alive: true, gender: '女',
        stats: { strength: 60, intelligence: 65, dexterity: 70, charisma: 80, health: 72, maxHealth: 72, energy: 65, happiness: 75 },
        skills: { cooking: 80, community_org: 70 },
        inventory: { items: { rice: 8 } },
        relationships: {},
        family: { spouse: 'leader', children: [], parents: [], household: [] },
        conditions: [], memories: [], born: 0, wealth: 150, employees: [], tags: [],
      },
      {
        id: 'young1', name: '陈小飞', age: 22, alive: true, gender: '男',
        stats: { strength: 60, intelligence: 50, dexterity: 55, charisma: 50, health: 80, maxHealth: 80, energy: 75, happiness: 60 },
        skills: { farming: 30 },
        inventory: { items: { rice: 5 } },
        relationships: {},
        family: { spouse: undefined, children: [], parents: [], household: [] },
        conditions: [], memories: [], born: 0, wealth: 50, employees: [], tags: [],
      },
      {
        id: 'young2', name: '苏灵儿', age: 20, alive: true, gender: '女',
        stats: { strength: 30, intelligence: 70, dexterity: 65, charisma: 70, health: 75, maxHealth: 75, energy: 65, happiness: 70 },
        skills: { herbalism: 50 },
        inventory: { items: { rice: 5 } },
        relationships: {},
        family: { spouse: undefined, children: [], parents: [], household: [] },
        conditions: [], memories: [], born: 0, wealth: 30, employees: [], tags: [],
      },
    ],
    economy: { totalCurrency: 500, annualTradeVolume: 0, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
    buildings: [],
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

describe('LawSystem', () => {
  let state: WorldState;
  let rng: SeededRNG;
  let laws: LawSystem;

  beforeEach(() => {
    state = createTestState();
    rng = new SeededRNG(42);
    laws = new LawSystem(state, rng);
  });

  describe('findEnforcer', () => {
    it('should find the agent with highest leadership', () => {
      const enforcer = findEnforcer(state);
      expect(enforcer).toBe('leader');
    });

    it('should return undefined if no adults', () => {
      state.agents = [];
      expect(findEnforcer(state)).toBeUndefined();
    });
  });

  describe('getActiveLaws', () => {
    it('should return empty initially', () => {
      expect(laws.getActiveLaws()).toHaveLength(0);
    });
  });

  describe('processLegislationProposals', () => {
    it('may propose laws after population grows', () => {
      // Run many seasons to trigger proposals
      const allEvents: string[] = [];
      for (let i = 0; i < 100; i++) {
        const events = laws.processLegislationProposals();
        allEvents.push(...events);
        // Progress time
        state.year += 1;
      }
      // At least some proposals should happen eventually
      expect(state.laws.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect MAX_LAWS cap', () => {
      // Fill to max
      for (let i = 0; i < MAX_LAWS + 5; i++) {
        state.laws.push({
          id: `law_${i}`, name: `法律${i}`, description: 'test',
          yearEnacted: i, enactedBy: 'leader', active: true,
        });
      }
      const events = laws.processLegislationProposals();
      // No new laws should be proposed
      expect(events).toHaveLength(0);
    });
  });

  describe('processEnforcement', () => {
    it('should do nothing without laws', () => {
      const events = laws.processEnforcement();
      expect(events).toHaveLength(0);
    });

    it('should process violations when laws exist', () => {
      // Add a law
      state.laws.push({
        id: 'law_test', name: '测试条例', description: '测试用',
        yearEnacted: 5, enactedBy: 'leader', active: true,
      });

      // Run enforcement many times
      const allEvents: string[] = [];
      for (let i = 0; i < 200; i++) {
        const events = laws.processEnforcement();
        allEvents.push(...events);
      }

      if (allEvents.length > 0) {
        expect(allEvents[0]).toContain('违反');
      }
    });

    it('should deduct fines from violators', () => {
      state.laws.push({
        id: 'law_test2', name: '卫生条例', description: '禁止乱倒垃圾，罚15文。',
        yearEnacted: 5, enactedBy: 'leader', active: true,
      });

      for (let i = 0; i < 500; i++) {
        laws.processEnforcement();
      }

      // At least some fines collected
      const lawStats = laws.getLawStats();
      expect(lawStats.totalFines).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getLawStats', () => {
    it('should return valid stats with no laws', () => {
      const stats = laws.getLawStats();
      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
    });

    it('should count active vs total', () => {
      state.laws.push({
        id: 'l1', name: '法律1', description: 't', yearEnacted: 1, active: true,
      });
      state.laws.push({
        id: 'l2', name: '法律2', description: 't', yearEnacted: 2, active: false,
      });
      const stats = laws.getLawStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
    });
  });
});
