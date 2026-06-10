/**
 * 创世级 AgentFactory，负责将静态角色配置转换为运行时 AgentState。
 *
 * 所有角色关系（配偶、父子）在批量生成后统一交叉链接。
 */

import type { CharacterConfig } from '../config/characters.js';
import type { AgentState, Inventory } from '../core/types.js';
import { SeededRNG } from '../core/rng.js';

/** 常用中文姓氏列表。 */
const COMMON_SURNAMES = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王',
  '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨',
  '朱', '秦', '尤', '许', '何', '吕', '张', '孔',
];

/** 常用单字名（男女通用）。 */
const COMMON_FIRST_NAMES = [
  '大', '小', '文', '明', '华', '国', '强', '伟',
  '芳', '娜', '秀', '英', '敏', '静', '丽', '涛',
  '军', '杰', '勇', '磊', '刚', '平', '波', '辉',
];

/** 出生时默认分配的中文名生成规则。 */
function generateBabyName(rng: SeededRNG, surname: string, gender: string): string {
  const first = rng.pick(COMMON_FIRST_NAMES);
  const last = first.charAt(0); // 取首字作为常见单字名
  return surname + last;
}

/** 随机生成一个不在 existingSurnames 中的中文姓氏。 */
function randomSurname(rng: SeededRNG, existing: string[]): string {
  const available = COMMON_SURNAMES.filter(s => !existing.includes(s));
  if (available.length === 0) { return rng.pick(COMMON_SURNAMES); }
  return rng.pick(available);
}

/** 随机生成一个全名。 */
function randomName(rng: SeededRNG, surname: string, gender: string): string {
  return surname + rng.pick(COMMON_FIRST_NAMES);
}

/**
 * 根据 config 创建初始 AgentState。
 *
 * - 将 config.family.spouse 等映射到 relationships 和 family。
 * - 设置 born = 0（第一年）。
 * - 分配 initialBuilding（若有）。
 */
export function createAgent(config: CharacterConfig, rng: SeededRNG): AgentState {
  const relationships: Record<string, number> = {};

  // 配偶初始关系值为正数（表示亲密）
  if (config.family.spouse) {
    relationships[config.family.spouse] = 80;
  }

  // 初始好感度（加速婚姻）
  if (config.initialRelationships) {
    for (const [targetId, score] of Object.entries(config.initialRelationships)) {
      relationships[targetId] = score;
    }
  }

  return {
    id: config.id,
    name: config.name,
    title: config.title,
    age: config.age,
    alive: true,
    gender: config.gender,
    stats: { ...config.stats },
    skills: { ...config.skills },
    inventory: { items: { rice: 10, ...config.inventory } },
    relationships,
    family: {
      spouse: config.family.spouse,
      children: [...config.family.children],
      parents: [...config.family.parents],
      household: [],
    },
    conditions: [],
    memories: [], biography: undefined,
    born: 0,
    wealth: config.wealth ?? 0,
    employees: [],
    tags: [...config.tags],
    initialBuilding: config.initialBuilding,
    x: 0,
    y: 0,
    crimes: 0,
    laborService: undefined,
  };
}

/**
 * 按 CharacterConfig 列表批量生成 AgentState，并交叉链接家庭关系。
 *
 * 1. 对每个 config 调用 createAgent()。
 * 2. 遍历所有 agent，将其配偶/子女/父母的 id 补充到对方的 family 字段中。
 */
/**
 * 随机生成一个艺术技能（10-50 范围，约 20% 概率）。
 * 用于有艺术气质的居民。
 */
function maybeAddArtSkill(agent: AgentState, rng: SeededRNG): void {
  // 有 art-related 技能的居民更可能获得 art 技能
  const artRelated = ['painting', 'calligraphy', 'writing', 'music'];
  const hasArtRelated = artRelated.some(s => (agent.skills[s] ?? 0) > 0);
  const probability = hasArtRelated ? 0.6 : 0.1;
  if (rng.chance(probability)) {
    agent.skills.art = rng.int(10, 50);
  }
}

export function createAllAgents(
  characters: CharacterConfig[],
  rng: SeededRNG,
): AgentState[] {
  const agents: AgentState[] = [];

  // Phase 1: 创建所有 agent
  for (const config of characters) {
    const agent = createAgent(config, rng);
    maybeAddArtSkill(agent, rng);
    agents.push(agent);
  }

  // Phase 2: 交叉链接家庭关系
  for (const agent of agents) {
    if (agent.family.spouse) {
      const spouseAgent = agents.find(a => a.id === agent.family.spouse);
      if (spouseAgent) {
        spouseAgent.family.spouse = agent.id;
        // 双向关系已在上一步设置
      }
    }

    for (const childId of agent.family.children) {
      const child = agents.find(a => a.id === childId);
      if (child) {
        if (!child.family.parents.includes(agent.id)) {
          child.family.parents.push(agent.id);
        }
      }
    }
  }

  return agents;
}

