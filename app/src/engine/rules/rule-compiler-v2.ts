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
import { GameCard, StatusCondition } from "../game-state";

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
      const execCtx: StepExecContext = {
        ctx,
        result: { damage: baseDamage },
        baseDamage,
        labels: new Map(),
        lastCoinHeads: 0,
      };

      // Check preconditions
      if (rule.preconditions && rule.preconditions.length > 0) {
        for (const cond of rule.preconditions) {
          if (!evaluateCondition(cond, ctx)) {
            return { damage: 0 }; // Attack fails
          }
        }
      }

      // Handle dynamic damage
      if (rule.dynamicDamage) {
        const dynDmg = resolveDynamicValue(rule.dynamicDamage, execCtx);
        execCtx.result.damage = baseDamage + dynDmg;
      }

      // Execute steps
      if (rule.steps && rule.steps.length > 0) {
        executeStepsSync(rule.steps, execCtx);
      }

      return execCtx.result;
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
            const execCtx: StepExecContext = {
              ctx, result: { damage: 0 }, baseDamage: 0,
              labels: new Map(), lastCoinHeads: 0,
            };
            executeStepsSync(rule.steps, execCtx);
          }
          ctx.log(`${cardName} - ${rule.abilityName}: 特性发动`);
        },
      };

      if (rule.preconditions && rule.preconditions.length > 0) {
        effect.canActivate = (ctx: EffectContext) => {
          return rule.preconditions!.every(c => evaluateCondition(c, ctx));
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
            const execCtx: StepExecContext = {
              ctx, result: { damage: 0 }, baseDamage: 0,
              labels: new Map(), lastCoinHeads: 0,
            };
            executeStepsSync(rule.steps, execCtx);
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
      ? (ctx: EffectContext) => rule.preconditions!.every(c => evaluateCondition(c, ctx))
      : undefined,
    onPlay: async (ctx: EffectContext) => {
      if (rule.steps) {
        const execCtx: StepExecContext = {
          ctx, result: { damage: 0 }, baseDamage: 0,
          labels: new Map(), lastCoinHeads: 0,
        };
        executeStepsSync(rule.steps, execCtx);
      }
      ctx.log(`${cardName}: 使用`);
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
// Step Executor (synchronous, tree-walk interpreter)
// ═══════════════════════════════════════════════════════════════

function executeStepsSync(steps: any[], execCtx: StepExecContext): void {
  for (const step of steps) {
    executeStepSync(step, execCtx);
  }
}

function executeStepSync(step: any, execCtx: StepExecContext): void {
  const { ctx, result } = execCtx;
  const action = step.action || step.actionType;

  // Handle branch (can appear on any step)
  if (step.branch && !action) {
    // Pure branch step (action: "if")
    if (evaluateCondition(step.branch.condition, ctx)) {
      executeStepsSync(step.branch.thenSteps || [], execCtx);
    } else if (step.branch.elseSteps) {
      executeStepsSync(step.branch.elseSteps, execCtx);
    }
    return;
  }

  switch (action) {
    // ── Damage & Healing ──
    case "deal_damage": {
      const dmg = resolveValue(step.params?.damage, execCtx);
      if (step.target) {
        const targets = resolveTargets(step.target, ctx);
        for (const t of targets) ctx.damage(dmg, t);
      } else {
        result.damage = dmg;
      }
      break;
    }

    case "place_damage_counters": {
      const dmg = resolveValue(step.params?.damage, execCtx);
      const targets = resolveTargets(step.target, ctx);
      for (const t of targets) {
        t.damageCounters = (t.damageCounters || 0) + Math.floor(dmg / 10);
      }
      break;
    }

    case "damage_self": {
      const dmg = resolveValue(step.params?.damage, execCtx);
      result.selfDamage = (result.selfDamage || 0) + dmg;
      break;
    }

    case "heal": {
      const amount = resolveValue(step.params?.amount, execCtx);
      const targets = resolveTargets(step.target, ctx);
      for (const t of targets) ctx.heal(amount, t);
      break;
    }

    case "full_heal": {
      const targets = resolveTargets(step.target, ctx);
      for (const t of targets) ctx.heal(9999, t);
      break;
    }

    case "spread_damage": {
      const dmg = resolveValue(step.params?.damage, execCtx);
      const targets = resolveTargets(step.target, ctx);
      // Auto-distribute evenly for sync context
      const perTarget = Math.floor(dmg / Math.max(targets.length, 1));
      for (const t of targets) {
        t.damageCounters = (t.damageCounters || 0) + Math.floor(perTarget / 10);
      }
      break;
    }

    case "move_damage_counters": {
      // Simplified: move all damage from source to target
      const targets = resolveTargets(step.target, ctx);
      if (targets.length > 0 && ctx.source) {
        const counters = ctx.source.damageCounters || 0;
        ctx.source.damageCounters = 0;
        targets[0].damageCounters = (targets[0].damageCounters || 0) + counters;
      }
      break;
    }

    // ── Status ──
    case "apply_status": {
      const status = step.params?.status as StatusCondition;
      if (!status) break;
      const targets = resolveTargets(step.target, ctx);
      if (targets.length > 0) {
        // In attack context, use result.statusEffects
        const target = targets[0];
        const isOpp = isOpponentTarget(step.target);
        result.statusEffects = [
          ...(result.statusEffects || []),
          { target: isOpp ? "defender" : "self", status },
        ];
      } else {
        // Fallback: apply directly
        const target = step.target?.owner === "opponent"
          ? ctx.opponent.active
          : ctx.source;
        if (target) ctx.applyStatus(target, status);
      }
      break;
    }

    case "remove_all_status": {
      const targets = resolveTargets(step.target, ctx);
      for (const t of targets) ctx.removeAllStatus(t);
      break;
    }

    case "remove_status": {
      const status = step.params?.status as StatusCondition;
      const targets = resolveTargets(step.target, ctx);
      for (const t of targets) {
        if (status) ctx.removeStatus(t, status);
        else ctx.removeAllStatus(t);
      }
      break;
    }

    // ── Card Movement ──
    case "draw_cards": {
      const amount = resolveValue(step.params?.amount, execCtx);
      const who = resolveWho(step.target);
      ctx.drawCards(amount, who);
      break;
    }

    case "discard_cards": {
      const amount = resolveValue(step.params?.amount || step.target?.count, execCtx);
      const who = resolveWho(step.target);
      const zone = step.target?.zone;
      if (zone === "hand") {
        ctx.discardFromHand(amount, who);
      } else if (zone === "deck_top") {
        const player = who === "opponent" ? ctx.opponent : ctx.player;
        for (let i = 0; i < amount && player.deck.cards.length > 0; i++) {
          const card = player.deck.cards.shift()!;
          player.discard.cards.push(card);
        }
      }
      break;
    }

    case "search_deck": {
      const who = resolveWho(step.target);
      const filter = buildFilter(step.params?.searchFilter);
      const count = resolveValue(step.params?.searchCount || step.target?.count || step.target?.maxCount || 1, execCtx);
      const found = ctx.searchDeck(filter, count, who);
      const dest = step.params?.destination;
      for (const card of found) {
        if (dest === "bench" || dest === "in_play") {
          // Put on bench
          const player = who === "opponent" ? ctx.opponent : ctx.player;
          if (player.bench.cards.length < 5) player.bench.cards.push(card);
        } else if (dest === "attached_energy") {
          ctx.source.attachedEnergy.push(card);
        } else {
          ctx.addToHand(card, who);
        }
      }
      // Don't auto-shuffle here, let the next shuffle_deck step handle it
      break;
    }

    case "shuffle_deck": {
      const who = resolveWho(step.target);
      ctx.shuffleDeck(who);
      break;
    }

    case "shuffle_into_deck": {
      const who = resolveWho(step.target);
      const zone = step.target?.zone;
      if (zone === "hand") {
        ctx.shuffleHandIntoDeck(who);
      } else if (zone === "active" && step.target?.owner === "self") {
        // Shuffle self and attached cards into deck
        const cards = ctx.pickUpPokemon(ctx.source.instanceId, "player");
        ctx.shuffleIntoDeck(cards, "player");
      }
      break;
    }

    case "recover_from_discard": {
      const who = resolveWho(step.target);
      const filter = buildFilter(step.params?.searchFilter);
      const count = resolveValue(step.params?.amount || step.target?.count || 1, execCtx);
      const found = ctx.searchDiscard(filter, count, who);
      const dest = step.params?.destination || "hand";
      for (const card of found) {
        if (dest === "hand") ctx.addToHand(card, who);
        else if (dest === "bench") {
          const player = who === "opponent" ? ctx.opponent : ctx.player;
          if (player.bench.cards.length < 5) player.bench.cards.push(card);
        } else if (dest === "deck") ctx.shuffleIntoDeck([card], who);
      }
      break;
    }

    case "return_to_hand": {
      const who = resolveWho(step.target);
      if (step.target?.zone === "active" || step.target?.zone === "in_play") {
        const cards = ctx.pickUpPokemon(ctx.source.instanceId, who);
        for (const c of cards) ctx.addToHand(c, who);
      }
      break;
    }

    case "put_on_deck_top": {
      const who = resolveWho(step.target);
      // Simplified: put source on top
      break;
    }

    case "move_to_lost_zone": {
      // Simplified: treat as discard for now (lost zone not fully implemented)
      const who = resolveWho(step.target);
      break;
    }

    // ── Information ──
    case "reveal_cards":
    case "show_hand":
    case "look_at_cards":
      // UI-only actions, no game state change in sync mode
      break;

    case "order_cards":
      // Requires interactive ordering, skip in sync mode
      break;

    // ── Energy ──
    case "attach_energy": {
      // Standard energy attach (from hand), handled by game controller
      break;
    }

    case "accelerate_energy": {
      const target = resolveTargets(step.target, ctx)[0] || ctx.source;
      const filter = buildFilter(step.params?.searchFilter);
      const count = resolveValue(step.params?.energyCount || 1, execCtx);
      // From discard by default
      ctx.attachEnergyFromDiscard(filter, count, target);
      break;
    }

    case "discard_energy": {
      const count = resolveValue(step.params?.energyCount || 1, execCtx);
      if (count === -1 || count >= 999) {
        // Discard all
        result.discardEnergy = 999;
      } else {
        result.discardEnergy = (result.discardEnergy || 0) + count;
      }
      break;
    }

    case "move_energy": {
      // Simplified: auto-move first energy
      const targets = resolveTargets(step.target, ctx);
      if (targets.length > 0 && ctx.source.attachedEnergy.length > 0) {
        const energy = ctx.source.attachedEnergy[0];
        ctx.moveEnergy(ctx.source, targets[0], energy.instanceId);
      }
      break;
    }

    // ── Pokemon Control ──
    case "switch_pokemon": {
      const isOpp = isOpponentTarget(step.target);
      if (isOpp) {
        if (ctx.opponent.bench.cards.length > 0) {
          ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
        }
      } else {
        if (ctx.player.bench.cards.length > 0) {
          ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
        }
      }
      break;
    }

    case "evolve":
    case "devolve":
    case "copy_attack":
    case "use_attack":
      // Complex operations requiring full async executor
      break;

    // ── Markers ──
    case "set_marker": {
      const marker = step.params?.marker;
      if (!marker) break;
      const targets = resolveTargets(step.target, ctx);
      for (const t of targets) {
        ctx.addMarker(t, marker, step.params?.value ?? 1);
      }
      break;
    }

    case "remove_marker": {
      const marker = step.params?.marker;
      if (!marker) break;
      const targets = resolveTargets(step.target, ctx);
      for (const t of targets) ctx.removeMarker(t, marker);
      break;
    }

    // ── Stadium ──
    case "discard_stadium":
      ctx.removeStadium();
      break;

    // ── RNG ──
    case "flip_coin": {
      const heads = ctx.flipCoin();
      execCtx.lastCoinHeads = heads ? 1 : 0;
      if (step.branch) {
        if (heads && step.branch.condition?.type === "coin_flip") {
          executeStepsSync(step.branch.thenSteps || [], execCtx);
        } else if (!heads && step.branch.elseSteps) {
          executeStepsSync(step.branch.elseSteps, execCtx);
        } else if (!heads && step.branch.condition?.type === "not") {
          executeStepsSync(step.branch.thenSteps || [], execCtx);
        }
      }
      break;
    }

    case "flip_coins": {
      const count = resolveValue(step.params?.coinCount, execCtx);
      const flips = ctx.flipCoins(count);
      execCtx.lastCoinHeads = flips.heads;
      break;
    }

    // ── Player Interaction (sync fallback) ──
    case "choose_cards":
    case "choose_pokemon":
    case "choose_option":
    case "choose_type":
    case "confirm":
      // In sync mode, auto-select or skip
      break;

    // ── Flow Control ──
    case "if": {
      if (step.branch) {
        if (evaluateCondition(step.branch.condition, ctx)) {
          executeStepsSync(step.branch.thenSteps || [], execCtx);
        } else if (step.branch.elseSteps) {
          executeStepsSync(step.branch.elseSteps, execCtx);
        }
      }
      break;
    }

    case "for_each": {
      if (step.loop) {
        const targets = resolveTargets(step.loop.target, ctx);
        for (const _t of targets) {
          executeStepsSync(step.loop.body || [], execCtx);
        }
      }
      break;
    }

    case "repeat": {
      if (step.loop) {
        const count = resolveValue(step.loop.count, execCtx);
        for (let i = 0; i < count; i++) {
          executeStepsSync(step.loop.body || [], execCtx);
        }
      }
      break;
    }

    case "extra_turn":
      // Requires engine support, set a marker
      ctx.addMarker(ctx.source, "EXTRA_TURN", 1);
      break;

    case "end_turn":
      // Force end turn, handled by engine
      break;

    // ── Rule Overrides ──
    case "add_damage": {
      const value = resolveValue(step.params?.value, execCtx);
      result.damage = (result.damage || 0) + value;
      break;
    }

    case "reduce_damage": {
      const value = resolveValue(step.params?.value, execCtx);
      ctx.addMarker(ctx.source, `DAMAGE_REDUCTION:${value}`, 1);
      break;
    }

    case "prevent_damage":
      ctx.addMarker(ctx.source, "PREVENT_ALL_DAMAGE_NEXT_TURN", 1);
      break;

    case "prevent_retreat":
      result.preventRetreat = true;
      break;

    case "prevent_item_usage":
    case "prevent_supporter_usage":
    case "prevent_ability":
    case "prevent_attack":
    case "prevent_evolution":
    case "prevent_status":
    case "prevent_energy_removal":
      // Set marker for the engine to check
      ctx.addMarker(
        step.target?.owner === "opponent" ? (ctx.opponent.active || ctx.source) : ctx.source,
        action.toUpperCase(),
        1
      );
      break;

    case "ignore_weakness":
      result.skipWeakness = true;
      break;

    case "ignore_resistance":
      result.skipResistance = true;
      break;

    case "ignore_effects":
      // Mark that effects on defender should be ignored
      break;

    case "log":
      ctx.log(step.params?.message || "");
      break;

    default:
      // Unknown action — skip silently
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// DynamicValue Resolver
// ═══════════════════════════════════════════════════════════════

function resolveDynamicValue(dv: any, execCtx: StepExecContext): number {
  if (!dv) return 0;
  const { ctx } = execCtx;

  switch (dv.calc) {
    case "constant":
      return dv.value || 0;

    case "coin_flip": {
      const count = resolveValue(dv.coinCount, execCtx);
      const flips = ctx.flipCoins(count);
      execCtx.lastCoinHeads = flips.heads;
      return flips.heads * (dv.perHeads || 0);
    }

    case "coin_until_tails": {
      let heads = 0;
      while (ctx.flipCoin()) heads++;
      return heads * (dv.perHeads || 0);
    }

    case "zone_count": {
      const zone = dv.zone;
      const owner = dv.owner;
      let count = 0;

      const getZoneCards = (player: any, z: string): GameCard[] => {
        switch (z) {
          case "bench": return player.bench?.cards || [];
          case "active": return player.active ? [player.active] : [];
          case "in_play": return [
            ...(player.active ? [player.active] : []),
            ...(player.bench?.cards || []),
          ];
          case "hand": return player.hand?.cards || [];
          case "discard": return player.discard?.cards || [];
          case "attached_tool": {
            const all = [
              ...(player.active ? [player.active] : []),
              ...(player.bench?.cards || []),
            ];
            return all.filter((p: GameCard) => (p as any).attachedTool);
          }
          default: return [];
        }
      };

      const players = owner === "self" ? [ctx.player]
        : owner === "opponent" ? [ctx.opponent]
        : [ctx.player, ctx.opponent];

      for (const p of players) {
        let cards = getZoneCards(p, zone);
        if (dv.filter) {
          const filterFn = buildFilter(dv.filter);
          cards = cards.filter(filterFn);
        }
        count += cards.length;
      }

      return count * (dv.per || 0);
    }

    case "damage_counters": {
      const targets = resolveTargets(dv.target, ctx);
      let total = 0;
      for (const t of targets) total += (t.damageCounters || 0);
      return total * (dv.per || 0);
    }

    case "hand_count": {
      const player = dv.owner === "opponent" ? ctx.opponent : ctx.player;
      return (player.hand?.cards?.length || 0) * (dv.per || 0);
    }

    case "attached_energy_count": {
      const targets = resolveTargets(dv.target, ctx);
      let total = 0;
      for (const t of targets) {
        if (dv.energyType) {
          total += t.attachedEnergy.filter(
            (e: GameCard) => e.card.types?.includes(dv.energyType)
          ).length;
        } else {
          total += t.attachedEnergy.length;
        }
      }
      return total * (dv.per || 0);
    }

    case "discard_count": {
      const player = dv.owner === "opponent" ? ctx.opponent : ctx.player;
      let cards = player.discard?.cards || [];
      if (dv.filter) {
        const filterFn = buildFilter(dv.filter);
        cards = cards.filter(filterFn);
      }
      return cards.length * (dv.per || 0);
    }

    case "prizes_remaining": {
      const player = dv.owner === "opponent" ? ctx.opponent : ctx.player;
      return (player.prizes?.cards?.length || 0) * (dv.per || 0);
    }

    case "prizes_taken": {
      const player = dv.owner === "opponent" ? ctx.opponent : ctx.player;
      return (6 - (player.prizes?.cards?.length || 0)) * (dv.per || 0);
    }

    case "per_unit": {
      const targets = resolveTargets(dv.countSource, ctx);
      let count = 0;
      for (const t of targets) {
        switch (dv.countProperty) {
          case "retreat_cost":
            count += t.card.retreatCost?.length || 0;
            break;
          case "energy_cards":
            count += t.attachedEnergy.length;
            break;
          case "damage_counters":
            count += t.damageCounters || 0;
            break;
          default:
            count += 1;
        }
      }
      return count * (dv.per || 0);
    }

    case "remaining_hp_diff": {
      const targets = resolveTargets(dv.target, ctx);
      if (targets.length > 0) {
        const t = targets[0];
        const maxHP = parseInt(String(t.card.hp), 10) || 0;
        const remaining = maxHP - (t.damageCounters || 0) * 10;
        return (dv.subtractFrom || maxHP) - remaining;
      }
      return 0;
    }

    case "instant_ko": {
      // Return a very large number to ensure KO
      return 9999;
    }

    case "add":
      return resolveDynamicValue(dv.a, execCtx) + resolveDynamicValue(dv.b, execCtx);

    case "subtract":
      return Math.max(0, resolveDynamicValue(dv.a, execCtx) - resolveDynamicValue(dv.b, execCtx));

    case "multiply":
      return resolveDynamicValue(dv.a, execCtx) * resolveDynamicValue(dv.b, execCtx);

    case "min":
      return Math.min(resolveDynamicValue(dv.a, execCtx), resolveDynamicValue(dv.b, execCtx));

    case "max":
      return Math.max(resolveDynamicValue(dv.a, execCtx), resolveDynamicValue(dv.b, execCtx));

    case "step_result": {
      const labelValue = execCtx.labels.get(dv.label);
      return typeof labelValue === "number" ? labelValue : 0;
    }

    case "formula":
      // Formula fallback — can't evaluate arbitrary expressions in sync mode
      // Return 0 and log
      return 0;

    default:
      return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// Condition Evaluator
// ═══════════════════════════════════════════════════════════════

function evaluateCondition(condition: any, ctx: EffectContext): boolean {
  if (!condition) return true;
  const type = condition.type || condition.check;

  switch (type) {
    case "coin_flip":
      return ctx.flipCoin();

    case "coin_flip_count": {
      const flips = ctx.flipCoins(condition.total || 2);
      return flips.heads >= (condition.min || 1);
    }

    case "zone_has_cards": {
      const player = condition.owner === "opponent" ? ctx.opponent
        : condition.owner === "self" ? ctx.player
        : ctx.player; // default to self
      const zone = condition.zone;
      let count = 0;
      switch (zone) {
        case "hand": count = player.hand?.cards?.length || 0; break;
        case "deck": count = player.deck?.cards?.length || 0; break;
        case "bench": count = player.bench?.cards?.length || 0; break;
        case "discard": count = player.discard?.cards?.length || 0; break;
        case "prizes": count = player.prizes?.cards?.length || 0; break;
        case "stadium": count = ctx.getStadium() ? 1 : 0; break;
      }
      return compareValues(count, condition.comparison || "gte", condition.count || 1);
    }

    case "zone_is_empty": {
      const player = condition.owner === "opponent" ? ctx.opponent : ctx.player;
      switch (condition.zone) {
        case "bench": return (player.bench?.cards?.length || 0) === 0;
        case "hand": return (player.hand?.cards?.length || 0) === 0;
        default: return false;
      }
    }

    case "bench_has_pokemon":
    case "has_pokemon_on_bench": {
      const player = condition.owner === "opponent" ? ctx.opponent : ctx.player;
      return (player.bench?.cards?.length || 0) > 0;
    }

    case "bench_not_full": {
      const player = condition.owner === "opponent" ? ctx.opponent : ctx.player;
      return (player.bench?.cards?.length || 0) < 5;
    }

    case "has_damage": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => (t.damageCounters || 0) > 0);
    }

    case "has_no_damage": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.every(t => (t.damageCounters || 0) === 0);
    }

    case "has_status": {
      const targets = resolveTargets(condition.target, ctx);
      if (condition.status) {
        return targets.some(t => t.statusConditions?.includes(condition.status));
      }
      return targets.some(t => (t.statusConditions?.length || 0) > 0);
    }

    case "has_no_status": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.every(t => (t.statusConditions?.length || 0) === 0);
    }

    case "has_energy": {
      const targets = resolveTargets(condition.target, ctx);
      const minCount = condition.count || 1;
      return targets.some(t => {
        if (condition.energyType) {
          return t.attachedEnergy.filter(
            (e: GameCard) => e.card.types?.includes(condition.energyType)
          ).length >= minCount;
        }
        return t.attachedEnergy.length >= minCount;
      });
    }

    case "has_type": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => t.card.types?.includes(condition.energyType));
    }

    case "hp_remaining": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => {
        const hp = (parseInt(String(t.card.hp), 10) || 0) - (t.damageCounters || 0) * 10;
        return compareValues(hp, condition.comparison, condition.value);
      });
    }

    case "is_first_turn":
      return (ctx.state as any).turnNumber <= 2;

    case "is_going_first":
      return ctx.playerIndex === 0;

    case "is_going_second":
      return ctx.playerIndex === 1;

    case "has_tag": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => {
        const name = t.card.name?.toLowerCase() || "";
        const tag = (condition.tag || "").toLowerCase();
        return name.includes(tag) ||
          (t.card.subtypes?.some((s: string) => s.toLowerCase().includes(tag)) ?? false);
      });
    }

    case "has_marker": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => ctx.hasMarker(t, condition.marker));
    }

    case "has_no_marker": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.every(t => !ctx.hasMarker(t, condition.marker));
    }

    case "has_rule_box": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => {
        const name = t.card.name || "";
        const rb = condition.ruleBox;
        if (rb === "ex") return name.endsWith(" ex");
        if (rb === "V") return name.includes("-V") || t.card.subtypes?.includes("V");
        if (rb === "VMAX") return t.card.subtypes?.includes("VMAX");
        if (rb === "GX") return name.includes("-GX");
        return false;
      });
    }

    case "card_name": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => t.card.name === condition.name);
    }

    case "card_name_contains": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => t.card.name?.includes(condition.substring));
    }

    case "card_sub_type": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => t.card.subtypes?.includes(condition.subType));
    }

    case "card_super_type": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => t.card.supertype === condition.superType);
    }

    case "has_played_supporter_this_turn":
      return (ctx.state as any).turnStatus?.supporterPlayed || false;

    case "evolved_this_turn": {
      const targets = resolveTargets(condition.target, ctx);
      return targets.some(t => ctx.hasMarker(t, "EVOLVED_THIS_TURN"));
    }

    case "stadium_in_play":
      return ctx.getStadium() !== null;

    case "usage_limit":
    case "vstar_power_available":
      // Engine-level checks, assume available
      return true;

    case "not":
      return !evaluateCondition(condition.condition, ctx);

    case "and":
      return (condition.conditions || []).every((c: any) => evaluateCondition(c, ctx));

    case "or":
      return (condition.conditions || []).some((c: any) => evaluateCondition(c, ctx));

    default:
      return true; // Unknown condition — permissive
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function resolveValue(v: any, execCtx: StepExecContext): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v.calc) return resolveDynamicValue(v, execCtx);
  if (v === "all") return 999;
  return parseInt(String(v), 10) || 0;
}

