/**
 * LifecycleNarratives 单元测试
 *
 * Covers:
 *  1. generateBirthNarrative 正常返回 LLM 内容
 *  2. generateBirthNarrative LLM 失败 → fallback
 *  3. generateDeathNarrative 正常返回（含讣告信息）
 *  4. generateDeathNarrative 失败 → 年龄对应 fallback
 *  5. 幼年死亡 fallback
 *  6. 老年死亡 fallback
 *  7. 无讣告时的死亡叙事
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LifecycleNarratives } from '../../src/llm/lifecycle-narratives.js';
import { llmClient } from '../../src/llm/llm-client.js';
import { SeededRNG } from '../../src/core/rng.js';

// ─── Mock LLM ─────────────────────────────────────────────────────────

vi.mock('../../src/llm/llm-client.js', () => ({
  llmClient: {
    chat: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────

function makeRNG(): SeededRNG {
  return new SeededRNG(42);
}

const successResp = (content: string) =>
  ({
    content,
    tokensUsed: content.length,
    durationMs: 200,
    success: true,
  } as const);

const failResp =
  ({
    content: '',
    tokensUsed: 0,
    durationMs: 100,
    success: false,
  } as const);

// ─── Tests ────────────────────────────────────────────────────────────

describe('LifecycleNarratives', () => {
  let system: LifecycleNarratives;

  beforeEach(() => {
    vi.clearAllMocks();
    system = new LifecycleNarratives(makeRNG());
  });

  // ── generateBirthNarrative ──────────────────────────────────────────

  describe('generateBirthNarrative', () => {
    it('should return LLM-generated narrative on success', async () => {
      const llmContent = '小安安如春苗初绽，为张家带来了无尽的希望与喜悦。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce(successResp(llmContent));

      const result = await system.generateBirthNarrative('安安', '女', [
        { name: '张伯', title: '铁匠' },
        { name: '王婶' },
      ]);

      expect(result).toBe(llmContent);

      // Verify LLM was called with correct parameters
      const call = vi.mocked(llmClient.chat).mock.calls[0];
      expect(call[0]).toHaveLength(1);
      expect(call[0][0].role).toBe('user');
      expect(call[0][0].content).toContain('安安');
      expect(call[0][0].content).toContain('女');
      expect(call[0][0].content).toContain('张伯');
      expect(call[0][0].content).toContain('王婶');
      expect(call[1]?.temperature).toBe(0.8);
    });

    it('should fallback when LLM fails', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce(failResp);

      const result = await system.generateBirthNarrative('小花', '女', [
        { name: '李叔' },
        { name: '赵姨' },
      ]);

      expect(result).toBe('小花来到了这个世界，给李叔和赵姨带来了欢乐。');
    });

    it('should fallback when LLM returns empty content', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce({
        content: '   ',
        tokensUsed: 0,
        durationMs: 50,
        success: true,
      });

      const result = await system.generateBirthNarrative('小明', '男', [
        { name: '陈伯' },
      ]);

      expect(result).toBe('小明来到了这个世界，给陈伯带来了欢乐。');
    });

    it('should include title in prompt when present', async () => {
      const llmContent = '新的生命降临了。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce(successResp(llmContent));

      await system.generateBirthNarrative('小宝', '男', [
        { name: '村长', title: '村长' },
        { name: '夫人' },
      ]);

      const call = vi.mocked(llmClient.chat).mock.calls[0];
      expect(call[0][0].content).toContain('村长');
    });
  });

  // ── generateDeathNarrative ──────────────────────────────────────────

  describe('generateDeathNarrative', () => {
    it('should return LLM-generated narrative with obituary info', async () => {
      const llmContent = '老村长一生清正，为桃源镇付出良多，今与世长辞，全镇哀悼。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce(successResp(llmContent));

      const result = await system.generateDeathNarrative(
        '张老',
        78,
        '村长',
        '病故',
        '张老一生清贫，勤勉为民，育有子女三人。',
      );

      expect(result).toBe(llmContent);

      const call = vi.mocked(llmClient.chat).mock.calls[0];
      expect(call[0][0].content).toContain('张老');
      expect(call[0][0].content).toContain('78');
      expect(call[0][0].content).toContain('村长');
      expect(call[0][0].content).toContain('病故');
      expect(call[0][0].content).toContain('张老一生清贫');
    });

    it('should fallback when LLM fails — adult age', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce(failResp);

      const result = await system.generateDeathNarrative(
        '李四',
        45,
        '农夫',
        '意外',
        undefined,
      );

      expect(result).toBe('李四离开了这个世界。');
    });

    it('should fallback to child death message when young', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce(failResp);

      const result = await system.generateDeathNarrative('小豆子', 8, undefined, '疾病', undefined);

      expect(result).toBe('小豆子年幼夭折，令人惋惜。');
    });

    it('should fallback to elder death message when old', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce(failResp);

      const result = await system.generateDeathNarrative(
        '王婆婆',
        72,
        undefined,
        '病故',
        '王婆婆活了九十余岁。',
      );

      expect(result).toBe('王婆婆寿终正寝，享年72岁。');
    });

    it('should handle missing obituary gracefully', async () => {
      const llmContent = '李二爷走了，大家很想念他。';

      vi.mocked(llmClient.chat).mockResolvedValueOnce(successResp(llmContent));

      const result = await system.generateDeathNarrative('李二', 60, undefined, undefined, undefined);

      expect(result).toBe(llmContent);

      const call = vi.mocked(llmClient.chat).mock.calls[0];
      expect(call[0][0].content).not.toContain('死因');
    });

    it('should handle temperature parameter', async () => {
      vi.mocked(llmClient.chat).mockResolvedValueOnce(
        successResp('叙事内容'),
      );

      await system.generateDeathNarrative('测试者', 30, undefined, undefined, undefined);

      const call = vi.mocked(llmClient.chat).mock.calls[0];
      expect(call[1]?.temperature).toBe(0.8);
    });
  });
});
