/**
 * DialogueGenerator 单元测试
 *
 * Covers:
 *  1. LLM 正常返回对话内容
 *  2. LLM 失败时使用 fallback 文字
 *  3. 两人有 biography 时 prompt 包含人格特征
 *  4. 两人无 biography 时 prompt 正常工作
 *  5. samplePairs 返回不重复 pairs
 *  6. samplePairs 在 agents 不足时返回尽可能多的对
 *  7. samplePairs 不产生 self-pair (a === b)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialogueGenerator } from '../../src/llm/dialogue-generator.js';
import { llmClient } from '../../src/llm/llm-client.js';
import { SeededRNG } from '../../src/core/rng.js';
import type { AgentState } from '../../src/core/types.js';

// ─── Mock LLM ──────────────────────────────────────────────────────────

vi.mock('../../src/llm/llm-client.js', () => ({
  llmClient: {
    chat: vi.fn(),
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────

/** Create a minimal AgentState with biography. */
function makeAgent(
  overrides: Partial<AgentState> = {},
): AgentState {
  return {
    id: 'agent-1',
    name: '张三',
    age: 30,
    alive: true,
    gender: '男',
    title: undefined,
    stats: {
      strength: 20,
      intelligence: 20,
      dexterity: 20,
      charisma: 20,
      health: 80,
      maxHealth: 80,
      energy: 60,
      happiness: 60,
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
    x: 0,
    y: 0,
    crimes: 0,
    biography: {
      persona: {
        traits: ['勤劳', '温和'],
        values: ['家庭优先'],
        motto: '家和万事兴。',
        narrative_arc: '张三过着平静的生活。',
        lastUpdated: 0,
      },
      timeline: [],
      reputation: 0,
      lastBiographyUpdate: 0,
    },
    ...overrides,
  };
}

/** Create a minimal AgentState without biography. */
function makeAgentNoBio(overrides: Partial<AgentState> = {}): AgentState {
  return makeAgent({ biography: undefined, ...overrides });
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('DialogueGenerator', () => {
  let rng: SeededRNG;
  let generator: DialogueGenerator;
  let agentA: AgentState;
  let agentB: AgentState;

  beforeEach(() => {
    vi.clearAllMocks();
    rng = new SeededRNG(42);
    generator = new DialogueGenerator(rng);
    agentA = makeAgent({ id: 'a1', name: '张三' });
    agentB = makeAgent({ id: 'a2', name: '李四' });
  });

  // ── 1. LLM 正常返回对话内容 ────────────────────────────────────────

  describe('generateDialogue — LLM success', () => {
    it('should return the LLM content when successful', async () => {
      const dialogue = '张三：「今日收成如何？」\n李四：「还不错。」';
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: dialogue,
        tokensUsed: 30,
        durationMs: 200,
        success: true,
      });

      const result = await generator.generateDialogue(
        agentA,
        agentB,
        { season: 'spring' },
      );

      expect(result).toBe(dialogue);
      expect(llmClient.chat).toHaveBeenCalledTimes(1);
    });

    it('should trim the LLM response', async () => {
      const dialogue = '  张三：「你好」  ';
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: dialogue,
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      const result = await generator.generateDialogue(
        agentA,
        agentB,
        { season: 'spring' },
      );

      expect(result).toBe('张三：「你好」');
    });

    it('should include recent event when provided', async () => {
      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[1].content;
        return { content: '对话', tokensUsed: 5, durationMs: 50, success: true };
      });

      await generator.generateDialogue(
        agentA,
        agentB,
        { season: 'winter', recentEvent: '镇上举办春节庆典' },
      );

      expect(capturedPrompt).toContain('镇上举办春节庆典');
    });
  });

  // ── 2. LLM 失败时使用 fallback 文字 ─────────────────────────────────

  describe('generateDialogue — LLM fallback', () => {
    it('should use fallback when LLM returns success but empty content', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: true,
      });

      const result = await generator.generateDialogue(
        agentA,
        agentB,
        { season: 'summer' },
      );

      expect(result).toBe('张三和各自忙着自己的事，没有交谈。');
    });

    it('should use fallback when LLM is unsuccessful', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: false,
      });

      const result = await generator.generateDialogue(
        agentA,
        agentB,
        { season: 'autumn' },
      );

      expect(result).toBe('张三和各自忙着自己的事，没有交谈。');
    });

    it('should use fallback when LLM.chat throws', async () => {
      vi.mocked(llmClient.chat).mockRejectedValueOnce(new Error('Network error'));

      const result = await generator.generateDialogue(
        agentA,
        agentB,
        { season: 'winter' },
      );

      expect(result).toBe('张三和各自忙着自己的事，没有交谈。');
    });
  });

  // ── 3. 两人有 biography 时 prompt 包含人格特征 ──────────────────────

  describe('generateDialogue — prompt includes biography traits', () => {
    it('should include personality traits when agents have biography', async () => {
      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[1].content;
        return { content: '对话', tokensUsed: 5, durationMs: 50, success: true };
      });

      await generator.generateDialogue(
        agentA,
        agentB,
        { season: 'spring' },
      );

      expect(capturedPrompt).toContain('张三');
      expect(capturedPrompt).toContain('李四');
      expect(capturedPrompt).toContain('勤劳');
      expect(capturedPrompt).toContain('温和');
      expect(capturedPrompt).toContain('家庭优先');
    });

    it('should include system prompt with format instructions', async () => {
      let capturedSystem = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedSystem = messages[0].content;
        return { content: '对话', tokensUsed: 5, durationMs: 50, success: true };
      });

      await generator.generateDialogue(
        agentA,
        agentB,
        { season: 'summer' },
      );

      expect(capturedSystem).toContain('姓名：「对话内容」');
      expect(capturedSystem).toContain('2–4 轮');
    });
  });

  // ── 4. 两人无 biography 时 prompt 正常工作 ───────────────────────────

  describe('generateDialogue — no biography', () => {
    it('should work when agent A has no biography', async () => {
      const agentAClean = makeAgentNoBio({ id: 'a1', name: '王五' });
      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[1].content;
        return { content: '王五：「你好」\n李四：「你好」', tokensUsed: 5, durationMs: 50, success: true };
      });

      const result = await generator.generateDialogue(
        agentAClean,
        agentB,
        { season: 'spring' },
      );

      expect(result).toBe('王五：「你好」\n李四：「你好」');
      // Should not crash, prompt still has names
      expect(capturedPrompt).toContain('王五');
    });

    it('should work when both agents have no biography', async () => {
      const agentAClean = makeAgentNoBio({ id: 'a1', name: '王五' });
      const agentBClean = makeAgentNoBio({ id: 'a2', name: '赵六' });
      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[1].content;
        return { content: '王五：「吃了吗？」\n赵六：「吃了。」', tokensUsed: 5, durationMs: 50, success: true };
      });

      const result = await generator.generateDialogue(
        agentAClean,
        agentBClean,
        { season: 'autumn' },
      );

      expect(result).toBe('王五：「吃了吗？」\n赵六：「吃了。」');
      expect(capturedPrompt).toContain('王五');
      expect(capturedPrompt).toContain('赵六');
    });
  });

  // ── 5. samplePairs 返回不重复 pairs ────────────────────────────────

  describe('samplePairs — basic', () => {
    it('should return the requested number of pairs', () => {
      const agents = [
        makeAgent({ id: 'a1', name: '张三' }),
        makeAgent({ id: 'a2', name: '李四' }),
        makeAgent({ id: 'a3', name: '王五' }),
        makeAgent({ id: 'a4', name: '赵六' }),
      ];
      const pairs = generator.samplePairs(agents, 3);

      expect(pairs).toHaveLength(3);
    });

    it('should return deterministic results for the same seed', () => {
      const rng1 = new SeededRNG(100);
      const gen1 = new DialogueGenerator(rng1);
      const rng2 = new SeededRNG(100);
      const gen2 = new DialogueGenerator(rng2);

      const agents = [
        makeAgent({ id: 'a1', name: '张三' }),
        makeAgent({ id: 'a2', name: '李四' }),
        makeAgent({ id: 'a3', name: '王五' }),
        makeAgent({ id: 'a4', name: '赵六' }),
      ];

      const pairs1 = gen1.samplePairs(agents, 5);
      const pairs2 = gen2.samplePairs(agents, 5);

      for (let i = 0; i < pairs1.length; i++) {
        expect(pairs1[i][0].name).toBe(pairs2[i][0].name);
        expect(pairs1[i][1].name).toBe(pairs2[i][1].name);
      }
    });

    it('should only sample alive agents', () => {
      const agents = [
        makeAgent({ id: 'a1', name: '张三', alive: true }),
        makeAgent({ id: 'a2', name: '李四', alive: false }),
        makeAgent({ id: 'a3', name: '王五', alive: true }),
      ];
      const pairs = generator.samplePairs(agents, 4);

      // Only 2 alive agents → max 2 pairs
      expect(pairs).toHaveLength(2);
      for (const [a, b] of pairs) {
        expect(a.alive).toBe(true);
        expect(b.alive).toBe(true);
        expect(a.name).not.toBe('李四');
        expect(b.name).not.toBe('李四');
      }
    });
  });

  // ── 6. samplePairs 在 agents 不足时返回尽可能多的对 ─────────────────

  describe('samplePairs — insufficient agents', () => {
    it('should return empty when there are fewer than 2 alive agents', () => {
      const agents = [
        makeAgent({ id: 'a1', name: '张三' }),
      ];
      const pairs = generator.samplePairs(agents, 10);
      expect(pairs).toHaveLength(0);
    });

    it('should return all possible pairs when count exceeds available', () => {
      const agents = [
        makeAgent({ id: 'a1', name: '张三' }),
        makeAgent({ id: 'a2', name: '李四' }),
        makeAgent({ id: 'a3', name: '王五' }),
      ];
      // 3 alive → 3*2 = 6 max pairs, but we ask for 10
      const pairs = generator.samplePairs(agents, 10);
      // With 3 agents after shuffle, 3*(3-1) = 6 pairs max
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs.length).toBeLessThanOrEqual(6);
    });

    it('should return 2 pairs for 2 alive agents (n*(n-1) = 2)', () => {
      const agents = [
        makeAgent({ id: 'a1', name: '张三' }),
        makeAgent({ id: 'a2', name: '李四' }),
      ];
      const pairs = generator.samplePairs(agents, 100);
      expect(pairs).toHaveLength(2);
    });

    it('should return 0 pairs when count is 0', () => {
      const agents = [
        makeAgent({ id: 'a1', name: '张三' }),
        makeAgent({ id: 'a2', name: '李四' }),
      ];
      const pairs = generator.samplePairs(agents, 0);
      expect(pairs).toHaveLength(0);
    });
  });

  // ── 7. samplePairs 不产生 self-pair (a === b) ──────────────────────

  describe('samplePairs — no self-pair', () => {
    it('should never have a === b in a pair', () => {
      const agents = [
        makeAgent({ id: 'a1', name: '张三' }),
        makeAgent({ id: 'a2', name: '李四' }),
        makeAgent({ id: 'a3', name: '王五' }),
        makeAgent({ id: 'a4', name: '赵六' }),
      ];
      const pairs = generator.samplePairs(agents, 5);

      for (const [a, b] of pairs) {
        expect(a.id).not.toBe(b.id);
        expect(a).not.toBe(b);
      }
    });

    it('should not produce duplicate pairs', () => {
      const agents = [
        makeAgent({ id: 'a1', name: '张三' }),
        makeAgent({ id: 'a2', name: '李四' }),
        makeAgent({ id: 'a3', name: '王五' }),
      ];
      const pairs = generator.samplePairs(agents, 20);

      const pairKeys = pairs.map(([a, b]) => `${a.id}-${b.id}`);
      const uniqueKeys = new Set(pairKeys);
      expect(pairKeys.length).toBe(uniqueKeys.size);
    });
  });
});
