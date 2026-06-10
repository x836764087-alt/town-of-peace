/**
 * 艺术创作系统 — 有 art 技能的居民每季有概率创作作品。
 *
 * 作品类型取决于技能方向，质量影响全镇文化值。
 */

import type { WorldState, ArtWork, AgentState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

/** 作品类型。 */
type ArtType = 'poetry' | 'painting' | 'music';

/** 中文量词映射。 */
const ARTICLE_MAP: Record<ArtType, string> = {
  poetry: '首',
  painting: '幅',
  music: '曲',
};

/** 作品名称后缀。 */
const NAME_SUFFIX: Record<ArtType, string> = {
  poetry: '诗作',
  painting: '画作',
  music: '乐曲',
};

/** 质量评级描述。 */
function qualityDesc(quality: number): string {
  if (quality > 80) return '绝世佳作';
  if (quality > 60) return '上乘之作';
  if (quality > 40) return '普通作品';
  return '习作';
}

/**
 * 处理艺术创作阶段。
 *
 * - 遍历所有有 art 技能的活着的居民
 * - 每季 5% 概率创作作品
 * - 质量 = skill × rng 系数 [0.5, 1.5]，上限 100
 * - 高质量作品（>70）提升全镇文化值
 *
 * @returns 事件描述列表
 */
export function processArtCreation(state: WorldState, rng: SeededRNG): string[] {
  const events: string[] = [];

  const artists = state.agents.filter((a: AgentState) => a.alive && ((a.skills.art ?? 0) > 0));

  for (const artist of artists) {
    // 每季 5% 概率创作
    if (!rng.chance(0.05)) continue;

    const skillLevel = artist.skills.art ?? 0;
    // quality = skill × uniform(0.5, 1.5)，取 [0, 1) → (0.5, 2.0) → 映射到 (0.5, 1.5]
    const factor = 0.5 + rng.next() * 1.0; // [0.5, 1.5)
    const quality = Math.min(100, Math.round(skillLevel * factor));
    const types: ArtType[] = ['poetry', 'painting', 'music'];
    const artType = rng.pick(types);

    const artwork: ArtWork = {
      id: `art_${state.year}_${artist.id}_${(state.artworks?.length ?? 0)}`,
      creatorId: artist.id,
      type: artType,
      title: `${artist.name}的${NAME_SUFFIX[artType]}`,
      quality,
      yearCreated: state.year,
    };

    if (!state.artworks) {
      state.artworks = [];
    }
    state.artworks.push(artwork);

    // 高质量作品提升文化值
    if (quality > 70) {
      state.cultureValue = Math.min(100, (state.cultureValue ?? 0) + 2);
    }

    const desc = qualityDesc(quality);
    events.push(`${artist.name}创作了一${ARTICLE_MAP[artType]}${desc}${NAME_SUFFIX[artType]}！`);
  }

  return events;
}

export default { processArtCreation };
