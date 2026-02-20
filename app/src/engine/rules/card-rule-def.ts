/**
 * Card Rule Definition — Top-level CTA JSON structure
 *
 * This is the complete JSON schema for a card's rules.
 * LLM generates this JSON → Zod validates → Rule Compiler converts to CardEffectDef.
 *
 * Hierarchy:
 *   CardRuleDef (this file)
 *     ├── attacks[] → AttackRuleDef (with ActionStep[] from rule-schema.ts)
 *     ├── abilities[] → AbilityRuleDef (passive modifiers OR activated/triggered actions)
 *     └── trainer → TrainerRuleDef (ActionStep[])
 */

import {
  ActionStep,
  Condition,
  TriggerEvent,
  Modifier,
  ModifierType,
  TargetSelector,
  CardFilter,
  MarkerLifecycle,
} from "./rule-schema";

// ═══════════════════════════════════════════════════════
// Attack Rule Definition
// ═══════════════════════════════════════════════════════

export interface AttackRuleDef {
  /** Attack name — MUST match card.attacks[].name exactly */
  name: string;

  /** Base damage from card data (redundant for validation, actual value from card DB) */
  baseDamage?: number;

  /**
   * Pre-conditions that must be met to use this attack
   * (beyond energy cost which is checked by base rules).
   * Example: "You must have at least 3 Pokemon on bench"
   */
  conditions?: Condition[];

  /**
   * Action steps executed in order when attack resolves.
   * The first step is usually deal_damage with baseDamage.
   */
  steps: ActionStep[];
}

// ═══════════════════════════════════════════════════════
// Ability Rule Definition
// ═══════════════════════════════════════════════════════

export type AbilityRuleType = "activated" | "passive" | "triggered";

export interface AbilityRuleDef {
  /** Ability name — MUST match card.abilities[].name */
  name: string;

  /** Ability category determines execution model */
  type: AbilityRuleType;

  /**
   * For "activated" abilities:
   * - canActivate conditions (optional, default: once per turn)
   * - steps to execute when player activates
   *
   * For "passive" abilities:
   * - modifiers that apply while Pokemon is in play
   * - condition determines when modifiers are active
   *
   * For "triggered" abilities:
   * - trigger event that fires the ability
   * - condition + steps
   */

  // ─── Activated ───
  /** Conditions to check before allowing activation */
  canActivate?: Condition[];
  /** Once per turn restriction (default: true for activated) */
  oncePerTurn?: boolean;

  // ─── Passive ───
  /** Modifiers that apply while this ability is active */
  modifiers?: ModifierDef[];

  // ─── Triggered ───
  /** Event that triggers this ability */
  trigger?: TriggerEvent;

  // ─── Shared ───
  /** Condition for passive/triggered to be active */
  condition?: Condition;
  /** Action steps for activated/triggered abilities */
  steps?: ActionStep[];
}

/** Modifier definition within an ability (without runtime tracking fields) */
export interface ModifierDef {
  /** What this modifier affects */
  type: ModifierType;
  /** Condition for the modifier to be active */
  condition?: Condition;
}

// ═══════════════════════════════════════════════════════
// Trainer Rule Definition
// ═══════════════════════════════════════════════════════

export interface TrainerRuleDef {
  /** Trainer subtype for context */
  subtype: "Supporter" | "Item" | "Stadium" | "Tool";

  /**
   * Pre-conditions to play this trainer (beyond "once per turn for Supporter").
   * Example: "You must have a Pokemon on your bench" for Switch
   */
  canPlay?: Condition[];

  /**
   * For Supporter/Item: steps executed when played.
   * For Stadium: ongoing effect + steps when played.
   * For Tool: see tool field below.
   */
  steps?: ActionStep[];

  /**
   * For Stadium cards: trigger event and conditions for ongoing effects.
   * Stadium effects fire for both players each turn.
   */
  stadiumEffect?: {
    trigger: TriggerEvent;
    condition?: Condition;
    steps: ActionStep[];
  };

  /**
   * For Tool cards: passive modifiers while attached to a Pokemon.
   */
  toolModifiers?: ModifierDef[];
}

// ═══════════════════════════════════════════════════════
// Top-Level Card Rule Definition
// ═══════════════════════════════════════════════════════

export interface CardRuleDef {
  /** Card ID — matches Card.id (e.g., "sv1-25", "me1-114") */
  cardId: string;

  /** Card name (for display and debugging) */
  cardName: string;

  /**
   * Schema version for forward compatibility.
   * Current: 1
   */
  version: 1;

  /**
   * Attack definitions.
   * Order should match card.attacks[] order.
   */
  attacks?: AttackRuleDef[];

  /**
   * Ability definitions.
   * Most Pokemon have 0 or 1 ability.
   */
  abilities?: AbilityRuleDef[];

  /**
   * Trainer card definition.
   * Only present for Trainer cards (Supporter, Item, Stadium, Tool).
   */
  trainer?: TrainerRuleDef;

  /**
   * Marker definitions that this card uses.
   * Declares markers for documentation and validation.
   */
  markers?: MarkerDeclaration[];

  /**
   * Optional metadata for LLM provenance tracking.
   */
  meta?: {
    /** Which LLM model generated this rule */
    generatedBy?: string;
    /** Generation timestamp */
    generatedAt?: string;
    /** Confidence score from LLM (0-1) */
    confidence?: number;
    /** Human review status */
    reviewed?: boolean;
    /** Original card text for reference */
    originalText?: string;
  };
}

/** Marker declaration for documentation and lifecycle management */
export interface MarkerDeclaration {
  /** Unique marker name */
  name: string;
  /** When this marker should be automatically cleaned up */
  lifecycle: MarkerLifecycle;
  /** Human-readable description */
  description?: string;
}
