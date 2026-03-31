/**
 * ═══════════════════════════════════════════════════════════════
 * Rule Compiler V2 — card-rules-v2.json → CardEffectDef
 *
 * Compiles V2 extracted rules into executable CardEffectDef objects
 * that can be registered in the effect registry at L1.5 layer.
 *
 * Pipeline:
 *   card-rules-v2.json → compileCardV2() → CardEffectDef (executable)
 *
 * Key differences from V1:
 *   - Works with V2 schema types (ActionStep with branch/loop/optional)
 *   - Supports DynamicValue resolution
 *   - Handles V2 Condition types
 *   - Supports label/step-result references
 *   - Full V2 ActionType coverage (~60 actions)
 * ═══════════════════════════════════════════════════════════════
 */

import {
  CardEffectDef,
  AttackEffect,
  AttackResult,
  AbilityEffect,
  TrainerEffect,
  ToolEffect,
  EffectContext,
  AbilityType,
} from "../effects/effect-types";
import {
  executeAttackStepsSync,
  executeStepsSync,
  executeSteps,
  evaluateConditionStandalone,
  resolveDynamicStandalone,
} from "./rule-executor";

// ═══════════════════════════════════════════════════════════════
// Types for V2 card-rules-v2.json structure
// ═══════════════════════════════════════════════════════════════

/** A single card entry from card-rules-v2.json */
export interface CardRuleV2Entry {
  cardId: string;
  cardName: string;
  superType: string;
  subTypes: string[];
  set: string;
  ruleBox: string;
  tags: string[];
  rules: RuleEntry[];
}

/** A single rule within a card */
export interface RuleEntry {
  identifier: string;
  version: number;
  type: "attack" | "ability" | "trainer_effect" | "energy_effect";
  attackName?: string;
  abilityName?: string;
  baseDamage?: number;
  cost?: Array<{ type: string; amount: number }>;
  originalText: string;
  mapped: boolean;
  confidence: number;
  parseSource: string;

  // From extracted analysis
  preconditions?: any[];
  costs?: any[];
  steps?: any[];
  modifiers?: any[];
  dynamicDamage?: any;
  flags?: Record<string, boolean>;
  abilitySubType?: string;
  triggers?: string[];
  trainerSubType?: string;
  instanceParams?: { numbers: number[] };
  note?: string;
}

// ═══════════════════════════════════════════════════════════════
// Execution Context for step interpretation
// ═══════════════════════════════════════════════════════════════

