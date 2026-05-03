/**
 * Event Hook System — Reactive Trigger Registration
 *
 * Manages event-driven abilities that fire in response to game events.
 * Implements the Observer Pattern for PTCG triggered abilities.
 *
 * Event lifecycle:
 *   1. Game engine emits event (e.g., "on_knocked_out")
 *   2. EventHookRegistry finds all registered handlers
 *   3. Each handler's condition is evaluated
 *   4. Matching handlers execute their action steps
 *
 * Examples:
 *   - "When this Pokemon is Knocked Out" → on_knocked_out
 *   - "Between turns" → between_turns
 *   - "When you play this card from hand" → on_play_from_hand
 *   - "When your opponent plays a Supporter" → on_opponent_plays_card
 */

import { EffectContext } from "../effects/effect-types";
import { GameCard } from "../game-state";
import {
  ActionStep,
  Condition,
  TriggerEvent,
} from "./rule-schema";
import { executeSteps } from "./rule-executor";

// ═══════════════════════════════════════════════════════
// Event Hook Definition
// ═══════════════════════════════════════════════════════

export interface EventHook {
  /** Unique registration ID */
  id: string;
  /** The event that triggers this hook */
  event: TriggerEvent;
  /** Source card that registered this hook */
  sourceCardInstanceId: string;
  /** Source card name (for logging) */
  sourceCardName: string;
  /** Player index of the hook owner */
  ownerPlayerIndex: 0 | 1;
  /** Condition that must be met for the hook to fire */
  condition?: Condition;
  /** Action steps to execute when triggered */
  steps: ActionStep[];
  /** Priority for ordering (lower = earlier). Default: 0. */
  priority: number;
  /** Whether the hook fires only once (auto-unregisters after) */
  once?: boolean;
}

// ═══════════════════════════════════════════════════════
// Event Data (passed to hooks when triggered)
// ═══════════════════════════════════════════════════════

export interface EventData {
  /** The event type */
  event: TriggerEvent;
  /** Player index that caused the event */
  triggerPlayerIndex: 0 | 1;
  /** Card involved in the event (e.g., the knocked out Pokemon) */
  involvedCard?: GameCard;
  /** Additional event-specific data */
  payload?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════
// Event Hook Registry
// ═══════════════════════════════════════════════════════

export class EventHookRegistry {
  /** All registered hooks, keyed by event type for fast lookup */
  private hooks: Map<TriggerEvent, EventHook[]> = new Map();
  private nextId = 0;

  // ─── Registration ───

  /**
   * Register an event hook.
   * Returns the hook ID for later removal.
   */
  register(
    event: TriggerEvent,
    sourceCardInstanceId: string,
    sourceCardName: string,
    ownerPlayerIndex: 0 | 1,
    steps: ActionStep[],
    options?: {
      condition?: Condition;
      priority?: number;
      once?: boolean;
    },
  ): string {
    const id = `hook_${this.nextId++}`;
    const hook: EventHook = {
      id,
      event,
      sourceCardInstanceId,
      sourceCardName,
      ownerPlayerIndex,
      steps,
      condition: options?.condition,
      priority: options?.priority ?? 0,
      once: options?.once,
    };

    const existing = this.hooks.get(event) || [];
    existing.push(hook);
    // Sort by priority
    existing.sort((a, b) => a.priority - b.priority);
    this.hooks.set(event, existing);

    return id;
  }

  /**
   * Unregister a specific hook by ID.
   */
  unregister(hookId: string): boolean {
    for (const [event, hooks] of this.hooks) {
      const idx = hooks.findIndex(h => h.id === hookId);
      if (idx !== -1) {
        hooks.splice(idx, 1);
        if (hooks.length === 0) this.hooks.delete(event);
        return true;
      }
    }
    return false;
  }

  /**
   * Unregister all hooks from a specific source card.
   * Called when a Pokemon leaves play.
   */
  unregisterBySource(sourceCardInstanceId: string): number {
    let count = 0;
    for (const [event, hooks] of this.hooks) {
      const before = hooks.length;
      const filtered = hooks.filter(h => h.sourceCardInstanceId !== sourceCardInstanceId);
      count += before - filtered.length;
      if (filtered.length === 0) {
        this.hooks.delete(event);
      } else {
        this.hooks.set(event, filtered);
      }
    }
    return count;
  }

  /**
   * Unregister all hooks for a player.
   */
  unregisterByPlayer(playerIndex: 0 | 1): number {
    let count = 0;
    for (const [event, hooks] of this.hooks) {
      const before = hooks.length;
      const filtered = hooks.filter(h => h.ownerPlayerIndex !== playerIndex);
      count += before - filtered.length;
      if (filtered.length === 0) {
        this.hooks.delete(event);
      } else {
        this.hooks.set(event, filtered);
      }
    }
    return count;
  }

  /** Clear all hooks (game reset) */
  clear(): void {
    this.hooks.clear();
    this.nextId = 0;
  }

