// server/narrative/scribe.js — 史官系统
// 编年史自动生成 + 每日日志

import LlmClient from '../ai/llm-client.js';

export class Scribe {
  constructor(store, worldEngine) {
    this.store = store;
    this.worldEngine = worldEngine;
    this.llm = new LlmClient();
    this._lastChronicleDay = -1;
    this._eventsBuffer = [];
    this._chronicleCounter = 0;
  }

  tick(gameMinute, timeInfo) {
    // Collect events since last tick
    const newEvents = this.store.getEvents(timeInfo.previousGameMinute, 50);
    this._eventsBuffer.push(...newEvents);

    // Keep buffer manageable
    if (this._eventsBuffer.length > 200) {
      this._eventsBuffer = this._eventsBuffer.slice(-100);
    }

    // Generate chronicle on day change or every 30 ticks
    this._chronicleCounter++;
    if (timeInfo.dayChanged || this._chronicleCounter >= 30) {
      this._chronicleCounter = 0;
      this._generateChronicle(timeInfo);
    }
  }

  async _generateChronicle(timeInfo) {
    if (this._eventsBuffer.length === 0) return;

    // Pick significant events
    const notableEvents = this._eventsBuffer
      .filter(e => !e.type.startsWith('world:'))
      .slice(-10);

    if (notableEvents.length === 0) return;

    // Categorize
    const dialogues = notableEvents.filter(e => e.type === 'agent:dialogue');
    const actions = notableEvents.filter(e => e.type && e.type.startsWith('agent:'));

    // Build chronicle entries
    const entries = [];

    for (const action of actions.slice(0, 3)) {
      const agentName = this._getAgentName(action.actor_id);
      const payload = this._safeParse(action.payload_json);
      let content = '';

      switch (action.type) {
        case 'agent:eat':
          content = `${agentName}吃了点东西。`;
          break;
        case 'agent:sleep':
          content = `${agentName}去休息了。`;
          break;
        case 'agent:socialize':
          content = `${agentName}在镇上与人交谈。`;
          break;
        case 'agent:explore':
          content = `${agentName}在镇上散步。`;
          break;
        case 'agent:work':
          content = `${agentName}在忙碌着。`;
          break;
        case 'agent:trade':
          content = `${agentName}在做买卖。`;
          break;
        case 'agent:rest':
          content = `${agentName}在歇息。`;
          break;
        default:
          content = `${agentName}${payload?.reason || '在活动着'}。`;
      }

      entries.push({
        content,
        severity: 'peaceful',
      });
    }

    // Add dialogue entries
    for (const d of dialogues.slice(0, 2)) {
      const payload = this._safeParse(d.payload_json);
      if (payload?.dialogue) {
        entries.push({
          content: payload.dialogue,
          severity: 'peaceful',
        });
      }
    }

    // Store chronicles
    for (const entry of entries) {
      this.store.insertChronicle({
        game_minute: timeInfo.gameMinute,
        year: timeInfo.year,
        day_of_year: timeInfo.dayOfYear,
        severity: entry.severity,
        title: '',
        content: entry.content,
        actor_ids_json: '[]',
        building_ids_json: '[]',
        tags_json: JSON.stringify(['auto']),
        source_event_id: null,
        created_at: Date.now(),
      });
    }

    // Try LLM-enhanced chronicle (non-blocking)
    if (!this.llm.isBusy) {
      this._generateLlmChronicle(timeInfo, notableEvents.slice(0, 5));
    }

    this._eventsBuffer = [];
  }

  async _generateLlmChronicle(timeInfo, events) {
    try {
      const result = await this.llm.generateChronicleEntry(
        events,
        `Year ${timeInfo.year} ${timeInfo.season}, day ${timeInfo.dayOfYear}`
      );
      if (result.ok && result.content) {
        this.store.insertChronicle({
          game_minute: timeInfo.gameMinute,
          year: timeInfo.year,
          day_of_year: timeInfo.dayOfYear,
          severity: 'notable',
          title: `第${timeInfo.year}年第${timeInfo.dayOfYear}日`,
          content: result.content.trim(),
          actor_ids_json: '[]',
          building_ids_json: '[]',
          tags_json: JSON.stringify(['auto', 'llm']),
          source_event_id: null,
          created_at: Date.now(),
        });
      }
    } catch {
      // Non-blocking, LLM failure is acceptable
    }
  }

  _getAgentName(agentId) {
    if (!agentId) return '某人';
    const agent = this.store.getAgent(agentId);
    return agent ? agent.name : agentId;
  }

  _safeParse(str) {
    if (!str) return {};
    try { return JSON.parse(str); } catch { return {}; }
  }
}

export default Scribe;
