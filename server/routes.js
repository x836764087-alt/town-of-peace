// server/routes.js — REST API
import { Router } from 'express';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import config from './config.js';

export function createRoutes(store, worldEngine) {
  const router = Router();

  // Health
  router.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      gameMinute: worldEngine.timeSystem.gameMinute,
      paused: worldEngine.paused,
      aliveAgents: worldEngine._aliveAgentIds?.length || 0,
      tickInterval: global._tickIntervalActive !== false,
    });
  });

  // World snapshot
  router.get('/api/world/snapshot', (req, res) => {
    try {
      res.json(worldEngine.buildSnapshot());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // World state (incremental)
  router.get('/api/world/state', (req, res) => {
    const since = parseInt(req.query.sinceGameMinute) || 0;
    if (since < 0) return res.status(400).json({ error: 'invalid sinceGameMinute' });
    const ws = store.getWorldState();
    res.json({
      world: ws ? {
        gameMinute: ws.game_minute,
        year: ws.year,
        season: ws.season,
        dayOfYear: ws.day_of_year,
        hour: Math.floor((ws.game_minute % (24 * 60)) / 60),
        minute: ws.game_minute % 60,
        weather: ws.weather,
      } : null,
      events: store.getEvents(since, 200),
      chronicles: store.getChronicles(since, 100),
    });
  });

  // Map TMJ
  router.get('/api/map', (req, res) => {
    const mapPath = worldEngine._mapPath || './server/web/assets/map.tmj';
    if (existsSync(mapPath)) {
      try {
        const mapData = JSON.parse(readFileSync(mapPath, 'utf8'));
        res.json(mapData);
      } catch {
        res.status(500).json({ error: 'map parse error' });
      }
    } else {
      res.status(404).json({ error: 'map not found' });
    }
  });

  // Agents list
  router.get('/api/agents', (req, res) => {
    const aliveOnly = req.query.alive !== 'false';
    const agents = store.getAllAgents(aliveOnly);
    res.json(agents.map(a => ({
      id: a.id, name: a.name, title: a.title, age: a.age,
      gender: a.gender, alive: !!a.alive,
      position: { x: a.x, y: a.y },
      currentBuildingId: a.current_building_id,
      stats: JSON.parse(a.stats_json || '{}'),
      needs: JSON.parse(a.needs_json || '{}'),
      wealth: a.wealth,
      updatedAt: a.updated_at,
    })));
  });

  // Agent detail
  router.get('/api/agents/:id', (req, res) => {
    const a = store.getAgent(req.params.id);
    if (!a) return res.status(404).json({ error: 'agent not found' });
    res.json({
      ...a,
      alive: !!a.alive,
      stats: JSON.parse(a.stats_json || '{}'),
      skills: JSON.parse(a.skills_json || '{}'),
      persona: JSON.parse(a.persona_json || '{}'),
      needs: JSON.parse(a.needs_json || '{}'),
      inventory: JSON.parse(a.inventory_json || '{}'),
      currentPlan: JSON.parse(a.current_plan_json || '{}'),
      memories: store.getAgentMemories(a.id, 30),
    });
  });

  // Agent memories
  router.get('/api/agents/:id/memories', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const a = store.getAgent(req.params.id);
    if (!a) return res.status(404).json({ error: 'agent not found' });
    res.json(store.getAgentMemories(a.id, limit));
  });

  // Buildings list
  router.get('/api/buildings', (req, res) => {
    res.json(store.getAllBuildings().map(b => ({
      id: b.id, name: b.name, type: b.type,
      position: { x: b.x, y: b.y },
      description: b.description, level: b.level,
      ownerId: b.owner_id, builtYear: b.built_year,
    })));
  });

  // Building detail
  router.get('/api/buildings/:id', (req, res) => {
    const b = store.getBuilding(req.params.id);
    if (!b) return res.status(404).json({ error: 'building not found' });
    res.json(b);
  });

  // Chronicles
  router.get('/api/chronicles', (req, res) => {
    const since = parseInt(req.query.sinceGameMinute) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    res.json(store.getChronicles(since, limit));
  });

  // Events
  router.get('/api/events', (req, res) => {
    const since = parseInt(req.query.sinceGameMinute) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    res.json(store.getEvents(since, limit));
  });

  // Admin: time control
  router.post('/api/admin/time/pause', (req, res) => {
    worldEngine.paused = true;
    res.json({ paused: true });
  });

  router.post('/api/admin/time/resume', (req, res) => {
    const catchUp = req.body ? (req.body.catchUpLimitMinutes || 1440) : 1440;
    worldEngine.timeSystem.maxCatchUpMinutes = catchUp;
    worldEngine.paused = false;
    res.json({ paused: false, catchUpLimitMinutes: catchUp });
  });

  router.post('/api/admin/time/speed', (req, res) => {
    const factor = parseFloat(req.body?.speed || req.body?.factor || 1);
    if (factor < 0.1 || factor > 10) return res.status(400).json({ error: 'speed must be 0.1-10' });
    worldEngine.timeSystem.speedMultiplier = factor;
    res.json({ speed: factor });
  });

  // Admin: metrics
  router.get('/api/admin/metrics', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
      uptime: process.uptime(),
      tickInterval: config.tickMs,
      paused: worldEngine.paused,
      speed: worldEngine.timeSystem.speedMultiplier,
      gameMinute: worldEngine.timeSystem.gameMinute,
      aliveAgents: worldEngine._aliveAgentIds?.length || 0,
      dbPath: config.dbPath,
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    });
  });

  return router;
}

export default createRoutes;
