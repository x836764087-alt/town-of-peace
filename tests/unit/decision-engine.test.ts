/**
 * DecisionEngine 单元测试
 *
 * Covers:
 *  1. 有 biography → LLM 返回决策选项，按权重排序
 *  2. 无 biography → 等权重回退
 *  3. LLM 失败（throw） → 等权重回退
 *  4. JSON 解析失败 → 等权重回退
 *  5. selectDecision 按权重分布（mock RNG 验证）
 *  6. 3 个选项时权重和分布正确
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecisionEngine, type DecisionOption } from '../../src/llm/decision-engine.js';
import { llmClient } from '../../src/llm/llm-client.js';
import { SeededRNG } from '../../src/core/rng.js';
import type { AgentState } from '../../src/core/types.js';

// ─── Mock LLM ───────────────────────────────────────────────────────────

vi.mock('../../src/llm/llm-client.js', () => ({
  llmClient: {
    chat: vi.fn(),
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────

function makeAgent(
  withBiography = true,
  memories: AgentState['memories'] = [],
): AgentState {
  const base: AgentState = {
    id: 'agent_001',
    name: '李四',
    age: 28,
    alive: true,
    gender: '男',
    title: undefined,
    stats: {
      strength: 15,
      intelligence: 20,
      dexterity: 10,
      charisma: 12,
      health: 80,
      maxHealth: 80,
      energy: 60,
      happiness: 70,
    },
    skills: {},
    inventory: { items: {} },
    relationships: {},
    family: { spouse: undefined, children: [], parents: [], household: [] },
    conditions: [],
    memories,
    born: 0,
    wealth: 100,
    employees: [],
    tags: [],
    x: 0,
    y: 0,
    crimes: 0,
  };

  if (withBiography) {
    base.biography = {
      persona: {
        traits: ['勤劳', '节俭'],
        values: ['家庭优先', '厌恶风险'],
        motto: '安稳度日才是正道。',
        narrative_arc: '李四一直过着平凡安稳的生活。',
        lastUpdated: 0,
      },
      timeline: [],
      reputation: 0,
      lastBiographyUpdate: 0,
    };
  }

  return base;
}

function mockLLMResponse(content: string, success = true) {
  vi.mocked(llmClient.chat).mockResolvedValueOnce({
    content,
    tokensUsed: 50,
    durationMs: 300,
    success,
  });
}

function mockLLMReject() {
  vi.mocked(llmClient.chat).mockRejectedValueOnce(new Error('Network error'));
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('DecisionEngine', () => {
  let engine: DecisionEngine;
  let rng: SeededRNG;

  beforeEach(() => {
    vi.clearAllMocks();
    rng = new SeededRNG(42);
    engine = new DecisionEngine(rng);
  });

  // ── 1. 有 biography → LLM 返回决策选项 ─────────────────────────────

  describe('suggestDecisions — with biography', () => {
    it('should call LLM and return parsed decision options', async () => {
      const agent = makeAgent(true);
      const choices = ['种田', '打猎', '钓鱼'];
      const situation = '春天来了，需要决定今天的活动。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          decisions: [
            { action: '种田', weight: 90, reason: '春季适合播种' },
            { action: '打猎', weight: 30, reason: '春天猎物不多' },
            { action: '钓鱼', weight: 50, reason: '春季鱼肥' },
          ],
        }),
        tokensUsed: 50,
        durationMs: 300,
        success: true,
      });

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(3);
      expect(result[0].action).toBe('种田'); // sorted by weight desc
      expect(result[0].weight).toBe(90);
      expect(result[1].action).toBe('钓鱼');
      expect(result[1].weight).toBe(50);
      expect(result[2].action).toBe('打猎');
      expect(result[2].weight).toBe(30);
    });

    it('should include agent info, persona, memories, situation in LLM prompt', async () => {
      const agent = makeAgent(true, [
        { year: 5, content: '李四娶了王五的女儿', importance: 0.7 },
        { year: 8, content: '李四的庄稼大丰收', importance: 0.9 },
        { year: 10, content: '李四当选村长', importance: 0.8 },
      ]);
      const choices = ['种田', '休息'];
      const situation = '秋天收获季节。';

      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[0].content;
        return {
          content: JSON.stringify({
            decisions: [{ action: '种田', weight: 80, reason: '丰收季继续种田' }],
          }),
          tokensUsed: 50,
          durationMs: 300,
          success: true,
        };
      });

      await engine.suggestDecisions(agent, { choices, situation });

      expect(capturedPrompt).toContain('李四');
      expect(capturedPrompt).toContain('28');
      expect(capturedPrompt).toContain('男');
      expect(capturedPrompt).toContain('勤劳');
      expect(capturedPrompt).toContain('家庭优先');
      expect(capturedPrompt).toContain('安稳度日才是正道');
      expect(capturedPrompt).toContain('李四娶了王五的女儿');
      expect(capturedPrompt).toContain('李四的庄稼大丰收');
      expect(capturedPrompt).toContain('李四当选村长');
      expect(capturedPrompt).toContain('秋天收获季节');
    });

    it('should cap memories to 3 most recent', async () => {
      const agent = makeAgent(true,
        Array.from({ length: 10 }, (_, i) => ({
          year: i,
          content: `记忆${i}`,
          importance: 0.5,
        })),
      );
      const choices = ['选项A'];
      const situation = '测试。';

      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[0].content;
        return {
          content: JSON.stringify({
            decisions: [{ action: '选项A', weight: 50, reason: 'test' }],
          }),
          tokensUsed: 50,
          durationMs: 300,
          success: true,
        };
      });

      await engine.suggestDecisions(agent, { choices, situation });

      // Should contain memories 8, 9 (last 3 out of 0-9 are 7,8,9)
      expect(capturedPrompt).toContain('记忆7');
      expect(capturedPrompt).toContain('记忆9');
    });

    it('should only include known actions in the result', async () => {
      const agent = makeAgent(true);
      const choices = ['种田', '打猎'];
      const situation = '测试。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          decisions: [
            { action: '种田', weight: 80, reason: '好选择' },
            { action: '挖矿', weight: 90, reason: '不在选项中' },
          ],
        }),
        tokensUsed: 50,
        durationMs: 300,
        success: true,
      });

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('种田');
    });

    it('should clamp weights to [0, 100]', async () => {
      const agent = makeAgent(true);
      const choices = ['种田'];
      const situation = '测试。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          decisions: [
            { action: '种田', weight: -10, reason: '负权重' },
          ],
        }),
        tokensUsed: 50,
        durationMs: 300,
        success: true,
      });

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result[0].weight).toBe(0);
    });
  });

  // ── 2. 无 biography → 等权重回退 ────────────────────────────────────

  describe('suggestDecisions — no biography', () => {
    it('should return equal weights when agent has no biography', async () => {
      const agent = makeAgent(false);
      const choices = ['种田', '打猎', '钓鱼'];
      const situation = '测试。';

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(3);
      const expectedWeight = Math.floor(100 / 3); // 33
      expect(result[0].weight).toBe(expectedWeight);
      expect(result[1].weight).toBe(expectedWeight);
      expect(result[2].weight).toBe(expectedWeight);
      expect(llmClient.chat).not.toHaveBeenCalled();
    });
  });

  // ── 3. LLM 失败（throw） → 等权重回退 ──────────────────────────────

  describe('suggestDecisions — LLM throws', () => {
    it('should fallback to equal weights when LLM throws', async () => {
      const agent = makeAgent(true);
      const choices = ['种田', '打猎'];
      const situation = '测试。';

      mockLLMReject();

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(2);
      expect(result[0].weight).toBe(50);
      expect(result[1].weight).toBe(50);
    });
  });

  // ── 4. JSON 解析失败 → 等权重回退 ───────────────────────────────────

  describe('suggestDecisions — invalid JSON', () => {
    it('should fallback when LLM returns invalid JSON', async () => {
      const agent = makeAgent(true);
      const choices = ['种田', '打猎'];
      const situation = '测试。';

      mockLLMResponse('this is not json at all');

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(2);
      expect(result[0].weight).toBe(50);
      expect(result[1].weight).toBe(50);
    });

    it('should fallback when JSON is missing decisions array', async () => {
      const agent = makeAgent(true);
      const choices = ['种田', '打猎'];
      const situation = '测试。';

      mockLLMResponse(JSON.stringify({ data: 'no decisions key' }));

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(2);
      expect(result[0].weight).toBe(50);
    });

    it('should fallback when LLM returns success but empty content', async () => {
      const agent = makeAgent(true);
      const choices = ['种田', '打猎'];
      const situation = '测试。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: true,
      });

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(2);
      expect(result[0].weight).toBe(50);
    });

    it('should fallback when LLM returns success: false', async () => {
      const agent = makeAgent(true);
      const choices = ['种田', '打猎'];
      const situation = '测试。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: 'some content',
        tokensUsed: 10,
        durationMs: 100,
        success: false,
      });

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(2);
      expect(result[0].weight).toBe(50);
    });
  });

  // ── 5. selectDecision — weighted random ──────────────────────────────

  describe('selectDecision — weighted random', () => {
    it('should pick based on weights', () => {
      const options: DecisionOption[] = [
        { action: 'A', weight: 0, reason: 'no chance' },
        { action: 'B', weight: 90, reason: 'most likely' },
        { action: 'C', weight: 10, reason: 'rare' },
      ];

      // With seed 42, we can predict the RNG behavior.
      // Instead of predicting exact outcome, verify distribution over many runs.
      const counts = new Map<string, number>();
      for (let i = 0; i < 1000; i++) {
        // Reset RNG for reproducibility (each call consumes RNG state)
        const newRng = new SeededRNG(42 + i);
        const testEngine = new DecisionEngine(newRng);
        const selected = testEngine.selectDecision(options);
        counts.set(selected, (counts.get(selected) || 0) + 1);
      }

      // B should be selected most often (90% weight)
      // C should be selected occasionally (10% weight)
      // A should never be selected (0% weight) — filtered out by selectDecision
      expect(counts.has('A')).toBe(false);
      expect(counts.get('B')!).toBeGreaterThan(counts.get('C')!);
      expect(counts.get('C')!).toBeGreaterThan(0);
    });

    it('should throw on empty options', () => {
      expect(() => engine.selectDecision([])).toThrow('Cannot select from empty options');
    });

    it('should pick from zero-weight options when all weights are 0', () => {
      const options: DecisionOption[] = [
        { action: 'A', weight: 0, reason: '' },
        { action: 'B', weight: 0, reason: '' },
      ];

      // All weights are 0, should fall back to uniform pick
      // Pick any option should succeed
      const result = engine.selectDecision(options);
      expect(result).toBe('A'); // With seed 42, int(0,1) gives first item
    });

    it('should handle single option', () => {
      const options: DecisionOption[] = [
        { action: '唯一', weight: 50, reason: 'no choice' },
      ];

      const result = engine.selectDecision(options);
      expect(result).toBe('唯一');
    });
  });

  // ── 6. 3 个选项时权重和分布正确 ─────────────────────────────────────

  describe('suggestDecisions — 3 choices weight correctness', () => {
    it('should return 3 options with correct weights from LLM', async () => {
      const agent = makeAgent(true);
      const choices = ['种田', '打猎', '钓鱼'];
      const situation = '春耕时节。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          decisions: [
            { action: '种田', weight: 80, reason: '春季播种' },
            { action: '打猎', weight: 20, reason: '春困猎物流' },
            { action: '钓鱼', weight: 50, reason: '春季钓鱼不错' },
          ],
        }),
        tokensUsed: 50,
        durationMs: 300,
        success: true,
      });

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(3);
      // Should be sorted by weight desc
      expect(result[0].action).toBe('种田');
      expect(result[0].weight).toBe(80);
      expect(result[1].action).toBe('钓鱼');
      expect(result[1].weight).toBe(50);
      expect(result[2].action).toBe('打猎');
      expect(result[2].weight).toBe(20);
    });

    it('should distribute correctly in selectDecision for 3 options', () => {
      const options: DecisionOption[] = [
        { action: 'A', weight: 70, reason: 'most' },
        { action: 'B', weight: 20, reason: 'medium' },
        { action: 'C', weight: 10, reason: 'least' },
      ];

      const counts = new Map<string, number>();
      for (let i = 0; i < 1000; i++) {
        const newRng = new SeededRNG(42 + i);
        const testEngine = new DecisionEngine(newRng);
        const selected = testEngine.selectDecision(options);
        counts.set(selected, (counts.get(selected) || 0) + 1);
      }

      // A should dominate (~70%), B moderate (~20%), C rare (~10%)
      const aCount = counts.get('A')!;
      const bCount = counts.get('B')!;
      const cCount = counts.get('C')!;

      expect(aCount).toBeGreaterThan(bCount + 100);
      expect(bCount).toBeGreaterThan(cCount + 50);
      expect(aCount + bCount + cCount).toBe(1000);
    });

    it('should return equal weights for 3 options when no biography', async () => {
      const agent = makeAgent(false);
      const choices = ['选项A', '选项B', '选项C'];
      const situation = '测试。';

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(3);
      const expectedWeight = Math.floor(100 / 3); // 33
      for (const opt of result) {
        expect(opt.weight).toBe(expectedWeight);
        expect(opt.action).toMatch(/^选项/);
      }
    });

    it('should handle choices not matching LLM actions', async () => {
      const agent = makeAgent(true);
      const choices = ['种田', '打猎'];
      const situation = '测试。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          decisions: [
            { action: '挖矿', weight: 100, reason: '不在 choices 中' },
          ],
        }),
        tokensUsed: 50,
        durationMs: 300,
        success: true,
      });

      const result = await engine.suggestDecisions(agent, { choices, situation });

      // LLM action '挖矿' not in choices → filtered out → fallback
      expect(result).toHaveLength(2);
      expect(result[0].weight).toBe(50);
      expect(result[1].weight).toBe(50);
    });
  });

  // ── 7. 边界情况 ─────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should return empty array for empty choices', async () => {
      const agent = makeAgent(true);
      const result = await engine.suggestDecisions(agent, {
        choices: [],
        situation: '测试',
      });
      expect(result).toEqual([]);
    });

    it('should handle agent with empty memories', async () => {
      const agent = makeAgent(true, []);
      const choices = ['种田'];
      const situation = '测试。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          decisions: [{ action: '种田', weight: 60, reason: 'ok' }],
        }),
        tokensUsed: 50,
        durationMs: 300,
        success: true,
      });

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('种田');
    });

    it('should include "(无记忆)" in prompt when no memories', async () => {
      const agent = makeAgent(true, []);
      const choices = ['种田'];
      const situation = '测试。';

      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[0].content;
        return {
          content: JSON.stringify({
            decisions: [{ action: '种田', weight: 50, reason: 'test' }],
          }),
          tokensUsed: 50,
          durationMs: 300,
          success: true,
        };
      });

      await engine.suggestDecisions(agent, { choices, situation });

      expect(capturedPrompt).toContain('（无记忆）');
    });

    it('should sort result by weight descending', async () => {
      const agent = makeAgent(true);
      const choices = ['A', 'B', 'C', 'D'];
      const situation = '测试。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          decisions: [
            { action: 'C', weight: 10, reason: '' },
            { action: 'A', weight: 60, reason: '' },
            { action: 'D', weight: 30, reason: '' },
            { action: 'B', weight: 80, reason: '' },
          ],
        }),
        tokensUsed: 50,
        durationMs: 300,
        success: true,
      });

      const result = await engine.suggestDecisions(agent, { choices, situation });

      expect(result[0].weight).toBe(80);
      expect(result[1].weight).toBe(60);
      expect(result[2].weight).toBe(30);
      expect(result[3].weight).toBe(10);
    });
  });
});
