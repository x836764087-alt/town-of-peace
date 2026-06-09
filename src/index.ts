/**
 * 桃源镇 — 文明模拟器 主入口（CLI）
 * 按飞书文档 v6.0 重建。
 */
import * as fs from 'fs';
import * as path from 'path';

import { WorldEngine } from './core/world-engine.js';
import type { WorldState, AgentState, ChronicleEntry, Season, WeatherType } from './core/types.js';
import type { CharacterConfig } from './config/characters.js';
import { CHARACTERS } from './config/characters.js';
import { EVENTS, EventBus } from './core/event-bus.js';
import { ITEMS } from './config/items.js';
import { EVENTS as GAME_EVENTS } from './config/events-pool.js';
import { SeededRNG } from './core/rng.js';
import { WORLD } from './config/world.js';
import { LifecycleSystem, getLifeStage, LIFE_STAGE_NAMES } from './agents/lifecycle-system.js';
import { TradeSystem } from './agents/trade-system.js';
import { BuildingSystem } from './world/buildings.js';
import { DialogueGenerator } from './agents/dialogue-topics.js';
import { LawSystem } from './society/laws.js';
import { ChronicleGenerator } from './narrative/chronicle-generator.js';
import { RumorMill } from './agents/rumor-mill.js';
import { GroupSystem } from './agents/group-system.js';
import { TownEvents } from './agents/town-events.js';
import { TechChecker } from './innovation/tech-checker.js';
import { DiscoveryEvents } from './innovation/discoveries.js';
import { FestivalSystem } from './society/festivals.js';
import { ArchiveSystem } from './society/archives.js';
import { EventEmitter, type SubsystemEvents } from './narrative/event-emitter.js';
import { NarrativeTemplates } from './narrative/templates.js';

const projectRoot = process.cwd();
const saveDir = path.join(projectRoot, 'data', 'saves');

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_NAMES: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const WEATHER_NAMES: Record<WeatherType, string> = { sunny: '晴天', rainy: '雨天', windy: '起风', snowy: '下雪', extreme: '极端' };

// ─── 中文姓名生成 ──────────────────────────

const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳丰鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄穆萧姚邵汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公'.split('');
const GIVEN_NAMES = '大、小、文、明、华、国、强、伟、芳、娜、秀、英、敏、静、丽、涛、军、杰、勇、磊、刚、平、波、辉、亮、志、安、宁、斌、健、兰、香、桂、珍、娥、花、霞、雪、月'.split('、');

function generateName(rng: SeededRNG): string {
  const surname = rng.pick(SURNAMES);
  const given = rng.pick(GIVEN_NAMES);
  return surname + given;
}

function surnameOf(name: string): string { return name.charAt(0); }

function isTeenage(age: number): boolean { return age >= 13 && age < 18; }
function isAdult(age: number): boolean { return age >= 18; }
function isFertileFemale(gender: string, age: number): boolean {
  return gender === '女' && age >= WORLD.FERTILITY_MIN_AGE && age <= WORLD.FERTILITY_MAX_AGE;
}
function isFertileMale(gender: string, age: number): boolean {
  return gender === '男' && age >= 18 && age <= 60;
}

// ─── CLI 参数解析 ────────────────────────────

interface CliArgs { new: boolean; seed: number; years: number; summary: boolean; list: boolean; cont: boolean; replay: boolean; }

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = { new: false, seed: 0, years: 10, summary: false, list: false, cont: false, replay: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--new') args.new = true;
    else if (a === '--continue') args.cont = true;
    else if (a === '--summary') args.summary = true;
    else if (a === '--list') args.list = true;
    else if (a === '--replay') args.replay = true;
    else if (a === '--seed' && i + 1 < argv.length) args.seed = parseInt(argv[++i], 10);
    else if (a === '--years' && i + 1 < argv.length) args.years = parseInt(argv[++i], 10);
  }
  if (!args.seed) args.seed = Math.floor(Date.now() / 1000);
  return args;
}

function listSaves(): void {
  if (!fs.existsSync(saveDir)) { console.log('暂无存档。'); return; }
  const files = fs.readdirSync(saveDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) { console.log('暂无存档。'); return; }
  console.log('存档列表：');
  for (const f of files.sort()) {
    const stat = fs.statSync(path.join(saveDir, f));
    console.log(`  ${f}  (${(stat.size / 1024).toFixed(1)} KB)`);
  }
}

// ─── 人口阶段 ────────────────────────────────

