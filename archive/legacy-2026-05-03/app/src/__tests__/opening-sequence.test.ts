/**
 * Opening Sequence Tests
 *
 * Tests for the coin flip result propagation via SetupResult,
 * the setFirstPlayer function, and the opening sequence flow.
 */

import { Card } from "@/types/card";
import {
  createGameCard,
  createGameState,
  createZone,
  resetInstanceCounter,
  GameState,
  GamePhase,
} from "@/engine/game-state";
import {
  flipCoin,
  setFirstPlayer,
  autoPlaceBasicPokemon,
  placeBasicPokemon,
  setPrizeCards,
  executePreparation,
} from "@/engine/battle-prepare";
import {
  shuffleZone,
  drawMultiple,
  addCards,
} from "@/engine/zones";
import { initializeGame } from "@/engine/battle-setup";
import { StoredDeck } from "@/services/deck-storage";

// ─── Test Card Fixtures ───

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "sv1-1",
    name: "Pineco",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "70",
    types: ["Grass"],
    attacks: [{ name: "Tackle", damage: "20", text: "", cost: ["Colorless"], convertedEnergyCost: 1 }],
    weaknesses: [{ type: "Fire", value: "×2" }],
    retreatCost: ["Colorless"],
    convertedRetreatCost: 1,
    set: { id: "sv1", name: "SV1" } as Card["set"],
    number: "1",
    images: { small: "", large: "" },
    ...overrides,
  } as Card;
}

const basicPokemon1 = makeCard({ id: "sv1-1", name: "Pineco", hp: "70" });
const basicPokemon2 = makeCard({ id: "sv1-2", name: "Ralts", hp: "60" });
const trainerCard = makeCard({
  id: "sv1-t1",
  name: "Professor's Research",
  supertype: "Trainer",
  subtypes: ["Supporter"],
  hp: undefined,
  types: [],
  attacks: [],
});

function createTestState(
  hand0Cards: Card[],
  hand1Cards: Card[],
  deckSize = 40
): GameState {
  const state = createGameState("Player A", "Player B");
  state.players[0].hand = createZone(hand0Cards.map((c) => createGameCard(c)));
  state.players[1].hand = createZone(hand1Cards.map((c) => createGameCard(c)));
  // Fill decks
  for (let i = 0; i < deckSize; i++) {
    state.players[0].deck.cards.push(createGameCard(trainerCard));
    state.players[1].deck.cards.push(createGameCard(trainerCard));
  }
  return state;
}

function createMockDeck(name: string): StoredDeck {
  return {
    id: `deck-${name}`,
    name,
    createdAt: new Date().toISOString(),
    deckText: "",
    totalCards: 60,
    isValid: true,
    warnings: [],
    errors: [],
    cards: [
      { name: "Pineco", setCode: "SVI", number: "1", quantity: 4, category: "pokemon" as const, found: true, cardId: "sv1-1", standardLegal: true },
      { name: "Ralts", setCode: "SVI", number: "2", quantity: 4, category: "pokemon" as const, found: true, cardId: "sv1-2", standardLegal: true },
      { name: "Professor's Research", setCode: "SVI", number: "t1", quantity: 4, category: "trainer" as const, found: true, cardId: "sv1-t1", standardLegal: true },
      { name: "Fire Energy", setCode: "SVE", number: "2", quantity: 48, category: "energy" as const, found: true, cardId: "sve-2", standardLegal: true },
    ],
  };
}

// ─── Tests ───

describe("setFirstPlayer", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  it("sets currentPlayer to the specified index", () => {
    const state = createGameState("Alice", "Bob");
    state.currentPlayer = 0;

    setFirstPlayer(state, 1);

    expect(state.currentPlayer).toBe(1);
  });

  it("logs the selection event", () => {
    const state = createGameState("Alice", "Bob");

    setFirstPlayer(state, 0);

    expect(state.log.some((e) => e.message.includes("Alice") && e.message.includes("先攻"))).toBe(true);
  });

  it("can override coin flip winner's choice", () => {
    const state = createGameState("Alice", "Bob");

    // Coin flip gives player 0
    flipCoin(state, () => 0.1);
    expect(state.currentPlayer).toBe(0);

    // Winner chooses to go second
    setFirstPlayer(state, 1);
    expect(state.currentPlayer).toBe(1);
  });
});

