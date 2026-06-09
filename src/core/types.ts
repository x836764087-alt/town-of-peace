/**
 * Core type definitions for the Town of Peace civilization simulator.
 *
 * All data-type interfaces live here so that other modules can import
 * types without creating circular dependencies. No methods — logic
 * lives in Manager / System classes elsewhere in the codebase.
 */

/** Enumerated weather conditions that affect agriculture and morale. */
export type WeatherType = 'sunny' | 'rainy' | 'windy' | 'snowy' | 'extreme';

/** The four seasons of the simulation year. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Categories used to classify tradeable items. */
export type ItemCategory = 'food' | 'tool' | 'material' | 'luxury' | 'medicine' | 'weapon';

/** A single tradeable item definition (read from config). */
export interface Item {
  /** Unique identifier, e.g. `'iron_sword'`. */
  id: string;
  /** Human-readable name, e.g. `'Iron Sword'`. */
  name: string;
  /** Category this item belongs to. */
  category: ItemCategory;
  /** Base market price in copper coins. */
  basePrice: number;
  /** Weight in units — used for carry-capacity checks. */
  weight: number;
  /** Durability points; omitted for consumables. */
  durability?: number;
  /** Whether this item can be crafted at a building. */
  craftable: boolean;
  /** Crafting recipe — omitted for uncraftable or raw items. */
  recipe?: {
    inputs: { itemId: string; quantity: number }[];
    /** Skill type required, e.g. `'smithing'`. */
    skill: string;
    /** Minimum skill level to attempt crafting. */
    skillRequired: number;
    /** Number of items produced per craft action. */
    output: number;
  };
  /** Tech nodes that must be unlocked before this item enters the economy. */
  requiresTech?: string[];
}

/** Bag of named item stacks with integer counts. */
export interface Inventory {
  items: Record<string, number>;
}

/** Core attribute scores for an agent. */
export interface AgentStats {
  strength: number;
  intelligence: number;
  dexterity: number;
  charisma: number;
  health: number;
  maxHealth: number;
  energy: number;
  happiness: number;
}

/** Family relationship graph for a single agent. */
export interface AgentFamily {
  /** Spouse agent id, if married. */
  spouse?: string;
  /** Child agent ids. */
  children: string[];
  /** Parent agent ids. */
  parents: string[];
  /** Extended household member ids (non-nuclear co-residents). */
  household: string[];
}

/** A standing condition affecting an agent (illness, buff, etc.). */
export interface Condition {
  id: string;
  name: string;
  /** Severity from 0 (negligible) to 100 (lethal). */
  severity: number;
  /** Remaining duration in ticks; 0 means permanent. */
  duration: number;
}

/** A single memory the agent carries forward across years. */
export interface Memory {
  /** Simulation year when this memory was formed. */
  year: number;
  /** Free-text description of the event. */
  content: string;
  /** Importance weight for recall probability (0-1). */
  importance: number;
}

/** Full persistent state of a single agent. */
export interface AgentState {
  /** Unique agent identifier. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Honorific title, if any (e.g. `'Elder'`). */
  title?: string;
  /** Chronological age in years. */
  age: number;
  /** Whether the agent is alive. */
  alive: boolean;
  /** Biological gender for narrative generation. */
  gender: string;
  /** Core attribute scores. */
  stats: AgentStats;
  /** Skill levels — keyed by skill name, value is the current level. */
  skills: Record<string, number>;
  /** Personal inventory. */
  inventory: Inventory;
  /** Social relationship values — keyed by agent id, value is -100 to 100. */
  relationships: Record<string, number>;
  /** Family relationship graph. */
  family: AgentFamily;
  /** Active conditions (illnesses, buffs). */
  conditions: Condition[];
  /** Current employer agent id, if employed. */
  employer?: string;
  /** Agent ids of people this agent employs. */
  employees: string[];
  /** Memories carried across years. */
  memories: Memory[];
  /** Simulation year when the agent was born. */
  born: number;
  /** Year of death — present only when `alive === false`. */
  deathYear?: number;
  /** Cause of death narrative string. */
  causeOfDeath?: string;
  /** Free-form tags for categorisation (e.g. `['orphan']`). */
  tags: string[];
  /** Id of the initial building this agent was placed in at birth. */
  initialBuilding?: string;
  /** 持有的铜钱（文）。 */
  wealth: number;
}

/** Aggregate economic state for the entire simulation. */
export interface EconomyState {
  /** Total currency in circulation across all agents. */
  totalCurrency: number;
  /** Value of goods traded this year. */
  annualTradeVolume: number;
  /** Value of goods lost to spoilage this year. */
  annualSpoilage: number;
  /** Historical price curve — keyed by item id, value is yearly price array. */
  priceHistory: Record<string, number[]>;
  /** Maximum allowed market price per item id (price caps). */
  priceCaps: Record<string, number>;
}

/** Upgrade material progress for a building (0-100). */
export type MaterialProgress = number;

