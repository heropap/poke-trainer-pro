/**
 * Trainer Card Effects - Supporters, Items, and Tools
 *
 * Initial batch of 7 trainer card implementations covering:
 * - Supporters: Boss's Orders, Professor's Research, Pokemon Center Lady
 * - Items: Nest Ball, Energy Switch
 * - Tools: Air Balloon, Sacred Charm
 */

import { CardEffectDef, EffectContext } from "../effect-types";

// ───────────────────────────────────────────────
// Supporters
// ───────────────────────────────────────────────

/**
 * Boss's Orders — Switch in 1 of your opponent's Benched Pokemon to the Active Spot.
 * IDs: me1-114, me2pt5-183, me2pt5-256
 */
function createBossOrders(cardId: string): CardEffectDef {
  return {
    cardId,
    cardName: "Boss's Orders",
    trainer: {
      canPlay: (ctx) => {
        // Must have an opponent bench Pokemon to switch
        return ctx.opponent.bench.cards.length > 0 && ctx.opponent.active !== null;
      },
      onPlay: (ctx) => {
        // Switch opponent's first bench Pokemon to active (simplified)
        // In full implementation, the player would choose which bench Pokemon
        if (ctx.opponent.bench.cards.length > 0) {
          ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
        }
      },
    },
  };
}

/**
 * Professor's Research — Discard your hand and draw 7 cards.
 * IDs: sv1-189, sv1-190, sv1-240
 */
function createProfessorsResearch(cardId: string): CardEffectDef {
  return {
    cardId,
    cardName: "Professor's Research",
    trainer: {
      onPlay: (ctx) => {
        ctx.discardHand("player");
        ctx.drawCards(7, "player");
      },
    },
  };
}

/**
 * Pokemon Center Lady — Heal 60 damage from 1 of your Pokemon,
 * and it recovers from all Special Conditions.
 * ID: me1-123
 */
const pokemonCenterLady: CardEffectDef = {
  cardId: "me1-123",
  cardName: "Pokémon Center Lady",
  trainer: {
    canPlay: (ctx) => {
      // Must have a Pokemon that could benefit
      return ctx.player.active !== null;
    },
    onPlay: (ctx) => {
      // Heal active Pokemon 60 HP and remove all status
      if (ctx.player.active) {
        ctx.heal(60, ctx.player.active);
        ctx.removeAllStatus(ctx.player.active);
        ctx.log(`${ctx.player.active.card.name} 恢复了 60 HP 并清除了所有状态异常`);
      }
    },
  },
};

// ───────────────────────────────────────────────
// Items
// ───────────────────────────────────────────────

/**
 * Nest Ball — Search your deck for a Basic Pokemon and put it onto your Bench.
 * Then, shuffle your deck.
 * IDs: sv1-181, sv1-255, sv4pt5-84
 */
function createNestBall(cardId: string): CardEffectDef {
  return {
    cardId,
    cardName: "Nest Ball",
    trainer: {
      canPlay: (ctx) => {
        // Need bench space and a Basic in deck
        return ctx.player.bench.cards.length < 5;
      },
      onPlay: (ctx) => {
        const found = ctx.searchDeck(
          (c) =>
            c.card.supertype === "Pokémon" &&
            c.card.subtypes.includes("Basic"),
          1,
          "player"
        );

        if (found.length > 0) {
          const pokemon = found[0];
          pokemon.playedThisTurn = true;
          ctx.player.bench.cards.push(pokemon);
          ctx.log(`${pokemon.card.name} 从牌组中搜索出来放到了备战区`);
        }

        ctx.shuffleDeck("player");
      },
    },
  };
}

/**
 * Energy Switch — Move a Basic Energy from 1 of your Pokemon to another.
 * IDs: me1-115, sv1-173
 */
