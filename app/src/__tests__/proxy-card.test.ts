/**
 * Tests for Layer 1 (P0): Proxy Card Generation
 *
 * Tests that missing cards generate valid proxy Card objects,
 * that loadDeckCards correctly creates proxies when enabled,
 * and that proxy cards can participate in gameplay.
 */

import { createProxyCard, isProxyCard, ProxyCardEntry } from "@/engine/proxy-card";
import { loadDeckCards } from "@/engine/battle-setup";
import { getAllDeckCardEntries, StoredDeck, StoredDeckCard } from "@/services/deck-storage";
import { Card } from "@/types/card";
import { createGameCard } from "@/engine/game-state";

// ─── Helper: create a minimal StoredDeck for testing ───

function makeStoredDeck(cards: StoredDeckCard[]): StoredDeck {
  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);
  return {
    id: "test-deck-1",
    name: "Test Deck",
    createdAt: new Date().toISOString(),
    deckText: "",
    totalCards,
    isValid: true,
    cards,
    warnings: [],
    errors: [],
  };
}

function makeCard(overrides: Partial<StoredDeckCard> = {}): StoredDeckCard {
  return {
    cardId: "sv1-1",
    name: "Charmander",
    quantity: 1,
    setCode: "SVI",
    number: "001",
    category: "pokemon",
    found: true,
    standardLegal: true,
    ...overrides,
  };
}

// ─── Mock card lookup ───

const mockCardDb: Record<string, Card> = {
  "sv1-1": {
    id: "sv1-1",
    name: "Charmander",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "70",
    types: ["Fire"],
    attacks: [
      { name: "Scratch", cost: ["Fire"], damage: "20", text: "", convertedEnergyCost: 1 },
    ],
    retreatCost: ["Colorless"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "https://example.com/small.png", large: "https://example.com/large.png" },
  },
};

function mockCardLookup(id: string): Card | undefined {
  return mockCardDb[id];
}

// ═══════════════════════════════════════════
// createProxyCard — Basic Structure
// ═══════════════════════════════════════════

describe("createProxyCard", () => {
  test("generates a valid Card with correct id format", () => {
    const entry: ProxyCardEntry = { name: "Unknown Card", setCode: "SVI", number: "999", category: "pokemon" };
    const card = createProxyCard(entry);

    expect(card.id).toBe("proxy-SVI-999");
    expect(card.name).toBe("Unknown Card");
    expect(card.number).toBe("999");
    expect(card.images.small).toBe("");
    expect(card.images.large).toBe("");
    expect(card.rarity).toBe("Proxy");
  });

  test("generates a Pokémon card with HP, attacks, and retreatCost", () => {
    const entry: ProxyCardEntry = { name: "Pikachu", setCode: "SVI", number: "025", category: "pokemon" };
    const card = createProxyCard(entry);

    expect(card.supertype).toBe("Pokémon");
    expect(card.hp).toBe("70");
    expect(card.types).toEqual(["Colorless"]);
    expect(card.attacks).toHaveLength(1);
    expect(card.attacks![0].name).toBe("Tackle");
    expect(card.attacks![0].damage).toBe("30");
    expect(card.retreatCost).toEqual(["Colorless"]);
  });

  test("generates a Trainer card without HP/attacks", () => {
    const entry: ProxyCardEntry = { name: "Potion", setCode: "SVI", number: "100", category: "trainer" };
    const card = createProxyCard(entry);

    expect(card.supertype).toBe("Trainer");
    expect(card.hp).toBeUndefined();
    expect(card.attacks).toBeUndefined();
    expect(card.subtypes).toEqual(["Item"]);
  });

  test("generates an Energy card with inferred type", () => {
    const entry: ProxyCardEntry = { name: "Basic Fire Energy", setCode: "SVI", number: "200", category: "energy" };
    const card = createProxyCard(entry);

    expect(card.supertype).toBe("Energy");
    expect(card.subtypes).toEqual(["Basic"]);
    expect(card.types).toEqual(["Fire"]);
  });
});

// ═══════════════════════════════════════════
// createProxyCard — Name Heuristics
// ═══════════════════════════════════════════

describe("createProxyCard — name heuristics", () => {
  test("detects ex Pokemon", () => {
    const card = createProxyCard({ name: "Charizard ex", setCode: "SVI", number: "006", category: "pokemon" });
    expect(card.subtypes).toContain("ex");
    expect(card.hp).toBe("230");
  });

  test("detects V Pokemon", () => {
    const card = createProxyCard({ name: "Lumineon V", setCode: "BRS", number: "040", category: "pokemon" });
    expect(card.subtypes).toContain("V");
    expect(card.hp).toBe("220");
  });

  test("detects VMAX Pokemon", () => {
    const card = createProxyCard({ name: "Charizard VMAX", setCode: "DAA", number: "020", category: "pokemon" });
    expect(card.subtypes).toContain("VMAX");
    expect(card.hp).toBe("330");
  });

  test("detects Supporter trainers", () => {
    const card = createProxyCard({ name: "Professor's Research", setCode: "SVI", number: "189", category: "trainer" });
    expect(card.subtypes).toEqual(["Supporter"]);
  });

  test("detects Tool trainers", () => {
    const card = createProxyCard({ name: "Choice Belt", setCode: "BRS", number: "135", category: "trainer" });
    expect(card.subtypes).toEqual(["Pokémon Tool"]);
  });

  test("defaults unknown energy to Special", () => {
    const card = createProxyCard({ name: "Double Turbo Energy", setCode: "BRS", number: "151", category: "energy" });
    expect(card.subtypes).toEqual(["Special"]);
  });

  test("defaults unknown trainer to Item", () => {
    const card = createProxyCard({ name: "Mystery Gadget", setCode: "SVI", number: "300", category: "trainer" });
    expect(card.subtypes).toEqual(["Item"]);
  });
});

