/**
 * Tests for InventoryManager (economy/inventory.ts)
 */
import { describe, it, expect } from 'vitest';
import { InventoryManager, FOOD_SPOILAGE_RATE } from '../../src/economy/inventory.js';
import type { WorldState, AgentState, EconomyState } from '../../src/core/types.js';

function makeState(): WorldState {
  const economy: EconomyState = {
    totalCurrency: 0, annualTradeVolume: 0, annualSpoilage: 0,
    priceHistory: {}, priceCaps: {},
  };
  const agents: AgentState[] = [
    {
      id: 'a1', name: '张三', age: 30, alive: true, gender: 'male',
      stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 100, maxHealth: 100, energy: 80, happiness: 70 },
      skills: {}, inventory: { items: { rice: 10, tools: 1, meat: 3 } },
      relationships: {}, family: { parents: [], children: [], spouse: undefined, household: [] },
      conditions: [], employees: [], memories: [], tags: [], wealth: 100, born: 0,
    },
    {
      id: 'a2', name: '李四', age: 28, alive: true, gender: 'male',
      stats: { strength: 4, intelligence: 6, dexterity: 6, charisma: 4, health: 100, maxHealth: 100, energy: 80, happiness: 70 },
      skills: {}, inventory: { items: {} },
      relationships: {}, family: { parents: [], children: [], spouse: undefined, household: [] },
      conditions: [], employees: [], memories: [], tags: [], wealth: 50, born: 0,
    },
  ];
  return {
    agents, buildings: [], economy,
    season: 'spring', weather: 'sunny', year: 1, week: 1, credits: [],
    worldSeed: 42, map: { width: 50, height: 50, tiles: [], roads: [], terrainZones: [] },
  } as unknown as WorldState;
}

describe('InventoryManager', () => {
  it('adds items to an agent', () => {
    const state = makeState();
    const inv = new InventoryManager(state);
    const added = inv.addItem('a1', 'vegetables', 5);
    expect(added).toBe(5);
    expect(state.agents[0].inventory.items.vegetables).toBe(5);
  });

  it('returns 0 when adding to dead agent', () => {
    const state = makeState();
    state.agents[0].alive = false;
    const inv = new InventoryManager(state);
    expect(inv.addItem('a1', 'rice', 5)).toBe(0);
  });

  it('removes items from an agent', () => {
    const state = makeState();
    const inv = new InventoryManager(state);
    const removed = inv.removeItem('a1', 'rice', 3);
    expect(removed).toBe(3);
    expect(state.agents[0].inventory.items.rice).toBe(7);
  });

  it('caps removal at available quantity', () => {
    const state = makeState();
    const inv = new InventoryManager(state);
    const removed = inv.removeItem('a1', 'rice', 100);
    expect(removed).toBe(10);
    expect(state.agents[0].inventory.items.rice).toBeUndefined();
  });

  it('checks item existence', () => {
    const state = makeState();
    const inv = new InventoryManager(state);
    expect(inv.hasItem('a1', 'rice', 5)).toBe(true);
    expect(inv.hasItem('a1', 'rice', 15)).toBe(false);
    expect(inv.hasItem('a1', 'nonexistent')).toBe(false);
  });

  it('computes total supply across all agents', () => {
    const state = makeState();
    const inv = new InventoryManager(state);
    expect(inv.totalSupply('rice')).toBe(10);
    expect(inv.totalSupply('tools')).toBe(1);
  });

  it('counts item owners', () => {
    const state = makeState();
    const inv = new InventoryManager(state);
    expect(inv.countOwners('rice')).toBe(1);
    inv.addItem('a2', 'rice', 3);
    expect(inv.countOwners('rice')).toBe(2);
  });

  it('processes food spoilage', () => {
    const state = makeState();
    const inv = new InventoryManager(state);
    inv.processSpoilage();
    // FOOD_SPOILAGE_RATE = 5%, so floor(10 * 0.05) = 0 spoiled
    expect(state.agents[0].inventory.items.rice).toBe(10);
    expect(state.agents[0].inventory.items.tools).toBe(1);
  });

  it('handles empty inventories gracefully', () => {
    const state = makeState();
    const inv = new InventoryManager(state);
    expect(inv.getItemCount('a2', 'anything')).toBe(0);
    expect(inv.hasItem('a2', 'anything')).toBe(false);
    expect(inv.getSlotCount('a2')).toBe(0);
  });
});
