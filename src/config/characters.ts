/**
 * 18 位初始居民 — 按飞书文档 v6.0 定义
 * 每人：角色身份、年龄、技能、装备、家庭关系、健康特点
 */
export interface CharacterConfig {
  id: string;
  name: string;
  title: string;
  gender: '男' | '女';
  age: number;
  stats: {
    strength: number;
    intelligence: number;
    dexterity: number;
    charisma: number;
    health: number;
    maxHealth: number;
    energy: number;
    happiness: number;
  };
  skills: Record<string, number>;
  inventory: Record<string, number>;
  family: { spouse?: string; children: string[]; parents: string[] };
  tags: string[];
  initialBuilding: string;
  /** 初始铜钱（文） */
  wealth: number;
  /** 初始好感度（供未婚角色间加速婚姻） */
  initialRelationships?: Record<string, number>;
}

export const CHARACTERS: CharacterConfig[] = [
  {
    id: 'zhao-changhe', name: '赵长河', title: '里正', gender: '男', age: 45,
    stats: { strength: 55, intelligence: 80, dexterity: 50, charisma: 85, health: 70, maxHealth: 70, energy: 60, happiness: 65 },
    skills: { leadership: 75, negotiation: 70, literacy: 65, management: 60, farming: 30 },
    inventory: { rice: 10 },
    family: { spouse: 'ma-xiuying', children: [], parents: [] },
    tags: ['responsible', 'respected', 'fair'],
    initialBuilding: 'town_hall',
    wealth: 300,
  },
  {
    id: 'ma-xiuying', name: '马秀英', title: '社区后勤', gender: '女', age: 40,
    stats: { strength: 60, intelligence: 65, dexterity: 70, charisma: 80, health: 72, maxHealth: 72, energy: 65, happiness: 75 },
    skills: { cooking: 80, community_org: 70, nursing: 50, socializing: 75, negotiation: 55 },
    inventory: { rice: 8, vegetables: 5, meat: 3 },
    family: { spouse: 'zhao-changhe', children: [], parents: [] },
    tags: ['warm', 'generous', 'motherly'],
    initialBuilding: 'town_hall',
    wealth: 150,
  },
  {
    id: 'lao-wang', name: '老王', title: '客栈老板', gender: '男', age: 42,
    stats: { strength: 50, intelligence: 70, dexterity: 60, charisma: 75, health: 68, maxHealth: 68, energy: 60, happiness: 70 },
    skills: { hospitality: 80, cooking: 60, trading: 65, memory: 70, negotiation: 50 },
    inventory: { rice: 15, tea: 5, wine: 3, vegetables: 5 },
    family: { spouse: undefined, children: [], parents: [] },
    tags: ['hospitable', 'observant', 'steady'],
    initialBuilding: 'inn',
    wealth: 500,
  },
  {
    id: 'xiao-ye', name: '小野', title: '画师', gender: '女', age: 28,
    stats: { strength: 30, intelligence: 75, dexterity: 85, charisma: 70, health: 65, maxHealth: 65, energy: 65, happiness: 75 },
    skills: { painting: 80, calligraphy: 65, observation: 75, literacy: 60, optics_knowledge: 30 },
    inventory: { silk: 2 },
    family: { spouse: 'xiao-lin', children: [], parents: [] },
    tags: ['observant', 'artistic', 'free-spirited'],
    initialBuilding: 'studio',
    wealth: 120,
    initialRelationships: { 'xiao-lin': 80, 'su-linger': 40 },
  },
  {
    id: 'xiao-lin', name: '小林', title: '巧手工匠', gender: '男', age: 26,
    stats: { strength: 65, intelligence: 85, dexterity: 80, charisma: 50, health: 75, maxHealth: 75, energy: 75, happiness: 65 },
    skills: { carpentry: 80, mechanics: 75, engineering: 60, design: 65, literacy: 55 },
    inventory: { wood: 10, tools: 2 },
    family: { spouse: 'xiao-ye', children: [], parents: [] },
    tags: ['inventive', 'curious', 'tinkering'],
    initialBuilding: 'workshop',
    wealth: 80,
    initialRelationships: { 'xiao-ye': 80, 'chen-xiaofei': 35 },
  },
  {
    id: 'chen-dajiang', name: '陈大江', title: '面摊主', gender: '男', age: 42,
    stats: { strength: 70, intelligence: 60, dexterity: 75, charisma: 65, health: 78, maxHealth: 78, energy: 75, happiness: 70 },
    skills: { cooking: 85, noodle_making: 90, trading: 45, baking: 40, farming: 30 },
    inventory: { rice: 20, vegetables: 5, meat: 3, tools: 1 },
    family: { spouse: 'chen-xiulan', children: ['chen-xiaofei'], parents: [] },
    tags: ['hardworking', 'prideful', 'generous'],
    initialBuilding: 'noodle_stall',
    wealth: 200,
  },
  {
    id: 'chen-xiulan', name: '陈秀兰', title: '面摊老板娘', gender: '女', age: 39,
    stats: { strength: 45, intelligence: 70, dexterity: 65, charisma: 80, health: 72, maxHealth: 72, energy: 65, happiness: 70 },
    skills: { accounting: 75, socializing: 80, memory: 85, literacy: 40, negotiation: 60 },
    inventory: { rice: 10 },
    family: { spouse: 'chen-dajiang', children: ['chen-xiaofei'], parents: [] },
    tags: ['shrewd', 'warm', 'sharp-memory'],
    initialBuilding: 'noodle_stall',
    wealth: 150,
  },
  {
    id: 'chen-xiaofei', name: '陈小飞', title: '跑腿信使', gender: '男', age: 20,
    stats: { strength: 65, intelligence: 60, dexterity: 80, charisma: 70, health: 85, maxHealth: 85, energy: 85, happiness: 78 },
    skills: { running: 80, local_knowledge: 75, socializing: 60, delivery: 70, survival: 45 },
    inventory: { rice: 3 },
    family: { spouse: undefined, children: [], parents: ['chen-dajiang', 'chen-xiulan'] },
    tags: ['energetic', 'friendly', 'fast'],
    initialBuilding: 'noodle_stall',
    wealth: 30,
    initialRelationships: { 'su-linger': 65, 'lin-meiqi': 30 },
  },
  {
    id: 'zhou-jianguo', name: '周建国', title: '塾师', gender: '男', age: 48,
    stats: { strength: 35, intelligence: 90, dexterity: 55, charisma: 70, health: 55, maxHealth: 55, energy: 50, happiness: 60 },
    skills: { teaching: 85, literacy: 90, calligraphy: 80, history: 75, writing: 80, fishing: 50 },
    inventory: { rice: 5 },
    family: { spouse: 'wang-xiuzhi', children: ['zhou-xiaoyue'], parents: [] },
    tags: ['scholarly', 'patient', 'wise'],
    initialBuilding: 'school',
    wealth: 100,
  },
  {
    id: 'wang-xiuzhi', name: '王秀芝', title: '接生婆', gender: '女', age: 46,
    stats: { strength: 40, intelligence: 70, dexterity: 65, charisma: 75, health: 58, maxHealth: 58, energy: 50, happiness: 65 },
    skills: { midwifery: 85, nursing: 75, herbalism: 60, first_aid: 70, cooking: 50 },
    inventory: { cloth: 3, herbal_medicine: 5 },
    family: { spouse: 'zhou-jianguo', children: ['zhou-xiaoyue'], parents: [] },
    tags: ['experienced', 'gentle', 'arthritis'],
    initialBuilding: 'school',
    wealth: 80,
  },
  {
    id: 'zhou-xiaoyue', name: '周晓月', title: '文书', gender: '女', age: 30,
    stats: { strength: 35, intelligence: 80, dexterity: 75, charisma: 72, health: 70, maxHealth: 70, energy: 65, happiness: 68 },
    skills: { calligraphy: 85, literacy: 80, teaching: 60, writing: 75, accounting: 50 },
    inventory: { silk: 1, rice: 3 },
    family: { spouse: undefined, children: [], parents: ['zhou-jianguo', 'wang-xiuzhi'] },
    tags: ['gentle', 'diligent', 'refined'],
    initialBuilding: 'school',
    wealth: 60,
    initialRelationships: { 'zhang-wu': 65, 'chen-xiaofei': 25 },
  },
  {
    id: 'zhang-dashan', name: '张大山', title: '铁匠', gender: '男', age: 36,
    stats: { strength: 90, intelligence: 55, dexterity: 70, charisma: 45, health: 80, maxHealth: 80, energy: 75, happiness: 60 },
    skills: { blacksmithing: 85, mining: 50, repair: 55, strength: 80, charcoal_burning: 60 },
    inventory: { iron: 8, tools: 3, wood: 5 },
    family: { spouse: undefined, children: [], parents: [] },
    tags: ['strong', 'blunt', 'hearing-impaired'],
    initialBuilding: 'blacksmith',
    wealth: 250,
    initialRelationships: { 'wang-cuihua': 65 },
  },
  {
    id: 'wang-cuihua', name: '王翠花', title: '种花人', gender: '女', age: 35,
    stats: { strength: 50, intelligence: 65, dexterity: 70, charisma: 72, health: 75, maxHealth: 75, energy: 70, happiness: 80 },
    skills: { gardening: 85, farming: 60, herbalism: 50, trading: 35, patience: 70 },
    inventory: { vegetables: 10, rice: 3 },
    family: { spouse: undefined, children: [], parents: [] },
    tags: ['gentle', 'patient', 'green-thumb'],
    initialBuilding: 'flower_garden',
    wealth: 60,
    initialRelationships: { 'zhang-dashan': 65 },
  },
  {
    id: 'zhang-wu', name: '张武', title: '搬运工', gender: '男', age: 23,
    stats: { strength: 95, intelligence: 45, dexterity: 60, charisma: 55, health: 90, maxHealth: 90, energy: 90, happiness: 70 },
    skills: { strength: 90, laboring: 80, carrying: 75, fighting: 50, swimming: 40 },
    inventory: { rice: 5 },
    family: { spouse: undefined, children: [], parents: [] },
    tags: ['strong', 'simple', 'loyal'],
    initialBuilding: 'town_hall',
    wealth: 20,
    initialRelationships: { 'zhou-xiaoyue': 65, 'lin-meiqi': 65 },
  },
  {
    id: 'bai-ruolan', name: '白若兰', title: '女医', gender: '女', age: 32,
    stats: { strength: 40, intelligence: 85, dexterity: 65, charisma: 75, health: 68, maxHealth: 68, energy: 65, happiness: 65 },
    skills: { medicine: 85, diagnosis: 80, acupuncture: 75, herbology: 70, literacy: 60 },
    inventory: { herbal_medicine: 10, bandage: 5, tools: 1 },
    family: { spouse: 'chen-zhijie', children: [], parents: [] },
    tags: ['compassionate', 'skilled', 'calm'],
    initialBuilding: 'clinic',
    wealth: 180,
    initialRelationships: { 'chen-zhijie': 80 },
  },
  {
    id: 'su-linger', name: '苏灵儿', title: '采药人', gender: '女', age: 25,
    stats: { strength: 45, intelligence: 70, dexterity: 75, charisma: 78, health: 75, maxHealth: 75, energy: 70, happiness: 80 },
    skills: { herbology: 75, foraging: 80, divination: 70, socializing: 60, alchemy: 30 },
    inventory: { herbal_medicine: 8, vegetables: 5 },
    family: { spouse: undefined, children: [], parents: [] },
    tags: ['mysterious', 'playful', 'intuitive'],
    initialBuilding: 'herb_stall',
    wealth: 40,
    initialRelationships: { 'chen-xiaofei': 65, 'xiao-ye': 30 },
  },
  {
    id: 'chen-zhijie', name: '陈志杰', title: '更夫', gender: '男', age: 33,
    stats: { strength: 75, intelligence: 60, dexterity: 70, charisma: 60, health: 80, maxHealth: 80, energy: 75, happiness: 65 },
    skills: { patrolling: 80, security: 70, conflict_resolution: 65, first_aid: 50, fighting: 60 },
    inventory: { rice: 5 },
    family: { spouse: 'bai-ruolan', children: [], parents: [] },
    tags: ['reliable', 'quiet', 'just'],
    initialBuilding: 'town_hall',
    wealth: 80,
    initialRelationships: { 'bai-ruolan': 80 },
  },
  {
    id: 'lin-meiqi', name: '林美琪', title: '温泉管事', gender: '女', age: 27,
    stats: { strength: 45, intelligence: 60, dexterity: 70, charisma: 75, health: 75, maxHealth: 75, energy: 70, happiness: 72 },
    skills: { hospitality: 70, cleaning: 75, management: 55, socializing: 60, patience: 65 },
    inventory: { rice: 3, cloth: 2 },
    family: { spouse: undefined, children: [], parents: [] },
    tags: ['clean', 'gentle', 'patient'],
    initialBuilding: 'hot_spring',
    wealth: 60,
    initialRelationships: { 'zhang-wu': 65 },
  },
];
