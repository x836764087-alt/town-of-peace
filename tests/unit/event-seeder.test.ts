import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventSeeder, LLMEventSeed } from '../../src/llm/event-seeder.js';
import { SeededRNG } from '../../src/core/rng.js';
import * as llmClientModule from '../../src/llm/llm-client.js';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Default valid LLM event seed for constructing test payloads */
function validSeed(overrides: Partial<LLMEventSeed> = {}): LLMEventSeed {
  return {
    type: 'disaster',
    title: '暴风雨来袭',
    description: '一场猛烈的暴风雨袭击了小镇',
    severity: 'dramatic',
    affectedCount: 15,
    ...overrides,
  };
}

/** Serialize seeds into a JSON payload matching LLM response shape */
function makeLLMResponse(events: LLMEventSeed[]): string {
  return JSON.stringify({ events });
}

// ─── Mocking ──────────────────────────────────────────────────────────

let mockChat: ReturnType<typeof vi.fn>;
const originalLlmClient = llmClientModule.llmClient;

beforeEach(() => {
  mockChat = vi.fn();
  vi.spyOn(llmClientModule, 'llmClient', 'get').mockReturnValue({
    chat: mockChat,
  } as unknown as typeof llmClientModule.llmClient);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('EventSeeder', () => {
  const state = {
    year: 5,
    season: 'spring',
    population: 100,
    avgHappiness: 72.5,
  };

  describe('generateEvents', () => {
    it('LLM 正常返回 1 个事件种子', async () => {
      const seed = validSeed({ title: '春汛', description: '河水上涨', severity: 'minor', affectedCount: 5 });
      mockChat.mockResolvedValueOnce({
        content: makeLLMResponse([seed]),
        tokensUsed: 40,
        durationMs: 100,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBe(1);
      expect(results[0]).toEqual(seed);
    });

    it('LLM 正常返回 3 个事件种子', async () => {
      const seeds = [
        validSeed({ title: '新发现', type: 'discovery', affectedCount: 3 }),
        validSeed({ title: '旅人到访', type: 'visitor', affectedCount: 8 }),
        validSeed({ title: '邻里小聚', type: 'celebration', affectedCount: 20 }),
      ];
      mockChat.mockResolvedValueOnce({
        content: makeLLMResponse(seeds),
        tokensUsed: 80,
        durationMs: 150,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBe(3);
      expect(results).toEqual(seeds);
    });

    it('每个种子 type 合法 (5 种)', async () => {
      const allTypes: Array<LLMEventSeed['type']> = ['disaster', 'discovery', 'visitor', 'celebration', 'conflict'];
      const seeds = allTypes.map((type, i) => validSeed({ type, title: `event-${i}`, description: 'test', affectedCount: 1 }));

      mockChat.mockResolvedValueOnce({
        content: makeLLMResponse(seeds),
        tokensUsed: 60,
        durationMs: 100,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      for (const r of results) {
        expect(allTypes).toContain(r.type);
      }
    });

    it('每个种子 severity 合法 (3 种)', async () => {
      const allSeverities: Array<LLMEventSeed['severity']> = ['minor', 'notable', 'dramatic'];
      const seeds = allSeverities.map((severity, i) => validSeed({ severity, title: `sev-${i}`, description: 'test', affectedCount: 1 }));

      mockChat.mockResolvedValueOnce({
        content: makeLLMResponse(seeds),
        tokensUsed: 60,
        durationMs: 100,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      for (const r of results) {
        expect(allSeverities).toContain(r.severity);
      }
    });

    it('affectedCount ≥ 1', async () => {
      const seeds = [
        validSeed({ title: 'count-1', affectedCount: 1 }),
        validSeed({ title: 'count-5', affectedCount: 5 }),
        validSeed({ title: 'count-50', affectedCount: 50 }),
      ];

      mockChat.mockResolvedValueOnce({
        content: makeLLMResponse(seeds),
        tokensUsed: 60,
        durationMs: 100,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      for (const r of results) {
        expect(r.affectedCount).toBeGreaterThanOrEqual(1);
      }
    });

    it('recentHistory 会传入 prompt', async () => {
      const history = [
        '去年秋天发生了大丰收，粮仓堆满了',
        '冬天流行时疫，王大夫忙得脚不沾地',
      ];

      mockChat.mockResolvedValueOnce({
        content: makeLLMResponse([validSeed({ title: '新事', description: 'test', affectedCount: 2 })]),
        tokensUsed: 50,
        durationMs: 80,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      await seeder.generateEvents(state, history);

      // Verify the last message content includes history items
      const callArgs = mockChat.mock.calls[0];
      const userMessage = callArgs[0].find((m: { role: string; content: string }) => m.role === 'user');
      expect(userMessage.content).toContain('去年秋天发生了大丰收');
      expect(userMessage.content).toContain('冬天流行时疫');
    });

    it('LLM 失败 → fallbackEvents', async () => {
      mockChat.mockResolvedValueOnce({
        content: '',
        tokensUsed: 0,
        durationMs: 0,
        success: false,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      // Fallback 返回 1-3 个事件
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(3);
      for (const r of results) {
        expect(r.type).toBeDefined();
        expect(r.affectedCount).toBeGreaterThanOrEqual(1);
      }
    });

    it('JSON 解析失败 → fallbackEvents', async () => {
      mockChat.mockResolvedValueOnce({
        content: '这不是 JSON，LLM 返回了纯文本',
        tokensUsed: 10,
        durationMs: 50,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('JSON 格式正确但 events 为空数组 → fallbackEvents', async () => {
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ events: [] }),
        tokensUsed: 5,
        durationMs: 30,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('JSON 格式正确但 events 不是数组 → fallbackEvents', async () => {
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ events: 'not-an-array' }),
        tokensUsed: 5,
        durationMs: 30,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('throw 异常 → fallbackEvents', async () => {
      mockChat.mockRejectedValueOnce(new Error('Network failure'));

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('标题去重 — 与 recentHistory 重复的标题被过滤', async () => {
      const history = ['大丰收庆典', '新年祭祀活动'];
      const seeds = [
        validSeed({ title: '大丰收庆典', description: '重复的标题', affectedCount: 10 }),
        validSeed({ title: '新发现矿藏', description: '不重复', affectedCount: 5 }),
        validSeed({ title: '新年祭祀活动', description: '又重复', affectedCount: 20 }),
        validSeed({ title: '外来商队', description: '不重复', affectedCount: 3 }),
      ];

      mockChat.mockResolvedValueOnce({
        content: makeLLMResponse(seeds),
        tokensUsed: 60,
        durationMs: 100,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, history);

      // 前 10 个字符相同视为重复
      const titles = results.map((r) => r.title);
      expect(titles).not.toContain('大丰收庆典');
      expect(titles).not.toContain('新年祭祀活动');
      expect(titles).toContain('新发现矿藏');
      expect(titles).toContain('外来商队');
    });

    it('不完整的 JSON 字段 → 该事件被跳过', async () => {
      // 包含一个完整事件 + 一个缺少 severity 的事件
      const incompleteSeed = { type: 'disaster', title: 'bad', description: 'test', affectedCount: 1 };
      const valid = validSeed({ title: 'good', affectedCount: 5 });

      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ events: [incompleteSeed, valid] }),
        tokensUsed: 40,
        durationMs: 80,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBe(1);
      expect(results[0].title).toBe('good');
    });

    it('无效的 type 会被过滤', async () => {
      const invalid = { type: 'weather', title: 'bad', description: 'test', severity: 'minor', affectedCount: 1 };
      const valid = validSeed({ title: 'ok', affectedCount: 3 });

      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ events: [invalid, valid] }),
        tokensUsed: 40,
        durationMs: 80,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBe(1);
      expect(results[0].type).toBe('disaster');
    });

    it('affectedCount < 1 会被过滤', async () => {
      const invalid = { type: 'conflict', title: 'bad', description: 'test', severity: 'minor', affectedCount: 0 };
      const valid = validSeed({ title: 'ok', affectedCount: 2 });

      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ events: [invalid, valid] }),
        tokensUsed: 40,
        durationMs: 80,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBe(1);
      expect(results[0].title).toBe('ok');
    });

    it('所有事件都被过滤时调用 fallback', async () => {
      // 所有种子都无效
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ events: [
          { type: 'invalid-type', title: 'bad', description: 'x', severity: 'minor', affectedCount: 1 },
          { type: 'conflict', title: 'bad', description: 'x', severity: 'extreme', affectedCount: 1 },
        ]}),
        tokensUsed: 40,
        durationMs: 80,
        success: true,
      });

      const seeder = new EventSeeder(new SeededRNG(42));
      const results = await seeder.generateEvents(state, []);

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('fallbackEvents', () => {
    it('返回 1-3 个事件种子', () => {
      const seeder = new EventSeeder(new SeededRNG(42));
      const results = seeder.fallbackEvents({ population: 80, avgHappiness: 65 });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('每个种子 type 在合法集合中', () => {
      const validTypes: LLMEventSeed['type'][] = ['disaster', 'discovery', 'visitor', 'celebration', 'conflict'];
      const seeder = new EventSeeder(new SeededRNG(42));

      for (let i = 0; i < 20; i++) {
        const results = seeder.fallbackEvents({ population: 100, avgHappiness: 50 });
        for (const r of results) {
          expect(validTypes).toContain(r.type);
        }
      }
    });

    it('每个种子 severity 在合法集合中', () => {
      const validSevs: LLMEventSeed['severity'][] = ['minor', 'notable', 'dramatic'];
      const seeder = new EventSeeder(new SeededRNG(42));

      for (let i = 0; i < 20; i++) {
        const results = seeder.fallbackEvents({ population: 100, avgHappiness: 50 });
        for (const r of results) {
          expect(validSevs).toContain(r.severity);
        }
      }
    });

    it('affectedCount ≥ 1', () => {
      const seeder = new EventSeeder(new SeededRNG(42));

      for (let i = 0; i < 20; i++) {
        const results = seeder.fallbackEvents({ population: 100, avgHappiness: 50 });
        for (const r of results) {
          expect(r.affectedCount).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('不同 seed 产生不同结果', () => {
      const results1 = new EventSeeder(new SeededRNG(1)).fallbackEvents({ population: 100, avgHappiness: 50 });
      const results2 = new EventSeeder(new SeededRNG(999)).fallbackEvents({ population: 100, avgHappiness: 50 });

      // 标题是硬编码模板，需要用 type 来区分
      const titles1 = results1.map((r) => `${r.type}-${r.severity}-${r.affectedCount}`).join(',');
      const titles2 = results2.map((r) => `${r.type}-${r.severity}-${r.affectedCount}`).join(',');
      expect(titles1).not.toBe(titles2);
    });
  });
});
