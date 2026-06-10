import { describe, expect, it } from 'vitest';
import { ENV } from '../../src/config/env';

describe('ENV', () => {
  describe('llm', () => {
    it('has correct default baseUrl', () => {
      expect(ENV.llm.baseUrl).toBe('https://api.agnesai.com/v1');
    });

    it('has correct default model', () => {
      expect(ENV.llm.model).toBe('agnes-2.0-flash');
    });

    it('has correct default rpm (60)', () => {
      expect(ENV.llm.rpm).toBe(60);
    });

    it('filters out empty apiKeys when no keys are set', () => {
      // Without LLM_API_KEY_* set, all three are undefined → filtered out
      expect(ENV.llm.apiKeys).toEqual([]);
    });
  });
});
