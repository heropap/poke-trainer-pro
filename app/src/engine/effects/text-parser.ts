/**
 * Text-Based Effect Parser (Layer 3 / P2)
 *
 * Parses card rules text and attack descriptions to auto-generate
 * CardEffectDef registrations. Covers ~35 common PTCG text patterns
 * using regex matching and heuristic mapping to EffectContext methods.
 *
 * This is a "best effort" system — it will miss complex multi-step
 * effects, but catches the most common patterns (draw, discard, search,
 * damage modifiers, status application, coin flips, turn restrictions, etc.)
 *
 * Pattern coverage breakdown:
 *   Attack patterns: ~20 (status, self-damage, coin flip, discard energy,
 *     bench damage, per-energy, heal self, multi-coin, can't attack/retreat,
 *     damage counter based, damage reduction, draw cards, switch self,
 *     discard opponent energy, skip weakness/resistance, prize-based,
 *     heal all, discard opponent deck, recover status, conditional bonus)
 *   Trainer patterns: ~15 (draw, discard-draw, search basic/any/energy/pokemon/evolution,
 *     switch, heal, shuffle-draw, shuffle-prizes, energy from discard,
 *     recover from discard, opponent switch, discard stadium, discard opponent hand)
 */

import { Card, CardAttack, CardAbility } from "@/types/card";
import { CardEffectDef, AttackEffect, AttackResult, TrainerEffect, AbilityEffect, EffectContext } from "./effect-types";
import { registerByName, hasEffect, EffectSourceLayer } from "./effect-registry";
import { StatusCondition, GameCard } from "../game-state";
import { CANT_ATTACK_NEXT_TURN, PREVENT_RETREAT_NEXT_TURN } from "./markers";

// ═══════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════

/**
 * Attempt to parse a Card's text fields and generate a CardEffectDef.
 * Returns null if no parseable patterns are found.
 */
export function parseCardEffects(card: Card): CardEffectDef | null {
  const attacks = parseAttackEffects(card);
  const trainer = parseTrainerEffect(card);
  const abilities = parseAbilityEffects(card);

  if (attacks.length === 0 && !trainer && abilities.length === 0) {
    return null;
  }

  const def: CardEffectDef = {
    cardId: `__text_parsed__`,
    cardName: card.name,
  };

  if (attacks.length > 0) def.attacks = attacks;
  if (trainer) def.trainer = trainer;
  if (abilities.length > 0) def.abilities = abilities;

  return def;
}

/**
 * Auto-register text-parsed effects for cards that don't already
 * have a registered effect (by ID or name).
 *
 * @param cards Array of Card data to parse
 * @returns Count of registered and skipped cards
 */
export function autoRegisterTextEffects(cards: Card[], source: EffectSourceLayer = "L4"): { registered: number; skipped: number } {
  let registered = 0;
  let skipped = 0;

  // Deduplicate by name to avoid re-parsing reprints
  const seen = new Set<string>();

  for (const card of cards) {
    // Skip if already registered
    if (hasEffect(card.id, card.name)) {
      skipped++;
      continue;
    }

    // Skip if already processed this name
    if (seen.has(card.name)) {
      skipped++;
      continue;
    }
    seen.add(card.name);

    const def = parseCardEffects(card);
    if (def) {
      registerByName({ ...def, cardName: card.name }, source);
      registered++;
    } else {
      skipped++;
    }
  }

  if (registered > 0) {
    console.log(`[TextParser] Auto-registered ${registered} effects from card text (${skipped} skipped)`);
  }

  return { registered, skipped };
}

// ═══════════════════════════════════════════
// Attack Effect Parsing
// ═══════════════════════════════════════════

function parseAttackEffects(card: Card): AttackEffect[] {
  if (!card.attacks || card.supertype !== "Pokémon") return [];

  const effects: AttackEffect[] = [];

  for (const attack of card.attacks) {
    const effect = parseOneAttack(attack);
    if (effect) {
      effects.push(effect);
    }
  }

  return effects;
}

