/**
 * Phase 10 Integration — MemorySystem + PersonaEvolution 在主循环中的联调测试
 *
 * 在最小化的模拟场景中验证：
 *  1. MemorySystem 能在主循环流程中正常运行（事件压缩 → 记忆存储）
 *  2. PersonaEvolution 能在主循环流程中正常运行（10年周期 → 人格更新）
 *  3. 两个系统同时存在时互不干扰（MemorySystem 不影响 PersonaEvolution 的 traits）
 *  4. Dead agent 被正确跳过
 *  5. 没有 biography 的 agent 跳过 PersonaEvolution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySystem } from '../../src/llm/memory-system.js';
import { PersonaEvolution } from '../../src/llm/persona-evolution.js';
import { llmClient } from '../../src/llm/llm-client.js';
import type { AgentState } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTestAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'a1',
    name: '张三',
    age: 10,
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
    x: 0,
    y: 0,
    crimes: 0,
    ...overrides,
  };
}

function makeAgentWithBiography(overrides: Partial<AgentState> = {}): AgentState {
  return {
    ...makeTestAgent(overrides),
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
  };
}

/**
 * 模拟主循环中 Phase 10 的行为模式：
 * 先对所有 agent 运行 MemorySystem.processSeasonalMemory，
 * 再对所有 agent 运行 PersonaEvolution.updateIfNeeded。
 */
async function runPhase10(
  agents: AgentState[],
  allEvents: string[],
  stateYear: number,
): Promise<void> {
  const memorySystem = new MemorySystem();
  for (const agent of agents) {
    if (agent.alive) {
      await memorySystem.processSeasonalMemory(agent, allEvents);
    }
  }

  const personaEvolution = new PersonaEvolution();
  for (const agent of agents) {
    if (agent.alive && agent.biography) {
      await personaEvolution.updateIfNeeded(agent, stateYear);
    }
  }
}

// ─── Mock LLM (module-level) ────────────────────────────────────────────────