describe("SetupResult.coinFlipResult", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  const cardLookup = (id: string): Card | undefined => {
    const map: Record<string, Card> = {
      "sv1-1": basicPokemon1,
      "sv1-2": basicPokemon2,
      "sv1-t1": trainerCard,
      "sve-2": makeCard({
        id: "sve-2",
        name: "Fire Energy",
        supertype: "Energy",
        subtypes: ["Basic"],
        hp: undefined,
        types: ["Fire"],
        attacks: [],
      }),
    };
    return map[id];
  };

  it("returns coinFlipResult when fullPreparation is true", () => {
    const deck1 = createMockDeck("Deck A");
    const deck2 = createMockDeck("Deck B");

    const result = initializeGame(deck1, deck2, cardLookup, "Alice", "Bob", {
      fullPreparation: true,
      randomFn: () => 0.3, // heads → player 0 wins
    });

    expect(result.success).toBe(true);
    expect(result.coinFlipResult).toBeDefined();
    expect(result.coinFlipResult!.result).toBe("heads");
    expect(result.coinFlipResult!.winner).toBe(0);
  });

  it("returns coinFlipResult with tails when randomFn >= 0.5", () => {
    const deck1 = createMockDeck("Deck A");
    const deck2 = createMockDeck("Deck B");

    const result = initializeGame(deck1, deck2, cardLookup, "Alice", "Bob", {
      fullPreparation: true,
      randomFn: () => 0.7, // tails → player 1 wins
    });

    expect(result.success).toBe(true);
    expect(result.coinFlipResult).toBeDefined();
    expect(result.coinFlipResult!.result).toBe("tails");
    expect(result.coinFlipResult!.winner).toBe(1);
  });

  it("returns undefined coinFlipResult when fullPreparation is false", () => {
    const deck1 = createMockDeck("Deck A");
    const deck2 = createMockDeck("Deck B");

    const result = initializeGame(deck1, deck2, cardLookup, "Alice", "Bob", {
      fullPreparation: false,
    });

    expect(result.success).toBe(true);
    // In legacy mode, coinFlipResult is null (not set)
    expect(result.coinFlipResult).toBeNull();
  });
});

describe("Opening Sequence Flow", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  it("coin flip winner can choose to go first (no change needed)", () => {
    const state = createGameState("Alice", "Bob");
    // Simulate: coin flip gives player 0
    flipCoin(state, () => 0.1);
    expect(state.currentPlayer).toBe(0);

    // Player 0 chooses to go first — no override needed
    // currentPlayer remains 0
    expect(state.currentPlayer).toBe(0);
  });

  it("coin flip winner can choose to go second (override)", () => {
    const state = createGameState("Alice", "Bob");
    // Coin flip gives player 0
    flipCoin(state, () => 0.1);
    expect(state.currentPlayer).toBe(0);

    // Player 0 chooses to go second → set player 1 as first
    setFirstPlayer(state, 1);
    expect(state.currentPlayer).toBe(1);
    expect(state.log.some((e) => e.message.includes("Bob") && e.message.includes("先攻"))).toBe(true);
  });

  it("AI (player 1) winning flip auto-selects first", () => {
    const state = createGameState("Player", "AI");
    // Coin flip gives player 1 (AI)
    flipCoin(state, () => 0.9);
    expect(state.currentPlayer).toBe(1);

    // AI keeps first — no override
    // In the UI, the OpeningSequenceModal auto-completes with flipWinner (1)
    expect(state.currentPlayer).toBe(1);
  });
});
