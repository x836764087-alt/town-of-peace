/**
 * 对话主题系统（DialogueTopics）— 桃源镇 v6.0
 *
 * 负责：
 * 1. 根据当前世界状态生成角色间对话主题
 * 2. 主题分类：日常、经济、社交、重大事件
 * 3. 话题情感倾向（正向/负向/中性）
 * 4. 关系值微调（对话影响好感度）
 */

import type { WorldState, AgentState } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 对话主题类型 ──────────────────────

export interface DialogueTopic {
  /** 主题类型标识 */
  type: 'daily' | 'economy' | 'social' | 'event' | 'festival' | 'innovation';
  /** 中文主题标签 */
  label: string;
  /** 具体对话内容 */
  content: string;
  /** 情感倾向：正/负/中性 */
  sentiment: 'positive' | 'negative' | 'neutral';
  /** 对话对关系值的影响量 */
  relationshipDelta: number;
}

// ─── 每日对话模板 ──────────────────────

const DAILY_GREETINGS: string[] = [
  '早啊，今天天气不错。',
  '你吃了没？',
  '忙啥呢？',
  '好几天没见了。',
  '最近生意怎么样？',
];

const DAILY_RESPONSES: string[] = [
  '还行。',
  '忙得很。',
  '也就那样。',
  '凑合着过吧。',
  '慢慢来。',
];

// ─── 对话生成器 ───────────────────────

export class DialogueGenerator {
  private state: WorldState;
  private rng: SeededRNG;

  constructor(state: WorldState, rng: SeededRNG) {
    this.state = state;
    this.rng = rng;
  }

  /**
   * 为两个角色生成一句对话。
   * 根据当前世界状态选择合适的主题。
   */
  generateDialogue(speakerA: AgentState, speakerB: AgentState): DialogueTopic {
    // 选择最合适的主题类别
    const topics = this.availableTopics(speakerA, speakerB);
    const weights = topics.map(t => this.topicWeight(t, speakerA, speakerB));
    const selected = this.rng.weightedPick(topics, weights);

    return selected;
  }

  /**
   * 获取当前可用的对话主题列表。
   */
  private availableTopics(_speakerA: AgentState, _speakerB: AgentState): DialogueTopic[] {
    const topics: DialogueTopic[] = [];

    // 1. 日常问候（总是可用）
    topics.push({
      type: 'daily',
      label: '日常寒暄',
      content: this.rng.pick(DAILY_GREETINGS),
      sentiment: 'neutral',
      relationshipDelta: this.rng.int(0, 2),
    });

    // 2. 天气话题
    topics.push({
      type: 'daily',
      label: '聊天气',
      content: this.weatherTopic(),
      sentiment: 'neutral',
      relationshipDelta: 1,
    });

    // 3. 经济话题（如果交易活跃）
    if (this.state.economy.annualTradeVolume > 100) {
      topics.push({
        type: 'economy',
        label: '谈生意',
        content: `听说最近交易额不小，有 ${Math.round(this.state.economy.annualTradeVolume)} 文呢。`,
        sentiment: 'positive',
        relationshipDelta: 3,
      });
    }

    // 4. 人口话题
    const aliveCount = this.state.agents.filter(a => a.alive).length;
    if (aliveCount > 15) {
      topics.push({
        type: 'social',
        label: '聊人口增长',
        content: `镇上都 ${aliveCount} 口人了，越来越热闹。`,
        sentiment: 'positive',
        relationshipDelta: 2,
      });
    }

    // 5. 重大事件话题
    const recentChronicle = this.state.chronicle.slice(-3);
    for (const entry of recentChronicle) {
      if (entry.severity === 'epochal' || entry.severity === 'dramatic') {
        topics.push({
          type: 'event',
          label: '聊大事',
          content: `你听说了吗？${entry.content.slice(0, 60)}`,
          sentiment: entry.content.includes('逝世') ? 'negative' : 'positive',
          relationshipDelta: 5,
        });
        break;
      }
    }

    // 6. 节日话题
    if (this.state.festivals.length > 0) {
      const latestFestival = this.state.festivals
        .filter(f => f.yearsRun > 0)
        .sort((a, b) => b.yearsRun - a.yearsRun)[0];
      if (latestFestival) {
        topics.push({
          type: 'festival',
          label: '聊节日',
          content: `「${latestFestival.name}」快到了，准备参加吗？`,
          sentiment: 'positive',
          relationshipDelta: 4,
        });
      }
    }

    // 7. 技术创新话题
    if (this.state.innovations.length > 0) {
      const latest = this.state.innovations[this.state.innovations.length - 1];
      topics.push({
        type: 'innovation',
        label: '聊新发明',
        content: `听说「${latest.name}」搞成了！`,
        sentiment: 'positive',
        relationshipDelta: 4,
      });
    }

    return topics;
  }

