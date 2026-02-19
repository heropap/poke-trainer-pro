/**
 * Pattern Catalog — structured metadata for all known effect patterns.
 *
 * This is the data source for the visual effect editor UI. Each pattern
 * entry includes:
 *   - Unique ID matching the schema type
 *   - Human-readable label (Chinese)
 *   - Category (attack/trainer/ability)
 *   - Sub-category for grouping in the editor
 *   - Parameter definitions with types, labels, defaults, and constraints
 *   - Example cards that use this pattern
 *
 * Pattern IDs map 1:1 to AttackPatternType / TrainerPatternType / AbilityPatternType
 * in effect-schema.ts.
 */

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export type PatternCategory = "attack" | "trainer" | "ability";

export type AttackSubCategory =
  | "status"        // Status conditions
  | "coin"          // Coin flip effects
  | "damage_mod"    // Damage modifiers (per energy, bench count, etc.)
  | "self_effect"   // Self-targeting (recoil, heal, switch, restrictions)
  | "opponent"      // Opponent-targeting (bench damage, discard energy, etc.)
  | "card_draw"     // Card draw / search
  | "special";      // Misc (skip weakness, move energy, evolve)

export type TrainerSubCategory =
  | "draw"          // Draw cards
  | "search"        // Search deck for cards
  | "switch"        // Switch active/bench
  | "heal"          // Healing
  | "discard"       // Discard effects
  | "energy"        // Energy recovery/attachment
  | "disruption";   // Opponent hand/deck manipulation

export type AbilitySubCategory =
  | "passive_defense"   // Damage reduction, prevent
  | "passive_boost"     // Damage boost, type boost
  | "passive_movement"  // Retreat cost reduction
  | "on_evolve"         // Triggered on evolution
  | "activated";        // Once-per-turn activated

export type ParamType = "number" | "string" | "boolean" | "status" | "energy_type" | "card_filter";

export interface ParamDef {
  /** Parameter key (matches schema params) */
  name: string;
  /** Human-readable label */
  label: string;
  /** Parameter type */
  type: ParamType;
  /** Default value */
  defaultValue: number | string | boolean;
  /** Minimum value (for numbers) */
  min?: number;
  /** Maximum value (for numbers) */
  max?: number;
  /** Allowed values (for enums) */
  options?: Array<{ value: string; label: string }>;
  /** Help text */
  hint?: string;
}

export interface PatternEntry {
  /** Pattern ID — matches schema type exactly */
  id: string;
  /** Human-readable label */
  label: string;
  /** English label for developer reference */
  labelEn: string;
  /** Category */
  category: PatternCategory;
  /** Sub-category for UI grouping */
  subCategory: string;
  /** Description of what this pattern does */
  description: string;
  /** Parameter definitions */
  params: ParamDef[];
  /** Example cards that use this pattern */
  examples: string[];
  /** Does this pattern require coin flip (UI indicator) */
  usesCoinFlip?: boolean;
  /** Does this pattern require async prompt (UI indicator) */
  usesPrompt?: boolean;
}

// ═══════════════════════════════════════════
// Attack Patterns
// ═══════════════════════════════════════════

const STATUS_OPTIONS = [
  { value: "poisoned", label: "中毒 (Poisoned)" },
  { value: "burned", label: "灼伤 (Burned)" },
  { value: "paralyzed", label: "麻痹 (Paralyzed)" },
  { value: "asleep", label: "睡眠 (Asleep)" },
  { value: "confused", label: "混乱 (Confused)" },
];

const ENERGY_TYPE_OPTIONS = [
  { value: "Fire", label: "火 (Fire)" },
  { value: "Water", label: "水 (Water)" },
  { value: "Grass", label: "草 (Grass)" },
  { value: "Lightning", label: "雷 (Lightning)" },
  { value: "Psychic", label: "超 (Psychic)" },
  { value: "Fighting", label: "格斗 (Fighting)" },
  { value: "Darkness", label: "暗 (Darkness)" },
  { value: "Metal", label: "钢 (Metal)" },
  { value: "Colorless", label: "无色 (Colorless)" },
];

const CARD_FILTER_OPTIONS = [
  { value: "pokemon", label: "宝可梦" },
  { value: "trainer", label: "训练师" },
  { value: "energy", label: "能量" },
  { value: "pokemon_or_energy", label: "宝可梦或能量" },
  { value: "any", label: "任意" },
];

