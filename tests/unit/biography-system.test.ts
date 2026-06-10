/**
 * BiographySystem 单元测试
 *
 * Covers:
 *  1. initNewbornBiography — creates biography with persona + timeline
 *  2. initNewbornBiography — LLM failure falls back
 *  3. initNewbornBiography — includes birth event
 *  4. processLifeEvents — matches various keywords
 *  5. processLifeEvents — does not process dead agents
 *  6. generateObituary — generates obituary
 *  7. generateObituary — LLM failure falls back
 *  8. updateBiographyNarrative — updates once per decade
 *  9. getBiographySummary — correct formatted output
 * 10. timeline length limit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BiographySystem } from '../../src/llm/biography-system.js';
import { llmClient } from '../../src/llm/llm-client.js';
import type { WorldState, AgentState, Season } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTestAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'a1',
    name: '张三',
    age: 5,
    alive: true,
    gender: '男',
    title: undefined,
    stats: {
      strength: 20, intelligence: 20, dexterity: 20, charisma: 20,
      health: 80, maxHealth: 80, energy: 60, happiness: 60,
    },
    skills: {},
    inventory: { items: {} },
    relationships: {},
    family: { spouse: undefined, children: [], parents: [], household: [] },
    conditions: [],
    memories: [],
    born: 0,
    wealth: 100,
    employees: [],
    tags: [],
    ...overrides,
  };
}

function makeTestState(agents: AgentState[] = []): WorldState {
  return {
    year: 5,
    season: 'spring' as Season,
    weather: 'sunny',
    agents,
    economy: { totalCurrency: 500, annualTradeVolume: 0, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
    buildings: [],
    map: { width: 10, height: 10, tiles: [] },
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
    pendingPublicOrderLaw: false,
    placeNames: [],
    oralTraditions: [],
    artworks: [],
    cultureValue: 0,
  };
}

// ─── Mock LLM ─────────────────────────────────────────────────────────

vi.mock('../../src/llm/llm-client.js', () => ({
  llmClient: {
    chat: vi.fn(),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────

describe('BiographySystem', () => {
  let state: WorldState;
  let system: BiographySystem;
  let agent: AgentState;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = makeTestAgent({ born: 0 });
    state = makeTestState([agent]);
    system = new BiographySystem(state);
  });

  // ── initNewbornBiography ───────────────────────────────────────────

  describe('initNewbornBiography', () => {
    it('should create biography with persona and timeline on success', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['勇敢', '聪明'],
          values: ['正义', '家庭'],
          motto: '勇往直前。',
        }),
        tokensUsed: 50,
        durationMs: 500,
        success: true,
      });

      await system.initNewbornBiography(agent);

      expect(agent.biography).toBeDefined();
      expect(agent.biography!.persona.traits).toEqual(['勇敢', '聪明']);
      expect(agent.biography!.persona.values).toEqual(['正义', '家庭']);
      expect(agent.biography!.persona.motto).toBe('勇往直前。');
      expect(agent.biography!.persona.lastUpdated).toBe(5);
      expect(agent.biography!.timeline.length).toBe(1);
      expect(agent.biography!.timeline[0].type).toBe('birth');
      expect(agent.biography!.timeline[0].year).toBe(0);
      expect(agent.biography!.reputation).toBe(0);
    });

    it('should include birth event', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['平凡'],
          values: ['平安'],
          motto: '平凡亦可。',
        }),
        tokensUsed: 30,
        durationMs: 300,
        success: true,
      });

      await system.initNewbornBiography(agent);

      const birthEvent = agent.biography!.timeline.find(e => e.type === 'birth');
      expect(birthEvent).toBeDefined();
      expect(birthEvent!.description).toContain('张三');
      expect(birthEvent!.year).toBe(0);
      expect(birthEvent!.importance).toBe(1.0);
    });

    it('should fall back when LLM is unavailable', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: false,
      });

      await system.initNewbornBiography(agent);

      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
      expect(agent.biography!.persona.values).toEqual(['随遇而安']);
      expect(agent.biography!.persona.motto).toBe('日子总要过下去。');
    });

    it('should fall back when LLM returns invalid JSON', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: 'not json at all',
        tokensUsed: 10,
        durationMs: 200,
        success: true,
      });

      await system.initNewbornBiography(agent);

      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
      expect(agent.biography!.persona.values).toEqual(['随遇而安']);
    });

    it('should look up parent names from state.agents', async () => {
      const parent = makeTestAgent({ id: 'p1', name: '父亲', alive: true, age: 30 });
      state.agents.push(parent);
      agent.family.parents = ['p1'];

      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[0].content;
        return {
          content: JSON.stringify({ traits: ['大胆'], values: ['冒险'], motto: '冒险人生。' }),
          tokensUsed: 30,
          durationMs: 200,
          success: true,
        };
      });

      await system.initNewbornBiography(agent);

      expect(capturedPrompt).toContain('父亲');
    });
  });

  // ── processLifeEvents ──────────────────────────────────────────────

  describe('processLifeEvents', () => {
    beforeEach(async () => {
      // Initialize biography first
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['平凡'],
          values: ['平安'],
          motto: '平安是福。',
        }),
        tokensUsed: 20,
        durationMs: 200,
        success: true,
      });
      await system.initNewbornBiography(agent);
      state.year = 10;
    });

    it('should match marriage keyword', () => {
      system.processLifeEvents(agent, ['张三与邻村姑娘结婚']);
      const event = agent.biography!.timeline.find(e => e.type === 'marriage');
      expect(event).toBeDefined();
      expect(event!.importance).toBe(0.6);
    });

    it('should match child_birth keyword', () => {
      system.processLifeEvents(agent, ['张三家又添一子生子']);
      const event = agent.biography!.timeline.find(e => e.type === 'child_birth');
      expect(event).toBeDefined();
      expect(event!.importance).toBe(0.8);
    });

    it('should match death keyword', () => {
      system.processLifeEvents(agent, ['张三不幸死亡']);
      const event = agent.biography!.timeline.find(e => e.type === 'death');
      expect(event).toBeDefined();
      expect(event!.importance).toBe(1.0);
    });

    it('should match title_change keyword', () => {
      system.processLifeEvents(agent, ['张三当选为村长']);
      const event = agent.biography!.timeline.find(e => e.type === 'title_change');
      expect(event).toBeDefined();
      expect(event!.importance).toBe(0.5);
    });

    it('should match crime keyword', () => {
      system.processLifeEvents(agent, ['张三偷窃被发现']);
      const event = agent.biography!.timeline.find(e => e.type === 'crime');
      expect(event).toBeDefined();
      expect(event!.importance).toBe(0.4);
    });

    it('should match conflict keyword', () => {
      system.processLifeEvents(agent, ['张三与路人争吵起来']);
      const event = agent.biography!.timeline.find(e => e.type === 'conflict');
      expect(event).toBeDefined();
      expect(event!.importance).toBe(0.3);
    });

    it('should match innovation keyword', () => {
      system.processLifeEvents(agent, ['张三发明了新的磨粉方法']);
      const event = agent.biography!.timeline.find(e => e.type === 'innovation');
      expect(event).toBeDefined();
      expect(event!.importance).toBe(1.0);
    });

    it('should match immigration keyword', () => {
      system.processLifeEvents(agent, ['张三迁入桃源镇']);
      const event = agent.biography!.timeline.find(e => e.type === 'immigration');
      expect(event).toBeDefined();
    });

    it('should match achievement keywords', () => {
      system.processLifeEvents(agent, ['张三创作了一幅山水画作']);
      const event = agent.biography!.timeline.find(e => e.type === 'achievement');
      expect(event).toBeDefined();
      expect(event!.importance).toBe(0.5);
    });

    it('should return undefined for unmatched events', () => {
      system.processLifeEvents(agent, ['今天天气不错']);
      const nonBirthEvents = agent.biography!.timeline.filter(e => e.type !== 'birth');
      expect(nonBirthEvents.length).toBe(0);
    });

    it('should not process dead agent', () => {
      agent.alive = false;
      agent.deathYear = 10;
      system.processLifeEvents(agent, ['张三当选为村长']);
      const nonBirthEvents = agent.biography!.timeline.filter(e => e.type !== 'birth');
      expect(nonBirthEvents.length).toBe(0);
    });

    it('should not process agent without biography', () => {
      agent.biography = undefined;
      system.processLifeEvents(agent, ['张三发明了新的磨粉方法']);
      expect(agent.biography).toBeUndefined();
    });
  });

  // ── generateObituary ───────────────────────────────────────────────

  describe('generateObituary', () => {
    beforeEach(async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['勤劳', '善良'],
          values: ['家庭'],
          motto: '勤劳致富。',
        }),
        tokensUsed: 30,
        durationMs: 300,
        success: true,
      });
      await system.initNewbornBiography(agent);
      state.year = 50;
      agent.age = 50;
      agent.alive = false;
      agent.deathYear = 50;

      // Add some timeline events
      agent.biography!.timeline.push(
        { year: 20, type: 'marriage', description: '张三结婚', importance: 0.6 },
        { year: 25, type: 'child_birth', description: '生子', importance: 0.8 },
      );
    });

    it('should generate obituary on LLM success', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          summary: '张三一生勤劳，养育了三个儿女，深受邻里尊敬。',
          legacy: '他在村口种下了一棵百年老槐树。',
        }),
        tokensUsed: 60,
        durationMs: 400,
        success: true,
      });

      await system.generateObituary(agent);

      expect(agent.biography!.obituary).toBeDefined();
      expect(agent.biography!.obituary!.summary).toBe('张三一生勤劳，养育了三个儿女，深受邻里尊敬。');
      expect(agent.biography!.obituary!.legacy).toBe('他在村口种下了一棵百年老槐树。');
      expect(agent.biography!.obituary!.age).toBe(50);
      expect(agent.biography!.obituary!.year).toBe(50);
      expect(agent.biography!.obituary!.majorEventCount).toBe(3);
    });

    it('should fall back when LLM fails', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: false,
      });

      await system.generateObituary(agent);

      expect(agent.biography!.obituary).toBeDefined();
      expect(agent.biography!.obituary!.summary).toContain('张三');
      expect(agent.biography!.obituary!.legacy).toContain('居民之一');
    });

    it('should fall back when LLM returns invalid JSON', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: 'garbage output',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await system.generateObituary(agent);

      expect(agent.biography!.obituary).toBeDefined();
      expect(agent.biography!.obituary!.summary).toContain('张三');
    });

    it('should skip for living agents', async () => {
      agent.alive = true;
      // No second call expected — but let's not mock, just verify no obituary
      await system.generateObituary(agent);
      expect(agent.biography!.obituary).toBeUndefined();
    });

    it('should skip agents without biography', () => {
      agent.biography = undefined;
      expect(() => system.generateObituary(agent)).not.toThrow();
    });
  });

  // ── updateBiographyNarrative ───────────────────────────────────────

  describe('updateBiographyNarrative', () => {
    beforeEach(async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['平凡'],
          values: ['平安'],
          motto: '平安就好。',
        }),
        tokensUsed: 20,
        durationMs: 200,
        success: true,
      });
      await system.initNewbornBiography(agent);
    });

    it('should update narrative_arc every 10 years', async () => {
      // Start at year 5, lastUpdated = 5. Next update at year 15+.
      state.year = 15;
      agent.age = 15;

      // Add a timeline event for context
      agent.biography!.timeline.push({
        year: 10,
        type: 'marriage',
        description: '张三结婚',
        importance: 0.6,
      });

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '张三成年后娶妻立业，性格逐渐沉稳。',
        tokensUsed: 40,
        durationMs: 300,
        success: true,
      });

      await system.updateBiographyNarrative(agent);

      expect(agent.biography!.persona.narrative_arc).toBe(
        '张三成年后娶妻立业，性格逐渐沉稳。',
      );
      expect(agent.biography!.persona.lastUpdated).toBe(15);
      expect(agent.biography!.lastBiographyUpdate).toBe(15);
    });

    it('should NOT update within 10-year window', async () => {
      // lastUpdated = 5, current year 12 → 5 + 10 > 12, no update
      state.year = 12;
      agent.age = 12;

      await system.updateBiographyNarrative(agent);

      // narrative_arc should not change
      expect(agent.biography!.persona.narrative_arc).toContain('人生旅程');
    });

    it('should fall back when LLM fails during update', async () => {
      state.year = 15;
      agent.age = 15;

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: false,
      });

      await system.updateBiographyNarrative(agent);

      expect(agent.biography!.persona.narrative_arc).toContain('张三');
    });

    it('should skip dead agents', async () => {
      agent.alive = false;
      state.year = 15;
      agent.age = 15;

      await system.updateBiographyNarrative(agent);
      expect(agent.biography!.persona.lastUpdated).toBe(5);
    });

    it('should skip agents without biography', async () => {
      agent.biography = undefined;
      state.year = 15;
      await system.updateBiographyNarrative(agent);
      // Should not throw
    });
  });

  // ── getBiographySummary ────────────────────────────────────────────

  describe('getBiographySummary', () => {
    beforeEach(async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['勇敢', '善良'],
          values: ['正义', '家庭'],
          motto: '勇往直前。',
        }),
        tokensUsed: 30,
        durationMs: 300,
        success: true,
      });
      await system.initNewbornBiography(agent);

      // Add timeline events
      agent.biography!.timeline.push(
        { year: 20, type: 'marriage', description: '张三与李四成婚', importance: 0.6 },
      );
    });

    it('should return formatted summary with all fields', () => {
      const summary = system.getBiographySummary('a1');

      expect(summary).toContain('张三');
      expect(summary).toContain('男');
      expect(summary).toContain('5岁');
      expect(summary).toContain('勇敢、善良');
      expect(summary).toContain('正义、家庭');
      expect(summary).toContain('「勇往直前。」');
      expect(summary).toContain('声望：0');
      expect(summary).toContain('人生大事（2件）');
      expect(summary).toContain('第0年');
      expect(summary).toContain('第20年');
    });

    it('should include obituary if present', () => {
      // Add obituary
      agent.biography!.obituary = {
        year: 80,
        age: 80,
        summary: '一生平凡。',
        legacy: '无特别事迹。',
        majorEventCount: 1,
      };

      state.year = 80;
      agent.age = 80;
      agent.alive = false;

      const summary = system.getBiographySummary('a1');
      expect(summary).toContain('── 讣告 ──');
      expect(summary).toContain('一生平凡。');
    });

    it('should return message for unknown agent', () => {
      const summary = system.getBiographySummary('nonexistent');
      expect(summary).toContain('未找到');
    });

    it('should show no biography message if agent has no biography', () => {
      agent.biography = undefined;
      const summary = system.getBiographySummary('a1');
      expect(summary).toContain('暂无档案信息');
    });
  });

  // ── timeline length limit ──────────────────────────────────────────

  describe('timeline length limit', () => {
    beforeEach(async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['平凡'],
          values: ['平安'],
          motto: '平安就好。',
        }),
        tokensUsed: 20,
        durationMs: 200,
        success: true,
      });
      await system.initNewbornBiography(agent);
    });

    it('should keep timeline at most 50 entries', () => {
      // Add 60 events
      for (let i = 0; i < 60; i++) {
        agent.biography!.timeline.push({
          year: i + 5,
          type: 'marriage',
          description: `第${i}个事件`,
          importance: 0.1,
        });
      }

      // processLifeEvents should enforce the limit
      system.processLifeEvents(agent, ['张三当选为村长']);

      expect(agent.biography!.timeline.length).toBeLessThanOrEqual(50);
    });

    it('should trim from the oldest entries when exceeding limit', () => {
      // Add 55 events (1 birth + 54 more = 55 total)
      for (let i = 0; i < 54; i++) {
        agent.biography!.timeline.push({
          year: i + 5,
          type: 'marriage',
          description: `事件${i}`,
          importance: 0.1,
        });
      }

      // processLifeEvents adds one more (56 total → trimmed to 50)
      system.processLifeEvents(agent, ['张三当选为村长']);

      expect(agent.biography!.timeline.length).toBe(50);

      // Earliest entries (birth at year 0) should be trimmed
      const years = agent.biography!.timeline.map(e => e.year);
      expect(years[0]).toBeGreaterThan(0); // birth event should be gone
    });
  });
});
