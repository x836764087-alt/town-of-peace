/**
 * 节日系统（FestivalSystem）— 桃源镇 v6.0
 *
 * 季节性文化庆典，由城镇事件或传统自然形成。
 * 节日影响全体幸福感、关系值和特殊物品消费。
 */

import type { WorldState, Festival, Season } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ────────────────────────────────────────

/** 每年最多新增节日数 */
export const MAX_NEW_FESTIVALS_PER_YEAR = 1;
/** 节日最大数量 */
export const MAX_FESTIVALS = 8;
/** 每季执行节日处理的概率 */
export const FESTIVAL_TRIGGER_CHANCE = 0.08;

/** 节日模板池 */
const FESTIVAL_TEMPLATES: Omit<Festival, 'yearsEstablished' | 'yearsRun' | 'participants'>[] = [
  { id: 'spring_fair', name: '春耕会', description: '开春集市交易种子和农具。', season: 'spring' },
  { id: 'dragon_boat', name: '端午竞渡', description: '龙舟比赛，全镇欢庆。', season: 'summer' },
  { id: 'harvest_feast', name: '丰收祭', description: '秋收庆典，感恩丰收。', season: 'autumn' },
  { id: 'winter_fire', name: '冬火围炉', description: '围炉夜话，共度寒冬。', season: 'winter' },
  { id: 'lantern_fest', name: '元宵灯会', description: '元宵赏灯猜谜。', season: 'spring' },
  { id: 'mid_autumn', name: '中秋赏月', description: '中秋赏月吃月饼。', season: 'autumn' },
];

let festivalCounter = 0;

// ─── 节日系统 ────────────────────────────────

export class FestivalSystem {
  constructor(
    private state: WorldState,
    private rng: SeededRNG,
  ) {}

  /**
   * 每季执行一次：
   * 1. 检查本季是否有节日
   * 2. 执行节日效果
   * 3. 尝试创建新节日传统
   */
  processFestivals(): string[] {
    const events: string[] = [];

    // 执行本季已有节日
    const seasonFestivals = this.state.festivals.filter(f => f.season === this.state.season);
    for (const festival of seasonFestivals) {
      events.push(...this.executeFestival(festival));
    }

    // 尝试创建新节日
    if (this.state.festivals.length < MAX_FESTIVALS && this.rng.chance(0.05)) {
      const newFest = this.createFestival();
      if (newFest) {
        this.state.festivals.push(newFest);
        events.push(`🎉 新节日传统「${newFest.name}」在镇上传开了。`);
      }
    }

    // 更新节日运行年份
    for (const f of this.state.festivals) {
      if (f.season === this.state.season) {
        f.yearsRun++;
      }
    }

    return events;
  }

  /**
   * 执行一个节日的具体效果。
   */
  private executeFestival(festival: Festival): string[] {
    const events: string[] = [];

    // 确定参与者
    const alive = this.state.agents.filter(a => a.alive);
    const participants = alive.filter(() => this.rng.chance(0.7)); // 70% 参与率

    // 幸福感提升
    for (const pid of festival.participants) {
      const agent = this.state.agents.find(a => a.id === pid);
      if (agent?.alive) {
        agent.stats.happiness = Math.min(100, agent.stats.happiness + 10);
      }
    }

    // 参与者关系增进
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        if (this.rng.chance(0.3)) {
          participants[i].relationships[participants[j].id] =
            (participants[i].relationships[participants[j].id] ?? 0) + 1;
          participants[j].relationships[participants[i].id] =
            (participants[j].relationships[participants[i].id] ?? 0) + 1;
        }
      }
    }

    events.push(`🎊 节日「${festival.name}」— ${festival.description}`);
    events.push(`   约 ${participants.length} 人参加了庆典。`);

    return events;
  }

  /**
   * 根据已有传统或随机模板创建新节日。
   */
  private createFestival(): Festival | undefined {
    // 看有没有本季的模板节日尚未创建
    const existingIds = new Set(this.state.festivals.map(f => f.id));
    const templates = FESTIVAL_TEMPLATES.filter(
      t => !existingIds.has(t.id) && t.season === this.state.season,
    );

    if (templates.length === 0) return undefined;

    const template = this.rng.pick(templates);
    const aliveIds = this.state.agents.filter(a => a.alive).map(a => a.id);

    festivalCounter++;
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      yearsEstablished: this.state.year,
      yearsRun: 0,
      season: template.season,
      participants: aliveIds.slice(0, Math.min(10, aliveIds.length)),
    };
  }

  /**
   * 获取本季的活动节日。
   */
  getCurrentFestivals(): Festival[] {
    return this.state.festivals.filter(f => f.season === this.state.season);
  }
}

export default FestivalSystem;
