/**
 * Tests for MarketSystem (economy/market.ts)
 */
import { describe, it, expect } from 'vitest';
import { MarketSystem, BASE_MARKET_PRICES } from '../../src/economy/market.js';
import { SeededRNG } from '../../src/core/rng.js';
import type { WorldState, AgentState, EconomyState } from '../../src/core/types.js';

function makeState(overrides?: Partial<WorldState>): WorldState {
  const economy: EconomyState = {
    totalCurrency: 0,
    annualTradeVolume: 0,
    annualSpoilage: 0,
    priceHistory: {},
    priceCaps: {},
  };
  const agents: AgentState[] = [
    {
      id: 'a1', name: '张三', age: 30, alive: true, gender: 'male',
      stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 100, maxHealth: 100, energy: 80, happiness: 70 },
      skills: {}, inventory: { items: { rice: 10, tools: 1 } },
      relationships: {}, family: { parents: [], children: [], spouse: undefined, household: [] },
      conditions: [], employees: [], memories: [], tags: [], wealth: 100, born: 0,
    },
    {
      id: 'a2', name: '李四', age: 28, alive: true, gender: 'male',
      stats: { strength: 4, intelligence: 6, dexterity: 6, charisma: 4, health: 100, maxHealth: 100, energy: 80, happiness: 70 },
      skills: {}, inventory: { items: { vegetables: 5 } },
      relationships: {}, family: { parents: [], children: [], spouse: undefined, household: [] },
      conditions: [], employees: [], memories: [], tags: [], wealth: 50, born: 0,
    },
  ];
  return {
    agents,
    buildings: [],
    economy,
    season: 'spring', weather: 'sunny', year: 1, week: 1, credits: [],
    worldSeed: 42, map: { width: 50, height: 50, tiles: [], roads: [], terrainZones: [] },
  } as unknown as WorldState;
}

describe('MarketSystem', () => {
  it('computes total supply correctly', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const ms = new MarketSystem(state, rng);
    expect(ms.totalSupply('rice')).toBe(10);
    expect(ms.totalSupply('vegetables')).toBe(5);
    expect(ms.totalSupply('nonexistent')).toBe(0);
  });

  it('estimates demand based on population', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const ms = new MarketSystem(state, rng);
    const demand = ms.estimateDemand('rice');
    expect(demand).toBeGreaterThanOrEqual(2);
    const demandTools = ms.estimateDemand('tools');
    expect(demandTools).toBeGreaterThanOrEqual(1);
  });

  it('calculates market price within reasonable range', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const ms = new MarketSystem(state, rng);
    const price = ms.calculateMarketPrice('rice');
    const base = BASE_MARKET_PRICES['rice'];
    expect(price).toBeGreaterThanOrEqual(Math.round(base * 0.3));
    expect(price).toBeLessThanOrEqual(Math.round(base * 3.0));
  });

  it('returns all market prices', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const ms = new MarketSystem(state, rng);
    const prices = ms.getAllMarketPrices(['rice', 'tools']);
    expect(prices).toHaveLength(2);
    expect(prices[0].itemId).toBe('rice');
    expect(prices[0].currentPrice).toBeGreaterThan(0);
    expect(prices[1].itemId).toBe('tools');
  });

  it('records price history', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const ms = new MarketSystem(state, rng);
    ms.recordPriceHistory();
    expect(Object.keys(state.economy.priceHistory).length).toBeGreaterThan(0);
    expect(state.economy.priceHistory['rice']).toHaveLength(1);
    ms.recordPriceHistory();
    expect(state.economy.priceHistory['rice']).toHaveLength(2);
  });

  it('gets price trend', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const ms = new MarketSystem(state, rng);
    ms.recordPriceHistory();
    ms.recordPriceHistory();
    const trend = ms.getPriceTrend('rice', 4);
    expect(trend).toHaveLength(2);
    expect(trend[0]).toBeGreaterThan(0);
  });

  it('processMarket returns events', () => {
    const state = makeState();
    const rng = new SeededRNG(42);
    const ms = new MarketSystem(state, rng);
    const events = ms.processMarket();
    expect(Array.isArray(events)).toBe(true);
    expect(state.economy.priceHistory['rice']).toHaveLength(1);
  });
});