  /**
   * 天气话题。
   */
  private weatherTopic(): string {
    const weather = this.state.weather;
    const season = this.state.season;

    const weatherPhrases: Record<string, string[]> = {
      sunny: ['这天真舒服。', '大太阳的，晒晒好。', '晴天真好。'],
      rainy: ['又下雨了。', '这雨下得人发愁。', '小心路滑。'],
      windy: ['风真大。', '刮风了，收衣服。'],
      snowy: ['下雪了！', '好大的雪。', '雪景真美。'],
      extreme: ['这鬼天气！', '天公不作美。', '小心点好。'],
    };

    const phrases = weatherPhrases[weather] ?? ['今天天气还行。'];
    return this.rng.pick(phrases);
  }

  /**
   * 计算主题被选中的权重。
   * 重大事件权重更高，日常话题权重低但始终可用。
   */
  private topicWeight(topic: DialogueTopic, _speakerA: AgentState, _speakerB: AgentState): number {
    switch (topic.type) {
      case 'event': return 50;
      case 'innovation': return 40;
      case 'festival': return 30;
      case 'economy': return 20;
      case 'social': return 15;
      case 'daily': return 10;
      default: return 10;
    }
  }

  /**
   * 获取对话对关系值的改变。
   * 正情感对话加关系，负情感减关系。
   */
  getRelationshipDelta(topic: DialogueTopic): number {
    const base = topic.relationshipDelta;
    if (topic.sentiment === 'negative') return -base;
    if (topic.sentiment === 'positive') return base;
    return Math.floor(base / 2);
  }

  /**
   * 批量生成角色间社会互动。
   * 返回每个互动的事件描述。
   */
  generateSocialInteractions(): string[] {
    const events: string[] = [];
    const alive = this.state.agents.filter(a => a.alive);

    // 每季约 10% 的成年居民参与对话
    const adults = alive.filter(a => a.age >= 18);
    const interactionCount = Math.max(1, Math.floor(adults.length * 0.1));

    for (let i = 0; i < interactionCount; i++) {
      if (adults.length < 2) break;

      const a = this.rng.pick(adults);
      const b = this.rng.pick(adults.filter(x => x.id !== a.id));
      if (!b) continue;

      const topic = this.generateDialogue(a, b);
      const delta = this.getRelationshipDelta(topic);

      // 更新关系值
      const currentRel = this.state.relations.find(
        r => (r.agentA === a.id && r.agentB === b.id) || (r.agentA === b.id && r.agentB === a.id),
      );
      if (currentRel) {
        currentRel.value = Math.max(-100, Math.min(100, currentRel.value + delta));
      } else {
        this.state.relations.push({
          agentA: a.id,
          agentB: b.id,
          value: delta,
        });
      }

      // 仅记录重要对话
      if (topic.type !== 'daily' || this.rng.chance(0.3)) {
        events.push(`${a.name}和${b.name}聊了起来：「${topic.content}」`);
      }
    }

    return events;
  }
}

export default DialogueGenerator;
