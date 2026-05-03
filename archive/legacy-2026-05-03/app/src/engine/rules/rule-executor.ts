/**
 * Rule Executor — Async CTA Action Step Interpreter
 *
 * Executes ActionStep[] sequences against an EffectContext.
 * Fully async: suspends on player-choice actions (choose, search_deck with prompt)
 * and resumes after UI resolves.
 *
 * Architecture:
 *   ActionStep[] → executeSteps(steps, ctx) → Promise<AttackResult | void>
 *
 * Each action maps 1:1 to EffectContext methods.
 * The executor is a simple tree-walk interpreter — no JIT, no VM.
 */

import { EffectContext, AttackResult } from "../effects/effect-types";
import { GameCard } from "../game-state";
import {
  ActionStep,
  Condition,
  DynamicValue,
  TargetSelector,
  CardFilter,
} from "./rule-schema";
import {
  CANT_ATTACK_NEXT_TURN,
  PREVENT_RETREAT_NEXT_TURN,
  PREVENT_ALL_DAMAGE_NEXT_TURN,
} from "../effects/markers";
import { cantUseAttackMarker } from "../effects/markers";

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════

/**
 * Execute a sequence of action steps within an attack context — synchronously.
 * Interactive actions (choose, search with prompt, etc.) fall back to auto-select.
 * Use this inside onAttack() callbacks where async is not supported.
 */
export function executeAttackStepsSync(
  steps: ActionStep[],
  ctx: EffectContext,
  baseDamage: number,
): AttackResult {
  const execCtx = new ExecutionContext(ctx, baseDamage);
  for (const step of steps) {
    execCtx.executeStepSync(step);
  }
  return execCtx.getAttackResult();
}

/**
 * Execute a sequence of action steps (non-attack context) — synchronously.
 * Interactive actions fall back to auto-select.
 */
export function executeStepsSync(
  steps: ActionStep[],
  ctx: EffectContext,
): void {
  const execCtx = new ExecutionContext(ctx, 0);
  for (const step of steps) {
    execCtx.executeStepSync(step);
  }
}

/**
 * Execute a sequence of action steps within an attack context.
 * Returns an AttackResult that the engine applies to the game state.
 */
export async function executeAttackSteps(
  steps: ActionStep[],
  ctx: EffectContext,
  baseDamage: number,
): Promise<AttackResult> {
  const execCtx = new ExecutionContext(ctx, baseDamage);
  for (const step of steps) {
    await execCtx.executeStep(step);
  }
  return execCtx.getAttackResult();
}

/**
 * Execute a sequence of action steps (non-attack context: ability, trainer).
 * No AttackResult — effects are applied directly to game state.
 */
export async function executeSteps(
  steps: ActionStep[],
  ctx: EffectContext,
): Promise<void> {
  const execCtx = new ExecutionContext(ctx, 0);
  for (const step of steps) {
    await execCtx.executeStep(step);
  }
}

// ═══════════════════════════════════════════════════════
// Execution Context (internal state during step execution)
// ═══════════════════════════════════════════════════════

class ExecutionContext {
  private ctx: EffectContext;
  private result: AttackResult;
  /** Temporary storage for cards from reveal_top_cards, choose, etc. */
  private tempCards: GameCard[] = [];
  /** Count of heads from last flip_coins */
  private lastCoinHeads = 0;
  /** Stored results from labeled steps (V2 step_result references) */
  private labels: Map<string, any> = new Map();

  constructor(ctx: EffectContext, baseDamage: number) {
    this.ctx = ctx;
    this.result = { damage: baseDamage };
  }

  /** Public wrapper for evaluateCondition (used by standalone exports) */
  evaluateConditionPublic(condition: any): boolean {
    return this.evaluateCondition(condition);
  }

  /** Public wrapper for resolveDynamic (used by standalone exports) */
  resolveDynamicPublic(value: any): number {
    return this.resolveDynamic(value);
  }

  getAttackResult(): AttackResult {
    return this.result;
  }

