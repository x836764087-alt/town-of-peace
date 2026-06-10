/**
 * 带种子的伪随机数生成器，确保模拟可重现。
 *
 * 底层使用 seedrandom，同一 seed 下的连续调用序列始终产生相同的随机数。
 */

import seedrandom from 'seedrandom';

export class SeededRNG {
  private _rng: seedrandom.PRNG;

  constructor(seed: number | string) {
    this._rng = seedrandom(String(seed));
  }

  /**
   * 返回 [0, 1) 之间的均匀浮点数。
   */
  next(): number {
    return this._rng();
  }

  /**
   * 返回 [min, max] 之间的均匀随机整数（包含两端）。
   */
  int(min: number, max: number): number {
    if (min > max) { throw new RangeError('min must be ≤ max'); }
    const range = max - min + 1;
    return min + Math.floor(this._rng() * range);
  }

  /**
   * 从数组中随机选取一个元素。
   */
  pick<T>(arr: T[]): T {
    if (arr.length === 0) { throw new Error('Cannot pick from empty array'); }
    return arr[this.int(0, arr.length - 1)];
  }

  /**
   * 根据权重数组随机选取一个元素。weights[i] 对应 items[i]。
   */
  weightedPick<T>(items: T[], weights: number[]): T {
    if (items.length === 0 || items.length !== weights.length) {
      throw new Error('Items and weights must have the same length');
    }
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight <= 0) { throw new Error('Total weight must be > 0'); }
    let r = this._rng() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) { return items[i]; }
    }
    return items[items.length - 1];
  }

  /**
   * 返回 [0, 1) 之间的均匀浮点数（alias of next）。
   */
  uniform(): number {
    return this._rng();
  }

  /**
   * 将数组原地 Fisher-Yates 打乱后返回引用。
   */
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * 从数组中采样指定数量的不重复 pairs (a, b)，其中 a !== b。
   * @param items  待采样的元素数组
   * @param count  期望的 pair 数量
   * @returns 采样到的 pair 数组，最多为 min(n*(n-1), count) 对
   */
  samplePairs<T>(items: T[], count: number): Array<[T, T]> {
    if (items.length < 2 || count <= 0) { return []; }
    const maxPairs = items.length * (items.length - 1);
    const n = Math.min(count, maxPairs);
    const shuffled = this.shuffle(items);
    const pairs: Array<[T, T]> = [];
    for (let i = 0; i < items.length && pairs.length < n; i++) {
      for (let j = 0; j < items.length && pairs.length < n; j++) {
        if (i !== j) {
          pairs.push([shuffled[i], shuffled[j]]);
        }
      }
    }
    return pairs;
  }

  /**
   * 按给定概率返回 true。
   */
  chance(probability: number): boolean {
    if (probability < 0 || probability > 1) {
      throw new RangeError('probability must be between 0 and 1');
    }
    return this._rng() < probability;
  }

  /**
   * 获取底层 seedrandom 实例（供需要直接调用的场景使用）。
   */
  getRaw(): seedrandom.PRNG {
    return this._rng;
  }
}

export default SeededRNG;