function createEnergySwitch(cardId: string): CardEffectDef {
  return {
    cardId,
    cardName: "Energy Switch",
    trainer: {
      canPlay: (ctx) => {
        // Need at least one Pokemon with energy and another Pokemon
        const allPokemon = ctx.getAllPokemon("player");
        return (
          allPokemon.length >= 2 &&
          allPokemon.some((p) => p.attachedEnergy.length > 0)
        );
      },
      onPlay: (ctx) => {
        // Move energy from active to first bench (simplified)
        const allPokemon = ctx.getAllPokemon("player");
        const withEnergy = allPokemon.find((p) => p.attachedEnergy.length > 0);
        const target = allPokemon.find(
          (p) => p !== withEnergy
        );

        if (withEnergy && target && withEnergy.attachedEnergy.length > 0) {
          ctx.moveEnergy(
            withEnergy,
            target,
            withEnergy.attachedEnergy[0].instanceId
          );
        }
      },
    },
  };
}

// ───────────────────────────────────────────────
// Tools
// ───────────────────────────────────────────────

/**
 * Air Balloon — The retreat cost of the Pokemon this card is attached to is 2 less.
 * IDs: me1-166, me2pt5-181
 */
function createAirBalloon(cardId: string): CardEffectDef {
  return {
    cardId,
    cardName: "Air Balloon",
    tool: {
      whileAttached: {
        modifyRetreatCost: (_ctx, currentCost) => {
          return Math.max(0, currentCost - 2);
        },
      },
    },
  };
}

/**
 * Sacred Charm — The Pokemon this card is attached to takes 30 less damage
 * from attacks from your opponent's Pokemon ex.
 * IDs: me2-93, me2-122
 */
function createSacredCharm(cardId: string): CardEffectDef {
  return {
    cardId,
    cardName: "Sacred Charm",
    tool: {
      whileAttached: {
        modifyIncomingDamage: (_ctx, damage) => {
          // Reduce incoming damage by 30
          // In a complete implementation, would check if attacker is ex
          return Math.max(0, damage - 30);
        },
      },
    },
  };
}

// ───────────────────────────────────────────────
// Export all trainer effects
// ───────────────────────────────────────────────

export const trainerEffects: CardEffectDef[] = [
  // Boss's Orders (multiple printings)
  createBossOrders("me1-114"),
  createBossOrders("me2pt5-183"),
  createBossOrders("me2pt5-256"),

  // Professor's Research (multiple printings)
  createProfessorsResearch("sv1-189"),
  createProfessorsResearch("sv1-190"),
  createProfessorsResearch("sv1-240"),

  // Pokemon Center Lady
  pokemonCenterLady,

  // Nest Ball (multiple printings)
  createNestBall("sv1-181"),
  createNestBall("sv1-255"),
  createNestBall("sv4pt5-84"),

  // Energy Switch (multiple printings)
  createEnergySwitch("me1-115"),
  createEnergySwitch("sv1-173"),

  // Air Balloon (multiple printings)
  createAirBalloon("me1-166"),
  createAirBalloon("me2pt5-181"),

  // Sacred Charm (multiple printings)
  createSacredCharm("me2-93"),
  createSacredCharm("me2-122"),
];

// ═══════════════════════════════════════════════
// Name-based trainer effects (matches ANY printing by card name)
//
// One registration covers ALL printings of a card.
// e.g. "Iono" covers sv1-xxx, sv2-xxx, sv4pt5-xxx, etc.
// ═══════════════════════════════════════════════

type NamedEffect = CardEffectDef & { cardName: string };

// ───────────────────────────────────────────────
// Supporters (10)
// ───────────────────────────────────────────────

/** Iono — Both players shuffle hand into deck, then draw cards equal to remaining prize cards */
const ionoEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Iono",
  trainer: {
    onPlay: (ctx) => {
      // Both players shuffle hand into deck
      ctx.shuffleHandIntoDeck("player");
      ctx.shuffleHandIntoDeck("opponent");

      // Each draws cards = their remaining prize count
      const playerPrizes = ctx.player.prizes.cards.length;
      const opponentPrizes = ctx.opponent.prizes.cards.length;

      ctx.drawCards(playerPrizes, "player");
      ctx.drawCards(opponentPrizes, "opponent");

      ctx.log(`Iono! ${ctx.player.name} 抽了 ${playerPrizes} 张, ${ctx.opponent.name} 抽了 ${opponentPrizes} 张`);
    },
  },
};

