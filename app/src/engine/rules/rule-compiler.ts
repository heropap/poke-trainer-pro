/**
 * Rule Compiler — CTA JSON → CardEffectDef
 *
 * Converts a validated CardRuleDef JSON into an executable CardEffectDef
 * that can be registered in the effect registry at L1.5.
 *
 * Pipeline:
 *   CardRuleDef (JSON) → compileRule() → CardEffectDef (executable)
 *
 * The compiler wires up:
 * - Attack steps → onAttack callback (async via executeAttackSteps)
 * - Activated abilities → onActivate callback
 * - Passive abilities → modifiers (registered via ModifierPipeline)
 * - Triggered abilities → event hooks (registered via EventHookRegistry)
 * - Trainer effects → onPlay callback
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
import { GameCard } from "../game-state";
import {
  CardRuleDef,
  AttackRuleDef,
  AbilityRuleDef,
  TrainerRuleDef,
  ModifierDef,
} from "./card-rule-def";
import { Condition } from "./rule-schema";
import { executeAttackSteps, executeAttackStepsSync, executeSteps } from "./rule-executor";
import { ModifierPipeline } from "./modifier-pipeline";
import { EventHookRegistry } from "./event-hooks";

// ═══════════════════════════════════════════════════════
// Compiler Options
// ═══════════════════════════════════════════════════════

export interface CompilerOptions {
  /** Modifier pipeline instance (for passive abilities) */
  modifierPipeline?: ModifierPipeline;
  /** Event hook registry (for triggered abilities) */
  eventHookRegistry?: EventHookRegistry;
  /** Enable verbose logging */
  verbose?: boolean;
}

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════

/**
 * Compile a CardRuleDef into an executable CardEffectDef.
 * Returns null if the rule has no compilable effects.
 */
export function compileRule(
  rule: CardRuleDef,
  options?: CompilerOptions,
): CardEffectDef | null {
  const attacks = rule.attacks?.map(a => compileAttack(a, rule.cardName)).filter(Boolean) as AttackEffect[] | undefined;
  const abilities = rule.abilities
    ?.map(a => compileAbility(a, rule.cardId, rule.cardName, options))
    .filter(Boolean) as AbilityEffect[] | undefined;
  const trainer = rule.trainer
    ? compileTrainer(rule.trainer, rule.cardName)
    : undefined;
  const tool = rule.trainer?.subtype === "Tool" && rule.trainer.toolModifiers
    ? compileToolModifiers(rule.trainer.toolModifiers)
    : undefined;

  if (
    (!attacks || attacks.length === 0) &&
    (!abilities || abilities.length === 0) &&
    !trainer &&
    !tool
  ) {
    return null;
  }

  const def: CardEffectDef = {
    cardId: rule.cardId,
    cardName: rule.cardName,
  };

  if (attacks && attacks.length > 0) def.attacks = attacks;
  if (abilities && abilities.length > 0) def.abilities = abilities;
  if (trainer) def.trainer = trainer;
  if (tool) def.tool = tool;

  if (options?.verbose) {
    console.log(`[RuleCompiler] Compiled ${rule.cardName} (${rule.cardId}): ` +
      `${attacks?.length ?? 0} attacks, ${abilities?.length ?? 0} abilities, ` +
      `${trainer ? "trainer" : "no trainer"}, ${tool ? "tool" : "no tool"}`);
  }

  return def;
}

/**
 * Compile multiple rules at once.
 * Returns array of successfully compiled defs (skips nulls).
 */
export function compileRules(
  rules: CardRuleDef[],
  options?: CompilerOptions,
): CardEffectDef[] {
  return rules
    .map(r => compileRule(r, options))
    .filter(Boolean) as CardEffectDef[];
}

// ═══════════════════════════════════════════════════════
// Attack Compilation
// ═══════════════════════════════════════════════════════

function compileAttack(
  attackRule: AttackRuleDef,
  cardName: string,
): AttackEffect {
  return {
    name: attackRule.name,
    onAttack: (ctx: EffectContext, baseDamage: number): AttackResult => {
      // Check pre-conditions
      if (attackRule.conditions) {
        for (const cond of attackRule.conditions) {
          if (!evaluateConditionSync(cond, ctx)) {
            ctx.log(`${cardName} - ${attackRule.name}: 条件未满足`);
            return { damage: baseDamage };
          }
        }
      }

      // Use unified sync executor from rule-executor.ts
      return executeAttackStepsSync(attackRule.steps, ctx, baseDamage);
    },
  };
}

// ═══════════════════════════════════════════════════════
// Ability Compilation
// ═══════════════════════════════════════════════════════

function compileAbility(
  abilityRule: AbilityRuleDef,
  cardId: string,
  cardName: string,
  options?: CompilerOptions,
): AbilityEffect | null {
  switch (abilityRule.type) {
    case "activated":
      return compileActivatedAbility(abilityRule, cardName);
    case "passive":
      return compilePassiveAbility(abilityRule, cardId, cardName, options);
    case "triggered":
      return compileTriggeredAbility(abilityRule, cardId, cardName, options);
    default:
      return null;
  }
}

