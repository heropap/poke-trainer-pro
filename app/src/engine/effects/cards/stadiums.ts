/**
 * Stadium Card Effects
 *
 * Stadium cards are shared field effects that persist until replaced.
 * PTCG rules:
 * - Only one stadium in play at a time
 * - Playing a new stadium discards the old one
 * - Can't play a stadium with the same name as the one in play
 * - Both players can use the stadium's effect
 * - One stadium use per turn per player (tracked by turnStatus.hasUsedStadium)
 *
 * Implemented stadiums:
 * - Beach Court: Basic Pokemon retreat cost -1 (passive/continuous)
 * - Artazon: Search deck for non-Rule Box Basic Pokemon (activated)
 * - Iono's Palace: Opponent shuffles hand, draws equal to player's hand size (activated)
 * - Academy at Night: Put a card from hand on top of deck (activated)
 * - Mesagoza: Discard hand and draw 5 (activated)
 */

import { CardEffectDef } from "../effect-types";

// ───────────────────────────────────────────────
// Beach Court
// ───────────────────────────────────────────────
// Each player's Basic Pokémon has -1 retreat cost.
// This is a passive/continuous effect — implemented via retreat cost checks.

const beachCourt: CardEffectDef & { cardName: string } = {
  cardId: "name:Beach Court",
  cardName: "Beach Court",
  trainer: {
    onPlay: () => {
      // Beach Court has a continuous effect (retreat cost reduction)
      // The modifyRetreatCost below is queried by turn-actions.ts getEffectiveRetreatCost()
    },
    /**
     * Stadium modifier: Basic Pokemon retreat cost -1.
     * Called by getEffectiveRetreatCost() when a stadium is in play.
     */
    modifyRetreatCost: (_ctx: any, currentCost: number, card: any) => {
      if (card?.card?.subtypes?.includes("Basic")) {
        return currentCost - 1;
      }
      return currentCost;
    },
  } as any,
};

// ───────────────────────────────────────────────
// Artazon
// ───────────────────────────────────────────────
// Once during each player's turn, that player may search their deck
// for a Basic Pokémon that doesn't have a Rule Box and put it onto
// their Bench. Then, that player shuffles their deck.

const artazon: CardEffectDef & { cardName: string } = {
  cardId: "name:Artazon",
  cardName: "Artazon",
  trainer: {
    onPlay: () => {
      // Persistent effect — activation is voluntary each turn via use_stadium action
    },
  },
  abilities: [
    {
      name: "Artazon",
      type: "activated" as const,
      canActivate: (ctx) => {
        // Must have bench space and Basic non-Rule Box Pokemon in deck
        const benchSpace = 5 - ctx.player.bench.cards.length;
        if (benchSpace <= 0) return false;
        return ctx.player.deck.cards.some(
          (c) =>
            c.card.supertype === "Pokémon" &&
            c.card.subtypes.includes("Basic") &&
            !c.card.subtypes.some((s: string) =>
              s.includes("ex") || s.includes("V") || s.includes("VSTAR") || s.includes("VMAX")
            )
        );
      },
      onActivate: async (ctx) => {
        const found = await ctx.promptSearchDeck!(
          (c) =>
            c.card.supertype === "Pokémon" &&
            c.card.subtypes.includes("Basic") &&
            !c.card.subtypes.some((s: string) =>
              s.includes("ex") || s.includes("V") || s.includes("VSTAR") || s.includes("VMAX")
            ),
          1,
          "Artazon: 从牌组选择一只没有规则框的基础宝可梦放到备战区",
          "player",
          0 // min 0 — can cancel
        );
        for (const pokemon of found) {
          pokemon.playedThisTurn = true;
          ctx.player.bench.cards.push(pokemon);
        }
        ctx.shuffleDeck("player");
        if (found.length > 0) {
          ctx.log(`Artazon: 从牌组搜索了 ${found[0].card.name} 放到备战区`);
        }
      },
    },
  ],
};