function populationPhase(state: WorldState, rng: SeededRNG): string[] {
  const events: string[] = [];
  const isYearStart = state.season === 'spring';

  // ═══ 第一轮：生育检查 ═══（所有季节可用，使用当前年龄）
  for (const agent of state.agents) {
    if (!agent.alive) continue;

    if (isFertileFemale(agent.gender, agent.age) && agent.family.spouse) {
      const spouse = state.agents.find(a => a.id === agent.family.spouse);
      if (spouse?.alive && isFertileMale(spouse.gender, spouse.age)) {
        if (rng.chance(WORLD.BASE_FERTILITY)) {
          const motherDies = rng.chance(WORLD.CHILDBIRTH_MORTALITY);
          const babySurvives = rng.chance(WORLD.INFANT_SURVIVAL_RATE);

          if (motherDies) {
            agent.alive = false;
            agent.deathYear = state.year;
            agent.causeOfDeath = '难产';
            EventBus.emit(EVENTS.AGENT_DIED, { agentId: agent.id, cause: '难产' });
            events.push(`${agent.name}在分娩${babySurvives ? '' : '中母婴'}不幸离世。`);
          }

          if (babySurvives) {
            const givenName = rng.pick(GIVEN_NAMES);
            const surName = surnameOf(spouse.name) || givenName; // 从父姓
            const baby: AgentState = {
              id: `baby-${state.year}-${rng.int(1000, 9999)}`,
              name: surName + givenName,
              title: '',
              age: 0, alive: true,
              gender: rng.pick(['男', '女']),
              stats: { strength: 30, intelligence: 30, dexterity: 30, charisma: 30, health: 50, maxHealth: 50, energy: 50, happiness: 70 },
              skills: {},
              inventory: { items: {} },
              relationships: {},
              family: { spouse: undefined, children: [], parents: [spouse.id, agent.id], household: [] },
              conditions: [], memories: [],
              born: state.year,
              tags: ['child'],
              initialBuilding: undefined,
              wealth: 0,
              employees: [],
            };
            state.agents.push(baby);
            spouse.family.children.push(baby.id);
            agent.family.children.push(baby.id);
            EventBus.emit(EVENTS.AGENT_BORN, { childId: baby.id, fatherId: spouse.id, motherId: agent.id });
            events.push(`${agent.name}（${agent.title ?? ''}）诞下一${baby.gender === '男' ? '子' : '女'}，取名「${baby.name}」。`);
          }
        }
      }
    }
  }

  // ═══ 第二轮：年龄增长与死亡判定 ═══（仅在春季）
  if (isYearStart) {
    for (const agent of state.agents) {
      if (!agent.alive) continue;

      agent.age += 1;

      if (agent.age > WORLD.MAX_AGE) {
        const deathChance = Math.min(WORLD.BASE_MORTALITY_RATE + (agent.age - WORLD.MAX_AGE) * 0.03, 0.8);
        if (rng.chance(deathChance)) {
          agent.alive = false;
          agent.deathYear = state.year;
          agent.causeOfDeath = '寿终';
          EventBus.emit(EVENTS.AGENT_DIED, { agentId: agent.id, cause: '寿终' });
          events.push(`${agent.name}（${agent.title}）享年 ${agent.age} 岁，安详离世。`);
        }
      }
    }
  }

  // 移民触发（所有季节）
  const aliveCount = state.agents.filter(a => a.alive).length;
  if (WORLD.ENABLE_IMMIGRATION && aliveCount < WORLD.POPULATION_CAP && rng.chance(WORLD.IMMIGRATION_CHANCE)) {
    const count = rng.int(WORLD.IMMIGRANTS_MIN, WORLD.IMMIGRANTS_MAX);
    const existingSurnames = state.agents.filter(a => a.alive).map(a => surnameOf(a.name));
    for (let i = 0; i < count; i++) {
      let immigrantSurname: string;
      do { immigrantSurname = rng.pick(SURNAMES); } while (existingSurnames.includes(immigrantSurname) && existingSurnames.length < SURNAMES.length);
      existingSurnames.push(immigrantSurname);

      const gender = rng.pick(['男', '女']);
      const age = rng.int(18, 40);
      const immigrant: AgentState = {
        id: `imm-${state.year}-${rng.int(1000, 9999)}`,
        name: immigrantSurname + rng.pick(GIVEN_NAMES),
        title: '',
        age,
        alive: true,
        gender,
        stats: {
          strength: rng.int(40, 80), intelligence: rng.int(40, 80),
          dexterity: rng.int(40, 80), charisma: rng.int(40, 80),
          health: rng.int(50, 80), maxHealth: 80, energy: rng.int(50, 80), happiness: rng.int(50, 80),
        },
        skills: { farming: rng.int(20, 50) },
        inventory: { items: { rice: rng.int(3, 8) } },
        relationships: {},
        family: { spouse: undefined, children: [], parents: [], household: [] },
        conditions: [], memories: [],
        born: state.year,
        tags: ['immigrant'],
        initialBuilding: undefined,
        wealth: rng.int(30, 100),
        employees: [],
      };
      state.agents.push(immigrant);
      events.push(`${immigrant.name}迁入桃源镇谋生。`);
    }
  }

  return events;
}

