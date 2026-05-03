/**
 * ============================================================================
 * PTCG Effect Pattern Catalog v1.0
 * ============================================================================
 *
 * 核心理念：PTCG 卡牌文本的效果模式是有限的。
 * 将所有卡牌效果归纳为 ~30 种可枚举的模式，每个模式对应一个原子动作模板。
 * LLM 只需要识别"这张卡属于哪个模式"，不需要从零生成动作序列。
 *
 * 模式分类：
 *   A. 伤害模式 (Damage Patterns)           — 10 种
 *   B. 能量模式 (Energy Patterns)            — 5 种
 *   C. 卡牌移动模式 (Card Movement Patterns) — 6 种
 *   D. 状态模式 (Status Patterns)            — 4 种
 *   E. 流程控制模式 (Flow Patterns)          — 5 种
 *   F. 复合模式 (Composite Patterns)         — 用于嵌套组合
 * ============================================================================
 */

// ─────────────────────────────────────────────
// 模式 ID 枚举
// ─────────────────────────────────────────────
export enum PatternId {
  // ═══ A. 伤害模式 ═══
  /** A1: 固定伤害 — "造成 X 伤害" */
  DMG_FLAT = 'DMG_FLAT',
  /** A2: 伤害+自我消耗 — "造成 X 伤害。丢弃 N 张能量" */
  DMG_SELF_DISCARD = 'DMG_SELF_DISCARD',
  /** A3: 条件加成伤害 — "造成 X 伤害。若满足条件 C，额外造成 Y 伤害" */
  DMG_CONDITIONAL_BONUS = 'DMG_CONDITIONAL_BONUS',
  /** A4: 翻币伤害 — "翻硬币直到出现反面，每个正面造成 X 伤害" */
  DMG_COIN_FLIP_REPEAT = 'DMG_COIN_FLIP_REPEAT',
  /** A5: 翻币 N 次伤害 — "翻 N 次硬币，每个正面造成 X 伤害" */
  DMG_COIN_FLIP_N = 'DMG_COIN_FLIP_N',
  /** A6: 动态计算伤害 — "造成的伤害等于 X × 某个数量" */
  DMG_DYNAMIC_MULTIPLIER = 'DMG_DYNAMIC_MULTIPLIER',
  /** A7: 全场伤害 — "对对手所有备战区宝可梦各造成 X 伤害" */
  DMG_BENCH_SPREAD = 'DMG_BENCH_SPREAD',
  /** A8: 多目标分配 — "对对手的宝可梦造成共 X 伤害，任意分配" */
  DMG_DISTRIBUTE = 'DMG_DISTRIBUTE',
  /** A9: 放置伤害指示物 — "在目标上放置 N 个伤害指示物"（绕过弱点/抗性） */
  DMG_PLACE_COUNTERS = 'DMG_PLACE_COUNTERS',
  /** A10: 自伤/反冲 — "此宝可梦也受到 X 伤害" */
  DMG_RECOIL = 'DMG_RECOIL',
  /** A11: 移动伤害指示物 — "将伤害指示物从一方移动到另一方" */
  DMG_MOVE_COUNTERS = 'DMG_MOVE_COUNTERS',

  // ═══ B. 能量模式 ═══
  /** B1: 能量加速 — "从牌库/弃牌区搜索 N 张能量卡，贴到宝可梦身上" */
  NRG_ACCELERATE = 'NRG_ACCELERATE',
  /** B2: 能量转移 — "将能量从一只宝可梦移动到另一只" */
  NRG_MOVE = 'NRG_MOVE',
  /** B3: 能量丢弃 — "丢弃目标上的 N 张能量" */
  NRG_DISCARD_TARGET = 'NRG_DISCARD_TARGET',
  /** B4: 能量回收 — "从弃牌区将 N 张能量卡加入手牌" */
  NRG_RECOVER = 'NRG_RECOVER',
  /** B5: 特殊能量附加效果 — "贴有此能量的宝可梦获得额外效果" */
  NRG_SPECIAL_EFFECT = 'NRG_SPECIAL_EFFECT',

  // ═══ C. 卡牌移动模式 ═══
  /** C1: 搜索牌库 — "从牌库中搜索最多 N 张满足条件的卡" */
  CARD_SEARCH_DECK = 'CARD_SEARCH_DECK',
  /** C2: 抽卡 — "抽 N 张卡" */
  CARD_DRAW = 'CARD_DRAW',
  /** C3: 弃牌 — "丢弃 N 张手牌" */
  CARD_DISCARD_HAND = 'CARD_DISCARD_HAND',
  /** C4: 洗手重抽 — "将手牌洗入牌库，然后抽 N 张" */
  CARD_SHUFFLE_DRAW = 'CARD_SHUFFLE_DRAW',
  /** C5: 回收 — "从弃牌区将 N 张卡加入手牌/牌库" */
  CARD_RECOVER = 'CARD_RECOVER',
  /** C6: 窥视 — "查看牌库顶 N 张卡" */
  CARD_PEEK = 'CARD_PEEK',

  // ═══ D. 状态模式 ═══
  /** D1: 施加异常状态 — "目标宝可梦陷入中毒/灼伤/睡眠/麻痹/混乱" */
  STATUS_APPLY = 'STATUS_APPLY',
  /** D2: 治疗 — "治疗此宝可梦 X 点伤害" */
  STATUS_HEAL = 'STATUS_HEAL',
  /** D3: 减伤屏障 — "下个回合，此宝可梦受到的伤害减少 X" */
  STATUS_DAMAGE_REDUCTION = 'STATUS_DAMAGE_REDUCTION',
  /** D4: 效果免疫 — "下个回合，此宝可梦不受效果影响" */
  STATUS_IMMUNITY = 'STATUS_IMMUNITY',

