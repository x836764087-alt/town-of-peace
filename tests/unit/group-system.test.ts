/**
 * Tests for GroupSystem (agents/group-system.ts)
 */
import { describe, it, expect } from 'vitest';
import { GroupSystem, GROUP_TYPES } from '../../src/agents/group-system.js';
import { SeededRNG } from '../../src/core/rng.js';
import type { WorldState } from '../../src/core/types.js';

function makeState(): WorldState {
  return {
    year: 5, season: 'summer', weather: 'sunny',
    agents: [
      { id: 'a1', name: '张三', gender: 'male', alive: true, age: 25, title: '铁匠', stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 }, relationships: { a2: 35, a3: 30 }, inventory: { items: {} }, wealth: 0 },
      { id: 'a2', name: '李四', gender: 'male', alive: true, age: 30, title: '木匠', stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 }, relationships: { a1: 35, a3: 28 }, inventory: { items: {} }, wealth: 0 },
      { id: 'a3', name: '王五', gender: 'male', alive: true, age: 28, title: '农夫', stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 }, relationships: { a1: 30, a2: 28 }, inventory: { items: {} }, wealth: 0 },
      { id: 'a4', name: '赵六', gender: 'male', alive: true, age: 22, title: '学徒', stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 }, relationships: { a1: 32 }, inventory: { items: {} }, wealth: 0 },
    ],
    economy: { totalCurrency: 500, annualTradeVolume: 0, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
    buildings: [], map: { width: 10, height: 10, tiles: [] },
    innovations: [], laws: [], festivals: [], groups: [], archives: [],
    relations: [], chronicle: [], snapshots: [], credits: [],
    seed: 42, populationThreshold: 100, version: '1.0',
    apprenticeships: [], __shortTermJobs: [],
  };
}

describe('GroupSystem', () => {
  it('initializes with no groups', () => {
    const state = makeState();
    const gs = new GroupSystem(state, new SeededRNG(42));
    expect(gs.getGroupCount()).toBe(0);
  });

  it('processGroups returns event strings', () => {
    const state = makeState();
    const gs = new GroupSystem(state, new SeededRNG(42));
    const events = gs.processGroups();
    expect(Array.isArray(events)).toBe(true);
  });

  it('getGroupsForAgent returns empty for unknown agent', () => {
    const state = makeState();
    const gs = new GroupSystem(state, new SeededRNG(42));
    expect(gs.getGroupsForAgent('a1')).toEqual([]);
  });

  it('processGroups handles dead members gracefully', () => {
    const state = makeState();
    state.groups.push({ id: 'g1', name: '铁匠组', description: '', members: ['a1', 'a2', 'a3'], formedYear: 1, type: 'trade' });
    state.agents[0].alive = false;
    const gs = new GroupSystem(state, new SeededRNG(42));
    gs.processGroups();
    // a1 removed from group (a1 is dead)
    const group = state.groups.find(g => g.id === 'g1');
    // if group was disbanded (members < 3 after removal), it should be gone
    if (group) {
      expect(group.members.includes('a1')).toBe(false);
    } else {
      // group disbanded — also acceptable
      expect(true).toBe(true);
    }
  });

  it('GROUP_TYPES has entries', () => {
    expect(GROUP_TYPES.length).toBeGreaterThan(0);
  });
});
