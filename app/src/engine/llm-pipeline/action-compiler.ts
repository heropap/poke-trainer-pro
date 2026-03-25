/**
 * ============================================================================
 * ActionPacket → CardEffectDef Compiler (L2.5 Layer)
 * ============================================================================
 *
 * Converts LLM-generated ActionPackets into executable CardEffectDef objects
 * that plug into the existing effect registry and game engine.
 *
 * Design principle: the compiler is a pure, deterministic translator.
 * Each AtomicAction type maps to specific EffectContext helper calls or
 * AttackResult fields that the engine already knows how to execute.
 *
 * Integration:
 *   ActionPacket.actions[] → CardEffectDef { attacks, abilities, trainer }
 *   Registered at L2.5 via registerByName(..., "L2.5")
 * ============================================================================
 */

import type { EffectContext, AttackResult, CardEffectDef, AttackEffect, AbilityEffect, TrainerEffect } from '../effects/effect-types';
import type { GameCard, StatusCondition } from '../game-state';

// ─────────────────────────────────────────────
// AtomicAction (mirrors pipeline.ts definition)
// ─────────────────────────────────────────────

interface AtomicAction {
  type: string;
  [key: string]: any;
}

interface ActionPacket {
  executionId: string;
  source: {
    sourceCardId: string;
    sourceType: 'attack' | 'ability' | 'item' | 'supporter' | 'stadium';
    sourcePlayer: string;
  };
  trigger?: string;
  cost?: any;
  actions: AtomicAction[];
  postActions?: AtomicAction[];
}

// ─────────────────────────────────────────────
// Core compiler: ActionPacket → CardEffectDef
// ─────────────────────────────────────────────

/**
 * Compile an ActionPacket into a CardEffectDef that the engine can execute.
 *
 * For attacks: produces an AttackEffect with onAttack() that returns an AttackResult
 * For abilities: produces an AbilityEffect with onActivate()
 * For trainers: produces a TrainerEffect with onPlay()
 */
export function compileActionPacket(
  cardName: string,
  attackName: string | undefined,
  packet: ActionPacket,
): CardEffectDef {
  const def: CardEffectDef = {
    cardId: `l25:${cardName}`,
    cardName,
  };

  switch (packet.source.sourceType) {
    case 'attack':
      def.attacks = [compileAttackEffect(attackName || cardName, packet.actions, packet.postActions)];
      break;
    case 'ability':
      def.abilities = [compileAbilityEffect(attackName || cardName, packet.trigger, packet.actions)];
      break;
    case 'supporter':
    case 'item':
    case 'stadium':
      def.trainer = compileTrainerEffect(packet.actions);
      break;
  }

  return def;
}


// ═══════════════════════════════════════════
// Attack Compiler
// ═══════════════════════════════════════════

/**
 * Compile attack actions into an AttackEffect.
 *
 * The engine's performAttack() expects onAttack() to return an AttackResult:
 *   { damage, selfDamage, benchDamage, statusEffects, discardEnergy, ... }
 *
 * We scan the AtomicActions and extract these fields.
 */
function compileAttackEffect(
  name: string,
  actions: AtomicAction[],
  postActions?: AtomicAction[],
): AttackEffect {
  return {
    name,
    onAttack: (ctx: EffectContext, baseDamage: number): AttackResult => {
      const result: AttackResult = { damage: baseDamage };
      const allActions = [...actions, ...(postActions || [])];

      // Process each action and accumulate into AttackResult
      for (const action of allActions) {
        processAttackAction(action, ctx, result, baseDamage);
      }

      return result;
    },
  };
}

/**
 * Process a single AtomicAction and update the AttackResult accordingly.
 */
