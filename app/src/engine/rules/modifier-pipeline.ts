/**
 * Modifier Pipeline — Passive Ability Modifier Stack
 *
 * Implements the modifier pipeline for passive abilities:
 *   BaseValue → [Global Modifiers] → [Local Modifiers] → CurrentValue
 *
 * Modifiers are registered when Pokemon with passive abilities enter play,
 * and unregistered when they leave. The pipeline is queried during:
 * - Damage calculation (incoming/outgoing)
 * - Retreat cost calculation
 * - Attack cost calculation
 * - Status condition application
 * - Card type blocking
 *
 * Architecture:
 *   ModifierPipeline (singleton per game)
 *     ├── modifiers[] — active modifiers sorted by priority
 *     ├── applyDamage(base, context) → modified damage
 *     ├── applyRetreatCost(base, context) → modified cost
 *     └── checkBlocked(cardType, context) → boolean
 */

import { EffectContext } from "../effects/effect-types";
import { GameCard } from "../game-state";
import {
  Condition,
  ModifierType,
  StatusCondition as RuleStatusCondition,
} from "./rule-schema";
import { ModifierDef } from "./card-rule-def";

// ═══════════════════════════════════════════════════════
// Active Modifier Instance (runtime tracking)
// ═══════════════════════════════════════════════════════

export interface ActiveModifier {
  /** Unique ID for this modifier instance */
  id: string;
  /** Source card that provides this modifier */
  sourceCardInstanceId: string;
  /** Source card name (for logging) */
  sourceCardName: string;
  /** The modifier definition */
  def: ModifierDef;
  /** Player index of the source card owner */
  ownerPlayerIndex: 0 | 1;
  /** Priority for ordering (lower = earlier in pipeline). Default: 0. */
  priority: number;
}

// ═══════════════════════════════════════════════════════
// Modifier Query Context
// ═══════════════════════════════════════════════════════

export interface ModifierQueryContext {
  /** The Pokemon being modified */
  target: GameCard;
  /** Target's player index */
  targetPlayerIndex: 0 | 1;
  /** The source of the interaction (attacker for damage) */
  source?: GameCard;
  /** Source player index */
  sourcePlayerIndex?: 0 | 1;
  /** Effect context for condition evaluation */
  effectCtx?: EffectContext;
}

// ═══════════════════════════════════════════════════════
// Modifier Pipeline
// ═══════════════════════════════════════════════════════

export class ModifierPipeline {
  private modifiers: ActiveModifier[] = [];
  private nextId = 0;

  // ─── Registration ───

  /**
   * Register a modifier when a Pokemon with passive ability enters play.
   * Returns the modifier ID for later removal.
   */
  register(
    sourceCardInstanceId: string,
    sourceCardName: string,
    def: ModifierDef,
    ownerPlayerIndex: 0 | 1,
    priority = 0,
  ): string {
    const id = `mod_${this.nextId++}`;
    this.modifiers.push({
      id,
      sourceCardInstanceId,
      sourceCardName,
      def,
      ownerPlayerIndex,
      priority,
    });
    // Sort by priority (lower first)
    this.modifiers.sort((a, b) => a.priority - b.priority);
    return id;
  }

  /**
   * Unregister a specific modifier by ID.
   */
  unregister(modifierId: string): boolean {
    const idx = this.modifiers.findIndex(m => m.id === modifierId);
    if (idx === -1) return false;
    this.modifiers.splice(idx, 1);
    return true;
  }

  /**
   * Unregister all modifiers from a specific source card.
   * Called when a Pokemon leaves play (knocked out, returned to hand, etc.)
   */
  unregisterBySource(sourceCardInstanceId: string): number {
    const before = this.modifiers.length;
    this.modifiers = this.modifiers.filter(
      m => m.sourceCardInstanceId !== sourceCardInstanceId,
    );
    return before - this.modifiers.length;
  }

  /**
   * Unregister all modifiers for a player.
   */
  unregisterByPlayer(playerIndex: 0 | 1): number {
    const before = this.modifiers.length;
    this.modifiers = this.modifiers.filter(
      m => m.ownerPlayerIndex !== playerIndex,
    );
    return before - this.modifiers.length;
  }

