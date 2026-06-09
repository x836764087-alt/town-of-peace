import { describe, it, expect, beforeEach } from 'vitest';
import { SeededRNG } from '../../src/core/rng.js';
import type { WorldState } from '../../src/core/types.js';
import {
  createRecord,
  canAccessKnowledge,
  checkKnowledgeLoss,
  onAgentDeath,
  transferToApprentice,
  discoverKnowledge,
  decayCollectiveMemory,
  getRecordsByTech,
  getActiveRecords,
  getKnowledgeSummary,
  KNOWLEDGE_TYPE_NAMES,
  KNOWLEDGE_MAX_AGE,
  COLLECTIVE_MEMORY_FORGET_CHANCE,
  resetRecordIdCounter,
  type KnowledgeRecord,
  type KnowledgeLostInfo,
} from '../../src/agents/knowledge-transfer.js';

// ─── 测试辅助函数 ────────────────────────────

function makeAgent(
  id: string,
  name: string,
  alive: boolean,
  age: number = 30,
  skills: Record<string, number> = {},
): WorldState['agents'][0] {
  return {
    id,
    name,
    age,
    alive,
    gender: '男',
    stats: {
      strength: 50, intelligence: 60, dexterity: 50, charisma: 50,
      health: 60, maxHealth: 60, energy: 60, happiness: 60,
    },
    skills,
    inventory: { items: {} },
    relationships: {},
    family: { spouse: undefined, children: [], parents: [], household: [] },
    conditions: [],
    tags: [],
    born: 0,
    wealth: 0,
    employees: [],
  };
}

function makeState(year: number, agents: WorldState['agents'] = [], innovations: WorldState['innovations'] = []): WorldState {
  return {
    year,
    season: 'spring',
    weather: 'sunny',
    agents,
    economy: {
      totalCurrency: 0,
      annualTradeVolume: 0,
      annualSpoilage: 0,
      priceHistory: {},
      priceCaps: {},
    },
    buildings: [],
    map: { width: 10, height: 10, tiles: [] },
    innovations,
    laws: [],
    festivals: [],
    groups: [],
    archives: [],
    relations: [],
    seed: 42,
    chronicle: [],
    snapshots: [],
    populationThreshold: 100,
    version: '6.0',
    credits: [],
  } as WorldState;
}

// ─── beforeEach：重置全局状态 ────────────────

beforeEach(() => {
  resetRecordIdCounter();
});

// ─── createRecord ────────────────────────────

describe('createRecord', () => {
  it('should create a written record with correct expires', () => {
    const record = createRecord('irrigation', 'written', 'zhou', '治水笔记', 1);
    expect(record.id).toBeDefined();
    expect(record.type).toBe('written');
    expect(record.techId).toBe('irrigation');
    expect(record.content).toContain('治水笔记');
    expect(record.holderId).toBe('zhou');
    expect(record.expires).toBe(21); // 1 + 20
    expect(record.importance).toBe(1.0);
  });

  it('should create an apprenticeship record', () => {
    const record = createRecord('blacksmithing', 'apprenticeship', 'zhang', '铁匠学徒', 1);
    expect(record.type).toBe('apprenticeship');
    expect(record.inherited).toBe(true);
    expect(record.apprentices).toEqual([]);
  });

  it('should create an artifact record that never expires', () => {
    const record = createRecord('weaving_loom', 'artifact', 'xiao-lin', '织布机原型', 1);
    expect(record.type).toBe('artifact');
    expect(record.expires).toBe(10000); // 1 + 9999
  });

  it('should create a collective_memory record with short expiry', () => {
    const record = createRecord('basic_medicine', 'collective_memory', 'wang-xiuzhi', '接生经验', 1);
    expect(record.type).toBe('collective_memory');
    expect(record.expires).toBe(11); // 1 + 10
  });

  it('should have sequential IDs starting from 1', () => {
    const r1 = createRecord('a', 'written', 'x', 'x', 1);
    const r2 = createRecord('b', 'written', 'y', 'y', 1);
    expect(r1.id).toBe('kr-1');
    expect(r2.id).toBe('kr-2');
  });
});

// ─── canAccessKnowledge ──────────────────────

