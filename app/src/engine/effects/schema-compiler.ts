/**
 * Schema Compiler — converts EffectSchemaDefinition → CardEffectDef
 *
 * Takes a JSON-friendly schema definition and compiles it into a
 * fully functional CardEffectDef that can be registered in the
 * effect registry. Each pattern type maps 1:1 to EffectContext methods.
 *
 * Usage:
 *   const def = compileSchema({ cardName: "Tangela", attacks: [...] });
 *   registerByName({ ...def, cardName: "Tangela" }, "L1.5");
 */

import {
  CardEffectDef,
  AttackEffect,
  AttackResult,
  AbilityEffect,
  TrainerEffect,
  EffectContext,
} from "./effect-types";
import {
  EffectSchemaDefinition,
  AttackEffectStep,
  TrainerEffectStep,
  AbilityEffectStep,
  AttackSchema,
  AbilitySchema,
  TrainerSchema,
} from "./effect-schema";
import { CANT_ATTACK_NEXT_TURN, PREVENT_RETREAT_NEXT_TURN } from "./markers";
import { GameCard } from "../game-state";

// ═══════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════

/**
 * Compile an EffectSchemaDefinition into a CardEffectDef.
 * Returns null if the schema has no compilable effects.
 */
export function compileSchema(schema: EffectSchemaDefinition): CardEffectDef | null {
  const attacks = schema.attacks?.map(compileAttack).filter(Boolean) as AttackEffect[] | undefined;
  const abilities = schema.abilities?.map(compileAbility).filter(Boolean) as AbilityEffect[] | undefined;
  const trainer = schema.trainer ? compileTrainer(schema.trainer, schema.cardName) : undefined;

  if ((!attacks || attacks.length === 0) && (!abilities || abilities.length === 0) && !trainer) {
    return null;
  }

  const def: CardEffectDef = {
    cardId: schema.cardId || `__schema__`,
    cardName: schema.cardName,
  };

  if (attacks && attacks.length > 0) def.attacks = attacks;
  if (abilities && abilities.length > 0) def.abilities = abilities;
  if (trainer) def.trainer = trainer;

  return def;
}

// ═══════════════════════════════════════════
// Attack Compilation
// ═══════════════════════════════════════════

function compileAttack(schema: AttackSchema): AttackEffect {
  const steps = schema.effects;

  return {
    name: schema.name,
    onAttack: (ctx: EffectContext, baseDamage: number): AttackResult => {
      // Start with base result
      const result: AttackResult = { damage: baseDamage };

      // Apply each step in order
      for (const step of steps) {
        applyAttackStep(step, ctx, result, baseDamage);
      }

      return result;
    },
  };
}

