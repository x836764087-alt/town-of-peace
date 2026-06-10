/**
 * MemorySystem 单元测试
 *
 * Covers:
 *  1. Important events produce memories
 *  2. No important events → no memory created
 *  3. Memory list trimmed to 5 when exceeded
 *  4. LLM failure falls back to first event truncated
 *  5. LLM response stored correctly as memory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemorySystem } from '../../src/llm/memory-system.js';
import { llmClient } from '../../src/llm/llm-client.js';
import type { AgentState } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────

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

// ─── Mock LLM ───────────────────────────────────────────────────────────

vi.mock('../../src/llm/llm-client.js', () => ({
  llmClient: {
    chat: vi.fn(),
  },
}));

// ─── Tests ──────────────────────────────────────────────────────────────

describe('MemorySystem', () => {
  let system: MemorySystem;
  let agent: AgentState;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = makeTestAgent();
    system = new MemorySystem();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Important events produce memories ──────────────────────────────

  describe('processSeasonalMemory', () => {
    it('should produce a memory when agent experiences important events', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '与李四结婚',
        tokensUsed: 20,
        durationMs: 150,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '今天天气不错',
        '张三与邻村姑娘李四结婚',
        '张三去山上砍柴',
      ]);

      expect(agent.memories.length).toBe(1);
      expect(agent.memories[0].content).toBe('与李四结婚');
      expect(agent.memories[0].year).toBe(10);
      // 1 important event → importance = 1/5 = 0.2
      expect(agent.memories[0].importance).toBe(0.2);

      mockChat.mockRestore();
    });

    it('should produce memory with higher importance for more events', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '丰收且结婚',
        tokensUsed: 25,
        durationMs: 200,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '张三与王五结婚',
        '田里大丰收',
        '张三发明了新农具',
      ]);

      expect(agent.memories.length).toBe(1);
      // 3 important events → 3/5 = 0.6
      expect(agent.memories[0].importance).toBe(0.6);

      mockChat.mockRestore();
    });

    it('should cap importance at 1.0 when many events', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '多事件',
        tokensUsed: 20,
        durationMs: 150,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '张三结婚',
        '张三生子',
        '张三发明',
        '张三当选',
        '张三偷盗',
        '张三斗殴',
      ]);

      expect(agent.memories.length).toBe(1);
      // 6 events → min(6, 5)/5 = 1.0
      expect(agent.memories[0].importance).toBe(1.0);

      mockChat.mockRestore();
    });

    it('should match death keyword', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '死亡',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '张三不幸死亡',
      ]);

      expect(agent.memories.length).toBe(1);
      expect(agent.memories[0].content).toBe('死亡');

      mockChat.mockRestore();
    });

    it('should match child_birth keyword with 生了 pattern', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '生子',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '张三家生了个男孩',
      ]);

      expect(agent.memories.length).toBe(1);
      expect(agent.memories[0].content).toBe('生子');

      mockChat.mockRestore();
    });

    it('should match innovation keyword', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '发明农具',
        tokensUsed: 15,
        durationMs: 120,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '张三发明了新的磨粉方法',
      ]);

      expect(agent.memories.length).toBe(1);

      mockChat.mockRestore();
    });

    it('should match theft keyword', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '偷窃',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '张三偷窃被发现',
      ]);

      expect(agent.memories.length).toBe(1);

      mockChat.mockRestore();
    });

    it('should match conflict keyword', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '争吵',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '张三与路人争吵起来',
      ]);

      expect(agent.memories.length).toBe(1);

      mockChat.mockRestore();
    });

    it('should match fire keyword', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '火灾',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '村里发生火灾',
      ]);

      expect(agent.memories.length).toBe(1);

      mockChat.mockRestore();
    });

    it('should match harvest keyword', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '丰收',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '今年田里大丰收',
      ]);

      expect(agent.memories.length).toBe(1);

      mockChat.mockRestore();
    });

    it('should match famine keyword', async () => {
      const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
        content: '饥荒',
        tokensUsed: 10,
        durationMs: 100,
        success: true,
      });

      await system.processSeasonalMemory(agent, [
        '今年村里饥荒挨饿',
      ]);

      expect(agent.memories.length).toBe(1);

      mockChat.mockRestore();
    });
  });

  // ── No important events → no memory ────────────────────────────────

  it('should not produce memory when no important events', async () => {
    await system.processSeasonalMemory(agent, [
      '今天天气不错',
      '张三去山上砍柴',
      '张三回家后吃了晚饭',
    ]);

    expect(agent.memories.length).toBe(0);
  });

  it('should not produce memory for empty events list', async () => {
    await system.processSeasonalMemory(agent, []);

    expect(agent.memories.length).toBe(0);
  });

  // ── Memory trimming ───────────────────────────────────────────────

  it('should keep only the most recent 5 memories after adding new one', async () => {
    // Pre-seed with 4 memories
    agent.memories = [
      { year: 1, content: '记忆1', importance: 0.2 },
      { year: 2, content: '记忆2', importance: 0.3 },
      { year: 3, content: '记忆3', importance: 0.4 },
      { year: 4, content: '记忆4', importance: 0.5 },
    ];

    const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
      content: '新记忆',
      tokensUsed: 10,
      durationMs: 100,
      success: true,
    });

    await system.processSeasonalMemory(agent, [
      '张三当选为村长',
    ]);

    expect(agent.memories.length).toBe(5);
    // 4 existing + 1 new = 5, none dropped
    expect(agent.memories[0].content).toBe('记忆1');
    expect(agent.memories[4].content).toBe('新记忆');

    mockChat.mockRestore();
  });

  it('should drop oldest memories when exceeding 5', async () => {
    // Pre-seed with 5 memories
    agent.memories = [
      { year: 1, content: '记忆1', importance: 0.1 },
      { year: 2, content: '记忆2', importance: 0.2 },
      { year: 3, content: '记忆3', importance: 0.3 },
      { year: 4, content: '记忆4', importance: 0.4 },
      { year: 5, content: '记忆5', importance: 0.5 },
    ];

    const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
      content: '新记忆6',
      tokensUsed: 10,
      durationMs: 100,
      success: true,
    });

    await system.processSeasonalMemory(agent, [
      '张三当选为村长',
    ]);

    expect(agent.memories.length).toBe(5);
    // 6 total → trim to last 5: drop 记忆1
    expect(agent.memories[0].content).toBe('记忆2');
    expect(agent.memories[4].content).toBe('新记忆6');

    mockChat.mockRestore();
  });

  it('should trim when existing memories already exceed 5', async () => {
    // Pre-seed with 7 memories
    agent.memories = [
      { year: 1, content: 'a', importance: 0.1 },
      { year: 2, content: 'b', importance: 0.2 },
      { year: 3, content: 'c', importance: 0.3 },
      { year: 4, content: 'd', importance: 0.4 },
      { year: 5, content: 'e', importance: 0.5 },
      { year: 6, content: 'f', importance: 0.6 },
      { year: 7, content: 'g', importance: 0.7 },
    ];

    const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
      content: 'h',
      tokensUsed: 10,
      durationMs: 100,
      success: true,
    });

    await system.processSeasonalMemory(agent, [
      '张三当选为村长',
    ]);

    expect(agent.memories.length).toBe(5);
    // 7 + 1 = 8 → last 5: c, d, e, f, g... wait: push h, then 8 items, keep last 5 = e,f,g,h... 
    // Actually: push h → [a,b,c,d,e,f,g,h] = 8 items. splice(0, 8-5) = remove 3 → [d,e,f,g,h]
    expect(agent.memories[0].content).toBe('d');
    expect(agent.memories[4].content).toBe('h');

    mockChat.mockRestore();
  });

  // ── LLM fallback ───────────────────────────────────────────────────

  it('should fall back to first event when LLM fails', async () => {
    const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
      content: '',
      tokensUsed: 0,
      durationMs: 50,
      success: false,
    });

    await system.processSeasonalMemory(agent, [
      '张三不幸死亡，在村口摔倒后被村民发现',
      '张三与邻村姑娘李四结婚',
    ]);

    expect(agent.memories.length).toBe(1);
    // Fallback = first event truncated to 30 chars
    expect(agent.memories[0].content.length).toBeLessThanOrEqual(30);
    expect(agent.memories[0].content).toContain('张三不幸死亡');

    mockChat.mockRestore();
  });

  it('should fall back when LLM throws an error', async () => {
    const mockChat = vi.spyOn(llmClient, 'chat').mockRejectedValueOnce(new Error('network error'));

    await system.processSeasonalMemory(agent, [
      '张三发明了新的磨粉方法，非常实用',
    ]);

    expect(agent.memories.length).toBe(1);
    expect(agent.memories[0].content.length).toBeLessThanOrEqual(30);

    mockChat.mockRestore();
  });

  // ── LLM response stored correctly ──────────────────────────────────

  it('should store LLM response as memory content', async () => {
    const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
      content: '张三与王五结为夫妻，感情和睦',
      tokensUsed: 30,
      durationMs: 200,
      success: true,
    });

    await system.processSeasonalMemory(agent, [
      '张三与王五结婚',
    ]);

    expect(agent.memories.length).toBe(1);
    expect(agent.memories[0].content).toBe('张三与王五结为夫妻，感情和睦');

    mockChat.mockRestore();
  });

  it('should set year to agent age', async () => {
    const agedAgent = makeTestAgent({ age: 42, born: 5 });

    const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
      content: '当选村长',
      tokensUsed: 15,
      durationMs: 150,
      success: true,
    });

    await system.processSeasonalMemory(agedAgent, [
      '张三当选为村长',
    ]);

    expect(agedAgent.memories[0].year).toBe(42);

    mockChat.mockRestore();
  });

  // ── Dead agent handling ────────────────────────────────────────────

  it('should not process memories for dead agents', async () => {
    agent.alive = false;
    agent.deathYear = 10;

    await system.processSeasonalMemory(agent, [
      '张三不幸死亡',
    ]);

    expect(agent.memories.length).toBe(0);
  });

  // ── Content length cap ─────────────────────────────────────────────

  it('should cap LLM memory content to 20 characters', async () => {
    const mockChat = vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({
      content: '这是一条非常长的记忆内容已经超过了二十个字的限制',
      tokensUsed: 50,
      durationMs: 300,
      success: true,
    });

    await system.processSeasonalMemory(agent, [
      '张三发明了一种新工具，非常好用，深受村民喜爱',
    ]);

    expect(agent.memories.length).toBe(1);
    expect(agent.memories[0].content.length).toBeLessThanOrEqual(20);

    mockChat.mockRestore();
  });
});
