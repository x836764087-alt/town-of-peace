// server/agents/agent-engine.js — Agent 行为引擎
// 决策循环: 需求驱动 + LLM 增强 + Utility AI fallback

import { AgentState } from './agent-state.js';
import { CharacterLoader } from './character-defs.js';
import LlmClient from '../ai/llm-client.js';

export class AgentEngine {
  constructor(store, worldEngine) {
    this.store = store;
    this.worldEngine = worldEngine;
    this.characterLoader = new CharacterLoader(store);
    this.llm = new LlmClient();
    this.agents = new Map(); // id -> AgentState
    this._thinkInterval = 2; // think every N ticks
    this._tickCount = 0;

    // Movement state
    this._paths = new Map(); // id -> { path: [], step: 0 }
  }

  init() {
    const characters = this.characterLoader.getAllAlive();
    for (const char of characters) {
      this.agents.set(char.id, new AgentState(char, this.store));
    }
    console.log(`[AgentEngine] Loaded ${this.agents.size} agents`);
  }

  tick(gameMinute, timeInfo) {
    this._tickCount++;

    // Phase 1: Update all agent states (needs decay)
    for (const [id, state] of this.agents) {
      state.tick(gameMinute);
    }

    // Phase 2: Think (not every tick, and not all agents at once)
    if (this._tickCount % this._thinkInterval === 0) {
      this._thinkTick(gameMinute, timeInfo);
    }

    // Phase 3: Move agents along current paths
    this._moveTick();
  }

  async _thinkTick(gameMinute, timeInfo) {
    // Only think for a subset of agents each tick (spread across ticks)
    const agentIds = [...this.agents.keys()];
    const thinkBatch = 3; // max 3 agents per tick
    const batchStart = (this._tickCount * thinkBatch) % agentIds.length;

    for (let i = 0; i < thinkBatch && (batchStart + i) < agentIds.length; i++) {
      const id = agentIds[batchStart + i];
      const state = this.agents.get(id);
      if (!state) continue;

      const character = this.characterLoader.getById(id);
      if (!character) continue;

      await this._thinkForAgent(character, state, gameMinute, timeInfo);
    }
  }

  async _thinkForAgent(character, state, gameMinute, timeInfo) {
    const urgentNeeds = state.getUrgentNeeds();

    // Build context for LLM decision
    const context = {
      timeString: `Year ${timeInfo.year} ${timeInfo.season} day ${timeInfo.dayOfYear} ${String(timeInfo.hour).padStart(2,'0')}:${String(timeInfo.minute).padStart(2,'0')}`,
      location: this._getLocationName(character.position),
      nearby: this._getNearbyAgents(character),
      weather: this.store.getWorldState()?.weather || 'sunny',
    };

    // Always use LLM if available and not busy, otherwise fallback
    let decision;
    if (!this.llm.isBusy && urgentNeeds.length > 0) {
      const result = await this.llm.generateDecision(character.name, state, context);
      if (result.ok && result.parsed) {
        decision = result.parsed;
      }
    }

    // Fallback: Utility AI if LLM didn't respond
    if (!decision) {
      decision = this._fallbackDecision(character, state, urgentNeeds, context);
    }

    // Execute the decision
    await this._executeDecision(character, state, decision, gameMinute);
  }

  _fallbackDecision(character, state, urgentNeeds, context) {
    // Utility AI: deterministic fallback based on needs thresholds
    const hour = parseInt(context.timeString?.match(/(\d+):\d+$/)?.[1] || '8');

    // Night time → sleep
    if (hour >= 22 || hour < 6) {
      return { action: 'sleep', reason: '夜深了，该休息了', durationMinutes: 60 };
    }

    // Critical needs → address immediately
    for (const need of urgentNeeds) {
      if (need.need === 'hunger') {
        return { action: 'eat', reason: '肚子饿了，去找吃的', durationMinutes: 30, targetType: 'food' };
      }
      if (need.need === 'fatigue') {
        return { action: 'rest', reason: '有点累了，休息一下', durationMinutes: 30 };
      }
      if (need.need === 'social') {
        return { action: 'socialize', reason: '想找人聊聊天', durationMinutes: 30 };
      }
    }

    // Time-based routines
    if (hour >= 6 && hour < 8) {
      return { action: 'eat', reason: '早餐时间', durationMinutes: 20 };
    }
    if (hour >= 12 && hour < 13) {
      return { action: 'eat', reason: '午餐时间', durationMinutes: 30 };
    }
    if (hour >= 18 && hour < 19) {
      return { action: 'eat', reason: '晚餐时间', durationMinutes: 30 };
    }
    if ((hour >= 8 && hour < 12) || (hour >= 14 && hour < 17)) {
      return { action: 'work', reason: '日常工作', durationMinutes: 60, targetType: 'work' };
    }

    // Default: explore or wait
    return Math.random() > 0.5
      ? { action: 'explore', reason: '在镇上走走', durationMinutes: 30 }
      : { action: 'wait', reason: '停下休息一会儿', durationMinutes: 15 };
  }

