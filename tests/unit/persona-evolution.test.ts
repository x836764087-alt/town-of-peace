/**
 * PersonaEvolution 单元测试
 *
 * Covers:
 *  1. 不到 10 年不触发更新
 *  2. 到 10 年触发更新，LLM 返回新 traits/values → 验证字段更新
 *  3. LLM 返回空 content → lastUpdated += 5，traits 不变
 *  4. LLM 抛异常 → lastUpdated += 5
 *  5. JSON 解析失败（返回无效 JSON）→ lastUpdated += 5
 *  6. 新出生 agent（lastUpdated = stateYear）→ 不更新
 *  7. dead agent → 跳过
 *  8. 没有 biography → 跳过（undefined check）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonaEvolution } from '../../src/llm/persona-evolution.js';
import { llmClient } from '../../src/llm/llm-client.js';
import type { AgentState } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * 创建一个带有 biography 的 mock AgentState。
 */
function makeFullAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'a1',
    name: '张三',
    age: 0,
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
        traits: ['平凡', '温和'],
        values: ['随遇而安'],
        motto: '日子总要过下去。',
        narrative_arc: '张三的人生旅程刚刚开始。',
        lastUpdated: 0,
      },
      timeline: [],
      reputation: 0,
      lastBiographyUpdate: 0,
    },
    ...overrides,
  };
}

// ─── Mock LLM ───────────────────────────────────────────────────────────

vi.mock('../../src/llm/llm-client.js', () => ({
  llmClient: {
    chat: vi.fn(),
  },
}));

// ─── Tests ──────────────────────────────────────────────────────────────

