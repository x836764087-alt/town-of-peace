/**
 * Unit tests for the LLM prompt template module.
 */

import { describe, expect, it } from 'vitest';

import {
  fallbackBiographyUpdate,
  fallbackNewbornPersona,
  fallbackObituary,
  obituaryPrompt,
  personaNewbornPrompt,
  biographyUpdatePrompt,
} from '../../src/llm/prompts';

// ─── personaNewbornPrompt ──────────────────────────────────────────

describe('personaNewbornPrompt', () => {
  it('returns a non-empty string', () => {
    const result = personaNewbornPrompt('周', '男', 10);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes key variables (surname, gender, birthYear)', () => {
    const result = personaNewbornPrompt('陈', '女', 5);
    expect(result).toContain('陈');
    expect(result).toContain('女');
    expect(result).toContain('5');
  });

  it('includes father and mother names when provided', () => {
    const result = personaNewbornPrompt('李', '男', 3, '李铁柱', '王秀兰');
    expect(result).toContain('李铁柱');
    expect(result).toContain('王秀兰');
  });

  it('mentions JSON output format requirement', () => {
    const result = personaNewbornPrompt('赵', '男', 1);
    expect(result).toContain('JSON');
    expect(result).toContain('traits');
    expect(result).toContain('values');
    expect(result).toContain('motto');
  });
});

// ─── fallbackNewbornPersona ─────────────────────────────────────────

describe('fallbackNewbornPersona', () => {
  it('returns correct default traits', () => {
    const result = fallbackNewbornPersona();
    expect(result.traits).toEqual(['平凡', '温和']);
  });

  it('returns correct default values', () => {
    const result = fallbackNewbornPersona();
    expect(result.values).toEqual(['随遇而安']);
  });

  it('returns correct default motto', () => {
    const result = fallbackNewbornPersona();
    expect(result.motto).toBe('日子总要过下去。');
  });
});

// ─── obituaryPrompt ─────────────────────────────────────────────────

describe('obituaryPrompt', () => {
  it('returns a non-empty string', () => {
    const result = obituaryPrompt('张三', 5, 80, 75, []);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes key variables (name, birthYear, deathYear, age)', () => {
    const result = obituaryPrompt('李四', 10, 60, 50, []);
    expect(result).toContain('李四');
    expect(result).toContain('10');
    expect(result).toContain('60');
    expect(result).toContain('50');
  });

  it('includes timeline entries when provided', () => {
    const timeline = [
      { year: 15, description: '成家立业' },
      { year: 30, description: '迁居东巷' },
    ];
    const result = obituaryPrompt('王五', 5, 50, 45, timeline);
    expect(result).toContain('成家立业');
    expect(result).toContain('迁居东巷');
  });

  it('mentions JSON output format requirement', () => {
    const result = obituaryPrompt('赵六', 1, 60, 59, []);
    expect(result).toContain('JSON');
    expect(result).toContain('summary');
    expect(result).toContain('legacy');
  });
});

// ─── fallbackObituary ───────────────────────────────────────────────

describe('fallbackObituary', () => {
  it('returns correct summary', () => {
    const result = fallbackObituary('张三');
    expect(result.summary).toBe('张三 在桃源镇度过了平凡的一生。');
  });

  it('returns correct default legacy', () => {
    const result = fallbackObituary('李四');
    expect(result.legacy).toBe('他是桃源镇众多居民之一。');
  });
});

// ─── biographyUpdatePrompt ──────────────────────────────────────────

describe('biographyUpdatePrompt', () => {
  it('returns a non-empty string', () => {
    const result = biographyUpdatePrompt('张三', 25, ['结婚']);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes key variables (name, age)', () => {
    const result = biographyUpdatePrompt('赵七', 40, []);
    expect(result).toContain('赵七');
    expect(result).toContain('40');
  });

  it('includes recent events when provided', () => {
    const result = biographyUpdatePrompt('孙八', 30, ['升职', '搬家']);
    expect(result).toContain('升职');
    expect(result).toContain('搬家');
  });

  it('requests plain text output (not JSON) for narrative arc', () => {
    const result = biographyUpdatePrompt('周九', 50, []);
    // Should ask for text, not JSON
    expect(result).toContain('纯文本');
    expect(result).toContain('人物弧光');
  });
});

// ─── fallbackBiographyUpdate ────────────────────────────────────────

describe('fallbackBiographyUpdate', () => {
  it('returns correct default string', () => {
    const result = fallbackBiographyUpdate('吴十');
    expect(result).toBe('吴十 在桃源镇过着平凡的生活。');
  });
});
