import { describe, it, expect } from 'vitest';
import { TownEvents } from '../../src/agents/town-events.js';
import { LawSystem } from '../../src/society/laws.js';
import { SeededRNG } from '../../src/core/rng.js';
import type { WorldState, Season, WeatherType } from '../../src/core/types.js';

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
    pendingPublicOrderLaw: false,
  };
}

function makeTheftState(): WorldState {
  return {
    year: 5, season: 'summer' as Season, weather: 'sunny' as WeatherType,
    agents: [
      {
        id: 'thief', name: '王小明', age: 25, alive: true, gender: 'male',
        stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 },
        skills: { farming: 30 },
        inventory: { items: { rice: 5 } },
        wealth: 10,
        relationships: {},
        family: { spouse: undefined, children: [], parents: [], household: [] },
        conditions: [], memories: [], born: 0, employees: [], tags: [],
        crimes: 0, x: 0, y: 0,
      },
      {
        id: 'victim', name: '李富贵', age: 40, alive: true, gender: 'male',
        stats: { strength: 5, intelligence: 5, dexterity: 5, charisma: 5, health: 80, maxHealth: 100, energy: 80, happiness: 50 },
        skills: { farming: 50, leadership: 60 },
        inventory: { items: { rice: 100 } },
        wealth: 200,
        relationships: {},
        family: { spouse: undefined, children: [], parents: [], household: [] },
        conditions: [], memories: [], born: 0, employees: [], tags: [],
        x: 1, y: 1, crimes: 0,
      },
    ],
    economy: { totalCurrency: 500, annualTradeVolume: 0, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
    buildings: [],
    map: { width: 10, height: 10, tiles: [] },
    innovations: [], laws: [], festivals: [], groups: [], archives: [], relations: [], chronicle: [], snapshots: [], credits: [],
    seed: 42, populationThreshold: 100, version: '1.0',
    apprenticeships: [], __shortTermJobs: [],
    pendingPublicOrderLaw: false, crimeWave: 0, pendingTrials: [],
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
    const te = new TownEvents(state, new SeededRNG(7));
    te.processEvents();
    expect(state.buildings.length).toBe(2);
  });

  it('processEvents can increase happiness on celebration', () => {
    const state = makeState();
    state.season = 'autumn';
    const rng = new SeededRNG(42);
    const te = new TownEvents(state, rng);
    te.processEvents();
    expect(state.agents[0].stats.happiness).toBeGreaterThanOrEqual(50);
  });

  it('handles no agents gracefully', () => {
    const state = makeState();
    state.agents = [];
    const te = new TownEvents(state, new SeededRNG(42));
    const events = te.processEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  it('processEvents can trigger a theft caught event with trial judgment', () => {
    // Use a range of seeds to find one that triggers theft
    const keywords = ['偷', '盗窃', '宣判', '罚款', '判'];
    let foundEvents: string[] = [];
    for (let seed = 1; seed <= 5000; seed++) {
      const state = makeTheftState();
      const rng = new SeededRNG(seed);
      const te = new TownEvents(state, rng);
      const events = te.processEvents();
      const hasTheft = events.some(e => keywords.some(k => e.includes(k)));
      if (hasTheft) {
        foundEvents = events;
        break;
      }
    }
    expect(foundEvents.length).toBeGreaterThan(0);
    const theftEvent = foundEvents.find(e => keywords.some(k => e.includes(k)));
    expect(theftEvent).toBeDefined();
  });
});

