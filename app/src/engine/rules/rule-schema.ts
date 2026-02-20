/**
 * PTCG Rule Schema — CTA (Condition-Target-Action) Type Definitions
 *
 * Derived from statistical analysis of 5,225 cards / 8,535 effects:
 * - 53 atomic action units covering 99.5% of all card effects
 * - Frequency data from _index.json (6,692 attacks, 1,029 abilities, 755 trainers)
 *
 * Architecture: CTA Model (Condition → Target → Action)
 * - Condition: Pre-checks and costs before execution
 * - Target: Declarative target selector for effect recipients
 * - Action: Maps 1:1 to EffectContext methods (40+ verified methods)
 */

// ═══════════════════════════════════════════════════════
// Foundation Types
// ═══════════════════════════════════════════════════════

/** Energy types in PTCG (from card database types field) */
export type EnergyType =
  | "Fire" | "Water" | "Grass" | "Lightning"
  | "Psychic" | "Fighting" | "Metal" | "Darkness"
  | "Fairy" | "Dragon" | "Colorless";

/** Status conditions — from 489 attack texts + 70 ability texts */
export type StatusCondition =
  | "poisoned" | "burned" | "asleep" | "confused" | "paralyzed";

/** Player reference */
export type PlayerRef = "player" | "opponent" | "both";

// ═══════════════════════════════════════════════════════
// Target Selectors (from ChoosePokemonPrompt: 80 cards, 11.8%)
// ═══════════════════════════════════════════════════════

/**
 * Declarative target selector.
 * Resolves to one or more GameCards at execution time.
 */
export type TargetSelector =
  | { zone: "self_active" }                                          // implicit in 63.7% attacks
  | { zone: "opp_active" }                                           // implicit defender
  | { zone: "own_bench"; choose?: number }                           // choose N from own bench
  | { zone: "opp_bench"; choose?: number }                           // choose N from opp bench
  | { zone: "all_own" }                                              // all own Pokemon
  | { zone: "all_opp" }                                              // all opp Pokemon
  | { zone: "all_own_bench" }                                        // all own bench
  | { zone: "all_opp_bench" }                                        // all opp bench
  | { zone: "all_in_play" }                                          // every Pokemon
  | { zone: "own_deck"; filter?: CardFilter; count?: number }        // from own deck (search)
  | { zone: "opp_deck"; filter?: CardFilter; count?: number }        // from opp deck
  | { zone: "own_hand"; filter?: CardFilter; count?: number }        // from own hand
  | { zone: "opp_hand"; filter?: CardFilter; count?: number }        // from opp hand
  | { zone: "own_discard"; filter?: CardFilter; count?: number }     // from own discard
  | { zone: "opp_discard"; filter?: CardFilter; count?: number };    // from opp discard

/** Card filter for searches — used in 280 attacks (6.2%) + 145 trainers (9.3%) */
export interface CardFilter {
  supertype?: "Pokémon" | "Trainer" | "Energy";
  subtypes?: string[];           // ["Basic", "Stage 1", "Supporter", "Item", etc.]
  types?: EnergyType[];          // Energy type filter
  name?: string;                 // Specific card name
  tags?: string[];               // ["ex", "V", "VSTAR", "Ancient", "Future", "Tera", etc.]
  isBasicEnergy?: boolean;       // shortcut: Basic Energy only
  evolvesFrom?: string;          // For evolution search
}

// ═══════════════════════════════════════════════════════
// Dynamic Values (from 488 scaling attacks, 7.3%)
// ═══════════════════════════════════════════════════════

/**
 * A numeric value that can be static or dynamic.
 * Static: just a number.
 * Dynamic: count something × multiply.
 */
export type DynamicValue =
  | number
  | { per: CountableRef; multiply: number };

/** Things that can be counted — derived from "for each" patterns (829 attacks, 18.4%) */
export type CountableRef =
  // Energy counting (28+47+28 attacks)
  | "energy_on_self"
  | "energy_on_defender"
  | "energy_on_all_active"    // both actives
  | "energy_on_all_in_play"   // all Pokemon
  // Damage counter counting (55+28 attacks)
  | "damage_counters_on_self"
  | "damage_counters_on_defender"
  // Bench counting (74 attacks)
  | "own_bench_count"
  | "opp_bench_count"
  | "all_bench_count"
  // Hand counting (16 attacks)
  | "own_hand_size"
  | "opp_hand_size"
  // Prize counting (49 attacks)
  | "own_prizes_remaining"
  | "opp_prizes_remaining"
  | "own_prizes_taken"
  | "opp_prizes_taken"
  // Coin counting (used with flip_coins)
  | "coin_heads";