function processAttackAction(
  action: AtomicAction,
  ctx: EffectContext,
  result: AttackResult,
  baseDamage: number,
): void {
  switch (action.type) {

    // ─── Damage actions ───

    case 'deal_damage': {
      if (action.damageTag === 'attack') {
        // Main attack damage — override baseDamage if explicitly specified
        if (typeof action.amount === 'number') {
          result.damage = action.amount;
        }
      } else if (action.damageTag === 'self_damage') {
        // Recoil damage to self
        result.selfDamage = (result.selfDamage || 0) + (action.amount || 0);
      } else if (action.damageTag === 'bench_effect') {
        // Bench spread — handled via benchDamage array
        // (individual targets resolved at execution time by for_each)
      }
      break;
    }

    case 'place_damage_counters': {
      // Direct counter placement — handled as postActions via ctx helper
      const target = resolveTargetCard(action.target, ctx);
      if (target && ctx.placeDamageCounters) {
        ctx.placeDamageCounters(action.counters * 10, target);
      }
      break;
    }

    // ─── Energy actions ───

    case 'discard_energy': {
      const count = action.count || 1;
      result.discardEnergy = (result.discardEnergy || 0) + count;
      break;
    }

    // ─── Status actions ───

    case 'apply_special_condition': {
      if (!result.statusEffects) result.statusEffects = [];
      const targetSide = isOpponentTarget(action.target) ? 'defender' : 'self';
      result.statusEffects.push({
        target: targetSide as 'defender' | 'self',
        status: mapStatusCondition(action.condition),
      });
      break;
    }

    // ─── Heal actions ───

    case 'heal_damage': {
      const target = resolveTargetCard(action.target, ctx);
      if (target) {
        ctx.heal(action.amount || 0, target);
      }
      break;
    }

    // ─── Card movement actions ───

    case 'draw_card': {
      ctx.drawCards(action.count || 1);
      break;
    }

    case 'discard_card': {
      if (action.count === -1) {
        // Discard entire hand
        ctx.discardHand();
      } else {
        ctx.discardFromHand(action.count || 1);
      }
      break;
    }

    case 'shuffle_deck': {
      ctx.shuffleDeck();
      break;
    }

    // ─── Flow control actions ───

    case 'switch_pokemon': {
      if (action.player === 'opponent') {
        // Force switch opponent — pick random bench Pokemon
        const oppBench = ctx.getAllPokemon('opponent').filter(
          p => p.instanceId !== ctx.opponent.active?.instanceId
        );
        if (oppBench.length > 0) {
          ctx.switchOpponentActive(oppBench[0].instanceId);
        }
      } else {
        const ownBench = ctx.getAllPokemon('player').filter(
          p => p.instanceId !== ctx.player.active?.instanceId
        );
        if (ownBench.length > 0) {
          ctx.switchOwnActive(ownBench[0].instanceId);
        }
      }
      break;
    }

    // ─── Conditional/branching ───

    case 'conditional': {
      const conditionMet = evaluateCondition(action.condition, ctx, baseDamage);
      const branch = conditionMet ? action.ifTrue : action.ifFalse;
      if (branch) {
        for (const subAction of branch) {
          processAttackAction(subAction, ctx, result, baseDamage);
        }
      }
      break;
    }

    case 'dynamic_value': {
      const count = evaluateDynamicCount(action.source, ctx);
      const multiplier = action.multiplier || 0;
      const dynBaseDamage = action.action?.baseDamage || 0;
      result.damage = dynBaseDamage + (count * multiplier);
      break;
    }

    case 'flip_coin': {
      if (action.mode === 'single') {
        const heads = ctx.flipCoin();
        const branch = heads ? action.onHeads : action.onTails;
        if (branch) {
          for (const subAction of branch) {
            processAttackAction(subAction, ctx, result, baseDamage);
          }
        }
      } else if (action.mode === 'flip_n') {
        const flips = ctx.flipCoins(action.count || 1);
        if (action.onResult) {
          const damageStr = String(action.onResult.amount || '');
          const match = damageStr.match(/HEADS_COUNT\s*\*\s*(\d+)/);
          if (match) {
            result.damage = flips.heads * parseInt(match[1], 10);
          }
        }
      } else if (action.mode === 'until_tails') {
        // Flip until tails
        let headsCount = 0;
        while (ctx.flipCoin()) {
          headsCount++;
          if (headsCount > 20) break; // safety limit
        }
        if (action.onResult) {
          const damageStr = String(action.onResult.amount || '');
          const match = damageStr.match(/HEADS_COUNT\s*\*\s*(\d+)/);
          if (match) {
            result.damage = headsCount * parseInt(match[1], 10);
          }
        }
      }
      break;
    }

    case 'for_each': {
      // Bench spread: iterate over opponent's bench
      if (action.targets?.zone === 'bench' && action.action) {
        const subActions = Array.isArray(action.action) ? action.action : [action.action];
        for (const sub of subActions) {
          if (sub.type === 'deal_damage' && sub.damageTag === 'bench_effect') {
            // Accumulate bench damage for all bench Pokemon
            const benchPokemon = ctx.opponent.bench.cards;
            if (!result.benchDamage) result.benchDamage = [];
            for (const bp of benchPokemon) {
              result.benchDamage.push({
                target: bp,
                damage: sub.amount || 0,
              });
            }
          }
        }
      }
      break;
    }

    case 'player_choice': {
      if (action.choiceType === 'distribute_counters') {
        // Distribute damage counters across targets
        const totalCounters = action.totalCounters || 0;
        if (ctx.spreadDamage) {
          const targets = action.targets?.scope === 'bench_only'
            ? ctx.opponent.bench.cards
            : [...(ctx.opponent.active ? [ctx.opponent.active] : []), ...ctx.opponent.bench.cards];
          ctx.spreadDamage(totalCounters, targets);
        }
      } else if (action.choiceType === 'yes_no') {
        // Optional effect — for now, always execute (AI will choose optimally)
        if (action.onYes) {
          for (const subAction of action.onYes) {
            processAttackAction(subAction, ctx, result, baseDamage);
          }
        }
      }
      break;
    }

    case 'register_modifier': {
      // Damage reduction / immunity markers
      if (action.modifier?.type === 'damage_reduction') {
        const target = ctx.player.active;
        if (target) {
          const markerName = `DMG_REDUCTION_${action.modifier.value}`;
          ctx.addMarker(target, markerName, 1);
        }
      }
      break;
    }

    case 'no_op':
      break;

    default:
      // Unknown action — log for debugging but don't crash
      console.warn(`[ActionCompiler] Unhandled attack action type: ${action.type}`);
  }
}