/** Arven — Search deck for 1 Item and 1 Tool */
const arvenEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Arven",
  trainer: {
    onPlay: (ctx) => {
      // Search for 1 Item
      const item = ctx.searchDeck(
        (c) => c.card.supertype === "Trainer" && c.card.subtypes.includes("Item") && !c.card.subtypes.includes("Pokémon Tool"),
        1
      );
      for (const c of item) ctx.addToHand(c);

      // Search for 1 Tool
      const tool = ctx.searchDeck(
        (c) => c.card.supertype === "Trainer" && c.card.subtypes.includes("Pokémon Tool"),
        1
      );
      for (const c of tool) ctx.addToHand(c);

      ctx.shuffleDeck("player");
      ctx.log(`Arven: 搜索到 ${item.length} 张物品和 ${tool.length} 张工具`);
    },
  },
};

/** Nemona — Draw 3 cards */
const nemonaEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Nemona",
  trainer: {
    onPlay: (ctx) => {
      ctx.drawCards(3, "player");
    },
  },
};

/** Judge — Both players shuffle hand into deck, then each draws 4 */
const judgeEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Judge",
  trainer: {
    onPlay: (ctx) => {
      ctx.shuffleHandIntoDeck("player");
      ctx.shuffleHandIntoDeck("opponent");
      ctx.drawCards(4, "player");
      ctx.drawCards(4, "opponent");
      ctx.log("Judge! 双方各洗回手牌并抽 4 张");
    },
  },
};

/** Penny — Pick up your Active Pokemon and all attached cards to hand */
const pennyEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Penny",
  trainer: {
    canPlay: (ctx) => {
      // Must have an active Pokemon and bench to replace it
      return ctx.player.active !== null && ctx.player.bench.cards.length > 0;
    },
    onPlay: (ctx) => {
      if (!ctx.player.active) return;

      const collected = ctx.pickUpPokemon(ctx.player.active.instanceId, "player");

      // All collected cards go to hand
      for (const c of collected) {
        ctx.addToHand(c, "player");
      }

      // Auto-promote first bench Pokemon
      if (ctx.player.bench.cards.length > 0) {
        const promoted = ctx.player.bench.cards[0];
        ctx.player.bench.cards.splice(0, 1);
        ctx.player.active = promoted;
        ctx.log(`${promoted.card.name} 从备战区移到了战斗区`);
      }
    },
  },
};

/** Tulip — Get 2 Pokemon from discard to hand */
const tulipEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Tulip",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDiscard(
        (c) => c.card.supertype === "Pokémon",
        2
      );
      for (const c of found) ctx.addToHand(c);
      if (found.length > 0) {
        ctx.log(`Tulip: 从弃牌堆取回了 ${found.map(c => c.card.name).join(", ")}`);
      }
    },
  },
};

/** Lacey — You draw until you have 4 cards, opponent draws until 8 cards */
const laceyEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Lacey",
  trainer: {
    onPlay: (ctx) => {
      const playerDraw = Math.max(0, 4 - ctx.player.hand.cards.length);
      const opponentDraw = Math.max(0, 8 - ctx.opponent.hand.cards.length);
      if (playerDraw > 0) ctx.drawCards(playerDraw, "player");
      if (opponentDraw > 0) ctx.drawCards(opponentDraw, "opponent");
      ctx.log(`Lacey: ${ctx.player.name} 抽了 ${playerDraw} 张, ${ctx.opponent.name} 抽了 ${opponentDraw} 张`);
    },
  },
};

/** Professor Sada's Vitality — Attach a Basic Energy from discard to a Pokemon */
const profSadaEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Professor Sada's Vitality",
  trainer: {
    onPlay: (ctx) => {
      // Attach 1 basic energy from discard to active
      if (ctx.player.active) {
        ctx.attachEnergyFromDiscard(
          (c) => c.card.supertype === "Energy" && (c.card.subtypes?.includes("Basic") ?? false),
          1,
          ctx.player.active
        );
      }
    },
  },
};