export const attackPatterns: PatternEntry[] = [
  // ─── Status ───
  {
    id: "status_apply",
    label: "附加异常状态",
    labelEn: "Apply Status",
    category: "attack",
    subCategory: "status",
    description: "攻击后对防守方附加一种异常状态",
    params: [
      { name: "status", label: "异常状态", type: "status", defaultValue: "poisoned", options: STATUS_OPTIONS },
    ],
    examples: ["Tangela - Poison Powder", "Pikachu - Thunder Shock"],
  },
  {
    id: "cond_status_bonus",
    label: "异常状态加伤",
    labelEn: "Status Condition Bonus",
    category: "attack",
    subCategory: "status",
    description: "如果对方有异常状态，额外增加伤害",
    params: [
      { name: "bonusDamage", label: "额外伤害", type: "number", defaultValue: 30, min: 10, max: 200 },
    ],
    examples: ["Luxray - Wild Charge"],
  },

  // ─── Coin Flip ───
  {
    id: "coin_flip_bonus",
    label: "翻硬币加伤",
    labelEn: "Coin Flip Bonus",
    category: "attack",
    subCategory: "coin",
    description: "翻一枚硬币，正面额外增加伤害",
    params: [
      { name: "bonusDamage", label: "额外伤害", type: "number", defaultValue: 30, min: 10, max: 200 },
    ],
    examples: ["Luxio - Thunder Fang", "Pikachu - Spark"],
    usesCoinFlip: true,
  },
  {
    id: "coin_flip_nothing",
    label: "翻硬币反面无伤",
    labelEn: "Coin Flip or Nothing",
    category: "attack",
    subCategory: "coin",
    description: "翻一枚硬币，反面则攻击失败（0伤害）",
    params: [],
    examples: ["Metapod - Tackle"],
    usesCoinFlip: true,
  },
  {
    id: "multi_coin",
    label: "多次翻硬币",
    labelEn: "Multi Coin Flip",
    category: "attack",
    subCategory: "coin",
    description: "翻N枚硬币，每个正面造成指定伤害",
    params: [
      { name: "coinCount", label: "硬币数量", type: "number", defaultValue: 3, min: 1, max: 10 },
      { name: "damagePerHeads", label: "每正面伤害", type: "number", defaultValue: 30, min: 10, max: 100 },
    ],
    examples: ["Tyrogue - Pow-Pow Punching", "Machop - Low Kick"],
    usesCoinFlip: true,
  },
  {
    id: "coin_flip_prevent",
    label: "翻硬币防伤",
    labelEn: "Coin Flip Prevent Damage",
    category: "attack",
    subCategory: "coin",
    description: "翻一枚硬币，正面则下回合防止受到伤害",
    params: [],
    examples: ["Butterfree - Gust"],
    usesCoinFlip: true,
  },
  {
    id: "coin_discard_opp_energy",
    label: "翻硬币弃对方能量",
    labelEn: "Coin Flip Discard Opponent Energy",
    category: "attack",
    subCategory: "coin",
    description: "翻一枚硬币，正面弃掉对方一个能量",
    params: [],
    examples: ["Raichu - Thunderbolt"],
    usesCoinFlip: true,
  },

  // ─── Damage Modifiers ───
  {
    id: "per_energy_damage",
    label: "每能量加伤",
    labelEn: "Per Energy Damage",
    category: "attack",
    subCategory: "damage_mod",
    description: "根据自身附带的能量数量增加伤害",
    params: [
      { name: "damagePerEnergy", label: "每能量伤害", type: "number", defaultValue: 20, min: 10, max: 100 },
    ],
    examples: ["Charizard ex - Burning Dark"],
  },
  {
    id: "per_self_damage_counter",
    label: "自身伤害计数器加伤",
    labelEn: "Per Self Damage Counter",
    category: "attack",
    subCategory: "damage_mod",
    description: "根据自身伤害计数器数量增加伤害",
    params: [
      { name: "damagePerCounter", label: "每计数器伤害", type: "number", defaultValue: 10, min: 10, max: 50 },
    ],
    examples: ["Primeape - Rage"],
  },
  {
    id: "per_opp_damage_counter",
    label: "对方伤害计数器加伤",
    labelEn: "Per Opponent Damage Counter",
    category: "attack",
    subCategory: "damage_mod",
    description: "根据对方当前战斗宝可梦的伤害计数器增加伤害",
    params: [
      { name: "damagePerCounter", label: "每计数器伤害", type: "number", defaultValue: 10, min: 10, max: 50 },
    ],
    examples: [],
  },
  {
    id: "cond_damaged_bonus",
    label: "受伤加伤",
    labelEn: "Damaged Bonus",
    category: "attack",
    subCategory: "damage_mod",
    description: "如果自身有伤害计数器，额外增加伤害",
    params: [
      { name: "bonusDamage", label: "额外伤害", type: "number", defaultValue: 40, min: 10, max: 200 },
    ],
    examples: [],
  },
  {
    id: "prize_based_damage",
    label: "奖品卡加伤",
    labelEn: "Prize Based Damage",
    category: "attack",
    subCategory: "damage_mod",
    description: "根据对方已取得的奖品卡数量增加伤害",
    params: [
      { name: "damagePerPrize", label: "每奖品卡伤害", type: "number", defaultValue: 20, min: 10, max: 100 },
    ],
    examples: [],
  },
  {
    id: "bench_count_damage",
    label: "板凳数量加伤",
    labelEn: "Bench Count Damage",
    category: "attack",
    subCategory: "damage_mod",
    description: "根据板凳上宝可梦数量增加伤害",
    params: [
      { name: "damagePerBench", label: "每只加伤", type: "number", defaultValue: 20, min: 10, max: 100 },
      { name: "bothSides", label: "双方板凳", type: "boolean", defaultValue: false, hint: "是否计算双方的板凳" },
    ],
    examples: [],
  },

  // ─── Self Effects ───
  {
    id: "self_damage",
    label: "自伤",
    labelEn: "Self Damage",
    category: "attack",
    subCategory: "self_effect",
    description: "攻击后对自身造成反伤",
    params: [
      { name: "selfDamage", label: "自伤量", type: "number", defaultValue: 10, min: 10, max: 100 },
    ],
    examples: ["Corphish - Take Down", "Electrode - Self-Destruct"],
  },
  {
    id: "cant_attack_next_turn",
    label: "下回合不能攻击",
    labelEn: "Can't Attack Next Turn",
    category: "attack",
    subCategory: "self_effect",
    description: "使用后自身下回合不能攻击",
    params: [],
    examples: ["Snorlax - Hyper Beam"],
  },
  {
    id: "damage_reduction_self",
    label: "自身减伤",
    labelEn: "Damage Reduction Self",
    category: "attack",
    subCategory: "self_effect",
    description: "下回合自身受到的伤害减少",
    params: [
      { name: "reduction", label: "减伤量", type: "number", defaultValue: 20, min: 10, max: 100 },
    ],
    examples: [],
  },
  {
    id: "discard_energy",
    label: "弃自身能量",
    labelEn: "Discard Energy",
    category: "attack",
    subCategory: "self_effect",
    description: "攻击后弃掉自身的能量",
    params: [
      { name: "count", label: "弃能量数", type: "number", defaultValue: 1, min: 1, max: 5 },
    ],
    examples: ["Charizard - Fire Spin"],
  },
  {
    id: "heal_self",
    label: "治疗自身",
    labelEn: "Heal Self",
    category: "attack",
    subCategory: "self_effect",
    description: "攻击后治疗自身一定量的伤害",
    params: [
      { name: "amount", label: "治疗量", type: "number", defaultValue: 30, min: 10, max: 100 },
    ],
    examples: ["Meganium - Mega Drain"],
  },
  {
    id: "heal_all_own",
    label: "治疗全部己方",
    labelEn: "Heal All Own",
    category: "attack",
    subCategory: "self_effect",
    description: "治疗所有己方宝可梦一定量的伤害",
    params: [
      { name: "amount", label: "治疗量", type: "number", defaultValue: 20, min: 10, max: 100 },
    ],
    examples: [],
  },
  {
    id: "heal_and_remove_status",
    label: "治疗+清除异常",
    labelEn: "Heal and Remove Status",
    category: "attack",
    subCategory: "self_effect",
    description: "治疗自身并清除所有异常状态",
    params: [
      { name: "healAmount", label: "治疗量", type: "number", defaultValue: 30, min: 10, max: 100 },
    ],
    examples: [],
  },
  {
    id: "switch_self",
    label: "自身切换",
    labelEn: "Switch Self",
    category: "attack",
    subCategory: "self_effect",
    description: "攻击后切换到板凳宝可梦",
    params: [],
    examples: ["Talonflame - Hit and Run"],
    usesPrompt: true,
  },
  {
    id: "move_energy_to_bench",
    label: "转移能量到板凳",
    labelEn: "Move Energy to Bench",
    category: "attack",
    subCategory: "self_effect",
    description: "将自身的能量转移到板凳宝可梦",
    params: [],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "search_evolve_self",
    label: "检索进化卡进化",
    labelEn: "Search and Evolve Self",
    category: "attack",
    subCategory: "self_effect",
    description: "从卡组检索进化卡并立即进化",
    params: [],
    examples: [],
    usesPrompt: true,
  },

  // ─── Opponent Effects ───
  {
    id: "bench_damage",
    label: "板凳伤害",
    labelEn: "Bench Damage",
    category: "attack",
    subCategory: "opponent",
    description: "对对方板凳宝可梦造成伤害",
    params: [
      { name: "damage", label: "伤害量", type: "number", defaultValue: 20, min: 10, max: 100 },
      { name: "count", label: "目标数", type: "number", defaultValue: 1, min: -1, max: 5, hint: "-1表示全部板凳" },
    ],
    examples: ["Zapdos - Thunderstorm"],
    usesPrompt: true,
  },
  {
    id: "cant_retreat_defender",
    label: "对方不能撤退",
    labelEn: "Can't Retreat Defender",
    category: "attack",
    subCategory: "opponent",
    description: "防守方下回合不能撤退",
    params: [],
    examples: ["Tangela - Bind"],
  },
  {
    id: "discard_opp_energy",
    label: "弃对方能量",
    labelEn: "Discard Opponent Energy",
    category: "attack",
    subCategory: "opponent",
    description: "弃掉对方当前战斗宝可梦的能量",
    params: [],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "discard_opp_deck",
    label: "弃对方牌顶",
    labelEn: "Discard Opponent Deck",
    category: "attack",
    subCategory: "opponent",
    description: "弃掉对方卡组顶部的卡",
    params: [
      { name: "count", label: "弃卡数", type: "number", defaultValue: 2, min: 1, max: 10 },
    ],
    examples: [],
  },
  {
    id: "discard_opp_hand_random",
    label: "弃对方手牌",
    labelEn: "Discard Opponent Hand Random",
    category: "attack",
    subCategory: "opponent",
    description: "随机弃掉对方手牌",
    params: [
      { name: "count", label: "弃牌数", type: "number", defaultValue: 1, min: 1, max: 5 },
    ],
    examples: [],
  },
  {
    id: "switch_opponent",
    label: "切换对方",
    labelEn: "Switch Opponent",
    category: "attack",
    subCategory: "opponent",
    description: "切换对方的当前战斗宝可梦",
    params: [],
    examples: [],
    usesPrompt: true,
  },

  // ─── Card Draw ───
  {
    id: "draw_cards",
    label: "攻击抽卡",
    labelEn: "Draw Cards (Attack)",
    category: "attack",
    subCategory: "card_draw",
    description: "攻击效果中抽取卡片",
    params: [
      { name: "count", label: "抽卡数", type: "number", defaultValue: 1, min: 1, max: 5 },
    ],
    examples: [],
  },
  {
    id: "draw_until",
    label: "抽到指定手牌数",
    labelEn: "Draw Until",
    category: "attack",
    subCategory: "card_draw",
    description: "抽卡直到手牌达到指定数量",
    params: [
      { name: "targetHandSize", label: "目标手牌数", type: "number", defaultValue: 6, min: 1, max: 10 },
    ],
    examples: [],
  },

  // ─── Special ───
  {
    id: "skip_weakness_resistance",
    label: "忽略弱点/抗性",
    labelEn: "Skip Weakness/Resistance",
    category: "attack",
    subCategory: "special",
    description: "攻击忽略弱点和/或抗性计算",
    params: [
      { name: "skipWeakness", label: "忽略弱点", type: "boolean", defaultValue: true },
      { name: "skipResistance", label: "忽略抗性", type: "boolean", defaultValue: false },
    ],
    examples: [],
  },
];

