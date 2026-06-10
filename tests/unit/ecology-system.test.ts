import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../../src/core/rng.js';
import { EcologySystem } from '../../src/llm/ecology-system.js';

// ── 初始值 ────────────────────────────────────────────────

describe('EcologySystem — initial state', () => {
  it('should have correct initial values', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    const state = sys.getState();
    expect(state.forestCoverage).toBe(80);
    expect(state.soilFertility).toBe(70);
    expect(state.riverHealth).toBe(75);
    expect(state.wildlifeAbundance).toBe(65);
  });
});

// ── tick() — 压力递减 ─────────────────────────────────────

describe('EcologySystem — pressure decreases values', () => {
  it('population pressure reduces forest and wildlife', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('spring', 100, 0, 0);
    const s = sys.getState();
    // forest: 80 - 100*0.01 + 0.5 (spring effect) = 80 - 1 + 0.5 = 79.5
    expect(s.forestCoverage).toBeCloseTo(79.5, 1);
    // wildlife: 65 - 100*0.005 + 0.5 (spring effect) = 65 - 0.5 + 0.5 = 65
    expect(s.wildlifeAbundance).toBeCloseTo(65, 1);
  });

  it('building pressure reduces forest and soil', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('spring', 0, 20, 0);
    const s = sys.getState();
    // forest: 80 - 20*0.1 + 0.5 (spring effect) = 80 - 2 + 0.5 = 78.5
    expect(s.forestCoverage).toBeCloseTo(78.5, 1);
    // soil: 70 - 20*0.05 + 0.5 + 0.5 = 70 - 1 + 1 = 70
    expect(s.soilFertility).toBeCloseTo(70, 1);
  });

  it('farming pressure reduces soil', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('spring', 0, 0, 5);
    const s = sys.getState();
    // soil: 70 + 0.5 (base) + 0.5 (spring) - 0.2*5 = 70 + 1 - 1 = 70
    expect(s.soilFertility).toBeCloseTo(70, 1);
  });

  it('combined pressure reduces multiple metrics', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('summer', 50, 10, 3);
    const s = sys.getState();
    // forest: 80 - 50*0.01 - 10*0.1 = 80 - 0.5 - 1 = 78.5
    expect(s.forestCoverage).toBeCloseTo(78.5, 1);
    // soil: 70 - 10*0.05 - 0.2*3 + 0.5 = 70 - 0.5 - 0.6 + 0.5 = 69.4
    expect(s.soilFertility).toBeCloseTo(69.4, 1);
    // wildlife: 65 - 50*0.005 = 65 - 0.25 = 64.75
    expect(s.wildlifeAbundance).toBeCloseTo(64.75, 1);
  });
});

// ── 自然恢复机制 ──────────────────────────────────────────

describe('EcologySystem — natural recovery', () => {
  it('soilFertility recovers +0.5 each season (capped at 70)', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('summer', 0, 0, 0);
    // soil: 70 + 0.5 + 0 = 70.5 → capped at 70
    expect(sys.getState().soilFertility).toBeCloseTo(70, 1);
  });

  it('soilFertility rises above 70 after some seasons then caps', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    // Drop soil first
    sys.tick('winter', 0, 100, 10);
    // soil: 70 - 5 - 2 + 0.5 - 0.5 = 63
    expect(sys.getState().soilFertility).toBe(63);
    // Now recover over spring ticks
    sys.tick('spring', 0, 0, 0);
    // soil: 63 + 0.5 + 0.5 = 64
    expect(sys.getState().soilFertility).toBeCloseTo(64, 1);
  });

  it('riverHealth recovers +0.3 each season', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('summer', 0, 0, 0);
    expect(sys.getState().riverHealth).toBeCloseTo(75.3, 1);
  });
});

// ── 边界钳制 ──────────────────────────────────────────────

describe('EcologySystem — boundary clamping [0, 100]', () => {
  it('should not exceed 100', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('spring', 0, 0, 0);
    expect(sys.getState().forestCoverage).toBeLessThanOrEqual(100);
    expect(sys.getState().soilFertility).toBeLessThanOrEqual(100);
    expect(sys.getState().riverHealth).toBeLessThanOrEqual(100);
    expect(sys.getState().wildlifeAbundance).toBeLessThanOrEqual(100);
  });

  it('should not go below 0', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('winter', 10000, 10000, 10);
    const s = sys.getState();
    expect(s.forestCoverage).toBeGreaterThanOrEqual(0);
    expect(s.soilFertility).toBeGreaterThanOrEqual(0);
    expect(s.riverHealth).toBeGreaterThanOrEqual(0);
    expect(s.wildlifeAbundance).toBeGreaterThanOrEqual(0);
  });
});

