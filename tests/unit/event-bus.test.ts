import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/core/event-bus.js';

describe('EventBus', () => {
  beforeEach(() => {
    EventBus.clear();
  });

  it('should emit and receive events', () => {
    let received = false;
    EventBus.on('SEASON_CHANGED', () => { received = true; });
    EventBus.emit('SEASON_CHANGED', { season: 'spring', year: 1 });
    expect(received).toBe(true);
    EventBus.clear();
  });

  it('should support off()', () => {
    let count = 0;
    const handler = () => { count++; };
    EventBus.on('POPULATION_CHANGED', handler);
    EventBus.emit('POPULATION_CHANGED', { count: 18, delta: 0 });
    EventBus.off('POPULATION_CHANGED', handler);
    EventBus.emit('POPULATION_CHANGED', { count: 19, delta: 1 });
    expect(count).toBe(1);
    EventBus.clear();
  });

  it('should clear all handlers', () => {
    let count = 0;
    EventBus.on('SEASON_CHANGED', () => count++);
    EventBus.on('POPULATION_CHANGED', () => count++);
    EventBus.clear();
    EventBus.emit('SEASON_CHANGED', { season: 'summer', year: 1 });
    EventBus.emit('POPULATION_CHANGED', { count: 20, delta: 2 });
    expect(count).toBe(0);
  });
});
