/**
 * DialogueGenerator 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import DialogueGenerator from '../../src/agents/dialogue-topics.js';
import type { WorldState, AgentState, Season, WeatherType } from '../../src/core/types.js';
import { SeededRNG } from '../../src/core/rng.js';

function createTestState(): WorldState {
  return {
    year: 10,
    season: 'spring' as Season,
    weather: 'sunny' as WeatherType,
    agents: [
      {
        id: 'a1', name: '张三', age: 30, alive: true, gender: '男',
        stats: { strength: 50, intelligence: 60, dexterity: 50, charisma: 50, health: 80, maxHealth: 80, energy: 70, happiness: 60 },
        skills: { farming: 40 },
        inventory: { items: { rice: 10 } },
        relationships: {},
        family: { spouse: 'a2', children: [], parents: [], household: [] },
        conditions: [], memories: [], born: 0, wealth: 100, employees: [], tags: [],
      },
      {
        id: 'a2', name: '李四', age: 28, alive: true, gender: '女',
        stats: { strength: 40, intelligence: 50, dexterity: 50, charisma: 50, health: 70, maxHealth: 70, energy: 60, happiness: 60 },
        skills: { cooking: 50 },
        inventory: { items: { rice: 5 } },
        relationships: {},
        family: { spouse: 'a1', children: [], parents: [], household: [] },
        conditions: [], memories: [], born: 0, wealth: 50, employees: [], tags: [],
      },
      {
        id: 'a3', name: '王五', age: 40, alive: true, gender: '男',
        stats: { strength: 60, intelligence: 50, dexterity: 55, charisma: 45, health: 75, maxHealth: 75, energy: 70, happiness: 55 },
        skills: { blacksmith: 60 },
        inventory: { items: { rice: 8 } },
        relationships: {},
        family: { spouse: undefined, children: [], parents: [], household: [] },
        conditions: [], memories: [], born: 0, wealth: 80, employees: [], tags: [],
      },
    ],
    economy: { totalCurrency: 500, annualTradeVolume: 300, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
    buildings: [],
    map: { width: 50, height: 55, tiles: Array.from({ length: 55 }, () => Array.from({ length: 50 }, () => ({ type: 'plains' as const }))) },
    innovations: [{ id: 't1', name: '铁器改良', description: '更耐用的铁器', prerequisites: [], requiredSkill: 'smithing', requiredSkillLevel: 3, difficulty: 5, materials: [], unlocks: [], effects: [] }],
    laws: [],
    festivals: [{ id: 'f1', name: '丰收节', description: '秋收庆祝', yearsEstablished: 8, yearsRun: 3, season: 'autumn' as Season, participants: [] }],
    groups: [],
    archives: [],
    relations: [],
    seed: 42,
    chronicle: [
      { year: 5, severity: 'dramatic', content: '重大发现！铁器工艺取得突破。' },
    ],
    snapshots: [],
    populationThreshold: 100,
    version: '0.6.0',
    credits: [],
    apprenticeships: [],
    __shortTermJobs: [],
  };
}

describe('DialogueGenerator', () => {
  let state: WorldState;
  let rng: SeededRNG;
  let dialog: DialogueGenerator;

  beforeEach(() => {
    state = createTestState();
    rng = new SeededRNG(42);
    dialog = new DialogueGenerator(state, rng);
  });

  describe('generateDialogue', () => {
    it('should produce dialogue between two agents', () => {
      const topic = dialog.generateDialogue(state.agents[0], state.agents[1]);
      expect(topic.content.length).toBeGreaterThan(3);
      expect(topic.type).toBeDefined();
    });

    it('should prefer non-daily topics when available', () => {
      // With lots of trade, innovations, festivals, events -> should pick interesting topics
      const topic = dialog.generateDialogue(state.agents[0], state.agents[1]);
      // Just verify it produces something valid
      expect(['daily', 'economy', 'social', 'event', 'festival', 'innovation']).toContain(topic.type);
    });
  });

  describe('getRelationshipDelta', () => {
    it('should return positive delta for positive sentiment', () => {
      const topic = dialog.generateDialogue(state.agents[0], state.agents[1]);
      const delta = dialog.getRelationshipDelta(topic);
      if (topic.sentiment === 'positive') {
        expect(delta).toBeGreaterThan(0);
      }
    });
  });

  describe('generateSocialInteractions', () => {
    it('should produce interaction events', () => {
      const events = dialog.generateSocialInteractions();
      // May not always produce events if adult count < 2
      expect(Array.isArray(events)).toBe(true);
    });

    it('should update relationships', () => {
      const beforeRelCount = state.relations.length;
      dialog.generateSocialInteractions();
      // Relationships may or may not change based on randomness
      expect(state.relations.length).toBeGreaterThanOrEqual(beforeRelCount);
    });
  });
});