  // ═══ E. 流程控制模式 ═══
  /** E1: 强制切换 — "将对手的战斗宝可梦替换为备战区宝可梦" */
  FLOW_FORCE_SWITCH = 'FLOW_FORCE_SWITCH',
  /** E2: 撤退到备战 — "将此宝可梦替换为备战区宝可梦" */
  FLOW_SELF_SWITCH = 'FLOW_SELF_SWITCH',
  /** E3: 进化加速 — "从牌库搜索进化卡直接进化" */
  FLOW_EVOLVE = 'FLOW_EVOLVE',
  /** E4: 锁定/封锁 — "对手下一回合不能使用支援者/物品/特性" */
  FLOW_LOCK = 'FLOW_LOCK',
  /** E5: 奖赏卡操作 — "额外获得/查看奖赏卡" */
  FLOW_PRIZE_MANIPULATION = 'FLOW_PRIZE_MANIPULATION',
  /** E6: 撤退费用修改 — "撤退费用减少/增加 N" */
  FLOW_RETREAT_COST_MOD = 'FLOW_RETREAT_COST_MOD',
}

// ─────────────────────────────────────────────
// 模式定义结构
// ─────────────────────────────────────────────

/** 参数槽位 — 每个模式的可变部分 */
export interface PatternSlot {
  name: string;
  type: 'number' | 'string' | 'energy_type' | 'zone' | 'condition' | 'special_condition' | 'card_filter' | 'boolean';
  description: string;
  required: boolean;
  defaultValue?: any;
}

/** 效果模式定义 */
export interface EffectPattern {
  id: PatternId;
  category: 'damage' | 'energy' | 'card_movement' | 'status' | 'flow';
  /** 中文名 */
  nameCN: string;
  /** 自然语言描述（供 LLM 匹配参考） */
  description: string;
  /** 典型的卡牌文本样本（中文 + 英文） */
  textExamples: string[];
  /** 该模式的可填参数 */
  slots: PatternSlot[];
  /** 生成原子动作序列的模板函数签名说明 */
  templateNote: string;
}

// ─────────────────────────────────────────────
// 完整模式库定义
// ─────────────────────────────────────────────