function compileActivatedAbility(
  rule: AbilityRuleDef,
  cardName: string,
): AbilityEffect {
  const effect: AbilityEffect = {
    name: rule.name,
    type: "activated" as AbilityType,
    onActivate: async (ctx: EffectContext) => {
      if (rule.steps) {
        await executeSteps(rule.steps, ctx);
        ctx.log(`${cardName} - ${rule.name}: 特性发动`);
      }
    },
  };

  if (rule.canActivate && rule.canActivate.length > 0) {
    effect.canActivate = (ctx: EffectContext) => {
      return rule.canActivate!.every(c => evaluateConditionSync(c, ctx));
    };
  }

  return effect;
}

function compilePassiveAbility(
  rule: AbilityRuleDef,
  cardId: string,
  cardName: string,
  options?: CompilerOptions,
): AbilityEffect | null {
  if (!rule.modifiers || rule.modifiers.length === 0) return null;

  // Compile modifiers into direct AbilityEffect callbacks
  const effect: AbilityEffect = {
    name: rule.name,
    type: "passive" as AbilityType,
  };

  for (const modDef of rule.modifiers) {
    switch (modDef.type.modify) {
      case "incoming_damage": {
        const amount = modDef.type.amount;
        effect.modifyIncomingDamage = (_ctx, damage) =>
          Math.max(0, damage + amount);
        break;
      }
      case "outgoing_damage": {
        const amount = modDef.type.amount;
        const typeFilter = modDef.type.type_filter;
        if (typeFilter) {
          effect.modifyDamage = (ctx, damage, isAttacker) => {
            if (!isAttacker) return damage;
            if (typeFilter && ctx.source.card.types) {
              if (!typeFilter.some((t: string) => ctx.source.card.types?.includes(t))) return damage;
            }
            return damage + amount;
          };
        } else {
          effect.modifyDamage = (_ctx, damage, isAttacker) =>
            isAttacker ? damage + amount : damage;
        }
        break;
      }
      case "retreat_cost": {
        const amount = modDef.type.amount;
        effect.modifyRetreatCost = (_ctx, cost) =>
          Math.max(0, cost + amount);
        break;
      }
      case "prevent_bench_damage":
        effect.preventBenchDamage = true;
        break;
    }
  }

  // Also register with ModifierPipeline if available
  if (options?.modifierPipeline) {
    // Deferred: registration happens when card enters play, not at compile time
    // The compiled effect carries the modifier defs for runtime registration
    (effect as any).__modifierDefs = rule.modifiers;
  }

  return effect;
}

function compileTriggeredAbility(
  rule: AbilityRuleDef,
  cardId: string,
  cardName: string,
  options?: CompilerOptions,
): AbilityEffect | null {
  if (!rule.trigger || !rule.steps) return null;

  // Map trigger events to AbilityEffect type
  const abilityType: AbilityType =
    rule.trigger === "on_evolve" || rule.trigger === "on_play_from_hand"
      ? "on_enter"
      : "activated"; // Use activated as catch-all for triggered

  const effect: AbilityEffect = {
    name: rule.name,
    type: abilityType,
  };

  if (abilityType === "on_enter") {
    effect.onEnter = (ctx: EffectContext) => {
      if (rule.condition && !evaluateConditionSync(rule.condition, ctx)) return;
      // Execute steps synchronously for on_enter
      // (Full async path uses EventHookRegistry)
      for (const step of rule.steps!) {
        executeAttackStepSync(step, ctx, { damage: 0 }, 0);
      }
      ctx.log(`${cardName} - ${rule.name}: 触发`);
    };
  }

  // Register with EventHookRegistry if available
  if (options?.eventHookRegistry && rule.trigger) {
    // Deferred: registration happens when card enters play
    (effect as any).__triggerDef = {
      event: rule.trigger,
      condition: rule.condition,
      steps: rule.steps,
    };
  }

  return effect;
}

// ═══════════════════════════════════════════════════════
// Trainer Compilation
// ═══════════════════════════════════════════════════════

function compileTrainer(
  trainerRule: TrainerRuleDef,
  cardName: string,
): TrainerEffect | undefined {
  if (!trainerRule.steps && !trainerRule.stadiumEffect) return undefined;

  const trainerEffect: TrainerEffect = {
    onPlay: async (ctx: EffectContext) => {
      if (trainerRule.steps) {
        await executeSteps(trainerRule.steps, ctx);
        ctx.log(`${cardName}: 使用`);
      }
    },
  };

  // canPlay conditions
  if (trainerRule.canPlay && trainerRule.canPlay.length > 0) {
    trainerEffect.canPlay = (ctx: EffectContext) => {
      return trainerRule.canPlay!.every(c => evaluateConditionSync(c, ctx));
    };
  }

  return trainerEffect;
}