/** Professor Turo's Scenario — Pick up your Active Pokemon and all cards to hand */
const profTuroEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Professor Turo's Scenario",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.active !== null && ctx.player.bench.cards.length > 0;
    },
    onPlay: (ctx) => {
      if (!ctx.player.active) return;

      const collected = ctx.pickUpPokemon(ctx.player.active.instanceId, "player");
      for (const c of collected) {
        ctx.addToHand(c, "player");
      }

      // Auto-promote first bench Pokemon
      if (ctx.player.bench.cards.length > 0) {
        const promoted = ctx.player.bench.cards[0];
        ctx.player.bench.cards.splice(0, 1);
        ctx.player.active = promoted;
        ctx.log(`${promoted.card.name} 从备战区移到了战斗区`);
      }
    },
  },
};

/** Jacq — Draw 2 cards */
const jacqEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Jacq",
  trainer: {
    onPlay: (ctx) => {
      ctx.drawCards(2, "player");
    },
  },
};

// ───────────────────────────────────────────────
// Items (17)
// ───────────────────────────────────────────────

/** Ultra Ball — Discard 2 hand cards, search deck for any Pokemon */
const ultraBallEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Ultra Ball",
  trainer: {
    canPlay: (ctx) => {
      // Need at least 2 other hand cards to discard (ultra ball already removed from hand by engine)
      return ctx.player.hand.cards.length >= 2;
    },
    onPlay: (ctx) => {
      // Discard 2 cards from hand
      ctx.discardFromHand(2, "player");

      // Search for any Pokemon
      const found = ctx.searchDeck(
        (c) => c.card.supertype === "Pokémon",
        1
      );
      for (const c of found) ctx.addToHand(c);
      ctx.shuffleDeck("player");

      if (found.length > 0) {
        ctx.log(`Ultra Ball: 丢弃 2 张手牌，搜索到 ${found[0].card.name}`);
      }
    },
  },
};

/** Switch — Switch your Active Pokemon with a Benched Pokemon */
const switchEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Switch",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.active !== null && ctx.player.bench.cards.length > 0;
    },
    onPlay: (ctx) => {
      if (ctx.player.bench.cards.length > 0) {
        ctx.switchOwnActive(ctx.player.bench.cards[0].instanceId);
      }
    },
  },
};

/** Night Stretcher — Get 1 Pokemon from discard to hand */
const nightStretcherEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Night Stretcher",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDiscard(
        (c) => c.card.supertype === "Pokémon",
        1
      );
      for (const c of found) ctx.addToHand(c);
    },
  },
};

/** Buddy-Buddy Poffin — Search deck for 2 Basic Pokemon with 70HP or less, put on bench */
const buddyPoffinEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Buddy-Buddy Poffin",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.bench.cards.length < 5;
    },
    onPlay: (ctx) => {
      const benchSpace = 5 - ctx.player.bench.cards.length;
      const searchCount = Math.min(2, benchSpace);

      const found = ctx.searchDeck(
        (c) => {
          if (c.card.supertype !== "Pokémon") return false;
          if (!c.card.subtypes.includes("Basic")) return false;
          const hp = parseInt(c.card.hp || "0", 10);
          return hp > 0 && hp <= 70;
        },
        searchCount
      );

      for (const pokemon of found) {
        pokemon.playedThisTurn = true;
        ctx.player.bench.cards.push(pokemon);
        ctx.log(`${pokemon.card.name} 从牌组放到了备战区`);
      }

      ctx.shuffleDeck("player");
    },
  },
};

/** Super Rod — Shuffle up to 3 Pokemon and/or Energy from discard into deck */
const superRodEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Super Rod",
  trainer: {
    onPlay: (ctx) => {
      // Pick up to 3 Pokemon/Energy from discard
      const found = ctx.searchDiscard(
        (c) => c.card.supertype === "Pokémon" || c.card.supertype === "Energy",
        3
      );
      if (found.length > 0) {
        ctx.shuffleIntoDeck(found, "player");
        ctx.log(`Super Rod: 将 ${found.length} 张牌洗入牌组`);
      }
    },
  },
};

/** Pokemon Catcher — Flip coin. Heads: switch opponent's active with bench */
const pokemonCatcherEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Pokémon Catcher",
  trainer: {
    canPlay: (ctx) => {
      return ctx.opponent.bench.cards.length > 0 && ctx.opponent.active !== null;
    },
    onPlay: (ctx) => {
      const heads = ctx.flipCoin();
      if (heads && ctx.opponent.bench.cards.length > 0) {
        ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
      } else {
        ctx.log("Pokémon Catcher: 反面，没有效果");
      }
    },
  },
};

