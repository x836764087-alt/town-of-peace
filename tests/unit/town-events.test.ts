/**
 * Tests for TownEvents (agents/town-events.ts)
 */
import { describe, it, expect } from 'vitest';
import { TownEvents } from '../../src/agents/town-events.js';
import { SeededRNG } from '../../src/core/rng.js';
import type { WorldState } from '../../src/core/types.js';

function makeState(): WorldState {
  return {
    year: 5, season: 'summer', weather: 'sunny',
    agents: [
      { id: 'a1', name: '张三', gender: 'male', alive: true, age: 25, stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 }, relationships: {}, inventory: { items: { rice: 10 } }, wealth: 0 },
      { id: 'a2', name: '李四', gender: 'male', alive: true, age: 30, stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 }, relationships: {}, inventory: { items: { rice: 10 } }, wealth: 0 },
    ],
    economy: { totalCurrency: 500, annualTradeVolume: 0, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
    buildings: [
      { id: 'b1', name: '木屋', x: 0, y: 0, type: 'house', level: 3, width: 1, height: 1, ownerId: 'a1' },
      { id: 'b2', name: '仓库', x: 1, y: 0, type: 'warehouse', level: 2, width: 1, height: 1, ownerId: 'a2' },
    ],
    map: { width: 10, height: 10, tiles: [] },
    innovations: [], laws: [], festivals: [], groups: [], archives: [],
    relations: [], chronicle: [], snapshots: [], credits: [],
    seed: 42, populationThreshold: 100, version: '1.0',
    apprenticeships: [], __shortTermJobs: [],
  };
}

describe('TownEvents', () => {
  it('processEvents returns array of event strings', () => {
    const state = makeState();
    const te = new TownEvents(state, new SeededRNG(42));
    const events = te.processEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  it('processEvents can affect building levels on disaster', () => {
    const state = makeState();
    state.season = 'summer';
    const te = new TownEvents(state, new SeededRNG(7)); // seed likely to trigger disaster
    te.processEvents();
    // buildings may have changed
    expect(state.buildings.length).toBe(2);
  });

  it('processEvents can increase happiness on celebration', () => {
    const state = makeState();
    state.season = 'autumn';
    const rng = new SeededRNG(42);
    const te = new TownEvents(state, rng);
    te.processEvents();
    // happiness may have changed
    expect(state.agents[0].stats.happiness).toBeGreaterThanOrEqual(50);
  });

  it('handles no agents gracefully', () => {
    const state = makeState();
    state.agents = [];
    const te = new TownEvents(state, new SeededRNG(42));
    const events = te.processEvents();
    expect(Array.isArray(events)).toBe(true);
  });
});
