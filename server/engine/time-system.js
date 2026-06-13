// server/engine/time-system.js — 时间系统
// 现实 1 周 = 游戏 1 年 (365天, 24h/day)

import config from '../config.js';

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_YEAR = 365 * MINUTES_PER_DAY;
const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const DAYS_PER_SEASON = 91; // ~365/4

export class TimeSystem {
  constructor(options = {}) {
    this.tickMs = options.tickMs || config.tickMs;
    this.realSecondsPerGameYear = options.realSecondsPerGameYear || config.realSecondsPerGameYear;
    this.maxCatchUpMinutes = options.maxCatchUpMinutes || config.maxCatchUpMinutes;
    this._paused = false;
    this._speedMultiplier = 1.0;

    // Calculated constants
    this.realMsPerGameMinute =
      (this.realSecondsPerGameYear * 1000) / MINUTES_PER_YEAR;
    this.gameMinutesPerTick =
      this.tickMs / this.realMsPerGameMinute;
  }

  init(startGameMinute, paused = false) {
    this._startWallTime = Date.now();
    this._startGameMinute = startGameMinute;
    this._paused = paused;
    this._lastTickGameMinute = startGameMinute;
  }

  get gameMinute() {
    if (this._paused) return this._lastTickGameMinute;
    const elapsed = (Date.now() - this._startWallTime) * this._speedMultiplier;
    return this._startGameMinute + Math.floor(elapsed / this.realMsPerGameMinute);
  }

  advance() {
    if (this._paused) return null;
    const prevMinute = this._lastTickGameMinute;
    const currentMinute = Math.min(this.gameMinute, this._lastTickGameMinute + 1440); // cap per tick
    const advanced = currentMinute - prevMinute;

    if (advanced <= 0) return null;

    this._lastTickGameMinute = currentMinute;
    return this.computeTime(currentMinute, advanced);
  }

  computeTime(gameMinute, advancedMinutes) {
    const totalDays = Math.floor(gameMinute / MINUTES_PER_DAY);
    const year = Math.floor(totalDays / 365) + 1;
    const dayOfYear = (totalDays % 365) + 1;
    const minutesToday = gameMinute % MINUTES_PER_DAY;
    const hour = Math.floor(minutesToday / 60);
    const minute = minutesToday % 60;
    const seasonIdx = Math.min(Math.floor((dayOfYear - 1) / DAYS_PER_SEASON), 3);
    const season = SEASONS[seasonIdx];

    const advanced = advancedMinutes || 0;
    const result = {
      gameMinute,
      year,
      season,
      dayOfYear,
      hour,
      minute,
      advanced,
      previousGameMinute: gameMinute - advanced,
      seasonChanged: false,
      dayChanged: false,
      hourChanged: false,
    };

    // Detect transitions
    if (advanced > 0) {
      const prevTime = this.computeTime(gameMinute - advanced);
      result.seasonChanged = prevTime.season !== result.season;
      result.dayChanged = prevTime.dayOfYear !== result.dayOfYear;
      result.hourChanged = prevTime.hour !== result.hour;
    }

    return result;
  }

  computeTimeFromMinute(gameMinute) {
    return this.computeTime(gameMinute, 0);
  }

  get paused() { return this._paused; }
  set paused(v) { this._paused = v; }

  get speedMultiplier() { return this._speedMultiplier; }
  set speedMultiplier(v) {
    // When changing speed, recompute start point to avoid jumps
    this._startGameMinute = this._lastTickGameMinute;
    this._startWallTime = Date.now();
    this._speedMultiplier = Math.max(0.1, Math.min(10, v));
  }

  // Recover after downtime
  catchUp() {
    const elapsedMs = Date.now() - this._startWallTime;
    const elapsedMin = Math.floor(elapsedMs / this.realMsPerGameMinute);
    if (elapsedMin <= this.maxCatchUpMinutes) return 0;
    const caughtMin = elapsedMin - this.maxCatchUpMinutes;
    this._startGameMinute += caughtMin;
    this._startWallTime = Date.now();
    return caughtMin;
  }
}

export default TimeSystem;
