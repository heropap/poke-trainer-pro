/**
 * Stadium Card Effects
 *
 * Stadium cards are shared field effects that persist until replaced.
 * PTCG rules:
 * - Only one stadium in play at a time
 * - Playing a new stadium discards the old one
 * - Can't play a stadium with the same name as the one in play
 * - Both players can use the stadium's effect
 * - One stadium per turn
 *
 * Implemented stadiums:
 * - Beach Court: Basic Pokemon retreat cost -1
 * - Artazon: Search deck for non-Rule Box Basic Pokemon
 * - Iono's Palace: Discard opponent's hand and draw to match
 * - Academy at Night: Put a card from hand on top of deck
 * - Mesagoza: Discard hand and draw 5
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
     * @param ctx - Effect context
     * @param currentCost - Current retreat cost
     * @param card - The Pokemon retreating
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
      // Artazon is a persistent effect — activation is voluntary each turn.
      // The onPlay does nothing; the effect is used via use_ability on the stadium.
    },
  },
};

// ───────────────────────────────────────────────
// Iono's Palace
// ───────────────────────────────────────────────
// Once during each player's turn, that player may reveal their hand.
// If they do, their opponent shuffles their hand into their deck and
// draws a number of cards equal to the number of cards the player revealed.
// (Simplified: shuffle opponent's hand, draw equal to player's hand size)

const ionosPalace: CardEffectDef & { cardName: string } = {
  cardId: "name:Iono's Palace",
  cardName: "Iono's Palace",
  trainer: {
    onPlay: () => {
      // Persistent effect — activation is voluntary each turn
    },
  },
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
      // Persistent effect — activation is voluntary each turn
    },
  },
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
      // Persistent effect — activation is voluntary each turn
    },
  },
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