// ═══════════════════════════════════════════
// Ability Compiler
// ═══════════════════════════════════════════

function compileAbilityEffect(
  name: string,
  trigger: string | undefined,
  actions: AtomicAction[],
): AbilityEffect {
  // Determine ability type from trigger
  let type: 'activated' | 'passive' | 'on_enter' = 'activated';
  if (trigger === 'ON_PLAY_FROM_HAND' || trigger === 'ON_ENTER_PLAY') {
    type = 'on_enter';
  } else if (trigger === 'WHILE_IN_PLAY' || trigger === 'WHILE_ACTIVE' || trigger === 'WHILE_ATTACHED') {
    type = 'passive';
  }

  const effect: AbilityEffect = {
    name,
    type,
  };

  if (type === 'on_enter') {
    effect.onEnter = async (ctx: EffectContext) => {
      await executeAbilityActions(actions, ctx);
    };
  } else if (type === 'activated') {
    effect.onActivate = async (ctx: EffectContext) => {
      await executeAbilityActions(actions, ctx);
    };
  } else if (type === 'passive') {
    // Passive abilities with damage modifiers
    const modAction = actions.find(a =>
      a.type === 'register_modifier' && a.modifier?.type === 'damage_bonus'
    );
    if (modAction) {
      effect.modifyDamage = (_ctx: EffectContext, damage: number, isAttacker: boolean) => {
        if (isAttacker && modAction.modifier.scope === 'attack') {
          return damage + (modAction.modifier.value || 0);
        }
        return damage;
      };
    }

    const incomingModAction = actions.find(a =>
      a.type === 'register_modifier' && a.modifier?.type === 'damage_reduction'
    );
    if (incomingModAction) {
      effect.modifyIncomingDamage = (_ctx: EffectContext, damage: number) => {
        return Math.max(0, damage - (incomingModAction.modifier.value || 0));
      };
    }

    const retreatModAction = actions.find(a =>
      a.type === 'register_modifier' && a.modifier?.type === 'retreat_cost_reduction'
    );
    if (retreatModAction) {
      effect.modifyRetreatCost = (_ctx: EffectContext, cost: number) => {
        return Math.max(0, cost - (retreatModAction.modifier.value || 0));
      };
    }
  }

  return effect;
}

/**
 * Execute a list of AtomicActions in ability/trainer context.
 * Unlike attack actions, these directly mutate state via EffectContext helpers.
 */
async function executeAbilityActions(actions: AtomicAction[], ctx: EffectContext): Promise<void> {
  for (const action of actions) {
    await executeAbilityAction(action, ctx);
  }
}