// ═══════════════════════════════════════════════════════
// Conditions (from 401 abilities with "if", 39%)
// ═══════════════════════════════════════════════════════

/** Conditions for branching and pre-checks */
export type Condition =
  // State checks
  | { check: "coin_flip" }                                              // 456 attacks (10.1%)
  | { check: "coin_flip_multi"; count: number }                         // 168 attacks (3.7%)
  | { check: "has_energy"; target: TargetSelector; type?: EnergyType; min?: number }
  | { check: "has_damage"; target: TargetSelector; min?: number }
  | { check: "has_status"; target: TargetSelector; status?: StatusCondition }
  | { check: "has_pokemon_on_bench"; who: PlayerRef }
  | { check: "has_cards_in_deck"; who: PlayerRef; min?: number }
  | { check: "has_cards_in_hand"; who: PlayerRef; min?: number }
  | { check: "is_in_active_spot" }                                      // "as long as in Active Spot"
  | { check: "has_tag"; target: TargetSelector; tag: string }           // ex, V, Ancient, etc.
  | { check: "is_type"; target: TargetSelector; types: EnergyType[] }
  | { check: "marker_exists"; target: TargetSelector; marker: string }
  | { check: "hp_remaining_lte"; target: TargetSelector; amount: number }
  // Boolean logic
  | { check: "not"; condition: Condition }
  | { check: "and"; conditions: Condition[] }
  | { check: "or"; conditions: Condition[] };

// ═══════════════════════════════════════════════════════
// Marker Lifecycle (from 72 cards using markers, 10.6%)
// ═══════════════════════════════════════════════════════

/** Marker auto-cleanup rules — derived from common/markers/ utilities */
export type MarkerLifecycle =
  | "until_end_of_turn"               // EndTurnEffect clears
  | "until_end_of_opponent_next_turn"  // duringOpponentNextTurn pattern
  | "until_end_of_own_next_turn"       // duringYourNextTurn pattern
  | "permanent"                        // manual clear only
  | "on_leaving_active"               // cleared when leaving Active Spot
  | "on_evolve";                       // cleared when evolved

// ═══════════════════════════════════════════════════════
// Action Steps — The 53 Atomic Units
// (Each maps 1:1 to an EffectContext method)
// ═══════════════════════════════════════════════════════

/**
 * A single step in a CTA rule chain.
 * Steps execute sequentially; each is atomic.
 */