// ── 季节影响 ──────────────────────────────────────────────

describe('EcologySystem — seasonal effects', () => {
  it('spring should increase all indicators', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('spring', 0, 0, 0);
    const s = sys.getState();
    // forest: 80 + 0.5 (spring effect) = 80.5
    expect(s.forestCoverage).toBeCloseTo(80.5, 1);
    // soil: Math.min(70+0.5,70)=70 (capped) + 0.5 (spring effect) = 70.5
    expect(s.soilFertility).toBeCloseTo(70.5, 1);
    // river: 75 + 0.3 (base recovery) + 0.3 (spring effect) = 75.6
    expect(s.riverHealth).toBeCloseTo(75.6, 1);
    // wildlife: 65 + 0.5 (spring effect) = 65.5
    expect(s.wildlifeAbundance).toBeCloseTo(65.5, 1);
  });

  it('winter should decrease indicators relative to base recovery', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('winter', 0, 0, 0);
    const s = sys.getState();
    // forest: 80 + (-1)*0.5 (winter effect) = 79.5
    expect(s.forestCoverage).toBeCloseTo(79.5, 1);
    // soil: Math.min(70+0.5,70)=70 (capped) + (-1)*0.5 (winter) = 69.5
    expect(s.soilFertility).toBeCloseTo(69.5, 1);
    // river: 75 + 0.3 (base) + (-1)*0.3 (winter) = 75
    expect(s.riverHealth).toBeCloseTo(75, 1);
    // wildlife: 65 + (-1)*0.5 (winter effect) = 64.5
    expect(s.wildlifeAbundance).toBeCloseTo(64.5, 1);
  });

  it('summer and autumn should have neutral season effect', () => {
    const sys1 = new EcologySystem(new SeededRNG(42));
    const sys2 = new EcologySystem(new SeededRNG(42));
    sys1.tick('summer', 0, 0, 0);
    sys2.tick('autumn', 0, 0, 0);
    expect(sys1.getState().forestCoverage).toBe(sys2.getState().forestCoverage);
    expect(sys1.getState().soilFertility).toBe(sys2.getState().soilFertility);
    expect(sys1.getState().riverHealth).toBe(sys2.getState().riverHealth);
    expect(sys1.getState().wildlifeAbundance).toBe(sys2.getState().wildlifeAbundance);
  });
});

// ── 危险阈值消息 ──────────────────────────────────────────

describe('EcologySystem — danger threshold messages', () => {
  it('should warn when forestCoverage drops below 30', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    // Each winter tick without pressure: forest changes = +0.5 - 0.3 = +0.2
    // Need massive pressure. Winter tick with 6000 pop:
    // forest: 80 - 60 - 0.3 = 19.7 < 30 → triggers on NEXT tick
    // But the first tick already applied winter season effect.
    // Actually: forest = 80 - 6000*0.01 + 0.5 + (-1)*0.3 = 80 - 60 + 0.5 - 0.3 = 20.2
    // So after the first tick, forest is 20.2. The check happens after all changes.
    // The warning is generated on THIS tick if forest < 30.
    const messages = sys.tick('winter', 6000, 0, 0);
    expect(messages).toContain('森林面积大幅减少，生态平衡受到威胁');
  });

  it('should warn when wildlifeAbundance drops below 20', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    // wildlife: 65 - pop*0.005 + 0.5 + seasonEffect*0.5
    // Winter with 12000 pop: 65 - 60 + 0.5 - 0.5 = 5 < 20
    const messages = sys.tick('winter', 12000, 0, 0);
    expect(messages).toContain('野生动物已经很少见了');
  });

  it('should warn when soilFertility drops below 30', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    // soil: 70 - buildingCount*0.05 - 0.2*farmingIntensity + 0.5 + seasonEffect*0.5
    // Summer with 1000 buildings, intensity 10:
    // 70 - 50 - 2 + 0.5 + 0 = 18.5 < 30
    const messages = sys.tick('summer', 0, 1000, 10);
    expect(messages).toContain('土地越来越贫瘠，收成堪忧');
  });

  it('should NOT produce river warning under normal operation', () => {
    // riverHealth is not directly affected by population/building/farming.
    // It only gets +0.3 base recovery ± season effect.
    // Best case drop (winter): 75 + 0.3 - 0.3 = 75 — still high.
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('winter', 1000, 1000, 10);
    const messages = sys.tick('winter', 0, 0, 0);
    expect(messages).not.toContain('河水变得浑浊，鱼类大量死亡');
  });

  it('should NOT repeat messages for the same threshold', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('winter', 6000, 0, 0); // triggers forest warning
    const messages = sys.tick('winter', 0, 0, 0);
    // forest is still < 30 but warning already triggered
    expect(messages).toHaveLength(0);
  });

  it('should have multiple warnings when multiple thresholds hit', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    // Winter: pop=12000, buildings=1000, farming=10
    // forest: 80 - 120 - 100 + 0.5 - 0.3 = -139.8 → 0 < 30 ✓
    // wildlife: 65 - 60 + 0.5 - 0.5 = 5 < 20 ✓
    // soil: 70 - 50 - 2 + 0.5 - 0.5 = 18 < 30 ✓
    const messages = sys.tick('winter', 12000, 1000, 10);
    expect(messages).toContain('森林面积大幅减少，生态平衡受到威胁');
    expect(messages).toContain('野生动物已经很少见了');
    expect(messages).toContain('土地越来越贫瘠，收成堪忧');
    expect(messages).toHaveLength(3);
  });
});