// ─── 建筑衰败阶段 ──────────────────────────────

function buildingPhase(state: WorldState, rng: SeededRNG): string[] {
  const bs = new BuildingSystem(state, rng);
  return bs.processDecay();
}

// ─── 对话生成阶段 ──────────────────────────────

function dialoguePhase(state: WorldState, rng: SeededRNG): string[] {
  const dg = new DialogueGenerator(state, rng);
  return dg.generateSocialInteractions();
}

// ─── 法律阶段 ────────────────────────────────

function lawPhase(state: WorldState, rng: SeededRNG): string[] {
  const ls = new LawSystem(state, rng);
  return ls.processAll();
}

// ─── 编年史阶段 ──────────────────────────────

function chroniclePhase(state: WorldState, rng: SeededRNG, isYearEnd: boolean): string[] {
  const cg = new ChronicleGenerator(state, rng);
  const events: string[] = [];

  // 每季生成一条季节叙事
  const seasonEntry = cg.generateSeasonEntry();
  events.push(seasonEntry.content);

  // 年末生成年度总结
  if (isYearEnd) {
    const yearSummary = cg.generateYearSummary();
    events.push(yearSummary.content);
  }

  return events;
}

// ─── 经济阶段：按飞书文档职业产出 ────────────

function economicPhase(state: WorldState, rng: SeededRNG): string[] {
  const trade = new TradeSystem(state, rng);
  const events = trade.processEconomicPhase();

  // 技能提升（10% 概率）
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    if (rng.chance(0.10)) {
      const skillKeys = Object.keys(agent.skills);
      if (skillKeys.length > 0) {
        const skill = rng.pick(skillKeys);
        agent.skills[skill] = Math.min(100, (agent.skills[skill] ?? 0) + 1);
      }
    }
  }

  return events;
}

// ─── 社交阶段 ────────────────────────────────

function socialPhase(state: WorldState, rng: SeededRNG): string[] {
  const events: string[] = [];
  const adults = state.agents.filter(a => a.alive && a.age >= 16);
  if (adults.length < 2) return events;

  // 随机关系调整
  for (let i = 0; i < 3; i++) {
    const a = rng.pick(adults);
    const b = rng.pick(adults.filter(x => x.id !== a.id));
    if (!b) continue;
    const adj = rng.int(-3, 3);
    const current = a.relationships[b.id] ?? 0;
    a.relationships[b.id] = Math.max(-100, Math.min(100, current + adj));
  }

  // 婚配
  for (const a of adults) {
    if (a.family.spouse || a.age < 18) continue;
    for (const b of adults) {
      if (b.family.spouse || a.id === b.id || a.gender === b.gender) continue;
      if (Math.abs(a.age - b.age) > 15) continue;
      const rel = a.relationships[b.id] ?? (b.relationships[a.id] ?? 30);
      if (rel > 60 && rng.chance(0.3)) {
        const husband = a.gender === '男' ? a : b;
        const wife = a.gender === '女' ? a : b;
        husband.family.spouse = wife.id;
        wife.family.spouse = husband.id;
        EventBus.emit(EVENTS.AGENT_MARRIED, { husbandId: husband.id, wifeId: wife.id });
        events.push(`${husband.name}与${wife.name}喜结连理！`);
        break;
      }
    }
  }

  return events;
}

// ─── 生命周期阶段 ─────────────────────────────

function lifecyclePhase(state: WorldState, rng: SeededRNG): string[] {
  const system = new LifecycleSystem(state, rng);
  return system.processLifecycle();
}

// ─── 叙事阶段 ────────────────────────────────

