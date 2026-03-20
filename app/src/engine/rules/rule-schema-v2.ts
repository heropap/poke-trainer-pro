/**
 * ═══════════════════════════════════════════════════════════════
 * PTCG Rule Schema — V2.0
 *
 * 双维度设计：流程维度（大循环）× 卡牌维度（小循环）
 *
 * 设计原则：
 *   1. 声明式优先 — 所有规则可用 JSON 描述
 *   2. 两维度正交 — 流程定义"什么时候"，卡牌定义"做什么"
 *   3. 完备性 — 覆盖准备阶段到胜负判定全部状态
 *   4. 类型安全 — 消灭 Record<string, any>，全部强类型
 * ═══════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
// §1. 能量与属性 (Energy & Elemental Types)
// ═══════════════════════════════════════════════════════════════

export type EnergyType =
  | "Grass" | "Fire" | "Water" | "Lightning"
  | "Psychic" | "Fighting" | "Metal" | "Darkness"
  | "Dragon" | "Colorless" | "Fairy";

/** 能量消耗描述 — 用于攻击费用 */
export interface EnergyCost {
  type: EnergyType;
  amount: number;
}

// ═══════════════════════════════════════════════════════════════
// §2. 状态异常 (Status Conditions)
// ═══════════════════════════════════════════════════════════════

export type StatusCondition =
  | "poisoned"     // 中毒: 回合间受 10 伤害 (可叠加为剧毒)
  | "burned"       // 灼伤: 回合间掷硬币, 反面受 20 伤害
  | "asleep"       // 睡眠: 不能攻击/撤退, 回合间掷硬币正面苏醒
  | "confused"     // 混乱: 攻击时掷硬币, 反面自伤 30
  | "paralyzed";   // 麻痹: 不能攻击/撤退, 经过 1 回合后自动解除

// ═══════════════════════════════════════════════════════════════
// §3. 区域模型 (Zone Model)
// ═══════════════════════════════════════════════════════════════

export type ZoneType =
  // ── 玩家私有区域 ──
  | "active"            // 战斗区 (仅 1 只 Pokémon)
  | "bench"             // 备战区 (最多 5 只)
  | "hand"              // 手牌 (对手不可见)
  | "deck"              // 牌库 (面朝下, 有序)
  | "deck_top"          // 牌库顶 N 张 (用于 look/reveal 操作)
  | "deck_bottom"       // 牌库底 (用于化石等特殊放置)
  | "discard"           // 弃牌区 (公开信息)
  | "prizes"            // 奖赏区 (面朝下, 6 张)
  | "lost_zone"         // 放逐区 (永久移除, 公开信息)
  // ── 附加区域 (寄生在 Pokémon 上) ──
  | "attached_energy"   // 附加的能量卡
  | "attached_tool"     // 附加的道具卡
  | "evolution_stack"   // 进化堆 (下层卡牌)
  // ── 全局共享区域 ──
  | "stadium"           // 竞技场 (全局仅 1 张)
  // ── 复合/抽象区域 ──
  | "in_play"           // = active + bench (场上所有)
  | "any";              // 任意区域 (通配)

export type ZoneVisibility = "public" | "private" | "hidden";

export interface ZoneDescriptor {
  type: ZoneType;
  visibility: ZoneVisibility;
  ordered: boolean;        // 牌库有序, 手牌无序
  capacity: number | null; // null = 无上限
  perPlayer: boolean;      // true = 每人一个, false = 全局共享
}

/** 标准区域属性表 */
export const ZONE_DESCRIPTORS: Record<string, ZoneDescriptor> = {
  active:      { type: "active",      visibility: "public",  ordered: false, capacity: 1,    perPlayer: true  },
  bench:       { type: "bench",       visibility: "public",  ordered: false, capacity: 5,    perPlayer: true  },
  hand:        { type: "hand",        visibility: "private", ordered: false, capacity: null, perPlayer: true  },
  deck:        { type: "deck",        visibility: "hidden",  ordered: true,  capacity: null, perPlayer: true  },
  discard:     { type: "discard",     visibility: "public",  ordered: true,  capacity: null, perPlayer: true  },
  prizes:      { type: "prizes",      visibility: "hidden",  ordered: false, capacity: 6,    perPlayer: true  },
  lost_zone:   { type: "lost_zone",   visibility: "public",  ordered: false, capacity: null, perPlayer: true  },
  stadium:     { type: "stadium",     visibility: "public",  ordered: false, capacity: 1,    perPlayer: false },
};

// ═══════════════════════════════════════════════════════════════
// §4. 卡牌本体论 (Card Taxonomy)
// ═══════════════════════════════════════════════════════════════

// ── 4.1 物理大类 ──

export type SuperType = "Pokémon" | "Trainer" | "Energy";

// ── 4.2 子类 ──

export type PokemonSubType =
  | "Basic"
  | "Stage1"
  | "Stage2"
  | "VMAX"
  | "VSTAR"
  | "V-UNION"
  | "BREAK"
  | "Mega"
  | "Restored"       // 化石机制
  | "LevelUp";       // DP 时代 Lv.X

