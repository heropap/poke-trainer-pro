/**
 * Prebuilt Decks Tests
 *
 * Validates that all prebuilt decks:
 * 1. Have valid PTCG Live format text
 * 2. Parse correctly with parseDeckList
 * 3. Have 60 cards total
 * 4. Contain required metadata
 */

import { PREBUILT_DECKS, PrebuiltDeck } from "@/data/prebuilt-decks";
import { parseDeckList } from "@/lib/deck-parser";

describe("Prebuilt Decks", () => {
  test("has at least 3 prebuilt decks", () => {
    expect(PREBUILT_DECKS.length).toBeGreaterThanOrEqual(3);
  });

  test("each deck has required metadata", () => {
    for (const deck of PREBUILT_DECKS) {
      expect(deck.name).toBeTruthy();
      expect(deck.description).toBeTruthy();
      expect(deck.archetype).toBeTruthy();
      expect(deck.deckText).toBeTruthy();
    }
  });

  test("each deck has unique name", () => {
    const names = PREBUILT_DECKS.map((d) => d.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  describe.each(PREBUILT_DECKS.map((d) => [d.name, d]))(
    "Deck: %s",
    (_name: string, deck: PrebuiltDeck) => {
      test("parses without errors", () => {
        const parsed = parseDeckList(deck.deckText);
        expect(parsed.errors.length).toBe(0);
      });

      test("has 60 cards", () => {
        const parsed = parseDeckList(deck.deckText);
        const totalCards = parsed.entries.reduce(
          (sum, e) => sum + e.quantity,
          0
        );
        expect(totalCards).toBe(60);
      });

      test("has Pokemon, Trainer, and Energy categories", () => {
        const parsed = parseDeckList(deck.deckText);
        const categories = new Set(parsed.entries.map((e) => e.category));
        expect(categories.has("pokemon")).toBe(true);
        expect(categories.has("trainer")).toBe(true);
        expect(categories.has("energy")).toBe(true);
      });

      test("has at least 1 basic Pokemon", () => {
        const parsed = parseDeckList(deck.deckText);
        const pokemon = parsed.entries.filter((e) => e.category === "pokemon");
        expect(pokemon.length).toBeGreaterThanOrEqual(1);
      });
    }
  );
});
