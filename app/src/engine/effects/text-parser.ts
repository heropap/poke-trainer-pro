/**
 * Text-Based Effect Parser (Layer 3 / P2)
 *
 * Parses card rules text and attack descriptions to auto-generate
 * CardEffectDef registrations. Covers ~15 common PTCG text patterns
 * using regex matching and heuristic mapping to EffectContext methods.
 *
 * This is a "best effort" system — it will miss complex multi-step
 * effects, but catches the most common patterns (draw, discard, search,
 * damage modifiers, status application, etc.)
 */

import { Card, CardAttack } from "@/types/card";
import { CardEffectDef, AttackEffect, AttackResult, TrainerEffect } from "./effect-types";
import { registerByName, hasEffect } from "./effect-registry";
import { StatusCondition } from "../game-state";

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
export function autoRegisterTextEffects(cards: Card[]): { registered: number; skipped: number } {
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
      registerByName({ ...def, cardName: card.name });
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

  // ─── Pattern: Discard energy ───
  // "Discard 2 Fire Energy from this Pokémon."
  // "Discard an Energy from this Pokémon."
  const discardEnergyMatch = text.match(
    /[Dd]iscard (\d+|an?) (?:\w+ )?[Ee]nergy from this Pok[eé]mon/i
  );
  if (discardEnergyMatch) {
    const countStr = discardEnergyMatch[1];
    const discardCount = (countStr === "a" || countStr === "an") ? 1 : parseInt(countStr, 10);
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
  const benchDmgMatch = text.match(
    /this attack (?:also )?does (\d+) damage to (?:(\d+)|each) of your opponent'?s? [Bb]enched/i
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
  const searchEnergyMatch = allText.match(
    /[Ss]earch your deck for (?:a|up to (\d+)) (?:[Bb]asic )?[Ee]nergy/i
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

  return null;
}
