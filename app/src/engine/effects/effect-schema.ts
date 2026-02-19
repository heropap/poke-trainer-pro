/**
 * Effect Schema — JSON-based card effect definitions
 *
 * Provides a structured, data-driven alternative to the regex-based text-parser.
 * Each card effect is defined as a JSON object with typed patterns and parameters,
 * which can be compiled into a CardEffectDef via schema-compiler.ts.
 *
 * This covers the same ~75 patterns as text-parser.ts, but deterministically
 * (no regex heuristics), round-trippable (can export back to JSON), and
 * validatable (TypeScript type checking).
 *
 * Integration: Compiled schemas register at L1.5 in the effect registry,
 * between hand-written (L1/L2) and text-parsed (L3/L4) layers.
 */

import { StatusCondition } from "../game-state";

// ═══════════════════════════════════════════
// Attack Effect Patterns
// ═══════════════════════════════════════════

/** All known attack effect pattern types */
export type AttackPatternType =
  | "status_apply"            // Apply status to defender
  | "self_damage"             // Attack deals recoil to self
  | "multi_coin"              // Flip N coins, damage per heads
  | "coin_flip_bonus"         // Flip 1 coin, extra damage on heads
  | "coin_flip_nothing"       // Flip 1 coin, 0 damage on tails
  | "coin_flip_prevent"       // Flip 1 coin, prevent damage next turn on heads
  | "cant_attack_next_turn"   // Self can't attack next turn
  | "cant_retreat_defender"    // Defender can't retreat next turn
  | "damage_reduction_self"   // Self takes less damage next turn
  | "discard_energy"          // Discard energy from self
  | "bench_damage"            // Deal damage to opponent's bench
  | "per_energy_damage"       // Extra damage per energy attached
  | "per_self_damage_counter" // Extra damage per own damage counter
  | "per_opp_damage_counter"  // Extra damage per opponent's active damage counter
  | "cond_damaged_bonus"      // Bonus if self has damage counters
  | "prize_based_damage"      // Extra damage per opponent's taken prizes
  | "bench_count_damage"      // Extra damage per benched Pokemon
  | "skip_weakness_resistance"// Skip weakness and/or resistance
  | "heal_self"               // Heal self
  | "heal_all_own"            // Heal all own Pokemon
  | "heal_and_remove_status"  // Heal self + remove all status
  | "draw_cards"              // Draw cards as attack effect
  | "draw_until"              // Draw until N cards in hand
  | "switch_self"             // Switch attacker to bench
  | "switch_opponent"         // Switch opponent's active
  | "coin_discard_opp_energy" // Flip coin, discard opponent energy on heads
  | "discard_opp_energy"      // Discard opponent's energy (no coin)
  | "discard_opp_deck"        // Discard from opponent's deck top
  | "discard_opp_hand_random" // Discard random from opponent's hand
  | "move_energy_to_bench"    // Move energy from self to bench
  | "search_evolve_self"      // Search deck for evolution of self
  | "cond_status_bonus";      // Bonus if opponent has special condition

/** Parameter map for each attack pattern type */
export interface AttackPatternParams {
  status_apply: { status: StatusCondition };
  self_damage: { selfDamage: number };
  multi_coin: { coinCount: number; damagePerHeads: number };
  coin_flip_bonus: { bonusDamage: number };
  coin_flip_nothing: {};
  coin_flip_prevent: {};
  cant_attack_next_turn: {};
  cant_retreat_defender: {};
  damage_reduction_self: { reduction: number };
  discard_energy: { count: number };
  bench_damage: { damage: number; count: number }; // count=-1 means all
  per_energy_damage: { damagePerEnergy: number };
  per_self_damage_counter: { damagePerCounter: number };
  per_opp_damage_counter: { damagePerCounter: number };
  cond_damaged_bonus: { bonusDamage: number };
  prize_based_damage: { damagePerPrize: number };
  bench_count_damage: { damagePerBench: number; bothSides: boolean };
  skip_weakness_resistance: { skipWeakness: boolean; skipResistance: boolean };
  heal_self: { amount: number };
  heal_all_own: { amount: number };
  heal_and_remove_status: { healAmount: number };
  draw_cards: { count: number };
  draw_until: { targetHandSize: number };
  switch_self: {};
  switch_opponent: {};
  coin_discard_opp_energy: {};
  discard_opp_energy: {};
  discard_opp_deck: { count: number };
  discard_opp_hand_random: { count: number };
  move_energy_to_bench: {};
  search_evolve_self: {};
  cond_status_bonus: { bonusDamage: number };
}

/** A single attack effect step (type-safe union) */
export type AttackEffectStep = {
  [K in AttackPatternType]: { type: K; params: AttackPatternParams[K] };
}[AttackPatternType];

// ═══════════════════════════════════════════
// Trainer Effect Patterns
// ═══════════════════════════════════════════

export type TrainerPatternType =
  | "discard_hand_draw"       // Discard hand, draw N
  | "shuffle_hand_draw"       // Shuffle hand into deck, draw N
  | "draw"                    // Draw N cards
  | "search_basic_to_bench"   // Search Basic Pokemon → bench
  | "search_pokemon_to_hand"  // Search any Pokemon → hand
  | "search_evolution"        // Search evolution card
  | "search_supporter"        // Search Supporter → hand
  | "search_any_to_hand"      // Search any card → hand
  | "switch_own"              // Switch own active
  | "switch_opponent"         // Switch opponent's active
  | "heal"                    // Heal N damage
  | "each_shuffle_draw"       // Each player shuffles hand, draws N
  | "shuffle_prizes_draw"     // Shuffle hand, draw = prize count
  | "search_energy_to_hand"   // Search energy → hand
  | "energy_discard_to_hand"  // Energy from discard → hand
  | "attach_energy_from_discard" // Attach energy from discard to Pokemon
  | "recover_from_discard"    // Recover card from discard → hand
  | "discard_stadium"         // Discard stadium in play
  | "discard_opp_hand_random" // Discard random from opponent's hand
  | "opp_shuffle_draw";       // Opponent shuffles hand, draws N

