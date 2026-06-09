import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../../src/core/rng.js';

describe('SeededRNG', () => {
  it('should produce deterministic results', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('should produce different results for different seeds', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(99);
    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());
    expect(results1).not.toEqual(results2);
  });

  it('int() should return within range', () => {
    const rng = new SeededRNG(42);
    for (let i = 0; i < 1000; i++) {
      const val = rng.int(1, 6);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
    }
  });
});