function compileToolModifiers(modifierDefs: ModifierDef[]): ToolEffect {
  const tool: ToolEffect = { whileAttached: {} };

  for (const modDef of modifierDefs) {
    switch (modDef.type.modify) {
      case "outgoing_damage": {
        const amount = modDef.type.amount;
        tool.whileAttached!.modifyDamage = (_ctx, damage) =>
          damage + amount;
        break;
      }
      case "incoming_damage": {
        const amount = modDef.type.amount;
        tool.whileAttached!.modifyIncomingDamage = (_ctx, damage) =>
          Math.max(0, damage + amount);
        break;
      }
      case "retreat_cost": {
        const amount = modDef.type.amount;
        tool.whileAttached!.modifyRetreatCost = (_ctx, cost) =>
          Math.max(0, cost + amount);
        break;
      }
    }
  }

  return tool;
}

// ═══════════════════════════════════════════════════════
// Shared Helpers
// ═══════════════════════════════════════════════════════

function resolveTargetsSimple(selector: { zone: string; [key: string]: any }, ctx: EffectContext): GameCard[] {
  switch (selector.zone) {
    case "self_active": return ctx.source ? [ctx.source] : [];
    case "opp_active": return ctx.opponent.active ? [ctx.opponent.active] : [];
    case "own_bench": return selector.choose
      ? ctx.player.bench.cards.slice(0, selector.choose)
      : [...ctx.player.bench.cards];
    case "opp_bench": return selector.choose
      ? ctx.opponent.bench.cards.slice(0, selector.choose)
      : [...ctx.opponent.bench.cards];
    case "all_own": return ctx.getAllPokemon("player");
    case "all_opp": return ctx.getAllPokemon("opponent");
    case "all_own_bench": return [...ctx.player.bench.cards];
    case "all_opp_bench": return [...ctx.opponent.bench.cards];
    case "all_in_play": return [...ctx.getAllPokemon("player"), ...ctx.getAllPokemon("opponent")];
    default: return [];
  }
}

function evaluateConditionSync(condition: Condition, ctx: EffectContext): boolean {
  switch (condition.check) {
    case "coin_flip": return ctx.flipCoin();
    case "coin_flip_multi": return ctx.flipCoins(condition.count).heads > 0;
    case "has_energy": {
      const targets = resolveTargetsSimple(condition.target, ctx);
      return targets.some(t => {
        const count = condition.type
          ? t.attachedEnergy.filter(e => e.card.types?.includes(condition.type!)).length
          : t.attachedEnergy.length;
        return count >= (condition.min ?? 1);
      });
    }
    case "has_damage": {
      const targets = resolveTargetsSimple(condition.target, ctx);
      return targets.some(t => t.damageCounters >= (condition.min ?? 1));
    }
    case "has_status": {
      const targets = resolveTargetsSimple(condition.target, ctx);
      return targets.some(t =>
        condition.status ? t.statusConditions.includes(condition.status) : t.statusConditions.length > 0
      );
    }
    case "has_pokemon_on_bench": {
      if (condition.who === "player" || condition.who === "both") {
        if (ctx.player.bench.cards.length === 0) return false;
      }
      if (condition.who === "opponent" || condition.who === "both") {
        if (ctx.opponent.bench.cards.length === 0) return false;
      }
      return true;
    }
    case "has_cards_in_deck": {
      const min = condition.min ?? 1;
      if (condition.who === "player" || condition.who === "both") {
        if (ctx.player.deck.cards.length < min) return false;
      }
      if (condition.who === "opponent" || condition.who === "both") {
        if (ctx.opponent.deck.cards.length < min) return false;
      }
      return true;
    }
    case "has_cards_in_hand": {
      const min = condition.min ?? 1;
      if (condition.who === "player" || condition.who === "both") {
        if (ctx.player.hand.cards.length < min) return false;
      }
      if (condition.who === "opponent" || condition.who === "both") {
        if (ctx.opponent.hand.cards.length < min) return false;
      }
      return true;
    }
    case "is_in_active_spot":
      return ctx.player.active?.instanceId === ctx.source.instanceId;
    case "has_tag": {
      const targets = resolveTargetsSimple(condition.target, ctx);
      return targets.some(t => {
        const name = t.card.name.toLowerCase();
        return name.includes(condition.tag.toLowerCase()) ||
          (t.card.subtypes?.some(s => s.toLowerCase().includes(condition.tag.toLowerCase())) ?? false);
      });
    }
    case "is_type": {
      const targets = resolveTargetsSimple(condition.target, ctx);
      return targets.some(t => t.card.types?.some(type => condition.types.includes(type as any)) ?? false);
    }
    case "marker_exists": {
      const targets = resolveTargetsSimple(condition.target, ctx);
      return targets.some(t => ctx.hasMarker(t, condition.marker));
    }
    case "hp_remaining_lte": {
      const targets = resolveTargetsSimple(condition.target, ctx);
      return targets.some(t => {
        const hp = (parseInt(String(t.card.hp), 10) || 0) - (t.damageCounters * 10);
        return hp <= condition.amount;
      });
    }
    case "not": return !evaluateConditionSync(condition.condition, ctx);
    case "and": return condition.conditions.every(c => evaluateConditionSync(c, ctx));
    case "or": return condition.conditions.some(c => evaluateConditionSync(c, ctx));
    default: return true;
  }
}

