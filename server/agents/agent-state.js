// server/agents/agent-state.js — Agent 状态系统
// 管理需求、情绪、OCEAN 个性、日常需求衰减

export class AgentState {
  constructor(character, store) {
    this.id = character.id;
    this.name = character.name;
    this.store = store;

    // Needs (0-100 scale)
    this.needs = { ...character.needs };

    // Base needs rates (adjusted by personality)
    this.decayRates = {
      hunger: 0.3,   // increases per tick
      fatigue: 0.2,
      social: 0.1,
    };

    // Thresholds
    this.THRESHOLDS = {
      CRITICAL: 80,   // Must act now
      HIGH: 60,       // Should act soon
      MODERATE: 40,   // Could act
      LOW: 20,        // Comfortable
    };

    // OCEAN personality (from persona traits)
    this.personality = this._derivePersonality(character.persona);

    // Emotional state
    this.emotion = 'calm';
    this.emotionTimer = 0;
  }

  _derivePersonality(persona) {
    const traits = (persona.traits || []).map(t => t.toLowerCase());
    return {
      openness: traits.some(t => ['好奇','创造','想象','open','creative'].some(k => t.includes(k))) ? 0.7 : 0.4,
      conscientiousness: traits.some(t => ['认真','负责','diligent','orderly','responsible'].some(k => t.includes(k))) ? 0.7 : 0.4,
      extraversion: traits.some(t => ['外向','社交','活泼','sociable','outgoing'].some(k => t.includes(k))) ? 0.7 : 0.4,
      agreeableness: traits.some(t => ['友善','温和','友好','friendly','kind'].some(k => t.includes(k))) ? 0.7 : 0.4,
      neuroticism: traits.some(t => ['敏感','焦虑','anxious','nervous'].some(k => t.includes(k))) ? 0.7 : 0.4,
    };
  }

  tick(gameMinute) {
    // Decay needs
    this.needs.hunger = Math.min(100, this.needs.hunger + this.decayRates.hunger);
    this.needs.fatigue = Math.min(100, this.needs.fatigue + this.decayRates.fatigue);
    this.needs.social = Math.min(100, this.needs.social + this.decayRates.social);

    // Personality-modulated decay
    if (this.personality.extraversion > 0.6) {
      this.needs.social = Math.min(100, this.needs.social + 0.1);
    }
    if (this.personality.conscientiousness > 0.6) {
      this.needs.hunger = Math.min(100, this.needs.hunger + 0.1);
    }

    // Update emotion based on needs
    this._updateEmotion();

    // Persist needs
    this.store.updateAgentNeeds(this.id, this.needs);
  }

  _updateEmotion() {
    const worstNeed = Math.max(this.needs.hunger, this.needs.fatigue, this.needs.social);
    if (worstNeed > 80) {
      this.emotion = 'distressed';
    } else if (worstNeed > 60) {
      this.emotion = 'uneasy';
    } else if (worstNeed < 20) {
      this.emotion = 'content';
    } else {
      this.emotion = 'calm';
    }
    this.emotionTimer = 0;
  }

  getUrgentNeeds() {
    const urgent = [];
    if (this.needs.hunger >= this.THRESHOLDS.CRITICAL) urgent.push({ need: 'hunger', urgency: 'critical', value: this.needs.hunger });
    else if (this.needs.hunger >= this.THRESHOLDS.HIGH) urgent.push({ need: 'hunger', urgency: 'high', value: this.needs.hunger });

    if (this.needs.fatigue >= this.THRESHOLDS.CRITICAL) urgent.push({ need: 'fatigue', urgency: 'critical', value: this.needs.fatigue });
    else if (this.needs.fatigue >= this.THRESHOLDS.HIGH) urgent.push({ need: 'fatigue', urgency: 'high', value: this.needs.fatigue });

    if (this.needs.social >= this.THRESHOLDS.CRITICAL) urgent.push({ need: 'social', urgency: 'critical', value: this.needs.social });
    else if (this.needs.social >= this.THRESHOLDS.HIGH) urgent.push({ need: 'social', urgency: 'high', value: this.needs.social });

    return urgent;
  }

  applyActionEffect(actionType) {
    switch (actionType) {
      case 'eat':
        this.needs.hunger = Math.max(0, this.needs.hunger - 40);
        break;
      case 'sleep':
        this.needs.fatigue = Math.max(0, this.needs.fatigue - 50);
        break;
      case 'socialize':
        this.needs.social = Math.max(0, this.needs.social - 35);
        break;
      case 'rest':
        this.needs.fatigue = Math.max(0, this.needs.fatigue - 20);
        break;
      case 'work':
        this.needs.fatigue = Math.min(100, this.needs.fatigue + 10);
        this.needs.hunger = Math.min(100, this.needs.hunger + 5);
        break;
      case 'explore':
        this.needs.fatigue = Math.min(100, this.needs.fatigue + 15);
        this.needs.hunger = Math.min(100, this.needs.hunger + 8);
        break;
      case 'trade':
        this.needs.social = Math.max(0, this.needs.social - 15);
        break;
    }
  }
}

export default AgentState;
