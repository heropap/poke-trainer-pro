/**
 * Prebuilt Deck Effects Coverage Tests
 *
 * Verifies that all trainer/item/supporter cards in prebuilt decks
 * have registered effects in the effect system.
 */

import { PREBUILT_DECKS } from "@/data/prebuilt-decks";
import { parseDeckList } from "@/lib/deck-parser";
import { initializeEffects } from "@/engine/effects";
import { hasEffect, getRegisteredCount } from "@/engine/effects/effect-registry";

// Initialize effects system
beforeAll(() => {
  initializeEffects();
});

describe("Prebuilt Deck Effect Coverage", () => {
  test("effect system has 100+ registered effects", () => {
    const count = getRegisteredCount();
    expect(count).toBeGreaterThanOrEqual(100);
  });

  const trainerNames = new Set<string>();
  for (const deck of PREBUILT_DECKS) {
    const parsed = parseDeckList(deck.deckText);
    for (const entry of parsed.entries) {
      if (entry.category === "trainer") {
        trainerNames.add(entry.name);
      }
    }
  }

  test.each(Array.from(trainerNames))("Trainer '%s' has registered effect", (name) => {
    // Check by name-based lookup
    const found = hasEffect(`name:${name}`, name);
    expect(found).toBe(true);
  });

  // Check key Pokemon effects
  const keyPokemon = [
    "Charizard ex",
    "Pidgeot ex",
    "Gardevoir ex",
    "Miraidon ex",
    "Lumineon V",
    "Comfey",
    "Radiant Greninja",
    "Manaphy",
  ];

  test.each(keyPokemon)("Pokemon '%s' has registered effect", (name) => {
    const found = hasEffect(`name:${name}`, name);
    expect(found).toBe(true);
  });
});