  async executeStep(step: any): Promise<void> {
    const action = (step as any).action || (step as any).actionType;

    // Handle V2 pure branch step (no action, just branch)
    if ((step as any).branch && !action) {
      if (this.evaluateCondition((step as any).branch.condition)) {
        for (const sub of ((step as any).branch.thenSteps || [])) await this.executeStep(sub);
      } else if ((step as any).branch.elseSteps) {
        for (const sub of (step as any).branch.elseSteps) await this.executeStep(sub);
      }
      return;
    }

    // Helper: resolve value from CTA flat props or V2 params
    const val = (...keys: string[]): number => {
      for (const k of keys) {
        const v = (step as any)[k] ?? (step as any).params?.[k];
        if (v !== undefined && v !== null) return this.resolveDynamic(v);
      }
      return 0;
    };

    switch (action) {
      // ─── A. Damage ───
      case "deal_damage": {
        const value = val("value", "damage");
        if (step.target) {
          const targets = this.resolveTargets(step.target);
          for (const t of targets) {
            this.ctx.damage(value, t);
          }
        } else {
          // Default: set attack result damage
          this.result.damage = value;
        }
        break;
      }

      case "put_damage_counters": {
        const value = this.resolveDynamic(step.value);
        const targets = this.resolveTargets(step.target);
        for (const t of targets) {
          t.damageCounters += value;
        }
        break;
      }

      case "self_damage":
        this.result.selfDamage = (this.result.selfDamage || 0) + step.value;
        break;

      case "bench_damage": {
        const benchTargets = this.getBenchTargets(step.side, step.count);
        this.result.benchDamage = [
          ...(this.result.benchDamage || []),
          ...benchTargets.map(t => ({ target: t, damage: step.value })),
        ];
        break;
      }

      case "ignore_wr":
        if (step.weakness) this.result.skipWeakness = true;
        if (step.resistance) this.result.skipResistance = true;
        break;

      case "ignore_weakness":
        this.result.skipWeakness = true;
        break;

      case "ignore_resistance":
        this.result.skipResistance = true;
        break;

      // ─── B. Coin ───
      case "flip_coin": {
        const isHeads = this.ctx.flipCoin();
        this.lastCoinHeads = isHeads ? 1 : 0;
        // CTA format
        if (step.on_heads || step.on_tails) {
          if (isHeads) {
            for (const sub of (step.on_heads || [])) await this.executeStep(sub);
          } else if (step.on_tails) {
            for (const sub of step.on_tails) await this.executeStep(sub);
          }
        }
        // V2 format
        if (step.branch) {
          if (isHeads && step.branch.thenSteps) {
            for (const sub of step.branch.thenSteps) await this.executeStep(sub);
          } else if (!isHeads && step.branch.elseSteps) {
            for (const sub of step.branch.elseSteps) await this.executeStep(sub);
          }
        }
        break;
      }

      case "flip_coins": {
        const flips = this.ctx.flipCoins(step.count);
        this.lastCoinHeads = flips.heads;
        for (let i = 0; i < flips.heads; i++) {
          for (const sub of step.per_heads) {
            await this.executeStep(sub);
          }
        }
        break;
      }

      // ─── C. Status ───
      case "apply_status": {
        const target = step.target
          ? this.resolveTargets(step.target)[0]
          : this.ctx.opponent.active;
        if (target) {
          this.ctx.applyStatus(target, step.status);
        }
        break;
      }

      case "remove_status": {
        const target = step.target
          ? this.resolveTargets(step.target)[0]
          : this.ctx.source;
        if (target) {
          if (step.status) {
            this.ctx.removeStatus(target, step.status);
          } else {
            this.ctx.removeAllStatus(target);
          }
        }
        break;
      }

      // ─── D. Card Movement ───
      case "draw_cards": {
        const count = this.resolveDynamic(step.count);
        const who = this.resolveWho(step.who);
        this.ctx.drawCards(count, who);
        break;
      }

      case "discard_from_hand": {
        const who = this.resolveWho(step.who);
        if (step.choice === "player" && this.ctx.promptDiscardFromHand) {
          await this.ctx.promptDiscardFromHand(step.count, who);
        } else {
          this.ctx.discardFromHand(step.count, who);
        }
        break;
      }

      case "discard_hand": {
        const who = this.resolveWho(step.who);
        this.ctx.discardHand(who);
        break;
      }

      case "search_deck": {
        const who = this.resolveWho(step.who);
        const filter = this.buildCardFilter(step.filter);
        let found: GameCard[];

        if (this.ctx.promptSearchDeck) {
          found = await this.ctx.promptSearchDeck(
            filter,
            step.count,
            `选择最多 ${step.count} 张牌`,
            who,
          );
        } else {
          found = this.ctx.searchDeck(filter, step.count, who);
        }

        // Route to destination
        for (const card of found) {
          switch (step.destination) {
            case "hand":
              this.ctx.addToHand(card, who);
              break;
            case "bench":
              this.putOnBench(card, who);
              break;
            case "attach_to_self":
              this.ctx.source.attachedEnergy.push(card);
              break;
            case "attach_to_target":
              // Attach to a previously selected target (via tempCards)
              if (this.ctx.player.active) {
                this.ctx.player.active.attachedEnergy.push(card);
              }
              break;
            case "top_of_deck":
              this.ctx.putOnTopOfDeck([card], who);
              break;
            case "bottom_of_deck":
              this.getPlayerByWho(who).deck.cards.push(card);
              break;
          }
        }
        this.ctx.shuffleDeck(who);
        break;
      }

      case "recover_from_discard": {
        const who = this.resolveWho(step.who);
        const filter = this.buildCardFilter(step.filter);
        let found: GameCard[];

        if (this.ctx.promptSearchDiscard) {
          found = await this.ctx.promptSearchDiscard(
            filter,
            step.count,
            `选择最多 ${step.count} 张牌从弃牌堆取回`,
            who,
          );
        } else {
          found = this.ctx.searchDiscard(filter, step.count, who);
        }

        for (const card of found) {
          switch (step.destination) {
            case "hand":
              this.ctx.addToHand(card, who);
              break;
            case "deck":
              this.ctx.shuffleIntoDeck([card], who);
              break;
            case "attach_to_self":
              this.ctx.source.attachedEnergy.push(card);
              break;
            case "bench":
              this.putOnBench(card, who);
              break;
          }
        }
        break;
      }

      case "shuffle_hand_into_deck": {
        const who = this.resolveWho(step.who);
        this.ctx.shuffleHandIntoDeck(who);
        break;
      }

      case "shuffle_deck": {
        const who = this.resolveWho(step.who);
        this.ctx.shuffleDeck(who);
        break;
      }

      case "reveal_top_cards": {
        const who = this.resolveWho(step.who);
        this.tempCards = this.ctx.revealTopCards(step.count, who);
        // Execute sub-steps (they can reference tempCards)
        for (const sub of step.then) {
          await this.executeStep(sub);
        }
        break;
      }

      case "put_on_deck": {
        const who = this.resolveWho(step.who);
        if (step.position === "top") {
          this.ctx.putOnTopOfDeck(this.tempCards, who);
        } else {
          const deck = this.getPlayerByWho(who).deck;
          deck.cards.push(...this.tempCards);
        }
        this.tempCards = [];
        break;
      }

      case "discard_from_deck_top": {
        const who = this.resolveWho(step.who);
        const player = this.getPlayerByWho(who);
        for (let i = 0; i < step.count && player.deck.cards.length > 0; i++) {
          const card = player.deck.cards.shift()!;
          player.discard.cards.push(card);
        }
        break;
      }

      // ─── E. Energy Management ───
      case "discard_energy": {
        const targets = step.target
          ? this.resolveTargets(step.target)
          : [this.ctx.source];
        for (const target of targets) {
          const count = step.count === "all" ? target.attachedEnergy.length : step.count;
          let discarded = 0;
          for (let i = target.attachedEnergy.length - 1; i >= 0 && discarded < count; i--) {
            if (!step.energy_type || target.attachedEnergy[i].card.types?.includes(step.energy_type)) {
              const energy = target.attachedEnergy.splice(i, 1)[0];
              this.getPlayerForCard(target).discard.cards.push(energy);
              discarded++;
            }
          }
        }
        // Also set on AttackResult for attack-context energy discard
        if (!step.target) {
          this.result.discardEnergy = (this.result.discardEnergy || 0) +
            (step.count === "all" ? this.ctx.source.attachedEnergy.length : step.count);
        }
        break;
      }

      case "attach_energy": {
        const targets = this.resolveTargets(step.target);
        const target = targets[0];
        if (!target) break;

        const energyFilter = step.filter
          ? this.buildCardFilter(step.filter)
          : (c: GameCard) => c.card.supertype === "Energy";

        switch (step.source) {
          case "deck":
            for (let i = 0; i < step.count; i++) {
              this.ctx.attachEnergyFromDeck(energyFilter, target);
            }
            break;
          case "discard":
            this.ctx.attachEnergyFromDiscard(energyFilter, step.count, target);
            break;
          case "hand": {
            const player = this.ctx.player;
            let attached = 0;
            for (let i = player.hand.cards.length - 1; i >= 0 && attached < step.count; i--) {
              if (energyFilter(player.hand.cards[i])) {
                const card = player.hand.cards.splice(i, 1)[0];
                target.attachedEnergy.push(card);
                attached++;
              }
            }
            break;
          }
        }
        break;
      }

      case "move_energy": {
        const fromTargets = this.resolveTargets(step.from);
        const toTargets = this.resolveTargets(step.to);
        const from = fromTargets[0];
        const to = toTargets[0];
        if (!from || !to) break;

        const count = step.count || 1;
        let moved = 0;
        for (let i = from.attachedEnergy.length - 1; i >= 0 && moved < count; i--) {
          const energy = from.attachedEnergy[i];
          if (!step.energy_type || energy.card.types?.includes(step.energy_type)) {
            this.ctx.moveEnergy(from, to, energy.instanceId);
            moved++;
          }
        }
        break;
      }

      // ─── F. Field Operations ───
      case "switch_pokemon": {
        if (step.who === "player" || step.who === "both") {
          if (step.choice === "player" && this.ctx.promptSwitchOwnActive) {
            await this.ctx.promptSwitchOwnActive("选择要换上的备战区宝可梦");
          } else if (this.ctx.player.bench.cards.length > 0) {
            const bench = this.ctx.player.bench.cards;
            const idx = step.choice === "random"
              ? Math.floor(Math.random() * bench.length)
              : 0;
            this.ctx.switchOwnActive(bench[idx].instanceId);
          }
        }
        if (step.who === "opponent" || step.who === "both") {
          if (step.choice === "player" && this.ctx.promptSwitchOpponentActive) {
            await this.ctx.promptSwitchOpponentActive("选择要拖出的对手宝可梦");
          } else if (this.ctx.opponent.bench.cards.length > 0) {
            const bench = this.ctx.opponent.bench.cards;
            const idx = step.choice === "random"
              ? Math.floor(Math.random() * bench.length)
              : 0;
            this.ctx.switchOpponentActive(bench[idx].instanceId);
          }
        }
        break;
      }

      case "heal": {
        const value = this.resolveDynamic(step.value);
        const targets = this.resolveTargets(step.target);
        for (const t of targets) {
          this.ctx.heal(value, t);
        }
        break;
      }

      case "discard_stadium":
        this.ctx.removeStadium();
        break;

      case "discard_tool": {
        const targets = step.target
          ? this.resolveTargets(step.target)
          : [this.ctx.opponent.active].filter(Boolean) as GameCard[];
        for (const t of targets) {
          if (t.attachedTools && t.attachedTools.length > 0) {
            const tool = t.attachedTools.pop()!;
            this.getPlayerForCard(t).discard.cards.push(tool);
          }
        }
        break;
      }

      case "evolve": {
        const targets = this.resolveTargets(step.target);
        const target = targets[0];
        if (!target || !this.ctx.evolvePokemonDirect) break;
        // Search for evolution card
        if (step.from_deck) {
          const filter = (c: GameCard) =>
            c.card.supertype === "Pokémon" && c.card.evolvesFrom === target.card.name;
          const found = this.ctx.searchDeck(filter, 1, "player");
          if (found.length > 0) {
            this.ctx.evolvePokemonDirect(target.instanceId, found[0]);
          }
          this.ctx.shuffleDeck("player");
        }
        break;
      }

      // ─── G. Marker / Restriction ───
      case "set_marker": {
        const targets = this.resolveTargets(step.target);
        for (const t of targets) {
          this.ctx.addMarker(t, step.marker, step.value ?? 1);
        }
        break;
      }

      case "clear_marker": {
        const targets = this.resolveTargets(step.target);
        for (const t of targets) {
          this.ctx.removeMarker(t, step.marker);
        }
        break;
      }

      case "cant_attack_next_turn":
        this.ctx.addMarker(this.ctx.source, CANT_ATTACK_NEXT_TURN, 1);
        break;

      case "cant_retreat": {
        const target = step.target
          ? this.resolveTargets(step.target)[0]
          : this.ctx.opponent.active;
        if (target) {
          this.ctx.addMarker(target, PREVENT_RETREAT_NEXT_TURN, 1);
          this.result.preventRetreat = true;
        }
        break;
      }

      case "reduce_damage_next_turn":
        this.ctx.addMarker(this.ctx.source, `DAMAGE_REDUCTION:${step.amount}`, 1);
        break;

      case "prevent_damage_next_turn":
        this.ctx.addMarker(this.ctx.source, PREVENT_ALL_DAMAGE_NEXT_TURN, 1);
        break;

      case "disable_attack": {
        const target = step.target
          ? this.resolveTargets(step.target)[0]
          : this.ctx.opponent.active;
        if (target) {
          // Pick an attack to disable
          const attacks = target.card.attacks;
          if (attacks && attacks.length > 0) {
            let attackName: string;
            if (step.choice === "random") {
              attackName = attacks[Math.floor(Math.random() * attacks.length)].name;
            } else if (this.ctx.promptUser) {
              const choices = await this.ctx.promptUser({
                message: "选择要禁用的攻击",
                min: 1,
                max: 1,
                targets: attacks.map(a => a.name),
              });
              attackName = choices[0] || attacks[0].name;
            } else {
              attackName = attacks[0].name;
            }
            this.ctx.addMarker(target, cantUseAttackMarker(attackName), 1);
          }
        }
        break;
      }

      // ─── H. Flow Control ───
      case "if": {
        // CTA format: step.condition + step.then/step.else
        if (step.condition) {
          const condMet = this.evaluateCondition(step.condition);
          if (condMet) {
            for (const sub of (step.then || [])) await this.executeStep(sub);
          } else if (step.else) {
            for (const sub of step.else) await this.executeStep(sub);
          }
        }
        // V2 format: step.branch.condition + thenSteps/elseSteps
        if (step.branch) {
          if (this.evaluateCondition(step.branch.condition)) {
            for (const sub of (step.branch.thenSteps || [])) await this.executeStep(sub);
          } else if (step.branch.elseSteps) {
            for (const sub of step.branch.elseSteps) await this.executeStep(sub);
          }
        }
        break;
      }

      case "for_each": {
        // V2: step.loop.target/step.loop.body
        if (step.loop) {
          const targets = this.resolveTargets(step.loop.target);
          for (const _t of targets) {
            for (const sub of (step.loop.body || [])) await this.executeStep(sub);
          }
        } else {
          const targets = this.resolveTargets(step.targets);
          for (const _target of targets) {
            for (const sub of (step.body || [])) await this.executeStep(sub);
          }
        }
        break;
      }

      case "repeat": {
        if (step.loop) {
          const count = this.resolveDynamic(step.loop.count);
          for (let i = 0; i < count; i++) {
            for (const sub of (step.loop.body || [])) await this.executeStep(sub);
          }
        }
        break;
      }

      case "choose": {
        if (this.ctx.promptUser) {
          const targetZone = this.targetSelectorToZone(step.from);
          const selected = await this.ctx.promptUser({
            message: step.message || "选择目标",
            min: step.min,
            max: step.max,
            zone: targetZone,
          });
          // Store selected IDs for sub-steps to reference
          this.tempCards = selected
            .map(id => this.ctx.findPokemon(id))
            .filter(Boolean) as GameCard[];
        } else {
          // Auto-select: resolve all targets
          this.tempCards = this.resolveTargets(step.from).slice(0, step.max);
        }
        for (const sub of step.then) {
          await this.executeStep(sub);
        }
        this.tempCards = [];
        break;
      }

      case "choose_one": {
        if (this.ctx.promptUser) {
          const labels = step.options.map(o => o.label);
          const selected = await this.ctx.promptUser({
            message: "选择一个选项",
            min: 1,
            max: 1,
            targets: labels,
          });
          const choice = step.options.find(o => o.label === selected[0]) || step.options[0];
          for (const sub of choice.steps) {
            await this.executeStep(sub);
          }
        } else {
          // Auto-select first option
          for (const sub of step.options[0].steps) {
            await this.executeStep(sub);
          }
        }
        break;
      }

      // ─── I. Special ───
      case "copy_attack":
        // Complex: delegate to engine's copy-attack handler
        this.ctx.log("复制攻击 (需要引擎层面实现)");
        break;

      case "extra_turn":
        this.ctx.addMarker(this.ctx.source, "EXTRA_TURN", 1);
        (this.ctx.state as any).__extraTurn = true;
        break;

      case "end_turn":
        break;

      case "log":
        this.ctx.log(step.message || step.params?.message || "");
        break;

      // ── V2-specific actions (async path) ──
      case "damage_self":
      case "self_damage": {
        const dmg = val("value", "damage");
        this.result.selfDamage = (this.result.selfDamage || 0) + dmg;
        break;
      }
      case "full_heal": {
        const targets = this.resolveTargets(step.target);
        for (const t of targets) this.ctx.heal(9999, t);
        break;
      }
      case "spread_damage": {
        const dmg = val("value", "damage");
        const targets = this.resolveTargets(step.target);
        const perTarget = Math.floor(dmg / Math.max(targets.length, 1));
        for (const t of targets) t.damageCounters = (t.damageCounters || 0) + Math.floor(perTarget / 10);
        break;
      }
      case "place_damage_counters": {
        const dmg = val("value", "damage");
        const targets = this.resolveTargets(step.target);
        for (const t of targets) t.damageCounters = (t.damageCounters || 0) + Math.floor(dmg / 10);
        break;
      }
      case "move_damage_counters": {
        const targets = this.resolveTargets(step.target);
        if (targets.length > 0 && this.ctx.source) {
          const counters = this.ctx.source.damageCounters || 0;
          this.ctx.source.damageCounters = 0;
          targets[0].damageCounters = (targets[0].damageCounters || 0) + counters;
        }
        break;
      }
      case "accelerate_energy": {
        const target = this.resolveTargets(step.target)[0] || this.ctx.source;
        const filter = this.buildCardFilter(step.params?.searchFilter || step.filter || {});
        const count = val("count", "energyCount") || 1;
        this.ctx.attachEnergyFromDiscard(filter, count, target);
        break;
      }
      case "shuffle_into_deck": {
        const who = this.resolveWhoFromStep(step);
        const zone = step.target?.zone;
        if (zone === "hand") this.ctx.shuffleHandIntoDeck(who);
        else if (zone === "active" && step.target?.owner === "self") {
          const cards = this.ctx.pickUpPokemon(this.ctx.source.instanceId, "player");
          this.ctx.shuffleIntoDeck(cards, "player");
        }
        break;
      }
      case "return_to_hand": {
        const who = this.resolveWhoFromStep(step);
        if (step.target?.zone === "active" || step.target?.zone === "in_play") {
          const cards = this.ctx.pickUpPokemon(this.ctx.source.instanceId, who);
          for (const c of cards) this.ctx.addToHand(c, who);
        }
        break;
      }
      case "put_on_deck_top":
      case "move_to_lost_zone":
      case "ignore_effects":
        break;
      case "discard_cards": {
        const amount = val("count", "amount");
        const who = this.resolveWhoFromStep(step);
        const zone = step.target?.zone;
        if (zone === "hand") this.ctx.discardFromHand(amount, who);
        else if (zone === "deck_top") {
          const player = who === "opponent" ? this.ctx.opponent : this.ctx.player;
          for (let i = 0; i < amount && player.deck.cards.length > 0; i++) {
            const card = player.deck.cards.shift()!;
            player.discard.cards.push(card);
          }
        }
        break;
      }
      case "add_damage": {
        const addVal = val("value");
        this.result.damage = (this.result.damage || 0) + addVal;
        break;
      }
      case "reduce_damage": {
        const redVal = val("amount", "value");
        this.ctx.addMarker(this.ctx.source, `DAMAGE_REDUCTION:${redVal}`, 1);
        break;
      }
      case "prevent_damage":
        this.ctx.addMarker(this.ctx.source, PREVENT_ALL_DAMAGE_NEXT_TURN, 1);
        break;
      case "prevent_retreat":
        this.result.preventRetreat = true;
        break;
      case "prevent_item_usage":
      case "prevent_supporter_usage":
      case "prevent_ability":
      case "prevent_attack":
      case "prevent_evolution":
      case "prevent_status":
      case "prevent_energy_removal":
        this.ctx.addMarker(
          step.target?.owner === "opponent" ? (this.ctx.opponent.active || this.ctx.source) : this.ctx.source,
          action.toUpperCase(),
          1
        );
        break;
      case "remove_all_status": {
        const targets = this.resolveTargets(step.target);
        for (const t of targets) this.ctx.removeAllStatus(t);
        break;
      }
      case "remove_marker": {
        const marker = step.params?.marker || step.marker;
        if (marker) {
          const targets = this.resolveTargets(step.target);
          for (const t of targets) this.ctx.removeMarker(t, marker);
        }
        break;
      }
      case "set_marker": {
        const marker = step.marker || step.params?.marker;
        if (marker) {
          const targets = this.resolveTargets(step.target);
          for (const t of targets) this.ctx.addMarker(t, marker, step.value ?? step.params?.value ?? 1);
        }
        break;
      }
      case "choose_cards":
      case "choose_pokemon":
      case "choose_option":
      case "choose_type":
      case "confirm":
      case "reveal_cards":
      case "show_hand":
      case "look_at_cards":
      case "order_cards":
        break;

      default:
        break;
    }

    // Store result in labels if step has a label (V2)
    if ((step as any).label) {
      this.labels.set((step as any).label, this.result.damage);
    }
  }

