// server/ai/key-pool.js — LLM API Key 池轮换 + 限流
import config from '../config.js';

class KeyEntry {
  constructor(key) {
    this.key = key;
    this.failures = 0;
    this.cooldownUntil = 0;
    this.lastUsed = 0;
  }

  get isAvailable() {
    return Date.now() >= this.cooldownUntil;
  }

  recordFailure() {
    this.failures++;
    // Exponential backoff: 30s, 60s, 120s, 240s...
    const backoff = Math.min(30 * Math.pow(2, this.failures - 1), 600) * 1000;
    this.cooldownUntil = Date.now() + backoff;
  }

  recordSuccess() {
    this.failures = 0;
    this.lastUsed = Date.now();
  }
}

export class KeyPool {
  constructor() {
    this.keys = [];
    this._index = 0;

    // Parse keys from config or env
    const apiKey = config.llm.apiKey;
    if (apiKey) {
      // Support comma-separated keys
      apiKey.split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
        this.keys.push(new KeyEntry(k));
      });
    }
  }

  getNextAvailable() {
    if (this.keys.length === 0) return null;

    const startIdx = this._index;
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (startIdx + i) % this.keys.length;
      const entry = this.keys[idx];
      if (entry.isAvailable) {
        this._index = (idx + 1) % this.keys.length;
        entry.recordSuccess();
        return entry.key;
      }
    }

    // All keys on cooldown — return the one with shortest cooldown
    const sorted = [...this.keys].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
    const waitMs = sorted[0].cooldownUntil - Date.now();
    if (waitMs > 0) return null;

    return sorted[0].key;
  }

  reportFailure(keyValue) {
    const entry = this.keys.find(k => k.key === keyValue);
    if (entry) entry.recordFailure();
  }

  get stats() {
    return {
      total: this.keys.length,
      available: this.keys.filter(k => k.isAvailable).length,
      failures: this.keys.reduce((s, k) => s + k.failures, 0),
    };
  }
}

export default KeyPool;