async function executeAbilityAction(action: AtomicAction, ctx: EffectContext): Promise<void> {
  switch (action.type) {

    case 'draw_card':
      ctx.drawCards(action.count || 1, action.player === 'opponent' ? 'opponent' : 'player');
      break;

    case 'discard_card':
      if (action.count === -1) {
        ctx.discardHand(action.player === 'opponent' ? 'opponent' : 'player');
      } else {
        ctx.discardFromHand(action.count || 1, action.player === 'opponent' ? 'opponent' : 'player');
      }
      break;

    case 'search_deck': {
      const filter = buildCardFilter(action.filter);
      const count = action.count || 1;
      const who = action.player === 'opponent' ? 'opponent' : 'player';
      if (ctx.promptSearchDeck) {
        await ctx.promptSearchDeck(filter, count, `Search for up to ${count} card(s)`, who as any);
      } else {
        const found = ctx.searchDeck(filter, count, who as any);
        for (const card of found) {
          ctx.addToHand(card, who as any);
        }
      }
      break;
    }

    case 'move_card': {
      if (action.from === 'hand' && action.to === 'deck') {
        ctx.shuffleHandIntoDeck(action.player === 'opponent' ? 'opponent' : 'player');
      }
      break;
    }

    case 'shuffle_deck':
      ctx.shuffleDeck(action.player === 'opponent' ? 'opponent' : 'player');
      break;

    case 'deal_damage': {
      const target = resolveTargetCard(action.target, ctx);
      if (target) {
        ctx.damage(action.amount || 0, target);
      }
      break;
    }

    case 'place_damage_counters': {
      const target = resolveTargetCard(action.target, ctx);
      if (target && ctx.placeDamageCounters) {
        ctx.placeDamageCounters((action.counters || 0) * 10, target);
      }
      break;
    }

    case 'heal_damage': {
      const target = resolveTargetCard(action.target, ctx);
      if (target) {
        ctx.heal(action.amount || 0, target);
      }
      break;
    }

    case 'apply_special_condition': {
      const target = resolveTargetCard(action.target, ctx);
      if (target) {
        ctx.applyStatus(target, mapStatusCondition(action.condition));
      }
      break;
    }

    case 'remove_special_condition': {
      const target = resolveTargetCard(action.target, ctx);
      if (target) {
        if (action.condition === 'all') {
          ctx.removeAllStatus(target);
        } else {
          ctx.removeStatus(target, mapStatusCondition(action.condition));
        }
      }
      break;
    }

    case 'switch_pokemon': {
      if (action.player === 'opponent') {
        if (ctx.promptSwitchOpponentActive) {
          await ctx.promptSwitchOpponentActive();
        } else {
          const bench = ctx.opponent.bench.cards;
          if (bench.length > 0) {
            ctx.switchOpponentActive(bench[0].instanceId);
          }
        }
      } else {
        if (ctx.promptSwitchOwnActive) {
          await ctx.promptSwitchOwnActive();
        } else {
          const bench = ctx.player.bench.cards;
          if (bench.length > 0) {
            ctx.switchOwnActive(bench[0].instanceId);
          }
        }
      }
      break;
    }

    case 'attach_energy': {
      // Energy acceleration — search and attach
      const filter = buildCardFilter(action.filter);
      const target = resolveTargetCard(action.target, ctx);
      if (target) {
        if (action.from === 'discard') {
          ctx.attachEnergyFromDiscard(filter, action.count || 1, target);
        } else {
          ctx.attachEnergyFromDeck(filter, target);
        }
      }
      break;
    }

    case 'move_energy': {
      // Energy move between Pokemon — needs interactive selection
      // For now, no-op; requires prompt
      break;
    }

    case 'flip_coin': {
      if (action.mode === 'single') {
        const heads = ctx.flipCoin();
        const branch = heads ? action.onHeads : action.onTails;
        if (branch) {
          for (const sub of branch) {
            await executeAbilityAction(sub, ctx);
          }
        }
      }
      break;
    }

    case 'conditional': {
      const conditionMet = evaluateCondition(action.condition, ctx, 0);
      const branch = conditionMet ? action.ifTrue : action.ifFalse;
      if (branch) {
        for (const sub of branch) {
          await executeAbilityAction(sub, ctx);
        }
      }
      break;
    }

    case 'player_choice': {
      if (action.choiceType === 'yes_no') {
        // Optional effect — execute the "yes" branch by default
        if (action.onYes) {
          for (const sub of action.onYes) {
            await executeAbilityAction(sub, ctx);
          }
        }
      } else if (action.choiceType === 'select_from_discard') {
        const filter = buildCardFilter(action.filter);
        if (ctx.promptSearchDiscard) {
          await ctx.promptSearchDiscard(filter, action.count || 1, 'Select cards from discard pile');
        } else {
          const found = ctx.searchDiscard(filter, action.count || 1);
          for (const card of found) {
            ctx.addToHand(card);
          }
        }
      } else if (action.choiceType === 'select_bench_pokemon') {
        // Handled by switch_pokemon action
      } else if (action.choiceType === 'distribute_counters') {
        if (ctx.spreadDamage) {
          const targets = action.targets?.scope === 'bench_only'
            ? ctx.opponent.bench.cards
            : [...(ctx.opponent.active ? [ctx.opponent.active] : []), ...ctx.opponent.bench.cards];
          ctx.spreadDamage(action.totalCounters || 0, targets);
        }
      }
      break;
    }

    case 'peek_cards': {
      const count = action.count || 1;
      ctx.revealTopCards(count);
      break;
    }

    case 'evolve_pokemon': {
      // Handled via evolvePokemonDirect if available
      break;
    }

    case 'register_modifier': {
      // Runtime modifier registration — use markers
      if (action.modifier?.type === 'damage_reduction' && ctx.player.active) {
        ctx.addMarker(ctx.player.active, `DMG_REDUCTION_${action.modifier.value}`, 1);
      } else if (action.modifier?.type === 'action_lock') {
        // Lock effects (e.g., "opponent can't use Supporters next turn")
        ctx.log(`Lock effect: ${action.modifier.lockTarget}`);
      }
      break;
    }

    case 'no_op':
      break;

    default:
      console.warn(`[ActionCompiler] Unhandled ability action type: ${action.type}`);
  }
}


