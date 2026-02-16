/**
 * Trainer Card Effects - Supporters, Items, and Tools
 *
 * Initial batch of 7 trainer card implementations covering:
 * - Supporters: Boss's Orders, Professor's Research, Pokemon Center Lady
 * - Items: Nest Ball, Energy Switch
 * - Tools: Air Balloon, Sacred Charm
 */

import { CardEffectDef } from "../effect-types";

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