/** Counter Catcher — If behind on prizes, switch opponent's active with bench */
const counterCatcherEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Counter Catcher",
  trainer: {
    canPlay: (ctx) => {
      // Can only use if behind on prizes (more remaining = behind)
      return (
        ctx.player.prizes.cards.length > ctx.opponent.prizes.cards.length &&
        ctx.opponent.bench.cards.length > 0 &&
        ctx.opponent.active !== null
      );
    },
    onPlay: (ctx) => {
      if (ctx.opponent.bench.cards.length > 0) {
        ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
      }
    },
  },
};

/** Great Ball — Look at top 7 cards of deck, take 1 Pokemon */
const greatBallEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Great Ball",
  trainer: {
    onPlay: (ctx) => {
      const revealed = ctx.revealTopCards(7, "player");

      // Find a Pokemon among revealed
      const pokemonIdx = revealed.findIndex(c => c.card.supertype === "Pokémon");

      if (pokemonIdx !== -1) {
        const pokemon = revealed.splice(pokemonIdx, 1)[0];
        ctx.addToHand(pokemon, "player");
        ctx.log(`Great Ball: 找到了 ${pokemon.card.name}!`);
      } else {
        ctx.log("Great Ball: 没有找到宝可梦");
      }

      // Put rest back on top in any order
      if (revealed.length > 0) {
        ctx.putOnTopOfDeck(revealed, "player");
      }
    },
  },
};

/** Poke Ball — Flip coin. Heads: search deck for a Pokemon */
const pokeBallEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Poké Ball",
  trainer: {
    onPlay: (ctx) => {
      const heads = ctx.flipCoin();
      if (heads) {
        const found = ctx.searchDeck(
          (c) => c.card.supertype === "Pokémon",
          1
        );
        for (const c of found) ctx.addToHand(c);
        ctx.shuffleDeck("player");
        if (found.length > 0) {
          ctx.log(`Poké Ball: 正面! 搜索到 ${found[0].card.name}`);
        }
      } else {
        ctx.log("Poké Ball: 反面，没有效果");
      }
    },
  },
};

/** Energy Search — Search deck for 1 Basic Energy */
const energySearchEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Energy Search",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDeck(
        (c) => c.card.supertype === "Energy" && (c.card.subtypes?.includes("Basic") ?? false),
        1
      );
      for (const c of found) ctx.addToHand(c);
      ctx.shuffleDeck("player");
    },
  },
};

/** Potion — Heal 30 from 1 of your Pokemon */
const potionEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Potion",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.active !== null;
    },
    onPlay: (ctx) => {
      if (ctx.player.active) {
        ctx.heal(30, ctx.player.active);
      }
    },
  },
};

/** Crushing Hammer — Flip coin. Heads: discard 1 energy from opponent's active */
const crushingHammerEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Crushing Hammer",
  trainer: {
    canPlay: (ctx) => {
      return ctx.opponent.active !== null && ctx.opponent.active.attachedEnergy.length > 0;
    },
    onPlay: (ctx) => {
      const heads = ctx.flipCoin();
      if (heads && ctx.opponent.active && ctx.opponent.active.attachedEnergy.length > 0) {
        const energy = ctx.opponent.active.attachedEnergy.pop()!;
        ctx.opponent.discard.cards.push(energy);
        ctx.log(`Crushing Hammer: 正面! 丢弃了 ${ctx.opponent.active.card.name} 的 ${energy.card.name}`);
      } else {
        ctx.log("Crushing Hammer: 反面，没有效果");
      }
    },
  },
};

/** Earthen Vessel — Discard 1 card, search deck for 2 Basic Energy to hand */
const earthenVesselEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Earthen Vessel",
  trainer: {
    canPlay: (ctx) => {
      return ctx.player.hand.cards.length >= 1;
    },
    onPlay: (ctx) => {
      ctx.discardFromHand(1, "player");
      const found = ctx.searchDeck(
        (c) => c.card.supertype === "Energy" && (c.card.subtypes?.includes("Basic") ?? false),
        2
      );
      for (const c of found) ctx.addToHand(c);
      ctx.shuffleDeck("player");
      ctx.log(`Earthen Vessel: 搜索到 ${found.length} 张基础能量`);
    },
  },
};