interface StepExecContext {
  ctx: EffectContext;
  result: AttackResult;
  baseDamage: number;
  /** Stored results from labeled steps */
  labels: Map<string, any>;
  /** Last coin flip result */
  lastCoinHeads: number;
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Compile a single card from card-rules-v2.json into CardEffectDef.
 * Returns null if the card has no compilable mapped rules.
 */
export function compileCardV2(card: CardRuleV2Entry): CardEffectDef | null {
  const mappedRules = card.rules.filter(r => r.mapped);
  if (mappedRules.length === 0) return null;

  const attacks: AttackEffect[] = [];
  const abilities: AbilityEffect[] = [];
  let trainer: TrainerEffect | undefined;
  let tool: ToolEffect | undefined;

  for (const rule of mappedRules) {
    switch (rule.type) {
      case "attack":
        attacks.push(compileAttackV2(rule, card.cardName));
        break;
      case "ability":
        const ab = compileAbilityV2(rule, card.cardName);
        if (ab) abilities.push(ab);
        break;
      case "trainer_effect":
        if (rule.trainerSubType === "Tool") {
          tool = compileToolV2(rule);
          // Tools also need trainer.onPlay for initial attachment
        } else if (rule.trainerSubType === "Stadium") {
          // Stadiums have ongoing effects, handled via modifiers
          trainer = compileTrainerV2(rule, card.cardName);
        } else {
          trainer = compileTrainerV2(rule, card.cardName);
        }
        break;
    }
  }

  if (attacks.length === 0 && abilities.length === 0 && !trainer && !tool) return null;

  const def: CardEffectDef = { cardId: card.cardId, cardName: card.cardName };
  if (attacks.length > 0) def.attacks = attacks;
  if (abilities.length > 0) def.abilities = abilities;
  if (trainer) def.trainer = trainer;
  if (tool) def.tool = tool;

  return def;
}

/**
 * Compile all cards from card-rules-v2.json.
 * Returns array of successfully compiled defs.
 */
export function compileAllV2(cards: CardRuleV2Entry[]): CardEffectDef[] {
  return cards
    .map(c => compileCardV2(c))
    .filter((d): d is CardEffectDef => d !== null);
}

// ═══════════════════════════════════════════════════════════════
// Attack Compilation
// ═══════════════════════════════════════════════════════════════

function compileAttackV2(rule: RuleEntry, cardName: string): AttackEffect {
  return {
    name: rule.attackName || "Unknown",
    onAttack: (ctx: EffectContext, baseDamage: number): AttackResult => {
      // Check preconditions
      if (rule.preconditions && rule.preconditions.length > 0) {
        for (const cond of rule.preconditions) {
          if (!evaluateConditionStandalone(cond, ctx)) {
            return { damage: 0 };
          }
        }
      }

      // Resolve dynamic damage component
      let effectiveBase = baseDamage;
      if (rule.dynamicDamage) {
        effectiveBase += resolveDynamicStandalone(rule.dynamicDamage, ctx);
      }

      // Execute steps via unified executor
      return executeAttackStepsSync(rule.steps || [], ctx, effectiveBase);
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Ability Compilation
// ═══════════════════════════════════════════════════════════════

function compileAbilityV2(rule: RuleEntry, cardName: string): AbilityEffect | null {
  const subType = rule.abilitySubType || "activated";

  switch (subType) {
    case "activated": {
      const effect: AbilityEffect = {
        name: rule.abilityName || "Unknown",
        type: "activated" as AbilityType,
        onActivate: async (ctx: EffectContext) => {
          if (rule.steps) {
            await executeSteps(rule.steps, ctx);
            ctx.log(`${cardName} - ${rule.abilityName}: 特性发动`);
          }
        },
      };

      if (rule.preconditions && rule.preconditions.length > 0) {
        effect.canActivate = (ctx: EffectContext) => {
          return rule.preconditions!.every(c => evaluateConditionStandalone(c, ctx));
        };
      }

      return effect;
    }

    case "passive": {
      const effect: AbilityEffect = {
        name: rule.abilityName || "Unknown",
        type: "passive" as AbilityType,
      };

      // Compile modifiers into callbacks
      if (rule.modifiers) {
        for (const mod of rule.modifiers) {
          compileModifierIntoAbility(mod, effect);
        }
      }

      return effect;
    }

    case "triggered":
    case "on_enter": {
      const effect: AbilityEffect = {
        name: rule.abilityName || "Unknown",
        type: subType === "on_enter" ? "on_enter" as AbilityType : "activated" as AbilityType,
      };

      if (subType === "on_enter") {
        effect.onEnter = (ctx: EffectContext) => {
          if (rule.steps) {
            executeStepsSync(rule.steps, ctx);
          }
          ctx.log(`${cardName} - ${rule.abilityName}: 入场触发`);
        };
      }

      return effect;
    }

    default:
      return null;
  }
}

function compileModifierIntoAbility(mod: any, effect: AbilityEffect): void {
  const modType = mod.type;
  const value = typeof mod.value === "number" ? mod.value : 0;

  switch (modType) {
    case "modify_damage_outgoing":
    case "add_damage":
      effect.modifyDamage = (_ctx, damage, isAttacker) =>
        isAttacker ? damage + value : damage;
      break;

    case "modify_damage_incoming":
    case "reduce_damage":
      effect.modifyIncomingDamage = (_ctx, damage) =>
        Math.max(0, damage + value); // value is negative for reduction
      break;

    case "prevent_damage_incoming":
      effect.modifyIncomingDamage = (_ctx, _damage) => 0;
      break;

    case "prevent_damage_to_bench":
      effect.preventBenchDamage = true;
      break;

    case "modify_retreat_cost":
    case "reduce_retreat_cost":
    case "no_retreat_cost":
      const retreatMod = modType === "no_retreat_cost" ? -999 : value;
      effect.modifyRetreatCost = (_ctx, cost) => Math.max(0, cost + retreatMod);
      break;

    // ─── V2 Modifier Types (tagged for modifier-query.ts) ───
    case "prevent_item_usage":
    case "prevent_supporter_usage":
    case "prevent_ability":
    case "prevent_evolution":
    case "prevent_status":
    case "prevent_energy_removal":
    case "prevent_attack":
    case "prevent_retreat":
      (effect as any)._modifierType = modType;
      (effect as any)._modifierValue = value;
      (effect as any)._modifierTarget = mod.target?.owner || "opponent";
      break;

    case "extra_energy_attach":
      (effect as any)._modifierType = "extra_energy_attach";
      (effect as any)._modifierValue = value || 1;
      break;

    case "modify_hp":
      (effect as any)._modifierType = "modify_hp";
      (effect as any)._modifierValue = value;
      break;

    case "modify_attack_cost":
      (effect as any)._modifierType = "modify_attack_cost";
      (effect as any)._modifierValue = value;
      break;

    case "ignore_weakness":
      (effect as any)._modifierType = "ignore_weakness";
      break;

    case "ignore_resistance":
      (effect as any)._modifierType = "ignore_resistance";
      break;

    case "heal_between_turns":
      (effect as any)._modifierType = "heal_between_turns";
      (effect as any)._modifierValue = value;
      break;

    case "redirect_damage":
      (effect as any)._modifierType = "redirect_damage";
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// Trainer Compilation
// ═══════════════════════════════════════════════════════════════

function compileTrainerV2(rule: RuleEntry, cardName: string): TrainerEffect {
  return {
    canPlay: rule.preconditions && rule.preconditions.length > 0
      ? (ctx: EffectContext) => rule.preconditions!.every(c => evaluateConditionStandalone(c, ctx))
      : undefined,
    onPlay: async (ctx: EffectContext) => {
      if (rule.steps) {
        await executeSteps(rule.steps, ctx);
        ctx.log(`${cardName}: 使用`);
      }
    },
  };
}

function compileToolV2(rule: RuleEntry): ToolEffect {
  const tool: ToolEffect = { whileAttached: {} };

  for (const mod of (rule.modifiers || [])) {
    const value = typeof mod.value === "number" ? mod.value : 0;
    switch (mod.type) {
      case "modify_damage_outgoing":
      case "add_damage":
        tool.whileAttached!.modifyDamage = (_ctx, damage) => damage + value;
        break;
      case "modify_damage_incoming":
      case "reduce_damage":
        tool.whileAttached!.modifyIncomingDamage = (_ctx, damage) => Math.max(0, damage + value);
        break;
      case "modify_retreat_cost":
      case "reduce_retreat_cost":
        tool.whileAttached!.modifyRetreatCost = (_ctx, cost) => Math.max(0, cost + value);
        break;
    }
  }

  return tool;
}

// ═══════════════════════════════════════════════════════════════
// Step Executor — REMOVED in Iteration 2 refactoring.
// All step execution now delegates to the unified executor
// in rule-executor.ts (executeAttackStepsSync, executeSteps).
// ═══════════════════════════════════════════════════════════════