function applyAttackStep(
  step: AttackEffectStep,
  ctx: EffectContext,
  result: AttackResult,
  baseDamage: number
): void {
  switch (step.type) {
    case "status_apply":
      result.statusEffects = [
        ...(result.statusEffects || []),
        { target: "defender", status: step.params.status },
      ];
      break;

    case "self_damage":
      result.selfDamage = (result.selfDamage || 0) + step.params.selfDamage;
      break;

    case "multi_coin": {
      const flips = ctx.flipCoins(step.params.coinCount);
      result.damage = step.params.damagePerHeads * flips.heads;
      break;
    }

    case "coin_flip_bonus": {
      const isHeads = ctx.flipCoin();
      if (isHeads) {
        result.damage += step.params.bonusDamage;
      }
      break;
    }

    case "coin_flip_nothing": {
      const isHeads = ctx.flipCoin();
      if (!isHeads) {
        result.damage = 0;
      }
      break;
    }

    case "coin_flip_prevent": {
      const isHeads = ctx.flipCoin();
      if (isHeads) {
        ctx.addMarker(ctx.source, "PREVENT_ALL_DAMAGE_NEXT_TURN", 1);
      }
      break;
    }

    case "cant_attack_next_turn":
      ctx.addMarker(ctx.source, CANT_ATTACK_NEXT_TURN, 1);
      break;

    case "cant_retreat_defender": {
      const defender = ctx.opponent.active;
      if (defender) {
        ctx.addMarker(defender, PREVENT_RETREAT_NEXT_TURN, 1);
      }
      result.preventRetreat = true;
      break;
    }

    case "damage_reduction_self":
      ctx.addMarker(ctx.source, `DAMAGE_REDUCTION:${step.params.reduction}`, 1);
      break;

    case "discard_energy":
      result.discardEnergy = (result.discardEnergy || 0) + step.params.count;
      break;

    case "bench_damage": {
      const { damage: benchDmg, count } = step.params;
      const targets = ctx.opponent.bench.cards.slice(0, count === -1 ? undefined : count);
      result.benchDamage = [
        ...(result.benchDamage || []),
        ...targets.map(t => ({ target: t, damage: benchDmg })),
      ];
      break;
    }

    case "per_energy_damage": {
      const energyCount = ctx.source.attachedEnergy.length;
      result.damage += step.params.damagePerEnergy * energyCount;
      break;
    }

    case "per_self_damage_counter": {
      const counters = ctx.source.damageCounters;
      result.damage += step.params.damagePerCounter * counters;
      break;
    }

    case "per_opp_damage_counter": {
      const oppCounters = ctx.opponent.active?.damageCounters ?? 0;
      result.damage += step.params.damagePerCounter * oppCounters;
      break;
    }

    case "cond_damaged_bonus":
      if (ctx.source.damageCounters > 0) {
        result.damage += step.params.bonusDamage;
      }
      break;

    case "prize_based_damage": {
      const prizesTaken = 6 - ctx.opponent.prizes.cards.length;
      result.damage += step.params.damagePerPrize * prizesTaken;
      break;
    }

    case "bench_count_damage": {
      let benchTotal = ctx.opponent.bench.cards.length;
      if (step.params.bothSides) benchTotal += ctx.player.bench.cards.length;
      result.damage += step.params.damagePerBench * benchTotal;
      break;
    }

    case "skip_weakness_resistance":
      if (step.params.skipWeakness) result.skipWeakness = true;
      if (step.params.skipResistance) result.skipResistance = true;
      break;

    case "heal_self":
      ctx.heal(step.params.amount, ctx.source);
      break;

    case "heal_all_own": {
      const allPokemon = ctx.getAllPokemon("player");
      for (const p of allPokemon) ctx.heal(step.params.amount, p);
      break;
    }

    case "heal_and_remove_status":
      ctx.heal(step.params.healAmount, ctx.source);
      ctx.removeAllStatus(ctx.source);
      break;

    case "draw_cards":
      ctx.drawCards(step.params.count, "player");
      break;

    case "draw_until": {
      const handSize = ctx.player.hand.cards.length;
      const toDraw = Math.max(0, step.params.targetHandSize - handSize);
      if (toDraw > 0) ctx.drawCards(toDraw, "player");
      break;
    }

    case "switch_self":
      if (ctx.player.bench.cards.length > 0) {
        ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
      }
      break;

    case "switch_opponent":
      if (ctx.opponent.bench.cards.length > 0) {
        ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
      }
      break;

    case "coin_discard_opp_energy": {
      const isHeads = ctx.flipCoin();
      if (isHeads && ctx.opponent.active && ctx.opponent.active.attachedEnergy.length > 0) {
        const energy = ctx.opponent.active.attachedEnergy.pop()!;
        ctx.opponent.discard.cards.push(energy);
        ctx.log(`硬币正面! 丢弃了对手 ${ctx.opponent.active.card.name} 的 ${energy.card.name}`);
      }
      break;
    }

    case "discard_opp_energy":
      if (ctx.opponent.active && ctx.opponent.active.attachedEnergy.length > 0) {
        const energy = ctx.opponent.active.attachedEnergy.pop()!;
        ctx.opponent.discard.cards.push(energy);
        ctx.log(`丢弃了对手 ${ctx.opponent.active.card.name} 的 ${energy.card.name}`);
      }
      break;

    case "discard_opp_deck": {
      const { count } = step.params;
      for (let i = 0; i < count && ctx.opponent.deck.cards.length > 0; i++) {
        const card = ctx.opponent.deck.cards.shift()!;
        ctx.opponent.discard.cards.push(card);
      }
      ctx.log(`从对手牌组顶部丢弃了 ${count} 张牌`);
      break;
    }

    case "discard_opp_hand_random": {
      const { count } = step.params;
      for (let i = 0; i < count && ctx.opponent.hand.cards.length > 0; i++) {
        const randIdx = Math.floor(Math.random() * ctx.opponent.hand.cards.length);
        const card = ctx.opponent.hand.cards.splice(randIdx, 1)[0];
        ctx.opponent.discard.cards.push(card);
      }
      break;
    }

    case "move_energy_to_bench":
      if (ctx.source.attachedEnergy.length > 0 && ctx.player.bench.cards.length > 0) {
        const energy = ctx.source.attachedEnergy[0];
        ctx.moveEnergy(ctx.source, ctx.player.bench.cards[0], energy.instanceId);
      }
      break;

    case "search_evolve_self": {
      const pokemonName = ctx.source.card.name;
      const found = ctx.searchDeck(
        (c) => c.card.supertype === "Pokémon" && c.card.evolvesFrom === pokemonName,
        1,
        "player"
      );
      if (found.length > 0) {
        ctx.addToHand(found[0], "player");
        ctx.log(`搜索到了 ${found[0].card.name} 放入手牌`);
      }
      ctx.shuffleDeck("player");
      break;
    }

    case "cond_status_bonus": {
      const hasStatus = (ctx.opponent.active?.statusConditions?.length ?? 0) > 0;
      if (hasStatus) {
        result.damage += step.params.bonusDamage;
      }
      break;
    }
  }
}