  /** Get count of all registered hooks */
  get count(): number {
    let total = 0;
    for (const hooks of this.hooks.values()) {
      total += hooks.length;
    }
    return total;
  }

  /** Get hooks for a specific event (for debugging) */
  getHooksForEvent(event: TriggerEvent): ReadonlyArray<EventHook> {
    return this.hooks.get(event) || [];
  }

  /** Get all registered events */
  getRegisteredEvents(): TriggerEvent[] {
    return Array.from(this.hooks.keys());
  }

  // ─── Event Emission ───

  /**
   * Emit an event and execute all matching hooks.
   * Hooks are executed in priority order.
   * Returns the number of hooks that fired.
   */
  async emit(
    eventData: EventData,
    ctxFactory: (hook: EventHook) => EffectContext | null,
  ): Promise<number> {
    const hooks = this.hooks.get(eventData.event);
    if (!hooks || hooks.length === 0) return 0;

    let fired = 0;
    const toRemove: string[] = [];

    for (const hook of hooks) {
      // Create effect context for this hook
      const ctx = ctxFactory(hook);
      if (!ctx) continue;

      // Evaluate condition
      if (hook.condition && !this.evaluateCondition(hook.condition, ctx, eventData)) {
        continue;
      }

      // Execute the hook's action steps
      try {
        await executeSteps(hook.steps, ctx);
        fired++;
        ctx.log(`[Hook] ${hook.sourceCardName}: ${hook.event} 触发`);
      } catch (error) {
        console.error(`[EventHook] Error executing hook ${hook.id} (${hook.sourceCardName}):`, error);
      }

      // Mark once-hooks for removal
      if (hook.once) {
        toRemove.push(hook.id);
      }
    }

    // Clean up once-hooks
    for (const id of toRemove) {
      this.unregister(id);
    }

    return fired;
  }

  /**
   * Synchronous check: are there any hooks registered for this event?
   * Useful for short-circuiting event emission when no handlers exist.
   */
  hasHooks(event: TriggerEvent): boolean {
    const hooks = this.hooks.get(event);
    return hooks !== undefined && hooks.length > 0;
  }

  // ─── Condition Evaluation ───

  private evaluateCondition(
    condition: Condition,
    ctx: EffectContext,
    eventData: EventData,
  ): boolean {
    switch (condition.check) {
      case "coin_flip":
        return ctx.flipCoin();

      case "coin_flip_multi": {
        const flips = ctx.flipCoins(condition.count);
        return flips.heads > 0;
      }

      case "is_in_active_spot":
        return ctx.player.active?.instanceId === ctx.source.instanceId;

      case "has_energy": {
        const target = this.resolveConditionTarget(condition.target, ctx);
        if (!target) return false;
        const energyCount = condition.type
          ? target.attachedEnergy.filter(e => e.card.types?.includes(condition.type!)).length
          : target.attachedEnergy.length;
        return energyCount >= (condition.min ?? 1);
      }

      case "has_damage": {
        const target = this.resolveConditionTarget(condition.target, ctx);
        if (!target) return false;
        return target.damageCounters >= (condition.min ?? 1);
      }

      case "has_status": {
        const target = this.resolveConditionTarget(condition.target, ctx);
        if (!target) return false;
        return condition.status
          ? target.statusConditions.includes(condition.status)
          : target.statusConditions.length > 0;
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

      case "has_tag": {
        const target = this.resolveConditionTarget(condition.target, ctx);
        if (!target) return false;
        const name = target.card.name.toLowerCase();
        const tag = condition.tag.toLowerCase();
        return name.includes(tag) ||
          (target.card.subtypes?.some(s => s.toLowerCase().includes(tag)) ?? false);
      }

      case "is_type": {
        const target = this.resolveConditionTarget(condition.target, ctx);
        if (!target) return false;
        return target.card.types?.some(t => condition.types.includes(t as any)) ?? false;
      }

      case "marker_exists": {
        const target = this.resolveConditionTarget(condition.target, ctx);
        if (!target) return false;
        return ctx.hasMarker(target, condition.marker);
      }

      case "hp_remaining_lte": {
        const target = this.resolveConditionTarget(condition.target, ctx);
        if (!target) return false;
        const hp = (parseInt(String(target.card.hp), 10) || 0) - (target.damageCounters * 10);
        return hp <= condition.amount;
      }

      case "not":
        return !this.evaluateCondition(condition.condition, ctx, eventData);

      case "and":
        return condition.conditions.every(c => this.evaluateCondition(c, ctx, eventData));

      case "or":
        return condition.conditions.some(c => this.evaluateCondition(c, ctx, eventData));

      default:
        return true;
    }
  }

  private resolveConditionTarget(
    target: { zone: string; [key: string]: unknown },
    ctx: EffectContext,
  ): GameCard | null {
    switch (target.zone) {
      case "self_active": return ctx.source;
      case "opp_active": return ctx.opponent.active;
      default: return ctx.source;
    }
  }
}
