/**
 * 全局类型化 EventBus，作为所有模拟模块的通信总线。
 *
 * 所有事件名称均使用常量，确保拼写正确并支持 TypeScript 类型推导。
 */

const EVENTS = {
  SEASON_CHANGED: 'SEASON_CHANGED',
  POPULATION_CHANGED: 'POPULATION_CHANGED',
  ECONOMY_SETTLED: 'ECONOMY_SETTLED',
  SOCIAL_UPDATED: 'SOCIAL_UPDATED',
  INNOVATION_COMPLETED: 'INNOVATION_COMPLETED',
  IMMIGRANTS_ARRIVED: 'IMMIGRANTS_ARRIVED',
  AGENT_DIED: 'AGENT_DIED',
  AGENT_MARRIED: 'AGENT_MARRIED',
  AGENT_BORN: 'AGENT_BORN',
  DISASTER: 'DISASTER',
} as const;

type EventName = (typeof EVENTS)[keyof typeof EVENTS];

type EventData<T extends EventName> = EventMap[T];

interface EventMap {
  SEASON_CHANGED: { season: string; year: number };
  POPULATION_CHANGED: { count: number; delta: number };
  ECONOMY_SETTLED: { tradeVolume: number };
  SOCIAL_UPDATED: { relationCount: number };
  INNOVATION_COMPLETED: { nodeId: string; result: string };
  IMMIGRANTS_ARRIVED: { familyCount: number; totalMembers: number };
  AGENT_DIED: { agentId: string; cause: string };
  AGENT_MARRIED: { husbandId: string; wifeId: string };
  AGENT_BORN: { childId: string; fatherId: string; motherId: string };
  DISASTER: { type: string; impact: number };
}

type EventListener<T extends EventName> = (data: EventData<T>) => void;

const listeners = new Map<EventName, EventListener<EventName>[]>();
const pendingEmit: Array<{ name: EventName; data: unknown }> = [];

export const EventBus = {
  /**
   * 订阅指定事件类型的回调。
   */
  on<T extends EventName>(name: T, fn: EventListener<T>): void {
    const arr = listeners.get(name) ?? [];
    arr.push(fn as EventListener<EventName>);
    listeners.set(name, arr);
  },

  /**
   * 移除指定事件的特定回调。若省略 fn，则移除该事件所有回调。
   */
  off<T extends EventName>(name: T, fn?: EventListener<T>): void {
    if (fn) {
      const arr = listeners.get(name);
      if (arr) {
        const idx = arr.indexOf(fn as EventListener<EventName>);
        if (idx !== -1) { arr.splice(idx, 1); }
      }
    } else {
      listeners.delete(name);
    }
  },

  /**
   * 触发事件。若当前引擎正在 tick()，事件暂存到 pendingEmit 队列。
   */
  emit<T extends EventName>(name: T, data: EventData<T>): void {
    pendingEmit.push({ name, data: data as unknown });
    if (pendingEmit.length === 1) {
      processPending();
    }
  },

  /**
   * 清空所有已注册回调和待处理事件。
   */
  clear(): void {
    listeners.clear();
    pendingEmit.length = 0;
  },
};

/** 依次派发 pending 队列中的事件。 */
function processPending(): void {
  const batch = pendingEmit.splice(0);
  for (const { name, data } of batch) {
    const fns = listeners.get(name);
    if (fns) {
      for (const fn of fns) {
        (fn as (d: unknown) => void)(data);
      }
    }
  }
  if (pendingEmit.length > 0) {
    processPending();
  }
}

export { EVENTS };
export default EventBus;
