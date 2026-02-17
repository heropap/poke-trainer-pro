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

import { Card, CardAttack } from "@/types/card";
import { CardEffectDef, AttackEffect, AttackResult, TrainerEffect } from "./effect-types";
import { registerByName, hasEffect, EffectSourceLayer } from "./effect-registry";
import { StatusCondition } from "../game-state";
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

  if (attacks.length === 0 && !trainer) {
    return null;
  }

  const def: CardEffectDef = {
    cardId: `__text_parsed__`,
    cardName: card.name,
  };

  if (attacks.length > 0) def.attacks = attacks;
  if (trainer) def.trainer = trainer;

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
      onPlay: (ctx) => {
        const found = ctx.searchDeck(
          (c) => c.card.supertype === "Pokémon" && (c.card.subtypes?.includes("Basic") ?? false),
          searchCount,
          "player"
        );
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
      onPlay: (ctx) => {
        const found = ctx.searchDeck(
          (c) => c.card.supertype === "Pokémon",
          searchCount,
          "player"
        );
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
      onPlay: (ctx) => {
        const found = ctx.searchDeck(
          (c) => c.card.supertype === "Pokémon" &&
            (c.card.subtypes?.includes("Stage 1") || c.card.subtypes?.includes("Stage 2") || false),
          1,
          "player"
        );
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
      onPlay: (ctx) => {
        const found = ctx.searchDeck(
          (c) => c.card.supertype === "Trainer" && (c.card.subtypes?.includes("Supporter") ?? false),
          searchCount,
          "player"
        );
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
      onPlay: (ctx) => {
        const found = ctx.searchDeck(() => true, searchCount, "player");
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
      onPlay: (ctx) => {
        if (ctx.player.bench.cards.length > 0) {
          ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
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
      onPlay: (ctx) => {
        if (ctx.opponent.bench.cards.length > 0) {
          ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
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
      onPlay: (ctx) => {
        const found = ctx.searchDeck(
          (c) => c.card.supertype === "Energy",
          searchCount,
          "player"
        );
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
      onPlay: (ctx) => {
        const found = ctx.searchDiscard(
          (c) => c.card.supertype === "Energy",
          count,
          "player"
        );
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
      onPlay: (ctx) => {
        const filter = (c: import("../game-state").GameCard) => {
          if (typeStr.includes("pok") && typeStr.includes("energy")) {
            return c.card.supertype === "Pokémon" || c.card.supertype === "Energy";
          }
          if (typeStr.includes("pok")) return c.card.supertype === "Pokémon";
          if (typeStr.includes("trainer")) return c.card.supertype === "Trainer";
          return true;
        };
        const found = ctx.searchDiscard(filter, count, "player");
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