  async _executeDecision(character, state, decision, gameMinute) {
    if (!decision || !decision.action) return;

    // Apply need effects
    state.applyActionEffect(decision.action);

    // Log the action as an event
    this.store.insertEvent({
      game_minute: gameMinute,
      type: `agent:${decision.action}`,
      event_key: `${character.id}-${gameMinute}-${decision.action}`,
      actor_id: character.id,
      target_id: null,
      zone_id: null,
      building_id: null,
      payload_json: JSON.stringify({
        action: decision.action,
        reason: decision.reason,
        durationMinutes: decision.durationMinutes,
      }),
      result_json: '{}',
      created_at: Date.now(),
    });

    // If socialize, find nearby agent and generate dialogue
    if (decision.action === 'socialize') {
      const nearby = this._getNearbyAgents(character);
      if (nearby.length > 0) {
        const target = nearby[0];
        this._generateAndStoreDialogue(character, target, gameMinute);
      }
    }

    // Update character plan in DB
    this.store.updateAgentPlan(character.id, {
      action: decision.action,
      reason: decision.reason,
      durationMinutes: decision.durationMinutes,
      startedAtGameMinute: gameMinute,
    });

    // Small random movement for visual interest
    if (['explore', 'work', 'socialize', 'trade'].includes(decision.action)) {
      this._wander(character);
    }
  }

  _wander(character) {
    const dx = Math.floor(Math.random() * 5 - 2);
    const dy = Math.floor(Math.random() * 5 - 2);
    const newX = Math.max(0, Math.min(49, (character.position.x || 25) + dx));
    const newY = Math.max(0, Math.min(39, (character.position.y || 20) + dy));
    this.store.updateAgentPosition(character.id, newX, newY);
  }

  _getLocationName(position) {
    // Simple area mapping based on coordinates
    const x = position?.x || 25;
    const y = position?.y || 20;
    if (x < 15 && y < 15) return '西区';
    if (x >= 15 && y < 15) return '北区';
    if (x < 15 && y >= 15) return '南区';
    if (x >= 30 && y >= 25) return '东区';
    return '镇中心';
  }

  _getNearbyAgents(character) {
    const all = this.characterLoader.getAllAlive();
    return all
      .filter(a => a.id !== character.id)
      .filter(a => {
        const dx = (a.position?.x || 0) - (character.position?.x || 0);
        const dy = (a.position?.y || 0) - (character.position?.y || 0);
        return Math.abs(dx) <= 3 && Math.abs(dy) <= 3;
      })
      .slice(0, 3);
  }

  _generateAndStoreDialogue(speaker, listener, gameMinute) {
    // Generate or use canned dialogue
    const dialogues = [
      `"${speaker.name}：你好啊，${listener.name}！"`,
      `"${speaker.name}：今天天气不错。"`,
      `"${speaker.name}：${listener.name}，最近怎么样？"`,
      `"${speaker.name}：刚吃完饭，出来走走。"`,
    ];
    const dialogue = dialogues[Math.floor(Math.random() * dialogues.length)];

    this.store.insertEvent({
      game_minute: gameMinute,
      type: 'agent:dialogue',
      event_key: `dialogue-${speaker.id}-${listener.id}-${gameMinute}`,
      actor_id: speaker.id,
      target_id: listener.id,
      zone_id: null,
      building_id: null,
      payload_json: JSON.stringify({ dialogue }),
      result_json: '{}',
      created_at: Date.now(),
    });
  }

  _moveTick() {
    if (this._paths.size === 0) return;
    for (const [id, pathData] of this._paths) {
      if (pathData.step >= pathData.path.length) {
        this._paths.delete(id);
        continue;
      }
      const target = pathData.path[pathData.step];
      this.store.updateAgentPosition(id, target.x, target.y);
      pathData.step++;
    }
  }
}

export default AgentEngine;
