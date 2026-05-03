
/**
 * PTCG Rule Schema — V1.1 (Standardized)
 * 
 * Core definitions for the Business Rule Engine.
 * Conforms to the architecture specification v1.1.
 */

// ═══════════════════════════════════════════════════════
// 1. Basic Types
// ═══════════════════════════════════════════════════════

export type EnergyType =
  | "Fire" | "Water" | "Grass" | "Lightning"
  | "Psychic" | "Fighting" | "Metal" | "Darkness"
  | "Fairy" | "Dragon" | "Colorless";

export type StatusCondition =
  | "poisoned" | "burned" | "asleep" | "confused" | "paralyzed";

export type ZoneType = "active" | "bench" | "deck" | "discard" | "hand" | "lost_zone" | "stadium" | "any";
export type OwnerType = "self" | "opponent" | "any";
export type TargetKind = "pokemon" | "card" | "player";

// ═══════════════════════════════════════════════════════
// 2. Target Selector (The "Who")
// ═══════════════════════════════════════════════════════

export interface TargetSelector {
  targetType: TargetKind;
  owner: OwnerType;
  zone: ZoneType | ZoneType[];
  count: number | "all";
  filters?: {
    pokemonType?: string[];    // e.g., ["Water"]
    stage?: string[];          // e.g., ["Basic"]
    cardType?: string[];       // e.g., ["Energy", "Basic"]
    name?: string;
    hasAbility?: boolean;
    hasDamage?: boolean;
    tag?: string[];            // e.g. ["ex", "V"]
  };
}

// ═══════════════════════════════════════════════════════
// 3. Conditions (The "If")
// ═══════════════════════════════════════════════════════

export type Condition =
  | { type: "coin_flip" }
  | { type: "zone_check"; value: ZoneType | ZoneType[] }
  | { type: "is_active_spot" }
  | { type: "cost_check"; cost: Cost[] }
  | { type: "usage_limit"; scope: "turn" | "game"; count: number }
  | { type: "hand_contains"; target: TargetSelector; count: number }
  | { type: "bench_not_full"; owner: OwnerType }
  | { type: "has_energy"; target: TargetSelector; energyType?: EnergyType; count?: number }
  | { type: "has_damage"; target: TargetSelector }
  | { type: "tag_check"; tag: string; target: TargetSelector }
  // Logic
  | { type: "not"; condition: Condition }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] };

export interface Cost {
  type: "energy" | "discard_card" | "discard_energy";
  amount: number;
  filter?: TargetSelector; // For specific discards
}

// ═══════════════════════════════════════════════════════
// 4. Triggers (The "When")
// ═══════════════════════════════════════════════════════

export type TriggerType =
  | "on_activate"             // Manual activation (Abilities)
  | "on_play"                 // When played from hand
  | "on_attack_declare"       // When attacking
  | "on_damage_calc"          // During damage calc
  | "on_damage_received"      // When damaged
  | "on_knockout"             // When KO'd
  | "between_turns"           // Checkup phase
  | "on_evolve"               // When evolving
  | "on_energy_attach"        // When energy attached
  | "on_turn_start"
  | "on_turn_end";

// ═══════════════════════════════════════════════════════
// 5. Actions (The "Do")
// ═══════════════════════════════════════════════════════

export type ActionType =
  // Core
  | "deal_damage"
  | "place_damage_counters"
  | "heal"
  | "switch_pokemon"
  | "apply_status"
  | "remove_status"
  | "evolve"
  // Card Movement
  | "draw_cards"
  | "discard_cards"
  | "search_deck"
  | "shuffle_deck"
  | "shuffle_hand_into_deck"
  | "recover_from_discard"
  | "move_card"
  // Energy
  | "attach_energy"
  | "discard_energy"
  | "move_energy"
  // Meta
  | "flip_coin"
  | "log";

export interface ActionStep {
  actionType: ActionType;
  target?: TargetSelector;
  params?: Record<string, any>; // Flexible params (amount, destination, status, etc.)
  branching?: {
    condition: Condition;
    trueSteps: ActionStep[];
    falseSteps?: ActionStep[];
  };
}

// ═══════════════════════════════════════════════════════
// 6. Modifiers (Continuous Effects)
// ═══════════════════════════════════════════════════════

export interface Modifier {
  id?: string;
  type: ModifierType;
  target?: TargetSelector; // Who does this aura apply to?
  value?: any;
  condition?: Condition;   // When is this aura active?
}

export type ModifierType =
  | "prevent_item_usage"
  | "prevent_attack"
  | "prevent_retreat"
  | "modify_retreat_cost"
  | "modify_damage_outgoing"
  | "modify_damage_incoming"
  | "modify_hp"
  | "block_ability";
