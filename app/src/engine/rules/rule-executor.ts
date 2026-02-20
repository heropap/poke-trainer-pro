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

  constructor(ctx: EffectContext, baseDamage: number) {
    this.ctx = ctx;
    this.result = { damage: baseDamage };
  }

  getAttackResult(): AttackResult {
    return this.result;
  }

  async executeStep(step: ActionStep): Promise<void> {
    switch (step.action) {
      // ─── A. Damage ───
      case "deal_damage": {
        const value = this.resolveDynamic(step.value);
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

      // ─── B. Coin ───
      case "flip_coin": {
        const isHeads = this.ctx.flipCoin();
        if (isHeads) {
          for (const sub of step.on_heads) {
            await this.executeStep(sub);
          }
        } else if (step.on_tails) {
          for (const sub of step.on_tails) {
            await this.executeStep(sub);
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
        const condMet = this.evaluateCondition(step.condition);
        if (condMet) {
          for (const sub of step.then) {
            await this.executeStep(sub);
          }
        } else if (step.else) {
          for (const sub of step.else) {
            await this.executeStep(sub);
          }
        }
        break;
      }

      case "for_each": {
        const targets = this.resolveTargets(step.targets);
        for (const _target of targets) {
          for (const sub of step.body) {
            await this.executeStep(sub);
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
        this.ctx.log("获得额外回合!");
        // Needs engine-level support — set a flag
        (this.ctx.state as any).__extraTurn = true;
        break;

      case "log":
        this.ctx.log(step.message);
        break;
    }
  }

  // ═══════════════════════════════════════════════════════
  // Helper: Resolve Dynamic Values
  // ═══════════════════════════════════════════════════════

  private resolveDynamic(value: DynamicValue): number {
    if (typeof value === "number") return value;

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

    return count * value.multiply;
  }

  // ═══════════════════════════════════════════════════════
  // Helper: Resolve Targets
  // ═══════════════════════════════════════════════════════

  private resolveTargets(selector: TargetSelector): GameCard[] {
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

  // ═══════════════════════════════════════════════════════
  // Helper: Evaluate Conditions
  // ═══════════════════════════════════════════════════════

  private evaluateCondition(condition: Condition): boolean {
    switch (condition.check) {
      case "coin_flip":
        return this.ctx.flipCoin();

      case "coin_flip_multi": {
        const flips = this.ctx.flipCoins(condition.count);
        this.lastCoinHeads = flips.heads;
        return flips.heads > 0;
      }

      case "has_energy": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => {
          const energyCount = condition.type
            ? t.attachedEnergy.filter(e => e.card.types?.includes(condition.type!)).length
            : t.attachedEnergy.length;
          return energyCount >= (condition.min ?? 1);
        });
      }

      case "has_damage": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => t.damageCounters >= (condition.min ?? 1));
      }

      case "has_status": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t =>
          condition.status
            ? t.statusConditions.includes(condition.status)
            : t.statusConditions.length > 0
        );
      }

      case "has_pokemon_on_bench": {
        const who = condition.who;
        if (who === "player" || who === "both") {
          if (this.ctx.player.bench.cards.length === 0) return false;
        }
        if (who === "opponent" || who === "both") {
          if (this.ctx.opponent.bench.cards.length === 0) return false;
        }
        return true;
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

      case "is_in_active_spot":
        return this.ctx.player.active?.instanceId === this.ctx.source.instanceId;

      case "has_tag": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => {
          const name = t.card.name.toLowerCase();
          const tag = condition.tag.toLowerCase();
          // Check name contains tag (ex, V, VSTAR, etc.)
          return name.includes(tag) ||
            (t.card.subtypes && t.card.subtypes.some(s => s.toLowerCase().includes(tag)));
        });
      }

      case "is_type": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t =>
          t.card.types?.some(type => condition.types.includes(type as any))
        );
      }

      case "marker_exists": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => this.ctx.hasMarker(t, condition.marker));
      }

      case "hp_remaining_lte": {
        const targets = this.resolveTargets(condition.target);
        return targets.some(t => {
          const hp = (parseInt(String(t.card.hp), 10) || 0) - (t.damageCounters * 10);
          return hp <= condition.amount;
        });
      }

      case "not":
        return !this.evaluateCondition(condition.condition);

      case "and":
        return condition.conditions.every(c => this.evaluateCondition(c));

      case "or":
        return condition.conditions.some(c => this.evaluateCondition(c));

      default:
        return true;
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

  private buildCardFilter(filter: CardFilter): (card: GameCard) => boolean {
    return (card: GameCard): boolean => {
      if (filter.supertype && card.card.supertype !== filter.supertype) return false;
      if (filter.subtypes && !filter.subtypes.some(s => card.card.subtypes?.includes(s))) return false;
      if (filter.types && !filter.types.some(t => card.card.types?.includes(t))) return false;
      if (filter.name && card.card.name !== filter.name) return false;
      if (filter.isBasicEnergy) {
        if (card.card.supertype !== "Energy" || !card.card.subtypes?.includes("Basic")) return false;
      }
      if (filter.evolvesFrom && card.card.evolvesFrom !== filter.evolvesFrom) return false;
      if (filter.tags) {
        const name = card.card.name.toLowerCase();
        const subtypes = (card.card.subtypes || []).map(s => s.toLowerCase());
        if (!filter.tags.some(tag =>
          name.includes(tag.toLowerCase()) || subtypes.some(s => s.includes(tag.toLowerCase()))
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
}