/** Electric Generator — Look at top 5 cards, attach up to 2 Lightning Energy to bench */
const electricGeneratorEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Electric Generator",
  trainer: {
    onPlay: (ctx) => {
      const revealed = ctx.revealTopCards(5, "player");

      // Find Lightning Energy
      const lightningEnergy: typeof revealed = [];
      const rest: typeof revealed = [];

      for (const c of revealed) {
        if (
          lightningEnergy.length < 2 &&
          c.card.supertype === "Energy" &&
          (c.card.name.includes("Lightning") || (c.card.types && c.card.types.includes("Lightning")))
        ) {
          lightningEnergy.push(c);
        } else {
          rest.push(c);
        }
      }

      // Attach to bench Pokemon (or active if no bench)
      const targets = ctx.getAllPokemon("player");
      let targetIdx = 0;
      for (const energy of lightningEnergy) {
        if (targets.length > 0) {
          const target = targets[targetIdx % targets.length];
          target.attachedEnergy.push(energy);
          ctx.log(`Electric Generator: 将 ${energy.card.name} 附加到 ${target.card.name}`);
          targetIdx++;
        } else {
          rest.push(energy); // No target, put back
        }
      }

      // Put rest back
      if (rest.length > 0) {
        ctx.putOnTopOfDeck(rest, "player");
        ctx.shuffleDeck("player");
      }
    },
  },
};

/** Pal Pad — Shuffle 2 Supporters from discard into deck */
const palPadEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Pal Pad",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDiscard(
        (c) => c.card.supertype === "Trainer" && c.card.subtypes.includes("Supporter"),
        2
      );
      if (found.length > 0) {
        ctx.shuffleIntoDeck(found, "player");
        ctx.log(`Pal Pad: 将 ${found.length} 张支持者洗入牌组`);
      }
    },
  },
};

/** Energy Retrieval — Get 2 Basic Energy from discard to hand */
const energyRetrievalEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Energy Retrieval",
  trainer: {
    onPlay: (ctx) => {
      const found = ctx.searchDiscard(
        (c) => c.card.supertype === "Energy" && (c.card.subtypes?.includes("Basic") ?? false),
        2
      );
      for (const c of found) ctx.addToHand(c);
    },
  },
};

/** Rare Candy — Stub: needs engine evolution skip support */
const rareCandyEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Rare Candy",
  trainer: {
    canPlay: (_ctx) => {
      // Stub — requires engine-level evolution skip support
      return false;
    },
    onPlay: (_ctx) => {
      // Stub — would allow Stage 2 evolution from Basic skipping Stage 1
    },
  },
};

// ───────────────────────────────────────────────
// Tools (3 new name-based)
// ───────────────────────────────────────────────

/** Choice Belt — +30 damage to ex/V Pokemon */
const choiceBeltEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Choice Belt",
  tool: {
    whileAttached: {
      modifyDamage: (ctx, damage) => {
        // Check if the defender is an ex or V Pokemon
        const defender = ctx.opponent.active;
        if (defender) {
          const subtypes = defender.card.subtypes;
          if (
            subtypes.includes("ex") ||
            subtypes.includes("V") ||
            subtypes.includes("VMAX") ||
            subtypes.includes("VSTAR")
          ) {
            return damage + 30;
          }
        }
        return damage;
      },
    },
  },
};

/** Vitality Band — +10 damage */
const vitalityBandEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Vitality Band",
  tool: {
    whileAttached: {
      modifyDamage: (_ctx, damage) => {
        return damage + 10;
      },
    },
  },
};

/** Defiance Band — +30 damage when behind on prizes */
const defianceBandEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Defiance Band",
  tool: {
    whileAttached: {
      modifyDamage: (ctx, damage) => {
        // +30 if behind on prizes (more remaining = behind)
        if (ctx.player.prizes.cards.length > ctx.opponent.prizes.cards.length) {
          return damage + 30;
        }
        return damage;
      },
    },
  },
};

