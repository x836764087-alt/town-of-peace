// server/engine/world-engine.js — 世界引擎 (tick loop, state aggregation, broadcast)
import { EventEmitter } from 'events';
import config from '../config.js';
import { TimeSystem } from './time-system.js';
import { AgentEngine } from '../agents/agent-engine.js';
import { Scribe } from '../narrative/scribe.js';

export class WorldEngine extends EventEmitter {
  constructor(store, io) {
    super();
    this.store = store;
    this.io = io;
    this.timeSystem = new TimeSystem();
    this._isTicking = false;
    this._tickInterval = null;
    this._startedAt = Date.now();
    this._aliveAgentIds = [];

    // Snapshot cache
    this._snapshotCache = null;
    this._snapshotCacheTime = 0;
    this._snapshotCacheTTL = 1000;

    // Phase 2 modules
    this.agentEngine = new AgentEngine(store, this);
    this.scribe = new Scribe(store, this);
  }

  async init() {
    // Load world state from DB or init from config
    const ws = this.store.getWorldState();
    if (ws) {
      this.timeSystem.init(ws.game_minute);
    } else {
      this.timeSystem.init(config.startGameMinute);
      // Create initial world state
      const t = this.timeSystem.computeTime(config.startGameMinute);
      this.store.upsertWorldState({
        game_minute: config.startGameMinute,
        year: t.year,
        season: t.season,
        day_of_year: t.dayOfYear,
        weather: 'sunny',
        economy_json: '{}',
        culture_json: '{}',
        population_alive: 0,
        population_total: 0,
        map_version: 'taoyuan-v1',
        updated_at: Date.now(),
      });
    }

    // Refresh alive agents list
    this._aliveAgentIds = this.store.getAllAgents(true).map(a => a.id);
    this._snapshotCache = null;

    // Initialize Phase 2 modules
    this.agentEngine.init();
    console.log(`[WorldEngine] AgentEngine initialized with ${this._aliveAgentIds.length} agents`);
  }

  start() {
    if (this._tickInterval) return;
    this._tickInterval = setInterval(() => this.gameTick(), config.tickMs);
    console.log('[WorldEngine] Started tick loop');
  }

  stop() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }

  get paused() { return this.timeSystem.paused; }
  set paused(v) { this.timeSystem.paused = v; }

  async gameTick() {
    if (this._isTicking) return;
    this._isTicking = true;

    try {
      const time = this.timeSystem.advance();
      if (!time) {
        // No time passed (paused or too fast)
        this._isTicking = false;
        return;
      }

      // Persist world state
      const ws = this.store.getWorldState();
      if (ws) {
        ws.game_minute = time.gameMinute;
        ws.year = time.year;
        ws.season = time.season;
        ws.day_of_year = time.dayOfYear;
        ws.weather = ws.weather || 'sunny';
        ws.updated_at = Date.now();
        this.store.upsertWorldState(ws);
      }

      // Build delta
      const delta = this.buildTickDelta(time);

      // Agent engine tick
      this.agentEngine.tick(time.gameMinute, time);

      // Scribe tick
      this.scribe.tick(time.gameMinute, time);

      // Broadcast
      if (this.io) {
        this.io.emit('world:tick', {
          gameMinute: time.gameMinute,
          year: time.year,
          season: time.season,
          dayOfYear: time.dayOfYear,
          hour: time.hour,
          minute: time.minute,
          weather: delta.weather,
        });

        if (delta.agentDeltas.length > 0) {
          this.io.emit('agent:delta', { agents: delta.agentDeltas });
        }
      }

      this.emit('tick', { time, delta });

      // Invalidate snapshot cache
      this._snapshotCache = null;
    } catch (err) {
      console.error('[WorldEngine] Tick failed:', err.message);
    } finally {
      this._isTicking = false;
    }
  }

  buildTickDelta(time) {
    const agents = this.store.getAllAgents(true);
    const buildings = this.store.getAllBuildings();
    const ws = this.store.getWorldState();

    // Agent deltas: position + presence + needs
    const agentDeltas = agents.map(a => {
      const state = this.agentEngine.agents.get(a.id);
      return {
        id: a.id,
        position: { x: a.x, y: a.y },
        needs: state ? state.needs : JSON.parse(a.needs_json || '{}'),
        emotion: state ? state.emotion : 'calm',
        presence: state ? (state.needs.fatigue > 80 ? 'sleeping' : (state.needs.hunger > 70 ? 'idle' : 'active')) : 'idle',
        updatedAt: Date.now(),
      };
    });

    return {
      weather: ws?.weather || 'sunny',
      agentDeltas,
      buildings: buildings.map(b => ({
        id: b.id,
        name: b.name,
        type: b.type,
        level: b.level,
      })),
    };
  }

  buildSnapshot() {
    const now = Date.now();
    if (this._snapshotCache && (now - this._snapshotCacheTime) < this._snapshotCacheTTL) {
      return this._snapshotCache;
    }

    const ws = this.store.getWorldState();
    const t = ws ? {
      gameMinute: ws.game_minute,
      year: ws.year,
      season: ws.season,
      dayOfYear: ws.day_of_year,
      hour: Math.floor((ws.game_minute % (24 * 60)) / 60),
      minute: ws.game_minute % 60,
      weather: ws.weather,
    } : { gameMinute: 0, year: 1, season: 'spring', dayOfYear: 1, hour: 8, minute: 0, weather: 'sunny' };

    const snapshot = {
      schemaVersion: 1,
      world: {
        gameMinute: t.gameMinute,
        year: t.year,
        season: t.season,
        dayOfYear: t.dayOfYear,
        hour: t.hour,
        minute: t.minute,
        weather: t.weather,
        populationAlive: this._aliveAgentIds.length,
        populationTotal: this.store.getAllAgents().length,
        mapVersion: 'taoyuan-v1',
      },
      agents: this.store.getAllAgents(true).map(a => ({
        id: a.id, name: a.name, title: a.title, age: a.age,
        gender: a.gender, alive: !!a.alive,
        position: { x: a.x, y: a.y },
        stats: JSON.parse(a.stats_json || '{}'),
        needs: JSON.parse(a.needs_json || '{}'),
        skills: JSON.parse(a.skills_json || '{}'),
        persona: JSON.parse(a.persona_json || '{}'),
        inventory: JSON.parse(a.inventory_json || '{}'),
        wealth: a.wealth,
        currentPlan: JSON.parse(a.current_plan_json || '{}'),
        presence: 'idle',
        lastActionAt: a.updated_at,
        updatedAt: a.updated_at,
      })),
      buildings: this.store.getAllBuildings().map(b => ({
        id: b.id, name: b.name, type: b.type,
        position: { x: b.x, y: b.y },
        description: b.description, level: b.level,
        ownerId: b.owner_id, builtYear: b.built_year,
      })),
      economy: ws ? JSON.parse(ws.economy_json || '{}') : {},
      culture: ws ? JSON.parse(ws.culture_json || '{}') : {},
      recentEvents: this.store.getEvents(0, 20).reverse(),
      recentChronicles: this.store.getChronicles(0, 10).reverse(),
      serverTime: now,
    };

    this._snapshotCache = snapshot;
    this._snapshotCacheTime = now;
    return snapshot;
  }
}

export default WorldEngine;