export type TrainerSubType =
  | "Item"
  | "Supporter"
  | "Stadium"
  | "Tool"            // Pokémon Tool
  | "TechnicalMachine";

export type EnergySubType =
  | "Basic"
  | "Special";

export type SubType = PokemonSubType | TrainerSubType | EnergySubType;

// ── 4.3 规则箱 & 奖赏倍率 ──

export type RuleBox =
  | "none"          // 普通, 击倒 = 1 张奖赏
  | "ex"            // 朱紫 ex, 击倒 = 2 张
  | "EX"            // XY EX, 击倒 = 2 张
  | "V"             // 剑盾 V, 击倒 = 2 张
  | "VMAX"          // 击倒 = 3 张
  | "VSTAR"         // 击倒 = 2 张, VSTAR Power 每场限 1
  | "V-UNION"       // 击倒 = 3 张
  | "GX"            // 日月 GX, 击倒 = 2 张, GX 技每场限 1
  | "TAG_TEAM"      // 击倒 = 3 张
  | "Radiant";      // 击倒 = 1 张, 构筑限 1 张

export const PRIZE_MAP: Record<RuleBox, number> = {
  none: 1, ex: 2, EX: 2, V: 2,
  VMAX: 3, VSTAR: 2, "V-UNION": 3,
  GX: 2, TAG_TEAM: 3, Radiant: 1,
};

// ── 4.4 词缀与派系标签 ──

export type CardTag =
  // 构筑限制
  | "ACE_SPEC"        // 王牌卡, 卡组限 1 张
  | "Prism_Star"      // 棱镜星, 同名限 1, 弃牌→放逐
  | "Radiant"         // 光辉, 卡组限 1 张此标签
  // 朱紫时代
  | "Ancient"         // 古代
  | "Future"          // 未来
  | "Tera"            // 太晶化 (备战区免疫攻击伤害)
  // 剑盾时代
  | "Single_Strike"   // 一击
  | "Rapid_Strike"    // 连击
  | "Fusion_Strike"   // 汇流
  // 日月时代
  | "Ultra_Beast"     // 究极异兽
  // 规则箱标签 (用于效果检索)
  | "ex" | "V" | "VMAX" | "VSTAR" | "GX" | "TAG_TEAM";

// ═══════════════════════════════════════════════════════════════
// §5. 流程维度 — 游戏阶段 (Game Phase)
// ═══════════════════════════════════════════════════════════════

export type GamePhase =
  // ── 准备阶段 ──
  | "SETUP_COIN_FLIP"         // 猜拳/掷硬币决定先后攻
  | "SETUP_DRAW_HAND"         // 双方抽 7 张手牌
  | "SETUP_MULLIGAN_CHECK"    // 调度检查 (无基础宝可梦?)
  | "SETUP_PLACE_ACTIVE"      // 选 1 张基础宝可梦放战斗区
  | "SETUP_PLACE_BENCH"       // 可选: 放基础宝可梦到备战区
  | "SETUP_MULLIGAN_RESOLVE"  // 对手决定是否因调度多抽牌
  | "SETUP_PLACE_PRIZES"      // 从牌库顶放 6 张奖赏卡
  | "SETUP_REVEAL"            // 双方翻开宝可梦, 游戏开始
  // ── 回合阶段 ──
  | "DRAW"                    // 抽牌阶段 (必须抽 1 张)
  | "MAIN"                    // 主阶段 (自由操作)
  | "ATTACK_DECLARE"          // 攻击宣告
  | "ATTACK_COST_CHECK"       // 攻击能量检查
  | "ATTACK_PRE_EFFECTS"      // 攻击前效果 (混乱检定等)
  | "ATTACK_DAMAGE_CALC"      // 伤害计算
  | "ATTACK_APPLY"            // 应用伤害与效果
  | "ATTACK_KO_CHECK"         // 击倒检查
  | "ATTACK_PRIZE_TAKE"       // 拿取奖赏卡
  | "ATTACK_PROMOTE"          // 被击倒方推上替补
  | "ATTACK_POST_EFFECTS"     // 攻击后效果
  // ── 回合间 ──
  | "CHECKUP"                 // 宝可梦检查 (中毒/灼伤/睡眠/麻痹)
  | "TURN_END"                // 回合结束 (重置标记, 交替玩家)
  // ── 终局 ──
  | "GAME_OVER";

/** 首回合特殊规则 */
export interface FirstTurnRules {
  goingFirst: {
    canAttack: false;
    canPlaySupporter: false;
    canEvolve: false;
  };
  goingSecond: {
    canAttack: true;
    canPlaySupporter: true;
    canEvolve: false;
  };
}

/** 胜负条件 */
export type WinCondition =
  | "prizes_taken"           // 拿完所有 6 张奖赏卡
  | "no_pokemon_in_play"     // 对手场上无宝可梦
  | "deck_out"               // 对手牌库无法抽牌
  | "concede"                // 对手投降
  | "special";               // 特殊卡牌效果