  /** Clear all modifiers (game reset) */
  clear(): void {
    this.modifiers = [];
    this.nextId = 0;
  }

  /** Get count of active modifiers */
  get count(): number {
    return this.modifiers.length;
  }

  /** Get all active modifiers (for debugging) */
  getAll(): ReadonlyArray<ActiveModifier> {
    return this.modifiers;
  }

  // ─── Pipeline Queries ───

  /**
   * Apply all outgoing damage modifiers.
   * Called when a Pokemon attacks — modifies the damage it deals.
   */
  applyOutgoingDamage(
    baseDamage: number,
    ctx: ModifierQueryContext,
  ): number {
    let damage = baseDamage;
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "outgoing_damage") continue;
      if (!this.isModifierApplicable(mod, ctx, "attacker")) continue;

      const modType = mod.def.type;
      // Type filter check
      if (modType.type_filter && ctx.source) {
        const sourceTypes = ctx.source.card.types || [];
        if (!modType.type_filter.some(t => sourceTypes.includes(t))) continue;
      }
      damage += modType.amount;
    }
    return Math.max(0, damage);
  }

  /**
   * Apply all incoming damage modifiers.
   * Called when a Pokemon takes damage — modifies the damage it receives.
   */
  applyIncomingDamage(
    baseDamage: number,
    ctx: ModifierQueryContext,
  ): number {
    let damage = baseDamage;
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "incoming_damage") continue;
      if (!this.isModifierApplicable(mod, ctx, "defender")) continue;

      damage += mod.def.type.amount; // negative amount = reduction
    }
    return Math.max(0, damage);
  }

  /**
   * Apply retreat cost modifiers.
   */
  applyRetreatCost(
    baseCost: number,
    ctx: ModifierQueryContext,
  ): number {
    let cost = baseCost;
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "retreat_cost") continue;
      if (!this.isModifierApplicable(mod, ctx, "self")) continue;

      cost += mod.def.type.amount; // negative = reduce
    }
    return Math.max(0, cost);
  }

  /**
   * Apply max HP modifiers.
   */
  applyMaxHp(
    baseHp: number,
    ctx: ModifierQueryContext,
  ): number {
    let hp = baseHp;
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "max_hp") continue;
      if (!this.isModifierApplicable(mod, ctx, "self")) continue;

      hp += mod.def.type.amount;
    }
    return Math.max(1, hp); // HP can't be less than 1
  }

  /**
   * Check if bench damage is prevented for a target.
   */
  isBenchDamagePrevented(ctx: ModifierQueryContext): boolean {
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "prevent_bench_damage") continue;
      if (!this.isModifierApplicable(mod, ctx, "defender")) continue;
      return true;
    }
    return false;
  }

  /**
   * Check if a status condition is prevented on a target.
   */
  isStatusPrevented(
    status: RuleStatusCondition,
    ctx: ModifierQueryContext,
  ): boolean {
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "prevent_status") continue;
      if (!this.isModifierApplicable(mod, ctx, "defender")) continue;

      const statuses = mod.def.type.statuses;
      if (statuses === "all" || statuses.includes(status)) return true;
    }
    return false;
  }

  /**
   * Check if effects from a source type are prevented.
   */
  isEffectPrevented(
    scope: "from_ex" | "from_abilities" | "all",
    ctx: ModifierQueryContext,
  ): boolean {
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "prevent_effects") continue;
      if (!this.isModifierApplicable(mod, ctx, "defender")) continue;

      const modScope = mod.def.type.scope;
      if (modScope === "all" || modScope === scope) return true;
    }
    return false;
  }

  /**
   * Check if a card type is blocked from being played.
   */
  isCardTypeBlocked(
    cardType: "Item" | "Supporter" | "Stadium" | "Tool",
    playerIndex: 0 | 1,
  ): boolean {
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "block_card_type") continue;
      if (mod.def.type.card_type !== cardType) continue;
      // Block card type affects the opponent of the modifier's owner
      if (mod.ownerPlayerIndex === playerIndex) continue; // doesn't block own cards
      // TODO: condition evaluation
      return true;
    }
    return false;
  }

  /**
   * Get extra energy types provided by modifiers.
   * Returns array of { provides, count } for the target Pokemon.
   */
  getProvidedEnergy(ctx: ModifierQueryContext): Array<{ provides: string; count: number }> {
    const results: Array<{ provides: string; count: number }> = [];
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "provide_energy_type") continue;
      if (!this.isModifierApplicable(mod, ctx, "self")) continue;

      results.push({
        provides: mod.def.type.provides,
        count: mod.def.type.count,
      });
    }
    return results;
  }

  /**
   * Get weakness modifiers for a target.
   */
  getWeaknessModifier(
    energyType: string,
    ctx: ModifierQueryContext,
  ): string | null {
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "weakness") continue;
      if (!this.isModifierApplicable(mod, ctx, "self")) continue;
      if (mod.def.type.type !== energyType) continue;
      return mod.def.type.value;
    }
    return null;
  }

  /**
   * Get resistance modifiers for a target.
   */
  getResistanceModifier(
    energyType: string,
    ctx: ModifierQueryContext,
  ): string | null {
    for (const mod of this.modifiers) {
      if (mod.def.type.modify !== "resistance") continue;
      if (!this.isModifierApplicable(mod, ctx, "self")) continue;
      if (mod.def.type.type !== energyType) continue;
      return mod.def.type.value;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════
  // Internal: Modifier Applicability
  // ═══════════════════════════════════════════════════════

  /**
   * Check if a modifier applies in the current context.
   * - "attacker": modifier's source is the attacker
   * - "defender": modifier's source is the defender
   * - "self": modifier's source is the target itself
   */
  private isModifierApplicable(
    mod: ActiveModifier,
    ctx: ModifierQueryContext,
    role: "attacker" | "defender" | "self",
  ): boolean {
    // Check if the modifier's source is in the right role
    switch (role) {
      case "attacker":
        // Modifier must be on the attacking Pokemon
        if (ctx.source && mod.sourceCardInstanceId !== ctx.source.instanceId) {
          // Also check if modifier is on a bench Pokemon that boosts all allies
          if (mod.ownerPlayerIndex !== ctx.sourcePlayerIndex) return false;
        }
        break;
      case "defender":
        // Modifier must be on the target Pokemon (or its ally)
        if (mod.ownerPlayerIndex !== ctx.targetPlayerIndex) return false;
        break;
      case "self":
        // Modifier must be on the target Pokemon
        if (mod.sourceCardInstanceId !== ctx.target.instanceId) {
          // Also allow modifiers from allies that affect all own Pokemon
          if (mod.ownerPlayerIndex !== ctx.targetPlayerIndex) return false;
        }
        break;
    }

    // Evaluate condition if present
    if (mod.def.condition && ctx.effectCtx) {
      return this.evaluateSimpleCondition(mod.def.condition, ctx);
    }

    return true;
  }

  /**
   * Simple condition evaluation for modifier applicability.
   * Only evaluates basic conditions — complex game-state conditions
   * are handled by the full Rule Executor.
   */
  private evaluateSimpleCondition(
    condition: Condition,
    ctx: ModifierQueryContext,
  ): boolean {
    switch (condition.check) {
      case "is_in_active_spot": {
        // Check if the modifier's source is in the active spot
        const player = ctx.effectCtx?.player;
        return player?.active?.instanceId === ctx.target.instanceId;
      }
      case "has_energy": {
        const target = ctx.target;
        const min = condition.min ?? 1;
        const count = condition.type
          ? target.attachedEnergy.filter(e => e.card.types?.includes(condition.type!)).length
          : target.attachedEnergy.length;
        return count >= min;
      }
      case "not":
        return !this.evaluateSimpleCondition(condition.condition, ctx);
      case "and":
        return condition.conditions.every(c => this.evaluateSimpleCondition(c, ctx));
      case "or":
        return condition.conditions.some(c => this.evaluateSimpleCondition(c, ctx));
      default:
        // Assume true for conditions we can't evaluate simply
        return true;
    }
  }
}