// ═══════════════════════════════════════════
// Trainer Compiler
// ═══════════════════════════════════════════

function compileTrainerEffect(actions: AtomicAction[]): TrainerEffect {
  return {
    onPlay: async (ctx: EffectContext) => {
      await executeAbilityActions(actions, ctx);
    },
  };
}


// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

/**
 * Resolve a target descriptor to an actual GameCard on the field.
 */
function resolveTargetCard(target: any, ctx: EffectContext): GameCard | null {
  if (!target) return ctx.opponent.active || null;

  if (typeof target === 'string') {
    if (target === 'opponent.active') return ctx.opponent.active || null;
    if (target === 'self.active') return ctx.player.active || null;
  }

  if (typeof target === 'object') {
    const player = target.player === 'opponent' ? ctx.opponent : ctx.player;
    if (target.zone === 'active') return player.active || null;
    if (target.zone === 'bench') return player.bench.cards[0] || null;
    if (target.zone === 'all_pokemon') return player.active || null;
  }

  return ctx.opponent.active || null;
}

/**
 * Check if a target descriptor refers to the opponent.
 */
function isOpponentTarget(target: any): boolean {
  if (!target) return true; // default target is opponent active
  if (typeof target === 'string') return target.startsWith('opponent');
  if (typeof target === 'object') return target.player === 'opponent';
  return true;
}

/**
 * Map a string status condition to our StatusCondition type.
 */
function mapStatusCondition(condition: string): StatusCondition {
  const mapping: Record<string, StatusCondition> = {
    'poisoned': 'poisoned',
    'poison': 'poisoned',
    'burned': 'burned',
    'burn': 'burned',
    'asleep': 'asleep',
    'sleep': 'asleep',
    'paralyzed': 'paralyzed',
    'paralyze': 'paralyzed',
    'paralysis': 'paralyzed',
    'confused': 'confused',
    'confuse': 'confused',
    'confusion': 'confused',
  };
  return mapping[condition.toLowerCase()] || (condition as StatusCondition);
}

/**
 * Build a card filter function from a filter descriptor.
 */
function buildCardFilter(filterDesc: any): (card: GameCard) => boolean {
  if (!filterDesc) return () => true;

  return (card: GameCard) => {
    if (filterDesc.cardType === 'energy') {
      if (card.card.supertype !== 'Energy') return false;
      if (filterDesc.energyType && filterDesc.energyType !== 'any') {
        // Check energy type matches
        const energyName = card.card.name?.toLowerCase() || '';
        return energyName.includes(filterDesc.energyType.toLowerCase());
      }
      return true;
    }
    if (filterDesc.cardType === 'pokemon') {
      if (card.card.supertype !== 'Pokémon') return false;
      if (filterDesc.stage) {
        return card.card.subtypes?.includes(filterDesc.stage) || false;
      }
      return true;
    }
    if (filterDesc.supertype) {
      return card.card.supertype === filterDesc.supertype;
    }
    return true;
  };
}