// ───────────────────────────────────────────────
// Iono's Palace
// ───────────────────────────────────────────────
// Once during each player's turn, that player may reveal their hand.
// If they do, their opponent shuffles their hand into their deck and
// draws a number of cards equal to the number of cards the player revealed.

const ionosPalace: CardEffectDef & { cardName: string } = {
  cardId: "name:Iono's Palace",
  cardName: "Iono's Palace",
  trainer: {
    onPlay: () => {
      // Persistent effect — activation is voluntary each turn via use_stadium action
    },
  },
  abilities: [
    {
      name: "Iono's Palace",
      type: "activated" as const,
      canActivate: (ctx) => {
        // Need cards in hand to reveal
        return ctx.player.hand.cards.length > 0;
      },
      onActivate: (ctx) => {
        // Reveal hand (implied), opponent shuffles hand into deck and draws equal to revealed count
        const revealedCount = ctx.player.hand.cards.length;
        // Shuffle opponent's hand into deck
        while (ctx.opponent.hand.cards.length > 0) {
          const card = ctx.opponent.hand.cards.pop()!;
          ctx.opponent.deck.cards.push(card);
        }
        ctx.shuffleDeck("opponent");
        // Opponent draws equal to player's revealed hand
        ctx.drawCards(revealedCount, "opponent");
        ctx.log(`Iono's Palace: 对手洗回手牌，抽了 ${revealedCount} 张`);
      },
    },
  ],
};

// ───────────────────────────────────────────────
// Academy at Night
// ───────────────────────────────────────────────
// Once during each player's turn, that player may put a card from
// their hand on top of their deck.

const academyAtNight: CardEffectDef & { cardName: string } = {
  cardId: "name:Academy at Night",
  cardName: "Academy at Night",
  trainer: {
    onPlay: () => {
      // Persistent effect — activation is voluntary each turn via use_stadium action
    },
  },
  abilities: [
    {
      name: "Academy at Night",
      type: "activated" as const,
      canActivate: (ctx) => ctx.player.hand.cards.length > 0,
      onActivate: async (ctx) => {
        // Put a card from hand on top of deck
        const targets = ctx.player.hand.cards.map((c) => c.instanceId);
        const selection = await ctx.promptUser({
          message: "Academy at Night: 选择一张手牌放到牌组顶部",
          min: 1,
          max: 1,
          zone: "hand",
          targets,
        });
        if (selection && selection.length > 0) {
          const card = ctx.player.hand.cards.find((c) => c.instanceId === selection[0]);
          if (card) {
            const idx = ctx.player.hand.cards.indexOf(card);
            ctx.player.hand.cards.splice(idx, 1);
            // Add to top of deck (unshift = top)
            ctx.player.deck.cards.unshift(card);
            ctx.log(`Academy at Night: 将 ${card.card.name} 放到了牌组顶部`);
          }
        }
      },
    },
  ],
};

// ───────────────────────────────────────────────
// Mesagoza
// ───────────────────────────────────────────────
// Once during each player's turn, that player may discard their hand
// and draw 5 cards.

const mesagoza: CardEffectDef & { cardName: string } = {
  cardId: "name:Mesagoza",
  cardName: "Mesagoza",
  trainer: {
    onPlay: () => {
      // Persistent effect — activation is voluntary each turn via use_stadium action
    },
  },
  abilities: [
    {
      name: "Mesagoza",
      type: "activated" as const,
      canActivate: () => true, // Always activatable (even with empty hand — discard 0, draw 5)
      onActivate: (ctx) => {
        const discarded = ctx.player.hand.cards.length;
        ctx.discardHand("player");
        ctx.drawCards(5, "player");
        ctx.log(`Mesagoza: 弃掉 ${discarded} 张手牌，抽了 5 张`);
      },
    },
  ],
};

// ───────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────

/** All stadium effects (name-based registration) */
export const stadiumNameEffects: (CardEffectDef & { cardName: string })[] = [
  beachCourt,
  artazon,
  ionosPalace,
  academyAtNight,
  mesagoza,
];