function parseOneAttack(attack: CardAttack): AttackEffect | null {
  const text = attack.text || "";
  if (!text) return null;

  const baseDmg = parseInt(attack.damage, 10) || 0;

  // ─── Pattern: Status application ───
  // "The Defending Pokémon is now Poisoned."
  const statusMatch = text.match(
    /(?:Defending|Active) Pok[eé]mon is now (Poisoned|Burned|Asleep|Confused|Paralyzed)/i
  );
  if (statusMatch) {
    const statusStr = statusMatch[1].toLowerCase() as StatusCondition;
    return {
      name: attack.name,
      onAttack: (_ctx, damage) => ({
        damage: damage || baseDmg,
        statusEffects: [{ target: "defender", status: statusStr }],
      }),
    };
  }

  // ─── Pattern: Self-damage ───
  // "This Pokémon also does 30 damage to itself."
  const selfDmgMatch = text.match(
    /this Pok[eé]mon (?:also )?does (\d+) damage to itself/i
  );
  if (selfDmgMatch) {
    const selfDmg = parseInt(selfDmgMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (_ctx, damage) => ({
        damage: damage || baseDmg,
        selfDamage: selfDmg,
      }),
    };
  }

  // ─── Pattern: Multi-coin flip × damage ─── [NEW]
  // "Flip 3 coins. This attack does 10 damage for each heads."
  // "Flip 2 coins. This attack does 40 damage for each heads."
  const multiCoinMatch = text.match(
    /[Ff]lip (\d+) coins?\.\s*This attack does (\d+) (?:damage )?(?:times )?for each heads/i
  );
  if (multiCoinMatch) {
    const coinCount = parseInt(multiCoinMatch[1], 10);
    const perHeads = parseInt(multiCoinMatch[2], 10);
    return {
      name: attack.name,
      onAttack: (ctx, _damage) => {
        const result = ctx.flipCoins(coinCount);
        return { damage: perHeads * result.heads };
      },
    };
  }

  // ─── Pattern: Coin flip — extra damage ───
  // "Flip a coin. If heads, this attack does 30 more damage."
  const coinExtraMatch = text.match(
    /[Ff]lip a coin\. If heads,? this attack does (\d+) more damage/i
  );
  if (coinExtraMatch) {
    const extraDmg = parseInt(coinExtraMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const isHeads = ctx.flipCoin();
        return {
          damage: (damage || baseDmg) + (isHeads ? extraDmg : 0),
        };
      },
    };
  }

  // ─── Pattern: Coin flip — attack does nothing on tails ───
  // "Flip a coin. If tails, this attack does nothing."
  const coinNothingMatch = text.match(
    /[Ff]lip a coin\. If tails,? this attack does nothing/i
  );
  if (coinNothingMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const isHeads = ctx.flipCoin();
        return { damage: isHeads ? (damage || baseDmg) : 0 };
      },
    };
  }

  // ─── Pattern: Coin flip — prevent damage on heads ─── [NEW]
  // "Flip a coin. If heads, prevent all damage done to this Pokémon during your opponent's next turn."
  const coinPreventMatch = text.match(
    /[Ff]lip a coin\.\s*If heads,?\s*(?:during your opponent'?s? next turn,?\s*)?prevent all (?:damage|effects)/i
  );
  if (coinPreventMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const isHeads = ctx.flipCoin();
        if (isHeads) {
          // Use a damage reduction marker — the engine checks this
          ctx.addMarker(ctx.source, "PREVENT_ALL_DAMAGE_NEXT_TURN", 1);
        }
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Can't attack next turn ─── [NEW]
  // "During your next turn, this Pokémon can't attack."
  const cantAttackMatch = text.match(
    /[Dd]uring your next turn,?\s*this Pok[eé]mon can'?t (?:attack|use attacks?)/i
  );
  if (cantAttackMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        ctx.addMarker(ctx.source, CANT_ATTACK_NEXT_TURN, 1);
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Can't retreat next turn ─── [NEW]
  // "During your opponent's next turn, the Defending Pokémon can't retreat."
  const cantRetreatMatch = text.match(
    /(?:Defending|Active) Pok[eé]mon can'?t retreat/i
  );
  if (cantRetreatMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const defender = ctx.opponent.active;
        if (defender) {
          ctx.addMarker(defender, PREVENT_RETREAT_NEXT_TURN, 1);
        }
        return {
          damage: damage || baseDmg,
          preventRetreat: true,
        };
      },
    };
  }

  // ─── Pattern: Damage reduction next turn ─── [NEW]
  // "During your opponent's next turn, this Pokémon takes 30 less damage from attacks"
  const dmgReductionMatch = text.match(
    /this Pok[eé]mon takes (\d+) less damage.*(?:next turn|attacks)/i
  );
  if (dmgReductionMatch) {
    const reduction = parseInt(dmgReductionMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        ctx.addMarker(ctx.source, `DAMAGE_REDUCTION:${reduction}`, 1);
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Discard energy ───
  // "Discard 2 Fire Energy from this Pokémon."
  // "Discard an Energy from this Pokémon."
  const discardEnergyMatch = text.match(
    /[Dd]iscard (\d+|an?|all) (?:\w+ )?[Ee]nergy (?:cards? )?(?:attached to|from) this Pok[eé]mon/i
  );
  if (discardEnergyMatch) {
    const countStr = discardEnergyMatch[1];
    const discardCount = (countStr === "a" || countStr === "an") ? 1 :
      countStr === "all" ? 99 : parseInt(countStr, 10);
    return {
      name: attack.name,
      onAttack: (_ctx, damage) => ({
        damage: damage || baseDmg,
        discardEnergy: discardCount,
      }),
    };
  }

  // ─── Pattern: Bench damage ───
  // "This attack does 20 damage to 1 of your opponent's Benched Pokémon."
  // "This attack also does 10 damage to each of your opponent's Benched Pokémon."
  const benchDmgMatch = text.match(
    /(?:this attack |also )?does? (\d+) damage to (?:(\d+) of |each of )?your opponent'?s? [Bb]enched/i
  );
  if (benchDmgMatch) {
    const benchDmg = parseInt(benchDmgMatch[1], 10);
    const benchCount = benchDmgMatch[2] ? parseInt(benchDmgMatch[2], 10) : -1; // -1 = all

    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const benchTargets = ctx.opponent.bench.cards.slice(0, benchCount === -1 ? undefined : benchCount);
        return {
          damage: damage || baseDmg,
          benchDamage: benchTargets.map(t => ({ target: t, damage: benchDmg })),
        };
      },
    };
  }

  // ─── Pattern: Damage × energy count ───
  // "This attack does 20 damage for each Energy attached to this Pokémon."
  const perEnergyMatch = text.match(
    /this attack does (\d+) (?:more )?damage for each (?:\w+ )?[Ee]nergy attached/i
  );
  if (perEnergyMatch) {
    const perEnergy = parseInt(perEnergyMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const energyCount = ctx.source.attachedEnergy.length;
        return { damage: (damage || baseDmg) + perEnergy * energyCount };
      },
    };
  }

  // ─── Pattern: Damage per damage counter on self ─── [NEW]
  // "This attack does 10 more damage for each damage counter on this Pokémon."
  // "This attack does 20 damage for each damage counter on this Pokémon."
  const perSelfDmgCounterMatch = text.match(
    /this attack does (\d+) (?:more )?damage for each damage counter on this Pok[eé]mon/i
  );
  if (perSelfDmgCounterMatch) {
    const perCounter = parseInt(perSelfDmgCounterMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const counters = ctx.source.damageCounters;
        return { damage: (damage || baseDmg) + perCounter * counters };
      },
    };
  }

  // ─── Pattern: Damage per damage counter on opponent ─── [NEW]
  // "This attack does 10 more damage for each damage counter on your opponent's Active Pokémon."
  const perOppDmgCounterMatch = text.match(
    /this attack does (\d+) (?:more )?damage for each damage counter on your opponent'?s? [Aa]ctive/i
  );
  if (perOppDmgCounterMatch) {
    const perCounter = parseInt(perOppDmgCounterMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const counters = ctx.opponent.active?.damageCounters ?? 0;
        return { damage: (damage || baseDmg) + perCounter * counters };
      },
    };
  }

  // ─── Pattern: Conditional bonus if damaged ─── [NEW]
  // "If this Pokémon has any damage counters on it, this attack does 100 more damage."
  const condDamagedMatch = text.match(
    /if this Pok[eé]mon has any damage counter.*this attack does (\d+) more damage/i
  );
  if (condDamagedMatch) {
    const bonusDmg = parseInt(condDamagedMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const hasDamage = ctx.source.damageCounters > 0;
        return { damage: (damage || baseDmg) + (hasDamage ? bonusDmg : 0) };
      },
    };
  }

  // ─── Pattern: Prize-based damage ─── [NEW]
  // "This attack does 30 more damage for each Prize card your opponent has taken."
  const prizeBasedMatch = text.match(
    /this attack does (\d+) (?:more )?damage for each [Pp]rize card your opponent has taken/i
  );
  if (prizeBasedMatch) {
    const perPrize = parseInt(prizeBasedMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const prizesTaken = 6 - ctx.opponent.prizes.cards.length;
        return { damage: (damage || baseDmg) + perPrize * prizesTaken };
      },
    };
  }

  // ─── Pattern: Bench count damage ─── [NEW]
  // "This attack does 20 more damage for each of your opponent's Benched Pokémon."
  // "This attack does 20 more damage for each Benched Pokémon (both yours and your opponent's)."
  const benchCountDmgMatch = text.match(
    /this attack does (\d+) (?:more )?damage for each (?:of your opponent'?s? )?[Bb]enched Pok[eé]mon(?: \(both yours and your opponent'?s?\))?/i
  );
  if (benchCountDmgMatch) {
    const perBench = parseInt(benchCountDmgMatch[1], 10);
    const bothSides = /both yours and your opponent/i.test(text);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        let benchTotal = ctx.opponent.bench.cards.length;
        if (bothSides) benchTotal += ctx.player.bench.cards.length;
        return { damage: (damage || baseDmg) + perBench * benchTotal };
      },
    };
  }

  // ─── Pattern: Skip weakness/resistance ─── [NEW]
  // "Don't apply Weakness and Resistance for this attack."
  // "This attack's damage isn't affected by Weakness or Resistance"
  // "This attack's damage isn't affected by Resistance."
  const skipWeakResMatch = text.match(
    /(?:Don'?t apply|isn'?t affected by) (Weakness(?:\s*(?:or|and)\s*Resistance)?|Resistance)/i
  );
  if (skipWeakResMatch) {
    const what = skipWeakResMatch[1].toLowerCase();
    const skipWeak = what.includes("weakness");
    const skipRes = what.includes("resistance");
    return {
      name: attack.name,
      onAttack: (_ctx, damage) => ({
        damage: damage || baseDmg,
        skipWeakness: skipWeak || undefined,
        skipResistance: skipRes || undefined,
      }),
    };
  }

  // ─── Pattern: Heal self ───
  // "Heal 30 damage from this Pokémon."
  const healSelfMatch = text.match(
    /[Hh]eal (\d+) damage from this Pok[eé]mon/i
  );
  if (healSelfMatch) {
    const healAmt = parseInt(healSelfMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        ctx.heal(healAmt, ctx.source);
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Heal all own Pokemon ─── [NEW]
  // "Heal 30 damage from each of your Pokémon."
  const healAllMatch = text.match(
    /[Hh]eal (\d+) damage from each of your Pok[eé]mon/i
  );
  if (healAllMatch) {
    const healAmt = parseInt(healAllMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const allPokemon = ctx.getAllPokemon("player");
        for (const p of allPokemon) ctx.heal(healAmt, p);
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Heal self + remove special conditions ─── [NEW]
  // "Heal X damage from this Pokémon. This Pokémon recovers from all Special Conditions."
  const healAndRemoveStatusMatch = text.match(
    /[Hh]eal (\d+) damage.*(?:recover|remove).*(?:[Ss]pecial [Cc]ondition|all status)/i
  );
  if (healAndRemoveStatusMatch) {
    const healAmt = parseInt(healAndRemoveStatusMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        ctx.heal(healAmt, ctx.source);
        ctx.removeAllStatus(ctx.source);
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Draw cards (as attack effect) ─── [NEW]
  // "Draw a card." / "Draw 2 cards." / "Draw 3 cards."
  const drawAttackMatch = text.match(
    /[Dd]raw (\d+|a) cards?\./i
  );
  if (drawAttackMatch) {
    const drawCount = drawAttackMatch[1] === "a" ? 1 : parseInt(drawAttackMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        ctx.drawCards(drawCount, "player");
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Draw until N cards in hand ─── [NEW]
  // "You may draw cards until you have 6 cards in your hand."
  const drawUntilMatch = text.match(
    /draw cards? until you have (\d+) cards? in your hand/i
  );
  if (drawUntilMatch) {
    const targetCount = parseInt(drawUntilMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const handSize = ctx.player.hand.cards.length;
        const toDraw = Math.max(0, targetCount - handSize);
        if (toDraw > 0) ctx.drawCards(toDraw, "player");
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Switch self to bench ─── [NEW]
  // "Switch this Pokémon with 1 of your Benched Pokémon."
  const switchSelfMatch = text.match(
    /[Ss]witch this Pok[eé]mon with (?:\d+ of )?your [Bb]enched/i
  );
  if (switchSelfMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        if (ctx.player.bench.cards.length > 0) {
          ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
        }
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Switch opponent's active ─── [NEW]
  // "Switch out your opponent's Active Pokémon to the Bench."
  const switchOppMatch = text.match(
    /[Ss]witch (?:out )?your opponent'?s? [Aa]ctive Pok[eé]mon/i
  );
  if (switchOppMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        if (ctx.opponent.bench.cards.length > 0) {
          ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
        }
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Discard opponent's energy (coin) ─── [NEW]
  // "Flip a coin. If heads, discard an Energy from your opponent's Active Pokémon."
  const coinDiscardOppEnergyMatch = text.match(
    /[Ff]lip a coin\.\s*If heads,?\s*discard (\d+|an?) (?:\w+ )?[Ee]nergy from your opponent/i
  );
  if (coinDiscardOppEnergyMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const isHeads = ctx.flipCoin();
        if (isHeads && ctx.opponent.active && ctx.opponent.active.attachedEnergy.length > 0) {
          const energy = ctx.opponent.active.attachedEnergy.pop()!;
          ctx.opponent.discard.cards.push(energy);
          ctx.log(`硬币正面! 丢弃了对手 ${ctx.opponent.active.card.name} 的 ${energy.card.name}`);
        }
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Discard opponent's energy (no coin) ─── [NEW]
  // "Discard an Energy from your opponent's Active Pokémon."
  const discardOppEnergyMatch = text.match(
    /[Dd]iscard (\d+|an?) (?:\w+ )?[Ee]nergy from your opponent'?s? [Aa]ctive/i
  );
  if (discardOppEnergyMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        if (ctx.opponent.active && ctx.opponent.active.attachedEnergy.length > 0) {
          const energy = ctx.opponent.active.attachedEnergy.pop()!;
          ctx.opponent.discard.cards.push(energy);
          ctx.log(`丢弃了对手 ${ctx.opponent.active.card.name} 的 ${energy.card.name}`);
        }
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Discard opponent's deck ─── [NEW]
  // "Discard the top N card(s) of your opponent's deck."
  const discardOppDeckMatch = text.match(
    /[Dd]iscard the top (\d+) cards? of your opponent'?s? deck/i
  );
  if (discardOppDeckMatch) {
    const discardCount = parseInt(discardOppDeckMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        for (let i = 0; i < discardCount && ctx.opponent.deck.cards.length > 0; i++) {
          const card = ctx.opponent.deck.cards.shift()!;
          ctx.opponent.discard.cards.push(card);
        }
        ctx.log(`从对手牌组顶部丢弃了 ${discardCount} 张牌`);
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Discard random from opponent's hand ─── [NEW]
  // "Discard a random card from your opponent's hand."
  const discardOppHandMatch = text.match(
    /[Dd]iscard (?:a|(\d+)) random cards? from your opponent'?s? hand/i
  );
  if (discardOppHandMatch) {
    const discardCount = discardOppHandMatch[1] ? parseInt(discardOppHandMatch[1], 10) : 1;
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        for (let i = 0; i < discardCount && ctx.opponent.hand.cards.length > 0; i++) {
          const randIdx = Math.floor(Math.random() * ctx.opponent.hand.cards.length);
          const card = ctx.opponent.hand.cards.splice(randIdx, 1)[0];
          ctx.opponent.discard.cards.push(card);
        }
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Move energy to bench ─── [NEW]
  // "Move an Energy from this Pokémon to 1 of your Benched Pokémon."
  const moveEnergyToBenchMatch = text.match(
    /[Mm]ove (?:an?|\d+) [Ee]nergy from this Pok[eé]mon to.*[Bb]enched/i
  );
  if (moveEnergyToBenchMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        if (ctx.source.attachedEnergy.length > 0 && ctx.player.bench.cards.length > 0) {
          const energy = ctx.source.attachedEnergy[0];
          ctx.moveEnergy(ctx.source, ctx.player.bench.cards[0], energy.instanceId);
        }
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Search deck for Basic Pokemon → bench (as attack) ─── [NEW]
  // "Search your deck for up to 2 Basic Pokémon and put them onto your Bench."
  // "Search your deck for a Basic Pokémon and put it onto your Bench."
  // Matches: Pidgey's Call for Family, Emolga's Call for Family, etc.
  const searchBenchMatch = text.match(
    /[Ss]earch your deck for (?:a|up to (\d+)) [Bb]asic Pok[eé]mon.*(?:put (?:them|it) onto|place (?:them|it) on) your [Bb]ench/i
  );
  if (searchBenchMatch) {
    const benchCount = searchBenchMatch[1] ? parseInt(searchBenchMatch[1], 10) : 1;
    return {
      name: attack.name,
      onAttack: (ctx, _damage) => {
        const filter = (c: GameCard) =>
          c.card.supertype === "Pokémon" && (c.card.subtypes?.includes("Basic") ?? false);
        const maxSearch = Math.min(benchCount, 5 - ctx.player.bench.cards.length);
        if (maxSearch <= 0) {
          ctx.log(`${attack.name}: 备战区已满`);
          return { damage: 0 };
        }
        // Use synchronous searchDeck (auto-selects first N matches)
        // Interactive selection happens via the prompt system at a higher level
        const found = ctx.searchDeck(filter, maxSearch, "player");
        for (const pokemon of found) {
          if (ctx.player.bench.cards.length < 5) {
            pokemon.playedThisTurn = true;
            ctx.player.bench.cards.push(pokemon);
            ctx.log(`${attack.name}: 从牌组搜索了 ${pokemon.card.name} 放到备战区`);
          }
        }
        ctx.shuffleDeck("player");
        return { damage: 0 }; // Call for Family does 0 damage
      },
    };
  }

  // ─── Pattern: Search deck for evolution (as attack) ─── [NEW]
  // "Search your deck for a card that evolves from this Pokémon and put it onto this Pokémon to evolve it."
  const searchEvolveMatch = text.match(
    /[Ss]earch your deck for.*(?:evolves from|evolution of) this Pok[eé]mon/i
  );
  if (searchEvolveMatch) {
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
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
        return { damage: damage || baseDmg };
      },
    };
  }

  // ─── Pattern: Recover from discard (as attack) ─── [NEW]
  // "Put an Item card from your discard pile into your hand." (Rotom's Junk Hunt)
  // "Put a Pokémon from your discard pile into your hand."
  const attackRecoverFromDiscardMatch = text.match(
    /[Pp]ut (?:up to )?(\d+|an?)\s+(\w[\w\s]*?)\s+cards?\s+from your discard pile into your hand/i
  );
  if (attackRecoverFromDiscardMatch) {
    const countStr = attackRecoverFromDiscardMatch[1];
    const count = (countStr === "a" || countStr === "an") ? 1 : parseInt(countStr, 10);
    const typeStr = attackRecoverFromDiscardMatch[2].toLowerCase();
    return {
      name: attack.name,
      onAttack: (ctx, _damage) => {
        const filter = (c: GameCard) => {
          if (typeStr.includes("item")) return c.card.supertype === "Trainer" && c.card.subtypes.includes("Item");
          if (typeStr.includes("pok")) return c.card.supertype === "Pokémon";
          if (typeStr.includes("energy")) return c.card.supertype === "Energy";
          if (typeStr.includes("trainer") || typeStr.includes("supporter")) return c.card.supertype === "Trainer";
          return true; // "card" = any card
        };
        const found = ctx.searchDiscard(filter, count, "player");
        for (const c of found) ctx.addToHand(c, "player");
        if (found.length > 0) {
          ctx.log(`${attack.name}: 从弃牌堆取回了 ${found.map(c => c.card.name).join(", ")} 到手牌`);
        }
        return { damage: 0 }; // These attacks typically do 0 damage
      },
    };
  }

  // ─── Pattern: Conditional bonus vs special condition ─── [NEW]
  // "If your opponent's Active Pokémon is affected by a Special Condition, this attack does 120 more damage."
  const condStatusBonusMatch = text.match(
    /if your opponent'?s? [Aa]ctive.*(?:affected by|has) (?:a )?[Ss]pecial [Cc]ondition.*this attack does (\d+) more damage/i
  );
  if (condStatusBonusMatch) {
    const bonusDmg = parseInt(condStatusBonusMatch[1], 10);
    return {
      name: attack.name,
      onAttack: (ctx, damage) => {
        const hasStatus = (ctx.opponent.active?.statusConditions?.length ?? 0) > 0;
        return { damage: (damage || baseDmg) + (hasStatus ? bonusDmg : 0) };
      },
    };
  }

  return null;
}

// ═══════════════════════════════════════════
// Ability Effect Parsing
// ═══════════════════════════════════════════

function parseAbilityEffects(card: Card): AbilityEffect[] {
  if (!card.abilities || card.supertype !== "Pokémon") return [];

  const effects: AbilityEffect[] = [];

  for (const ability of card.abilities) {
    const effect = parseOneAbility(ability);
    if (effect) {
      effects.push(effect);
    }
  }

  return effects;
}

function parseOneAbility(ability: CardAbility): AbilityEffect | null {
  const text = ability.text || "";
  if (!text) return null;

  // ──────────────────────────────────────
  // PASSIVE ABILITIES (always-on effects)
  // ──────────────────────────────────────

  // ─── Pattern: Damage reduction (passive) ───
  // "This Pokémon takes 30 less damage from attacks"
  // "takes 20 less damage from attacks from your opponent's Pokémon"
  const dmgReduceMatch = text.match(
    /(?:this Pok[eé]mon|takes?) (\d+) less damage (?:from attacks?)/i
  );
  if (dmgReduceMatch) {
    const reduction = parseInt(dmgReduceMatch[1], 10);
    return {
      name: ability.name,
      type: "passive",
      modifyIncomingDamage: (_ctx, damage) => Math.max(0, damage - reduction),
    };
  }

  // ─── Pattern: Damage boost (passive, for this Pokemon) ───
  // "attacks used by this Pokémon do 30 more damage"
  const dmgBoostSelfMatch = text.match(
    /attacks? used by this Pok[eé]mon (?:do|does|deal) (\d+) more damage/i
  );
  if (dmgBoostSelfMatch) {
    const boost = parseInt(dmgBoostSelfMatch[1], 10);
    return {
      name: ability.name,
      type: "passive",
      modifyDamage: (_ctx, damage, isAttacker) => isAttacker ? damage + boost : damage,
    };
  }

  // ─── Pattern: Damage boost (passive, for typed Pokemon) ───
  // "Attacks used by your Fire Pokémon do 30 more damage"
  // "Attacks used by your Fighting Pokémon do 30 more damage"
  const dmgBoostTypedMatch = text.match(
    /[Aa]ttacks? used by your (\w+) Pok[eé]mon (?:do|does|deal) (\d+) more damage/i
  );
  if (dmgBoostTypedMatch) {
    const targetType = dmgBoostTypedMatch[1];
    const boost = parseInt(dmgBoostTypedMatch[2], 10);
    return {
      name: ability.name,
      type: "passive",
      modifyDamage: (ctx, damage, isAttacker) => {
        if (!isAttacker) return damage;
        // Only boost if the attacking Pokemon is the specified type
        if (ctx.source.card.types?.includes(targetType)) {
          return damage + boost;
        }
        return damage;
      },
    };
  }

  // ─── Pattern: No retreat cost (passive) ───
  // "This Pokémon has no Retreat Cost." / "has no Retreat Cost"
  // "If this Pokémon has no Energy attached, it has no Retreat Cost."
  const noRetreatMatch = text.match(
    /(?:this Pok[eé]mon )?has no Retreat Cost/i
  );
  if (noRetreatMatch) {
    return {
      name: ability.name,
      type: "passive",
      modifyRetreatCost: (_ctx, _cost) => 0,
    };
  }

  // ─── Pattern: Reduce retreat cost (passive) ───
  // "This Pokémon's Retreat Cost is 1 less" / "Retreat Cost is Colorless less"
  const reduceRetreatMatch = text.match(
    /[Rr]etreat [Cc]ost is (\d+|Colorless) less/i
  );
  if (reduceRetreatMatch) {
    const amount = reduceRetreatMatch[1] === "Colorless" ? 1 : parseInt(reduceRetreatMatch[1], 10);
    return {
      name: ability.name,
      type: "passive",
      modifyRetreatCost: (_ctx, cost) => Math.max(0, cost - amount),
    };
  }

  // ─── Pattern: Opponent attacks do less damage (passive, active only) ───
  // "attacks used by your opponent's Active Pokémon do 30 less damage"
  const oppDmgReduceMatch = text.match(
    /attacks? used by your opponent'?s?.*do (\d+) less damage/i
  );
  if (oppDmgReduceMatch) {
    const reduction = parseInt(oppDmgReduceMatch[1], 10);
    return {
      name: ability.name,
      type: "passive",
      modifyIncomingDamage: (_ctx, damage) => Math.max(0, damage - reduction),
    };
  }

  // ─── Pattern: Prevent bench damage (passive) ───
  // "Prevent all damage done to your Benched Pokémon by attacks"
  const preventBenchMatch = text.match(
    /[Pp]revent all damage done to your [Bb]enched Pok[eé]mon by attacks/i
  );
  if (preventBenchMatch) {
    return {
      name: ability.name,
      type: "passive",
      preventBenchDamage: true,
    };
  }

  // ──────────────────────────────────────
  // ON-EVOLVE / ON-ENTER (must be checked BEFORE generic activated patterns)
  // ──────────────────────────────────────

  // Check if this is an on-evolve ability (to route correctly)
  const isOnEvolveAbility = /when you play this.*(?:from your hand )?to evolve/i.test(text);

  if (isOnEvolveAbility) {
    // ─── Pattern: On-evolve search deck for cards ───
    const evolveSearchMatch = text.match(
      /[Ss]earch your deck for (?:up to )?(\d+) cards?.*(?:put|add).*(?:into|to) your hand/i
    );
    if (evolveSearchMatch) {
      const searchCount = parseInt(evolveSearchMatch[1], 10);
      return {
        name: ability.name,
        type: "on_enter" as const,
        onEnter: (ctx) => {
          const toDraw = Math.min(searchCount, ctx.player.deck.cards.length);
          for (let i = 0; i < toDraw; i++) {
            const card = ctx.player.deck.cards.shift();
            if (card) ctx.player.hand.cards.push(card);
          }
          ctx.shuffleDeck("player");
          ctx.log(`${ability.name}: 从牌组搜索了 ${toDraw} 张牌到手牌`);
        },
      };
    }

    // ─── Pattern: On-evolve draw cards ───
    const evolveDrawMatch = text.match(/[Dd]raw (\d+) cards?/i);
    if (evolveDrawMatch) {
      const drawCount = parseInt(evolveDrawMatch[1], 10);
      return {
        name: ability.name,
        type: "on_enter" as const,
        onEnter: (ctx) => {
          ctx.drawCards(drawCount, "player");
          ctx.log(`${ability.name}: 进化时抽了 ${drawCount} 张牌`);
        },
      };
    }

    // ─── Pattern: On-evolve heal ───
    const evolveHealMatch = text.match(/[Hh]eal (\d+) damage/i);
    if (evolveHealMatch) {
      const healAmt = parseInt(evolveHealMatch[1], 10);
      return {
        name: ability.name,
        type: "on_enter" as const,
        onEnter: (ctx) => {
          ctx.heal(healAmt, ctx.source);
          ctx.log(`${ability.name}: 进化时回复了 ${healAmt} 点伤害`);
        },
      };
    }

    // ─── Pattern: On-evolve switch opponent active ───
    const evolveSwitchOppMatch = text.match(/switch.*opponent/i);
    if (evolveSwitchOppMatch) {
      return {
        name: ability.name,
        type: "on_enter" as const,
        onEnter: (ctx) => {
          if (ctx.opponent.bench.cards.length > 0) {
            const rand = Math.floor(Math.random() * ctx.opponent.bench.cards.length);
            ctx.switchOpponentActive(ctx.opponent.bench.cards[rand].instanceId);
            ctx.log(`${ability.name}: 进化时替换了对手的战斗宝可梦`);
          }
        },
      };
    }

    // ─── Pattern: On-evolve discard energy from opponent ───
    const evolveDiscardEnergyMatch = text.match(/discard (?:an?|\d+) (?:\w+ )?[Ee]nergy from your opponent/i);
    if (evolveDiscardEnergyMatch) {
      return {
        name: ability.name,
        type: "on_enter" as const,
        onEnter: (ctx) => {
          if (ctx.opponent.active && ctx.opponent.active.attachedEnergy.length > 0) {
            const energy = ctx.opponent.active.attachedEnergy.pop();
            if (energy) {
              ctx.opponent.discard.cards.push(energy);
              ctx.log(`${ability.name}: 进化时丢弃了对手的 ${energy.card.name}`);
            }
          }
        },
      };
    }

    // ─── Pattern: On-evolve search deck for energy and attach ───
    // "search your deck for up to 3 Basic Fire Energy cards and attach them to your Pokémon"
    // Matches: Charizard ex Infernal Reign, similar on-evolve energy-from-deck abilities
    const evolveSearchAttachMatch = text.match(
      /[Ss]earch your deck for (?:up to )?(\d+) (?:[Bb]asic )?(?:(\w+) )?[Ee]nergy cards? and attach/i
    );
    if (evolveSearchAttachMatch) {
      const count = parseInt(evolveSearchAttachMatch[1], 10);
      const energyType = evolveSearchAttachMatch[2]; // e.g., "Fire", "Darkness", etc.
      return {
        name: ability.name,
        type: "on_enter" as const,
        onEnter: async (ctx) => {
          const energyFilter = (c: GameCard) => {
            if (c.card.supertype !== "Energy") return false;
            if (energyType && !c.card.name.includes(energyType) &&
                !(c.card.types && c.card.types.includes(energyType))) return false;
            return true;
          };

          // Step 1: Search deck for matching energy cards (interactive)
          let foundEnergy: GameCard[];
          if (ctx.promptSearchDeck) {
            foundEnergy = await ctx.promptSearchDeck(
              energyFilter,
              count,
              `${ability.name}: 从牌组选择最多${count}张${energyType || ""}能量卡`,
              "player"
            );
          } else {
            foundEnergy = ctx.searchDeck(energyFilter, count, "player");
          }

          if (foundEnergy.length === 0) {
            ctx.log(`${ability.name}: 牌组中没有找到匹配的能量卡`);
            ctx.shuffleDeck("player");
            return;
          }

          // Step 2: Attach each energy to a target Pokemon (interactive per energy)
          const allTargets = ctx.getAllPokemon("player");
          for (const energy of foundEnergy) {
            if (allTargets.length === 1) {
              // Only 1 Pokemon, auto-attach
              allTargets[0].attachedEnergy.push(energy);
              ctx.log(`${ability.name}: 将 ${energy.card.name} 附加到 ${allTargets[0].card.name}`);
            } else if (ctx.promptUser) {
              // Interactive: let player choose which Pokemon to attach to
              const targetIds = allTargets.map(t => t.instanceId);
              const selection = await ctx.promptUser({
                message: `${ability.name}: 选择一只宝可梦来附加 ${energy.card.name}`,
                min: 1,
                max: 1,
                zone: "own_field",
                targets: targetIds,
              });
              const targetId = selection?.[0] || targetIds[0];
              const target = allTargets.find(t => t.instanceId === targetId) || allTargets[0];
              target.attachedEnergy.push(energy);
              ctx.log(`${ability.name}: 将 ${energy.card.name} 附加到 ${target.card.name}`);
            } else {
              // Fallback: attach to self (the evolved Pokemon)
              ctx.source.attachedEnergy.push(energy);
              ctx.log(`${ability.name}: 将 ${energy.card.name} 附加到 ${ctx.source.card.name}`);
            }
          }
          // Shuffle deck
          ctx.shuffleDeck("player");
        },
      };
    }

    // ─── Pattern: On-evolve attach energy from discard ───
    const evolveAttachFromDiscardMatch = text.match(/attach (?:up to )?(\d+).*[Ee]nergy.*(?:from your discard|from the discard)/i);
    if (evolveAttachFromDiscardMatch) {
      const count = parseInt(evolveAttachFromDiscardMatch[1], 10);
      return {
        name: ability.name,
        type: "on_enter" as const,
        onEnter: (ctx) => {
          let attached = 0;
          const discard = ctx.player.discard.cards;
          for (let i = discard.length - 1; i >= 0 && attached < count; i--) {
            if (discard[i].card.supertype === "Energy") {
              const energy = discard.splice(i, 1)[0];
              ctx.source.attachedEnergy.push(energy);
              attached++;
              ctx.log(`${ability.name}: 从弃牌堆附加了 ${energy.card.name}`);
            }
          }
        },
      };
    }

    // ─── Pattern: On-evolve place damage counters ───
    const evolveDamageMatch = text.match(/put (\d+) damage counters? on.*opponent/i);
    if (evolveDamageMatch) {
      const counters = parseInt(evolveDamageMatch[1], 10);
      return {
        name: ability.name,
        type: "on_enter" as const,
        onEnter: (ctx) => {
          if (ctx.opponent.active) {
            ctx.opponent.active.damageCounters += counters;
            ctx.log(`${ability.name}: 进化时对 ${ctx.opponent.active.card.name} 放置了 ${counters} 个伤害指示物`);
          }
        },
      };
    }

    // ─── Pattern: On-evolve discard cards from opponent's hand ───
    const evolveDiscardHandMatch = text.match(/opponent discards? (\d+) cards?/i);
    if (evolveDiscardHandMatch) {
      const count = parseInt(evolveDiscardHandMatch[1], 10);
      return {
        name: ability.name,
        type: "on_enter" as const,
        onEnter: (ctx) => {
          for (let i = 0; i < count && ctx.opponent.hand.cards.length > 0; i++) {
            const randIdx = Math.floor(Math.random() * ctx.opponent.hand.cards.length);
            const card = ctx.opponent.hand.cards.splice(randIdx, 1)[0];
            ctx.opponent.discard.cards.push(card);
          }
          ctx.log(`${ability.name}: 进化时对手随机弃掉了 ${count} 张手牌`);
        },
      };
    }

    // Unrecognized on_evolve ability — don't fall through to activated patterns
    return null;
  }

  // ──────────────────────────────────────
  // POSITION DETECTION
  // ──────────────────────────────────────
  // Detect "if this Pokémon is in the Active Spot" or "if this Pokémon is on your Bench"
  // to add appropriate canActivate position checks.

  const requiresActiveSpot = /(?:this Pok[eé]mon is|as long as this Pok[eé]mon is) in the Active Spot/i.test(text);
  const requiresBench = /(?:this Pok[eé]mon is|if this Pok[eé]mon is) on (?:your )?(?:the )?Bench/i.test(text);

  /** Helper to create a position-checking canActivate function */
  function makePositionCheck(): ((ctx: EffectContext) => boolean) | undefined {
    if (requiresActiveSpot) {
      return (ctx) => ctx.player.active?.instanceId === ctx.source.instanceId;
    }
    if (requiresBench) {
      return (ctx) => ctx.player.bench.cards.some(c => c.instanceId === ctx.source.instanceId);
    }
    return undefined;
  }

  // ──────────────────────────────────────
  // BENCH-SPECIFIC ACTIVATED ABILITIES
  // (must be checked BEFORE generic activated patterns)
  // ──────────────────────────────────────

  if (requiresBench) {
    // ─── Pattern: Bench → switch self to active ───
    // "if this Pokémon is on your Bench, you may switch it with your Active Pokémon"
    const benchSwitchSelfMatch = text.match(
      /(?:on (?:your )?(?:the )?Bench).*(?:switch (?:it|this Pok[eé]mon) with your Active|switch it with your Active)/i
    );
    if (benchSwitchSelfMatch) {
      return {
        name: ability.name,
        type: "activated",
        canActivate: makePositionCheck(),
        onActivate: async (ctx) => {
          // Switch this bench Pokemon to active
          const benchIdx = ctx.player.bench.cards.findIndex(c => c.instanceId === ctx.source.instanceId);
          if (benchIdx !== -1) {
            ctx.switchOwnActive(ctx.source.instanceId);
            ctx.log(`${ability.name}: 从备战区切换到战斗区`);
          }
        },
      };
    }

    // ─── Pattern: Bench → switch opponent's active ───
    // "if this Pokémon is on your Bench, you may switch out your opponent's Active Pokémon"
    const benchSwitchOppMatch = text.match(
      /(?:on (?:your )?(?:the )?Bench).*switch.*opponent'?s? Active Pok[eé]mon/i
    );
    if (benchSwitchOppMatch) {
      return {
        name: ability.name,
        type: "activated",
        canActivate: makePositionCheck(),
        onActivate: async (ctx) => {
          if (ctx.opponent.bench.cards.length > 0) {
            if (ctx.promptSwitchOpponentActive) {
              await ctx.promptSwitchOpponentActive(`${ability.name}: 选择对手的备战区宝可梦`);
            } else {
              const rand = Math.floor(Math.random() * ctx.opponent.bench.cards.length);
              ctx.switchOpponentActive(ctx.opponent.bench.cards[rand].instanceId);
            }
            ctx.log(`${ability.name}: 替换了对手的战斗宝可梦`);
          }
        },
      };
    }

    // ─── Pattern: Bench → reduce retreat cost (passive) ───
    // "As long as this Pokémon is on your Bench, your Active Pokémon's Retreat Cost is CC less"
    const benchReduceRetreatMatch = text.match(
      /(?:on (?:your )?(?:the )?Bench).*Retreat Cost is (Colorless(?:Colorless)*|\d+) less/i
    );
    if (benchReduceRetreatMatch) {
      const costStr = benchReduceRetreatMatch[1];
      const amount = /^\d+$/.test(costStr) ? parseInt(costStr, 10) : (costStr.match(/Colorless/gi) || []).length;
      return {
        name: ability.name,
        type: "passive",
        modifyRetreatCost: (_ctx, cost) => Math.max(0, cost - amount),
      };
    }

    // ─── Pattern: Bench → prevent damage to self (passive) ───
    // "As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon"
    const benchPreventSelfDmgMatch = text.match(
      /(?:on (?:your )?(?:the )?Bench).*prevent all damage done to this Pok[eé]mon/i
    );
    if (benchPreventSelfDmgMatch) {
      return {
        name: ability.name,
        type: "passive",
        modifyIncomingDamage: (_ctx, damage) => 0,
      };
    }

    // ─── Pattern: Bench → prevent damage to benched Pokemon (passive) ───
    // "prevent all damage from and effects of attacks from your opponent's Pokémon done to this Pokémon"
    const benchPreventAllDmgMatch = text.match(
      /(?:on (?:your )?(?:the )?Bench).*prevent all damage (?:from )?(?:and effects )?(?:of attacks)?/i
    );
    if (benchPreventAllDmgMatch) {
      return {
        name: ability.name,
        type: "passive",
        modifyIncomingDamage: (_ctx, damage) => 0,
      };
    }

    // ─── Pattern: Bench → damage boost (passive) ───
    // "As long as this Pokémon is on your Bench, ... do 30 more damage"
    const benchBoostMatch = text.match(
      /(?:on (?:your )?(?:the )?Bench).*(?:do|does|deal) (\d+) more damage/i
    );
    if (benchBoostMatch) {
      const boost = parseInt(benchBoostMatch[1], 10);
      return {
        name: ability.name,
        type: "passive",
        modifyDamage: (_ctx, damage, isAttacker) => isAttacker ? damage + boost : damage,
      };
    }

    // ─── Pattern: Bench → shuffle self into deck ───
    // "if this Pokémon is on your Bench, you may shuffle it and all attached cards into your deck"
    const benchShuffleMatch = text.match(
      /(?:on (?:your )?(?:the )?Bench).*shuffle (?:it|this Pok[eé]mon) (?:and all attached cards )?into your deck/i
    );
    if (benchShuffleMatch) {
      return {
        name: ability.name,
        type: "activated",
        canActivate: makePositionCheck(),
        onActivate: (ctx) => {
          const collected = ctx.pickUpPokemon(ctx.source.instanceId, "player");
          for (const card of collected) {
            ctx.player.deck.cards.push(card);
          }
          ctx.shuffleDeck("player");
          ctx.log(`${ability.name}: 将自身及附加卡洗入牌组`);
        },
      };
    }

    // ─── Pattern: Bench → attach energy from hand ───
    // "if this Pokémon is on your Bench, you may attach an Energy card from your hand"
    const benchAttachEnergyMatch = text.match(
      /(?:on (?:your )?(?:the )?Bench).*attach (?:an? |1 )?[Ee]nergy card from your hand/i
    );
    if (benchAttachEnergyMatch) {
      return {
        name: ability.name,
        type: "activated",
        canActivate: (ctx) => {
          const onBench = ctx.player.bench.cards.some(c => c.instanceId === ctx.source.instanceId);
          const hasEnergy = ctx.player.hand.cards.some(c => c.card.supertype === "Energy");
          return onBench && hasEnergy;
        },
        onActivate: (ctx) => {
          // Find first energy in hand and attach to this Pokemon
          const energyIdx = ctx.player.hand.cards.findIndex(c => c.card.supertype === "Energy");
          if (energyIdx !== -1) {
            const energy = ctx.player.hand.cards.splice(energyIdx, 1)[0];
            ctx.source.attachedEnergy.push(energy);
            ctx.log(`${ability.name}: 从手牌附加 ${energy.card.name}`);
          }
        },
      };
    }
  }

  // ──────────────────────────────────────
  // ACTIVATED ABILITIES ("Once during your turn")
  // ──────────────────────────────────────

  // ─── Pattern: Draw cards (activated) ───
  // "Once during your turn, you may use this Ability. Draw 2 cards."
  // "Once during your turn, you may draw 3 cards."
  const drawMatch = text.match(
    /(?:Once during your turn|As often as you like).*(?:Draw|draw) (\d+) cards?/i
  );
  if (drawMatch) {
    const drawCount = parseInt(drawMatch[1], 10);
    return {
      name: ability.name,
      type: "activated",
      canActivate: makePositionCheck(),
      onActivate: (ctx) => {
        ctx.drawCards(drawCount, "player");
        ctx.log(`${ability.name}: 抽了 ${drawCount} 张牌`);
      },
    };
  }

  // ─── Pattern: Draw until N cards in hand (activated or on_enter) ───
  // "you may draw cards until you have 6 cards in your hand"
  const drawUntilMatch = text.match(
    /draw cards? until you have (\d+) cards? in your hand/i
  );
  if (drawUntilMatch) {
    const targetHand = parseInt(drawUntilMatch[1], 10);
    const isOnEvolve = /when you play this.*to evolve/i.test(text);
    const isOnEnter = /when you (?:put|play) this.*(?:onto|to).*Bench/i.test(text);

    if (isOnEvolve || isOnEnter) {
      return {
        name: ability.name,
        type: "on_enter",
        onEnter: (ctx) => {
          const handSize = ctx.player.hand.cards.length;
          const toDraw = Math.max(0, targetHand - handSize);
          if (toDraw > 0) {
            ctx.drawCards(toDraw, "player");
            ctx.log(`${ability.name}: 抽牌直到手牌达到 ${targetHand} 张 (抽了 ${toDraw} 张)`);
          }
        },
      };
    }
    return {
      name: ability.name,
      type: "activated",
      canActivate: makePositionCheck(),
      onActivate: (ctx) => {
        const handSize = ctx.player.hand.cards.length;
        const toDraw = Math.max(0, targetHand - handSize);
        if (toDraw > 0) {
          ctx.drawCards(toDraw, "player");
          ctx.log(`${ability.name}: 抽牌直到手牌达到 ${targetHand} 张 (抽了 ${toDraw} 张)`);
        }
      },
    };
  }

  // ─── Pattern: Heal from own Pokemon (activated) ───
  // "Once during your turn ... Heal 30 damage from 1 of your Pokémon"
  // "Heal 60 damage from 1 of your Pokémon."
  const healMatch = text.match(
    /(?:Once during your turn|As often as you like).*[Hh]eal (\d+) damage from (?:1 of )?your/i
  );
  if (healMatch) {
    const healAmt = parseInt(healMatch[1], 10);
    return {
      name: ability.name,
      type: "activated",
      canActivate: makePositionCheck(),
      onActivate: (ctx) => {
        // Heal the most-damaged Pokemon
        const all = ctx.getAllPokemon("player");
        const damaged = all.filter(p => p.damageCounters > 0).sort((a, b) => b.damageCounters - a.damageCounters);
        if (damaged.length > 0) {
          ctx.heal(healAmt, damaged[0]);
          ctx.log(`${ability.name}: 回复了 ${damaged[0].card.name} ${healAmt} 点伤害`);
        }
      },
    };
  }

  // ─── Pattern: Search deck for basic energy + attach (activated) ───
  // "Once during your turn ... Search your deck for a Basic ... Energy card and attach it to 1 of your Pokémon."
  const searchEnergyMatch = text.match(
    /(?:Once during your turn|As often as you like).*[Ss]earch your deck for (?:a|up to \d+) [Bb]asic (?:(\w+) )?[Ee]nergy card.*attach it to/i
  );
  if (searchEnergyMatch) {
    const energyType = searchEnergyMatch[1] || null;
    return {
      name: ability.name,
      type: "activated",
      canActivate: makePositionCheck(),
      onActivate: async (ctx) => {
        const filter = (c: GameCard) => {
          if (c.card.supertype !== "Energy") return false;
          if (!c.card.subtypes.includes("Basic")) return false;
          if (energyType && !c.card.types?.includes(energyType)) return false;
          return true;
        };
        const found = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(filter, 1, `${ability.name}: 选择一张基础能量`, "player")
          : ctx.searchDeck(filter, 1, "player");
        if (found.length > 0) {
          // Attach to active if exists, otherwise first bench
          const target = ctx.source.damageCounters >= 0 ? ctx.source : ctx.player.active;
          if (target) {
            target.attachedEnergy.push(found[0]);
            ctx.log(`${ability.name}: 从牌组搜索 ${found[0].card.name} 附加给 ${target.card.name}`);
          }
        }
        ctx.shuffleDeck("player");
      },
    };
  }

  // ─── Pattern: Move energy (activated) ───
  // "As often as you like ... Move a Basic ... Energy from 1 of your Pokémon to another"
  const moveEnergyMatch = text.match(
    /(?:Once during your turn|As often as you like).*[Mm]ove (?:a|1) [Bb]asic (?:(\w+) )?[Ee]nergy from (?:1 of )?your Pok[eé]mon to another/i
  );
  if (moveEnergyMatch) {
    return {
      name: ability.name,
      type: "activated",
      canActivate: makePositionCheck(),
      onActivate: (ctx) => {
        // Move energy from Pokemon with most energy to one with least
        const all = ctx.getAllPokemon("player");
        const withEnergy = all.filter(p => p.attachedEnergy.length > 0);
        const withoutEnergy = all.filter(p => p.attachedEnergy.length === 0);

        if (withEnergy.length > 0 && withoutEnergy.length > 0) {
          const source = withEnergy.sort((a, b) => b.attachedEnergy.length - a.attachedEnergy.length)[0];
          const target = withoutEnergy[0];
          const energy = source.attachedEnergy[0];
          if (energy) {
            ctx.moveEnergy(source, target, energy.instanceId);
            ctx.log(`${ability.name}: 将 ${energy.card.name} 从 ${source.card.name} 移到 ${target.card.name}`);
          }
        }
      },
    };
  }

  // ─── Pattern: Search deck for basic/any Pokemon (activated) ───
  // "Once during your turn, you may ... Search your deck for a Basic Pokémon and put it onto your Bench"
  const searchBasicMatch = text.match(
    /(?:Once during your turn).*[Ss]earch your deck for (?:a|up to (\d+)) (?:Basic )?Pok[eé]mon.*(?:put|place).*(?:onto|on) your [Bb]ench/i
  );
  if (searchBasicMatch) {
    const count = searchBasicMatch[1] ? parseInt(searchBasicMatch[1], 10) : 1;
    return {
      name: ability.name,
      type: "activated",
      canActivate: makePositionCheck(),
      onActivate: async (ctx) => {
        const filter = (c: GameCard) => c.card.supertype === "Pokémon" && c.card.subtypes.includes("Basic");
        const found = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(filter, count, `${ability.name}: 选择基础宝可梦放到备战区`, "player")
          : ctx.searchDeck(filter, count, "player");
        for (const p of found) {
          if (ctx.player.bench.cards.length < 5) {
            p.playedThisTurn = true;
            ctx.player.bench.cards.push(p);
            ctx.log(`${ability.name}: 从牌组搜索 ${p.card.name} 放到备战区`);
          }
        }
        ctx.shuffleDeck("player");
      },
    };
  }

  // ─── Pattern: Look at top card of deck (activated) ───
  // "Once during your turn, you may look at the top card of your deck"
  const lookTopMatch = text.match(
    /(?:Once during your turn).*look at the top (?:(\d+) )?cards? of your deck/i
  );
  if (lookTopMatch) {
    return {
      name: ability.name,
      type: "activated",
      canActivate: makePositionCheck(),
      onActivate: (ctx) => {
        const count = lookTopMatch[1] ? parseInt(lookTopMatch[1], 10) : 1;
        const top = ctx.player.deck.cards.slice(0, count);
        ctx.log(`${ability.name}: 查看了牌组顶部 ${count} 张牌`);
      },
    };
  }

  // ─── Pattern: Switch own active (activated) ───
  // "Once during your turn ... switch this Pokémon with 1 of your Benched Pokémon"
  const switchSelfMatch = text.match(
    /(?:Once during your turn).*switch.*(?:this Pok[eé]mon|your [Aa]ctive).*(?:with|and).*[Bb]ench/i
  );
  if (switchSelfMatch) {
    return {
      name: ability.name,
      type: "activated",
      canActivate: makePositionCheck(),
      onActivate: async (ctx) => {
        if (ctx.player.bench.cards.length > 0) {
          if (ctx.promptSwitchOwnActive) {
            await ctx.promptSwitchOwnActive(`${ability.name}: 选择备战区宝可梦切换到战斗区`);
          } else {
            ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
          }
          ctx.log(`${ability.name}: 与备战区宝可梦交换`);
        }
      },
    };
  }

  // ─── Pattern: Discard card to draw (activated) ───
  // "Once during your turn ... discard a card from your hand. If you do, draw a card."
  // "Once during your turn ... discard 1 card from your hand ... draw 2 cards"
  const discardDrawMatch = text.match(
    /(?:Once during your turn).*discard (?:a|(\d+)) cards? from your hand.*draw (\d+) cards?/i
  );
  if (discardDrawMatch) {
    const discardCount = discardDrawMatch[1] ? parseInt(discardDrawMatch[1], 10) : 1;
    const drawCount = parseInt(discardDrawMatch[2], 10);
    return {
      name: ability.name,
      type: "activated",
      canActivate: (ctx) => {
        const posCheck = makePositionCheck();
        if (posCheck && !posCheck(ctx)) return false;
        return ctx.player.hand.cards.length >= discardCount;
      },
      onActivate: (ctx) => {
        // Discard first N cards from hand
        for (let i = 0; i < discardCount && ctx.player.hand.cards.length > 0; i++) {
          const card = ctx.player.hand.cards.pop();
          if (card) ctx.player.discard.cards.push(card);
        }
        ctx.drawCards(drawCount, "player");
        ctx.log(`${ability.name}: 弃 ${discardCount} 张，抽 ${drawCount} 张`);
      },
    };
  }

  return null;
}

// ═══════════════════════════════════════════
// Trainer Effect Parsing
// ═══════════════════════════════════════════

function parseTrainerEffect(card: Card): TrainerEffect | null {
  if (card.supertype !== "Trainer") return null;

  // Collect all text from card rules
  const allText = (card.rules || []).join(" ");
  if (!allText) return null;

  // ─── Pattern: Discard hand and draw N ───
  // "Discard your hand and draw 7 cards."
  const discardDrawMatch = allText.match(
    /[Dd]iscard your hand and draw (\d+) cards/i
  );
  if (discardDrawMatch) {
    const drawCount = parseInt(discardDrawMatch[1], 10);
    return {
      onPlay: (ctx) => {
        ctx.discardHand("player");
        ctx.drawCards(drawCount, "player");
        ctx.log(`${card.name}: 弃掉全部手牌，抽了 ${drawCount} 张`);
      },
    };
  }

  // ─── Pattern: Shuffle hand and draw (self only) ─── [NEW]
  // "Shuffle your hand into your deck. Then, draw 5 cards."
  // NOTE: Must come BEFORE generic "Draw N cards" to avoid false match
  const selfShuffleDrawMatch = allText.match(
    /[Ss]huffle your hand into your deck\.?\s*(?:Then,?\s*)?[Dd]raw (\d+) cards/i
  );
  if (selfShuffleDrawMatch) {
    const drawCount = parseInt(selfShuffleDrawMatch[1], 10);
    return {
      onPlay: (ctx) => {
        ctx.shuffleHandIntoDeck("player");
        ctx.drawCards(drawCount, "player");
        ctx.log(`${card.name}: 洗回手牌，抽了 ${drawCount} 张`);
      },
    };
  }

  // ─── Pattern: Draw N cards ───
  // "Draw 3 cards."
  const drawMatch = allText.match(
    /[Dd]raw (\d+) cards/i
  );
  if (drawMatch) {
    const drawCount = parseInt(drawMatch[1], 10);
    return {
      onPlay: (ctx) => {
        ctx.drawCards(drawCount, "player");
        ctx.log(`${card.name}: 抽了 ${drawCount} 张牌`);
      },
    };
  }

  // ─── Pattern: Search deck for Basic Pokémon ───
  // "Search your deck for a Basic Pokémon and put it onto your Bench."
  const searchBasicMatch = allText.match(
    /[Ss]earch your deck for (?:a|up to (\d+)) [Bb]asic Pok[eé]mon/i
  );
  if (searchBasicMatch) {
    const searchCount = searchBasicMatch[1] ? parseInt(searchBasicMatch[1], 10) : 1;
    return {
      canPlay: (ctx) => ctx.player.bench.cards.length < 5,
      onPlay: async (ctx) => {
        const filter = (c: GameCard) => c.card.supertype === "Pokémon" && (c.card.subtypes?.includes("Basic") ?? false);
        const found = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(filter, searchCount, `${card.name}: 选择基础宝可梦放到备战区`, "player")
          : ctx.searchDeck(filter, searchCount, "player");
        for (const pokemon of found) {
          if (ctx.player.bench.cards.length < 5) {
            pokemon.playedThisTurn = true;
            ctx.player.bench.cards.push(pokemon);
            ctx.log(`${card.name}: 从牌组搜索了 ${pokemon.card.name} 放到备战区`);
          }
        }
        ctx.shuffleDeck("player");
      },
    };
  }

  // ─── Pattern: Search deck for any Pokémon ─── [NEW]
  // "Search your deck for a Pokémon, reveal it, and put it into your hand."
  const searchPokemonMatch = allText.match(
    /[Ss]earch your deck for (?:a|up to (\d+)) Pok[eé]mon.*(?:put|add) (?:it|them) into your hand/i
  );
  if (searchPokemonMatch) {
    const searchCount = searchPokemonMatch[1] ? parseInt(searchPokemonMatch[1], 10) : 1;
    return {
      onPlay: async (ctx) => {
        const filter = (c: GameCard) => c.card.supertype === "Pokémon";
        const found = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(filter, searchCount, `${card.name}: 选择宝可梦加入手牌`, "player")
          : ctx.searchDeck(filter, searchCount, "player");
        for (const c of found) ctx.addToHand(c, "player");
        ctx.shuffleDeck("player");
        ctx.log(`${card.name}: 从牌组搜索了 ${found.length} 张宝可梦到手牌`);
      },
    };
  }

  // ─── Pattern: Search deck for evolution card ─── [NEW]
  // "Search your deck for a card that evolves from 1 of your Pokémon..."
  // "Search your deck for a Stage 1 card that evolves from..."
  const searchEvolutionMatch = allText.match(
    /[Ss]earch your deck for.*(?:evolves from|[Ss]tage [12]).*(?:put it into your hand|put it onto)/i
  );
  if (searchEvolutionMatch) {
    const toHand = /put it into your hand/i.test(allText);
    return {
      onPlay: async (ctx) => {
        const filter = (c: GameCard) => c.card.supertype === "Pokémon" &&
          (c.card.subtypes?.includes("Stage 1") || c.card.subtypes?.includes("Stage 2") || false);
        const found = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(filter, 1, `${card.name}: 选择进化卡`, "player")
          : ctx.searchDeck(filter, 1, "player");
        if (found.length > 0) {
          if (toHand) {
            ctx.addToHand(found[0], "player");
            ctx.log(`${card.name}: 搜索到 ${found[0].card.name} 放入手牌`);
          } else {
            ctx.addToHand(found[0], "player");
            ctx.log(`${card.name}: 搜索到进化卡 ${found[0].card.name}`);
          }
        }
        ctx.shuffleDeck("player");
      },
    };
  }

  // ─── Pattern: Search deck for Supporter card ─── [NEW]
  // "Search your deck for a Supporter card, reveal it, and put it into your hand."
  const searchSupporterMatch = allText.match(
    /[Ss]earch your deck for (?:a|up to (\d+)) [Ss]upporter card.*put (?:it|them) into your hand/i
  );
  if (searchSupporterMatch) {
    const searchCount = searchSupporterMatch[1] ? parseInt(searchSupporterMatch[1], 10) : 1;
    return {
      onPlay: async (ctx) => {
        const filter = (c: GameCard) => c.card.supertype === "Trainer" && (c.card.subtypes?.includes("Supporter") ?? false);
        const found = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(filter, searchCount, `${card.name}: 选择支持者卡加入手牌`, "player")
          : ctx.searchDeck(filter, searchCount, "player");
        for (const c of found) ctx.addToHand(c, "player");
        ctx.shuffleDeck("player");
        ctx.log(`${card.name}: 从牌组搜索了 ${found.length} 张支持者到手牌`);
      },
    };
  }

  // ─── Pattern: Search deck for any card ───
  // "Search your deck for a card and put it into your hand."
  const searchAnyMatch = allText.match(
    /[Ss]earch your deck for (?:a|up to (\d+)) cards? and put (?:it|them) into your hand/i
  );
  if (searchAnyMatch) {
    const searchCount = searchAnyMatch[1] ? parseInt(searchAnyMatch[1], 10) : 1;
    return {
      onPlay: async (ctx) => {
        const filter = () => true;
        const found = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(filter, searchCount, `${card.name}: 选择卡牌加入手牌`, "player")
          : ctx.searchDeck(filter, searchCount, "player");
        for (const c of found) ctx.addToHand(c, "player");
        ctx.shuffleDeck("player");
        ctx.log(`${card.name}: 从牌组搜索了 ${found.length} 张牌到手牌`);
      },
    };
  }

  // ─── Pattern: Switch your Active Pokémon ───
  // "Switch your Active Pokémon with 1 of your Benched Pokémon."
  const switchMatch = allText.match(
    /[Ss]witch your [Aa]ctive Pok[eé]mon/i
  );
  if (switchMatch) {
    return {
      canPlay: (ctx) => ctx.player.bench.cards.length > 0,
      onPlay: async (ctx) => {
        if (ctx.player.bench.cards.length > 0) {
          if (ctx.promptSwitchOwnActive) {
            await ctx.promptSwitchOwnActive(`${card.name}: 选择要换上的备战区宝可梦`);
          } else {
            ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
          }
          ctx.log(`${card.name}: 换上了备战区宝可梦`);
        }
      },
    };
  }

  // ─── Pattern: Switch opponent's active (trainer) ─── [NEW]
  // "Switch in 1 of your opponent's Benched Pokémon to the Active Spot."
  const switchOppTrainerMatch = allText.match(
    /[Ss]witch (?:in )?(?:\d+ of )?your opponent'?s? [Bb]enched Pok[eé]mon/i
  );
  if (switchOppTrainerMatch) {
    return {
      canPlay: (ctx) => ctx.opponent.bench.cards.length > 0,
      onPlay: async (ctx) => {
        if (ctx.opponent.bench.cards.length > 0) {
          if (ctx.promptSwitchOpponentActive) {
            await ctx.promptSwitchOpponentActive(`${card.name}: 选择要拖出的对手备战区宝可梦`);
          } else {
            ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
          }
          ctx.log(`${card.name}: 拖出了对手的备战区宝可梦`);
        }
      },
    };
  }

  // ─── Pattern: Heal N damage ───
  // "Heal 30 damage from 1 of your Pokémon."
  const healMatch = allText.match(
    /[Hh]eal (\d+) damage from/i
  );
  if (healMatch) {
    const healAmt = parseInt(healMatch[1], 10);
    return {
      onPlay: (ctx) => {
        if (ctx.player.active) {
          ctx.heal(healAmt, ctx.player.active);
          ctx.log(`${card.name}: 治疗了 ${ctx.player.active.card.name} ${healAmt} 点伤害`);
        }
      },
    };
  }

  // ─── Pattern: Each player shuffles hand and draws ───
  // "Each player shuffles their hand into their deck and draws 4 cards."
  const eachShuffleDrawMatch = allText.match(
    /[Ee]ach player shuffles (?:their|his or her) hand into (?:their|his or her) deck and draws? (\d+) cards/i
  );
  if (eachShuffleDrawMatch) {
    const drawCount = parseInt(eachShuffleDrawMatch[1], 10);
    return {
      onPlay: (ctx) => {
        ctx.shuffleHandIntoDeck("player");
        ctx.shuffleHandIntoDeck("opponent");
        ctx.drawCards(drawCount, "player");
        ctx.drawCards(drawCount, "opponent");
        ctx.log(`${card.name}: 双方洗回手牌，各抽 ${drawCount} 张`);
      },
    };
  }

  // ─── Pattern: Shuffle hand, draw = prizes ───
  // "Each player shuffles their hand ... draws cards equal to ... Prize cards"
  const shufflePrizesMatch = allText.match(
    /shuffles? (?:their|his or her) hand.*(?:draws?|draw).*(?:equal to|=).*[Pp]rize/i
  );
  if (shufflePrizesMatch) {
    return {
      onPlay: (ctx) => {
        ctx.shuffleHandIntoDeck("player");
        ctx.shuffleHandIntoDeck("opponent");
        const pPrizes = ctx.player.prizes.cards.length;
        const oPrizes = ctx.opponent.prizes.cards.length;
        ctx.drawCards(pPrizes, "player");
        ctx.drawCards(oPrizes, "opponent");
        ctx.log(`${card.name}: 洗回手牌，按奖励卡数抽牌 (${pPrizes}/${oPrizes})`);
      },
    };
  }

  // ─── Pattern: Search deck for Energy ───
  // "Search your deck for a basic Energy card and put it into your hand."
  // "Search your deck for up to 2 Basic Energy cards..."
  const searchEnergyMatch = allText.match(
    /[Ss]earch your deck for (?:a|up to (\d+)) (?:[Bb]asic )?[Ee]nergy.*(?:put (?:it|them) into your hand|hand)/i
  );
  if (searchEnergyMatch) {
    const searchCount = searchEnergyMatch[1] ? parseInt(searchEnergyMatch[1], 10) : 1;
    return {
      onPlay: async (ctx) => {
        const filter = (c: GameCard) => c.card.supertype === "Energy";
        const found = ctx.promptSearchDeck
          ? await ctx.promptSearchDeck(filter, searchCount, `${card.name}: 选择能量卡加入手牌`, "player")
          : ctx.searchDeck(filter, searchCount, "player");
        for (const c of found) ctx.addToHand(c, "player");
        ctx.shuffleDeck("player");
        ctx.log(`${card.name}: 从牌组搜索了 ${found.length} 张能量卡到手牌`);
      },
    };
  }

  // ─── Pattern: Energy from discard to hand ─── [NEW]
  // "Put 2 Energy cards from your discard pile into your hand."
  // "Put a basic Energy card from your discard pile into your hand."
  const energyDiscardToHandMatch = allText.match(
    /[Pp]ut (?:up to )?(\d+|a|an?) (?:[Bb]asic )?[Ee]nergy cards? from your discard pile into your hand/i
  );
  if (energyDiscardToHandMatch) {
    const countStr = energyDiscardToHandMatch[1];
    const count = (countStr === "a" || countStr === "an") ? 1 : parseInt(countStr, 10);
    return {
      onPlay: async (ctx) => {
        const filter = (c: GameCard) => c.card.supertype === "Energy";
        const found = ctx.promptSearchDiscard
          ? await ctx.promptSearchDiscard(filter, count, `${card.name}: 选择能量卡取回手牌`, "player")
          : ctx.searchDiscard(filter, count, "player");
        for (const c of found) ctx.addToHand(c, "player");
        ctx.log(`${card.name}: 从弃牌堆取回了 ${found.length} 张能量到手牌`);
      },
    };
  }

  // ─── Pattern: Attach energy from discard ─── [NEW]
  // "Attach a basic Energy card from your discard pile to 1 of your Pokémon."
  // "Attach up to 2 basic Energy cards from your discard pile to your Pokémon."
  const attachFromDiscardMatch = allText.match(
    /[Aa]ttach (?:up to )?(\d+|a|an?) (?:[Bb]asic )?(?:\w+ )?[Ee]nergy cards? from your discard pile/i
  );
  if (attachFromDiscardMatch) {
    const countStr = attachFromDiscardMatch[1];
    const count = (countStr === "a" || countStr === "an") ? 1 : parseInt(countStr, 10);
    return {
      onPlay: (ctx) => {
        const target = ctx.player.active;
        if (target) {
          ctx.attachEnergyFromDiscard(
            (c) => c.card.supertype === "Energy",
            count,
            target
          );
        }
        ctx.log(`${card.name}: 从弃牌堆附加能量`);
      },
    };
  }

  // ─── Pattern: Recover card from discard to hand ─── [NEW]
  // "Put a Pokémon from your discard pile into your hand."
  // "Put a card from your discard pile into your hand."
  // "Put a Pokémon or a Basic Energy card from your discard pile into your hand."
  const recoverFromDiscardMatch = allText.match(
    /[Pp]ut (?:up to )?(\d+|a|an?) (?:(Pok[eé]mon|Trainer|cards?|Pok[eé]mon or a Basic Energy card)s?) from your discard pile into your hand/i
  );
  if (recoverFromDiscardMatch) {
    const countStr = recoverFromDiscardMatch[1];
    const count = (countStr === "a" || countStr === "an") ? 1 : parseInt(countStr, 10);
    const typeStr = (recoverFromDiscardMatch[2] || "card").toLowerCase();
    return {
      onPlay: async (ctx) => {
        const filter = (c: GameCard) => {
          if (typeStr.includes("pok") && typeStr.includes("energy")) {
            return c.card.supertype === "Pokémon" || c.card.supertype === "Energy";
          }
          if (typeStr.includes("pok")) return c.card.supertype === "Pokémon";
          if (typeStr.includes("trainer")) return c.card.supertype === "Trainer";
          return true;
        };
        const found = ctx.promptSearchDiscard
          ? await ctx.promptSearchDiscard(filter, count, `${card.name}: 选择要取回的卡牌`, "player")
          : ctx.searchDiscard(filter, count, "player");
        for (const c of found) ctx.addToHand(c, "player");
        ctx.log(`${card.name}: 从弃牌堆取回了 ${found.length} 张牌到手牌`);
      },
    };
  }

  // ─── Pattern: Discard Stadium ─── [NEW]
  // "Discard a Stadium card in play." / "You may discard a Stadium in play."
  const discardStadiumMatch = allText.match(
    /[Dd]iscard (?:a )?[Ss]tadium (?:card )?in play/i
  );
  if (discardStadiumMatch) {
    return {
      canPlay: (ctx) => ctx.getStadium() !== null,
      onPlay: (ctx) => {
        ctx.removeStadium();
        ctx.log(`${card.name}: 移除了场地卡`);
      },
    };
  }

  // ─── Pattern: Discard random from opponent's hand (trainer) ─── [NEW]
  // "Your opponent discards a random card from their hand."
  // "Discard a random card from your opponent's hand."
  const trainerDiscardOppHandMatch = allText.match(
    /(?:opponent )?discards? (?:up to )?(\d+|a) random cards? from (?:their|your opponent'?s?) hand/i
  );
  if (trainerDiscardOppHandMatch) {
    const countStr = trainerDiscardOppHandMatch[1];
    const count = countStr === "a" ? 1 : parseInt(countStr, 10);
    return {
      onPlay: (ctx) => {
        for (let i = 0; i < count && ctx.opponent.hand.cards.length > 0; i++) {
          const randIdx = Math.floor(Math.random() * ctx.opponent.hand.cards.length);
          const c = ctx.opponent.hand.cards.splice(randIdx, 1)[0];
          ctx.opponent.discard.cards.push(c);
        }
        ctx.log(`${card.name}: 对手随机丢弃了 ${count} 张手牌`);
      },
    };
  }

  // ─── Pattern: Opponent shuffles hand and draws ─── [NEW]
  // "Your opponent shuffles their hand into their deck and draws 4 cards."
  const oppShuffleDrawMatch = allText.match(
    /opponent shuffles (?:their|his or her) hand into (?:their|his or her) deck and draws? (\d+) cards/i
  );
  if (oppShuffleDrawMatch) {
    const drawCount = parseInt(oppShuffleDrawMatch[1], 10);
    return {
      onPlay: (ctx) => {
        ctx.shuffleHandIntoDeck("opponent");
        ctx.drawCards(drawCount, "opponent");
        ctx.log(`${card.name}: 对手洗回手牌，抽了 ${drawCount} 张`);
      },
    };
  }

  return null;
}
