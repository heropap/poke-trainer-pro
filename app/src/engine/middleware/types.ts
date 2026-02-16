/**
 * Middleware Pipeline Infrastructure
 *
 * Declarative rule system for intercepting game actions.
 * Inspired by tcg-engines' before/after event hooks with priority ordering.
 *
 * Architecture:
 *   UI Event → ActionEvent → Middleware Pipeline → Allow / Deny
 *                                                      ↓
 *                                              Execute if allowed
 *
 * Each MiddlewareRule is a pure function: (ReadonlyState, Event) → RuleResult.
 * Rules run in priority order (ascending). First denial short-circuits.
 */

import { GameState, GameCard, Player } from "../game-state";

// ───────────────────────────────────────────────
// Action Event Types
// ───────────────────────────────────────────────

/**
 * Action types flowing through the middleware pipeline.
 * SCREAMING_SNAKE to distinguish from UI-layer action types.
 */
export type EffectActionType =
  | "EVOLVE_ACTION"
  | "ATTACH_ENERGY_ACTION"
  | "RETREAT_ACTION"
  | "PLAY_SUPPORTER_ACTION"
  | "PLAY_ITEM_ACTION"
  | "PLAY_BASIC_ACTION"
  | "ATTACK_ACTION"
  | "END_TURN_ACTION";

/**
 * Type-safe payload map for each action type.
 */
export interface ActionPayloadMap {
  EVOLVE_ACTION: {
    evolutionCardId: string;
    targetPokemonId: string;
  };
  ATTACH_ENERGY_ACTION: {
    energyCardId: string;
    targetPokemonId: string;
  };
  RETREAT_ACTION: {
    energyToDiscard: string[];
    benchTargetId: string;
  };
  PLAY_SUPPORTER_ACTION: {
    cardId: string;
  };
  PLAY_ITEM_ACTION: {
    cardId: string;
    targetId?: string;
  };
  PLAY_BASIC_ACTION: {
    cardId: string;
  };
  ATTACK_ACTION: {
    attackName: string;
  };
  END_TURN_ACTION: Record<string, never>;
}

/**
 * An action event carrying typed payload through the pipeline.
 * All fields are readonly — middleware must not mutate events.
 */
export interface ActionEvent<T extends EffectActionType = EffectActionType> {
  readonly type: T;
  readonly playerIndex: 0 | 1;
  readonly payload: ActionPayloadMap[T];
}

// ───────────────────────────────────────────────
// Rule Result
// ───────────────────────────────────────────────

/**
 * Result of a single middleware rule validation.
 */
export interface RuleResult {
  /** Whether the action is allowed to proceed */
  readonly allowed: boolean;
  /** Human-readable reason for denial (Chinese, for UI display) */
  readonly reason?: string;
  /** Machine-readable rule identifier (for testing / debugging) */
  readonly rule?: string;
}

/** Singleton ALLOW result — reused to avoid allocation */
export const ALLOW: RuleResult = Object.freeze({ allowed: true });

/** Factory for denial results */
export function deny(reason: string, rule: string): RuleResult {
  return Object.freeze({ allowed: false, reason, rule });
}

// ───────────────────────────────────────────────
// Middleware Rule
// ───────────────────────────────────────────────

/**
 * A single declarative rule in the middleware pipeline.
 *
 * Rules are pure functions — they read state but never mutate it.
 * Each rule checks exactly ONE condition, following the
 * Single Responsibility Principle.
 *
 * Priority bands (lower = runs first):
 *   0-9:   Game-level rules     (phase check, first turn)
 *   10-19: Card-level rules     (evolution chain, card type)
 *   20-29: Turn-level rules     (same-turn entry, already evolved)
 *   30-39: State-level rules    (status conditions, abilities)
 *   40+:   Card-specific hooks  (Rare Candy bypass, etc.)
 */
export interface MiddlewareRule<T extends EffectActionType = EffectActionType> {
  /** Unique rule identifier (namespace:rule-name) */
  readonly name: string;
  /** Execution priority. Lower = runs first. */
  readonly priority: number;
  /** Which action types this rule intercepts */
  readonly appliesTo: readonly T[];
  /**
   * Pure validation function.
   * MUST NOT mutate state or event.
   */
  readonly validate: (
    state: Readonly<GameState>,
    event: ActionEvent<T>
  ) => RuleResult;
}

// ───────────────────────────────────────────────
// Pipeline Runner
// ───────────────────────────────────────────────

/**
 * Run a set of middleware rules against an action event.
 *
 * Rules are sorted by priority (ascending) and executed in order.
 * First denial short-circuits — no subsequent rules run.
 *
 * This is a pure function: no side effects, no state mutation.
 *
 * @param rules - All registered rules (filtered internally by appliesTo)
 * @param state - Current game state (read-only)
 * @param event - The action event to validate
 * @returns RuleResult — ALLOW if all rules pass, or the first denial
 */
export function runMiddleware<T extends EffectActionType>(
  rules: ReadonlyArray<MiddlewareRule<T>>,
  state: Readonly<GameState>,
  event: ActionEvent<T>
): RuleResult {
  // Filter to applicable rules, sort by priority ascending
  const applicable = [...rules]
    .filter((r) => r.appliesTo.includes(event.type))
    .sort((a, b) => a.priority - b.priority);

  for (const rule of applicable) {
    const result = rule.validate(state, event);
    if (!result.allowed) {
      return result;
    }
  }

  return ALLOW;
}
