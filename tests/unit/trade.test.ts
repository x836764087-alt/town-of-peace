/**
 * Tests for TradeMatcher (economy/trade.ts)
 */
import { describe, it, expect } from 'vitest';
import { TradeMatcher } from '../../src/economy/trade.js';
import { SeededRNG } from '../../src/core/rng.js';
import type { WorldState, AgentState, EconomyState } from '../../src/core/types.js';

function makeState(): WorldState {
  const economy: EconomyState = {
    totalCurrency: 0, annualTradeVolume: 0, annualSpoilage: 0,
    priceHistory: { rice: [5], tools: [35] },
    priceCaps: {},
  };
  const agents: AgentState[] = [
    {
      id: 'a1', name: '张三', age: 30, alive: true, gender: 'male',
      stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 100, maxHealth: 100, energy: 80, happiness: 70 },
      skills: {}, inventory: { items: { rice: 10, tools: 1 } },
      relationships: { a2: 30 }, family: { parents: [], children: [], spouse: undefined, household: [] },
      conditions: [], employees: [], memories: [], tags: [], wealth: 100, born: 0,
    },
    {
      id: 'a2', name: '李四', age: 28, alive: true, gender: 'male',
      stats: { strength: 4, intelligence: 6, dexterity: 6, charisma: 4, health: 100, maxHealth: 100, energy: 80, happiness: 70 },
      skills: {}, inventory: { items: { vegetables: 5, rice: 0 } },
      relationships: { a1: 25 }, family: { parents: [], children: [], spouse: undefined, household: [] },
      conditions: [], employees: [], memories: [], tags: [], wealth: 20, born: 0,
    },
  ];
  return {
    agents, buildings: [], economy,
    season: 'spring', weather: 'sunny', year: 1, week: 1, credits: [],
    worldSeed: 42, map: { width: 50, height: 50, tiles: [], roads: [], terrainZones: [] },
  } as unknown as WorldState;
}

describe('TradeMatcher', () => {
  it('finds trade matches between buyers and sellers', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const tm = new TradeMatcher(state, rng);
    const matches = tm.findTradeMatches();
    expect(Array.isArray(matches)).toBe(true);
  });

  it('matches have required fields', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const tm = new TradeMatcher(state, rng);
    const matches = tm.findTradeMatches();
    for (const match of matches) {
      expect(match.buyerId).toBeTruthy();
      expect(match.sellerId).toBeTruthy();
      expect(match.itemId).toBeTruthy();
      expect(match.quantity).toBeGreaterThan(0);
      expect(match.estimatedPrice).toBeGreaterThan(0);
      expect(match.reason).toBeTruthy();
    }
  });

  it('computes trade metrics', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const tm = new TradeMatcher(state, rng);
    const metrics = tm.computeTradeMetrics();
    expect(metrics.totalWealth).toBeGreaterThan(0);
    expect(metrics.richest).toBeDefined();
    expect(metrics.poorest).toBeDefined();
    expect(metrics.wealthGini).toBeGreaterThanOrEqual(0);
    expect(Object.keys(metrics.occupationWealth).length).toBeGreaterThan(0);
  });

  it('handles single-agent state', () => {
    const state = makeState();
    state.agents = state.agents.slice(0, 1);
    const rng = new SeededRNG(42);
    const tm = new TradeMatcher(state, rng);
    expect(tm.findTradeMatches()).toHaveLength(0);
    const metrics = tm.computeTradeMetrics();
    expect(metrics.richest?.id).toBe('a1');
  });

  it('handles empty state', () => {
    const state = makeState();
    state.agents = [];
    const rng = new SeededRNG(42);
    const tm = new TradeMatcher(state, rng);
    expect(tm.findTradeMatches()).toHaveLength(0);
    const metrics = tm.computeTradeMetrics();
    expect(metrics.totalWealth).toBe(0);
  });
});