export const PATTERN_CATALOG: Record<PatternId, EffectPattern> = {

  // ═══════════════════════════════════════════
  // A. 伤害模式
  // ═══════════════════════════════════════════

  [PatternId.DMG_FLAT]: {
    id: PatternId.DMG_FLAT,
    category: 'damage',
    nameCN: '固定伤害',
    description: '对目标造成固定数值的伤害，无附加条件。',
    textExamples: [
      '造成 120 伤害。',
      'This attack does 120 damage.',
      '造成 60 伤害。',
    ],
    slots: [
      { name: 'damage', type: 'number', description: '伤害数值', required: true },
    ],
    templateNote: `生成: [{ type: 'deal_damage', amount: {damage}, damageTag: 'attack' }]`,
  },

  [PatternId.DMG_SELF_DISCARD]: {
    id: PatternId.DMG_SELF_DISCARD,
    category: 'damage',
    nameCN: '伤害+自我消耗',
    description: '造成伤害，同时需要丢弃自身的能量/卡牌作为代价。',
    textExamples: [
      '造成 280 伤害。丢弃此宝可梦身上的 3 张火能量。',
      '造成 220 伤害。丢弃此宝可梦身上的所有能量。',
      'This attack does 280 damage. Discard 3 Fire Energy from this Pokémon.',
    ],
    slots: [
      { name: 'damage', type: 'number', description: '伤害数值', required: true },
      { name: 'discardCount', type: 'number', description: '丢弃数量。-1 表示"所有"', required: true },
      { name: 'discardType', type: 'energy_type', description: '指定丢弃的能量类型。"any" 表示不限', required: true },
    ],
    templateNote: `生成: [
      { type: 'deal_damage', amount: {damage}, damageTag: 'attack' },
      { type: 'discard_energy', from: self.active, energyType: {discardType}, count: {discardCount} }
    ]`,
  },

  [PatternId.DMG_CONDITIONAL_BONUS]: {
    id: PatternId.DMG_CONDITIONAL_BONUS,
    category: 'damage',
    nameCN: '条件加成伤害',
    description: '造成基础伤害，若满足特定条件则额外增加伤害。条件包括：本回合进化、对手已取奖赏、目标有异常状态、竞技场在场等。',
    textExamples: [
      '造成 180 伤害。如果这只宝可梦在这个回合中从手牌进化而来，额外造成 100 伤害。',
      '造成 180 伤害。对手每取过 1 张奖赏卡，此招式额外造成 30 伤害。',
      '造成 100 伤害。如果对方的战斗宝可梦有异常状态，此招式额外造成 120 伤害。',
      'This attack does 180 damage plus 30 more damage for each Prize card your opponent has taken.',
    ],
    slots: [
      { name: 'baseDamage', type: 'number', description: '基础伤害', required: true },
      { name: 'condition', type: 'condition', description: '触发条件的结构化描述', required: true },
      { name: 'bonusDamage', type: 'number', description: '额外伤害（固定值或单位值）', required: true },
      { name: 'isPerUnit', type: 'boolean', description: '是否按单位计算（每 X 个 +Y）', required: true, defaultValue: false },
    ],
    templateNote: `生成: [{
      type: 'conditional',
      condition: {condition},
      ifTrue: [{ type: 'deal_damage', amount: {baseDamage} + {bonusDamage}(×count), damageTag: 'attack' }],
      ifFalse: [{ type: 'deal_damage', amount: {baseDamage}, damageTag: 'attack' }]
    }]`,
  },

  [PatternId.DMG_COIN_FLIP_REPEAT]: {
    id: PatternId.DMG_COIN_FLIP_REPEAT,
    category: 'damage',
    nameCN: '翻币循环伤害',
    description: '翻硬币直到出现反面，每个正面造成固定伤害。',
    textExamples: [
      '翻硬币直到出现反面。每出现一个正面，造成 100 伤害。',
      'Flip a coin until you get tails. This attack does 100 damage for each heads.',
    ],
    slots: [
      { name: 'damagePerHeads', type: 'number', description: '每个正面的伤害', required: true },
    ],
    templateNote: `生成: [{
      type: 'flip_coin', mode: 'until_tails',
      onResult: { type: 'deal_damage', amount: headsCount × {damagePerHeads}, damageTag: 'attack' }
    }]`,
  },

  [PatternId.DMG_COIN_FLIP_N]: {
    id: PatternId.DMG_COIN_FLIP_N,
    category: 'damage',
    nameCN: '翻币N次伤害',
    description: '翻 N 次硬币，根据正面次数造成伤害。',
    textExamples: [
      '翻 4 次硬币。每出现一个正面，造成 60 伤害。',
      'Flip 4 coins. This attack does 60 damage for each heads.',
    ],
    slots: [
      { name: 'flipCount', type: 'number', description: '翻币次数', required: true },
      { name: 'damagePerHeads', type: 'number', description: '每个正面的伤害', required: true },
    ],
    templateNote: `生成: [{
      type: 'flip_coin', mode: 'flip_n', count: {flipCount},
      onResult: { type: 'deal_damage', amount: headsCount × {damagePerHeads}, damageTag: 'attack' }
    }]`,
  },

  [PatternId.DMG_DYNAMIC_MULTIPLIER]: {
    id: PatternId.DMG_DYNAMIC_MULTIPLIER,
    category: 'damage',
    nameCN: '动态乘算伤害',
    description: '伤害数值根据场上某个可变量动态计算（如能量数量、手牌数量、伤害指示物等）。',
    textExamples: [
      '此招式的伤害等于此宝可梦身上附加的能量数量 × 60。',
      '造成的伤害等于对手手牌数量 × 20。',
      '此招式每有 1 个伤害指示物在此宝可梦身上，就额外造成 10 伤害。',
      'This attack does 60 damage for each Energy attached to this Pokémon.',
    ],
    slots: [
      { name: 'source', type: 'condition', description: '计数来源（能量/手牌/指示物等）', required: true },
      { name: 'multiplier', type: 'number', description: '每单位的伤害值', required: true },
      { name: 'baseDamage', type: 'number', description: '基础伤害（叠加在动态伤害之上）', required: false, defaultValue: 0 },
    ],
    templateNote: `生成: [{
      type: 'dynamic_value', source: {source}, multiplier: {multiplier},
      action: { type: 'deal_damage', amount: {baseDamage} + count × {multiplier}, damageTag: 'attack' }
    }]`,
  },

  [PatternId.DMG_BENCH_SPREAD]: {
    id: PatternId.DMG_BENCH_SPREAD,
    category: 'damage',
    nameCN: '全场扩散伤害',
    description: '对对手备战区的每只（或全部）宝可梦造成伤害。注意：备战区伤害不受弱点/抗性影响。',
    textExamples: [
      '对对手所有备战区宝可梦各造成 20 伤害。',
      '造成 120 伤害。对对手 1 只备战区宝可梦造成 30 伤害。',
      "This attack does 20 damage to each of your opponent's Benched Pokémon.",
    ],
    slots: [
      { name: 'mainDamage', type: 'number', description: '对战斗场的伤害（可为0）', required: true },
      { name: 'benchDamage', type: 'number', description: '对备战区每只的伤害', required: true },
      { name: 'benchTargetCount', type: 'number', description: '影响备战区宝可梦数量。-1=全部', required: true, defaultValue: -1 },
    ],
    templateNote: `生成: [
      { type: 'deal_damage', target: opponent.active, amount: {mainDamage}, damageTag: 'attack' },
      { type: 'for_each', targets: opponent.bench(count:{benchTargetCount}),
        action: { type: 'deal_damage', amount: {benchDamage}, damageTag: 'bench_effect' } }
    ] 注意：benchDamage 用 bench_effect tag，不走弱点/抗性管线`,
  },

  [PatternId.DMG_DISTRIBUTE]: {
    id: PatternId.DMG_DISTRIBUTE,
    category: 'damage',
    nameCN: '分配伤害',
    description: '对对手的宝可梦造成总计 X 的伤害指示物，由玩家任意分配。',
    textExamples: [
      '在对手的宝可梦身上任意放置 12 个伤害指示物。',
      "Put 12 damage counters on your opponent's Pokémon in any way you like.",
    ],
    slots: [
      { name: 'totalCounters', type: 'number', description: '总伤害指示物数', required: true },
      { name: 'targetScope', type: 'string', description: '"all"(全场) 或 "bench_only" 或 "active_only"', required: true, defaultValue: 'all' },
    ],
    templateNote: `生成: [{
      type: 'player_choice', choiceType: 'distribute_counters',
      totalCounters: {totalCounters}, targets: opponent.pokemon({targetScope}),
      action: { type: 'place_damage_counters', ... } // 按玩家分配执行
    }]`,
  },

  [PatternId.DMG_PLACE_COUNTERS]: {
    id: PatternId.DMG_PLACE_COUNTERS,
    category: 'damage',
    nameCN: '放置伤害指示物',
    description: '直接在目标上放置指定数量的伤害指示物。注意：这不是"攻击伤害"，绕过弱点/抗性。通常出现在特性和物品卡效果中。',
    textExamples: [
      '在此宝可梦身上放置 2 个伤害指示物。',
      '在对手的战斗宝可梦身上放置 3 个伤害指示物。',
      "Put 2 damage counters on this Pokémon.",
    ],
    slots: [
      { name: 'counters', type: 'number', description: '伤害指示物数量', required: true },
      { name: 'target', type: 'string', description: '目标选择器', required: true },
    ],
    templateNote: `生成: [{ type: 'place_damage_counters', target: {target}, counters: {counters} }]
    ★ 关键区分：damageTag 不是 'attack'，不走弱点/抗性管线`,
  },

  [PatternId.DMG_RECOIL]: {
    id: PatternId.DMG_RECOIL,
    category: 'damage',
    nameCN: '反冲/自伤',
    description: '造成伤害的同时，自身也受到伤害或放置伤害指示物。',
    textExamples: [
      '造成 200 伤害。此宝可梦也受到 50 伤害。',
      'This attack does 200 damage. This Pokémon also does 50 damage to itself.',
    ],
    slots: [
      { name: 'damage', type: 'number', description: '对目标的伤害', required: true },
      { name: 'recoilDamage', type: 'number', description: '自身受到的伤害', required: true },
      { name: 'recoilType', type: 'string', description: '"damage"(走管线) 或 "counters"(放指示物)', required: true, defaultValue: 'damage' },
    ],
    templateNote: `生成: [
      { type: 'deal_damage', target: opponent.active, amount: {damage}, damageTag: 'attack' },
      { type: 'deal_damage'|'place_damage_counters', target: self.active, amount: {recoilDamage} }
    ]`,
  },

  [PatternId.DMG_MOVE_COUNTERS]: {
    id: PatternId.DMG_MOVE_COUNTERS,
    category: 'damage',
    nameCN: '移动伤害指示物',
    description: '将伤害指示物从己方宝可梦移动到对手宝可梦身上。',
    textExamples: [
      'Move 2 damage counters from each of your Pokémon to 1 of your opponent\'s Pokémon.',
    ],
    slots: [
      { name: 'from', type: 'zone', description: '指示物来源', required: true },
      { name: 'to', type: 'zone', description: '指示物目标', required: true },
      { name: 'counters', type: 'number', description: '每只移动的指示物数', required: true },
      { name: 'fromScope', type: 'string', description: '"each"(每只) 或 "total"(总计)', required: false, defaultValue: 'each' },
    ],
    templateNote: `生成: [{ type: 'move_damage_counters', from, to, counters, fromScope }]`,
  },

  // ═══════════════════════════════════════════
  // B. 能量模式
  // ═══════════════════════════════════════════

  [PatternId.NRG_ACCELERATE]: {
    id: PatternId.NRG_ACCELERATE,
    category: 'energy',
    nameCN: '能量加速',
    description: '从牌库/弃牌区搜索能量卡并贴到宝可梦身上，突破每回合 1 能量的限制。这是 PTCG 中最核心的加速机制。',
    textExamples: [
      '从你的牌库中搜索最多 3 张基础火能量卡，以任意方式贴到你的宝可梦身上。',
      '从你的弃牌区选择 1 张基础超能力能量卡，贴到你的 1 只宝可梦身上。',
      '当你从手牌进化到此宝可梦时，从你的牌库中搜索最多 3 张基础能量卡，以任意方式贴到你的宝可梦身上。',
      "Search your deck for up to 3 basic Fire Energy cards and attach them to your Pokémon in any way you like.",
    ],
    slots: [
      { name: 'source', type: 'zone', description: '来源区域: "deck" 或 "discard"', required: true },
      { name: 'energyType', type: 'energy_type', description: '能量类型。"basic_any" 表示任意基础能量', required: true },
      { name: 'count', type: 'number', description: '数量（"最多"用 maxCount 表示上限）', required: true },
      { name: 'attachTarget', type: 'string', description: '贴到哪里: "any_own"(任意分配) / "self"(此宝可梦) / "choice"(选1只)', required: true },
    ],
    templateNote: `生成: [
      { type: 'search_deck'|'search_discard', filter: basicEnergy({energyType}), count: {count} },
      { type: 'player_choice', choiceType: 'distribute_energy', targets: self.pokemon },
      { type: 'attach_energy', ... } // 按分配执行
    ]`,
  },

  [PatternId.NRG_MOVE]: {
    id: PatternId.NRG_MOVE,
    category: 'energy',
    nameCN: '能量转移',
    description: '将能量从一只宝可梦移动到另一只。',
    textExamples: [
      '你可以将你场上宝可梦身上的 1 张能量卡，移动到你的另 1 只宝可梦身上。',
      "Move an Energy from 1 of your Pokémon to another of your Pokémon.",
    ],
    slots: [
      { name: 'count', type: 'number', description: '移动能量的数量', required: true },
      { name: 'energyType', type: 'energy_type', description: '限定能量类型，"any"不限', required: true, defaultValue: 'any' },
      { name: 'fromScope', type: 'string', description: '"any_own" / "active" / "bench"', required: true },
      { name: 'toScope', type: 'string', description: '"any_own" / "active" / "bench"', required: true },
    ],
    templateNote: `生成: [
      { type: 'player_choice', choiceType: 'select_pokemon', scope: {fromScope} },
      { type: 'player_choice', choiceType: 'select_pokemon', scope: {toScope} },
      { type: 'move_energy', count: {count}, energyType: {energyType} }
    ]`,
  },

  [PatternId.NRG_DISCARD_TARGET]: {
    id: PatternId.NRG_DISCARD_TARGET,
    category: 'energy',
    nameCN: '丢弃目标能量',
    description: '丢弃对手宝可梦身上的能量卡。',
    textExamples: [
      '丢弃对手战斗宝可梦身上的 1 张能量卡。',
      "Discard an Energy from your opponent's Active Pokémon.",
    ],
    slots: [
      { name: 'count', type: 'number', description: '丢弃数量', required: true },
      { name: 'target', type: 'string', description: '目标选择器', required: true },
      { name: 'energyType', type: 'energy_type', description: '限定类型，"any"不限', required: true, defaultValue: 'any' },
      { name: 'chooser', type: 'string', description: '"self"(己方选) 或 "opponent"(对方选)', required: true, defaultValue: 'self' },
    ],
    templateNote: `生成: [
      { type: 'player_choice', player: {chooser}, choiceType: 'select_energy', target: {target} },
      { type: 'discard_energy', count: {count} }
    ]`,
  },

  [PatternId.NRG_RECOVER]: {
    id: PatternId.NRG_RECOVER,
    category: 'energy',
    nameCN: '能量回收',
    description: '从弃牌区回收能量卡到手牌。',
    textExamples: [
      '从你的弃牌区选择最多 2 张基础能量卡，加入你的手牌。',
      "Put up to 2 basic Energy cards from your discard pile into your hand.",
    ],
    slots: [
      { name: 'count', type: 'number', description: '回收数量', required: true },
      { name: 'energyType', type: 'energy_type', description: '能量类型', required: true, defaultValue: 'basic_any' },
      { name: 'destination', type: 'zone', description: '"hand" 或 "deck"', required: true, defaultValue: 'hand' },
    ],
    templateNote: `生成: [
      { type: 'search_discard', filter: energy({energyType}), count: {count} },
      { type: 'move_card', to: {destination} }
    ]`,
  },

  [PatternId.NRG_SPECIAL_EFFECT]: {
    id: PatternId.NRG_SPECIAL_EFFECT,
    category: 'energy',
    nameCN: '特殊能量附加效果',
    description: '特殊能量卡自带的持续效果（贴上后生效，丢弃后失效）。',
    textExamples: [
      '贴有此卡的宝可梦撤退所需的能量减少 1 个。',
      '贴有此卡的宝可梦使用招式时，造成的伤害增加 20。',
      "The Retreat Cost of the Pokémon this card is attached to is 1 less.",
    ],
    slots: [
      { name: 'modifierType', type: 'string', description: '修饰器类型', required: true },
      { name: 'modifierValue', type: 'number', description: '修饰值', required: true },
    ],
    templateNote: `生成: [{
      type: 'register_modifier', scope: 'while_attached',
      modifier: { type: {modifierType}, value: {modifierValue} }
    }]`,
  },

  // ═══════════════════════════════════════════
  // C. 卡牌移动模式
  // ═══════════════════════════════════════════

  [PatternId.CARD_SEARCH_DECK]: {
    id: PatternId.CARD_SEARCH_DECK,
    category: 'card_movement',
    nameCN: '搜索牌库',
    description: '从牌库中搜索指定条件的卡牌。几乎所有球类道具、部分支援者都使用此模式。',
    textExamples: [
      '从你的牌库中搜索 1 张基础宝可梦卡，放到备战区。',
      '从你的牌库中搜索 1 张训练家卡，加入你的手牌。然后洗牌。',
      "Search your deck for a Basic Pokémon and put it onto your Bench.",
    ],
    slots: [
      { name: 'filter', type: 'card_filter', description: '搜索条件', required: true },
      { name: 'count', type: 'number', description: '搜索数量', required: true },
      { name: 'destination', type: 'zone', description: '目的地: "hand" / "bench" / "deck_top" / "active"', required: true },
      { name: 'revealToOpponent', type: 'boolean', description: '是否展示给对手', required: false, defaultValue: true },
    ],
    templateNote: `生成: [
      { type: 'search_deck', filter: {filter}, count: {count} },
      { type: 'move_card', destination: {destination} },
      { type: 'shuffle_deck' }  // 搜索牌库后必须洗牌
    ]`,
  },

  [PatternId.CARD_DRAW]: {
    id: PatternId.CARD_DRAW,
    category: 'card_movement',
    nameCN: '抽卡',
    description: '从牌库顶抽取卡牌到手牌。',
    textExamples: [
      '抽 3 张卡。',
      '抽卡，直到你的手牌有 6 张。',
      'Draw 3 cards.',
      'Draw cards until you have 6 cards in your hand.',
    ],
    slots: [
      { name: 'count', type: 'number', description: '抽卡数量。-1表示"抽到N张"模式', required: true },
      { name: 'drawUntil', type: 'number', description: '若 count=-1，抽到手牌达到此数量', required: false },
    ],
    templateNote: `生成: [{ type: 'draw_card', count: {count} 或 until: {drawUntil} }]`,
  },

  [PatternId.CARD_DISCARD_HAND]: {
    id: PatternId.CARD_DISCARD_HAND,
    category: 'card_movement',
    nameCN: '弃手牌',
    description: '从手牌中丢弃卡牌。',
    textExamples: [
      '丢弃你的 1 张手牌。',
      '丢弃你的所有手牌。',
      'Discard a card from your hand.',
    ],
    slots: [
      { name: 'count', type: 'number', description: '丢弃数量。-1=全部', required: true },
      { name: 'filter', type: 'card_filter', description: '限定条件（可选）', required: false },
      { name: 'chooser', type: 'string', description: '"self" 或 "opponent"', required: true, defaultValue: 'self' },
    ],
    templateNote: `生成: [
      { type: 'player_choice', player: {chooser}, choiceType: 'select_from_hand', count: {count}, filter: {filter} },
      { type: 'discard_card' }
    ]`,
  },

  [PatternId.CARD_SHUFFLE_DRAW]: {
    id: PatternId.CARD_SHUFFLE_DRAW,
    category: 'card_movement',
    nameCN: '洗手重抽',
    description: '将部分或全部手牌洗入牌库，然后抽新的手牌。典型的"刷新手牌"效果。',
    textExamples: [
      '将你的所有手牌洗入牌库，然后抽 7 张卡。',
      '你可以将最多 2 张手牌洗入牌库。如果这么做了，抽相同数量的卡。',
      "Shuffle your hand into your deck. Then, draw 7 cards.",
    ],
    slots: [
      { name: 'shuffleCount', type: 'number', description: '洗回数量。-1=全部', required: true },
      { name: 'drawCount', type: 'number', description: '重抽数量。-1=与洗回数相同', required: true },
      { name: 'shuffleFilter', type: 'card_filter', description: '洗回条件（可选）', required: false },
    ],
    templateNote: `生成: [
      { type: 'move_card', from: 'hand', to: 'deck', count: {shuffleCount}, filter: {shuffleFilter} },
      { type: 'shuffle_deck' },
      { type: 'draw_card', count: {drawCount} }
    ]`,
  },

  [PatternId.CARD_RECOVER]: {
    id: PatternId.CARD_RECOVER,
    category: 'card_movement',
    nameCN: '回收卡牌',
    description: '从弃牌区回收卡牌到手牌/牌库。',
    textExamples: [
      '从你的弃牌区选择 2 张卡，加入你的手牌。',
      '从你的弃牌区选择 1 张支援者卡，加入你的手牌。',
      "Put 2 cards from your discard pile into your hand.",
    ],
    slots: [
      { name: 'count', type: 'number', description: '回收数量', required: true },
      { name: 'filter', type: 'card_filter', description: '卡牌条件', required: false },
      { name: 'destination', type: 'zone', description: '"hand" / "deck" / "deck_top"', required: true, defaultValue: 'hand' },
    ],
    templateNote: `生成: [
      { type: 'player_choice', choiceType: 'select_from_discard', count: {count}, filter: {filter} },
      { type: 'move_card', to: {destination} }
    ]`,
  },

  [PatternId.CARD_PEEK]: {
    id: PatternId.CARD_PEEK,
    category: 'card_movement',
    nameCN: '窥视牌库',
    description: '查看牌库顶部的卡牌，可能伴随重新排列或选取。',
    textExamples: [
      '查看你的牌库顶 5 张卡。选择其中 1 张加入手牌，将其余以任意顺序放回牌库顶。',
      "Look at the top 5 cards of your deck. Choose 1 of them and put it into your hand.",
    ],
    slots: [
      { name: 'peekCount', type: 'number', description: '查看数量', required: true },
      { name: 'takeCount', type: 'number', description: '可选取加入手牌的数量', required: false, defaultValue: 0 },
      { name: 'reorderRemaining', type: 'boolean', description: '是否可以重排剩余的卡', required: false, defaultValue: false },
    ],
    templateNote: `生成: [
      { type: 'peek_cards', zone: 'deck', count: {peekCount} },
      if takeCount > 0: { type: 'player_choice', choiceType: 'select_from_peeked', count: {takeCount} },
      { type: 'move_card', to: 'hand' },
      { type: 'move_card', remaining, to: 'deck_top', order: {reorderRemaining} ? 'player_choice' : 'original' }
    ]`,
  },

  // ═══════════════════════════════════════════
  // D. 状态模式
  // ═══════════════════════════════════════════

  [PatternId.STATUS_APPLY]: {
    id: PatternId.STATUS_APPLY,
    category: 'status',
    nameCN: '施加异常状态',
    description: '使目标宝可梦陷入异常状态。注意：进入备战区或进化会清除所有异常状态。',
    textExamples: [
      '对手的战斗宝可梦陷入中毒状态。',
      '对手的战斗宝可梦陷入灼伤和混乱状态。',
      "Your opponent's Active Pokémon is now Poisoned.",
    ],
    slots: [
      { name: 'conditions', type: 'special_condition', description: '施加的异常状态列表', required: true },
      { name: 'target', type: 'string', description: '目标选择器', required: true, defaultValue: 'opponent.active' },
    ],
    templateNote: `生成: [
      { type: 'apply_special_condition', target: {target}, condition: {conditions[0]} },
      // 若多个状态，每个单独一条 action
    ]`,
  },

  [PatternId.STATUS_HEAL]: {
    id: PatternId.STATUS_HEAL,
    category: 'status',
    nameCN: '治疗',
    description: '移除宝可梦身上的伤害指示物（治疗HP），或移除异常状态。',
    textExamples: [
      '治疗此宝可梦 30 点伤害。',
      '治疗你的 1 只宝可梦的所有伤害。',
      '移除此宝可梦的所有异常状态。',
      "Heal 30 damage from this Pokémon.",
    ],
    slots: [
      { name: 'healAmount', type: 'number', description: '治疗量。-1=全部', required: true },
      { name: 'target', type: 'string', description: '目标选择器', required: true },
      { name: 'removeConditions', type: 'boolean', description: '是否同时移除异常状态', required: false, defaultValue: false },
    ],
    templateNote: `生成: [
      { type: 'heal_damage', target: {target}, amount: {healAmount} },
      if removeConditions: { type: 'remove_special_condition', target: {target}, condition: 'all' }
    ]`,
  },

  [PatternId.STATUS_DAMAGE_REDUCTION]: {
    id: PatternId.STATUS_DAMAGE_REDUCTION,
    category: 'status',
    nameCN: '减伤屏障',
    description: '在后续回合中减少受到的伤害。通常持续到下一回合结束。',
    textExamples: [
      '在你的对手的下一回合中，此宝可梦受到的伤害减少 30。',
      '在你的下一回合结束之前，此宝可梦受到招式的伤害减少 80。',
      "During your opponent's next turn, this Pokémon takes 30 less damage from attacks.",
    ],
    slots: [
      { name: 'reduction', type: 'number', description: '减伤数值', required: true },
      { name: 'duration', type: 'string', description: '"next_opponent_turn" / "next_own_turn" / "until_end_of_turn"', required: true },
      { name: 'scope', type: 'string', description: '"attacks_only" / "all"', required: true, defaultValue: 'attacks_only' },
    ],
    templateNote: `生成: [{
      type: 'register_modifier',
      modifier: { type: 'damage_reduction', value: -{reduction}, scope: {scope} },
      duration: {duration},
      target: self.active
    }]`,
  },

  [PatternId.STATUS_IMMUNITY]: {
    id: PatternId.STATUS_IMMUNITY,
    category: 'status',
    nameCN: '效果免疫/防护',
    description: '使宝可梦在一段时间内不受招式伤害或效果影响。',
    textExamples: [
      '在你的对手的下一回合中，此宝可梦不受对手的基础宝可梦的招式伤害和效果影响。',
      '翻硬币，正面的话，在对手的下一回合中，此宝可梦不受招式的伤害。',
      "During your opponent's next turn, prevent all damage done to this Pokémon by attacks.",
    ],
    slots: [
      { name: 'immunityType', type: 'string', description: '"all_damage" / "all_effects" / "damage_and_effects"', required: true },
      { name: 'duration', type: 'string', description: '"next_opponent_turn"', required: true },
      { name: 'sourceFilter', type: 'card_filter', description: '来源限定（如"基础宝可梦"）', required: false },
      { name: 'requiresCoinFlip', type: 'boolean', description: '是否需要翻币成功', required: false, defaultValue: false },
    ],
    templateNote: `生成: [{
      type: 'register_modifier',
      modifier: { type: 'immunity', immunityType: {immunityType}, sourceFilter: {sourceFilter} },
      duration: {duration}
    }] // 若 requiresCoinFlip，外层包一层 flip_coin conditional`,
  },

  // ═══════════════════════════════════════════
  // E. 流程控制模式
  // ═══════════════════════════════════════════

  [PatternId.FLOW_FORCE_SWITCH]: {
    id: PatternId.FLOW_FORCE_SWITCH,
    category: 'flow',
    nameCN: '强制切换（呼叫/拉人）',
    description: '强制将对手的战斗宝可梦替换为备战区宝可梦。经典的"Boss命令"效果。',
    textExamples: [
      '将对手的 1 只备战区宝可梦与战斗宝可梦互换。',
      "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon.",
    ],
    slots: [
      { name: 'chooser', type: 'string', description: '"self"(使用者选) 或 "opponent"(对手选)', required: true },
    ],
    templateNote: `生成: [
      { type: 'player_choice', player: {chooser}, choiceType: 'select_bench_pokemon', target: 'opponent' },
      { type: 'switch_pokemon', player: 'opponent' }
    ]`,
  },

  [PatternId.FLOW_SELF_SWITCH]: {
    id: PatternId.FLOW_SELF_SWITCH,
    category: 'flow',
    nameCN: '自我切换',
    description: '将己方战斗宝可梦替换为备战区宝可梦（不需要消耗撤退能量）。',
    textExamples: [
      '你可以将你的战斗宝可梦替换为备战区宝可梦。',
      '将此宝可梦替换为备战区宝可梦。',
      "Switch this Pokémon with 1 of your Benched Pokémon.",
    ],
    slots: [
      { name: 'mandatory', type: 'boolean', description: '是否强制切换（"可以"=false, 无"可以"=true）', required: true },
    ],
    templateNote: `生成: [
      if !mandatory: { type: 'player_choice', choiceType: 'yes_no', prompt: '是否切换？' },
      { type: 'player_choice', choiceType: 'select_bench_pokemon', target: 'self' },
      { type: 'switch_pokemon', player: 'self', freeRetreat: true }
    ]`,
  },

  [PatternId.FLOW_EVOLVE]: {
    id: PatternId.FLOW_EVOLVE,
    category: 'flow',
    nameCN: '进化加速',
    description: '绕过正常的进化规则（如稀有糖果），直接从牌库搜索进化卡进化。',
    textExamples: [
      '从你的牌库中搜索 1 张可以从你的 1 只宝可梦进化的卡，直接进化该宝可梦。',
      '选择你的 1 只基础宝可梦。从牌库搜索可从该宝可梦进化的 Stage 2 卡，直接进化。（跳过 Stage 1）',
      "Search your deck for a card that evolves from 1 of your Pokémon and put it onto that Pokémon to evolve it.",
    ],
    slots: [
      { name: 'skipStage', type: 'boolean', description: '是否跳阶进化（如稀有糖果 Basic→Stage2）', required: true, defaultValue: false },
      { name: 'targetFilter', type: 'card_filter', description: '可选目标限制', required: false },
      { name: 'evolutionFilter', type: 'card_filter', description: '进化卡条件', required: false },
    ],
    templateNote: `生成: [
      { type: 'player_choice', choiceType: 'select_pokemon', filter: {targetFilter} },
      { type: 'search_deck', filter: evolvesFrom(selected, skipStage:{skipStage}) },
      { type: 'evolve_pokemon' },
      { type: 'shuffle_deck' }
    ]`,
  },

  [PatternId.FLOW_LOCK]: {
    id: PatternId.FLOW_LOCK,
    category: 'flow',
    nameCN: '封锁/锁定',
    description: '限制对手在下一回合的行动（不能使用物品/支援者/特性等）。',
    textExamples: [
      '在对手的下一回合中，对手不能使用手牌中的物品卡。',
      '在对手的下一回合中，对手不能从手牌中使用支援者卡。',
      "Your opponent can't play any Item cards from their hand during their next turn.",
    ],
    slots: [
      { name: 'lockTarget', type: 'string', description: '"items" / "supporters" / "abilities" / "stadiums" / "attacks"', required: true },
      { name: 'duration', type: 'string', description: '"next_opponent_turn"', required: true },
    ],
    templateNote: `生成: [{
      type: 'register_modifier',
      modifier: { type: 'action_lock', lockTarget: {lockTarget} },
      duration: {duration},
      scope: 'opponent'
    }]`,
  },

  [PatternId.FLOW_PRIZE_MANIPULATION]: {
    id: PatternId.FLOW_PRIZE_MANIPULATION,
    category: 'flow',
    nameCN: '奖赏卡操作',
    description: '与奖赏卡相关的特殊操作。',
    textExamples: [
      '查看你的奖赏卡，选择其中 1 张与手牌交换。',
      'Look at your face-down Prize cards, then choose 1 of them and switch it with a card in your hand.',
    ],
    slots: [
      { name: 'action', type: 'string', description: '"peek" / "swap" / "take_extra"', required: true },
      { name: 'count', type: 'number', description: '操作数量', required: true, defaultValue: 1 },
    ],
    templateNote: `生成: [
      { type: 'peek_cards', zone: 'prizes' },
      { type: 'player_choice', choiceType: 'select_from_prizes', count: {count} },
      if action=='swap': { type: 'player_choice', choiceType: 'select_from_hand' },
      { type: 'move_card', swap: true }
    ]`,
  },

  [PatternId.FLOW_RETREAT_COST_MOD]: {
    id: PatternId.FLOW_RETREAT_COST_MOD,
    category: 'flow',
    nameCN: '撤退费用修改',
    description: '修改宝可梦的撤退费用（通常由场地卡或道具提供）。',
    textExamples: [
      'The Retreat Cost of each Basic Pokémon in play is reduced by 1.',
    ],
    slots: [
      { name: 'value', type: 'number', description: '修改值（负数=减少）', required: true },
      { name: 'scope', type: 'string', description: '"all" / "self" / "opponent"', required: false, defaultValue: 'all' },
      { name: 'filter', type: 'card_filter', description: '受影响宝可梦的过滤条件', required: false },
      { name: 'duration', type: 'string', description: '持续时间', required: false, defaultValue: 'while_in_play' },
    ],
    templateNote: `生成: [{ type: 'register_modifier', modifier: { type: 'retreat_cost_mod', value, filter }, duration }]`,
  },
};