/** A building on the world map. */
export interface Building {
  /** Unique building identifier. */
  id: string;
  /** Human-readable name, e.g. `'Blacksmith'`. */
  name: string;
  /** Owner agent id, if privately owned. */
  ownerId?: string;
  /** Building type — determines what actions are possible. */
  type: string;
  /** Current upgrade level (1-based). */
  level: number;
  /** Grid x coordinate. */
  x: number;
  /** Grid y coordinate. */
  y: number;
  /** Free-text description rendered in the chronicle. */
  description: string;
  /** Accumulated material progress toward the next upgrade (0-100). */
  materialProgress: MaterialProgress;
  /** Upgrade cost in copper coins (文) — recalculated on level change. */
  upgradeCost: UpgradeCost;
  /** Technology prerequisites for the next upgrade level. */
  techRequired: string[];
}

/** Material cost for upgrading a building, expressed in copper coins (文). */
export interface UpgradeCost {
  /** Material cost in copper coins. */
  materialCost: number;
  /** Number of labor (人工) required. */
  laborCost: number;
}

/** Upgrade cost definitions per level transition. */
export type UpgradeCostDef = Record<string, UpgradeCost>;

/** Predefined terrain tile types. */
export type TileType =
  | 'plains'
  | 'forest'
  | 'water'
  | 'mountain'
  | 'farmland'
  | 'road'
  | 'building';

/** A single map tile. */
export interface Tile {
  /** The terrain type of this tile. */
  type: TileType;
  /** Extractable resource name, if applicable (e.g. `'iron'`). */
  resource?: string;
  /** Crop yield modifier for farmland tiles (0-1). */
  fertility?: number;
}

/** Two-dimensional tile grid representing the world map. */
export interface TileMap {
  /** Grid width in tiles. */
  width: number;
  /** Grid height in tiles. */
  height: number;
  /** 2D tile array — `tiles[y][x]`. */
  tiles: Tile[][];
}

/**
 * A single node in the technology tree.
 *
 * Researching a tech node unlocks new crafting recipes, buildings,
 * and passive world effects.
 */
export interface TechNode {
  /** Unique identifier, e.g. `'iron_working'`. */
  id: string;
  /** Display name, e.g. `'Iron Working'`. */
  name: string;
  /** Human-readable description of the technology. */
  description: string;
  /** Prerequisite tech node ids that must be completed first. */
  prerequisites: string[];
  /** Primary skill needed to research, e.g. `'scholarship'`. */
  requiredSkill: string;
  /** Minimum level in the required skill. */
  requiredSkillLevel: number;
  /** Overall difficulty multiplier (higher = slower progress). */
  difficulty: number;
  /** Material inputs consumed at research completion. */
  materials: { itemId: string; quantity: number }[];
  /** Strings unlocked by this technology — recipe ids, building types, etc. */
  unlocks: string[];
  /** Passive world effects applied once researched. */
  effects: { type: string; value: number }[];
  /** Year this tech was discovered (filled when pushed to state.innovations). */
  discoveredYear?: number;
  /** Agent id of the discoverer. */
  discoveredBy?: string;
}

/** Active or recently completed innovation project. */
export interface InnovationProject {
  /** Tech node id being researched. */
  techNodeId: string;
  /** Agent id of the lead researcher. */
  researcherId: string;
  /** Current progress (0–100). */
  progress: number;
  /** Total years spent on this project so far. */
  yearsSpent: number;
  /** Project lifecycle status. */
  status: 'in_progress' | 'completed' | 'failed';
}

/** Outcome of a completed or failed innovation project. */
export interface InnovationResult {
  /** Final outcome — success, failure, or still in progress. */
  status: 'in_progress' | 'success' | 'failure';
  /** Narrative sentence describing what happened. */
  narrative: string;
  /** Final progress value (100 on success, <100 on failure). */
  progress: number;
}

/** A single civil law or decree. */
export interface Law {
  /** Unique identifier, e.g. `'night_curfew'`. */
  id: string;
  /** Display name, e.g. `'Night Curfew'`. */
  name: string;
  /** Free-text description of the law's effect. */
  description: string;
  /** Simulation year when enacted. */
  yearEnacted: number;
  /** Agent id of the enactor (ruler / council), if known. */
  enactedBy?: string;
  /** Whether the law is currently active. */
  active: boolean;
}

/** A community festival or celebration. */
export interface Festival {
  /** Unique identifier, e.g. `'harvest_feast'`. */
  id: string;
  /** Display name, e.g. `'Harvest Feast'`. */
  name: string;
  /** Free-text description of the festival. */
  description: string;
  /** Year the festival was first established. */
  yearsEstablished: number;
  /** How many years the festival has been run consecutively. */
  yearsRun: number;
  /** Season in which the festival occurs. */
  season: Season;
  /** Agent ids invited / expected to attend. */
  participants: string[];
}

/** A social group or organisation within the settlement. */
export interface Group {
  /** Unique identifier, e.g. `'night_watch'`. */
  id: string;
  /** Display name, e.g. `'Night Watch'`. */
  name: string;
  /** Free-text description of the group's purpose. */
  description: string;
  /** Agent ids of current members. */
  members: string[];
  /** Simulation year the group was formed. */
  formedYear: number;
  /** Group type for categorisation, e.g. `'military'`, `'religious'`. */
  type: string;
}

