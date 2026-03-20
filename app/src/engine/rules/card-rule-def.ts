
/**
 * Card Rule Definition — Top-level Logic Structure
 * 
 * Defines the complete logic for a single card effect (Attack, Ability, or Trainer effect).
 * Conforms to Business Rule Engine Spec v1.1.
 */

import {
  ActionStep,
  Condition,
  Cost,
  Modifier,
  TriggerType
} from "./rule-schema";

// --- 1. Root Card Logic Definition ---
export interface CardRuleDef {
  identifier: string;          // e.g., "sv2P-027-chien-pao-ex-ability"
  version: number;
  type: "attack" | "ability" | "trainer_effect";
  
  /** Events that trigger this rule. Empty for continuous abilities. */
  triggers?: TriggerType[];
  
  /** Conditions that must be met to execute. */
  conditions?: Condition[];
  
  /** Costs to pay (e.g. discard energy) before execution. */
  costs?: Cost[];
  
  /**
   * Action steps executed sequentially (FIFO).
   * PTCG does not use a stack; this is a queue.
   */
  steps: ActionStep[];
  
  /** Continuous aura effects (Modifiers). */
  modifiers?: Modifier[];
}