  // ═══════════════════════════════════════════════════════
  // Helper: Resolve Dynamic Values
  // ═══════════════════════════════════════════════════════

  private resolveDynamic(value: any): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === "number") return value;
    if (value === "all") return 999;

    // ── V2 format: { calc: "..." } ──
    if (value.calc) {
      return this.resolveDynamicV2(value);
    }

    // ── CTA format: { per: "...", multiply: N } ──
    let count = 0;
    switch (value.per) {
      case "energy_on_self":
        count = this.ctx.source.attachedEnergy.length;
        break;
      case "energy_on_defender":
        count = this.ctx.opponent.active?.attachedEnergy.length ?? 0;
        break;
      case "energy_on_all_active":
        count = this.ctx.source.attachedEnergy.length +
          (this.ctx.opponent.active?.attachedEnergy.length ?? 0);
        break;
      case "energy_on_all_in_play":
        count = this.ctx.getAllPokemon("player").reduce((s, p) => s + p.attachedEnergy.length, 0) +
          this.ctx.getAllPokemon("opponent").reduce((s, p) => s + p.attachedEnergy.length, 0);
        break;
      case "damage_counters_on_self":
        count = this.ctx.source.damageCounters;
        break;
      case "damage_counters_on_defender":
        count = this.ctx.opponent.active?.damageCounters ?? 0;
        break;
      case "own_bench_count":
        count = this.ctx.player.bench.cards.length;
        break;
      case "opp_bench_count":
        count = this.ctx.opponent.bench.cards.length;
        break;
      case "all_bench_count":
        count = this.ctx.player.bench.cards.length + this.ctx.opponent.bench.cards.length;
        break;
      case "own_hand_size":
        count = this.ctx.player.hand.cards.length;
        break;
      case "opp_hand_size":
        count = this.ctx.opponent.hand.cards.length;
        break;
      case "own_prizes_remaining":
        count = this.ctx.player.prizes.cards.length;
        break;
      case "opp_prizes_remaining":
        count = this.ctx.opponent.prizes.cards.length;
        break;
      case "own_prizes_taken":
        count = 6 - this.ctx.player.prizes.cards.length;
        break;
      case "opp_prizes_taken":
        count = 6 - this.ctx.opponent.prizes.cards.length;
        break;
      case "coin_heads":
        count = this.lastCoinHeads;
        break;
    }

    return count * (value.multiply || 0);
  }

  /** V2 DynamicValue resolver: handles { calc: "...", ... } objects */
  private resolveDynamicV2(dv: any): number {
    switch (dv.calc) {
      case "constant":
        return dv.value || 0;

      case "coin_flip": {
        const coinCount = this.resolveDynamic(dv.coinCount);
        const flips = this.ctx.flipCoins(coinCount);
        this.lastCoinHeads = flips.heads;
        return flips.heads * (dv.perHeads || 0);
      }

      case "coin_until_tails": {
        let heads = 0;
        while (this.ctx.flipCoin()) heads++;
        return heads * (dv.perHeads || 0);
      }

      case "zone_count": {
        const zone = dv.zone;
        const owner = dv.owner;

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

        const players = owner === "self" ? [this.ctx.player]
          : owner === "opponent" ? [this.ctx.opponent]
          : [this.ctx.player, this.ctx.opponent];

        let zoneCount = 0;
        for (const p of players) {
          let cards = getZoneCards(p, zone);
          if (dv.filter) {
            const filterFn = this.buildCardFilterV2(dv.filter);
            cards = cards.filter(filterFn);
          }
          zoneCount += cards.length;
        }
        return zoneCount * (dv.per || 0);
      }

      case "damage_counters": {
        const targets = this.resolveTargets(dv.target);
        let total = 0;
        for (const t of targets) total += (t.damageCounters || 0);
        return total * (dv.per || 0);
      }

      case "hand_count": {
        const player = dv.owner === "opponent" ? this.ctx.opponent : this.ctx.player;
        return (player.hand?.cards?.length || 0) * (dv.per || 0);
      }

      case "attached_energy_count": {
        const targets = this.resolveTargets(dv.target);
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
        const player = dv.owner === "opponent" ? this.ctx.opponent : this.ctx.player;
        let cards = player.discard?.cards || [];
        if (dv.filter) {
          const filterFn = this.buildCardFilterV2(dv.filter);
          cards = cards.filter(filterFn);
        }
        return cards.length * (dv.per || 0);
      }

      case "prizes_remaining": {
        const player = dv.owner === "opponent" ? this.ctx.opponent : this.ctx.player;
        return (player.prizes?.cards?.length || 0) * (dv.per || 0);
      }

      case "prizes_taken": {
        const player = dv.owner === "opponent" ? this.ctx.opponent : this.ctx.player;
        return (6 - (player.prizes?.cards?.length || 0)) * (dv.per || 0);
      }

      case "per_unit": {
        const targets = this.resolveTargets(dv.countSource);
        let unitCount = 0;
        for (const t of targets) {
          switch (dv.countProperty) {
            case "retreat_cost": unitCount += t.card.retreatCost?.length || 0; break;
            case "energy_cards": unitCount += t.attachedEnergy.length; break;
            case "damage_counters": unitCount += t.damageCounters || 0; break;
            default: unitCount += 1;
          }
        }
        return unitCount * (dv.per || 0);
      }

      case "remaining_hp_diff": {
        const targets = this.resolveTargets(dv.target);
        if (targets.length > 0) {
          const t = targets[0];
          const maxHP = parseInt(String(t.card.hp), 10) || 0;
          const remaining = maxHP - (t.damageCounters || 0) * 10;
          return (dv.subtractFrom || maxHP) - remaining;
        }
        return 0;
      }

      case "instant_ko":
        return 9999;

      case "add":
        return this.resolveDynamic(dv.a) + this.resolveDynamic(dv.b);

      case "subtract":
        return Math.max(0, this.resolveDynamic(dv.a) - this.resolveDynamic(dv.b));

      case "multiply":
        return this.resolveDynamic(dv.a) * this.resolveDynamic(dv.b);

      case "min":
        return Math.min(this.resolveDynamic(dv.a), this.resolveDynamic(dv.b));

      case "max":
        return Math.max(this.resolveDynamic(dv.a), this.resolveDynamic(dv.b));

      case "step_result": {
        const labelValue = this.labels.get(dv.label);
        return typeof labelValue === "number" ? labelValue : 0;
      }

      case "formula":
        return 0;

      default:
        return 0;
    }
  }

  // ═══════════════════════════════════════════════════════
  // Helper: Resolve Targets
  // ═══════════════════════════════════════════════════════

  private resolveTargets(selector: any): GameCard[] {
    if (!selector) return this.ctx.source ? [this.ctx.source] : [];

    // ── V2 format: { owner: "self"|"opponent"|"both", zone: "active"|"bench"|... } ──
    if (selector.owner !== undefined) {
      return this.resolveTargetsV2(selector);
    }

    // ── CTA format: { zone: "self_active"|"opp_bench"|... } ──
    switch (selector.zone) {
      case "self_active":
        return this.ctx.source ? [this.ctx.source] : [];
      case "opp_active":
        return this.ctx.opponent.active ? [this.ctx.opponent.active] : [];
      case "own_bench":
        return selector.choose
          ? this.ctx.player.bench.cards.slice(0, selector.choose)
          : this.ctx.player.bench.cards;
      case "opp_bench":
        return selector.choose
          ? this.ctx.opponent.bench.cards.slice(0, selector.choose)
          : this.ctx.opponent.bench.cards;
      case "all_own":
        return this.ctx.getAllPokemon("player");
      case "all_opp":
        return this.ctx.getAllPokemon("opponent");
      case "all_own_bench":
        return [...this.ctx.player.bench.cards];
      case "all_opp_bench":
        return [...this.ctx.opponent.bench.cards];
      case "all_in_play":
        return [...this.ctx.getAllPokemon("player"), ...this.ctx.getAllPokemon("opponent")];
      // Deck/Hand/Discard selectors return empty arrays (resolved by search actions)
      case "own_deck":
      case "opp_deck":
      case "own_hand":
      case "opp_hand":
      case "own_discard":
      case "opp_discard":
        return [];
      default:
        return [];
    }
  }

  /** V2 structured target resolver: { owner, zone, position?, filter?, count? } */
  private resolveTargetsV2(selector: any): GameCard[] {
    const owner = selector.owner;
    const zone = selector.zone;
    const zones = Array.isArray(zone) ? zone : [zone];
    let targets: GameCard[] = [];

    for (const z of zones) {
      switch (z) {
        case "active":
          if (owner === "opponent") {
            if (this.ctx.opponent.active) targets.push(this.ctx.opponent.active);
          } else {
            if (this.ctx.player.active) targets.push(this.ctx.player.active);
          }
          break;

        case "bench":
          if (owner === "opponent") targets.push(...(this.ctx.opponent.bench?.cards || []));
          else if (owner === "both") {
            targets.push(...(this.ctx.player.bench?.cards || []));
            targets.push(...(this.ctx.opponent.bench?.cards || []));
          } else targets.push(...(this.ctx.player.bench?.cards || []));
          break;

        case "in_play":
          if (owner === "opponent") targets.push(...this.ctx.getAllPokemon("opponent"));
          else if (owner === "both") {
            targets.push(...this.ctx.getAllPokemon("player"));
            targets.push(...this.ctx.getAllPokemon("opponent"));
          } else targets.push(...this.ctx.getAllPokemon("player"));
          break;

        case "hand":
          if (owner === "opponent") targets.push(...(this.ctx.opponent.hand?.cards || []));
          else targets.push(...(this.ctx.player.hand?.cards || []));
          break;

        case "discard":
          if (owner === "opponent") targets.push(...(this.ctx.opponent.discard?.cards || []));
          else targets.push(...(this.ctx.player.discard?.cards || []));
          break;

        case "attached_energy":
          if (owner === "self" || !owner) {
            targets.push(...(this.ctx.source?.attachedEnergy || []));
          }
          break;

        case "deck":
        case "deck_top":
        case "attached_tool":
          break;

        default:
          if (!z || z === "any") {
            if (owner === "opponent" && this.ctx.opponent.active) targets.push(this.ctx.opponent.active);
            else if (this.ctx.source) targets.push(this.ctx.source);
          }
      }
    }

    // Apply position filter
    if (selector.position === "active_only") {
      targets = targets.filter(t =>
        t.instanceId === this.ctx.player.active?.instanceId ||
        t.instanceId === this.ctx.opponent.active?.instanceId
      );
    } else if (selector.position === "bench_only") {
      const activeIds = new Set([this.ctx.player.active?.instanceId, this.ctx.opponent.active?.instanceId]);
      targets = targets.filter(t => !activeIds.has(t.instanceId));
    }

    // Apply card filter
    if (selector.filter) {
      const filterFn = this.buildCardFilterV2(selector.filter);
      targets = targets.filter(filterFn);
    }

    // Apply count
    const count = selector.count;
    if (typeof count === "number" && count > 0 && targets.length > count) {
      targets = targets.slice(0, count);
    }

    return targets;
  }

  // ═══════════════════════════════════════════════════════
  // Helper: Evaluate Conditions
  // ═══════════════════════════════════════════════════════

  private evaluateCondition(condition: any): boolean {
    if (!condition) return true;
    // Unified dispatch: CTA uses condition.check, V2 uses condition.type
    const check = condition.check || condition.type;

    switch (check) {
      // ── CTA conditions ──
      case "coin_flip":
        return this.ctx.flipCoin();

      case "coin_flip_multi":
      case "coin_flip_count": {
        const flips = this.ctx.flipCoins(condition.count || condition.total || 2);
        this.lastCoinHeads = flips.heads;
        return flips.heads >= (condition.min || 1);
      }

      case "has_energy": {
        const targets = this.resolveTargets(condition.target);
        const minCount = condition.min ?? condition.count ?? 1;
        return targets.some(t => {
          const energyType = condition.type !== check ? condition.type : condition.energyType;
          const energyCount = energyType
            ? t.attachedEnergy.filter(e => e.card.types?.includes(energyType)).length
            : t.attachedEnergy.length;
          return energyCount >= minCount;
        });
      }

      case "has_damage": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => (t.damageCounters || 0) >= (condition.min ?? 1));
      }

      case "has_no_damage": {
        const targets = this.resolveTargets(condition.target);
        return targets.every(t => (t.damageCounters || 0) === 0);
      }

      case "has_status": {
        const targets = this.resolveTargets(condition.target);
        if (condition.status) {
          return targets.some(t => t.statusConditions?.includes(condition.status));
        }
        return targets.some(t =>
          (t.statusConditions?.length || 0) > 0
        );
      }

      case "has_no_status": {
        const targets = this.resolveTargets(condition.target);
        return targets.every(t => (t.statusConditions?.length || 0) === 0);
      }

      case "has_pokemon_on_bench":
      case "bench_has_pokemon": {
        const who = condition.who || condition.owner;
        if (who === "opponent") {
          return (this.ctx.opponent.bench?.cards?.length || 0) > 0;
        }
        if (who === "both") {
          return (this.ctx.player.bench?.cards?.length || 0) > 0 &&
            (this.ctx.opponent.bench?.cards?.length || 0) > 0;
        }
        return (this.ctx.player.bench?.cards?.length || 0) > 0;
      }

      case "bench_not_full": {
        const player = condition.owner === "opponent" ? this.ctx.opponent : this.ctx.player;
        return (player.bench?.cards?.length || 0) < 5;
      }

      case "has_cards_in_deck": {
        const who = condition.who;
        const min = condition.min ?? 1;
        if (who === "player" || who === "both") {
          if (this.ctx.player.deck.cards.length < min) return false;
        }
        if (who === "opponent" || who === "both") {
          if (this.ctx.opponent.deck.cards.length < min) return false;
        }
        return true;
      }

      case "has_cards_in_hand": {
        const who = condition.who;
        const min = condition.min ?? 1;
        if (who === "player" || who === "both") {
          if (this.ctx.player.hand.cards.length < min) return false;
        }
        if (who === "opponent" || who === "both") {
          if (this.ctx.opponent.hand.cards.length < min) return false;
        }
        return true;
      }

      case "zone_has_cards": {
        const player = condition.owner === "opponent" ? this.ctx.opponent
          : condition.owner === "self" ? this.ctx.player
          : this.ctx.player;
        let zoneCount = 0;
        switch (condition.zone) {
          case "hand": zoneCount = player.hand?.cards?.length || 0; break;
          case "deck": zoneCount = player.deck?.cards?.length || 0; break;
          case "bench": zoneCount = player.bench?.cards?.length || 0; break;
          case "discard": zoneCount = player.discard?.cards?.length || 0; break;
          case "prizes": zoneCount = player.prizes?.cards?.length || 0; break;
          case "stadium": zoneCount = this.ctx.getStadium() ? 1 : 0; break;
        }
        return this.compareValues(zoneCount, condition.comparison || "gte", condition.count || 1);
      }

      case "zone_is_empty": {
        const player = condition.owner === "opponent" ? this.ctx.opponent : this.ctx.player;
        switch (condition.zone) {
          case "bench": return (player.bench?.cards?.length || 0) === 0;
          case "hand": return (player.hand?.cards?.length || 0) === 0;
          default: return false;
        }
      }

      case "is_in_active_spot":
        return this.ctx.player.active?.instanceId === this.ctx.source.instanceId;

      case "has_tag": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => {
          const name = (t.card.name || "").toLowerCase();
          const tag = (condition.tag || "").toLowerCase();
          return name.includes(tag) ||
            (t.card.subtypes?.some((s: string) => s.toLowerCase().includes(tag)) ?? false);
        });
      }

      case "has_type":
      case "is_type": {
        const targets = this.resolveTargets(condition.target);
        const types = condition.types || (condition.energyType ? [condition.energyType] : []);
        return targets.some(t =>
          t.card.types?.some((type: string) => types.includes(type))
        );
      }

      case "marker_exists":
      case "has_marker": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => this.ctx.hasMarker(t, condition.marker));
      }

      case "has_no_marker": {
        const targets = this.resolveTargets(condition.target);
        return targets.every(t => !this.ctx.hasMarker(t, condition.marker));
      }

      case "hp_remaining_lte": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => {
          const hp = (parseInt(String(t.card.hp), 10) || 0) - ((t.damageCounters || 0) * 10);
          return hp <= condition.amount;
        });
      }

      case "hp_remaining": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => {
          const hp = (parseInt(String(t.card.hp), 10) || 0) - ((t.damageCounters || 0) * 10);
          return this.compareValues(hp, condition.comparison, condition.value);
        });
      }

      case "is_first_turn":
        return ((this.ctx.state as any).turnNumber || 0) <= 2;

      case "is_going_first":
        return this.ctx.playerIndex === 0;

      case "is_going_second":
        return this.ctx.playerIndex === 1;

      case "has_rule_box": {
        const targets = this.resolveTargets(condition.target);
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
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => t.card.name === condition.name);
      }

      case "card_name_contains": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => t.card.name?.includes(condition.substring));
      }

      case "card_sub_type": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => t.card.subtypes?.includes(condition.subType));
      }

      case "card_super_type": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => t.card.supertype === condition.superType);
      }

      case "has_played_supporter_this_turn":
        return (this.ctx.state as any).turnStatus?.supporterPlayed || false;

      case "evolved_this_turn": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => this.ctx.hasMarker(t, "EVOLVED_THIS_TURN"));
      }

      case "stadium_in_play":
        return this.ctx.getStadium() !== null;

      case "usage_limit":
      case "vstar_power_available":
        return true;

      case "not":
        return !this.evaluateCondition(condition.condition || condition.conditions?.[0]);

      case "and":
        return (condition.conditions || []).every((c: any) => this.evaluateCondition(c));

      case "or":
        return (condition.conditions || []).some((c: any) => this.evaluateCondition(c));

      default:
        return true;
    }
  }

  /** Compare two values with a comparison operator */
  private compareValues(actual: number, comparison: string, expected: number): boolean {
    switch (comparison) {
      case "gte": return actual >= expected;
      case "lte": return actual <= expected;
      case "eq": return actual === expected;
      case "gt": return actual > expected;
      case "lt": return actual < expected;
      default: return actual >= expected;
    }
  }

  // ═══════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════

  private resolveWho(who?: "player" | "opponent" | "both"): "player" | "opponent" {
    // For ctx methods that take "player"|"opponent", default to player
    return who === "opponent" ? "opponent" : "player";
  }

  private getPlayerByWho(who: "player" | "opponent") {
    return who === "opponent" ? this.ctx.opponent : this.ctx.player;
  }

  private getPlayerForCard(_card: GameCard) {
    // Simple heuristic: check if card is in player's field
    return this.ctx.player;
  }

  private getBenchTargets(side: string, count?: number): GameCard[] {
    let targets: GameCard[] = [];
    if (side === "opponent" || side === "both") {
      targets = [...this.ctx.opponent.bench.cards];
    }
    if (side === "player" || side === "both") {
      targets = [...targets, ...this.ctx.player.bench.cards];
    }
    if (count !== undefined && count > 0) {
      targets = targets.slice(0, count);
    }
    return targets;
  }

  private putOnBench(card: GameCard, who: "player" | "opponent"): void {
    const player = this.getPlayerByWho(who);
    if (player.bench.cards.length < 5) {
      (card as any).playedThisTurn = true;
      player.bench.cards.push(card);
    }
  }

  private buildCardFilter(filter: any): (card: GameCard) => boolean {
    if (!filter) return () => true;
    // If filter has V2 naming (superType instead of supertype), use V2 filter
    if (filter.superType || filter.subType || filter.nameContains || filter.hasAbility || filter.hasDamage || filter.isEvolved || filter.tag || filter.energyType) {
      return this.buildCardFilterV2(filter);
    }
    return (card: GameCard): boolean => {
      if (filter.supertype && card.card.supertype !== filter.supertype) return false;
      if (filter.subtypes && !filter.subtypes.some((s: string) => card.card.subtypes?.includes(s))) return false;
      if (filter.types && !filter.types.some((t: string) => card.card.types?.includes(t))) return false;
      if (filter.name && card.card.name !== filter.name) return false;
      if (filter.isBasicEnergy) {
        if (card.card.supertype !== "Energy" || !card.card.subtypes?.includes("Basic")) return false;
      }
      if (filter.evolvesFrom && card.card.evolvesFrom !== filter.evolvesFrom) return false;
      if (filter.tags) {
        const name = card.card.name.toLowerCase();
        const subtypes = (card.card.subtypes || []).map((s: string) => s.toLowerCase());
        if (!filter.tags.some((tag: string) =>
          name.includes(tag.toLowerCase()) || subtypes.some((s: string) => s.includes(tag.toLowerCase()))
        )) return false;
      }
      return true;
    };
  }

  /** V2 card filter: handles superType, subType, energyType, nameContains, etc. */
  private buildCardFilterV2(filter: any): (card: GameCard) => boolean {
    if (!filter) return () => true;
    return (card: GameCard): boolean => {
      if (filter.superType) {
        const types = Array.isArray(filter.superType) ? filter.superType : [filter.superType];
        if (!types.includes(card.card.supertype)) return false;
      }
      if (filter.supertype && !filter.superType) {
        if (card.card.supertype !== filter.supertype) return false;
      }
      if (filter.subType) {
        const subs = Array.isArray(filter.subType) ? filter.subType : [filter.subType];
        if (!subs.some((s: string) => card.card.subtypes?.includes(s))) return false;
      }
      if (filter.subtypes && !filter.subType) {
        if (!filter.subtypes.some((s: string) => card.card.subtypes?.includes(s))) return false;
      }
      if (filter.energyType) {
        const types = Array.isArray(filter.energyType) ? filter.energyType : [filter.energyType];
        if (!types.some((t: string) => card.card.types?.includes(t))) return false;
      }
      if (filter.types && !filter.energyType) {
        if (!filter.types.some((t: string) => card.card.types?.includes(t))) return false;
      }
      if (filter.name && card.card.name !== filter.name) return false;
      if (filter.nameContains && !card.card.name?.includes(filter.nameContains)) return false;
      if (filter.hasAbility && (!card.card.abilities || card.card.abilities.length === 0)) return false;
      if (filter.hasDamage && (card.damageCounters || 0) === 0) return false;
      if (filter.isEvolved) {
        if (!card.card.subtypes?.some((s: string) =>
          ["Stage 1", "Stage 2", "Stage1", "Stage2", "VMAX", "VSTAR", "MEGA", "BREAK"].includes(s)
        )) return false;
      }
      if (filter.isBasicEnergy) {
        if (card.card.supertype !== "Energy" || !card.card.subtypes?.includes("Basic")) return false;
      }
      if (filter.evolvesFrom && card.card.evolvesFrom !== filter.evolvesFrom) return false;
      if (filter.tag) {
        const tags = Array.isArray(filter.tag) ? filter.tag : [filter.tag];
        const cardName = card.card.name?.toLowerCase() || "";
        const cardSubs = card.card.subtypes?.map((s: string) => s.toLowerCase()) || [];
        if (!tags.some((t: string) =>
          cardName.includes(t.toLowerCase()) || cardSubs.some((s: string) => s.includes(t.toLowerCase()))
        )) return false;
      }
      if (filter.tags) {
        const name = card.card.name.toLowerCase();
        const subtypes = (card.card.subtypes || []).map((s: string) => s.toLowerCase());
        if (!filter.tags.some((t: string) =>
          name.includes(t.toLowerCase()) || subtypes.some((s: string) => s.includes(t.toLowerCase()))
        )) return false;
      }
      return true;
    };
  }

  private targetSelectorToZone(selector: TargetSelector): "deck" | "discard" | "hand" | "bench" | "opponent_bench" | "own_field" | undefined {
    switch (selector.zone) {
      case "own_deck": return "deck";
      case "own_discard": return "discard";
      case "own_hand": return "hand";
      case "own_bench": return "bench";
      case "opp_bench": return "opponent_bench";
      case "all_own": return "own_field";
      default: return undefined;
    }
  }

  // ═══════════════════════════════════════════════════════
  // Sync Step Executor
  // Same as executeStep but with auto-select fallbacks for interactive actions.
  // ═══════════════════════════════════════════════════════

  executeStepSync(step: any): void {
    // Normalize action key: CTA uses step.action, V2 uses step.action || step.actionType
    const action = (step as any).action || (step as any).actionType;

    // Handle V2 pure branch step (no action, just branch)
    if ((step as any).branch && !action) {
      if (this.evaluateCondition((step as any).branch.condition)) {
        for (const sub of ((step as any).branch.thenSteps || [])) this.executeStepSync(sub);
      } else if ((step as any).branch.elseSteps) {
        for (const sub of (step as any).branch.elseSteps) this.executeStepSync(sub);
      }
      return;
    }

    // Helper: resolve value from CTA flat props or V2 params
    const val = (...keys: string[]): number => {
      for (const k of keys) {
        const v = (step as any)[k] ?? (step as any).params?.[k];
        if (v !== undefined && v !== null) return this.resolveDynamic(v);
      }
      return 0;
    };

    switch (action) {
      // ─── A. Damage ───
      case "deal_damage": {
        const value = val("value", "damage");
        if (step.target) {
          const targets = this.resolveTargets(step.target);
          for (const t of targets) this.ctx.damage(value, t);
        } else {
          this.result.damage = value;
        }
        break;
      }
      case "put_damage_counters":
      case "place_damage_counters": {
        const value = val("value", "damage");
        const targets = this.resolveTargets(step.target);
        for (const t of targets) {
          // V2 place_damage_counters expects damage/10 as counters
          const counters = action === "place_damage_counters" ? Math.floor(value / 10) : value;
          t.damageCounters = (t.damageCounters || 0) + counters;
        }
        break;
      }
      case "self_damage":
      case "damage_self": {
        const dmg = val("value", "damage");
        this.result.selfDamage = (this.result.selfDamage || 0) + dmg;
        break;
      }
      case "bench_damage": {
        const benchTargets = this.getBenchTargets(step.side, step.count);
        this.result.benchDamage = [
          ...(this.result.benchDamage || []),
          ...benchTargets.map((t: GameCard) => ({ target: t, damage: val("value", "damage") })),
        ];
        break;
      }
      case "spread_damage": {
        const dmg = val("value", "damage");
        const targets = this.resolveTargets(step.target);
        const perTarget = Math.floor(dmg / Math.max(targets.length, 1));
        for (const t of targets) {
          t.damageCounters = (t.damageCounters || 0) + Math.floor(perTarget / 10);
        }
        break;
      }
      case "move_damage_counters": {
        const targets = this.resolveTargets(step.target);
        if (targets.length > 0 && this.ctx.source) {
          const counters = this.ctx.source.damageCounters || 0;
          this.ctx.source.damageCounters = 0;
          targets[0].damageCounters = (targets[0].damageCounters || 0) + counters;
        }
        break;
      }
      case "ignore_wr":
        if (step.weakness) this.result.skipWeakness = true;
        if (step.resistance) this.result.skipResistance = true;
        break;
      case "ignore_weakness":
        this.result.skipWeakness = true;
        break;
      case "ignore_resistance":
        this.result.skipResistance = true;
        break;
      case "ignore_effects":
        // Mark that effects on defender should be ignored
        break;

      // ─── B. Coin ───
      case "flip_coin": {
        const isHeads = this.ctx.flipCoin();
        this.lastCoinHeads = isHeads ? 1 : 0;
        // CTA format: step.on_heads / step.on_tails
        if (step.on_heads || step.on_tails) {
          const subs = isHeads ? (step.on_heads || []) : (step.on_tails || []);
          for (const sub of subs) this.executeStepSync(sub);
        }
        // V2 format: step.branch
        if (step.branch) {
          if (isHeads && step.branch.thenSteps) {
            for (const sub of step.branch.thenSteps) this.executeStepSync(sub);
          } else if (!isHeads && step.branch.elseSteps) {
            for (const sub of step.branch.elseSteps) this.executeStepSync(sub);
          }
        }
        break;
      }
      case "flip_coins": {
        const coinCount = val("count", "coinCount");
        const flips = this.ctx.flipCoins(coinCount);
        this.lastCoinHeads = flips.heads;
        // CTA format
        if (step.per_heads) {
          for (let i = 0; i < flips.heads; i++) {
            for (const sub of step.per_heads) this.executeStepSync(sub);
          }
        }
        break;
      }

      // ─── C. Status ───
      case "apply_status": {
        const status = step.status || step.params?.status;
        if (!status) break;
        const target = step.target
          ? this.resolveTargets(step.target)[0]
          : this.ctx.opponent.active;
        if (target) {
          // V2 may use result.statusEffects in attack context
          if (step.target?.owner !== undefined) {
            const isOpp = step.target?.owner === "opponent";
            this.result.statusEffects = [
              ...(this.result.statusEffects || []),
              { target: isOpp ? "defender" : "self", status },
            ];
          } else {
            this.ctx.applyStatus(target, status);
          }
        }
        break;
      }
      case "remove_status":
      case "remove_all_status": {
        const status = step.status || step.params?.status;
        const target = step.target
          ? this.resolveTargets(step.target)[0]
          : this.ctx.source;
        if (target) {
          if (status && action === "remove_status") this.ctx.removeStatus(target, status);
          else this.ctx.removeAllStatus(target);
        }
        break;
      }

      // ─── D. Card Movement ───
      case "draw_cards": {
        const amount = val("count", "amount");
        const who = this.resolveWhoFromStep(step);
        this.ctx.drawCards(amount, who);
        break;
      }
      case "discard_from_hand": {
        const amount = val("count", "amount");
        this.ctx.discardFromHand(amount, this.resolveWhoFromStep(step));
        break;
      }
      case "discard_cards": {
        const amount = val("count", "amount");
        const who = this.resolveWhoFromStep(step);
        const zone = step.target?.zone;
        if (zone === "hand") {
          this.ctx.discardFromHand(amount, who);
        } else if (zone === "deck_top") {
          const player = who === "opponent" ? this.ctx.opponent : this.ctx.player;
          for (let i = 0; i < amount && player.deck.cards.length > 0; i++) {
            const card = player.deck.cards.shift()!;
            player.discard.cards.push(card);
          }
        }
        break;
      }
      case "discard_hand":
        this.ctx.discardHand(this.resolveWhoFromStep(step));
        break;
      case "search_deck": {
        const who = this.resolveWhoFromStep(step);
        const filter = this.buildCardFilter(step.filter || step.params?.searchFilter || {});
        const count = val("count") || this.resolveDynamic(step.params?.searchCount || step.target?.count || step.target?.maxCount || 1);
        const found = this.ctx.searchDeck(filter, count, who);
        const dest = step.destination || step.params?.destination || "hand";
        for (const card of found) {
          switch (dest) {
            case "hand": this.ctx.addToHand(card, who); break;
            case "bench":
            case "in_play": {
              const player = who === "opponent" ? this.ctx.opponent : this.ctx.player;
              if (player.bench.cards.length < 5) player.bench.cards.push(card);
              break;
            }
            case "attach_to_self":
            case "attached_energy":
              this.ctx.source.attachedEnergy.push(card);
              break;
            case "top_of_deck": this.ctx.putOnTopOfDeck([card], who); break;
            case "bottom_of_deck": this.getPlayerByWho(who).deck.cards.push(card); break;
            default: this.ctx.addToHand(card, who); break;
          }
        }
        this.ctx.shuffleDeck(who);
        break;
      }
      case "recover_from_discard": {
        const who = this.resolveWhoFromStep(step);
        const filter = this.buildCardFilter(step.filter || step.params?.searchFilter || {});
        const count = val("count", "amount") || 1;
        const found = this.ctx.searchDiscard(filter, count, who);
        const dest = step.destination || step.params?.destination || "hand";
        for (const card of found) {
          switch (dest) {
            case "hand": this.ctx.addToHand(card, who); break;
            case "deck": this.ctx.shuffleIntoDeck([card], who); break;
            case "attach_to_self": this.ctx.source.attachedEnergy.push(card); break;
            case "bench": {
              const player = who === "opponent" ? this.ctx.opponent : this.ctx.player;
              if (player.bench.cards.length < 5) player.bench.cards.push(card);
              break;
            }
            default: this.ctx.addToHand(card, who); break;
          }
        }
        break;
      }
      case "shuffle_hand_into_deck":
        this.ctx.shuffleHandIntoDeck(this.resolveWhoFromStep(step));
        break;
      case "shuffle_deck":
        this.ctx.shuffleDeck(this.resolveWhoFromStep(step));
        break;
      case "shuffle_into_deck": {
        const who = this.resolveWhoFromStep(step);
        const zone = step.target?.zone;
        if (zone === "hand") {
          this.ctx.shuffleHandIntoDeck(who);
        } else if (zone === "active" && step.target?.owner === "self") {
          const cards = this.ctx.pickUpPokemon(this.ctx.source.instanceId, "player");
          this.ctx.shuffleIntoDeck(cards, "player");
        }
        break;
      }
      case "reveal_top_cards": {
        const who = this.resolveWhoFromStep(step);
        this.tempCards = this.ctx.revealTopCards(step.count, who);
        if (step.then) {
          for (const sub of step.then) this.executeStepSync(sub);
        }
        break;
      }
      case "put_on_deck": {
        const who = this.resolveWhoFromStep(step);
        if (step.position === "top") {
          this.ctx.putOnTopOfDeck(this.tempCards, who);
        } else {
          this.getPlayerByWho(who).deck.cards.push(...this.tempCards);
        }
        this.tempCards = [];
        break;
      }
      case "put_on_deck_top": {
        // V2 simplified: no-op or put source on top
        break;
      }
      case "discard_from_deck_top": {
        const who = this.resolveWhoFromStep(step);
        const player = this.getPlayerByWho(who);
        const count = val("count", "amount") || 1;
        for (let i = 0; i < count && player.deck.cards.length > 0; i++) {
          const card = player.deck.cards.shift()!;
          player.discard.cards.push(card);
        }
        break;
      }
      case "return_to_hand": {
        const who = this.resolveWhoFromStep(step);
        if (step.target?.zone === "active" || step.target?.zone === "in_play") {
          const cards = this.ctx.pickUpPokemon(this.ctx.source.instanceId, who);
          for (const c of cards) this.ctx.addToHand(c, who);
        }
        break;
      }
      case "move_to_lost_zone":
        // Lost zone not fully implemented
        break;

      // ─── E. Energy Management ───
      case "discard_energy": {
        const energyCount = val("count", "energyCount");
        // V2 shorthand: just set discardEnergy on result
        if (step.params?.energyCount !== undefined && !step.target) {
          if (energyCount === -1 || energyCount >= 999) {
            this.result.discardEnergy = 999;
          } else {
            this.result.discardEnergy = (this.result.discardEnergy || 0) + energyCount;
          }
          break;
        }
        // CTA format: actual energy manipulation
        const targets = step.target
          ? this.resolveTargets(step.target)
          : [this.ctx.source];
        for (const target of targets) {
          const count = step.count === "all" ? target.attachedEnergy.length : (energyCount || step.count || 1);
          let discarded = 0;
          for (let i = target.attachedEnergy.length - 1; i >= 0 && discarded < count; i--) {
            if (!step.energy_type || target.attachedEnergy[i].card.types?.includes(step.energy_type)) {
              const energy = target.attachedEnergy.splice(i, 1)[0];
              this.getPlayerForCard(target).discard.cards.push(energy);
              discarded++;
            }
          }
        }
        if (!step.target) {
          this.result.discardEnergy = (this.result.discardEnergy || 0) +
            (step.count === "all" ? this.ctx.source.attachedEnergy.length : (energyCount || step.count || 1));
        }
        break;
      }
      case "attach_energy": {
        const targets = this.resolveTargets(step.target);
        const target = targets[0];
        if (!target) break;
        const energyFilter = step.filter
          ? this.buildCardFilter(step.filter)
          : (c: GameCard) => c.card.supertype === "Energy";
        const source = step.source || "hand";
        const count = val("count", "energyCount") || 1;
        switch (source) {
          case "deck":
            for (let i = 0; i < count; i++) this.ctx.attachEnergyFromDeck(energyFilter, target);
            break;
          case "discard":
            this.ctx.attachEnergyFromDiscard(energyFilter, count, target);
            break;
          case "hand": {
            let attached = 0;
            for (let i = this.ctx.player.hand.cards.length - 1; i >= 0 && attached < count; i--) {
              if (energyFilter(this.ctx.player.hand.cards[i])) {
                const card = this.ctx.player.hand.cards.splice(i, 1)[0];
                target.attachedEnergy.push(card);
                attached++;
              }
            }
            break;
          }
        }
        break;
      }
      case "accelerate_energy": {
        const target = this.resolveTargets(step.target)[0] || this.ctx.source;
        const filter = this.buildCardFilter(step.params?.searchFilter || step.filter || {});
        const count = val("count", "energyCount") || 1;
        this.ctx.attachEnergyFromDiscard(filter, count, target);
        break;
      }
      case "move_energy": {
        const from = this.resolveTargets(step.from)[0];
        const to = this.resolveTargets(step.to || step.target)[0];
        if (!from || !to) break;
        const count = step.count || 1;
        let moved = 0;
        for (let i = from.attachedEnergy.length - 1; i >= 0 && moved < count; i--) {
          const energy = from.attachedEnergy[i];
          if (!step.energy_type || energy.card.types?.includes(step.energy_type)) {
            this.ctx.moveEnergy(from, to, energy.instanceId);
            moved++;
          }
        }
        break;
      }

      // ─── F. Field Operations ───
      case "switch_pokemon": {
        // Determine who from CTA who or V2 target.owner
        const isOpp = step.who === "opponent" || step.target?.owner === "opponent";
        const isBoth = step.who === "both";
        if (!isOpp || isBoth) {
          if (this.ctx.player.bench.cards.length > 0) {
            const bench = this.ctx.player.bench.cards;
            const idx = step.choice === "random" ? Math.floor(Math.random() * bench.length) : 0;
            this.ctx.switchOwnActive(bench[idx].instanceId);
          }
        }
        if (isOpp || isBoth) {
          if (this.ctx.opponent.bench.cards.length > 0) {
            const bench = this.ctx.opponent.bench.cards;
            const idx = step.choice === "random" ? Math.floor(Math.random() * bench.length) : 0;
            this.ctx.switchOpponentActive(bench[idx].instanceId);
          }
        }
        break;
      }
      case "heal":
      case "full_heal": {
        const amount = action === "full_heal" ? 9999 : val("value", "amount");
        const targets = this.resolveTargets(step.target);
        for (const t of targets) this.ctx.heal(amount, t);
        break;
      }
      case "discard_stadium":
        this.ctx.removeStadium();
        break;
      case "discard_tool": {
        const targets = step.target
          ? this.resolveTargets(step.target)
          : [this.ctx.opponent.active].filter(Boolean) as GameCard[];
        for (const t of targets) {
          if (t.attachedTools && t.attachedTools.length > 0) {
            const tool = t.attachedTools.pop()!;
            this.getPlayerForCard(t).discard.cards.push(tool);
          }
        }
        break;
      }
      case "evolve":
      case "devolve":
      case "copy_attack":
      case "use_attack": {
        if (action === "evolve") {
          const targets = this.resolveTargets(step.target);
          const target = targets[0];
          if (!target || !this.ctx.evolvePokemonDirect) break;
          if (step.from_deck) {
            const filter = (c: GameCard) =>
              c.card.supertype === "Pokémon" && c.card.evolvesFrom === target.card.name;
            const found = this.ctx.searchDeck(filter, 1, "player");
            if (found.length > 0) this.ctx.evolvePokemonDirect(target.instanceId, found[0]);
            this.ctx.shuffleDeck("player");
          }
        } else if (action === "copy_attack") {
          this.ctx.log("复制攻击 (需要引擎层面实现)");
        }
        // devolve and use_attack are complex, skip in sync mode
        break;
      }

      // ─── G. Markers / Restrictions ───
      case "set_marker": {
        const marker = step.marker || step.params?.marker;
        if (!marker) break;
        const targets = this.resolveTargets(step.target);
        for (const t of targets) this.ctx.addMarker(t, marker, step.value ?? step.params?.value ?? 1);
        break;
      }
      case "clear_marker":
      case "remove_marker": {
        const marker = step.marker || step.params?.marker;
        if (!marker) break;
        const targets = this.resolveTargets(step.target);
        for (const t of targets) this.ctx.removeMarker(t, marker);
        break;
      }
      case "cant_attack_next_turn":
        this.ctx.addMarker(this.ctx.source, CANT_ATTACK_NEXT_TURN, 1);
        break;
      case "cant_retreat":
      case "prevent_retreat": {
        const target = step.target
          ? this.resolveTargets(step.target)[0]
          : this.ctx.opponent.active;
        if (target) {
          this.ctx.addMarker(target, PREVENT_RETREAT_NEXT_TURN, 1);
          this.result.preventRetreat = true;
        }
        break;
      }
      case "reduce_damage_next_turn":
      case "reduce_damage": {
        const amount = val("amount", "value");
        this.ctx.addMarker(this.ctx.source, `DAMAGE_REDUCTION:${amount}`, 1);
        break;
      }
      case "prevent_damage_next_turn":
      case "prevent_damage":
        this.ctx.addMarker(this.ctx.source, PREVENT_ALL_DAMAGE_NEXT_TURN, 1);
        break;
      case "add_damage": {
        const addVal = val("value");
        this.result.damage = (this.result.damage || 0) + addVal;
        break;
      }
      case "prevent_item_usage":
      case "prevent_supporter_usage":
      case "prevent_ability":
      case "prevent_attack":
      case "prevent_evolution":
      case "prevent_status":
      case "prevent_energy_removal":
        this.ctx.addMarker(
          step.target?.owner === "opponent" ? (this.ctx.opponent.active || this.ctx.source) : this.ctx.source,
          action.toUpperCase(),
          1
        );
        break;
      case "disable_attack": {
        const target = step.target
          ? this.resolveTargets(step.target)[0]
          : this.ctx.opponent.active;
        if (target) {
          const attacks = target.card.attacks;
          if (attacks && attacks.length > 0) {
            const attackName = step.choice === "random"
              ? attacks[Math.floor(Math.random() * attacks.length)].name
              : attacks[0].name;
            this.ctx.addMarker(target, cantUseAttackMarker(attackName), 1);
          }
        }
        break;
      }

      // ─── H. Flow Control ───
      case "if": {
        // CTA format: step.condition + step.then/step.else
        if (step.condition) {
          const condMet = this.evaluateCondition(step.condition);
          const subs = condMet ? (step.then || []) : (step.else || []);
          for (const sub of subs) this.executeStepSync(sub);
        }
        // V2 format: step.branch.condition + thenSteps/elseSteps
        if (step.branch) {
          if (this.evaluateCondition(step.branch.condition)) {
            for (const sub of (step.branch.thenSteps || [])) this.executeStepSync(sub);
          } else if (step.branch.elseSteps) {
            for (const sub of step.branch.elseSteps) this.executeStepSync(sub);
          }
        }
        break;
      }
      case "for_each": {
        // CTA: step.targets/step.body; V2: step.loop.target/step.loop.body
        if (step.loop) {
          const targets = this.resolveTargets(step.loop.target);
          for (const _t of targets) {
            for (const sub of (step.loop.body || [])) this.executeStepSync(sub);
          }
        } else {
          const targets = this.resolveTargets(step.targets);
          for (const _target of targets) {
            for (const sub of (step.body || [])) this.executeStepSync(sub);
          }
        }
        break;
      }
      case "repeat": {
        // V2: step.loop.count + step.loop.body
        if (step.loop) {
          const count = this.resolveDynamic(step.loop.count);
          for (let i = 0; i < count; i++) {
            for (const sub of (step.loop.body || [])) this.executeStepSync(sub);
          }
        }
        break;
      }
      case "choose": {
        // Auto-select: resolve all targets up to max
        this.tempCards = this.resolveTargets(step.from).slice(0, step.max);
        if (step.then) {
          for (const sub of step.then) this.executeStepSync(sub);
        }
        this.tempCards = [];
        break;
      }
      case "choose_one": {
        // Auto-select: first option
        if (step.options && step.options.length > 0) {
          for (const sub of step.options[0].steps) this.executeStepSync(sub);
        }
        break;
      }
      // V2 player interaction (sync fallback)
      case "choose_cards":
      case "choose_pokemon":
      case "choose_option":
      case "choose_type":
      case "confirm":
      case "reveal_cards":
      case "show_hand":
      case "look_at_cards":
      case "order_cards":
        break;

      // ─── I. Special ───
      case "extra_turn":
        this.ctx.addMarker(this.ctx.source, "EXTRA_TURN", 1);
        (this.ctx.state as any).__extraTurn = true;
        break;
      case "end_turn":
        break;
      case "log":
        this.ctx.log(step.message || step.params?.message || "");
        break;

      default:
        // Unknown action — skip silently
        break;
    }

    // Store result in labels if step has a label (V2)
    if ((step as any).label) {
      this.labels.set((step as any).label, this.result.damage);
    }
  }

  /** Resolve "who" from CTA step.who or V2 step.target.owner */
  private resolveWhoFromStep(step: any): "player" | "opponent" {
    if (step.who) return step.who === "opponent" ? "opponent" : "player";
    if (step.target?.owner) return step.target.owner === "opponent" ? "opponent" : "player";
    return "player";
  }
}

// ═══════════════════════════════════════════════════════
// Standalone Helpers (for V2 compiler and external use)
// ═══════════════════════════════════════════════════════

/**
 * Evaluate a condition against an EffectContext (standalone, no ExecutionContext needed).
 * Handles both CTA (condition.check) and V2 (condition.type) formats.
 */
export function evaluateConditionStandalone(condition: any, ctx: EffectContext): boolean {
  const ec = new ExecutionContext(ctx, 0);
  return ec.evaluateConditionPublic(condition);
}

/**
 * Resolve a dynamic value against an EffectContext (standalone).
 * Handles both CTA ({ per, multiply }) and V2 ({ calc, ... }) formats.
 */
export function resolveDynamicStandalone(value: any, ctx: EffectContext): number {
  const ec = new ExecutionContext(ctx, 0);
  return ec.resolveDynamicPublic(value);
}