vi.mock('../../src/llm/llm-client.js', () => ({
  llmClient: {
    chat: vi.fn(),
  },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Phase 10 Integration — MemorySystem + PersonaEvolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. MemorySystem 在主循环中正常运行 ───────────────────────────────────

  describe('MemorySystem integration', () => {
    it('should compress important events into memories for all alive agents', async () => {
      const agents = [
        makeAgentWithBiography({ name: '张三', age: 10, memories: [] }),
        makeAgentWithBiography({ name: '李四', age: 25, memories: [] }),
      ];
      const events = ['张三与李四结婚', '村里今天很太平'];

      await runPhase10(agents, events, 10);

      // 2 agents, 1 important event each → 2 memories
      expect(agents[0].memories.length).toBe(1);
      expect(agents[1].memories.length).toBe(1);
      expect(llmClient.chat).toHaveBeenCalledTimes(4);
    });

    it('should skip dead agents in the memory loop', async () => {
      const agents = [
        makeAgentWithBiography({ name: '张三', age: 10, alive: true, memories: [] }),
        makeAgentWithBiography({
          name: '王五', age: 80, alive: false, deathYear: 90, memories: [],
        }),
      ];
      const events = ['张三结婚了', '王五在村口摔倒'];

      await runPhase10(agents, events, 90);

      expect(agents[0].memories.length).toBe(1);
      // Dead agent should not have new memory added
      expect(agents[1].memories.length).toBe(0);
    });

    it('should pass events array to MemorySystem correctly', async () => {
      const agent = makeAgentWithBiography({
        name: '张三', age: 15, memories: [],
      });
      const events = [
        '张三家大丰收',
        '张三与邻村姑娘结婚',
        '张三发明了新农具',
      ];

      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '丰收结婚发明',
        tokensUsed: 20,
        durationMs: 100,
        success: true,
      });

      await runPhase10([agent], events, 15);

      expect(agent.memories.length).toBe(1);
      expect(agent.memories[0].content).toBe('丰收结婚发明');
    });

    it('should handle agents with no biography gracefully in memory loop', async () => {
      // Agent without biography should still get memories
      const agent = makeTestAgent({ age: 10, memories: [], biography: undefined });
      const events = ['张三结婚了'];

      await runPhase10([agent], events, 10);

      expect(agent.memories.length).toBe(1);
    });
  });

  // ── 2. PersonaEvolution 在主循环中正常运行 ──────────────────────────────

  describe('PersonaEvolution integration', () => {
    it('should update persona after 10 years in the main loop', async () => {
      const agent = makeAgentWithBiography({
        name: '张三', age: 10, biography: undefined,
      } as Partial<AgentState> as AgentState);
      // Give biography manually with lastUpdated = 0
      agent.biography = {
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
      };

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

      await runPhase10([agent], [], 10);

      expect(agent.biography!.persona.traits).toEqual(['勤劳', '稳重']);
      expect(agent.biography!.persona.motto).toBe('家是最温暖的地方。');
      expect(agent.biography!.persona.lastUpdated).toBe(10);
    });

    it('should skip dead agents in the persona evolution loop', async () => {
      const agent = makeTestAgent({
        age: 30,
        alive: false,
        deathYear: 30,
        biography: {
          persona: {
            traits: ['平凡'],
            values: ['随遇而安'],
            motto: '',
            narrative_arc: '',
            lastUpdated: 0,
          },
          timeline: [],
          reputation: 0,
          lastBiographyUpdate: 0,
        },
      });

      await runPhase10([agent], [], 30);

      // Should not have called LLM since agent is dead
      expect(llmClient.chat).not.toHaveBeenCalled();
      // lastUpdated unchanged
      expect(agent.biography!.persona.lastUpdated).toBe(0);
    });

    it('should skip agents without biography', async () => {
      const agent = makeTestAgent({
        age: 20,
        alive: true,
        memories: [],
        biography: undefined,
      });

      await runPhase10([agent], [], 20);

      expect(llmClient.chat).not.toHaveBeenCalled();
    });

    it('should not trigger before 10-year interval', async () => {
      const agent = makeAgentWithBiography({
        age: 5,
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
      });

      await runPhase10([agent], [], 5);

      expect(llmClient.chat).not.toHaveBeenCalled();
      expect(agent.biography!.persona.lastUpdated).toBe(0);
    });
  });

  // ── 3. 两个系统同时存在时互不干扰 ──────────────────────────────────────────

  describe('Both systems coexist without interference', () => {
    it('should process memory and persona independently on same agent', async () => {
      const agent = makeAgentWithBiography({
        name: '张三',
        age: 10,
        memories: [],
      });

      // Mock LLM: first call for memory compression, second for persona evolution
      let callCount = 0;
      vi.mocked(llmClient.chat).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // MemorySystem LLM call
          return {
            content: '与王五结为夫妻',
            tokensUsed: 15,
            durationMs: 100,
            success: true,
          };
        }
        // PersonaEvolution LLM call
        return {
          content: JSON.stringify({
            traits: ['顾家', '稳重'],
            values: ['家庭'],
            motto: '家和万事兴。',
            arc: '张三婚后成为顾家男人。',
          }),
          tokensUsed: 50,
          durationMs: 300,
          success: true,
        };
      });

      const events = ['张三与王五结婚'];

      await runPhase10([agent], events, 10);

      // Verify memory was created
      expect(agent.memories.length).toBe(1);
      expect(agent.memories[0].content).toBe('与王五结为夫妻');

      // Verify persona was updated independently
      expect(agent.biography!.persona.traits).toEqual(['顾家', '稳重']);
      expect(agent.biography!.persona.lastUpdated).toBe(10);

      // Verify LLM was called exactly twice (once per system)
      expect(llmClient.chat).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple agents with different states', async () => {
      const aliveAgent = makeAgentWithBiography({
        name: '张三', age: 10, memories: [],
      });
      const deadAgent = makeAgentWithBiography({
        name: '李四', age: 80, alive: false, deathYear: 80, memories: [],
      });
      const noBioAgent = makeTestAgent({
        name: '王五', age: 5, alive: true, memories: [], biography: undefined,
      });

      let callCount = 0;
      vi.mocked(llmClient.chat).mockImplementation(async () => {
        callCount++;
        return {
          content: callCount === 1 ? '张三结婚' : '',
          tokensUsed: 10,
          durationMs: 100,
          success: true,
        };
      });

      const events = ['张三与邻村姑娘结婚', '李四在睡梦中离世'];

      await runPhase10([aliveAgent, deadAgent, noBioAgent], events, 10);

      // aliveAgent: memory created + persona updated (3 LLM calls: memory, persona, noBio memory)
      expect(aliveAgent.memories.length).toBe(1);
      expect(llmClient.chat).toHaveBeenCalledTimes(3);
    });

    it('should not let memory system affect persona evolution outcome', async () => {
      const agent = makeAgentWithBiography({
        name: '张三', age: 10, memories: [],
      });

      // Pre-existing memory should not be affected by memory system
      agent.memories = [
        { year: 5, content: '旧记忆', importance: 0.5 },
      ];

      let capturedMemoryEvent = '';
      vi.mocked(llmClient.chat)
        .mockImplementationOnce(async (messages) => {
          // MemorySystem LLM call
          capturedMemoryEvent = messages[0].content;
          return {
            content: '新记忆',
            tokensUsed: 10,
            durationMs: 50,
            success: true,
          };
        })
        .mockImplementationOnce(async (messages) => {
          // PersonaEvolution LLM call — should include the pre-existing memory
          // plus the new one
          return {
            content: JSON.stringify({
              traits: ['创新'],
              values: ['进取'],
              motto: '不断前进。',
              arc: '张三不断进取。',
            }),
            tokensUsed: 40,
            durationMs: 200,
            success: true,
          };
        });

      const events = ['张三发明了新农具，非常实用'];

      await runPhase10([agent], events, 10);

      // Memory system should have added a new memory alongside the old one
      expect(agent.memories.length).toBe(2);
      expect(agent.memories[0].content).toBe('旧记忆');
      expect(agent.memories[1].content).toBe('新记忆');

      // Persona evolution should see both memories
      // The agent's persona should be updated
      expect(agent.biography!.persona.traits).toEqual(['创新']);
    });
  });

  // ── 4. 边界情况 ──────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle empty agent list', async () => {
      await runPhase10([], [], 10);
      expect(llmClient.chat).not.toHaveBeenCalled();
    });

    it('should handle empty events list (no important events)', async () => {
      const agent = makeAgentWithBiography({ age: 10, memories: [] });

      await runPhase10([agent], ['今天天气不错', '张三去砍柴'], 10);

      // MemorySystem: no important events → no LLM call
      // PersonaEvolution: 10 years, triggers LLM call
      expect(llmClient.chat).toHaveBeenCalledTimes(1);
    });

    it('should handle LLM failure gracefully in the pipeline', async () => {
      const agent = makeAgentWithBiography({ age: 10, memories: [] });

      // MemorySystem LLM fails → falls back
      vi.mocked(llmClient.chat).mockImplementation(async () => {
        throw new Error('network error');
      });

      await expect(
        runPhase10([agent], ['张三发明了新农具'], 10),
      ).resolves.toBeUndefined();
    });
  });
});