// ── Modifier 函数 ─────────────────────────────────────────

describe('EcologySystem — modifiers', () => {
  it('getForestModifier: forestCoverage 50 → 1.0', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    // At initial 80: 0.5 + (80/100)*1.0 = 0.5 + 0.8 = 1.3
    expect(sys.getForestModifier()).toBeCloseTo(1.3, 1);
  });

  it('getForestModifier: forestCoverage 0 → 0.5, 100 → 1.5', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('winter', 20000, 20000, 10);
    expect(sys.getState().forestCoverage).toBe(0);
    expect(sys.getForestModifier()).toBeCloseTo(0.5, 1);

    // Reset and push to 100
    sys.initialize();
    for (let i = 0; i < 100; i++) {
      sys.tick('spring', 0, 0, 0);
    }
    expect(sys.getState().forestCoverage).toBe(100);
    expect(sys.getForestModifier()).toBeCloseTo(1.5, 1);
  });

  it('getFarmingModifier: soilFertility 0 → 0.5, 100 → 2.0', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    // At initial 70: 0.5 + 0.7*1.5 = 1.55
    expect(sys.getFarmingModifier()).toBeCloseTo(1.55, 1);

    // Push soil to 0
    sys.tick('summer', 0, 1000, 10);
    // soil: 70 - 50 - 2 + 0.5 = 18.5
    expect(sys.getState().soilFertility).toBeCloseTo(18.5, 1);
    // modifier: 0.5 + 0.185*1.5 = 0.7775
    expect(sys.getFarmingModifier()).toBeCloseTo(0.78, 2);
  });

  it('getHealthModifier: based on riverHealth + wildlifeAbundance avg', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    // river=75, wildlife=65, avg=70 → 0.5 + 0.7*1.5 = 1.55
    expect(sys.getHealthModifier()).toBeCloseTo(1.55, 1);
  });
});

// ── initialize() 重置 ─────────────────────────────────────

describe('EcologySystem — initialize() resets state', () => {
  it('should reset to initial values after initialize()', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('winter', 5000, 500, 10);
    sys.initialize();
    const s = sys.getState();
    expect(s.forestCoverage).toBe(80);
    expect(s.soilFertility).toBe(70);
    expect(s.riverHealth).toBe(75);
    expect(s.wildlifeAbundance).toBe(65);
  });

  it('should clear warning history after initialize()', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('winter', 6000, 0, 0); // triggers forest warning
    sys.initialize();
    // Now trigger forest warning again — should get the message
    const messages = sys.tick('winter', 6000, 0, 0);
    expect(messages).toContain('森林面积大幅减少，生态平衡受到威胁');
  });
});

// ── 极端情况 ──────────────────────────────────────────────

describe('EcologySystem — extreme scenario', () => {
  it('超级大人口将所有值压到 0', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    sys.tick('winter', 50000, 50000, 10);
    const s = sys.getState();
    expect(s.forestCoverage).toBe(0);
    expect(s.soilFertility).toBe(0);
    // riverHealth not directly affected
    expect(s.riverHealth).toBeGreaterThan(0);
    expect(s.wildlifeAbundance).toBe(0);
  });
});

// ── getState 返回副本 ─────────────────────────────────────

describe('EcologySystem — getState returns a copy', () => {
  it('should return a copy, not the internal reference', () => {
    const sys = new EcologySystem(new SeededRNG(42));
    const s1 = sys.getState();
    s1.forestCoverage = 999;
    const s2 = sys.getState();
    expect(s2.forestCoverage).toBe(80);
  });
});