// ─────────────────────────────────────────────
// 复合模式：用于描述由多个基础模式组合而成的复杂效果
// ─────────────────────────────────────────────

/**
 * 复合模式不单独枚举，而是用组合语法描述：
 *
 * 1. SEQUENCE — 顺序执行多个模式
 *    例：DMG_FLAT + NRG_DISCARD_TARGET（造成伤害并丢弃对手能量）
 *
 * 2. CONDITIONAL — 条件分支
 *    例：翻硬币 → 正面: DMG_FLAT(200) / 反面: DMG_FLAT(100)
 *
 * 3. OPTIONAL — 可选执行（"你可以..."）
 *    例：可选 CARD_DISCARD_HAND → 若执行则 CARD_DRAW
 *
 * 4. REPEAT — 重复执行
 *    例：对备战区每只宝可梦执行 DMG_PLACE_COUNTERS
 *
 * 语义解析器应输出的中间表示格式：
 */
export interface ParsedEffect {
  /** 效果类型 */
  type: 'pattern' | 'sequence' | 'conditional' | 'optional' | 'repeat';

  /** 当 type = 'pattern' 时 */
  patternId?: PatternId;
  slotValues?: Record<string, any>;

  /** 当 type = 'sequence' 时 */
  steps?: ParsedEffect[];