// ═══════════════════════════════════════════════════════════════
// §6. 流程维度 — 触发点 (Trigger Type)
//    卡牌效果通过 Trigger 挂载到流程节点
// ═══════════════════════════════════════════════════════════════

export type TriggerType =
  // ── 准备阶段 ──
  | "on_game_start"            // 游戏开始时

  // ── 回合开始 ──
  | "on_turn_start"            // 回合开始时 (抽牌之前)
  | "on_draw"                  // 抽牌时

  // ── 主阶段 — 主动使用 ──
  | "on_play"                  // 从手牌打出时 (Trainer, Basic Pokémon)
  | "on_enter_play"            // 进入场上时 (含进化、复活等)
  | "on_activate"              // 主动激活特性
  | "on_evolve"                // 进化时
  | "on_energy_attach"         // 能量附加时
  | "on_retreat"               // 撤退时
  | "on_tool_attach"           // 道具装备时

  // ── 攻击阶段 ──
  | "on_attack_declare"        // 宣告攻击时
  | "on_attack_cost_check"     // 攻击能量检查时
  | "on_damage_calc"           // 伤害计算时 (弱点/抵抗之前)
  | "on_damage_modify"         // 伤害修正时 (加减伤害)
  | "on_damage_apply"          // 伤害实际应用时
  | "on_attack_effect"         // 攻击附加效果结算时
  | "on_attack_end"            // 攻击结算完成后

  // ── 被动响应 ──
  | "on_damage_received"       // 受到伤害时
  | "on_knockout"              // 被击倒时
  | "on_knockout_opponent"     // 击倒对手时
  | "on_prize_take"            // 拿取奖赏卡时
  | "on_promote"               // 被推上战斗区时

  // ── 回合间/结束 ──
  | "between_turns"            // 回合间检查 (中毒/灼伤/睡眠)
  | "on_turn_end"              // 回合结束时

  // ── 区域移动 ──
  | "on_discard"               // 进入弃牌区时
  | "on_leave_play"            // 离开场上时
  | "on_hand_enter"            // 进入手牌时

  // ── 持续 (不是事件，是状态) ──
  | "while_in_play"            // 在场上期间 (被动特性)
  | "while_attached"           // 附着期间 (道具/特殊能量)
  | "while_in_stadium";        // 场地存在期间

// ═══════════════════════════════════════════════════════════════
// §7. 目标选择器 (Target Selector)
// ═══════════════════════════════════════════════════════════════

export type OwnerType = "self" | "opponent" | "both" | "any";
export type TargetKind = "pokemon" | "card" | "player" | "attack" | "ability";

export interface TargetSelector {
  targetType: TargetKind;
  owner: OwnerType;
  zone: ZoneType | ZoneType[];
  count: number | "all" | "up_to";
  maxCount?: number;               // 当 count = "up_to" 时的上限

  filter?: CardFilter;

  /** 位置限定 (仅 Pokémon 目标有意义) */
  position?: "active_only" | "bench_only" | "any";
}

export interface CardFilter {
  superType?: SuperType[];
  subType?: SubType[];
  energyType?: EnergyType[];       // 宝可梦/能量的属性
  name?: string;                   // 卡名精确匹配
  nameContains?: string;           // 卡名包含
  tag?: CardTag[];                 // 标签匹配 (任一匹配)
  ruleBox?: RuleBox[];             // 规则箱匹配
  hasAbility?: boolean;
  hasDamage?: boolean;
  hasStatus?: StatusCondition;
  hasNoStatus?: boolean;           // 没有任何状态异常
  maxHP?: number;
  minHP?: number;
  maxRetreatCost?: number;
  evolvesFrom?: string;            // 从指定卡名进化
  evolvesInto?: string;            // 可以进化为
  isEvolved?: boolean;             // 是否为进化后的宝可梦
  // 攻击检索 (基于完备性分析补充)
  hasAttackNamed?: string;         // 拥有指定名称的攻击
  hasEnergyAttached?: boolean;     // 有能量附着
  // 排除
  exclude?: CardFilter;
  // 与自身关系
  isSelf?: boolean;                // 就是效果来源自身
  isNotSelf?: boolean;             // 排除自身
}

// ═══════════════════════════════════════════════════════════════
// §8. 条件系统 (Conditions)
// ═══════════════════════════════════════════════════════════════

