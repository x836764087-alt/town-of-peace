/**
 * 口头传说 / 民间故事系统 — 桃源镇 v6.0
 *
 * 负责：
 * 1. 基于重大事件 / 著名居民诞生传说
 * 2. 传说传播度逐年自然扩散
 * 3. 高传播度传说可能变异为新版本
 * 4. 极高传播度传说成为"镇宝"影响全镇
 */

import type { WorldState, OralTradition } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

// ─── 常量 ──────────────────────────────

const MAX_TRADITIONS = 30;

/** 传说标题模板（按类型） */
const TITLE_TEMPLATES: Record<string, string[]> = {
  legend: [
    '{name}与{event}的传说',
    '关于{event}，{name}的传奇',
    '{name}讲述的{event}之谜',
  ],
  cautionary: [
    '{event}的警示故事',
    '不要学{！name}——{event}的教训',
    '关于{！name}的{event}传说',
  ],
  historical: [
    '【{year}年】{event}实录',
    '桃源镇{year}年：{event}始末',
    '{name}亲历的{event}',
  ],
  humorous: [
    '你听过{！name}和{event}的笑话吗？',
    '{！name}在{event}时的糗事',
    '全镇人都知道的：{！name}的{event}',
  ],
};

/** 传说正文模板 */
const CONTENT_TEMPLATES: Record<string, string[]> = {
  legend: [
    '关于{event}的传说在镇上传开了——{agent}曾{action}，从此这个故事代代相传。',
    '老人们常说，{event}那年，{agent}做了件了不起的事：{action}。',
    '镇上每个人都知道，{agent}曾在{event}时{action}，这就是{title}的由来。',
  ],
  cautionary: [
    '长辈们总警告年轻人：当年{agent}因为{action}，结果{event}，从此再没人犯同样的错。',
    '{event}发生后，{agent}成了全镇的反面教材——"千万别学{！name}啊！"成了常用谚语。',
    '从那以后，{event}成了人们互相告诫的典故。{agent}的故事提醒大家三思而后行。',
  ],
  historical: [
    '这一年，{agent}亲历了{event}并{action}。这件事被口口相传，成为桃源镇的珍贵记忆。',
    '{year}年的{event}是镇民心中难忘的一页。{agent}当时{action}，这段历史至今为人津津乐道。',
    '关于{event}的记忆在镇上传开。{agent}说那天{action}，镇民们纷纷附和，故事越传越生动。',
  ],
  humorous: [
    '你可知道？当年{agent}在{event}时{action}，全镇人听了都笑翻了，这件事至今传为佳话。',
    '{event}那会儿，{agent}{action}——这个笑话从那时起就没断过。',
    '要说最逗的事，{agent}在{event}时{action}，每次提起大家都乐不可支。',
  ],
};

/** 事件关键词分类 */
const EVENT_KEYWORDS: Record<string, string[]> = {
  legend: ['英雄', '救', '发现', '发明', '创造', '建造', '修'],
  cautionary: ['死', '死', '灾难', '火灾', '病死', '意外', '惩罚', '偷', '盗窃', '杀'],
  historical: ['出生', '结婚', '迁入', '逝世', '逝世', '灾荒', '饥荒', '瘟疫', '丰收'],
  humorous: ['笑', '闹', '闹笑话', '出丑', '错认', '认错', '喝醉', '迷路', '跌倒'],
};

// ─── 核心逻辑 ──────────────────────────────

/**
 * 处理口头传说系统。
 * 返回事件字符串数组，推入编年史。
 */
export function processOralTraditions(
  state: WorldState,
  rng: SeededRNG,
  seasonEvents: string[],
): string[] {
  const events: string[] = [];

  // 1. 基于本季重大事件生成故事
  const newTradition = tryCreateTradition(state, rng, seasonEvents);
  if (newTradition) {
    if (state.oralTraditions.length >= MAX_TRADITIONS) {
      // 传说太多时移除最旧的
      state.oralTraditions.shift();
    }
    state.oralTraditions.push(newTradition);
    events.push(`📖 一个关于「${newTradition.title}」的传说开始在镇上传播。`);
  }

  // 2. 已有传说传播度扩散（仅在秋季触发，模拟一年一次）
  if (state.season === 'autumn') {
    for (const tradition of state.oralTraditions) {
      const oldSpread = tradition.spread;
      const boost = rng.int(1, 8);
      tradition.spread = Math.min(100, tradition.spread + boost);

      // 3. 传说变异：spread > 50 时概率产生变体
      if (tradition.spread > 50 && rng.chance(0.15)) {
        const mutated = mutateTradition(tradition, state, rng);
        if (mutated) {
          if (state.oralTraditions.length >= MAX_TRADITIONS) {
            state.oralTraditions.shift();
          }
          state.oralTraditions.push(mutated);
          events.push(`🔄「${tradition.title}」在传播中发生了变异，变成了新版本。`);
        }
      }

      // 4. 极高传播度传说成为"镇宝"
      if (tradition.spread > 80 && oldSpread <= 80) {
        events.push(`⭐「${tradition.title}」已成为桃源镇最家喻户晓的传说！`);
      }

      // 5. 新诞生传说首季报道
      if (tradition.yearBorn === state.year) {
        events.push(`🗣️ 镇上有人开始讲述「${tradition.title}」的故事。`);
      }
    }
  }

  return events;
}