  /** 当 type = 'conditional' 时 */
  condition?: {
    type: 'coin_flip' | 'game_state' | 'player_choice';
    description: string;
  };
  ifTrue?: ParsedEffect;
  ifFalse?: ParsedEffect;

  /** 当 type = 'optional' 时 */
  optionalEffect?: ParsedEffect;
  /** 可选条件（"你可以。如果这么做了..."） */
  optionalCost?: ParsedEffect;

  /** 当 type = 'repeat' 时 */
  repeatEffect?: ParsedEffect;
  repeatSource?: string;  // 迭代来源描述
}

// ─────────────────────────────────────────────
// 触发条件类型 — 用于特性和触发式效果
// ─────────────────────────────────────────────

export enum TriggerType {
  /** 从手牌进化到此宝可梦时 */
  ON_EVOLVE = 'ON_EVOLVE',
  /** 此宝可梦从手牌放置到场上时 */
  ON_PLAY = 'ON_PLAY',
  /** 每回合可主动使用一次 */
  ONCE_PER_TURN = 'ONCE_PER_TURN',
  /** 持续生效（被动特性） */
  PASSIVE = 'PASSIVE',
  /** 此宝可梦在战斗场时 */
  WHILE_ACTIVE = 'WHILE_ACTIVE',
  /** 此宝可梦在场上时（含备战区） */
  WHILE_IN_PLAY = 'WHILE_IN_PLAY',
  /** 此宝可梦受到伤害时 */
  ON_DAMAGE_TAKEN = 'ON_DAMAGE_TAKEN',
  /** 此宝可梦被击倒时 */
  ON_KNOCKOUT = 'ON_KNOCKOUT',
  /** 回合开始时 */
  ON_TURN_START = 'ON_TURN_START',
  /** 回合结束时 */
  ON_TURN_END = 'ON_TURN_END',
  /** 能量被贴到此宝可梦时 */
  ON_ENERGY_ATTACHED = 'ON_ENERGY_ATTACHED',
  /** 对手使用特定类型的卡时 */
  ON_OPPONENT_PLAYS = 'ON_OPPONENT_PLAYS',
}