export type Condition =
  // ── 随机 ──
  | { type: "coin_flip" }
  | { type: "coin_flip_count"; min: number; total: number }

  // ── 区域检查 ──
  | { type: "zone_has_cards"; zone: ZoneType; owner: OwnerType;
      count: number; comparison: "gte" | "lte" | "eq" | "gt" | "lt";
      filter?: CardFilter }
  | { type: "zone_is_empty"; zone: ZoneType; owner: OwnerType }
  | { type: "bench_not_full"; owner: OwnerType }
  | { type: "bench_has_pokemon"; owner: OwnerType; filter?: CardFilter }

  // ── 宝可梦状态 ──
  | { type: "is_in_zone"; zone: ZoneType }
  | { type: "is_active" }
  | { type: "is_on_bench" }
  | { type: "has_damage"; target: TargetSelector }
  | { type: "has_no_damage"; target: TargetSelector }
  | { type: "has_status"; status: StatusCondition; target: TargetSelector }
  | { type: "has_no_status"; target: TargetSelector }
  | { type: "has_energy"; energyType?: EnergyType; count?: number; target: TargetSelector }
  | { type: "has_type"; energyType: EnergyType; target: TargetSelector }
  | { type: "hp_remaining"; comparison: "gte" | "lte" | "eq"; value: number; target: TargetSelector }

  // ── 回合状态 ──
  | { type: "is_first_turn" }
  | { type: "is_going_first" }
  | { type: "is_going_second" }
  | { type: "usage_limit"; scope: "turn" | "game"; count: number }
  | { type: "has_attached_energy_this_turn" }
  | { type: "has_played_supporter_this_turn" }
  | { type: "has_retreated_this_turn" }
  | { type: "has_attacked_this_turn" }
  | { type: "pokemon_played_this_turn"; target: TargetSelector }  // 宝可梦本回合刚上场
  | { type: "evolved_this_turn"; target: TargetSelector }

  // ── 标签/标记/规则箱 ──
  | { type: "has_tag"; tag: CardTag; target: TargetSelector }
  | { type: "has_marker"; marker: string; target: TargetSelector }
  | { type: "has_no_marker"; marker: string; target: TargetSelector }
  | { type: "has_rule_box"; ruleBox: RuleBox; target: TargetSelector }

  // ── 卡牌属性匹配 ──
  | { type: "card_name"; name: string; target: TargetSelector }
  | { type: "card_name_contains"; substring: string; target: TargetSelector }
  | { type: "card_super_type"; superType: SuperType; target: TargetSelector }
  | { type: "card_sub_type"; subType: SubType; target: TargetSelector }

  // ── 费用检查 ──
  | { type: "cost_check"; cost: Cost[] }

  // ── 上一回合事件 (基于完备性分析补充) ──
  | { type: "pokemon_knocked_out_last_turn"; owner: OwnerType }  // 上回合有宝可梦被击倒
  | { type: "vstar_power_available" }                             // VSTAR Power 尚未使用
  | { type: "moved_to_active_this_turn"; target: TargetSelector } // 本回合从备战区移到战斗区
  | { type: "lost_zone_count_gte"; owner: OwnerType; count: number } // 放逐区卡牌 ≥ N
  | { type: "stadium_in_play"; owner?: OwnerType }                // 场上有竞技场
  | { type: "has_energy_attached"; target: TargetSelector; energySubType?: EnergySubType } // 有能量附着
  | { type: "opponent_prize_threshold"; comparison: "gte" | "lte" | "eq"; count: number } // 对手奖赏卡数量

  // ── 逻辑组合 ──
  | { type: "not"; condition: Condition }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] };

// ═══════════════════════════════════════════════════════════════
// §9. 费用 (Costs)
// ═══════════════════════════════════════════════════════════════

export type Cost =
  | { type: "energy"; energyType: EnergyType | "any"; amount: number }
  | { type: "discard_energy"; energyType: EnergyType | "any"; amount: number;
      from?: TargetSelector }
  | { type: "discard_card"; amount: number; from?: TargetSelector;
      filter?: CardFilter }
  | { type: "put_damage_counters_on_self"; amount: number }
  | { type: "move_energy_to_opponent"; amount: number }
  | { type: "discard_top_deck"; amount: number };

// ═══════════════════════════════════════════════════════════════
// §10. 动态值 (Dynamic Values)
// ═══════════════════════════════════════════════════════════════

export type DynamicValue =
  /** 固定值 */
  | { calc: "constant"; value: number }

  /** 每 X 计 Y — "20 × 自身能量数" */
  | { calc: "per_unit"; per: number;
      countSource: TargetSelector; countProperty: CountableProperty }

  /** 掷硬币 — "掷 3 枚硬币, 每正面 50 伤害" */
  | { calc: "coin_flip"; coinCount: number | DynamicValue;
      perHeads: number; perTails?: number }

  /** 掷硬币直到反面 — "掷硬币直到出现反面, 每正面 30 伤害" */
  | { calc: "coin_until_tails"; perHeads: number }

  /** 区域数量 — "对手备战区每只宝可梦 20 伤害" */
  | { calc: "zone_count"; zone: ZoneType; owner: OwnerType;
      filter?: CardFilter; per: number }

  /** 伤害标记数 — "自身每个伤害标记 10 伤害" */
  | { calc: "damage_counters"; target: TargetSelector; per: number }

  /** 手牌数量 */
  | { calc: "hand_count"; owner: OwnerType; per: number }

  /** 剩余 HP 差值 — "HP - 剩余HP" */
  | { calc: "remaining_hp_diff"; target: TargetSelector; subtractFrom?: number }

  /** 附加能量数 */
  | { calc: "attached_energy_count"; target: TargetSelector;
      energyType?: EnergyType; per: number }

  /** 弃牌区数量 */
  | { calc: "discard_count"; owner: OwnerType; filter?: CardFilter; per: number }

  /** 奖赏卡剩余数 */
  | { calc: "prizes_remaining"; owner: OwnerType; per: number }

  /** 算术运算 */
  | { calc: "add"; a: DynamicValue; b: DynamicValue }
  | { calc: "subtract"; a: DynamicValue; b: DynamicValue }
  | { calc: "multiply"; a: DynamicValue; b: DynamicValue }
  | { calc: "min"; a: DynamicValue; b: DynamicValue }
  | { calc: "max"; a: DynamicValue; b: DynamicValue }

  /** 已拿取的奖赏卡数 (基于完备性分析补充) */
  | { calc: "prizes_taken"; owner: OwnerType; per: number }

  /** 本次攻击造成的实际伤害 (基于完备性分析补充) */
  | { calc: "damage_dealt" }

  /** 前序步骤引用 (基于完备性分析补充) */
  | { calc: "step_result"; label: string; property: "count" | "value" }

  /** 区域内不同属性种类数 (基于完备性分析补充) */
  | { calc: "unique_types_in_zone"; zone: ZoneType; owner: OwnerType; per: number }

  /** 即死 (伤害 = 对手剩余HP) */
  | { calc: "instant_ko" }

  /** 自定义公式 (兜底) */
  | { calc: "formula"; expression: string };

