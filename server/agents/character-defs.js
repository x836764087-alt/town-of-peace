// server/agents/character-defs.js — 角色定义与加载
// 从 SQLite DB 加载居民数据，提供标准化的角色接口

export class CharacterLoader {
  constructor(store) {
    this.store = store;
  }

  getAllAlive() {
    return this.store.getAllAgents(true).map(a => this._enrich(a));
  }

  getAll() {
    return this.store.getAllAgents(false).map(a => this._enrich(a));
  }

  getById(id) {
    const a = this.store.getAgent(id);
    return a ? this._enrich(a) : null;
  }

  _enrich(a) {
    return {
      id: a.id,
      name: a.name,
      title: a.title,
      age: a.age,
      gender: a.gender,
      alive: !!a.alive,
      position: { x: a.x, y: a.y },
      currentBuildingId: a.current_building_id,
      currentZoneId: a.current_zone_id,
      stats: safeJson(a.stats_json, {}),
      skills: safeJson(a.skills_json, {}),
      persona: safeJson(a.persona_json, {}),
      needs: safeJson(a.needs_json, {
        hunger: 30, fatigue: 30, social: 30, safety: 0
      }),
      inventory: safeJson(a.inventory_json, {}),
      wealth: a.wealth || 0,
      currentPlan: safeJson(a.current_plan_json, {}),
      updatedAt: a.updated_at,
    };
  }
}

function safeJson(str, fallback) {
  if (!str || str === '{}') return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default CharacterLoader;