/** 尝试基于事件创建新传说 */
function tryCreateTradition(
  state: WorldState,
  rng: SeededRNG,
  seasonEvents: string[],
): OralTradition | undefined {
  // 每季创建传说的基础概率（低）
  if (!rng.chance(0.12)) return undefined;

  // 从本季事件中提取关键词匹配类型
  let bestType: OralTradition['type'] = 'historical';
  let matchedEvent = '';

  for (const [type, keywords] of Object.entries(EVENT_KEYWORDS)) {
    for (const event of seasonEvents) {
      for (const kw of keywords) {
        if (event.includes(kw) && event.length > 5) {
          bestType = type as OralTradition['type'];
          matchedEvent = event.slice(0, 30);
          break;
        }
      }
      if (matchedEvent) break;
    }
    if (matchedEvent) break;
  }

  // 如果没有匹配到关键词，随机分配类型
  if (!matchedEvent) {
    const types: OralTradition['type'][] = ['legend', 'cautionary', 'historical', 'humorous'];
    bestType = rng.pick(types);
    matchedEvent = '镇上一段奇闻';
  }

  // 从居民中选取故事主角
  const aliveAgents = state.agents.filter(a => a.alive);
  const agent = aliveAgents.length > 0 ? rng.pick(aliveAgents) : undefined;
  const agentName = agent?.name ?? '一位老居民';

  // 生成标题
  const title = generateTitle(bestType, agentName, matchedEvent, state.year, rng);

  // 生成正文
  const content = generateContent(bestType, agentName, matchedEvent, state.year, rng);

  // 初始传播度较低
  const initialSpread = rng.int(5, 20);

  return {
    id: `tradition-${state.year}-${rng.int(1000, 9999)}`,
    title,
    content,
    yearBorn: state.year,
    spread: initialSpread,
    type: bestType,
  };
}

/** 生成传说标题 */
function generateTitle(
  type: OralTradition['type'],
  agentName: string,
  event: string,
  year: number,
  rng: SeededRNG,
): string {
  const templates = TITLE_TEMPLATES[type];
  let title = rng.pick(templates);
  title = title.replace('{name}', agentName);
  title = title.replace('{!name}', '他');
  title = title.replace('{event}', event.length > 20 ? event.slice(0, 20) : event);
  title = title.replace('{year}', String(year));
  return title;
}

/** 生成传说正文 */
function generateContent(
  type: OralTradition['type'],
  agentName: string,
  event: string,
  year: number,
  rng: SeededRNG,
): string {
  const templates = CONTENT_TEMPLATES[type];
  let content = rng.pick(templates);

  // 随机生成动作描述
  const actions = [
    '挺身而出', '不顾危险', '忙活了三天三夜', '想出了一个妙计',
    '跑遍了全镇', '不顾严寒酷暑', '倾尽了全部家当', '毫不犹豫地',
    '偷偷地', '大声地', '默默地', '笑着',
  ];
  const action = rng.pick(actions);

  content = content.replace('{name}', agentName);
  content = content.replace('{!name}', '他');
  content = content.replace('{event}', event.length > 20 ? event.slice(0, 20) : event);
  content = content.replace('{agent}', agentName);
  content = content.replace('{action}', action);
  content = content.replace('{title}', '这个故事');
  content = content.replace('{year}', String(year));
  return content;
}

/** 变异一个现有传说：改变内容但保留核心 */
function mutateTradition(
  original: OralTradition,
  state: WorldState,
  rng: SeededRNG,
): OralTradition | null {
  // 变异方向：改变故事细节 / 变换叙述角度 / 混合两种类型
  const mutations: string[] = [
    '细节添加',
    '角度改变',
    '类型混合',
    '人物替换',
  ];
  const mutation = rng.pick(mutations);

  const aliveAgents = state.agents.filter(a => a.alive);

  switch (mutation) {
    case '细节添加': {
      const extraDetails = [
        '后来听说他还做了一件更惊人的事。',
        '据说当天夜里还下了一场大雨。',
        '有人补充说他当时穿着最旧的衣服。',
        '镇上的老人说后来又在别处听到了更多细节。',
      ];
      return {
        ...original,
        id: `tradition-${state.year}-${rng.int(1000, 9999)}`,
        yearBorn: state.year,
        spread: Math.max(5, original.spread - rng.int(5, 15)),
        title: `${original.title}（新说法）`,
        content: `${original.content} ${rng.pick(extraDetails)}`,
      };
    }
    case '角度改变': {
      const differentAgent = aliveAgents.length > 1 ? rng.pick(aliveAgents) : undefined;
      return {
        ...original,
        id: `tradition-${state.year}-${rng.int(1000, 9999)}`,
        yearBorn: state.year,
        spread: Math.max(5, original.spread - rng.int(3, 10)),
        title: `${original.title}（他角度）`,
        content: `有人说，从另一个角度看，{agent}那天的事其实是这样的——{content}`,
      };
    }
    case '类型混合': {
      const mixedType = original.type === 'legend' ? 'humorous' : 'legend';
      const humorTwists = [
        '不过后来有人笑着说那其实是个误会。',
        '据说全镇人都看到了，但当事人死活不承认。',
      ];
      return {
        ...original,
        id: `tradition-${state.year}-${rng.int(1000, 9999)}`,
        yearBorn: state.year,
        spread: Math.max(5, original.spread - rng.int(5, 12)),
        type: mixedType,
        title: `${original.title}（趣谈）`,
        content: `${original.content} ${rng.pick(humorTwists)}`,
      };
    }
    case '人物替换': {
      const differentAgent = aliveAgents.length > 1 ? rng.pick(aliveAgents) : undefined;
      const agentName = differentAgent?.name ?? '另一位居民';
      return {
        ...original,
        id: `tradition-${state.year}-${rng.int(1000, 9999)}`,
        yearBorn: state.year,
        spread: Math.max(5, original.spread - rng.int(5, 15)),
        title: `${original.title.replace(original.content.slice(0, 10), agentName)}`,
        content: `不过也有人说其实是{agent}做了同样的事——{content}`,
      };
    }
    default:
      return null;
  }
}

export default processOralTraditions;