describe('PersonaEvolution', () => {
  let evolution: PersonaEvolution;
  let agent: AgentState;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = makeFullAgent();
    evolution = new PersonaEvolution();
  });

  // ── 1. 不到 10 年不触发 ──────────────────────────────────────────────

  describe('updateIfNeeded — interval check', () => {
    it('should NOT update when yearsSinceUpdate < 10', async () => {
      // lastUpdated = 5, stateYear = 12 → 7 < 10, skip
      agent.biography!.persona.lastUpdated = 5;

      await evolution.updateIfNeeded(agent, 12);

      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
      expect(agent.biography!.persona.lastUpdated).toBe(5);
      expect(llmClient.chat).not.toHaveBeenCalled();
    });

    it('should NOT update when lastUpdated == stateYear (newborn)', async () => {
      // lastUpdated = 0, stateYear = 0 → 0 < 10, skip
      agent.biography!.persona.lastUpdated = 0;

      await evolution.updateIfNeeded(agent, 0);

      expect(llmClient.chat).not.toHaveBeenCalled();
    });

    it('should trigger update when yearsSinceUpdate >= 10', async () => {
      agent.biography!.persona.lastUpdated = 0;

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['勤劳', '稳重'],
          values: ['家庭优先'],
          motto: '家是最温暖的地方。',
          arc: '张三从平凡青年成长为稳重中年人。',
        }),
        tokensUsed: 50,
        durationMs: 300,
        success: true,
      });

      await evolution.updateIfNeeded(agent, 10);

      expect(agent.biography!.persona.traits).toEqual(['勤劳', '稳重']);
      expect(agent.biography!.persona.values).toEqual(['家庭优先']);
      expect(agent.biography!.persona.motto).toBe('家是最温暖的地方。');
      expect(agent.biography!.persona.narrative_arc).toBe(
        '张三从平凡青年成长为稳重中年人。',
      );
      expect(agent.biography!.persona.lastUpdated).toBe(10);
    });
  });

  // ── 2. 到 10 年触发更新，LLM 返回有效 JSON ────────────────────────────

  describe('updateIfNeeded — successful LLM response', () => {
    beforeEach(() => {
      agent.biography!.persona.lastUpdated = 0;
    });

    it('should update persona fields on valid JSON response', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['勇敢', '智慧'],
          values: ['追求真理'],
          motto: '知识就是力量。',
          arc: '张三通过不断学习成长为智者。',
        }),
        tokensUsed: 40,
        durationMs: 250,
        success: true,
      });

      await evolution.updateIfNeeded(agent, 10);

      expect(agent.biography!.persona.traits).toEqual(['勇敢', '智慧']);
      expect(agent.biography!.persona.values).toEqual(['追求真理']);
      expect(agent.biography!.persona.motto).toBe('知识就是力量。');
      expect(agent.biography!.persona.narrative_arc).toBe(
        '张三通过不断学习成长为智者。',
      );
      expect(agent.biography!.persona.lastUpdated).toBe(10);
    });

    it('should preserve current motto when LLM omits it', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: ['坚韧'],
          values: ['坚持'],
          arc: '张三变得更加坚韧。',
        }),
        tokensUsed: 30,
        durationMs: 200,
        success: true,
      });

      await evolution.updateIfNeeded(agent, 10);

      // motto should remain unchanged
      expect(agent.biography!.persona.motto).toBe('日子总要过下去。');
      expect(agent.biography!.persona.traits).toEqual(['坚韧']);
    });

    it('should include recent events in the LLM prompt', async () => {
      // Add some timeline events in the last 10 years
      agent.biography!.timeline.push(
        {
          year: 5,
          type: 'marriage',
          description: '张三与邻村姑娘李四结婚',
          importance: 0.6,
        },
        {
          year: 8,
          type: 'child_birth',
          description: '张三家喜得贵子',
          importance: 0.8,
        },
      );

      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[1].content;
        return {
          content: JSON.stringify({
            traits: ['顾家'],
            values: ['家庭'],
            motto: '家和万事兴。',
            arc: '张三婚后成为顾家男人。',
          }),
          tokensUsed: 30,
          durationMs: 200,
          success: true,
        };
      });

      await evolution.updateIfNeeded(agent, 10);

      expect(capturedPrompt).toContain('张三与邻村姑娘李四结婚');
      expect(capturedPrompt).toContain('张三家喜得贵子');
    });

    it('should include recent memories in the LLM prompt', async () => {
      agent.memories = [
        { year: 6, content: '张三当选村长', importance: 0.9 },
        { year: 9, content: '张三发明了新农具', importance: 0.7 },
      ];

      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[1].content;
        return {
          content: JSON.stringify({
            traits: ['创新'],
            values: ['进取'],
            motto: '创新不止。',
            arc: '张三通过创新提升了生活水平。',
          }),
          tokensUsed: 30,
          durationMs: 200,
          success: true,
        };
      });

      await evolution.updateIfNeeded(agent, 10);

      expect(capturedPrompt).toContain('张三当选村长');
      expect(capturedPrompt).toContain('张三发明了新农具');
    });

    it('should cap memories to 10 entries', async () => {
      // Create 15 memories
      agent.memories = Array.from({ length: 15 }, (_, i) => ({
        year: i,
        content: `记忆${i}`,
        importance: 0.5,
      }));

      let capturedPrompt = '';
      vi.mocked(llmClient.chat).mockImplementation(async (messages) => {
        capturedPrompt = messages[1].content;
        return {
          content: JSON.stringify({
            traits: ['保守'],
            values: ['传统'],
            motto: '传承有序。',
            arc: '张三坚持传统。',
          }),
          tokensUsed: 20,
          durationMs: 100,
          success: true,
        };
      });

      await evolution.updateIfNeeded(agent, 15);

      // Last 10 memories should be used
      expect(capturedPrompt).toContain('记忆5');
      expect(capturedPrompt).toContain('记忆14');
      expect(capturedPrompt).not.toContain('记忆0');
      expect(capturedPrompt).not.toContain('记忆4');
    });
  });

  // ── 3. LLM 返回空 content → 顺延 5 年 ─────────────────────────────────

  describe('updateIfNeeded — empty LLM content', () => {
    beforeEach(() => {
      agent.biography!.persona.lastUpdated = 0;
    });

    it('should defer 5 years when LLM returns empty content', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: true,
      });

      await evolution.updateIfNeeded(agent, 10);

      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
      expect(agent.biography!.persona.values).toEqual(['随遇而安']);
      expect(agent.biography!.persona.lastUpdated).toBe(5);
    });

    it('should defer 5 years when LLM is unsuccessful', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 100,
        success: false,
      });

      await evolution.updateIfNeeded(agent, 10);

      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
      expect(agent.biography!.persona.lastUpdated).toBe(5);
    });
  });

  // ── 4. LLM 抛异常 → 顺延 5 年 ─────────────────────────────────────────

  describe('updateIfNeeded — LLM throws', () => {
    beforeEach(() => {
      agent.biography!.persona.lastUpdated = 0;
    });

    it('should defer 5 years when LLM.chat throws', async () => {
      vi.mocked(llmClient.chat).mockRejectedValueOnce(new Error('Network error'));

      await evolution.updateIfNeeded(agent, 10);

      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
      expect(agent.biography!.persona.lastUpdated).toBe(5);
    });
  });

  // ── 5. JSON 解析失败 → 顺延 5 年 ──────────────────────────────────────

  describe('updateIfNeeded — invalid JSON', () => {
    beforeEach(() => {
      agent.biography!.persona.lastUpdated = 0;
    });

    it('should defer 5 years when LLM returns invalid JSON', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: 'this is not valid json at all',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await evolution.updateIfNeeded(agent, 10);

      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
      expect(agent.biography!.persona.lastUpdated).toBe(5);
    });

    it('should defer 5 years when JSON is missing required fields', async () => {
      // Valid JSON but missing required fields (traits/values/arc)
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({ motto: '不完整的数据' }),
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await evolution.updateIfNeeded(agent, 10);

      expect(agent.biography!.persona.traits).toEqual(['平凡', '温和']);
      expect(agent.biography!.persona.lastUpdated).toBe(5);
    });

    it('should defer when traits is not an array', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: JSON.stringify({
          traits: 'not an array',
          values: [],
          arc: 'test',
        }),
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await evolution.updateIfNeeded(agent, 10);

      expect(agent.biography!.persona.lastUpdated).toBe(5);
    });
  });

  // ── 6. 新出生 agent → 不更新 ──────────────────────────────────────────

  describe('updateIfNeeded — newborn agent', () => {
    it('should not update when born in the current year', async () => {
      // born = 0, lastUpdated = 0, stateYear = 0
      agent.biography!.persona.lastUpdated = 0;
      agent.biography!.lastBiographyUpdate = 0;

      await evolution.updateIfNeeded(agent, 0);

      expect(llmClient.chat).not.toHaveBeenCalled();
      expect(agent.biography!.persona.lastUpdated).toBe(0);
    });

    it('should not update within 10 years after birth', async () => {
      agent.biography!.persona.lastUpdated = 2;

      await evolution.updateIfNeeded(agent, 5);

      expect(llmClient.chat).not.toHaveBeenCalled();
      expect(agent.biography!.persona.lastUpdated).toBe(2);
    });
  });

  // ── 7. dead agent → 跳过 ──────────────────────────────────────────────

  describe('updateIfNeeded — dead agent', () => {
    it('should skip for dead agents regardless of interval', async () => {
      agent.biography!.persona.lastUpdated = 0;
      agent.alive = false;
      agent.deathYear = 20;

      await evolution.updateIfNeeded(agent, 20);

      expect(llmClient.chat).not.toHaveBeenCalled();
      expect(agent.biography!.persona.lastUpdated).toBe(0);
    });
  });

  // ── 8. No biography → 跳过 ────────────────────────────────────────────

  describe('updateIfNeeded — no biography', () => {
    it('should skip when agent has no biography', async () => {
      agent.biography = undefined;

      await evolution.updateIfNeeded(agent, 10);

      expect(llmClient.chat).not.toHaveBeenCalled();
    });

    it('should skip gracefully — no throw', async () => {
      agent.biography = undefined;

      await expect(
        evolution.updateIfNeeded(agent, 50),
      ).resolves.toBeUndefined();
    });
  });
});