/** 可计数属性 */
export type CountableProperty =
  | "cards"                // 卡牌数量
  | "energy_cards"         // 能量卡数量
  | "energy_provided"      // 提供的能量总数 (特殊能量可能提供 2+)
  | "damage_counters"      // 伤害标记数
  | "pokemon"              // 宝可梦数量
  | "status_conditions"    // 状态异常数量
  | "retreat_cost";        // 撤退费用

// ═══════════════════════════════════════════════════════════════
// §11. 原子动作 (Action Types)
// ═══════════════════════════════════════════════════════════════

export type ActionType =

  // ── 11.1 卡牌位移 (Card Movement) ──
  | "draw_cards"               // 从牌库顶抽到手牌
  | "search_deck"              // 检索牌库 (玩家看牌库选卡, 之后洗牌库)
  | "shuffle_deck"             // 洗牌库
  | "put_on_deck_top"          // 放到牌库顶
  | "put_on_deck_bottom"       // 放到牌库底
  | "shuffle_into_deck"        // 洗入牌库 (从手牌/场上/弃牌区)
  | "discard_cards"            // 从指定区域弃牌
  | "recover_from_discard"     // 从弃牌区回收 (到手牌/牌库/场上)
  | "move_to_lost_zone"        // 放逐 (移入放逐区, 不可回收)
  | "return_to_hand"           // 从场上回手牌 (bounce)
  | "put_in_play"              // 直接放到场上 (不经手牌, 如化石/复活)
  | "move_card"                // 通用: 从 zone_a 移到 zone_b

  // ── 11.2 信息操作 (Information) ──
  | "reveal_cards"             // 展示卡牌 (给对手看)
  | "look_at_cards"            // 看卡牌 (仅自己可见, 如看牌库顶)
  | "show_hand"                // 展示全部手牌

  // ── 11.3 伤害与治疗 (Damage & Healing) ──
  | "deal_damage"              // 造成伤害 (走完整管线: 弱点/抵抗/修正)
  | "place_damage_counters"    // 直接放置伤害标记 (跳过弱点抵抗)
  | "heal"                     // 治疗 (移除伤害标记)
  | "move_damage_counters"     // 在宝可梦之间移动伤害标记
  | "spread_damage"            // 分配伤害到多个目标 (玩家选择/均分)
  | "full_heal"                // 完全治愈 (移除所有伤害标记)
  | "damage_self"              // 自伤 (反冲伤害)

  // ── 11.4 状态异常 (Status) ──
  | "apply_status"             // 施加状态异常
  | "remove_status"            // 移除指定状态异常
  | "remove_all_status"        // 移除全部状态异常

  // ── 11.5 能量操作 (Energy) ──
  | "attach_energy"            // 从手牌贴能量 (常规: 每回合 1 次)
  | "accelerate_energy"        // 加速贴能 (从牌库/弃牌堆, 不受回合限制)
  | "discard_energy"           // 弃能量 (从宝可梦身上移除)
  | "move_energy"              // 在宝可梦之间移动能量
  | "energy_type_change"       // 改变能量提供的属性类型

  // ── 11.6 宝可梦操作 (Pokémon Control) ──
  | "switch_pokemon"           // 替换宝可梦 (active ↔ bench)
  | "evolve"                   // 进化
  | "devolve"                  // 退化 (移除顶层进化卡)
  | "copy_attack"              // 复制攻击 (使用其他宝可梦的攻击)
  | "use_attack"               // 使用指定攻击 (技术机器等)

  // ── 11.7 标记与持续效果 (Markers) ──
  | "set_marker"               // 设置标记 (如 "cant_attack_next_turn")
  | "remove_marker"            // 移除指定标记
  | "clear_all_markers"        // 清除所有标记
  | "check_marker"             // 检查标记 (用于条件分支)

  // ── 11.8 场地操作 (Stadium) ──
  | "discard_stadium"          // 移除当前场地

  // ── 11.9 随机 (RNG) ──
  | "flip_coin"                // 掷 1 枚硬币
  | "flip_coins"               // 掷 N 枚硬币

  // ── 11.10 玩家交互 (Player Interaction) ──
  | "choose_cards"             // 从一组卡中选择 N 张
  | "choose_pokemon"           // 选择一只宝可梦
  | "choose_option"            // 从选项中选择
  | "choose_type"              // 选择一个能量属性
  | "order_cards"              // 排列卡牌顺序 (如排列牌库顶)
  | "confirm"                  // 是/否确认

  // ── 11.11 流程控制 (Flow Control) ──
  | "if"                       // 条件分支
  | "for_each"                 // 遍历 (对每个目标执行)
  | "repeat"                   // 重复 N 次
  | "repeat_until"             // 重复直到条件满足
  | "extra_turn"               // 获得额外回合
  | "end_turn"                 // 强制结束回合

  // ── 11.12 规则覆写 (Rule Override) ──
  | "prevent_damage"           // 下次/本回合受到的伤害变为 0
  | "reduce_damage"            // 减伤 (减少固定值)
  | "add_damage"               // 增伤 (增加固定值)
  | "prevent_retreat"          // 禁止撤退
  | "prevent_evolution"        // 禁止进化
  | "prevent_item_usage"       // 禁止使用物品卡
  | "prevent_supporter_usage"  // 禁止使用支援者卡
  | "prevent_ability"          // 封锁特性
  | "prevent_attack"           // 禁止攻击
  | "prevent_status"           // 免疫状态异常
  | "prevent_energy_removal"   // 禁止移除能量
  | "ignore_weakness"          // 无视弱点
  | "ignore_resistance"        // 无视抵抗力
  | "ignore_effects"           // 无视效果 (不受备战区效果影响等)

  // ── 11.13 日志 ──
  | "log";