function resolveTargets(selector: any, ctx: EffectContext): GameCard[] {
  if (!selector) return ctx.source ? [ctx.source] : [];

  const owner = selector.owner;
  const zone = selector.zone;
  const position = selector.position;

  // Handle array zones
  const zones = Array.isArray(zone) ? zone : [zone];
  let targets: GameCard[] = [];

  for (const z of zones) {
    switch (z) {
      case "active":
        if (owner === "opponent") {
          if (ctx.opponent.active) targets.push(ctx.opponent.active);
        } else {
          if (ctx.player.active) targets.push(ctx.player.active);
        }
        break;

      case "bench":
        if (owner === "opponent") targets.push(...(ctx.opponent.bench?.cards || []));
        else if (owner === "both") {
          targets.push(...(ctx.player.bench?.cards || []));
          targets.push(...(ctx.opponent.bench?.cards || []));
        }
        else targets.push(...(ctx.player.bench?.cards || []));
        break;

      case "in_play":
        if (owner === "opponent") targets.push(...ctx.getAllPokemon("opponent"));
        else if (owner === "both") {
          targets.push(...ctx.getAllPokemon("player"));
          targets.push(...ctx.getAllPokemon("opponent"));
        }
        else targets.push(...ctx.getAllPokemon("player"));
        break;

      case "hand":
        if (owner === "opponent") targets.push(...(ctx.opponent.hand?.cards || []));
        else targets.push(...(ctx.player.hand?.cards || []));
        break;

      case "deck":
      case "deck_top":
        // Can't resolve deck cards as targets directly
        break;

      case "discard":
        if (owner === "opponent") targets.push(...(ctx.opponent.discard?.cards || []));
        else targets.push(...(ctx.player.discard?.cards || []));
        break;

      case "attached_energy":
        if (owner === "self" || !owner) {
          targets.push(...(ctx.source?.attachedEnergy || []));
        }
        break;

      case "attached_tool":
        // Tool handling
        break;

      default:
        if (!z || z === "any") {
          if (owner === "opponent" && ctx.opponent.active) targets.push(ctx.opponent.active);
          else if (ctx.source) targets.push(ctx.source);
        }
    }
  }

  // Apply position filter
  if (position === "active_only") {
    targets = targets.filter(t =>
      t.instanceId === ctx.player.active?.instanceId ||
      t.instanceId === ctx.opponent.active?.instanceId
    );
  } else if (position === "bench_only") {
    const activeIds = new Set([ctx.player.active?.instanceId, ctx.opponent.active?.instanceId]);
    targets = targets.filter(t => !activeIds.has(t.instanceId));
  }

  // Apply card filter
  if (selector.filter) {
    const filterFn = buildFilter(selector.filter);
    targets = targets.filter(filterFn);
  }

  // Apply count
  const count = selector.count;
  if (typeof count === "number" && count > 0 && targets.length > count) {
    targets = targets.slice(0, count);
  }

  return targets;
}