/**
 * 条件枚举 — 用于 DMG_CONDITIONAL_BONUS 等模式的条件槽位
 */
export enum ConditionType {
  /** 此宝可梦本回合进化 */
  EVOLVED_THIS_TURN = 'EVOLVED_THIS_TURN',
  /** 对手已取的奖赏卡数量 */
  OPPONENT_PRIZES_TAKEN = 'OPPONENT_PRIZES_TAKEN',
  /** 目标有异常状态 */
  TARGET_HAS_CONDITION = 'TARGET_HAS_CONDITION',
  /** 自身有异常状态 */
  SELF_HAS_CONDITION = 'SELF_HAS_CONDITION',
  /** 竞技场在场 */
  STADIUM_IN_PLAY = 'STADIUM_IN_PLAY',
  /** 己方弃牌区卡牌数量 */
  OWN_DISCARD_COUNT = 'OWN_DISCARD_COUNT',
  /** 对手手牌数量 */
  OPPONENT_HAND_COUNT = 'OPPONENT_HAND_COUNT',
  /** 己方手牌数量 */
  OWN_HAND_COUNT = 'OWN_HAND_COUNT',
  /** 己方备战区宝可梦数量 */
  OWN_BENCH_COUNT = 'OWN_BENCH_COUNT',
  /** 对手备战区宝可梦数量 */
  OPPONENT_BENCH_COUNT = 'OPPONENT_BENCH_COUNT',
  /** 此宝可梦身上的能量数量 */
  SELF_ENERGY_COUNT = 'SELF_ENERGY_COUNT',
  /** 此宝可梦身上的伤害指示物数量 */
  SELF_DAMAGE_COUNTERS = 'SELF_DAMAGE_COUNTERS',
  /** 此宝可梦是特定类型（如 ex, V 等） */
  SELF_IS_TYPE = 'SELF_IS_TYPE',
  /** 此回合是否为第一回合 */
  IS_FIRST_TURN = 'IS_FIRST_TURN',
  /** 此回合是否已使用过支援者 */
  SUPPORTER_USED_THIS_TURN = 'SUPPORTER_USED_THIS_TURN',
  /** 自身HP剩余比例 */
  SELF_HP_THRESHOLD = 'SELF_HP_THRESHOLD',
  /** 弃牌区有特定类型卡牌 */
  DISCARD_CONTAINS = 'DISCARD_CONTAINS',
  /** 迷失区卡牌数量 */
  LOST_ZONE_COUNT = 'LOST_ZONE_COUNT',
}
