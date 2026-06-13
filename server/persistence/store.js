// server/persistence/store.js — SQLite wrapper with full schema
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Store {
  constructor(dbPath) {
    this.dbPath = dbPath || config.dbPath;
    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS world_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        game_minute INTEGER NOT NULL,
        year INTEGER NOT NULL,
        season TEXT NOT NULL CHECK (season IN ('spring','summer','autumn','winter')),
        day_of_year INTEGER NOT NULL CHECK (day_of_year BETWEEN 1 AND 365),
        weather TEXT NOT NULL,
        economy_json TEXT NOT NULL DEFAULT '{}',
        culture_json TEXT NOT NULL DEFAULT '{}',
        population_alive INTEGER NOT NULL DEFAULT 0,
        population_total INTEGER NOT NULL DEFAULT 0,
        map_version TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS zones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        w INTEGER NOT NULL,
        h INTEGER NOT NULL,
        navigable INTEGER NOT NULL DEFAULT 1,
        description TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        age INTEGER NOT NULL,
        gender TEXT NOT NULL DEFAULT '',
        alive INTEGER NOT NULL DEFAULT 1,
        x REAL NOT NULL,
        y REAL NOT NULL,
        current_zone_id TEXT,
        current_building_id TEXT,
        stats_json TEXT NOT NULL DEFAULT '{}',
        skills_json TEXT NOT NULL DEFAULT '{}',
        persona_json TEXT NOT NULL DEFAULT '{}',
        needs_json TEXT NOT NULL DEFAULT '{}',
        inventory_json TEXT NOT NULL DEFAULT '{}',
        wealth INTEGER NOT NULL DEFAULT 0,
        current_plan_json TEXT NOT NULL DEFAULT '{}',
        ai_state_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (current_zone_id) REFERENCES zones(id) ON DELETE SET NULL,
        FOREIGN KEY (current_building_id) REFERENCES buildings(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS buildings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        level INTEGER NOT NULL DEFAULT 1,
        owner_id TEXT,
        built_year INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS agent_family_links (
        agent_id TEXT NOT NULL,
        related_agent_id TEXT NOT NULL,
        relation_type TEXT NOT NULL CHECK (relation_type IN ('spouse','child','parent','household')),
        PRIMARY KEY (agent_id, related_agent_id, relation_type),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (related_agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_a TEXT NOT NULL,
        agent_b TEXT NOT NULL,
        affinity INTEGER NOT NULL DEFAULT 0 CHECK (affinity BETWEEN -100 AND 100),
        trust REAL NOT NULL DEFAULT 0 CHECK (trust BETWEEN -1 AND 1),
        rivalry REAL NOT NULL DEFAULT 0 CHECK (rivalry BETWEEN 0 AND 1),
        tags_json TEXT NOT NULL DEFAULT '[]',
        last_interaction_at INTEGER,
        updated_at INTEGER NOT NULL,
        UNIQUE(agent_a, agent_b),
        FOREIGN KEY (agent_a) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_b) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        game_minute INTEGER NOT NULL,
        year INTEGER NOT NULL,
        day_of_year INTEGER NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL NOT NULL DEFAULT 0.5,
        source_event_id INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_biographies (
        agent_id TEXT PRIMARY KEY,
        persona_json TEXT NOT NULL DEFAULT '{}',
        timeline_json TEXT NOT NULL DEFAULT '[]',
        obituary_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_minute INTEGER NOT NULL,
        type TEXT NOT NULL,
        event_key TEXT,
        actor_id TEXT,
        target_id TEXT,
        zone_id TEXT,
        building_id TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        result_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        UNIQUE(event_key)
      );

      CREATE TABLE IF NOT EXISTS chronicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_minute INTEGER NOT NULL,
        year INTEGER NOT NULL,
        day_of_year INTEGER NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('epochal','dramatic','notable','peaceful')),
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        actor_ids_json TEXT NOT NULL DEFAULT '[]',
        building_ids_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        source_event_id INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (source_event_id) REFERENCES events(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS llm_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT,
        job_type TEXT NOT NULL CHECK (job_type IN ('decision','dialogue','scribe','summarize')),
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
        prompt_json TEXT NOT NULL,
        response_json TEXT,
        decision_json TEXT,
        error TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_name TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('dry_run','applied','failed')),
        summary_json TEXT NOT NULL DEFAULT '{}',
        error TEXT,
        created_at INTEGER NOT NULL,
        applied_at INTEGER
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_agents_zone ON agents(current_zone_id);
      CREATE INDEX IF NOT EXISTS idx_agents_building ON agents(current_building_id);
      CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(type, game_minute);
      CREATE INDEX IF NOT EXISTS idx_chronicles_time ON chronicles(game_minute DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_agent_time ON agent_memories(agent_id, game_minute DESC);
      CREATE INDEX IF NOT EXISTS idx_relationships_pair ON relationships(agent_a, agent_b);
      CREATE INDEX IF NOT EXISTS idx_llm_jobs_status ON llm_jobs(status, priority DESC);
    `);
  }

  // World state
  getWorldState() {
    return this.db.prepare('SELECT * FROM world_state WHERE id = 1').get() || null;
  }

  upsertWorldState(ws) {
    this.db.prepare(`
      INSERT INTO world_state (id, game_minute, year, season, day_of_year, weather, economy_json, culture_json, population_alive, population_total, map_version, updated_at)
      VALUES (1, @game_minute, @year, @season, @day_of_year, @weather, @economy_json, @culture_json, @population_alive, @population_total, @map_version, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        game_minute=excluded.game_minute, year=excluded.year, season=excluded.season,
        day_of_year=excluded.day_of_year, weather=excluded.weather, economy_json=excluded.economy_json,
        culture_json=excluded.culture_json, population_alive=excluded.population_alive,
        population_total=excluded.population_total, updated_at=excluded.updated_at
    `).run(ws);
  }

  // Agents
  getAllAgents(aliveOnly = false) {
    const sql = aliveOnly
      ? 'SELECT * FROM agents WHERE alive = 1 ORDER BY name'
      : 'SELECT * FROM agents ORDER BY name';
    return this.db.prepare(sql).all();
  }

  getAgent(id) {
    return this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  }

  upsertAgent(a) {
    this.db.prepare(`
      INSERT INTO agents (id, name, title, age, gender, alive, x, y, current_zone_id, current_building_id, stats_json, skills_json, persona_json, needs_json, inventory_json, wealth, current_plan_json, ai_state_json, updated_at)
      VALUES (@id, @name, @title, @age, @gender, @alive, @x, @y, @current_zone_id, @current_building_id, @stats_json, @skills_json, @persona_json, @needs_json, @inventory_json, @wealth, @current_plan_json, @ai_state_json, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, title=excluded.title, age=excluded.age, gender=excluded.gender,
        alive=excluded.alive, x=excluded.x, y=excluded.y,
        current_zone_id=excluded.current_zone_id, current_building_id=excluded.current_building_id,
        stats_json=excluded.stats_json, skills_json=excluded.skills_json,
        persona_json=excluded.persona_json, needs_json=excluded.needs_json,
        inventory_json=excluded.inventory_json, wealth=excluded.wealth,
        current_plan_json=excluded.current_plan_json, ai_state_json=excluded.ai_state_json,
        updated_at=excluded.updated_at
    `).run(a);
  }

  // Buildings
  getAllBuildings() {
    return this.db.prepare('SELECT * FROM buildings ORDER BY name').all();
  }

  getBuilding(id) {
    return this.db.prepare('SELECT * FROM buildings WHERE id = ?').get(id);
  }

  upsertBuilding(b) {
    this.db.prepare(`
      INSERT INTO buildings (id, name, type, x, y, description, level, owner_id, built_year, metadata_json, updated_at)
      VALUES (@id, @name, @type, @x, @y, @description, @level, @owner_id, @built_year, @metadata_json, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, type=excluded.type, x=excluded.x, y=excluded.y,
        description=excluded.description, level=excluded.level, owner_id=excluded.owner_id,
        built_year=excluded.built_year, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at
    `).run(b);
  }

  // Zones
  getAllZones() {
    return this.db.prepare('SELECT * FROM zones ORDER BY name').all();
  }

  // Memories
  getAgentMemories(agentId, limit = 50) {
    return this.db.prepare(
      'SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY game_minute DESC LIMIT ?'
    ).all(agentId, limit);
  }

  insertMemory(m) {
    return this.db.prepare(`
      INSERT INTO agent_memories (agent_id, game_minute, year, day_of_year, type, content, importance, source_event_id, created_at)
      VALUES (@agent_id, @game_minute, @year, @day_of_year, @type, @content, @importance, @source_event_id, @created_at)
    `).run(m);
  }

  // Events
  insertEvent(e) {
    return this.db.prepare(`
      INSERT OR IGNORE INTO events (game_minute, type, event_key, actor_id, target_id, zone_id, building_id, payload_json, result_json, created_at)
      VALUES (@game_minute, @type, @event_key, @actor_id, @target_id, @zone_id, @building_id, @payload_json, @result_json, @created_at)
    `).run(e);
  }

  getEvents(sinceGameMinute, limit = 200) {
    return this.db.prepare(
      'SELECT * FROM events WHERE game_minute > ? ORDER BY game_minute DESC LIMIT ?'
    ).all(sinceGameMinute, limit);
  }

  // Chronicles
  insertChronicle(c) {
    return this.db.prepare(`
      INSERT INTO chronicles (game_minute, year, day_of_year, severity, title, content, actor_ids_json, building_ids_json, tags_json, source_event_id, created_at)
      VALUES (@game_minute, @year, @day_of_year, @severity, @title, @content, @actor_ids_json, @building_ids_json, @tags_json, @source_event_id, @created_at)
    `).run(c);
  }

  getChronicles(sinceGameMinute, limit = 100) {
    return this.db.prepare(
      'SELECT * FROM chronicles WHERE game_minute > ? ORDER BY game_minute DESC LIMIT ?'
    ).all(sinceGameMinute, limit);
  }

  // Meta
  setMeta(key, value) {
    this.db.prepare(
      'INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at'
    ).run(key, value, Date.now());
  }

  getMeta(key) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  // LLM jobs
  insertLlmJob(job) {
    return this.db.prepare(`
      INSERT INTO llm_jobs (agent_id, job_type, priority, status, prompt_json, retry_count, created_at)
      VALUES (@agent_id, @job_type, @priority, 'queued', @prompt_json, 0, @created_at)
    `).run(job);
  }

  getQueuedLlmJobs(limit = 2) {
    return this.db.prepare(
      'SELECT * FROM llm_jobs WHERE status = ? ORDER BY priority DESC, created_at ASC LIMIT ?'
    ).all('queued', limit);
  }

  updateLlmJob(id, updates) {
    const sets = Object.entries(updates)
      .map(([k, v]) => `${k} = ${v === null ? 'NULL' : '?'}`)
      .join(', ');
    const vals = Object.entries(updates)
      .filter(([_, v]) => v !== null)
      .map(([_, v]) => v);
    this.db.prepare(`UPDATE llm_jobs SET ${sets} WHERE id = ?`).run(...vals, id);
  }

  // Agent state updates (added for agent-engine)
  updateAgentNeeds(id, needs) {
    this.db.prepare(
      'UPDATE agents SET needs_json = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(needs), Date.now(), id);
  }

  updateAgentPlan(id, plan) {
    this.db.prepare(
      'UPDATE agents SET current_plan_json = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(plan), Date.now(), id);
  }

  updateAgentPosition(id, x, y) {
    this.db.prepare(
      'UPDATE agents SET x = ?, y = ?, updated_at = ? WHERE id = ?'
    ).run(x, y, Date.now(), id);
  }

  // Transaction helpers
  transaction(fn) {
    return this.db.transaction(fn)();
  }

  close() {
    this.db.close();
  }
}

export default Store;
