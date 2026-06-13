// server/persistence/migrations.js — 从 last-save.json 迁移到 SQLite
// 用法: node server/persistence/migrations.js [--dry-run | --apply]
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import config from '../config.js';
import Store from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Defaults for missing fields
const DEFAULT_STATS = { strength: 50, intelligence: 50, dexterity: 50, charisma: 50, health: 80, maxHealth: 100, energy: 80, happiness: 60 };
const DEFAULT_NEEDS = { hunger: 30, fatigue: 30, social: 30, safety: 0 };
const DEFAULT_PERSONA = { traits: ['平凡'], values: ['活下去'], narrativeArc: '刚迁入桃源镇。' };
const DAYS_PER_SEASON = 91;

function hashFile(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function parseGameMinute(year, season, day, hour) {
  const seasonMap = { spring: 0, summer: 1, autumn: 2, winter: 3 };
  const sIdx = seasonMap[season] || 0;
  const dayOfYear = sIdx * DAYS_PER_SEASON + Math.min(day || 1, DAYS_PER_SEASON);
  const totalDays = ((year || 1) - 1) * 365 + dayOfYear - 1;
  return totalDays * 24 * 60 + (hour || 8) * 60;
}

function normalizeAgentPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

export class Migration {
  constructor(store, savePath) {
    this.store = store;
    this.savePath = savePath || config.savePath;
  }

  loadSave() {
    if (!existsSync(this.savePath)) throw new Error(`Save file not found: ${this.savePath}`);
    const raw = readFileSync(this.savePath, 'utf8');
    return { raw, data: JSON.parse(raw), hash: hashFile(raw) };
  }

  dryRun() {
    const { data, hash } = this.loadSave();
    const conflicts = [];
    const agents = data.agents || [];
    const buildings = data.buildings || [];
    const existingAgents = this.store.getAllAgents();
    const existingBuildings = this.store.getAllBuildings();

    // Check duplicates
    for (const a of agents) {
      if (existingAgents.find(e => e.id === a.id)) {
        conflicts.push({ code: 'duplicate_agent_id', entityId: a.id, message: `Agent ${a.id} already exists`, resolution: 'skip' });
      }
    }
    for (const b of buildings) {
      if (existingBuildings.find(e => e.id === b.id)) {
        conflicts.push({ code: 'duplicate_building_id', entityId: b.id, message: `Building ${b.id} already exists`, resolution: 'skip' });
      }
    }

    // Check missing positions
    let missingPos = 0;
    for (const a of agents) {
      if (a.x === undefined || a.y === undefined) missingPos++;
    }

    // Count relationships
    const relationCount = agents.reduce((sum, a) => sum + (a.relationships ? Object.keys(a.relationships).length : 0), 0);

    return {
      sourceHash: hash,
      agents: { total: agents.length, alive: agents.filter(a => a.alive !== false).length, dead: agents.filter(a => a.alive === false).length, missingPosition: missingPos },
      buildings: { total: buildings.length, missingOwner: buildings.filter(b => b.ownerId && !agents.find(a => a.id === b.ownerId)).length },
      relationships: { total: relationCount },
      memories: { total: agents.reduce((s, a) => s + (a.memories ? a.memories.length : 0), 0) },
      chronicles: { total: (data.chronicle || []).length },
      conflicts,
      ok: conflicts.length === 0,
    };
  }

  apply(mode = 'merge') {
    const { data, hash } = this.loadSave();

    // Check if already applied
    const existingMigration = this.store.db.prepare('SELECT * FROM migrations WHERE source_hash = ? AND status = ?').get(hash, 'applied');
    if (existingMigration && mode !== 'replace') {
      throw new Error(`Migration already applied (id=${existingMigration.id}). Use mode='replace' to re-apply.`);
    }

    const summary = this.dryRun();
    const now = Date.now();

    this.store.transaction(() => {
      // Record migration
      this.store.db.prepare(`
        INSERT INTO migrations (source_name, source_hash, status, summary_json, created_at)
        VALUES (?, ?, 'applied', ?, ?)
      `).run('last-save.json', hash, JSON.stringify(summary), now);

      // World state
      const gm = parseGameMinute(data.year, data.season, 1, 8);
      this.store.upsertWorldState({
        game_minute: gm,
        year: data.year || 1,
        season: data.season || 'spring',
        day_of_year: 1,
        weather: data.weather || 'sunny',
        economy_json: JSON.stringify(data.economy || { totalCurrency: 0, annualTradeVolume: 0, annualSpoilage: 0, priceHistory: {}, priceCaps: {} }),
        culture_json: JSON.stringify({
          cultureValue: data.cultureValue || 0,
          oralTraditions: data.oralTraditions || [],
          artworks: data.artworks || [],
          placeNames: data.placeNames || [],
        }),
        population_alive: data.agents ? data.agents.filter(a => a.alive !== false).length : 0,
        population_total: data.agents ? data.agents.length : 0,
        map_version: 'taoyuan-v1',
        updated_at: now,
      });

      // STEP 1: Insert agents WITHOUT building_id (avoids circular FK with buildings.owner_id)
      const agentBuildingMap = {}; // agent_id → building_id
      for (const a of (data.agents || [])) {
        if (!a.id) continue;
        agentBuildingMap[a.id] = a.currentBuilding || a.current_building_id || null;

        let x = a.x, y = a.y;
        if ((x === undefined || y === undefined) && a.currentBuilding) {
          const bld = (data.buildings || []).find(b => b.id === a.currentBuilding);
          if (bld) { x = bld.x; y = bld.y; }
        }

        const stats = { ...DEFAULT_STATS, ...(a.stats || {}) };
        if (stats.health > stats.maxHealth) stats.health = stats.maxHealth;

        this.store.db.prepare(`
          INSERT INTO agents (id, name, title, age, gender, alive, x, y, current_zone_id, current_building_id, stats_json, skills_json, persona_json, needs_json, inventory_json, wealth, current_plan_json, ai_state_json, updated_at)
          VALUES (@id, @name, @title, @age, @gender, @alive, @x, @y, NULL, NULL, @stats_json, @skills_json, @persona_json, @needs_json, @inventory_json, @wealth, @current_plan_json, @ai_state_json, @updated_at)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, title=excluded.title, age=excluded.age, gender=excluded.gender,
            alive=excluded.alive, x=excluded.x, y=excluded.y,
            stats_json=excluded.stats_json, skills_json=excluded.skills_json,
            persona_json=excluded.persona_json, needs_json=excluded.needs_json,
            inventory_json=excluded.inventory_json, wealth=excluded.wealth,
            current_plan_json=excluded.current_plan_json, ai_state_json=excluded.ai_state_json,
            updated_at=excluded.updated_at
        `).run({
          id: a.id, name: a.name || a.id, title: a.title || '', age: a.age || 30,
          gender: a.gender || '', alive: a.alive !== false ? 1 : 0,
          x: x || 0, y: y || 0,
          stats_json: JSON.stringify(stats),
          skills_json: JSON.stringify(a.skills || {}),
          persona_json: JSON.stringify(a.persona || { ...DEFAULT_PERSONA, ...(a.persona || {}) }),
          needs_json: JSON.stringify(a.needs || { ...DEFAULT_NEEDS }),
          inventory_json: JSON.stringify(a.inventory || {}),
          wealth: a.wealth || 0,
          current_plan_json: JSON.stringify(a.currentPlan || {}),
          ai_state_json: JSON.stringify({}),
          updated_at: now,
        });

        // Biography
        try {
          this.store.db.prepare(`
            INSERT OR REPLACE INTO agent_biographies (agent_id, persona_json, timeline_json, obituary_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            a.id,
            JSON.stringify(a.persona || { ...DEFAULT_PERSONA }),
            JSON.stringify([]),
            JSON.stringify(a.alive === false ? { diedAt: a.deathYear || data.year, cause: a.deathCause || 'unknown' } : {}),
            now
          );
        } catch {}

        // Family links
        if (a.family) {
          for (const spouse of (a.family.spouse || [])) {
            if (spouse) try { this.store.db.prepare('INSERT OR IGNORE INTO agent_family_links (agent_id, related_agent_id, relation_type) VALUES (?, ?, ?)').run(a.id, spouse, 'spouse'); } catch {}
          }
          for (const child of (a.family.children || [])) {
            if (child) try { this.store.db.prepare('INSERT OR IGNORE INTO agent_family_links (agent_id, related_agent_id, relation_type) VALUES (?, ?, ?)').run(a.id, child, 'child'); } catch {}
          }
          for (const parent of (a.family.parents || [])) {
            if (parent) try { this.store.db.prepare('INSERT OR IGNORE INTO agent_family_links (agent_id, related_agent_id, relation_type) VALUES (?, ?, ?)').run(a.id, parent, 'parent'); } catch {}
          }
          for (const hh of (a.family.household || [])) {
            if (hh) try { this.store.db.prepare('INSERT OR IGNORE INTO agent_family_links (agent_id, related_agent_id, relation_type) VALUES (?, ?, ?)').run(a.id, hh, 'household'); } catch {}
          }
        }

        // Relationships
        if (a.relationships) {
          for (const [targetId, rel] of Object.entries(a.relationships)) {
            const [agentA, agentB] = normalizeAgentPair(a.id, targetId);
            try {
              this.store.db.prepare(`
                INSERT OR REPLACE INTO relationships (agent_a, agent_b, affinity, trust, rivalry, tags_json, last_interaction_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(agentA, agentB, rel.affinity || rel.relationship || 0, rel.trust || 0, rel.rivalry || 0, JSON.stringify(rel.tags || []), now, now);
            } catch {}
          }
        }

        // Memories
        if (a.memories) {
          for (const m of (a.memories || []).slice(0, 200)) {
            try {
              this.store.db.prepare(`
                INSERT INTO agent_memories (agent_id, game_minute, year, day_of_year, type, content, importance, source_event_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(a.id, m.gameMinute || gm, m.year || data.year, m.day || 1, m.type || 'memory', m.content || m.text || '', m.importance || 0.5, null, now);
            } catch {}
          }
        }
      }

      // STEP 2: Insert buildings (now agents exist, so owner_id FK is valid)
      for (const b of (data.buildings || [])) {
        this.store.db.prepare(`
          INSERT INTO buildings (id, name, type, x, y, description, level, owner_id, built_year, metadata_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, type=excluded.type, x=excluded.x, y=excluded.y,
            description=excluded.description, level=excluded.level, owner_id=excluded.owner_id,
            built_year=excluded.built_year, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at
        `).run(b.id, b.name || b.type, b.type || 'unknown', b.x || 0, b.y || 0, b.description || '', b.level || 1, b.ownerId || null, b.builtYear || 0, JSON.stringify(b.metadata || {}), now);

        // Zone for building
        try {
          this.store.db.prepare(`
            INSERT OR IGNORE INTO zones (id, name, category, x, y, w, h, navigable, description, updated_at)
            VALUES (?, ?, ?, ?, ?, 3, 3, 1, ?, ?)
          `).run(`zone_${b.id}`, b.name || b.id, 'building', b.x || 0, b.y || 0, b.description || '', now);
        } catch {}
      }

      // STEP 3: Update agents with building_id (buildings now exist)
      for (const [agentId, buildingId] of Object.entries(agentBuildingMap)) {
        if (buildingId) {
          this.store.db.prepare('UPDATE agents SET current_building_id = ?, updated_at = ? WHERE id = ?').run(buildingId, now, agentId);
        }
      }

      // Global relations
      if (data.relations) {
        for (const [agentA, relMap] of Object.entries(data.relations)) {
          if (!relMap || typeof relMap !== 'object') continue;
          for (const [agentB, rel] of Object.entries(relMap)) {
            const [a1, a2] = normalizeAgentPair(agentA, agentB);
            try {
              this.store.db.prepare(`
                INSERT OR IGNORE INTO relationships (agent_a, agent_b, affinity, trust, rivalry, tags_json, last_interaction_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(a1, a2, rel.affinity || 0, rel.trust || 0, rel.rivalry || 0, '[]', now, now);
            } catch {}
          }
        }
      }

      // Chronicles
      for (const c of (data.chronicle || [])) {
        try {
          this.store.insertChronicle({
            game_minute: parseGameMinute(c.year || data.year, data.season, 1, 12),
            year: c.year || data.year,
            day_of_year: 1,
            severity: c.severity || 'notable',
            title: c.title || c.text?.slice(0, 60) || '',
            content: typeof c.text === 'string' ? c.text : (c.text ? JSON.stringify(c.text) : ''),
            actor_ids_json: JSON.stringify(c.actors || []),
            building_ids_json: JSON.stringify(c.buildings || []),
            tags_json: JSON.stringify(c.tags || []),
            source_event_id: null,
            created_at: now,
          });
        } catch {}
      }

      // Events for innovations/festivals/laws
      for (const inv of (data.innovations || [])) {
        try {
          this.store.insertEvent({
            game_minute: parseGameMinute(inv.year || data.year, data.season, 1, 12),
            type: 'innovation',
            event_key: `innovation_${inv.id || inv.name}`,
            actor_id: null,
            target_id: null,
            zone_id: null,
            building_id: null,
            payload_json: JSON.stringify(inv),
            result_json: '{}',
            created_at: now,
          });
        } catch {}
      }
    });

    console.log(`✅ Migration applied: ${summary.agents.total} agents, ${summary.buildings.total} buildings, ${summary.chronicles.total} chronicles`);
    return summary;
  }

  _insertFamilyLink(aId, rId, type) {
    try {
      this.store.db.prepare(
        'INSERT OR IGNORE INTO agent_family_links (agent_id, related_agent_id, relation_type) VALUES (?, ?, ?)'
      ).run(aId, rId, type);
    } catch {}
  }
}

// CLI
if (process.argv[1] && (process.argv[1].includes('migrations') || process.argv[1] === import.meta.url)) {
  const mode = process.argv.find(a => a === '--dry-run') ? 'dry-run' :
               process.argv.find(a => a === '--apply') ? 'apply' : null;

  if (!mode) {
    console.log('Usage: node server/persistence/migrations.js [--dry-run | --apply]');
    process.exit(0);
  }

  const store = new Store();
  const migration = new Migration(store);

  try {
    if (mode === 'dry-run') {
      const report = migration.dryRun();
      console.log(JSON.stringify(report, null, 2));
      console.log(`\nConflicts: ${report.conflicts.length}`);
    } else {
      const result = migration.apply('merge');
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    store.close();
  }
}

export default Migration;