function resolveWho(target: any): "player" | "opponent" {
  if (!target) return "player";
  return target.owner === "opponent" ? "opponent" : "player";
}

function isOpponentTarget(target: any): boolean {
  return target?.owner === "opponent";
}

function compareValues(actual: number, comparison: string, expected: number): boolean {
  switch (comparison) {
    case "gte": return actual >= expected;
    case "lte": return actual <= expected;
    case "eq": return actual === expected;
    case "gt": return actual > expected;
    case "lt": return actual < expected;
    default: return actual >= expected;
  }
}

function buildFilter(filter: any): (card: GameCard) => boolean {
  if (!filter) return () => true;

  return (card: GameCard): boolean => {
    if (filter.superType) {
      const types = Array.isArray(filter.superType) ? filter.superType : [filter.superType];
      if (!types.includes(card.card.supertype)) return false;
    }
    if (filter.subType) {
      const subs = Array.isArray(filter.subType) ? filter.subType : [filter.subType];
      if (!subs.some((s: string) => card.card.subtypes?.includes(s))) return false;
    }
    if (filter.energyType) {
      const types = Array.isArray(filter.energyType) ? filter.energyType : [filter.energyType];
      if (!types.some((t: string) => card.card.types?.includes(t))) return false;
    }
    if (filter.name && card.card.name !== filter.name) return false;
    if (filter.nameContains && !card.card.name?.includes(filter.nameContains)) return false;
    if (filter.hasAbility && (!card.card.abilities || card.card.abilities.length === 0)) return false;
    if (filter.hasDamage && (card.damageCounters || 0) === 0) return false;
    if (filter.isEvolved) {
      if (!card.card.subtypes?.some((s: string) => ["Stage 1", "Stage 2", "Stage1", "Stage2", "VMAX", "VSTAR", "MEGA", "BREAK"].includes(s))) {
        return false;
      }
    }
    if (filter.tag) {
      const tags = Array.isArray(filter.tag) ? filter.tag : [filter.tag];
      const cardName = card.card.name?.toLowerCase() || "";
      const cardSubs = card.card.subtypes?.map((s: string) => s.toLowerCase()) || [];
      if (!tags.some((t: string) => cardName.includes(t.toLowerCase()) || cardSubs.some(s => s.includes(t.toLowerCase())))) {
        return false;
      }
    }
    return true;
  };
}
