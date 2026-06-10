import { INNOVATION_TREE, type InnovationNode } from '../config/innovation-tree.js';
import type { WorldState } from '../core/types.js';

/**
 * 计算所有已研发技术的累计世界效果。
 * 效果是乘法叠加的（叠乘链），例如两个 building_efficiency 1.15 和 1.2 叠加为 1.38。
 */
export class TechEffectApplier {
  constructor(private state: WorldState) {}

  /**
   * 遍历 state.innovations，从 INNOVATION_TREE 查找对应节点，
   * 累乘所有 effects 值，返回效果倍率字典。
   */
  computeEffects(): Record<string, number> {
    const effects: Record<string, number> = {};
    for (const tech of this.state.innovations) {
      const node = INNOVATION_TREE.find(n => n.id === tech.id);
      if (!node || !node.effects) continue;
      for (const effect of node.effects) {
        // 乘法叠加
        effects[effect.type] = (effects[effect.type] ?? 1) * effect.value;
      }
    }
    return effects;
  }
}

/**
 * 查询某类效果的当前累计倍率。
 * @param state 世界状态
 * @param effectType 效果类型，如 'building_efficiency', 'food_production'
 * @returns 倍率（无效果时返回 1.0）
 */
export function getTechEffect(
  state: WorldState,
  effectType: string,
): number {
  const applier = new TechEffectApplier(state);
  const all = applier.computeEffects();
  return all[effectType] ?? 1.0;
}
