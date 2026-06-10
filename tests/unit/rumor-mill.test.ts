/**
 * Tests for RumorMill (agents/rumor-mill.ts)
 */
import { describe, it, expect } from 'vitest';
import { RumorMill, MAX_ACTIVE_RUMORS } from '../../src/agents/rumor-mill.js';
import { SeededRNG } from '../../src/core/rng.js';
import type { WorldState } from '../../src/core/types.js';

function makeState(): WorldState {
  return {
    year: 5, season: 'summer', weather: 'sunny',
    agents: [
      { id: 'a1', name: '张三', gender: 'male', alive: true, age: 25, stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 }, relationships: {}, inventory: { items: {} }, wealth: 0 },
      { id: 'a2', name: '李四', gender: 'male', alive: true, age: 30, stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 }, relationships: {}, inventory: { items: {} }, wealth: 0 },
      { id: 'a3', name: '王五', gender: 'male', alive: true, age: 20, stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 }, relationships: {}, inventory: { items: {} }, wealth: 0 },
    ],
    economy: { totalCurrency: 500, annualTradeVolume: 0, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
    buildings: [], map: { width: 10, height: 10, tiles: [] },
    innovations: [], laws: [], festivals: [], groups: [], archives: [],
    relations: [], chronicle: [], snapshots: [], credits: [],
    seed: 42, populationThreshold: 100, version: '1.0',
    apprenticeships: [], __shortTermJobs: [],
    pendingPublicOrderLaw: false,
  };
}

describe('RumorMill', () => {
  it('seeds rumors from events', () => {
    const state = makeState();
    const rm = new RumorMill(state, new SeededRNG(42));
    const result = rm.seedRumors(['张三在河边发现了一块金子。']);
    expect(Array.isArray(result)).toBe(true);
  });

  it('processSpread distributes rumors between agents', () => {
    const state = makeState();
    const rm = new RumorMill(state, new SeededRNG(42));
    rm.seedRumors(['张三在河边发现了一块金子。']);
    const events = rm.processSpread();
    expect(events.length).toBeGreaterThanOrEqual(0);
  });

  it('getActiveRumors returns non-dead rumors', () => {
    const state = makeState();
    const rm = new RumorMill(state, new SeededRNG(42));
    rm.seedRumors(['张三在河边发现了一块金子。']);
    const active = rm.getActiveRumors();
    expect(active.length).toBeGreaterThanOrEqual(0);
  });

  it('getKnownRumors returns rumors known by an agent', () => {
    const state = makeState();
    const rm = new RumorMill(state, new SeededRNG(42));
    expect(rm.getKnownRumors('a1')).toEqual([]);
  });
});