export type ActionStep =

  // ─── A. Damage (covers 6,692 attacks at 100%) ───

  /** Deal damage to target. 2,185+ pure damage attacks. */
  | { action: "deal_damage"; value: DynamicValue; target?: TargetSelector }

  /** Put damage counters directly (bypasses weakness/resistance). 83 attacks (1.8%). */
  | { action: "put_damage_counters"; value: DynamicValue; target: TargetSelector }

  /** Recoil: damage to self. 267 attacks (5.9%). */
  | { action: "self_damage"; value: number }

  /** Bench spread damage. 131 attacks (2.9%). */
  | { action: "bench_damage"; value: number; side: PlayerRef; count?: number }

  /** Ignore weakness and/or resistance. 314 attacks (7.0%). */
  | { action: "ignore_wr"; weakness?: boolean; resistance?: boolean }

  // ─── B. Coin (covers 30%+ of attacks) ───

  /** Flip one coin → branch. 456 attacks (10.1%). */
  | { action: "flip_coin"; on_heads: ActionStep[]; on_tails?: ActionStep[] }

  /** Flip N coins → per-heads action. 168 attacks (3.7%). */
  | { action: "flip_coins"; count: number; per_heads: ActionStep[] }

  // ─── C. Status (covers ~500 attacks + ~70 abilities) ───

  /** Apply status condition. 489 combined. */
  | { action: "apply_status"; status: StatusCondition; target?: TargetSelector }

  /** Remove status. 38 attacks. */
  | { action: "remove_status"; status?: StatusCondition; target?: TargetSelector }

  // ─── D. Card Movement (covers ~1,000 effects) ───

  /** Draw cards. 155 attacks + 89 abilities + 79 trainers. */
  | { action: "draw_cards"; count: DynamicValue; who?: PlayerRef }

  /** Discard from hand (player choice). 78 attacks + 67 trainers. */
  | { action: "discard_from_hand"; count: number; who?: PlayerRef; choice?: "player" | "random" }

  /** Discard entire hand. 22 trainers. */
  | { action: "discard_hand"; who?: PlayerRef }

  /** Search deck for cards. 280 attacks + 145 trainers. */
  | {
      action: "search_deck";
      filter: CardFilter;
      count: number;
      destination: "hand" | "bench" | "attach_to_self" | "attach_to_target" | "top_of_deck" | "bottom_of_deck";
      who?: PlayerRef;
    }

  /** Recover cards from discard pile. 34 attacks + 60 trainers. */
  | {
      action: "recover_from_discard";
      filter: CardFilter;
      count: number;
      destination: "hand" | "deck" | "attach_to_self" | "bench";
      who?: PlayerRef;
    }

  /** Shuffle hand into deck. 51 attacks + trainers. */
  | { action: "shuffle_hand_into_deck"; who?: PlayerRef }

  /** Shuffle deck. 80 attacks. */
  | { action: "shuffle_deck"; who?: PlayerRef }

  /** Reveal top N cards. 29 attacks + 152 trainers. */
  | { action: "reveal_top_cards"; count: number; who?: PlayerRef; then: ActionStep[] }

  /** Put cards on top/bottom of deck. */
  | { action: "put_on_deck"; position: "top" | "bottom"; who?: PlayerRef }

  /** Discard from top of opponent's deck. */
  | { action: "discard_from_deck_top"; count: number; who?: PlayerRef }

  // ─── E. Energy Management (493 attacks mention "attach") ───

  /** Discard energy from a Pokemon. 384 attacks + 82 trainer interactions. */
  | {
      action: "discard_energy";
      count: number | "all";
      target?: TargetSelector;
      energy_type?: EnergyType;
    }

  /** Attach energy from a zone. 63 discard + 27 hand + 29 trainers. */
  | {
      action: "attach_energy";
      source: "deck" | "discard" | "hand";
      filter?: CardFilter;
      count: number;
      target: TargetSelector;
    }

  /** Move energy between Pokemon. 46 attacks + 32 abilities. */
  | {
      action: "move_energy";
      from: TargetSelector;
      to: TargetSelector;
      energy_type?: EnergyType;
      count?: number;
    }

  // ─── F. Field Operations ───

  /** Switch own or opponent's active Pokemon. 131 attacks + 53 trainers. */
  | { action: "switch_pokemon"; who: PlayerRef; choice?: "player" | "opponent" | "random" }

  /** Heal damage. 174 attacks + 47 abilities + 32 trainers. */
  | { action: "heal"; value: DynamicValue; target: TargetSelector }

  /** Discard stadium card. 44 attacks + 40 trainers. */
  | { action: "discard_stadium" }

  /** Discard attached tool. 28 attacks. */
  | { action: "discard_tool"; target?: TargetSelector }

  /** Evolve a Pokemon (skip stage). Rare Candy pattern. */
  | { action: "evolve"; target: TargetSelector; from_deck?: boolean }

  // ─── G. Marker / Restriction System (618 "next turn" attacks) ───

  /** Set a marker with lifecycle. 373 attacks with marker effects. */
  | { action: "set_marker"; target: TargetSelector; marker: string; lifecycle: MarkerLifecycle; value?: number }

  /** Clear a marker. */
  | { action: "clear_marker"; target: TargetSelector; marker: string }

  /** Shortcut: target can't attack next turn. Common pattern. */
  | { action: "cant_attack_next_turn" }

  /** Shortcut: target can't retreat. 86 attacks (1.9%). */
  | { action: "cant_retreat"; target?: TargetSelector }

  /** Shortcut: reduce incoming damage next turn. 79 attacks (1.8%). */
  | { action: "reduce_damage_next_turn"; amount: number }

  /** Shortcut: prevent all damage next turn. */
  | { action: "prevent_damage_next_turn" }

  /** Shortcut: disable one of opponent's attacks. Amnesia pattern. */
  | { action: "disable_attack"; target?: TargetSelector; choice: "player" | "random" }

  // ─── H. Flow Control ───

  /** Conditional execution. 401 abilities (39%) use "if". */
  | { action: "if"; condition: Condition; then: ActionStep[]; else?: ActionStep[] }

  /** Loop over targets. 829 attacks (18.4%) use "for each". */
  | { action: "for_each"; targets: TargetSelector; body: ActionStep[] }

  /** Player chooses from options. Triggers prompt and await. */
  | {
      action: "choose";
      from: TargetSelector;
      min: number;
      max: number;
      message?: string;
      then: ActionStep[];
    }

  /** Choose one of multiple action branches. */
  | { action: "choose_one"; options: Array<{ label: string; steps: ActionStep[] }> }

  // ─── I. Special / Rare (< 1% but necessary) ───

  /** Copy an opponent's attack. Metronome pattern (3 cards). */
  | { action: "copy_attack"; target: TargetSelector }

  /** Take an extra turn. Star Chronos (4 cards). */
  | { action: "extra_turn" }

  /** Log a game event. */
  | { action: "log"; message: string };

