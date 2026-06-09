import { describe, it, expect } from 'vitest';
import { WorldEngine } from '../../src/core/world-engine.js';
import { CHARACTERS } from '../../src/config/characters.js';
import { ITEMS } from '../../src/config/items.js';

describe('World Engine Integration', () => {
  it('should create a deterministic new world', () => {
    const engine1 = WorldEngine.createNew(42, CHARACTERS, ITEMS);
    const engine2 = WorldEngine.createNew(42, CHARACTERS, ITEMS);
    const world1 = engine1.getState();
    const world2 = engine2.getState();
    expect(world1.agents.length).toBe(world2.agents.length);
    expect(world1.agents[0].name).toBe(world2.agents[0].name);
  });

  it('should create 18 agents', () => {
    const engine = WorldEngine.createNew(42, CHARACTERS, ITEMS);
    const world = engine.getState();
    const alive = world.agents.filter(a => a.alive);
    expect(alive.length).toBe(18);
  });
});
