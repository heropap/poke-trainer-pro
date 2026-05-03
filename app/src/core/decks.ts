import { charizardExDeck } from "./decks/charizard-ex";
import type { DeckDef } from "./types";

export const DECKS: DeckDef[] = [charizardExDeck];

export function getDeck(slug: string): DeckDef {
  const deck = DECKS.find((d) => d.slug === slug);
  if (!deck) throw new Error(`Deck not found: ${slug}`);
  return deck;
}

export { charizardExDeck };