describe('LawSystem.conductTrial (审判判罚)', () => {
  function createTrialState(): WorldState {
    return {
      year: 5, season: 'spring' as Season, weather: 'sunny' as WeatherType,
      agents: [
        {
          id: 'zhao-changhe', name: '赵长河', age: 54, alive: true, gender: '男',
          stats: { strength: 55, intelligence: 80, dexterity: 50, charisma: 85, health: 70, maxHealth: 70, energy: 60, happiness: 65 },
          skills: { leadership: 75 },
          inventory: { items: { rice: 10 } },
          wealth: 300,
          relationships: {},
          family: { spouse: undefined, children: [], parents: [], household: [] },
          conditions: [], memories: [], born: 0, employees: [], tags: [],
          x: 0, y: 0, crimes: 0,
        },
        {
          id: 'thief', name: '陈小飞', age: 22, alive: true, gender: '男',
          stats: { strength: 60, intelligence: 50, dexterity: 55, charisma: 50, health: 80, maxHealth: 80, energy: 75, happiness: 60 },
          skills: { farming: 30 },
          inventory: { items: { rice: 5 } },
          wealth: 50,
          relationships: {},
          family: { spouse: undefined, children: [], parents: [], household: [] },
          conditions: [], memories: [], born: 0, employees: [], tags: [],
          x: 1, y: 1, crimes: 0,
        },
        {
          id: 'victim', name: '李富贵', age: 40, alive: true, gender: '男',
          stats: { strength: 60, intelligence: 70, dexterity: 65, charisma: 70, health: 80, maxHealth: 80, energy: 75, happiness: 60 },
          skills: { farming: 50 },
          inventory: { items: { rice: 50 } },
          wealth: 200,
          relationships: {},
          family: { spouse: undefined, children: [], parents: [], household: [] },
          conditions: [], memories: [], born: 0, employees: [], tags: [],
          x: 2, y: 2, crimes: 0,
        },
      ],
      economy: { totalCurrency: 500, annualTradeVolume: 0, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
      buildings: [],
      map: { width: 10, height: 10, tiles: [] },
      innovations: [], laws: [], festivals: [], groups: [], archives: [], relations: [], chronicle: [], snapshots: [], credits: [],
      seed: 42, populationThreshold: 100, version: '1.0',
      apprenticeships: [], __shortTermJobs: [],
      pendingPublicOrderLaw: false, crimeWave: 0, pendingTrials: [],
    };
  }

  describe('首次犯罪 → 罚款', () => {
    it('should impose a fine for first offense', () => {
      const state = createTrialState();
      const rng = new SeededRNG(42);
      const law = new LawSystem(state, rng);
      const judgment = law.conductTrial('thief', 'victim');
      expect(judgment.verdict).toBe('fine');
      expect(judgment.fine).toBeGreaterThan(0);
      expect(judgment.narrative).toContain('陈小飞');
      expect(judgment.narrative).toContain('第1次');
      expect(judgment.narrative).toContain('罚款');
      expect(state.agents.find(a => a.id === 'thief')!.crimes).toBe(1);
      const thief = state.agents.find(a => a.id === 'thief')!;
      expect(thief.wealth).toBeLessThan(50);
    });

    it('should reduce fine when unable to pay full amount', () => {
      const state = createTrialState();
      const thiefAgent = state.agents.find(a => a.id === 'thief')!;
      thiefAgent.wealth = 1;
      const rng = new SeededRNG(42);
      const law = new LawSystem(state, rng);
      const judgment = law.conductTrial('thief', 'victim');
      expect(judgment.verdict).toBe('fine');
      expect(state.agents.find(a => a.id === 'thief')!.wealth).toBe(0);
    });
  });

  describe('二次犯罪 → 苦役', () => {
    it('should impose labour service for second offense', () => {
      const state = createTrialState();
      state.agents.find(a => a.id === 'thief')!.crimes = 1;
      const rng = new SeededRNG(42);
      const law = new LawSystem(state, rng);
      const judgment = law.conductTrial('thief', 'victim');
      expect(judgment.verdict).toBe('labour');
      expect(judgment.narrative).toContain('再犯');
      expect(judgment.narrative).toContain('第2次');
      expect(judgment.narrative).toContain('苦役');
      expect(state.agents.find(a => a.id === 'thief')!.crimes).toBe(2);
      const thief = state.agents.find(a => a.id === 'thief')!;
      expect(thief.tags).toContain('labour_service');
      expect(thief.stats.happiness).toBeLessThanOrEqual(30);
    });
  });

  describe('三次犯罪 → 驱逐', () => {
    it('should exile for third offense', () => {
      const state = createTrialState();
      state.agents.find(a => a.id === 'thief')!.crimes = 2;
      const rng = new SeededRNG(42);
      const law = new LawSystem(state, rng);
      const judgment = law.conductTrial('thief', 'victim');
      expect(judgment.verdict).toBe('exile');
      expect(judgment.fine).toBe(0);
      expect(judgment.narrative).toContain('屡教不改');
      expect(judgment.narrative).toContain('第3次');
      expect(judgment.narrative).toContain('驱逐');
      const thief = state.agents.find(a => a.id === 'thief')!;
      expect(thief.alive).toBe(false);
      expect(thief.causeOfDeath).toBe('exiled');
      expect(thief.crimes).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should return fine with 0 when thief not found', () => {
      const state = createTrialState();
      const rng = new SeededRNG(42);
      const law = new LawSystem(state, rng);
      const judgment = law.conductTrial('nonexistent', 'victim');
      expect(judgment.verdict).toBe('fine');
      expect(judgment.fine).toBe(0);
      expect(judgment.narrative).toBe('无法审判');
    });

    it('should return fine with 0 when victim not found', () => {
      const state = createTrialState();
      const rng = new SeededRNG(42);
      const law = new LawSystem(state, rng);
      const judgment = law.conductTrial('thief', 'nonexistent');
      expect(judgment.verdict).toBe('fine');
      expect(judgment.fine).toBe(0);
      expect(judgment.narrative).toBe('无法审判');
    });
  });
});