// ═══════════════════════════════════════════════════════════════
// §12. 动作步骤 (Action Step)
// ═══════════════════════════════════════════════════════════════

export interface ActionStep {
  action: ActionType;
  target?: TargetSelector;

  /** 动作参数 — 强类型化 */
  params?: ActionParams;

  /** 条件分支 */
  branch?: {
    condition: Condition;
    thenSteps: ActionStep[];
    elseSteps?: ActionStep[];
  };

  /** 循环 */
  loop?: {
    type: "for_each" | "repeat" | "repeat_until";
    target?: TargetSelector;         // for_each 遍历目标
    count?: number | DynamicValue;   // repeat 次数
    condition?: Condition;           // repeat_until 终止条件
    body: ActionStep[];
  };

  /** 执行约束 */
  optional?: boolean;    // true = 玩家可以选择不执行 ("you may")
  label?: string;        // 标签, 用于其他 step 引用结果

  /** 选择模式 (基于完备性分析补充) */
  selectionMode?: "player" | "opponent" | "random";  // 谁来选择, 或随机
}

/** 攻击定义扩展标志 (基于完备性分析补充) */
export interface AttackRuleFlags {
  usableFromBench?: boolean;            // 可从备战区发动
  bypassFirstTurnRestriction?: boolean; // 跳过首回合限制
  skipCheckup?: boolean;                // 跳过宝可梦检查 (extra_turn 用)
}

/** 动作参数 — 按 action 类型区分 */
export interface ActionParams {
  // ── 数量 ──
  amount?: number | DynamicValue;       // 抽牌/伤害/治疗的数量

  // ── 伤害相关 ──
  damage?: number | DynamicValue;       // 伤害值
  applyWeakness?: boolean;              // 是否计算弱点 (默认 true for deal_damage)
  applyResistance?: boolean;            // 是否计算抵抗力
  damageToSelf?: number | DynamicValue; // 反冲自伤
  benchDamage?: number | DynamicValue;  // 对备战区的伤害

  // ── 状态 ──
  status?: StatusCondition;
  poisonDamage?: number;                // 剧毒时每回合伤害 (默认 10)

  // ── 能量 ──
  energyType?: EnergyType | "any";
  energyCount?: number;

  // ── 位移目标 ──
  destination?: ZoneType;               // 移动目的地
  position?: "top" | "bottom" | "shuffle"; // 放入牌库的位置
  faceDown?: boolean;                   // 面朝下放置

  // ── 检索 ──
  searchFilter?: CardFilter;            // search_deck 的筛选条件
  searchCount?: number | "up_to";       // 检索数量
  searchMaxCount?: number;              // up_to 的上限
  revealSearched?: boolean;             // 检索后是否展示

  // ── 标记 ──
  marker?: string;                      // 标记名称
  markerExpiry?: MarkerExpiry;          // 标记过期条件

  // ── 选择 ──
  options?: string[];                   // choose_option 的选项列表
  minChoices?: number;                  // 最少选择数
  maxChoices?: number;                  // 最多选择数