// ═══════════════════════════════════════════
// Trainer Patterns
// ═══════════════════════════════════════════

export const trainerPatterns: PatternEntry[] = [
  // ─── Draw ───
  {
    id: "draw",
    label: "抽卡",
    labelEn: "Draw Cards",
    category: "trainer",
    subCategory: "draw",
    description: "从卡组抽取指定数量的卡",
    params: [
      { name: "count", label: "抽卡数", type: "number", defaultValue: 2, min: 1, max: 10 },
    ],
    examples: ["Hop", "Hau"],
  },
  {
    id: "discard_hand_draw",
    label: "弃手牌抽卡",
    labelEn: "Discard Hand and Draw",
    category: "trainer",
    subCategory: "draw",
    description: "弃掉手牌后抽取指定数量的卡",
    params: [
      { name: "drawCount", label: "抽卡数", type: "number", defaultValue: 5, min: 1, max: 10 },
    ],
    examples: ["Professor's Research"],
  },
  {
    id: "shuffle_hand_draw",
    label: "洗手牌抽卡",
    labelEn: "Shuffle Hand and Draw",
    category: "trainer",
    subCategory: "draw",
    description: "将手牌洗入卡组后抽取指定数量的卡",
    params: [
      { name: "drawCount", label: "抽卡数", type: "number", defaultValue: 5, min: 1, max: 10 },
    ],
    examples: ["Iono", "Judge"],
  },
  {
    id: "each_shuffle_draw",
    label: "双方洗手牌抽卡",
    labelEn: "Each Player Shuffle and Draw",
    category: "trainer",
    subCategory: "draw",
    description: "双方各自洗手牌入卡组后抽取指定数量的卡",
    params: [
      { name: "drawCount", label: "抽卡数", type: "number", defaultValue: 5, min: 1, max: 10 },
    ],
    examples: ["Judge"],
  },
  {
    id: "shuffle_prizes_draw",
    label: "洗手牌按奖品数抽",
    labelEn: "Shuffle and Draw by Prizes",
    category: "trainer",
    subCategory: "draw",
    description: "将手牌洗入卡组，抽卡数等于剩余奖品卡数",
    params: [],
    examples: ["Iono"],
  },
  {
    id: "opp_shuffle_draw",
    label: "对方洗手牌抽卡",
    labelEn: "Opponent Shuffle and Draw",
    category: "trainer",
    subCategory: "draw",
    description: "对方将手牌洗入卡组后抽取指定数量的卡",
    params: [
      { name: "drawCount", label: "对方抽卡数", type: "number", defaultValue: 4, min: 1, max: 10 },
    ],
    examples: [],
  },

  // ─── Search ───
  {
    id: "search_basic_to_bench",
    label: "检索基础宝可梦上场",
    labelEn: "Search Basic to Bench",
    category: "trainer",
    subCategory: "search",
    description: "从卡组检索基础宝可梦放到板凳",
    params: [
      { name: "count", label: "数量", type: "number", defaultValue: 1, min: 1, max: 3 },
    ],
    examples: ["Nest Ball", "Pokémon Fan Club"],
    usesPrompt: true,
  },
  {
    id: "search_pokemon_to_hand",
    label: "检索宝可梦到手牌",
    labelEn: "Search Pokemon to Hand",
    category: "trainer",
    subCategory: "search",
    description: "从卡组检索任意宝可梦加入手牌",
    params: [
      { name: "count", label: "数量", type: "number", defaultValue: 1, min: 1, max: 3 },
    ],
    examples: ["Ultra Ball"],
    usesPrompt: true,
  },
  {
    id: "search_evolution",
    label: "检索进化卡",
    labelEn: "Search Evolution",
    category: "trainer",
    subCategory: "search",
    description: "从卡组检索进化卡加入手牌",
    params: [],
    examples: ["Poké Ball"],
    usesPrompt: true,
  },
  {
    id: "search_supporter",
    label: "检索支援卡",
    labelEn: "Search Supporter",
    category: "trainer",
    subCategory: "search",
    description: "从卡组检索支援者卡加入手牌",
    params: [
      { name: "count", label: "数量", type: "number", defaultValue: 1, min: 1, max: 3 },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "search_any_to_hand",
    label: "检索任意卡",
    labelEn: "Search Any Card",
    category: "trainer",
    subCategory: "search",
    description: "从卡组检索任意卡加入手牌",
    params: [
      { name: "count", label: "数量", type: "number", defaultValue: 1, min: 1, max: 3 },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "search_energy_to_hand",
    label: "检索能量到手牌",
    labelEn: "Search Energy to Hand",
    category: "trainer",
    subCategory: "search",
    description: "从卡组检索能量卡加入手牌",
    params: [
      { name: "count", label: "数量", type: "number", defaultValue: 1, min: 1, max: 3 },
    ],
    examples: [],
    usesPrompt: true,
  },

  // ─── Switch ───
  {
    id: "switch_own",
    label: "切换己方",
    labelEn: "Switch Own Active",
    category: "trainer",
    subCategory: "switch",
    description: "切换自己的当前战斗宝可梦",
    params: [],
    examples: ["Switch"],
    usesPrompt: true,
  },
  {
    id: "switch_opponent",
    label: "切换对方",
    labelEn: "Switch Opponent",
    category: "trainer",
    subCategory: "switch",
    description: "切换对方的当前战斗宝可梦",
    params: [],
    examples: ["Boss's Orders"],
    usesPrompt: true,
  },

  // ─── Heal ───
  {
    id: "heal",
    label: "治疗",
    labelEn: "Heal",
    category: "trainer",
    subCategory: "heal",
    description: "治疗指定量的伤害",
    params: [
      { name: "amount", label: "治疗量", type: "number", defaultValue: 30, min: 10, max: 200 },
    ],
    examples: ["Potion", "Super Potion"],
    usesPrompt: true,
  },

  // ─── Energy ───
  {
    id: "energy_discard_to_hand",
    label: "弃牌堆能量回手",
    labelEn: "Energy from Discard to Hand",
    category: "trainer",
    subCategory: "energy",
    description: "从弃牌堆回收能量卡到手牌",
    params: [
      { name: "count", label: "数量", type: "number", defaultValue: 1, min: 1, max: 5 },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "attach_energy_from_discard",
    label: "弃牌堆能量附加",
    labelEn: "Attach Energy from Discard",
    category: "trainer",
    subCategory: "energy",
    description: "从弃牌堆取能量附加到宝可梦",
    params: [
      { name: "count", label: "数量", type: "number", defaultValue: 1, min: 1, max: 5 },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "recover_from_discard",
    label: "弃牌堆回收",
    labelEn: "Recover from Discard",
    category: "trainer",
    subCategory: "energy",
    description: "从弃牌堆回收指定类型的卡",
    params: [
      { name: "count", label: "数量", type: "number", defaultValue: 1, min: 1, max: 5 },
      { name: "filterType", label: "类型筛选", type: "card_filter", defaultValue: "any", options: CARD_FILTER_OPTIONS },
    ],
    examples: [],
    usesPrompt: true,
  },

  // ─── Disruption ───
  {
    id: "discard_stadium",
    label: "弃竞技场",
    labelEn: "Discard Stadium",
    category: "trainer",
    subCategory: "disruption",
    description: "弃掉场上的竞技场卡",
    params: [],
    examples: [],
  },
  {
    id: "discard_opp_hand_random",
    label: "弃对方手牌",
    labelEn: "Discard Opponent Hand",
    category: "trainer",
    subCategory: "disruption",
    description: "随机弃掉对方手牌",
    params: [
      { name: "count", label: "弃牌数", type: "number", defaultValue: 1, min: 1, max: 5 },
    ],
    examples: [],
  },
];

// ═══════════════════════════════════════════
// Ability Patterns
// ═══════════════════════════════════════════

export const abilityPatterns: PatternEntry[] = [
  // ─── Passive Defense ───
  {
    id: "passive_damage_reduction",
    label: "被动减伤",
    labelEn: "Passive Damage Reduction",
    category: "ability",
    subCategory: "passive_defense",
    description: "被动减少受到的伤害",
    params: [
      { name: "amount", label: "减伤量", type: "number", defaultValue: 20, min: 10, max: 100 },
    ],
    examples: ["Eevee - Adaptability"],
  },
  {
    id: "passive_opp_damage_reduce",
    label: "减少对方攻击力",
    labelEn: "Reduce Opponent Damage",
    category: "ability",
    subCategory: "passive_defense",
    description: "对方攻击造成的伤害减少",
    params: [
      { name: "amount", label: "减伤量", type: "number", defaultValue: 20, min: 10, max: 100 },
    ],
    examples: [],
  },
  {
    id: "passive_prevent_bench_damage",
    label: "防止板凳伤害",
    labelEn: "Prevent Bench Damage",
    category: "ability",
    subCategory: "passive_defense",
    description: "防止对方攻击对板凳宝可梦造成伤害",
    params: [],
    examples: [],
  },

  // ─── Passive Boost ───
  {
    id: "passive_damage_boost_self",
    label: "被动加伤",
    labelEn: "Passive Damage Boost",
    category: "ability",
    subCategory: "passive_boost",
    description: "己方攻击额外增加伤害",
    params: [
      { name: "amount", label: "加伤量", type: "number", defaultValue: 20, min: 10, max: 100 },
    ],
    examples: [],
  },
  {
    id: "passive_damage_boost_typed",
    label: "属性加伤",
    labelEn: "Typed Damage Boost",
    category: "ability",
    subCategory: "passive_boost",
    description: "指定属性宝可梦攻击额外增加伤害",
    params: [
      { name: "amount", label: "加伤量", type: "number", defaultValue: 20, min: 10, max: 100 },
      { name: "pokemonType", label: "宝可梦属性", type: "energy_type", defaultValue: "Fire", options: ENERGY_TYPE_OPTIONS },
    ],
    examples: [],
  },

  // ─── Passive Movement ───
  {
    id: "passive_no_retreat_cost",
    label: "免费撤退",
    labelEn: "No Retreat Cost",
    category: "ability",
    subCategory: "passive_movement",
    description: "撤退费用为0",
    params: [],
    examples: [],
  },
  {
    id: "passive_reduce_retreat",
    label: "减少撤退费用",
    labelEn: "Reduce Retreat Cost",
    category: "ability",
    subCategory: "passive_movement",
    description: "减少撤退费用",
    params: [
      { name: "amount", label: "减少量", type: "number", defaultValue: 1, min: 1, max: 4 },
    ],
    examples: [],
  },

  // ─── On Evolve ───
  {
    id: "on_evolve_search_deck",
    label: "进化时检索",
    labelEn: "On Evolve Search",
    category: "ability",
    subCategory: "on_evolve",
    description: "进化时从卡组检索卡片",
    params: [
      { name: "count", label: "检索数", type: "number", defaultValue: 1, min: 1, max: 3 },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "on_evolve_draw",
    label: "进化时抽卡",
    labelEn: "On Evolve Draw",
    category: "ability",
    subCategory: "on_evolve",
    description: "进化时抽取卡片",
    params: [
      { name: "count", label: "抽卡数", type: "number", defaultValue: 3, min: 1, max: 5 },
    ],
    examples: [],
  },
  {
    id: "on_evolve_heal",
    label: "进化时治疗",
    labelEn: "On Evolve Heal",
    category: "ability",
    subCategory: "on_evolve",
    description: "进化时治疗自身",
    params: [
      { name: "amount", label: "治疗量", type: "number", defaultValue: 50, min: 10, max: 200 },
    ],
    examples: [],
  },
  {
    id: "on_evolve_switch_opponent",
    label: "进化时切换对方",
    labelEn: "On Evolve Switch Opponent",
    category: "ability",
    subCategory: "on_evolve",
    description: "进化时切换对方的当前战斗宝可梦",
    params: [],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "on_evolve_discard_opp_energy",
    label: "进化时弃对方能量",
    labelEn: "On Evolve Discard Opponent Energy",
    category: "ability",
    subCategory: "on_evolve",
    description: "进化时弃掉对方一个能量",
    params: [],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "on_evolve_attach_from_discard",
    label: "进化时附加能量",
    labelEn: "On Evolve Attach from Discard",
    category: "ability",
    subCategory: "on_evolve",
    description: "进化时从弃牌堆附加能量",
    params: [
      { name: "count", label: "能量数", type: "number", defaultValue: 1, min: 1, max: 3 },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "on_evolve_damage_counters",
    label: "进化时放置伤害标记",
    labelEn: "On Evolve Damage Counters",
    category: "ability",
    subCategory: "on_evolve",
    description: "进化时在对方宝可梦上放置伤害标记",
    params: [
      { name: "counters", label: "伤害标记数", type: "number", defaultValue: 2, min: 1, max: 10, hint: "每个标记等于10点伤害" },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "on_evolve_discard_opp_hand",
    label: "进化时弃对方手牌",
    labelEn: "On Evolve Discard Opponent Hand",
    category: "ability",
    subCategory: "on_evolve",
    description: "进化时对方弃掉手牌",
    params: [
      { name: "count", label: "弃牌数", type: "number", defaultValue: 1, min: 1, max: 5 },
    ],
    examples: [],
  },

  // ─── Activated ───
  {
    id: "activated_draw",
    label: "特性抽卡",
    labelEn: "Activated Draw",
    category: "ability",
    subCategory: "activated",
    description: "使用特性抽取卡片（每回合一次）",
    params: [
      { name: "count", label: "抽卡数", type: "number", defaultValue: 2, min: 1, max: 5 },
    ],
    examples: [],
  },
  {
    id: "activated_draw_until",
    label: "特性抽到指定数",
    labelEn: "Activated Draw Until",
    category: "ability",
    subCategory: "activated",
    description: "使用特性抽卡直到手牌达到指定数量",
    params: [
      { name: "targetHandSize", label: "目标手牌数", type: "number", defaultValue: 6, min: 1, max: 10 },
    ],
    examples: [],
  },
  {
    id: "activated_heal",
    label: "特性治疗",
    labelEn: "Activated Heal",
    category: "ability",
    subCategory: "activated",
    description: "使用特性治疗一只宝可梦",
    params: [
      { name: "amount", label: "治疗量", type: "number", defaultValue: 30, min: 10, max: 200 },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "activated_search_energy_attach",
    label: "特性检索能量附加",
    labelEn: "Activated Search Energy Attach",
    category: "ability",
    subCategory: "activated",
    description: "使用特性从卡组检索能量并附加",
    params: [
      { name: "energyType", label: "能量类型", type: "energy_type", defaultValue: "", options: [
        { value: "", label: "任意 (Any)" },
        ...ENERGY_TYPE_OPTIONS,
      ], hint: "留空表示任意类型" },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "activated_move_energy",
    label: "特性转移能量",
    labelEn: "Activated Move Energy",
    category: "ability",
    subCategory: "activated",
    description: "使用特性在己方宝可梦之间转移能量",
    params: [],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "activated_search_basic_bench",
    label: "特性检索基础上场",
    labelEn: "Activated Search Basic to Bench",
    category: "ability",
    subCategory: "activated",
    description: "使用特性从卡组检索基础宝可梦放到板凳",
    params: [
      { name: "count", label: "数量", type: "number", defaultValue: 1, min: 1, max: 3 },
    ],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "activated_look_top",
    label: "特性看牌顶",
    labelEn: "Activated Look at Top",
    category: "ability",
    subCategory: "activated",
    description: "使用特性查看卡组顶部的卡",
    params: [
      { name: "count", label: "查看数", type: "number", defaultValue: 3, min: 1, max: 7 },
    ],
    examples: [],
  },
  {
    id: "activated_switch_self",
    label: "特性切换自身",
    labelEn: "Activated Switch Self",
    category: "ability",
    subCategory: "activated",
    description: "使用特性切换当前战斗宝可梦",
    params: [],
    examples: [],
    usesPrompt: true,
  },
  {
    id: "activated_discard_draw",
    label: "特性弃牌抽卡",
    labelEn: "Activated Discard and Draw",
    category: "ability",
    subCategory: "activated",
    description: "弃掉指定数量的手牌后抽取卡片",
    params: [
      { name: "discardCount", label: "弃牌数", type: "number", defaultValue: 1, min: 1, max: 5 },
      { name: "drawCount", label: "抽卡数", type: "number", defaultValue: 2, min: 1, max: 5 },
    ],
    examples: [],
  },
];

// ═══════════════════════════════════════════
// Catalog API
// ═══════════════════════════════════════════

/** All patterns combined */
export const allPatterns: PatternEntry[] = [
  ...attackPatterns,
  ...trainerPatterns,
  ...abilityPatterns,
];

/** Get all patterns for a category */
export function getPatternsByCategory(category: PatternCategory): PatternEntry[] {
  return allPatterns.filter((p) => p.category === category);
}

/** Get all patterns grouped by sub-category */
export function getPatternsBySubCategory(category: PatternCategory): Map<string, PatternEntry[]> {
  const grouped = new Map<string, PatternEntry[]>();
  for (const p of allPatterns) {
    if (p.category !== category) continue;
    const list = grouped.get(p.subCategory) || [];
    list.push(p);
    grouped.set(p.subCategory, list);
  }
  return grouped;
}

/** Look up a single pattern by ID */
export function getPatternById(id: string): PatternEntry | undefined {
  return allPatterns.find((p) => p.id === id);
}

/** Get sub-category display labels */
export function getSubCategoryLabels(category: PatternCategory): Record<string, string> {
  switch (category) {
    case "attack":
      return {
        status: "异常状态",
        coin: "硬币翻转",
        damage_mod: "伤害修正",
        self_effect: "自身效果",
        opponent: "对手效果",
        card_draw: "抽卡",
        special: "特殊",
      };
    case "trainer":
      return {
        draw: "抽卡",
        search: "检索",
        switch: "切换",
        heal: "治疗",
        energy: "能量",
        disruption: "干扰",
        discard: "弃牌",
      };
    case "ability":
      return {
        passive_defense: "被动防御",
        passive_boost: "被动增伤",
        passive_movement: "移动",
        on_evolve: "进化时",
        activated: "主动特性",
      };
  }
}

/** Get total pattern counts by category */
export function getPatternCounts(): { attack: number; trainer: number; ability: number; total: number } {
  return {
    attack: attackPatterns.length,
    trainer: trainerPatterns.length,
    ability: abilityPatterns.length,
    total: allPatterns.length,
  };
}
