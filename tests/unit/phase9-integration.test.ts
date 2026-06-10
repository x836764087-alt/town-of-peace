/**
 * BiographySystem 集成测试 — Phase 9
 *
 * 在最小化的模拟场景中验证 BiographySystem 的全链路行为：
 *  1. 新生儿自动获得 biography
 *  2. 死亡 agent 有讣告
 *  3. LifeEvent 随模拟推进自动追加
 *  4. LLM 不可用时系统不崩溃
 *  5. llmClient 单例可正常导入
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

function makeTestState(agents: AgentState[] = [], year = 5): WorldState {
  return {
    year,
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
    crimeWave: 0,
    pendingTrials: [],
  };
}

// ─── Mock LLM (module-level) ──────────────────────────────────────────

vi.mock('../../src/llm/llm-client.js', () => ({
  llmClient: {
    chat: vi.fn(),
  },
}));

// ─── Integration Tests ────────────────────────────────────────────────

describe('Phase 9 Integration', () => {
  let state: WorldState;
  let system: BiographySystem;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: Newborn automatically gets biography ────────────────────

  describe('newborn auto biography', () => {
    it('should give every alive agent a biography with persona and birth event', async () => {
      // Create multiple agents (parents + newborn)
      const parent1 = makeTestAgent({ id: 'p1', name: '李父', born: 0, age: 20 });
      const parent2 = makeTestAgent({ id: 'p2', name: '李母', born: 0, age: 18 });
      const newborn = makeTestAgent({ id: 'n1', name: '李小明', born: 0, age: 0 });
      newborn.family.parents = ['p1', 'p2'];

      state = makeTestState([parent1, parent2, newborn], 1);
      system = new BiographySystem(state);

      // LLM returns persona for newborn
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['勇敢', '聪明'],
          values: ['正义', '家庭'],
          motto: '勇往直前。',
        }),
        tokensUsed: 50,
        durationMs: 200,
        success: true,
      });

      await system.initNewbornBiography(newborn);

      // Verify biography exists
      expect(newborn.biography).toBeDefined();

      // Verify persona fields
      expect(newborn.biography!.persona).toBeDefined();
      expect(Array.isArray(newborn.biography!.persona.traits)).toBe(true);
      expect(newborn.biography!.persona.traits.length).toBeGreaterThan(0);

      // Verify timeline has birth event
      const birthEvents = newborn.biography!.timeline.filter(e => e.type === 'birth');
      expect(birthEvents.length).toBe(1);
      expect(birthEvents[0].year).toBe(0);
      expect(birthEvents[0].description).toContain('李小明');
    });

    it('should have persona even when using fallback values', async () => {
      const newborn = makeTestAgent({ id: 'n1', name: '孤儿', born: 0, age: 0 });
      state = makeTestState([newborn], 1);
      system = new BiographySystem(state);

      // LLM unavailable
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: false,
      });

      await system.initNewbornBiography(newborn);

      expect(newborn.biography!.persona).toBeDefined();
      expect(newborn.biography!.persona.traits.length).toBeGreaterThan(0);
      expect(newborn.biography!.persona.values.length).toBeGreaterThan(0);
      expect(newborn.biography!.persona.motto).toBeDefined();
    });
  });

  // ── Test 2: Death generates obituary ────────────────────────────────

  describe('dead agent obituary', () => {
    it('should generate obituary when agent dies', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '王老', born: 0, age: 80 });
      state = makeTestState([agent], 1);
      system = new BiographySystem(state);

      // Init biography first
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

      // Mark as dead, add timeline events
      agent.alive = false;
      agent.deathYear = 80;
      agent.age = 80;
      state.year = 80;
      agent.biography!.timeline.push(
        { year: 25, type: 'marriage', description: '王老结婚', importance: 0.6 },
        { year: 26, type: 'child_birth', description: '生子', importance: 0.8 },
        { year: 60, type: 'innovation', description: '发明新农具', importance: 1.0 },
      );

      // Generate obituary
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          summary: '王老一生勤劳，育有子女五人，为桃源镇农业发展做出贡献。',
          legacy: '他发明的改良犁至今仍被后人使用。',
        }),
        tokensUsed: 60,
        durationMs: 400,
        success: true,
      });

      await system.generateObituary(agent);

      // Verify obituary
      expect(agent.biography!.obituary).toBeDefined();
      expect(agent.biography!.obituary!.year).toBe(80);
      expect(agent.biography!.obituary!.age).toBe(80);
      expect(agent.biography!.obituary!.summary.length).toBeGreaterThan(10);
      expect(agent.biography!.obituary!.legacy.length).toBeGreaterThan(5);
      expect(agent.biography!.obituary!.majorEventCount).toBeGreaterThan(0);
    });

    it('should generate obituary with fallback when LLM fails', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '李翁', born: 0, age: 70 });
      state = makeTestState([agent], 1);
      system = new BiographySystem(state);

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({ traits: ['平凡'], values: ['平安'], motto: '平安就好。' }),
        tokensUsed: 20,
        durationMs: 200,
        success: true,
      });
      await system.initNewbornBiography(agent);

      agent.alive = false;
      agent.deathYear = 70;
      agent.age = 70;
      state.year = 70;

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 50,
        success: false,
      });

      await system.generateObituary(agent);

      expect(agent.biography!.obituary).toBeDefined();
      expect(agent.biography!.obituary!.summary).toContain('李翁');
      expect(agent.biography!.obituary!.legacy).toContain('居民之一');
      expect(agent.biography!.obituary!.year).toBe(70);
      expect(agent.biography!.obituary!.age).toBe(70);
    });

    it('should NOT generate obituary for living agents', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '壮年', born: 0, age: 30 });
      state = makeTestState([agent], 30);
      system = new BiographySystem(state);

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({ traits: ['年轻'], values: ['希望'], motto: '未来可期。' }),
        tokensUsed: 20,
        durationMs: 200,
        success: true,
      });
      await system.initNewbornBiography(agent);

      agent.alive = true;
      // No second LLM call — obituary should not be generated
      await system.generateObituary(agent);

      expect(agent.biography!.obituary).toBeUndefined();
    });
  });

  // ── Test 3: LifeEvents appended over time ───────────────────────────

  describe('LifeEvent growth over simulation', () => {
    it('should accumulate timeline events as simulation progresses', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '赵老', born: 0, age: 0 });
      state = makeTestState([agent], 0);
      system = new BiographySystem(state);

      // Init biography at year 0
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['坚韧', '务实'],
          values: ['家庭', '土地'],
          motto: '脚踏实地。',
        }),
        tokensUsed: 40,
        durationMs: 300,
        success: true,
      });
      await system.initNewbornBiography(agent);

      expect(agent.biography!.timeline.length).toBe(1); // birth

      // Simulate: year 15 — marriage
      state.year = 15;
      agent.age = 15;
      system.processLifeEvents(agent, ['赵老与邻村姑娘结婚']);
      expect(agent.biography!.timeline.length).toBe(2);

      // Simulate: year 20 — child birth
      state.year = 20;
      agent.age = 20;
      system.processLifeEvents(agent, ['赵家又添一子生子']);
      expect(agent.biography!.timeline.length).toBe(3);

      // Simulate: year 30 — innovation
      state.year = 30;
      agent.age = 30;
      system.processLifeEvents(agent, ['赵老发明了新的水车']);
      expect(agent.biography!.timeline.length).toBe(4);

      // Simulate: year 35 — title change
      state.year = 35;
      agent.age = 35;
      system.processLifeEvents(agent, ['赵老当选为村长']);
      expect(agent.biography!.timeline.length).toBe(5);

      // Verify timeline events are in chronological order
      const years = agent.biography!.timeline.map(e => e.year);
      for (let i = 1; i < years.length; i++) {
        expect(years[i]).toBeGreaterThanOrEqual(years[i - 1]);
      }

      // Verify event types
      const types = agent.biography!.timeline.map(e => e.type);
      expect(types).toContain('birth');
      expect(types).toContain('marriage');
      expect(types).toContain('child_birth');
      expect(types).toContain('innovation');
      expect(types).toContain('title_change');
    });

    it('should not process events for dead agents', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '亡者', born: 0, age: 0 });
      state = makeTestState([agent], 0);
      system = new BiographySystem(state);

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({ traits: ['平凡'], values: ['平安'], motto: '平安就好。' }),
        tokensUsed: 20,
        durationMs: 200,
        success: true,
      });
      await system.initNewbornBiography(agent);

      // Mark as dead at year 10
      state.year = 10;
      agent.alive = false;
      agent.deathYear = 10;
      agent.age = 10;

      const eventsBefore = agent.biography!.timeline.length;

      // Try to process events while dead — should not add anything
      system.processLifeEvents(agent, ['亡者当选为村长', '亡者发明新法']);
      const eventsAfter = agent.biography!.timeline.length;

      expect(eventsAfter).toBe(eventsBefore);
    });
  });

  // ── Test 4: System is resilient when LLM is unavailable ─────────────

  describe('LLM failure resilience', () => {
    it('should handle LLM throwing an exception gracefully', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '测试', born: 0, age: 0 });
      state = makeTestState([agent], 0);
      system = new BiographySystem(state);

      // LLM throws
      vi.mocked(llmClient.chat).mockRejectedValueOnce(new Error('Network error'));

      // initNewbornBiography should still work (fallback)
      await expect(system.initNewbornBiography(agent)).resolves.toBeUndefined();
      expect(agent.biography).toBeDefined();
      expect(agent.biography!.persona.traits.length).toBeGreaterThan(0);

      // processLifeEvents should work (doesn't use LLM)
      state.year = 10;
      system.processLifeEvents(agent, ['测试结婚']);
      expect(agent.biography!.timeline.length).toBe(2); // birth + marriage

      // generateObituary should use fallback
      agent.alive = false;
      agent.deathYear = 10;
      agent.age = 10;
      vi.mocked(llmClient.chat).mockRejectedValueOnce(new Error('LLM down'));
      await expect(system.generateObituary(agent)).resolves.toBeUndefined();
      expect(agent.biography!.obituary).toBeDefined();
      expect(agent.biography!.obituary!.summary).toContain('测试');
    });

    it('should handle LLM returning empty content gracefully', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '空返', born: 0, age: 0 });
      state = makeTestState([agent], 0);
      system = new BiographySystem(state);

      // LLM returns success but empty content
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: true,
      });

      await system.initNewbornBiography(agent);
      expect(agent.biography).toBeDefined();
      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
    });

    it('should handle LLM returning malformed JSON gracefully', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '乱码', born: 0, age: 0 });
      state = makeTestState([agent], 0);
      system = new BiographySystem(state);

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: 'this is not valid json {{}}',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await system.initNewbornBiography(agent);
      expect(agent.biography).toBeDefined();
      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
    });

    it('should handle multiple LLM failures in sequence', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '坚韧', born: 0, age: 0 });
      state = makeTestState([agent], 0);
      system = new BiographySystem(state);

      // All LLM calls fail
      vi.mocked(llmClient.chat).mockRejectedValue(new Error('Always down'));

      // Init biography
      await system.initNewbornBiography(agent);
      expect(agent.biography).toBeDefined();

      // Process events (no LLM needed)
      state.year = 15;
      system.processLifeEvents(agent, ['坚韧结婚']);
      expect(agent.biography!.timeline.length).toBe(2);

      // Update narrative (LLM fallback)
      state.year = 15;
      agent.age = 15;
      await system.updateBiographyNarrative(agent);
      expect(agent.biography!.persona.narrative_arc).toContain('坚韧');

      // Generate obituary
      agent.alive = false;
      agent.deathYear = 15;
      agent.age = 15;
      await system.generateObituary(agent);
      expect(agent.biography!.obituary).toBeDefined();
    });
  });

  // ── Test 5: llmClient singleton is importable ────────────────────────

  describe('llmClient singleton', () => {
    it('should be importable from llm-client module', () => {
      expect(llmClient).toBeDefined();
      expect(typeof llmClient.chat).toBe('function');
    });

    it('should have a valid chat method signature', () => {
      // Verify it's the mocked function
      expect(llmClient.chat).toBeDefined();
      expect(llmClient.chat).toBeInstanceOf(Function);
    });
  });

  // ── End-to-end mini-simulation ──────────────────────────────────────

  describe('mini simulation lifecycle', () => {
    it('should survive a complete lifecycle: birth → life events → death → obituary', async () => {
      const agent = makeTestAgent({ id: 'a1', name: '终老', born: 0, age: 0 });
      state = makeTestState([agent], 0);
      system = new BiographySystem(state);

      // ── Birth (year 0) ──
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['乐观', '勤劳'],
          values: ['家庭', '自由'],
          motto: '笑对人生。',
        }),
        tokensUsed: 50,
        durationMs: 300,
        success: true,
      });
      await system.initNewbornBiography(agent);
      expect(agent.biography!.persona.traits).toEqual(['乐观', '勤劳']);
      expect(agent.biography!.timeline).toHaveLength(1);
      expect(agent.biography!.timeline[0].type).toBe('birth');

      // ── Life events across decades ──
      state.year = 18;
      agent.age = 18;
      system.processLifeEvents(agent, ['终老与翠花结婚']);
      expect(agent.biography!.timeline).toHaveLength(2);

      state.year = 22;
      agent.age = 22;
      system.processLifeEvents(agent, ['翠花生子']);
      expect(agent.biography!.timeline).toHaveLength(3);

      state.year = 45;
      agent.age = 45;
      system.processLifeEvents(agent, ['终老当选为村长']);
      expect(agent.biography!.timeline).toHaveLength(4);

      // ── Narrative update (decade milestone) ──
      state.year = 50;
      agent.age = 50;
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '终老年过半百，成为村长，人生步入新阶段。',
        tokensUsed: 30,
        durationMs: 200,
        success: true,
      });
      await system.updateBiographyNarrative(agent);
      expect(agent.biography!.persona.narrative_arc).toBe('终老年过半百，成为村长，人生步入新阶段。');
      expect(agent.biography!.persona.lastUpdated).toBe(50);

      // ── Death ──
      state.year = 75;
      agent.age = 75;
      agent.alive = false;
      agent.deathYear = 75;

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          summary: '终老一生勤勉，担任村长二十载，造福乡里。',
          legacy: '他在任期间兴修水利，灌溉千亩良田。',
        }),
        tokensUsed: 60,
        durationMs: 400,
        success: true,
      });
      await system.generateObituary(agent);
      expect(agent.biography!.obituary).toBeDefined();
      expect(agent.biography!.obituary!.summary).toBe('终老一生勤勉，担任村长二十载，造福乡里。');
      expect(agent.biography!.obituary!.legacy).toBe('他在任期间兴修水利，灌溉千亩良田。');
      expect(agent.biography!.obituary!.year).toBe(75);
      expect(agent.biography!.obituary!.age).toBe(75);

      // ── Summary should include all sections ──
      const summary = system.getBiographySummary('a1');
      expect(summary).toContain('终老');
      expect(summary).toContain('乐观、勤劳');
      expect(summary).toContain('家庭、自由');
      expect(summary).toContain('「笑对人生。」');
      expect(summary).toContain('人生大事（4件）');
      expect(summary).toContain('── 讣告 ──');
      expect(summary).toContain('终老一生勤勉');

      // ── Verify no agents are missing biography ──
      for (const a of state.agents) {
        expect(a.biography).toBeDefined();
        expect(a.biography!.persona).toBeDefined();
      }
    });

    it('should handle multiple agents with different fates', async () => {
      const longLived = makeTestAgent({ id: 'a1', name: '长寿', born: 0, age: 0 });
      const shortLived = makeTestAgent({ id: 'a2', name: '早逝', born: 0, age: 0 });
      const living = makeTestAgent({ id: 'a3', name: '健在', born: 10, age: 5 });

      state = makeTestState([longLived, shortLived, living], 0);
      system = new BiographySystem(state);

      // Init biographies for all three
      vi.mocked(llmClient.chat).mockResolvedValue({
        content: JSON.stringify({
          traits: ['平凡'],
          values: ['平安'],
          motto: '平安就好。',
        }),
        tokensUsed: 20,
        durationMs: 200,
        success: true,
      });
      await system.initNewbornBiography(longLived);

      vi.mocked(llmClient.chat).mockResolvedValue({
        content: JSON.stringify({
          traits: ['脆弱'],
          values: ['生命'],
          motto: '短暂亦美。',
        }),
        tokensUsed: 20,
        durationMs: 200,
        success: true,
      });
      await system.initNewbornBiography(shortLived);

      vi.mocked(llmClient.chat).mockResolvedValue({
        content: JSON.stringify({
          traits: ['年轻'],
          values: ['希望'],
          motto: '未来可期。',
        }),
        tokensUsed: 20,
        durationMs: 200,
        success: true,
      });
      await system.initNewbornBiography(living);

      // All have biography
      for (const a of state.agents) {
        expect(a.biography).toBeDefined();
        expect(a.biography!.timeline).toHaveLength(1);
      }

      // Short-lived agent dies early (year 3)
      shortLived.alive = false;
      shortLived.deathYear = 3;
      shortLived.age = 3;
      state.year = 3;

      vi.mocked(llmClient.chat).mockResolvedValue({
        content: JSON.stringify({
          summary: '早逝虽然年纪轻轻，但为桃源镇带来过欢笑。',
          legacy: '他是桃源镇最年轻的居民之一。',
        }),
        tokensUsed: 30,
        durationMs: 200,
        success: true,
      });
      await system.generateObituary(shortLived);
      expect(shortLived.biography!.obituary).toBeDefined();
      expect(shortLived.biography!.obituary!.age).toBe(3);

      // Long-lived agent lives through life events
      state.year = 20;
      longLived.age = 20;
      longLived.alive = true;
      system.processLifeEvents(longLived, ['长寿结婚']);
      expect(longLived.biography!.timeline).toHaveLength(2);

      // Living agent still alive
      expect(living.alive).toBe(true);
      expect(living.biography!.obituary).toBeUndefined();

      // All agents still have biographies
      for (const a of state.agents) {
        expect(a.biography).toBeDefined();
        expect(a.biography!.persona.traits.length).toBeGreaterThan(0);
      }
    });
  });
});