// ───────────────────────────────────────────────
// Also register existing effects by name for name-based fallback
// ───────────────────────────────────────────────

const bossOrdersNameEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Boss's Orders",
  trainer: {
    canPlay: (ctx) => ctx.opponent.bench.cards.length > 0 && ctx.opponent.active !== null,
    onPlay: (ctx) => {
      if (ctx.opponent.bench.cards.length > 0) {
        ctx.switchOpponentActive(ctx.opponent.bench.cards[0].instanceId);
      }
    },
  },
};

const professorsResearchNameEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Professor's Research",
  trainer: {
    onPlay: (ctx) => {
      ctx.discardHand("player");
      ctx.drawCards(7, "player");
    },
  },
};

const pokemonCenterLadyNameEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Pokémon Center Lady",
  trainer: {
    canPlay: (ctx) => ctx.player.active !== null,
    onPlay: (ctx) => {
      if (ctx.player.active) {
        ctx.heal(60, ctx.player.active);
        ctx.removeAllStatus(ctx.player.active);
      }
    },
  },
};

const nestBallNameEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Nest Ball",
  trainer: {
    canPlay: (ctx) => ctx.player.bench.cards.length < 5,
    onPlay: (ctx) => {
      const found = ctx.searchDeck(
        (c) => c.card.supertype === "Pokémon" && c.card.subtypes.includes("Basic"),
        1
      );
      if (found.length > 0) {
        found[0].playedThisTurn = true;
        ctx.player.bench.cards.push(found[0]);
        ctx.log(`${found[0].card.name} 从牌组中搜索出来放到了备战区`);
      }
      ctx.shuffleDeck("player");
    },
  },
};

const energySwitchNameEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Energy Switch",
  trainer: {
    canPlay: (ctx) => {
      const all = ctx.getAllPokemon("player");
      return all.length >= 2 && all.some(p => p.attachedEnergy.length > 0);
    },
    onPlay: (ctx) => {
      const all = ctx.getAllPokemon("player");
      const withEnergy = all.find(p => p.attachedEnergy.length > 0);
      const target = all.find(p => p !== withEnergy);
      if (withEnergy && target && withEnergy.attachedEnergy.length > 0) {
        ctx.moveEnergy(withEnergy, target, withEnergy.attachedEnergy[0].instanceId);
      }
    },
  },
};

const airBalloonNameEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Air Balloon",
  tool: {
    whileAttached: {
      modifyRetreatCost: (_ctx, cost) => Math.max(0, cost - 2),
    },
  },
};

const sacredCharmNameEffect: NamedEffect = {
  cardId: "__name__",
  cardName: "Sacred Charm",
  tool: {
    whileAttached: {
      modifyIncomingDamage: (_ctx, damage) => Math.max(0, damage - 30),
    },
  },
};

// ═══════════════════════════════════════════════
// Export: Name-based effects
// ═══════════════════════════════════════════════

export const trainerNameEffects: NamedEffect[] = [
  // Supporters (10)
  ionoEffect,
  arvenEffect,
  nemonaEffect,
  judgeEffect,
  pennyEffect,
  tulipEffect,
  laceyEffect,
  profSadaEffect,
  profTuroEffect,
  jacqEffect,

  // Items (17)
  ultraBallEffect,
  switchEffect,
  nightStretcherEffect,
  buddyPoffinEffect,
  superRodEffect,
  pokemonCatcherEffect,
  counterCatcherEffect,
  greatBallEffect,
  pokeBallEffect,
  energySearchEffect,
  potionEffect,
  crushingHammerEffect,
  earthenVesselEffect,
  electricGeneratorEffect,
  palPadEffect,
  energyRetrievalEffect,
  rareCandyEffect,

  // Tools (3)
  choiceBeltEffect,
  vitalityBandEffect,
  defianceBandEffect,

  // Existing effects also registered by name
  bossOrdersNameEffect,
  professorsResearchNameEffect,
  pokemonCenterLadyNameEffect,
  nestBallNameEffect,
  energySwitchNameEffect,
  airBalloonNameEffect,
  sacredCharmNameEffect,
];