/** A single entry in the civilisation archive. */
export interface ArchiveEntry {
  /** Simulation year of the recorded event. */
  year: number;
  /** Type tag for filtering, e.g. `'birth'`, `'death'`, `'discovery'`. */
  type: string;
  /** Free-text content of the entry. */
  content: string;
  /** Associated agent ids, if the entry concerns specific people. */
  agentIds?: string[];
}

/** Apprenticeship record — long-term master-disciple relationship. */
export interface ApprenticeshipRecord {
  id: string;
  masterId: string;
  apprenticeId: string;
  techId: string;
  startDate: number;
  apprenticeshipYears: number;
  status: 'apprentice' | 'journeyman' | 'independent';
  wage: number;
  yearsServed: number;
}

/** Short-term (temporary / daily-wages) employment record. */
export interface ShortTermJob {
  id: string;
  employerId: string;
  workerId: string;
  taskId: string;
  durationWeeks: number;
  weeksElapsed: number;
  wage: number;
  status: 'active' | 'completed' | 'cancelled';
  year: number;
}

/** A symmetric relationship edge between two agents. */
export interface Relation {
  /** First agent id. */
  agentA: string;
  /** Second agent id. */
  agentB: string;
  /** Relationship value, typically -100 to 100. */
  value: number;
}

/** A single entry in the in-game chronicle / history log. */
export interface ChronicleEntry {
  /** Simulation year of the event. */
  year: number;
  /** Narrative severity — used for highlighting and filtering. */
  severity: 'peaceful' | 'notable' | 'dramatic' | 'epochal';
  /** Formatted narrative content. */
  content: string;
}

/** A pointer to a saved world snapshot. */
export interface SnapshotIndex {
  /** Simulation year of the snapshot. */
  year: number;
  /** Whether this is a full save or delta from the previous snapshot. */
  type: 'full' | 'delta';
  /** Filesystem path to the snapshot file. */
  path: string;
}

/**
 * A single simulated game event that can fire during a tick.
 *
 * Events may be random draws, season triggers, or chained reactions
 * from prior events.
 */
export interface GameEvent {
  /** Unique event identifier. */
  id: string;
  /** Source category — random, scripted, or seasonal. */
  type: 'random' | 'triggered' | 'seasonal' | 'chain';
  /** Condition string evaluated by the event system, e.g. `'population > 50'`. */
  condition: string;
  /** Base probability of firing (0-1) when condition is met. */
  probability: number;
  /** Season in which the event is active, if applicable. */
  season?: string;
  /** Narrative template and metadata for rendering. */
  narrative: {
    /** Handlebars / mustache template string. */
    template: string;
    /** Severity label for chronicle integration. */
    severity: string;
    /** Reference to a context entity (building, person, etc.). */
    contextRef?: string;
  };
}

/** 一条交易记录。 */
export interface TradeDeal {
  buyerId: string;
  sellerId: string;
  itemId: string;
  quantity: number;
  /** 成交总价（文）。 */
  price: number;
  type: 'coin' | 'barter';
  year: number;
}

/** 赊账/借贷记录。 */
export interface CreditRecord {
  creditorId: string;
  debtorId: string;
  amount: number;
  yearIncurred: number;
  dueYear: number;
  settled: boolean;
}

/** 当前市场价格及供需状态。 */
export interface MarketPrice {
  itemId: string;
  basePrice: number;
  currentPrice: number;
  tradedVolume: number;
}

/**
 * Top-level simulation state — the single source of truth.
 *
 * This object is serialised for saves and passed to the Chronicle
 * Generator for narrative rendering. All business logic managers
 * mutate or read from this tree through the WorldEngine.
 */
export interface WorldState {
  /** Current simulation year. */
  year: number;
  /** Current season within the year. */
  season: Season;
  /** Current weather condition. */
  weather: WeatherType;
  /** All agents currently in the simulation. */
  agents: AgentState[];
  /** Aggregate economic indicators. */
  economy: EconomyState;
  /** All buildings on the world map. */
  buildings: Building[];
  /** The world map grid. */
  map: TileMap;
  /** Discovered technology nodes. */
  innovations: TechNode[];
  /** Active laws and decrees. */
  laws: Law[];
  /** Established festivals. */
  festivals: Festival[];
  /** Social groups and organisations. */
  groups: Group[];
  /** Historical archive entries. */
  archives: ArchiveEntry[];
  /** Explicit relationship edges between agents. */
  relations: Relation[];
  /** Random seed used to initialise this simulation (for replay). */
  seed: number;
  /** Chronological history log. */
  chronicle: ChronicleEntry[];
  /** Pointers to saved world snapshots. */
  snapshots: SnapshotIndex[];
  /** Population threshold for epochal events (e.g. 100). */
  populationThreshold: number;
  /** Schema version for save-file migration. */
  version: string;
  /** 赊账/借贷记录。 */
  credits: CreditRecord[];
  /** Apprenticeship (apprentice/journeyman/independent) records. */
  apprenticeships: ApprenticeshipRecord[];
  /** Short-term (temporary / daily-wage) employment records. */
  __shortTermJobs: ShortTermJob[];
}
