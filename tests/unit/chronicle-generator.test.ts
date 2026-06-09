/**
 * ChronicleGenerator 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import ChronicleGenerator from '../../src/narrative/chronicle-generator.js';
import type { WorldState, Season, WeatherType } from '../../src/core/types.js';
import { SeededRNG } from '../../src/core/rng.js';

function createTestState(): WorldState {
  return {
    year: 10,
    season: 'autumn' as Season,
    weather: 'sunny' as WeatherType,
    agents: [
      { id: 'a1', name: '张三', age: 30, alive: true, gender: '男', stats: { strength: 50, intelligence: 60, dexterity: 50, charisma: 50, health: 80, maxHealth: 80, energy: 70, happiness: 60 }, skills: {}, inventory: { items: {} }, relationships: {}, family: { spouse: undefined, children: [], parents: [], household: [] }, conditions: [], memories: [], born: 0, wealth: 100, employees: [], tags: [] },
      { id: 'a2', name: '李四', age: 25, alive: true, gender: '女', stats: { strength: 40, intelligence: 50, dexterity: 50, charisma: 50, health: 70, maxHealth: 70, energy: 60, happiness: 60 }, skills: {}, inventory: { items: {} }, relationships: {}, family: { spouse: undefined, children: [], parents: [], household: [] }, conditions: [], memories: [], born: 0, wealth: 50, employees: [], tags: [] },
      { id: 'a3', name: '王五', age: 70, alive: true, gender: '男', stats: { strength: 30, intelligence: 40, dexterity: 30, charisma: 40, health: 50, maxHealth: 80, energy: 40, happiness: 50 }, skills: {}, inventory: { items: {} }, relationships: {}, family: { spouse: undefined, children: [], parents: [], household: [] }, conditions: [], memories: [], born: 0, wealth: 20, employees: [], tags: [] },
    ],
    economy: { totalCurrency: 500, annualTradeVolume: 200, annualSpoilage: 0, priceHistory: {}, priceCaps: {} },
    buildings: [],
    map: { width: 50, height: 55, tiles: Array.from({ length: 55 }, () => Array.from({ length: 50 }, () => ({ type: 'plains' as const }))) },
    innovations: [],
    laws: [],
    festivals: [],
    groups: [],
    archives: [],
    relations: [],
    seed: 42,
    chronicle: [
      { year: 1, severity: 'epochal', content: '桃源镇初建' },
      { year: 5, severity: 'dramatic', content: '重大事件发生' },
      { year: 8, severity: 'notable', content: '经济繁荣' },
    ],
    snapshots: [],
    populationThreshold: 100,
    version: '0.6.0',
    credits: [],
    apprenticeships: [],
    __shortTermJobs: [],
  };
}

describe('ChronicleGenerator', () => {
  let state: WorldState;
  let rng: SeededRNG;
  let gen: ChronicleGenerator;

  beforeEach(() => {
    state = createTestState();
    rng = new SeededRNG(42);
    gen = new ChronicleGenerator(state, rng);
  });

  describe('generateSeasonEntry', () => {
    it('should produce a chronicle entry with correct year', () => {
      const entry = gen.generateSeasonEntry();
      expect(entry.year).toBe(10);
      expect(entry.content.length).toBeGreaterThan(5);
    });

    it('should include weather description', () => {
      const entry = gen.generateSeasonEntry();
      expect(entry.severity).toBe('peaceful');
    });
  });

  describe('generateYearSummary', () => {
    it('should include population stats', () => {
      const entry = gen.generateYearSummary();
      expect(entry.content).toContain('年终总结');
      expect(entry.content).toContain('3');
    });

    it('should include economic stats', () => {
      const entry = gen.generateYearSummary();
      expect(entry.content).toContain('交易额');
    });
  });

  describe('processRawEvents', () => {
    it('should filter empty events', () => {
      const entries = gen.processRawEvents(['', '  ', '真实事件']);
      expect(entries.length).toBe(1);
    });

    it('should detect epochal events', () => {
      const entries = gen.processRawEvents(['重大发现！！']);
      expect(entries.some(e => e.severity === 'epochal')).toBe(true);
    });

    it('should detect dramatic events', () => {
      const entries = gen.processRawEvents(['张三逝世了！']);
      expect(entries.some(e => e.severity === 'dramatic')).toBe(true);
    });
  });

  describe('getRecentSummary', () => {
    it('should return last N entries', () => {
      const summary = gen.getRecentSummary(2);
      expect(summary).toContain('经济繁荣');
      expect(summary).not.toContain('桃源镇初建');
    });
  });

  describe('getSeverityStats', () => {
    it('should count entries by severity', () => {
      const stats = gen.getSeverityStats();
      expect(stats['epochal']).toBe(1);
      expect(stats['dramatic']).toBe(1);
      expect(stats['notable']).toBe(1);
    });
  });
});