// ═══════════════════════════════════════════
// Ability Compilation
// ═══════════════════════════════════════════

function compileAbility(schema: AbilitySchema): AbilityEffect | null {
  const { effect } = schema;

  switch (effect.type) {
    // ─── Passive abilities ───
    case "passive_damage_reduction":
      return {
        name: schema.name,
        type: "passive",
        modifyIncomingDamage: (_ctx, damage) =>
          Math.max(0, damage - effect.params.amount),
      };

    case "passive_damage_boost_self":
      return {
        name: schema.name,
        type: "passive",
        modifyDamage: (_ctx, damage, isAttacker) =>
          isAttacker ? damage + effect.params.amount : damage,
      };

    case "passive_damage_boost_typed": {
      const { amount, pokemonType } = effect.params;
      return {
        name: schema.name,
        type: "passive",
        modifyDamage: (ctx, damage, isAttacker) => {
          if (!isAttacker) return damage;
          if (ctx.source.card.types?.includes(pokemonType)) {
            return damage + amount;
          }
          return damage;
        },
      };
    }

    case "passive_no_retreat_cost":
      return {
        name: schema.name,
        type: "passive",
        modifyRetreatCost: (_ctx, _cost) => 0,
      };

    case "passive_reduce_retreat":
      return {
        name: schema.name,
        type: "passive",
        modifyRetreatCost: (_ctx, cost) =>
          Math.max(0, cost - effect.params.amount),
      };

    case "passive_opp_damage_reduce":
      return {
        name: schema.name,
        type: "passive",
        modifyIncomingDamage: (_ctx, damage) =>
          Math.max(0, damage - effect.params.amount),
      };

    case "passive_prevent_bench_damage":
      return {
        name: schema.name,
        type: "passive",
        preventBenchDamage: true,
      };

    // ─── On-evolve abilities ───
    case "on_evolve_search_deck": {
      const { count } = effect.params;
      return {
        name: schema.name,
        type: "on_enter",
        onEnter: (ctx) => {
          const toDraw = Math.min(count, ctx.player.deck.cards.length);
          for (let i = 0; i < toDraw; i++) {
            const card = ctx.player.deck.cards.shift();
            if (card) ctx.player.hand.cards.push(card);
          }
          ctx.shuffleDeck("player");
          ctx.log(`${schema.name}: 从牌组搜索了 ${toDraw} 张牌到手牌`);
        },
      };
    }

    case "on_evolve_draw": {
      const { count } = effect.params;
      return {
        name: schema.name,
        type: "on_enter",
        onEnter: (ctx) => {
          ctx.drawCards(count, "player");
          ctx.log(`${schema.name}: 进化时抽了 ${count} 张牌`);
        },
      };
    }

    case "on_evolve_heal": {
      const { amount } = effect.params;
      return {
        name: schema.name,
        type: "on_enter",
        onEnter: (ctx) => {
          ctx.heal(amount, ctx.source);
          ctx.log(`${schema.name}: 进化时回复了 ${amount} 点伤害`);
        },
      };
    }

    case "on_evolve_switch_opponent":
      return {
        name: schema.name,
        type: "on_enter",
        onEnter: (ctx) => {
          if (ctx.opponent.bench.cards.length > 0) {
            const rand = Math.floor(Math.random() * ctx.opponent.bench.cards.length);
            ctx.switchOpponentActive(ctx.opponent.bench.cards[rand].instanceId);
            ctx.log(`${schema.name}: 进化时替换了对手的战斗宝可梦`);
          }
        },
      };

    case "on_evolve_discard_opp_energy":
      return {
        name: schema.name,
        type: "on_enter",
        onEnter: (ctx) => {
          if (ctx.opponent.active && ctx.opponent.active.attachedEnergy.length > 0) {
            const energy = ctx.opponent.active.attachedEnergy.pop();
            if (energy) {
              ctx.opponent.discard.cards.push(energy);
              ctx.log(`${schema.name}: 进化时丢弃了对手的 ${energy.card.name}`);
            }
          }
        },
      };

    case "on_evolve_attach_from_discard": {
      const { count } = effect.params;
      return {
        name: schema.name,
        type: "on_enter",
        onEnter: (ctx) => {
          let attached = 0;
          const discard = ctx.player.discard.cards;
          for (let i = discard.length - 1; i >= 0 && attached < count; i--) {
            if (discard[i].card.supertype === "Energy") {
              const energy = discard.splice(i, 1)[0];
              ctx.source.attachedEnergy.push(energy);
              attached++;
              ctx.log(`${schema.name}: 从弃牌堆附加了 ${energy.card.name}`);
            }
          }
        },
      };
    }

    case "on_evolve_damage_counters": {
      const { counters } = effect.params;
      return {
        name: schema.name,
        type: "on_enter",
        onEnter: (ctx) => {
          if (ctx.opponent.active) {
            ctx.opponent.active.damageCounters += counters;
            ctx.log(`${schema.name}: 进化时对 ${ctx.opponent.active.card.name} 放置了 ${counters} 个伤害指示物`);
          }
        },
      };
    }

    case "on_evolve_discard_opp_hand": {
      const { count } = effect.params;
      return {
        name: schema.name,
        type: "on_enter",
        onEnter: (ctx) => {
          for (let i = 0; i < count && ctx.opponent.hand.cards.length > 0; i++) {
            const randIdx = Math.floor(Math.random() * ctx.opponent.hand.cards.length);
            const card = ctx.opponent.hand.cards.splice(randIdx, 1)[0];
            ctx.opponent.discard.cards.push(card);
          }
          ctx.log(`${schema.name}: 进化时对手随机弃掉了 ${count} 张手牌`);
        },
      };
    }

    // ─── Activated abilities ───
    case "activated_draw": {
      const { count } = effect.params;
      return {
        name: schema.name,
        type: "activated",
        onActivate: (ctx) => {
          ctx.drawCards(count, "player");
          ctx.log(`${schema.name}: 抽了 ${count} 张牌`);
        },
      };
    }

    case "activated_draw_until": {
      const { targetHandSize } = effect.params;
      return {
        name: schema.name,
        type: "activated",
        onActivate: (ctx) => {
          const toDraw = Math.max(0, targetHandSize - ctx.player.hand.cards.length);
          if (toDraw > 0) {
            ctx.drawCards(toDraw, "player");
            ctx.log(`${schema.name}: 抽牌直到手牌达到 ${targetHandSize} 张 (抽了 ${toDraw} 张)`);
          }
        },
      };
    }

    case "activated_heal": {
      const { amount } = effect.params;
      return {
        name: schema.name,
        type: "activated",
        onActivate: (ctx) => {
          const all = ctx.getAllPokemon("player");
          const damaged = all.filter(p => p.damageCounters > 0).sort((a, b) => b.damageCounters - a.damageCounters);
          if (damaged.length > 0) {
            ctx.heal(amount, damaged[0]);
            ctx.log(`${schema.name}: 回复了 ${damaged[0].card.name} ${amount} 点伤害`);
          }
        },
      };
    }

    case "activated_search_energy_attach": {
      const energyType = effect.params.energyType || null;
      return {
        name: schema.name,
        type: "activated",
        onActivate: async (ctx) => {
          const filter = (c: GameCard) => {
            if (c.card.supertype !== "Energy") return false;
            if (!c.card.subtypes.includes("Basic")) return false;
            if (energyType && !c.card.types?.includes(energyType)) return false;
            return true;
          };
          const found = ctx.promptSearchDeck
            ? await ctx.promptSearchDeck(filter, 1, `${schema.name}: 选择一张基础能量`, "player")
            : ctx.searchDeck(filter, 1, "player");
          if (found.length > 0) {
            const target = ctx.source.damageCounters >= 0 ? ctx.source : ctx.player.active;
            if (target) {
              target.attachedEnergy.push(found[0]);
              ctx.log(`${schema.name}: 从牌组搜索 ${found[0].card.name} 附加给 ${target.card.name}`);
            }
          }
          ctx.shuffleDeck("player");
        },
      };
    }

    case "activated_move_energy":
      return {
        name: schema.name,
        type: "activated",
        onActivate: (ctx) => {
          const all = ctx.getAllPokemon("player");
          const withEnergy = all.filter(p => p.attachedEnergy.length > 0);
          const withoutEnergy = all.filter(p => p.attachedEnergy.length === 0);
          if (withEnergy.length > 0 && withoutEnergy.length > 0) {
            const source = withEnergy.sort((a, b) => b.attachedEnergy.length - a.attachedEnergy.length)[0];
            const target = withoutEnergy[0];
            const energy = source.attachedEnergy[0];
            if (energy) {
              ctx.moveEnergy(source, target, energy.instanceId);
              ctx.log(`${schema.name}: 将 ${energy.card.name} 从 ${source.card.name} 移到 ${target.card.name}`);
            }
          }
        },
      };

    case "activated_search_basic_bench": {
      const { count } = effect.params;
      return {
        name: schema.name,
        type: "activated",
        onActivate: async (ctx) => {
          const filter = (c: GameCard) =>
            c.card.supertype === "Pokémon" && c.card.subtypes.includes("Basic");
          const found = ctx.promptSearchDeck
            ? await ctx.promptSearchDeck(filter, count, `${schema.name}: 选择基础宝可梦放到备战区`, "player")
            : ctx.searchDeck(filter, count, "player");
          for (const p of found) {
            if (ctx.player.bench.cards.length < 5) {
              p.playedThisTurn = true;
              ctx.player.bench.cards.push(p);
              ctx.log(`${schema.name}: 从牌组搜索 ${p.card.name} 放到备战区`);
            }
          }
          ctx.shuffleDeck("player");
        },
      };
    }

    case "activated_look_top": {
      const { count } = effect.params;
      return {
        name: schema.name,
        type: "activated",
        onActivate: (ctx) => {
          ctx.player.deck.cards.slice(0, count);
          ctx.log(`${schema.name}: 查看了牌组顶部 ${count} 张牌`);
        },
      };
    }

    case "activated_switch_self":
      return {
        name: schema.name,
        type: "activated",
        onActivate: async (ctx) => {
          if (ctx.player.bench.cards.length > 0) {
            if (ctx.promptSwitchOwnActive) {
              await ctx.promptSwitchOwnActive(`${schema.name}: 选择备战区宝可梦切换到战斗区`);
            } else {
              ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
            }
            ctx.log(`${schema.name}: 与备战区宝可梦交换`);
          }
        },
      };

    case "activated_discard_draw": {
      const { discardCount, drawCount } = effect.params;
      return {
        name: schema.name,
        type: "activated",
        canActivate: (ctx) => ctx.player.hand.cards.length >= discardCount,
        onActivate: (ctx) => {
          for (let i = 0; i < discardCount && ctx.player.hand.cards.length > 0; i++) {
            const card = ctx.player.hand.cards.pop();
            if (card) ctx.player.discard.cards.push(card);
          }
          ctx.drawCards(drawCount, "player");
          ctx.log(`${schema.name}: 弃 ${discardCount} 张，抽 ${drawCount} 张`);
        },
      };
    }

    default:
      return null;
  }
}