/**
 * Evaluate a game state condition for conditional actions.
 */
function evaluateCondition(condition: any, ctx: EffectContext, baseDamage: number): boolean {
  if (!condition) return false;
  const condType = typeof condition === 'string' ? condition : condition.type;

  switch (condType) {
    case 'coin_flip':
      return ctx.flipCoin();

    case 'opponent_prizes_taken':
      // Opponent has taken prizes
      return (6 - (ctx.opponent.prizes?.cards?.length || 0)) > 0;

    case 'has_energy':
      // Check if Pokemon has energy attached
      return (ctx.source.attachedEnergy?.length || 0) > 0;

    case 'bench_count':
      return ctx.player.bench.cards.length >= (condition.min || 1);

    case 'hand_count':
      return ctx.player.hand.cards.length >= (condition.min || 1);

    case 'damage_on_self':
      return (ctx.source.damageCounters || 0) > 0;

    default:
      // Unknown condition — default to true so at least the base damage applies
      return true;
  }
}

/**
 * Evaluate a dynamic count for DMG_DYNAMIC_MULTIPLIER patterns.
 */
function evaluateDynamicCount(source: any, ctx: EffectContext): number {
  if (!source) return 0;
  const sourceType = typeof source === 'string' ? source : source.type;

  switch (sourceType) {
    case 'opponent_prizes_taken':
      return 6 - (ctx.opponent.prizes?.cards?.length || 0);

    case 'energy_attached':
      return ctx.source.attachedEnergy?.length || 0;

    case 'damage_counters_on_self':
      return ctx.source.damageCounters || 0;

    case 'bench_count':
      return ctx.player.bench.cards.length;

    case 'cards_in_hand':
      return ctx.player.hand.cards.length;

    case 'cards_in_discard':
      return ctx.player.discard?.cards?.length || 0;

    default:
      return 0;
  }
}


// ═══════════════════════════════════════════
// Batch registration helper
// ═══════════════════════════════════════════

import { registerByName } from '../effects/effect-registry';

/**
 * Compile and register an ActionPacket into the effect registry at L2.5.
 *
 * Usage:
 *   const packet = await processCard(...);
 *   registerCompiledEffect('Charizard ex', 'Burning Darkness', packet.actionPacket);
 */
export function registerCompiledEffect(
  cardName: string,
  effectName: string,
  packet: ActionPacket,
): CardEffectDef {
  const def = compileActionPacket(cardName, effectName, packet);
  registerByName({ ...def, cardName } as CardEffectDef & { cardName: string }, 'L2.5');
  return def;
}

/**
 * Batch compile and register multiple ActionPackets.
 * Returns stats on how many were registered per type.
 */
export function registerCompiledEffects(
  entries: Array<{
    cardName: string;
    effectName: string;
    packet: ActionPacket;
  }>,
): { attacks: number; abilities: number; trainers: number; total: number } {
  const stats = { attacks: 0, abilities: 0, trainers: 0, total: 0 };

  // Group by cardName — merge multiple effects (e.g., attack + ability) into one def
  const grouped = new Map<string, CardEffectDef & { cardName: string }>();

  for (const entry of entries) {
    const compiled = compileActionPacket(entry.cardName, entry.effectName, entry.packet);
    const existing = grouped.get(entry.cardName);

    if (existing) {
      // Merge into existing def
      if (compiled.attacks) {
        existing.attacks = [...(existing.attacks || []), ...compiled.attacks];
      }
      if (compiled.abilities) {
        existing.abilities = [...(existing.abilities || []), ...compiled.abilities];
      }
      if (compiled.trainer && !existing.trainer) {
        existing.trainer = compiled.trainer;
      }
    } else {
      grouped.set(entry.cardName, { ...compiled, cardName: entry.cardName });
    }
  }

  // Register all grouped defs
  for (const def of grouped.values()) {
    registerByName(def, 'L2.5');
    if (def.attacks) stats.attacks += def.attacks.length;
    if (def.abilities) stats.abilities += (def.abilities.length);
    if (def.trainer) stats.trainers++;
    stats.total++;
  }

  return stats;
}