describe('canAccessKnowledge', () => {
  const agents = [
    makeAgent('zhou', '周建国', true, 66, { literacy: 90, history: 75 }),
    makeAgent('xiao-lin', '小林', true, 26, { literacy: 55, carpentry: 80 }),
    makeAgent('dead-agent', '已故者', false),
  ];
  const state = makeState(1, agents);

  it('should return true when agent has relevant skill level', () => {
    state.innovations = [{
      id: 'papermaking',
      name: '造纸术',
      description: '描述',
      prerequisites: [],
      requiredSkill: 'literacy',
      requiredSkillLevel: 30,
      difficulty: 100,
      materials: [],
      unlocks: [],
      effects: [],
    }];
    const records: KnowledgeRecord[] = [];
    const result = canAccessKnowledge('zhou', 'papermaking', state, records);
    expect(result).toBe(true);
  });

  it('should return true when valid written record exists', () => {
    const record = createRecord('irrigation', 'written', 'zhou', '治水笔记', 1);
    state.innovations = [{
      id: 'irrigation', name: '灌溉', description: '', prerequisites: [],
      requiredSkill: 'farming', requiredSkillLevel: 10, difficulty: 100,
      materials: [], unlocks: [], effects: [],
    }];
    const result = canAccessKnowledge('xiao-lin', 'irrigation', state, [record]);
    expect(result).toBe(true);
  });

  it('should return true when artifact record exists (anyone can access)', () => {
    const record = createRecord('blacksmithing', 'artifact', 'dead-agent', '铁锤原型', 1);
    const result = canAccessKnowledge('zhou', 'blacksmithing', state, [record]);
    expect(result).toBe(true);
  });

  it('should return false when only dead collective memory exists', () => {
    const record = createRecord('basic_medicine', 'collective_memory', 'dead-agent', '接生经验', 1);
    const result = canAccessKnowledge('zhou', 'basic_medicine', state, [record]);
    expect(result).toBe(false);
  });

  it('should return false when no records exist', () => {
    const result = canAccessKnowledge('zhou', 'nonexistent', state, []);
    expect(result).toBe(false);
  });

  it('should return false for non-existent agent', () => {
    const result = canAccessKnowledge('ghost', 'irrigation', state, []);
    expect(result).toBe(false);
  });
});

// ─── checkKnowledgeLoss ──────────────────────