  // ── 掷硬币 ──
  coinCount?: number | DynamicValue;    // 掷几枚

  // ── 攻击引用 ──
  attackSource?: TargetSelector;        // copy_attack 的来源
  attackName?: string;                  // use_attack 指定的攻击名

  // ── 杂项 ──
  message?: string;                     // log 消息
  value?: number | DynamicValue;        // 通用数值
}

/** 标记过期策略 */
export interface MarkerExpiry {
  type: "end_of_turn" | "start_of_next_turn" | "after_n_turns"
      | "once_triggered" | "until_leave_play" | "permanent";
  turns?: number;           // after_n_turns 时使用
  owner?: OwnerType;        // 谁的回合计数
}

// ═══════════════════════════════════════════════════════════════
// §13. 修正器系统 (Modifiers)
// ═══════════════════════════════════════════════════════════════

export type ModifierType =
  // ── 伤害修正 ──
  | "modify_damage_outgoing"    // 出招方伤害加减
  | "modify_damage_incoming"    // 受击方伤害加减
  | "prevent_damage_incoming"   // 完全防御
  | "prevent_damage_to_bench"   // 备战区免疫伤害

  // ── 能力限制 ──
  | "prevent_attack"
  | "prevent_retreat"
  | "prevent_item_usage"
  | "prevent_supporter_usage"
  | "prevent_ability"
  | "prevent_evolution"
  | "prevent_status"
  | "prevent_energy_removal"

  // ── 数值修正 ──
  | "modify_retreat_cost"       // 撤退费用加减
  | "modify_hp"                 // HP 加减
  | "modify_attack_cost"        // 攻击能量消耗加减

  // ── 弱点/抵抗 ──
  | "ignore_weakness"
  | "ignore_resistance"
  | "add_weakness"
  | "add_resistance"
  | "change_weakness"           // 改变弱点属性

  // ── 特殊 ──
  | "immunity_bench"            // 备战区免疫攻击伤害 (太晶化)
  | "redirect_damage"           // 伤害重定向
  | "heal_between_turns"        // 回合间治疗
  | "extra_energy_attach"       // 每回合可多贴能量
  | "energy_provides_extra";    // 能量提供额外属性

export interface Modifier {
  id?: string;
  type: ModifierType;
  source?: TargetSelector;       // 谁产生了这个效果
  target?: TargetSelector;       // 作用于谁
  value?: number | DynamicValue | EnergyType | string;
  condition?: Condition;         // 何时生效

  /** 过期策略 */
  expiry?: {
    type: "turn_count" | "once" | "until_leave_play" | "permanent"
        | "end_of_turn" | "start_of_next_turn";
    turns?: number;
    owner?: OwnerType;
  };

  /** 优先级 (冲突时高优先级覆盖低优先级) */
  priority?: number;
}

// ═══════════════════════════════════════════════════════════════
// §14. 卡牌规则定义 (Card Rule Definition)
//     连接两个维度的核心结构
// ═══════════════════════════════════════════════════════════════

export interface CardRuleDefV2 {
  // ── 身份标识 ──
  identifier: string;             // "sv2-027-chien-pao-ex-attack-1"
  version: number;
  cardId: string;                 // "sv2-027"
  cardName: string;               // "Chien-Pao ex"

  // ── 规则类型 ──
  type: RuleDefType;
  abilitySubType?: AbilitySubType;

  // ── 触发 (挂载到流程维度的哪个节点) ──
  triggers: TriggerType[];

  // ── 前置条件 ──
  conditions?: Condition[];

  // ── 费用 ──
  costs?: Cost[];

  // ── 效果内容 (小循环的动作队列) ──
  steps: ActionStep[];

  // ── 持续效果 ──
  modifiers?: Modifier[];

  // ── 攻击特殊标志 (基于完备性分析补充) ──
  attackFlags?: AttackRuleFlags;

  // ── 元数据 ──
  meta: RuleDefMeta;
}

export type RuleDefType =
  | "attack"
  | "ability"
  | "trainer_effect"
  | "energy_effect"
  | "stadium_effect"
  | "tool_effect"
  | "rule_box_effect";     // 规则箱自带效果 (如 ex 被击倒拿 2 张)

export type AbilitySubType =
  | "activated"     // 主动激活 (玩家选择使用)
  | "passive"       // 持续性 (在场上自动生效)
  | "triggered"     // 事件触发 (满足条件自动触发)
  | "on_enter";     // 入场触发 (仅入场时触发一次)

export interface RuleDefMeta {
  originalText: string;          // 卡牌原始效果文本
  originalTextJa?: string;       // 日文原始文本
  confidence: number;            // 解析置信度 (0-1)
  parseSource: ParseSource;
  generatedAt?: string;          // ISO timestamp
  notes?: string;                // 人工备注
}

export type ParseSource =
  | "hand_written"    // 人工编写
  | "llm_extracted"   // LLM 语义提取
  | "pattern_matched" // 正则模式匹配
  | "schema_editor"   // 可视化编辑器
  | "v1_migrated";    // 从 V1 迁移