// ═══════════════════════════════════════════
// isProxyCard
// ═══════════════════════════════════════════

describe("isProxyCard", () => {
  test("returns true for proxy cards", () => {
    const card = createProxyCard({ name: "Test", setCode: "X", number: "1", category: "pokemon" });
    expect(isProxyCard(card)).toBe(true);
  });

  test("returns false for normal cards", () => {
    expect(isProxyCard(mockCardDb["sv1-1"])).toBe(false);
  });
});

// ═══════════════════════════════════════════
// getAllDeckCardEntries
// ═══════════════════════════════════════════

describe("getAllDeckCardEntries", () => {
  test("returns all entries including unfound cards", () => {
    const deck = makeStoredDeck([
      makeCard({ found: true, cardId: "sv1-1", name: "Charmander", quantity: 4 }),
      makeCard({ found: false, cardId: "", name: "Missing Card", quantity: 2 }),
    ]);

    const entries = getAllDeckCardEntries(deck);
    expect(entries).toHaveLength(2);
    expect(entries[0].found).toBe(true);
    expect(entries[0].cardId).toBe("sv1-1");
    expect(entries[1].found).toBe(false);
    expect(entries[1].cardId).toBeNull();
  });
});

// ═══════════════════════════════════════════
// loadDeckCards — proxy mode
// ═══════════════════════════════════════════

describe("loadDeckCards with enableProxyCards", () => {
  test("enableProxyCards=true generates proxies for unfound cards", () => {
    const deck = makeStoredDeck([
      makeCard({ found: true, cardId: "sv1-1", name: "Charmander", quantity: 2 }),
      makeCard({ found: false, cardId: "", name: "Missing Pokemon", quantity: 2, setCode: "SVI", number: "999" }),
    ]);

    const result = loadDeckCards(deck, mockCardLookup, true);

    expect(result.totalLoaded).toBe(4); // 2 real + 2 proxy
    expect(result.totalExpected).toBe(4);
    expect(result.missingCards).toHaveLength(2); // 2 proxies were created
    expect(result.gameCards).toHaveLength(4);

    // The first 2 should be real Charmanders
    expect(result.gameCards[0].card.name).toBe("Charmander");
    expect(result.gameCards[0].card.rarity).not.toBe("Proxy");

    // The last 2 should be proxies
    expect(result.gameCards[2].card.name).toBe("Missing Pokemon");
    expect(result.gameCards[2].card.rarity).toBe("Proxy");
  });

  test("enableProxyCards=true creates proxy when card ID exists but not in DB", () => {
    const deck = makeStoredDeck([
      makeCard({ found: true, cardId: "nonexistent-id", name: "DB Miss Card", quantity: 1 }),
    ]);

    const result = loadDeckCards(deck, mockCardLookup, true);

    expect(result.totalLoaded).toBe(1);
    expect(result.missingCards).toHaveLength(1);
    expect(result.gameCards[0].card.rarity).toBe("Proxy");
  });

  test("enableProxyCards=false (default) skips unfound cards", () => {
    const deck = makeStoredDeck([
      makeCard({ found: true, cardId: "sv1-1", name: "Charmander", quantity: 2 }),
      makeCard({ found: false, cardId: "", name: "Missing Card", quantity: 2 }),
    ]);

    const result = loadDeckCards(deck, mockCardLookup, false);

    // Only the found cards should be loaded
    expect(result.totalLoaded).toBe(2);
    expect(result.gameCards).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════
// Proxy cards in gameplay
// ═══════════════════════════════════════════

describe("proxy cards in gameplay", () => {
  test("proxy Pokémon can be converted to GameCard", () => {
    const proxyCard = createProxyCard({ name: "Proxy Mon", setCode: "X", number: "1", category: "pokemon" });
    const gameCard = createGameCard(proxyCard);

    expect(gameCard.card.name).toBe("Proxy Mon");
    expect(gameCard.instanceId).toBeTruthy();
    expect(gameCard.damageCounters).toBe(0);
    expect(gameCard.attachedEnergy).toEqual([]);
  });

  test("proxy Pokémon can receive energy attachment", () => {
    const proxyCard = createProxyCard({ name: "Proxy Mon", setCode: "X", number: "1", category: "pokemon" });
    const gameCard = createGameCard(proxyCard);

    const energyProxy = createProxyCard({ name: "Basic Fire Energy", setCode: "X", number: "200", category: "energy" });
    const energyGameCard = createGameCard(energyProxy);

    gameCard.attachedEnergy.push(energyGameCard);
    expect(gameCard.attachedEnergy).toHaveLength(1);
    expect(gameCard.attachedEnergy[0].card.types).toEqual(["Fire"]);
  });

  test("proxy Pokémon can take damage and be KO'd", () => {
    const proxyCard = createProxyCard({ name: "Proxy Basic", setCode: "X", number: "1", category: "pokemon" });
    const gameCard = createGameCard(proxyCard);

    // HP should be 70 for basic
    const hp = parseInt(gameCard.card.hp || "0", 10);
    expect(hp).toBe(70);

    // Apply 7 damage counters (70 damage) — should KO
    gameCard.damageCounters = 7;
    const currentHp = hp - gameCard.damageCounters * 10;
    expect(currentHp).toBeLessThanOrEqual(0);
  });
});