/**
 * 随机生成一个移民家庭。
 *
 * - 2-5 名家庭成员
 * - 随机中文姓氏（避开已有姓氏）
 * - 父亲 (25-45), 母亲 (22-40), 0-3 个孩子 (1-16)
 * - 随机基础属性/技能
 *
 * 返回 { agents: AgentState[], narrative: string }。
 */
export function createImmigrantFamily(
  rng: SeededRNG,
  existingSurnames: string[],
): { agents: AgentState[]; narrative: string } {
  const surname = randomSurname(rng, existingSurnames);
  const familySize = rng.int(2, 5);

  // father (25-45)
  const fatherAge = rng.int(25, 45);
  const fatherId = `${surname}家${rng.int(100, 999)}`;
  const fatherName = randomName(rng, surname, '男');

  const father: AgentState = {
    id: fatherId,
    name: fatherName,
    age: fatherAge,
    alive: true,
    gender: '男',
    stats: {
      strength: rng.int(50, 80),
      intelligence: rng.int(40, 70),
      dexterity: rng.int(40, 70),
      charisma: rng.int(40, 70),
      health: rng.int(60, 85),
      maxHealth: 85,
      energy: rng.int(60, 80),
      happiness: rng.int(50, 75),
    },
    skills: {
      farming: rng.int(30, 60),
      strength: rng.int(40, 70),
    },
    inventory: { items: { rice: rng.int(5, 15), water: 3 } },
    relationships: {},
    family: { spouse: undefined, children: [], parents: [], household: [] },
    conditions: [],
    employees: [],
    memories: [], biography: undefined,
    born: 0,
    tags: ['immigrant'],
      wealth: rng.int(30, 100),
      x: 0, y: 0,
      crimes: 0,
      laborService: undefined,
  };

  const agents: AgentState[] = [father];

  let idx = 1;
  // mother (22-40), if familySize >= 2
  let motherAgent: AgentState | undefined;
  if (familySize >= 2) {
    const motherId = fatherId + '-wife';
    const motherSurname = randomSurname(rng, existingSurnames);
    const mName = randomName(rng, motherSurname, '女');
    const motherAge = rng.int(22, 40);

    const mother: AgentState = {
      id: motherId,
      name: mName,
      title: '',
      age: motherAge,
      alive: true,
      gender: '女',
      stats: {
        strength: rng.int(40, 65),
        intelligence: rng.int(45, 75),
        dexterity: rng.int(50, 80),
        charisma: rng.int(50, 80),
        health: rng.int(55, 80),
        maxHealth: 80,
        energy: rng.int(55, 75),
        happiness: rng.int(55, 80),
      },
      skills: {
        cooking: rng.int(30, 65),
        sewing: rng.int(25, 55),
      },
      inventory: { items: { rice: rng.int(3, 10) } },
      relationships: { [fatherId]: 80 },
      family: { spouse: fatherId, children: [], parents: [], household: [] },
      conditions: [],
      memories: [], biography: undefined,
      born: 0,
      tags: ['immigrant'],
      wealth: rng.int(20, 60),
      employees: [],
      x: 0, y: 0,
      crimes: 0,
      laborService: undefined,
    };
    father.family.spouse = motherId;
    father.relationships[motherId] = 80;
    agents.push(mother);
    motherAgent = mother;
    idx++;
  }

  // children (0-3)
  const childCount = rng.int(0, Math.max(0, familySize - idx));
  const childAgents: AgentState[] = [];
  for (let c = 0; c < childCount; c++) {
    const childGender: '男' | '女' = rng.pick(['男', '女']);
    const childAge = rng.int(1, 16);
    const childId = fatherId + '-child' + c;
    const childName = randomName(rng, surname, childGender);

    const child: AgentState = {
      id: childId,
      name: childName,
      age: childAge,
      alive: true,
      gender: childGender,
      stats: {
        strength: rng.int(20, 50),
        intelligence: rng.int(20, 55),
        dexterity: rng.int(20, 55),
        charisma: rng.int(25, 60),
        health: rng.int(40, 70),
        maxHealth: 70,
        energy: rng.int(40, 65),
        happiness: rng.int(60, 90),
      },
      skills: {},
      inventory: { items: {} },
      relationships: {},
      family: { spouse: undefined, children: [], parents: [fatherId], household: [] },
      conditions: [],
      memories: [], biography: undefined,
      born: 0,
      tags: ['immigrant', 'child'],
      wealth: 0,
      employees: [],
      x: 0, y: 0,
      crimes: 0,
      laborService: undefined,
    };
    agents.push(child);
    childAgents.push(child);
    father.family.children.push(childId);
  }
  // 子代也登记到母亲名下
  if (motherAgent) {
    for (const c of childAgents) {
      motherAgent.family.children.push(c.id);
      c.family.parents.push(motherAgent.id);
    }
  }

  // Build narrative
  const narrative = `${surname}家 ${familySize} 口人迁入桃源镇。`;
  return { agents, narrative };
}

export default { createAgent, createAllAgents, createImmigrantFamily };