// ═══════════════════════════════════════════════════════════════
// §15. 卡牌使用管线声明 (Card Usage Pipeline)
//     不同卡牌子类的使用规则
// ═══════════════════════════════════════════════════════════════

export interface CardUsagePipeline {
  /** 什么卡牌子类适用 */
  appliesTo: SubType;

  /** 通用前置条件 (所有该子类卡牌共享) */
  prerequisites: Condition[];

  /** 使用后卡牌去哪里 */
  afterUse: "discard" | "attach" | "in_play" | "lost_zone" | "stay";

  /** 回合限制 */
  turnLimit?: {
    scope: "turn";
    count: number;
    limitType: string;   // "supporter_used" | "energy_attached" | "stadium_placed" 等
  };

  /** 首回合限制 */
  firstTurnRestriction?: FirstTurnRules;
}

/**
 * 标准使用管线预定义
 * 这些不需要每张卡重复声明
 */
export const STANDARD_PIPELINES: Record<string, CardUsagePipeline> = {
  Basic: {
    appliesTo: "Basic",
    prerequisites: [],
    afterUse: "in_play",
  },
  Stage1: {
    appliesTo: "Stage1",
    prerequisites: [
      { type: "pokemon_played_this_turn", target: { targetType: "pokemon", owner: "self", zone: "in_play", count: 1 } }
      // 注: 实际条件更复杂, 此处简化. 运行时由管线引擎补全
    ],
    afterUse: "in_play",
  },
  Item: {
    appliesTo: "Item",
    prerequisites: [],
    afterUse: "discard",
  },
  Supporter: {
    appliesTo: "Supporter",
    prerequisites: [
      { type: "has_played_supporter_this_turn" } // 取反: NOT
    ],
    afterUse: "discard",
    turnLimit: { scope: "turn", count: 1, limitType: "supporter_used" },
  },
  Stadium: {
    appliesTo: "Stadium",
    prerequisites: [],
    afterUse: "in_play",
    turnLimit: { scope: "turn", count: 1, limitType: "stadium_placed" },
  },
  Tool: {
    appliesTo: "Tool",
    prerequisites: [],
    afterUse: "attach",
  },
  BasicEnergy: {
    appliesTo: "Basic",
    prerequisites: [
      { type: "has_attached_energy_this_turn" } // 取反: NOT
    ],
    afterUse: "attach",
    turnLimit: { scope: "turn", count: 1, limitType: "energy_attached" },
  },
  SpecialEnergy: {
    appliesTo: "Special",
    prerequisites: [
      { type: "has_attached_energy_this_turn" } // 取反: NOT
    ],
    afterUse: "attach",
    turnLimit: { scope: "turn", count: 1, limitType: "energy_attached" },
  },
};

// ═══════════════════════════════════════════════════════════════
// §16. 攻击定义 (Attack Definition)
//     攻击是最复杂的小循环, 独立定义
// ═══════════════════════════════════════════════════════════════

export interface AttackDefinition {
  name: string;
  cost: EnergyCost[];
  damage: number | DynamicValue | null;  // null = 无基础伤害 (如纯效果攻击)
  text: string;                          // 原始描述文本

  /** 攻击效果 (CardRuleDefV2 引用) */
  ruleIdentifier?: string;               // 指向 CardRuleDefV2.identifier
}

// ═══════════════════════════════════════════════════════════════
// §17. 特性定义 (Ability Definition)
// ═══════════════════════════════════════════════════════════════

export interface AbilityDefinition {
  name: string;
  text: string;
  subType: AbilitySubType;

  /** 特性效果 (CardRuleDefV2 引用) */
  ruleIdentifier?: string;
}

// ═══════════════════════════════════════════════════════════════
// §18. 完整卡牌定义 (Full Card Definition)
//     整合原始数据 + 分类 + 规则引用
// ═══════════════════════════════════════════════════════════════

export interface CardDefinitionV2 {
  // ── 基础 ──
  id: string;                      // "sv2-027"
  name: string;                    // "Chien-Pao ex"
  superType: SuperType;
  subTypes: SubType[];
  set: string;                     // "sv2"

  // ── 仅 Pokémon ──
  hp?: number;
  types?: EnergyType[];            // 属性 (可双属性)
  evolvesFrom?: string;            // 进化自
  attacks?: AttackDefinition[];
  abilities?: AbilityDefinition[];
  weakness?: { type: EnergyType; value: string };  // "×2"
  resistance?: { type: EnergyType; value: string }; // "-30"
  retreatCost?: EnergyType[];

  // ── 规则箱 & 标签 ──
  ruleBox: RuleBox;
  tags: CardTag[];

  // ── 仅 Trainer ──
  trainerText?: string;            // 训练家效果文本

  // ── 仅 Energy ──
  energyProvides?: EnergyType[];   // 提供的能量属性
  energyText?: string;             // 特殊能量效果文本

  // ── 规则引用 ──
  ruleIdentifiers: string[];       // 关联的所有 CardRuleDefV2.identifier
}
