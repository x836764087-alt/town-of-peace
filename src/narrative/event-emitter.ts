/**
 * 事件发射器（EventEmitter）— 桃源镇 v6.0
 *
 * 全镇事件广播系统。
 * 从各个子系统中收集事件消息，统一分发到 chronicle 和 UI。
 */

import type { WorldState, ChronicleEntry } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ────────────────────────────────────────

/** 每季最多记录的事件数 */
export const MAX_EMITTED_EVENTS = 30;

// ─── 事件发射器 ──────────────────────────────

export class EventEmitter {
  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  /**
   * 发射事件：将所有子系统的事件收集归并。
   */
  emitAll(subsystemEvents: SubsystemEvents): string[] {
    const allEvents: string[] = [];
    const maxEvents = MAX_EMITTED_EVENTS;

    for (const evt of subsystemEvents.rumors ?? []) {
      if (allEvents.length >= maxEvents) break;
      allEvents.push(`【谣言】${evt}`);
    }
    for (const evt of subsystemEvents.groups ?? []) {
      if (allEvents.length >= maxEvents) break;
      allEvents.push(`【社群】${evt}`);
    }
    for (const evt of subsystemEvents.townEvents ?? []) {
      if (allEvents.length >= maxEvents) break;
      allEvents.push(`【事件】${evt}`);
    }
    for (const evt of subsystemEvents.discoveries ?? []) {
      if (allEvents.length >= maxEvents) break;
      allEvents.push(`【发现】${evt}`);
    }
    for (const evt of subsystemEvents.festivals ?? []) {
      if (allEvents.length >= maxEvents) break;
      allEvents.push(`【节日】${evt}`);
    }
    for (const evt of subsystemEvents.archives ?? []) {
      if (allEvents.length >= maxEvents) break;
      allEvents.push(`【档案】${evt}`);
    }
    for (const evt of subsystemEvents.trade ?? []) {
      if (allEvents.length >= maxEvents) break;
      allEvents.push(`【交易】${evt}`);
    }

    return allEvents;
  }

  /**
   * 记录一条事件到 chronicle，附带格式化。
   */
  recordToChronicle(text: string, severity: ChronicleEntry['severity'] = 'peaceful'): void {
    const entry: ChronicleEntry = {
      year: this.state.year,
      severity,
      content: text,
    };
    this.state.chronicle.push(entry);
  }

  /**
   * 一次性记录多条事件到 chronicle。
   */
  recordAllToChronicle(events: string[]): void {
    for (const text of events) {
      this.recordToChronicle(text);
    }
  }
}

// ─── 子系统事件集合 ───────────────────────────

export interface SubsystemEvents {
  rumors?: string[];
  groups?: string[];
  townEvents?: string[];
  discoveries?: string[];
  festivals?: string[];
  archives?: string[];
  trade?: string[];
}

export default EventEmitter;