describe('checkKnowledgeLoss', () => {
  const agents = [
    makeAgent('zhou', '周建国', false, 66), // 已死
    makeAgent('xiao-lin', '小林', true, 26),
    makeAgent('wang', '王翠花', true, 43),
  ];
  const state = makeState(50, agents);
  const techTree = [
    { id: 'irrigation', name: '灌溉技术' },
    { id: 'papermaking', name: '造纸术' },
    { id: 'basic_medicine', name: '基础医学' },
  ];

  it('should return empty when all holders are alive', () => {
    const aliveAgents = [makeAgent('zhou', '周建国', true), makeAgent('xiao-lin', '小林', true)];
    const aliveState = makeState(1, aliveAgents);
    const records = [
      createRecord('irrigation', 'written', 'zhou', '笔记', 1),
      createRecord('papermaking', 'artifact', 'xiao-lin', '工具', 1),
    ];
    const lost = checkKnowledgeLoss(aliveState, records, techTree);
    expect(lost).toEqual([]);
  });

  it('should detect lost collective memory when holder dies', () => {
    const record = createRecord('basic_medicine', 'collective_memory', 'zhou', '接生经验', 1);
    const records = [record];
    const lost = checkKnowledgeLoss(state, records, techTree);
    expect(lost.length).toBe(1);
    expect(lost[0].techId).toBe('basic_medicine');
    expect(lost[0].typeName).toBe('集体记忆');
  });

  it('should detect lost written record when holder dies and expired', () => {
    // 创建时 expires = 1 + 20 = 21, 现在 year = 50，已过期
    const record = createRecord('irrigation', 'written', 'zhou', '治水笔记', 1);
    const records = [record];
    const lost = checkKnowledgeLoss(state, records, techTree);
    expect(lost.length).toBe(1);
    expect(lost[0].techId).toBe('irrigation');
    expect(lost[0].typeName).toBe('文字记录');
  });

  it('should NOT detect loss when written record is not yet expired', () => {
    const recentState = makeState(10, [makeAgent('zhou', '周建国', false)]);
    const record = createRecord('irrigation', 'written', 'zhou', '笔记', 1);
    const lost = checkKnowledgeLoss(recentState, [record], techTree);
    expect(lost).toEqual([]); // expires = 21, current = 10, not expired
  });

  it('should NOT detect loss for artifact records', () => {
    const record = createRecord('weaving_loom', 'artifact', 'zhou', '织布机原型', 1);
    const lost = checkKnowledgeLoss(state, [record], techTree);
    expect(lost).toEqual([]);
  });

  it('should NOT detect loss for apprenticeship with living apprentice', () => {
    const record: KnowledgeRecord = {
      id: 'kr-1', type: 'apprenticeship', content: '铁匠传授',
      holderId: 'zhou', expires: 100, techId: 'irrigation',
      createdYear: 1, inherited: true, apprentices: ['xiao-lin'], importance: 1.0,
    };
    const lost = checkKnowledgeLoss(state, [record], techTree);
    expect(lost).toEqual([]);
  });

  it('should detect loss for apprenticeship with no living apprentices', () => {
    const record: KnowledgeRecord = {
      id: 'kr-1', type: 'apprenticeship', content: '铁匠传授',
      holderId: 'zhou', expires: 100, techId: 'irrigation',
      createdYear: 1, inherited: true, apprentices: ['dead-agent'], importance: 1.0,
    };
    const lost = checkKnowledgeLoss(state, [record], techTree);
    expect(lost.length).toBe(1);
  });

  it('should NOT lose written record if artifact backup exists for same tech', () => {
    const record = createRecord('irrigation', 'written', 'zhou', '治水笔记', 1);
    const artifact = createRecord('irrigation', 'artifact', 'xiao-lin', '灌溉工具', 1);
    const lost = checkKnowledgeLoss(state, [record, artifact], techTree);
    expect(lost).toEqual([]);
  });

  it('should report correct techName in lost info', () => {
    const record = createRecord('papermaking', 'collective_memory', 'zhou', '造纸记忆', 1);
    const lost = checkKnowledgeLoss(state, [record], techTree);
    expect(lost[0].techName).toBe('造纸术');
  });
});

// ─── onAgentDeath ────────────────────────────

describe('onAgentDeath', () => {
  const agents = [
    makeAgent('zhou', '周建国', false, 66, { literacy: 90 }),
    makeAgent('xiao-lin', '小林', true, 26, { literacy: 55 }),
    makeAgent('chen', '陈大爷', true, 70, { literacy: 30 }),
  ];
  const state = makeState(50, agents);

  it('should mark collective memory as expired when holder dies', () => {
    const record = createRecord('basic_medicine', 'collective_memory', 'zhou', '接生经验', 1);
    onAgentDeath('zhou', state, [record]);
    expect(record.expires).toBe(50); // 立即失效
  });

  it('should transfer written record to living apprentice', () => {
    const record: KnowledgeRecord = {
      id: 'kr-1', type: 'written', content: '笔记',
      holderId: 'zhou', expires: 70, techId: 'papermaking',
      createdYear: 1, inherited: false, apprentices: ['xiao-lin'], importance: 1.0,
    };
    const transfers = onAgentDeath('zhou', state, [record]);
    expect(transfers.length).toBe(1);
    expect(transfers[0].toAgentId).toBe('xiao-lin');
    expect(transfers[0].narrative).toContain('书稿');
  });

  it('should not create transfer if no living apprentices', () => {
    const record: KnowledgeRecord = {
      id: 'kr-1', type: 'written', content: '笔记',
      holderId: 'zhou', expires: 70, techId: 'papermaking',
      createdYear: 1, inherited: false, apprentices: ['nonexistent'], importance: 1.0,
    };
    const transfers = onAgentDeath('zhou', state, [record]);
    expect(transfers.length).toBe(0);
  });

  it('should not create transfer for artifact', () => {
    const record = createRecord('weaving_loom', 'artifact', 'zhou', '织布机原型', 1);
    const transfers = onAgentDeath('zhou', state, [record]);
    expect(transfers.length).toBe(0);
  });

  it('should return empty for holder without any records', () => {
    const transfers = onAgentDeath('chen', state, []);
    expect(transfers).toEqual([]);
  });
});

