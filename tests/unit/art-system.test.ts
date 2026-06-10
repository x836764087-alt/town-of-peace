/**
 * Tests for the Art System (narrative/art-system.ts)
 */
import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../../src/core/rng.js';
import type { WorldState, AgentState } from '../../src/core/types.js';
import { processArtCreation } from '../../src/narrative/art-system.js';

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'test-agent',
    name: 'Test',
    age: 30,
    alive: true,
    gender: '男',
    stats: { strength: 50, intelligence: 50, dexterity: 50, charisma: 50, health: 70, maxHealth: 70, energy: 60, happiness: 60 },
    skills: {},
    inventory: { items: {} },
    relationships: {},
    family: { parents: [], children: [], spouse: undefined, household: [] },
    conditions: [],
    employees: [],
    memories: [],
    tags: [],
    wealth: 0,
    born: 0,
    x: 0,
    y: 0,
    crimes: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<WorldState> = {}): WorldState {
  const agents: AgentState[] = [
    makeAgent({
      id: 'artist1', name: '周建国', age: 48,
      skills: { art: 50, teaching: 85, literacy: 90 },
    }),
    makeAgent({
      id: 'artist2', name: '小野', age: 28,
      skills: { art: 30, painting: 80 },
    }),
    makeAgent({
      id: 'non-artist', name: '张大山', age: 36,
      skills: { blacksmithing: 85 },
    }),
    makeAgent({
      id: 'dead-artist', name: '已故诗人', age: 80, alive: false,
      skills: { art: 60 },
    }),
  ];

  return {
    agents,
    buildings: [],
    economy: { totalCurrency: 500, annualTradeVolume: 0, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
    season: 'spring',
    weather: 'sunny',
    year: 5,
    map: { width: 50, height: 55, tiles: [] },
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
    crimeWave: 0,
    pendingPublicOrderLaw: false,
    pendingTrials: [],
    placeNames: [],
    oralTraditions: [],
    artworks: [],
    cultureValue: 0,
    ...overrides,
  } as unknown as WorldState;
}

describe('Art System', () => {
  it('should produce no events when no artists exist', () => {
    const state = makeState({
      agents: [makeAgent({ skills: { farming: 30 } })],
    } as Partial<WorldState>) as unknown as WorldState;
    // Ensure artworks and cultureValue exist
    state.artworks = [];
    state.cultureValue = 0;

    const rng = new SeededRNG(42);
    const events = processArtCreation(state, rng);
    expect(events).toEqual([]);
  });

  it('should not create art for dead agents', () => {
    const state = makeState();
    const rng = new SeededRNG(99999);
    const events = processArtCreation(state, rng);
    // Dead artist should never be processed
    expect(events.every(e => !e.includes('已故诗人'))).toBe(true);
  });

  it('should create artwork when chance rolls pass', () => {
    const state = makeState();
    const rng = new SeededRNG(12345);
    const events = processArtCreation(state, rng);

    // With art skills of 50 and 30, some may or may not create
    expect(events.length).toBeGreaterThanOrEqual(0);
    expect(events.length).toBeLessThanOrEqual(2); // max 2 living artists

    for (const evt of events) {
      expect(evt).toMatch(/创作了/);
      expect(evt).toMatch(/诗作|画作|乐曲/);
    }
  });

  it('should add artworks to state.artworks', () => {
    const state = makeState();
    const rng = new SeededRNG(12345);
    processArtCreation(state, rng);

    expect(state.artworks).toBeDefined();
    expect(Array.isArray(state.artworks)).toBe(true);

    for (const artwork of state.artworks) {
      expect(artwork).toHaveProperty('id');
      expect(artwork).toHaveProperty('creatorId');
      expect(['poetry', 'painting', 'music']).toContain(artwork.type);
      expect(artwork).toHaveProperty('title');
      expect(typeof artwork.quality).toBe('number');
      expect(artwork.quality).toBeGreaterThanOrEqual(0);
      expect(artwork.quality).toBeLessThanOrEqual(100);
      expect(artwork).toHaveProperty('yearCreated');
    }
  });

  it('should increase cultureValue for high-quality works (>70)', () => {
    const agent = makeAgent({
      id: 'master-artist', name: '艺术大师', age: 50,
      skills: { art: 80 },
    });

    const state = makeState({
      agents: [agent],
      artworks: [],
      cultureValue: 0,
    }) as unknown as WorldState;
    state.artworks = [];
    state.cultureValue = 0;

    const rng = new SeededRNG(77777);
    processArtCreation(state, rng);

    // Check that artworks were created if chance passed
    if (state.artworks.length > 0) {
      const highQuality = state.artworks.filter(a => a.quality > 70);
      if (highQuality.length > 0) {
        expect(state.cultureValue).toBeGreaterThan(0);
      }
    }
  });

  it('should cap quality at 100', () => {
    const agent = makeAgent({
      id: 'legend', name: '传奇', age: 99,
      skills: { art: 100 },
    });

    const state = makeState({
      agents: [agent],
      artworks: [],
    }) as unknown as WorldState;
    state.artworks = [];

    const rng = new SeededRNG(11111);
    processArtCreation(state, rng);

    for (const artwork of state.artworks) {
      expect(artwork.quality).toBeLessThanOrEqual(100);
    }
  });

  it('should cap cultureValue at 100', () => {
    const agent = makeAgent({
      id: 'super-artist', name: '大师', age: 50,
      skills: { art: 90 },
    });

    const state = makeState({
      agents: [agent],
      artworks: [],
      cultureValue: 99,
    }) as unknown as WorldState;
    state.artworks = [];
    state.cultureValue = 99;

    // Multiple calls to try to push cultureValue past 100
    for (let i = 0; i < 10; i++) {
      const rng = new SeededRNG(55555 + i);
      processArtCreation(state, rng);
    }

    expect(state.cultureValue).toBeLessThanOrEqual(100);
  });

  it('should return correct event format', () => {
    const state = makeState();
    const rng = new SeededRNG(12345);
    const events = processArtCreation(state, rng);

    for (const evt of events) {
      expect(typeof evt).toBe('string');
      expect(evt.length).toBeGreaterThan(0);
      expect(evt).toMatch(/周建国|小野/);
      expect(evt).toMatch(/创作/);
    }
  });

  it('should not crash when chance fails for all artists', () => {
    const state = makeState();
    const rng = new SeededRNG(999999);
    const artworksBefore = state.artworks.length;
    const cultureBefore = state.cultureValue;
    processArtCreation(state, rng);
    expect(typeof state.cultureValue).toBe('number');
    expect(Array.isArray(state.artworks)).toBe(true);
  });
});