export interface TrainerPatternParams {
  discard_hand_draw: { drawCount: number };
  shuffle_hand_draw: { drawCount: number };
  draw: { count: number };
  search_basic_to_bench: { count: number };
  search_pokemon_to_hand: { count: number };
  search_evolution: {};
  search_supporter: { count: number };
  search_any_to_hand: { count: number };
  switch_own: {};
  switch_opponent: {};
  heal: { amount: number };
  each_shuffle_draw: { drawCount: number };
  shuffle_prizes_draw: {};
  search_energy_to_hand: { count: number };
  energy_discard_to_hand: { count: number };
  attach_energy_from_discard: { count: number };
  recover_from_discard: { count: number; filterType: "pokemon" | "trainer" | "energy" | "pokemon_or_energy" | "any" };
  discard_stadium: {};
  discard_opp_hand_random: { count: number };
  opp_shuffle_draw: { drawCount: number };
}

export type TrainerEffectStep = {
  [K in TrainerPatternType]: { type: K; params: TrainerPatternParams[K] };
}[TrainerPatternType];

// ═══════════════════════════════════════════
// Ability Effect Patterns
// ═══════════════════════════════════════════

export type AbilityPatternType =
  // Passive abilities
  | "passive_damage_reduction"    // Take N less damage
  | "passive_damage_boost_self"   // Own attacks do N more damage
  | "passive_damage_boost_typed"  // Typed Pokemon attacks do N more
  | "passive_no_retreat_cost"     // No retreat cost
  | "passive_reduce_retreat"      // Retreat cost -N
  | "passive_opp_damage_reduce"   // Opponent attacks do N less damage
  | "passive_prevent_bench_damage"// Prevent bench damage
  // On-evolve abilities
  | "on_evolve_search_deck"       // Search deck for N cards
  | "on_evolve_draw"              // Draw N cards
  | "on_evolve_heal"              // Heal N damage
  | "on_evolve_switch_opponent"   // Switch opponent's active
  | "on_evolve_discard_opp_energy"// Discard opponent's energy
  | "on_evolve_attach_from_discard"// Attach energy from discard
  | "on_evolve_damage_counters"   // Place damage counters on opponent
  | "on_evolve_discard_opp_hand"  // Opponent discards cards
  // Activated abilities
  | "activated_draw"              // Draw N cards
  | "activated_draw_until"        // Draw until N in hand
  | "activated_heal"              // Heal N damage from 1 Pokemon
  | "activated_search_energy_attach" // Search energy + attach
  | "activated_move_energy"       // Move energy between Pokemon
  | "activated_search_basic_bench"// Search Basic → bench
  | "activated_look_top"          // Look at top N of deck
  | "activated_switch_self"       // Switch with bench
  | "activated_discard_draw";     // Discard N, draw N

export interface AbilityPatternParams {
  passive_damage_reduction: { amount: number };
  passive_damage_boost_self: { amount: number };
  passive_damage_boost_typed: { amount: number; pokemonType: string };
  passive_no_retreat_cost: {};
  passive_reduce_retreat: { amount: number };
  passive_opp_damage_reduce: { amount: number };
  passive_prevent_bench_damage: {};
  on_evolve_search_deck: { count: number };
  on_evolve_draw: { count: number };
  on_evolve_heal: { amount: number };
  on_evolve_switch_opponent: {};
  on_evolve_discard_opp_energy: {};
  on_evolve_attach_from_discard: { count: number };
  on_evolve_damage_counters: { counters: number };
  on_evolve_discard_opp_hand: { count: number };
  activated_draw: { count: number };
  activated_draw_until: { targetHandSize: number };
  activated_heal: { amount: number };
  activated_search_energy_attach: { energyType?: string };
  activated_move_energy: {};
  activated_search_basic_bench: { count: number };
  activated_look_top: { count: number };
  activated_switch_self: {};
  activated_discard_draw: { discardCount: number; drawCount: number };
}

export type AbilityEffectStep = {
  [K in AbilityPatternType]: { type: K; params: AbilityPatternParams[K] };
}[AbilityPatternType];

// ═══════════════════════════════════════════
// Top-level Effect Schema Definition
// ═══════════════════════════════════════════

export interface AttackSchema {
  /** Attack name — must match Card.attacks[].name */
  name: string;
  /** Effect steps applied when this attack is used (order matters for multi-step) */
  effects: AttackEffectStep[];
}

export interface AbilitySchema {
  /** Ability name */
  name: string;
  /** Single effect pattern (abilities are single-pattern) */
  effect: AbilityEffectStep;
}

export interface TrainerSchema {
  /** Effect steps applied when this trainer card is played */
  effects: TrainerEffectStep[];
}

export interface EffectSchemaDefinition {
  /** Card name (used for name-based registration) */
  cardName: string;
  /** Optional specific card ID (for ID-based registration) */
  cardId?: string;
  /** Attack effect definitions */
  attacks?: AttackSchema[];
  /** Ability effect definitions */
  abilities?: AbilitySchema[];
  /** Trainer card effect (for Supporter/Item cards) */
  trainer?: TrainerSchema;
}