function narrativePhase(state: WorldState): string[] {
  const alive = state.agents.filter(a => a.alive);
  const seasonName = SEASON_NAMES[state.season];
  const weatherName = WEATHER_NAMES[state.weather] ?? state.weather;
  const lines: string[] = [];

  lines.push(`${seasonName}到。${weatherName}。桃源镇现有 ${alive.length} 位居民。`);

  const died = state.agents.filter(a => !a.alive && a.deathYear === state.year);
  for (const d of died) {
    // 只记录新离世（死亡年精确到当年不做重复过滤——但 narrativePhase 每季都会触发，所以只在冬季记录）
    if (state.season !== 'winter') continue;
    lines.push(`${d.name}（${d.title}）于本年逝世，${d.causeOfDeath ?? '享年'} ${d.age} 岁。`);
  }

  const bornInYear = state.agents.filter(a => a.born === state.year);
  if (state.season === 'winter') {
    for (const b of bornInYear) {
      if (b.age === 0) {
        lines.push(`新生儿「${b.name}」呱呱坠地。`);
      }
    }
  }

  return lines;
}

// ─── 年度总结 ────────────────────────────────

function formatAnnualSummary(state: WorldState): string {
  const alive = state.agents.filter(a => a.alive);
  const weatherName = WEATHER_NAMES[state.weather] ?? state.weather;
  return [
    `╔══════════════════════════════╗`,
    `║  桃源镇 · 第 ${String(state.year).padEnd(3)} 年              ║`,
    `╚══════════════════════════════╝`,
    `人口：${alive.length} 人`,
    `交易额：${state.economy.annualTradeVolume} 文`,
    `建筑：${state.buildings?.length ?? 0} 座`,
    `技术：已研发 ${state.innovations?.length ?? 0} 项`,
    `天气：${weatherName}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');
}

// ─── 存档 ────────────────────────────────────

function saveState(state: WorldState): void {
  if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
  const savePath = path.join(saveDir, 'last-save.json');
  fs.writeFileSync(savePath, JSON.stringify(state, null, 2));
  const backup = path.join(saveDir, `backup-year-${state.year}.json`);
  fs.writeFileSync(backup, JSON.stringify(state, null, 2));
  const backups = fs.readdirSync(saveDir).filter(f => f.startsWith('backup-'));
  if (backups.length > 5) {
    backups.sort().slice(0, backups.length - 5).forEach(f => fs.unlinkSync(path.join(saveDir, f)));
  }
}

function loadState(): WorldState | null {
  const savePath = path.join(saveDir, 'last-save.json');
  if (!fs.existsSync(savePath)) return null;
  return JSON.parse(fs.readFileSync(savePath, 'utf-8')) as WorldState;
}

// ─── 新模块 Phase 函数 ─────────────────────

function rumorPhase(state: WorldState, rng: SeededRNG, contextEvents: string[]): string[] {
  const rm = new RumorMill(state, rng);
  const rumors = rm.seedRumors(contextEvents);
  const spread = rm.processSpread();
  return [...rumors, ...spread];
}

function groupPhase(state: WorldState, rng: SeededRNG): string[] {
  const gs = new GroupSystem(state, rng);
  return gs.processGroups();
}

function townEventPhase(state: WorldState, rng: SeededRNG): string[] {
  const te = new TownEvents(state, rng);
  return te.processEvents();
}

function innovationPhase(state: WorldState, rng: SeededRNG): string[] {
  const checker = new TechChecker(state);
  const unlocked = checker.getUnlockableNodes();
  const events: string[] = [];
  for (const node of unlocked) {
    if (rng.chance(0.2)) {
      state.innovations.push({ id: node.id, name: node.name, description: node.description, prerequisites: [], requiredSkill: '', requiredSkillLevel: 0, difficulty: 0, materials: [], unlocks: [], effects: [], discoveredYear: state.year });
      events.push(`「${node.name}」被成功研发！`);
    }
  }
  return events;
}

function discoveryPhase(state: WorldState, rng: SeededRNG): string[] {
  const de = new DiscoveryEvents(state, rng);
  return de.processDiscoveries();
}

function festivalPhase(state: WorldState, rng: SeededRNG): string[] {
  const fs = new FestivalSystem(state, rng);
  return fs.processFestivals();
}

function archivePhase(state: WorldState, rng: SeededRNG): string[] {
  const as = new ArchiveSystem(state, rng);
  return as.processArchives();
}

// ─── 主函数 ──────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.list) { listSaves(); return; }

  let engine: WorldEngine;
  if (args.cont) {
    const loaded = loadState();
    if (!loaded) { console.error('未找到存档文件。使用 --new 创建新世界。'); process.exit(1); }
    engine = new WorldEngine(loaded, new SeededRNG(loaded.seed + loaded.year));
  } else {
    engine = WorldEngine.createNew(args.seed, CHARACTERS, ITEMS);
    // 应用角色特有的起始健康条件
    const state = engine.getState();
    for (const agent of state.agents) {
      const conditions = LifecycleSystem.getInitialConditions(agent.id);
      if (conditions.length > 0) agent.conditions.push(...conditions);
    }
  }

  if (args.replay) {
    let allMatch = true;
    for (let i = 0; i < 5; i++) {
      const r = WorldEngine.createNew(args.seed || engine.getState().seed, CHARACTERS, ITEMS);
      if (JSON.stringify(r.getState()) !== JSON.stringify(engine.getState())) { allMatch = false; break; }
    }
    console.log(allMatch ? '✓ 确定性验证通过！' : '✗ 验证失败！结果不一致');
    return;
  }

  const targetYear = engine.getState().year + args.years;
  const allChronicle: ChronicleEntry[] = [];

  while (engine.getState().year < targetYear) {
    const { year, season } = engine.getState();
    const rng = engine.getRng();

    const popEvents = populationPhase(engine.getState(), rng);
    const lifeEvents = lifecyclePhase(engine.getState(), rng);
    const bldEvents = buildingPhase(engine.getState(), rng);
    const diaEvents = dialoguePhase(engine.getState(), rng);
    const ecoEvents = economicPhase(engine.getState(), rng);
    const socEvents = socialPhase(engine.getState(), rng);

    // 新模块 Phase
    const grpEvents = groupPhase(engine.getState(), rng);
    const twnEvents = townEventPhase(engine.getState(), rng);
    const fstEvents = festivalPhase(engine.getState(), rng);
    const innEvents = innovationPhase(engine.getState(), rng);
    const disEvents = discoveryPhase(engine.getState(), rng);
    const rumorEvents = rumorPhase(engine.getState(), rng, [...popEvents, ...lifeEvents, ...ecoEvents, ...socEvents, ...grpEvents, ...twnEvents, ...innEvents, ...disEvents, ...fstEvents]);
    const arcEvents = archivePhase(engine.getState(), rng);

    const lawEvents = lawPhase(engine.getState(), rng);

    const isYearEnd = season === 'winter';
    const chrEvents = chroniclePhase(engine.getState(), rng, isYearEnd);

    // 叙事整合
    const ee = new EventEmitter(engine.getState(), rng);
    const subsystemEvents: SubsystemEvents = {
      rumors: rumorEvents,
      groups: grpEvents,
      townEvents: twnEvents,
      discoveries: disEvents,
      festivals: fstEvents,
      archives: arcEvents,
      trade: ecoEvents,
    };
    const narratedEvents = ee.emitAll(subsystemEvents);

    engine.tick();

    const allEvents = [
      ...popEvents, ...lifeEvents, ...bldEvents, ...diaEvents,
      ...ecoEvents, ...socEvents,
      ...grpEvents, ...twnEvents, ...fstEvents,
      ...innEvents, ...disEvents, ...rumorEvents,
      ...lawEvents, ...arcEvents, ...chrEvents,
      ...narratedEvents,
    ];
    const entry: ChronicleEntry = {
      year,
      severity: allEvents.length > 3 ? 'dramatic' : allEvents.length > 1 ? 'notable' : 'peaceful',
      content: allEvents.join('；'),
    };
    engine.getState().chronicle.push(entry);
    allChronicle.push(entry);

    if (args.summary) {
      console.log(`\n第 ${year} 年（${SEASON_NAMES[season]}）`);
      for (const evt of allEvents) {
        console.log(`  · ${evt}`);
      }
    }
  }

  saveState(engine.getState());

  if (args.summary) {
    console.log(`\n${formatAnnualSummary(engine.getState())}`);
    console.log(`\n模拟 ${args.years} 年完成，共 ${allChronicle.length} 条编年史条目。`);
  } else {
    console.log(`模拟 ${args.years} 年完成（种子 ${engine.getState().seed}）。`);
  }
}

main().catch(err => { console.error('错误:', err); process.exit(1); });