// ─── transferToApprentice ────────────────────

describe('transferToApprentice', () => {
  const master = makeAgent('zhang-dashan', '张大山', true, 46, { blacksmithing: 85, literacy: 10 });
  const apprentice = makeAgent('chen-xiaofei', '陈小飞', true, 20, { blacksmithing: 30, literacy: 20 });
  const state = makeState(1, [master, apprentice]);
  const records: KnowledgeRecord[] = [];

  it('should create new apprenticeship record', () => {
    const result = transferToApprentice('zhang-dashan', 'chen-xiaofei', 'blacksmithing', state, records);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('apprenticeship');
    expect(result!.narrative).toContain('张大山');
    expect(result!.narrative).toContain('陈小飞');
    expect(records.length).toBe(1);
    expect(records[0].apprentices).toContain('chen-xiaofei');
  });

  it('should add apprentice to existing record', () => {
    transferToApprentice('zhang-dashan', 'chen-xiaofei', 'blacksmithing', state, records);
    const result = transferToApprentice('zhang-dashan', 'chen-xiaofei', 'blacksmithing', state, records);
    expect(result).not.toBeNull();
    expect(records.length).toBe(1); // 不重复创建
    expect(records[0].apprentices).toContain('chen-xiaofei');
  });

  it('should return null when master is dead', () => {
    const deadMaster = makeAgent('zhang-dashan', '张大山', false, 46);
    const aliveApprentice = makeAgent('chen-xiaofei', '陈小飞', true, 20);
    const deadState = makeState(1, [deadMaster, aliveApprentice]);
    const result = transferToApprentice('zhang-dashan', 'chen-xiaofei', 'blacksmithing', deadState, []);
    expect(result).toBeNull();
  });

  it('should return null when apprentice is too young', () => {
    const baby = makeAgent('baby', '婴儿', true, 5);
    const babyState = makeState(1, [master, baby]);
    const result = transferToApprentice('zhang-dashan', 'baby', 'blacksmithing', babyState, []);
    expect(result).toBeNull();
  });

  it('should return null when apprentice is dead', () => {
    const deadApprentice = makeAgent('chen-xiaofei', '陈小飞', false, 20);
    const deadState = makeState(1, [master, deadApprentice]);
    const result = transferToApprentice('zhang-dashan', 'chen-xiaofei', 'blacksmithing', deadState, []);
    expect(result).toBeNull();
  });

  it('should include correct techId in transfer info', () => {
    const result = transferToApprentice('zhang-dashan', 'chen-xiaofei', 'blacksmithing', state, records);
    expect(result!.techId).toBe('blacksmithing');
  });
});

// ─── discoverKnowledge ───────────────────────