// ═══════════════════════════════════════════════════════
// Trigger Hooks (from 1,029 abilities analysis)
// ═══════════════════════════════════════════════════════

/** Events that can trigger reactive abilities or marker cleanup */
export type TriggerEvent =
  | "on_play_from_hand"           // 113 abilities (11.0%)
  | "on_knocked_out"              // 52 abilities (5.1%)
  | "on_opponent_plays_card"      // 12 abilities (1.2%)
  | "on_damage_received"          // 5 abilities (0.5%)
  | "on_energy_attached"          // 4 abilities (0.4%)
  | "on_evolve"                   // Adaptive Evolution (8 cards)
  | "between_turns"               // Garganacl/Trevenant pattern (15 cards)
  | "on_turn_start"               // Beginning of turn triggers
  | "on_turn_end"                 // End of turn cleanup
  | "before_attack"               // Before attack calculation
  | "after_attack"                // After damage dealt
  | "on_retreat"                  // When retreating
  | "on_switch_in"                // When becoming active
  | "on_switch_out";              // When leaving active

// ═══════════════════════════════════════════════════════
// Modifier Types (from ~146 passive abilities)
// ═══════════════════════════════════════════════════════

/** A modifier that affects game values while its source is in play */
export interface Modifier {
  /** Unique ID for tracking/removal */
  id: string;
  /** Source card providing this modifier */
  sourceCardInstanceId: string;
  /** What this modifier affects */
  type: ModifierType;
  /** Condition for the modifier to be active (e.g., "in Active Spot") */
  condition?: Condition;
}

export type ModifierType =
  // Damage modifiers (140 abilities — "attacks do more/less damage")
  | { modify: "incoming_damage"; amount: number }                         // 45 abilities
  | { modify: "outgoing_damage"; amount: number; type_filter?: EnergyType[] }  // 140 abilities
  // Retreat cost (6+3+17 abilities)
  | { modify: "retreat_cost"; amount: number }                            // negative = reduce
  // Attack cost (Espathra ex pattern)
  | { modify: "attack_cost"; add_type: EnergyType; amount: number }
  // HP (15 abilities)
  | { modify: "max_hp"; amount: number }
  // Weakness/Resistance (17 abilities)
  | { modify: "weakness"; type: EnergyType; value: string }              // e.g., "×2", "none"
  | { modify: "resistance"; type: EnergyType; value: string }
  // Prevention (19+10+6+4 abilities)
  | { modify: "prevent_effects"; scope: "from_ex" | "from_abilities" | "all" }
  | { modify: "prevent_status"; statuses: StatusCondition[] | "all" }
  | { modify: "prevent_bench_damage" }
  | { modify: "block_card_type"; card_type: "Item" | "Supporter" | "Stadium" | "Tool" }
  // Energy provision (49 abilities)
  | { modify: "provide_energy_type"; provides: EnergyType; count: number };