// ═══════════════════════════════════════════
// Trainer Compilation
// ═══════════════════════════════════════════

function compileTrainer(schema: TrainerSchema, cardName: string): TrainerEffect {
  const steps = schema.effects;

  // Check if we need canPlay restrictions
  const hasCanPlay = steps.some(
    s => s.type === "switch_own" || s.type === "switch_opponent" || s.type === "discard_stadium"
  );

  const trainerEffect: TrainerEffect = {
    onPlay: async (ctx) => {
      for (const step of steps) {
        await applyTrainerStep(step, ctx, cardName);
      }
    },
  };

  if (hasCanPlay) {
    trainerEffect.canPlay = (ctx) => {
      for (const step of steps) {
        if (step.type === "switch_own" && ctx.player.bench.cards.length === 0) return false;
        if (step.type === "switch_opponent" && ctx.opponent.bench.cards.length === 0) return false;
        if (step.type === "discard_stadium" && ctx.getStadium() === null) return false;
        if (step.type === "search_basic_to_bench" && ctx.player.bench.cards.length >= 5) return false;
      }
      return true;
    };
  }

  return trainerEffect;
}

async function applyTrainerStep(
  step: TrainerEffectStep,
  ctx: EffectContext,
  cardName: string
): Promise<void> {
  switch (step.type) {
    case "discard_hand_draw":
      ctx.discardHand("player");
      ctx.drawCards(step.params.drawCount, "player");
      ctx.log(`${cardName}: 弃掉全部手牌，抽了 ${step.params.drawCount} 张`);
      break;

    case "shuffle_hand_draw":
      ctx.shuffleHandIntoDeck("player");
      ctx.drawCards(step.params.drawCount, "player");
      ctx.log(`${cardName}: 洗回手牌，抽了 ${step.params.drawCount} 张`);
      break;

    case "draw":
      ctx.drawCards(step.params.count, "player");
      ctx.log(`${cardName}: 抽了 ${step.params.count} 张牌`);
      break;

    case "search_basic_to_bench": {
      const { count } = step.params;
      const filter = (c: GameCard) =>
        c.card.supertype === "Pokémon" && (c.card.subtypes?.includes("Basic") ?? false);
      const found = ctx.promptSearchDeck
        ? await ctx.promptSearchDeck(filter, count, `${cardName}: 选择基础宝可梦放到备战区`, "player")
        : ctx.searchDeck(filter, count, "player");
      for (const pokemon of found) {
        if (ctx.player.bench.cards.length < 5) {
          pokemon.playedThisTurn = true;
          ctx.player.bench.cards.push(pokemon);
          ctx.log(`${cardName}: 从牌组搜索了 ${pokemon.card.name} 放到备战区`);
        }
      }
      ctx.shuffleDeck("player");
      break;
    }

    case "search_pokemon_to_hand": {
      const { count } = step.params;
      const filter = (c: GameCard) => c.card.supertype === "Pokémon";
      const found = ctx.promptSearchDeck
        ? await ctx.promptSearchDeck(filter, count, `${cardName}: 选择宝可梦加入手牌`, "player")
        : ctx.searchDeck(filter, count, "player");
      for (const c of found) ctx.addToHand(c, "player");
      ctx.shuffleDeck("player");
      ctx.log(`${cardName}: 从牌组搜索了 ${found.length} 张宝可梦到手牌`);
      break;
    }

    case "search_evolution": {
      const filter = (c: GameCard) =>
        c.card.supertype === "Pokémon" &&
        (c.card.subtypes?.includes("Stage 1") || c.card.subtypes?.includes("Stage 2") || false);
      const found = ctx.promptSearchDeck
        ? await ctx.promptSearchDeck(filter, 1, `${cardName}: 选择进化卡`, "player")
        : ctx.searchDeck(filter, 1, "player");
      if (found.length > 0) {
        ctx.addToHand(found[0], "player");
        ctx.log(`${cardName}: 搜索到 ${found[0].card.name} 放入手牌`);
      }
      ctx.shuffleDeck("player");
      break;
    }

    case "search_supporter": {
      const { count } = step.params;
      const filter = (c: GameCard) =>
        c.card.supertype === "Trainer" && (c.card.subtypes?.includes("Supporter") ?? false);
      const found = ctx.promptSearchDeck
        ? await ctx.promptSearchDeck(filter, count, `${cardName}: 选择支持者卡加入手牌`, "player")
        : ctx.searchDeck(filter, count, "player");
      for (const c of found) ctx.addToHand(c, "player");
      ctx.shuffleDeck("player");
      ctx.log(`${cardName}: 从牌组搜索了 ${found.length} 张支持者到手牌`);
      break;
    }

    case "search_any_to_hand": {
      const { count } = step.params;
      const filter = () => true;
      const found = ctx.promptSearchDeck
        ? await ctx.promptSearchDeck(filter, count, `${cardName}: 选择卡牌加入手牌`, "player")
        : ctx.searchDeck(filter, count, "player");
      for (const c of found) ctx.addToHand(c, "player");
      ctx.shuffleDeck("player");
      ctx.log(`${cardName}: 从牌组搜索了 ${found.length} 张牌到手牌`);
      break;
    }

    case "switch_own":
      if (ctx.player.bench.cards.length > 0) {
        if (ctx.promptSwitchOwnActive) {
          await ctx.promptSwitchOwnActive(`${cardName}: 选择要换上的备战区宝可梦`);
        } else {
          ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
        }
        ctx.log(`${cardName}: 换上了备战区宝可梦`);
      }
      break;

    case "switch_opponent":
      if (ctx.opponent.bench.cards.length > 0) {
        if (ctx.promptSwitchOpponentActive) {
          await ctx.promptSwitchOpponentActive(`${cardName}: 选择要拖出的对手备战区宝可梦`);
        } else {
          ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
        }
        ctx.log(`${cardName}: 拖出了对手的备战区宝可梦`);
      }
      break;

    case "heal":
      if (ctx.player.active) {
        ctx.heal(step.params.amount, ctx.player.active);
        ctx.log(`${cardName}: 治疗了 ${ctx.player.active.card.name} ${step.params.amount} 点伤害`);
      }
      break;

    case "each_shuffle_draw": {
      const { drawCount } = step.params;
      ctx.shuffleHandIntoDeck("player");
      ctx.shuffleHandIntoDeck("opponent");
      ctx.drawCards(drawCount, "player");
      ctx.drawCards(drawCount, "opponent");
      ctx.log(`${cardName}: 双方洗回手牌，各抽 ${drawCount} 张`);
      break;
    }

    case "shuffle_prizes_draw": {
      ctx.shuffleHandIntoDeck("player");
      ctx.shuffleHandIntoDeck("opponent");
      const pPrizes = ctx.player.prizes.cards.length;
      const oPrizes = ctx.opponent.prizes.cards.length;
      ctx.drawCards(pPrizes, "player");
      ctx.drawCards(oPrizes, "opponent");
      ctx.log(`${cardName}: 洗回手牌，按奖励卡数抽牌 (${pPrizes}/${oPrizes})`);
      break;
    }

    case "search_energy_to_hand": {
      const { count } = step.params;
      const filter = (c: GameCard) => c.card.supertype === "Energy";
      const found = ctx.promptSearchDeck
        ? await ctx.promptSearchDeck(filter, count, `${cardName}: 选择能量卡加入手牌`, "player")
        : ctx.searchDeck(filter, count, "player");
      for (const c of found) ctx.addToHand(c, "player");
      ctx.shuffleDeck("player");
      ctx.log(`${cardName}: 从牌组搜索了 ${found.length} 张能量卡到手牌`);
      break;
    }

    case "energy_discard_to_hand": {
      const { count } = step.params;
      const filter = (c: GameCard) => c.card.supertype === "Energy";
      const found = ctx.promptSearchDiscard
        ? await ctx.promptSearchDiscard(filter, count, `${cardName}: 选择能量卡取回手牌`, "player")
        : ctx.searchDiscard(filter, count, "player");
      for (const c of found) ctx.addToHand(c, "player");
      ctx.log(`${cardName}: 从弃牌堆取回了 ${found.length} 张能量到手牌`);
      break;
    }

    case "attach_energy_from_discard": {
      const { count } = step.params;
      const target = ctx.player.active;
      if (target) {
        ctx.attachEnergyFromDiscard(
          (c) => c.card.supertype === "Energy",
          count,
          target
        );
      }
      ctx.log(`${cardName}: 从弃牌堆附加能量`);
      break;
    }

    case "recover_from_discard": {
      const { count, filterType } = step.params;
      const filter = (c: GameCard) => {
        switch (filterType) {
          case "pokemon": return c.card.supertype === "Pokémon";
          case "trainer": return c.card.supertype === "Trainer";
          case "energy": return c.card.supertype === "Energy";
          case "pokemon_or_energy": return c.card.supertype === "Pokémon" || c.card.supertype === "Energy";
          case "any": return true;
          default: return true;
        }
      };
      const found = ctx.promptSearchDiscard
        ? await ctx.promptSearchDiscard(filter, count, `${cardName}: 选择要取回的卡牌`, "player")
        : ctx.searchDiscard(filter, count, "player");
      for (const c of found) ctx.addToHand(c, "player");
      ctx.log(`${cardName}: 从弃牌堆取回了 ${found.length} 张牌到手牌`);
      break;
    }

    case "discard_stadium":
      ctx.removeStadium();
      ctx.log(`${cardName}: 移除了场地卡`);
      break;

    case "discard_opp_hand_random": {
      const { count } = step.params;
      for (let i = 0; i < count && ctx.opponent.hand.cards.length > 0; i++) {
        const randIdx = Math.floor(Math.random() * ctx.opponent.hand.cards.length);
        const c = ctx.opponent.hand.cards.splice(randIdx, 1)[0];
        ctx.opponent.discard.cards.push(c);
      }
      ctx.log(`${cardName}: 对手随机丢弃了 ${count} 张手牌`);
      break;
    }

    case "opp_shuffle_draw": {
      const { drawCount } = step.params;
      ctx.shuffleHandIntoDeck("opponent");
      ctx.drawCards(drawCount, "opponent");
      ctx.log(`${cardName}: 对手洗回手牌，抽了 ${drawCount} 张`);
      break;
    }
  }
}