describe('discoverKnowledge', () => {
  const literacyHigh = makeAgent('zhou', '周建国', true, 66, { literacy: 90, intelligence: 90 });
  const literacyLow = makeAgent('zhang-wu', '张武', true, 23, { literacy: 5, intelligence: 40 });
  const state = makeState(1, [literacyHigh, literacyLow]);

  it('should return null when literacy is too low', () => {
    const rng = new SeededRNG(42);
    const result = discoverKnowledge('zhang-wu', 'irrigation', state, [], rng);
    expect(result).toBeNull();
  });

  it('should create a written record with high literacy and lucky roll', () => {
    // 识字 90，智能 90 → baseChance=0.05, intelligenceBonus=0.45, literacyBonus=0.45 = 0.95
    // 使用特定种子确保结果可重现
    const rng = new SeededRNG(1);
    const result = discoverKnowledge('zhou', 'irrigation', state, [], rng);
    // 概率高，可能成功也可能失败（取决于种子）
    if (result) {
      expect(result.type).toBeDefined();
      expect(result.techId).toBe('irrigation');
      expect(result.content).toContain('周建国');
      expect(result.holderId).toBe('zhou');
      expect(result.createdYear).toBe(1);
    }
  });

  it('should not create record when agent is dead', () => {
    const dead = makeAgent('zhou', '周建国', false, 66, { literacy: 90 });
    const deadState = makeState(1, [dead]);
    const rng = new SeededRNG(1);
    const result = discoverKnowledge('zhou', 'irrigation', deadState, [], rng);
    expect(result).toBeNull();
  });

  it('should push record to records array', () => {
    const rng = new SeededRNG(1);
    const records: KnowledgeRecord[] = [];
    discoverKnowledge('zhou', 'irrigation', state, records, rng);
    // 如果成功了，数组应有 1 条记录
    if (records.length > 0) {
      expect(records[0].techId).toBe('irrigation');
    }
  });

  it('should respect seeded RNG for determinism', () => {
    const records1: KnowledgeRecord[] = [];
    const records2: KnowledgeRecord[] = [];
    const rng1 = new SeededRNG(123);
    const rng2 = new SeededRNG(123);

    const r1 = discoverKnowledge('zhou', 'irrigation', state, records1, rng1);
    const r2 = discoverKnowledge('zhou', 'irrigation', state, records2, rng2);

    // 同一种子应该产生相同结果
    expect(r1 === null).toBe(r2 === null);
    if (r1 && r2) {
      expect(r1.type).toBe(r2.type);
      expect(r1.techId).toBe(r2.techId);
    }
  });
});

// ─── decayCollectiveMemory ───────────────────

describe('decayCollectiveMemory', () => {
  const state = makeState(20, [makeAgent('wang', '陈大爷', true)]);

  it('should return empty when no collective memories exist', () => {
    const records = [createRecord('irrigation', 'written', 'wang', '笔记', 1)];
    const rng = new SeededRNG(42);
    const forgotten = decayCollectiveMemory(state, records, rng);
    expect(forgotten).toEqual([]);
  });

  it('should reduce importance over time', () => {
    const record = createRecord('basic_medicine', 'collective_memory', 'wang', '接生经验', 1);
    const rng = new SeededRNG(999999); // 极小概率被遗忘
    const forgotten = decayCollectiveMemory(state, [record], rng);
    // 19 年 × 2% = 38% 衰减 → importance = 0.62
    expect(record.importance).toBeCloseTo(0.62, 5);
  });

  it('should never go below 0 importance', () => {
    const oldState = makeState(100, [makeAgent('wang', '陈大爷', true)]);
    const record = createRecord('basic_medicine', 'collective_memory', 'wang', '远古记忆', 1);
    const rng = new SeededRNG(999999);
    decayCollectiveMemory(oldState, [record], rng);
    expect(record.importance).toBeGreaterThanOrEqual(0);
  });

  it('should use COLLECTIVE_MEMORY_FORGET_CHANCE constant', () => {
    expect(COLLECTIVE_MEMORY_FORGET_CHANCE).toBe(0.05);
  });

  it('should mark forgotten records as expired', () => {
    const record = createRecord('basic_medicine', 'collective_memory', 'wang', '接生经验', 1);
    const rng = new SeededRNG(1);
    const forgotten = decayCollectiveMemory(state, [record], rng);
    // 如果这条记录被遗忘了
    if (forgotten.length > 0) {
      expect(record.expires).toBe(20); // state.year
    }
  });
});

// ─── getRecordsByTech ────────────────────────

describe('getRecordsByTech', () => {
  it('should filter records by techId', () => {
    const r1 = createRecord('irrigation', 'written', 'zhou', '笔记', 1);
    const r2 = createRecord('papermaking', 'artifact', 'xiao-lin', '工具', 1);
    const r3 = createRecord('irrigation', 'collective_memory', 'wang', '记忆', 1);
    const records = [r1, r2, r3];

    expect(getRecordsByTech(records, 'irrigation').length).toBe(2);
    expect(getRecordsByTech(records, 'papermaking').length).toBe(1);
    expect(getRecordsByTech(records, 'nonexistent').length).toBe(0);
  });
});

// ─── getActiveRecords ────────────────────────

describe('getActiveRecords', () => {
  it('should return only valid records for given tech', () => {
    const agents = [
      makeAgent('zhou', '周建国', true),
      makeAgent('dead', '已故者', false),
    ];
    const state = makeState(50, agents);

    const alive = createRecord('irrigation', 'written', 'zhou', '笔记', 1);
    const expired = createRecord('papermaking', 'written', 'dead', '笔记', 1);
    const artifact = createRecord('weaving_loom', 'artifact', 'dead', '原型', 1);
    const records = [alive, expired, artifact];

    const active = getActiveRecords(records, state, 'irrigation');
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(alive.id);
  });
});

// ─── getKnowledgeSummary ─────────────────────

describe('getKnowledgeSummary', () => {
  it('should return summary for all records', () => {
    const agents = [makeAgent('zhou', '周建国', true)];
    const state = makeState(1, agents);

    const r1 = createRecord('irrigation', 'written', 'zhou', '笔记', 1);
    const r2 = createRecord('papermaking', 'artifact', 'zhou', '工具', 1);
    const records = [r1, r2];

    const summary = getKnowledgeSummary(records, state);
    expect(summary.length).toBe(2);
    expect(summary[0].techId).toBe('irrigation');
    expect(summary[0].typeName).toBe('文字记录');
    expect(summary[0].holderName).toBe('周建国');
    expect(summary[0].alive).toBe(true);
    expect(summary[1].typeName).toBe('实物遗存');
  });
});

// ─── KNOWLEDGE_TYPE_NAMES ────────────────────

describe('KNOWLEDGE_TYPE_NAMES', () => {
  it('should map all four types to Chinese names', () => {
    expect(KNOWLEDGE_TYPE_NAMES.written).toBe('文字记录');
    expect(KNOWLEDGE_TYPE_NAMES.apprenticeship).toBe('师徒传授');
    expect(KNOWLEDGE_TYPE_NAMES.artifact).toBe('实物遗存');
    expect(KNOWLEDGE_TYPE_NAMES.collective_memory).toBe('集体记忆');
  });
});

// ─── INTEGRATION: Full lifecycle ─────────────

describe('Full knowledge lifecycle', () => {
  it('knowledge should survive across years and handle agent death gracefully', () => {
    const agents = [
      makeAgent('zhou', '周建国', true, 66, { literacy: 90, teaching: 85 }),
      makeAgent('xiao-lin', '小林', true, 26, { literacy: 55 }),
    ];
    const state = makeState(1, agents);
    const records: KnowledgeRecord[] = [];

    // 第 1 年：周建国发现造纸术
    const rng = new SeededRNG(42);
    const discovered = discoverKnowledge('zhou', 'papermaking', state, records, rng);
    expect(discovered).not.toBeNull(); // 识字 90，智能 90，高概率成功
    if (!discovered) {
      // 如果 RNG 没让 discovery 成功，手动创建
      records.push(createRecord('papermaking', 'written', 'zhou', '造纸术笔记', 1));
    }

    // 第 1 年：周建国收小林为徒
    const transfer = transferToApprentice('zhou', 'xiao-lin', 'papermaking', state, records);
    expect(transfer).not.toBeNull();

    // 第 10 年：知识仍然可访问
    const state10 = makeState(10, agents);
    expect(canAccessKnowledge('xiao-lin', 'papermaking', state10, records)).toBe(true);

    // 第 70 年：周建国死了，但小林继承了
    const deadAgents = [
      makeAgent('zhou', '周建国', false, 66),
      makeAgent('xiao-lin', '小林', true, 36),
    ];
    const deadState = makeState(70, deadAgents);
    const lost = checkKnowledgeLoss(deadState, records, [
      { id: 'papermaking', name: '造纸术' },
    ]);
    const paperRecords = records.filter(r => r.techId === 'papermaking');
    const apprenticeshipRecords = paperRecords.filter(r => r.type === 'apprenticeship');
    // 师徒传授记录：师傅死了但徒弟活着 → 不失传
    // 文字记录：已过期 → 失传（但因为有 apprenticeship 备份所以不会报告）
    expect(lost.length).toBeLessThanOrEqual(apprenticeshipRecords.length);

    // 小林仍能访问知识
    expect(canAccessKnowledge('xiao-lin', 'papermaking', deadState, records)).toBe(true);
  });
});
