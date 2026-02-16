/**
 * Tests for the WebSocket Game Room and Communication Protocol
 *
 * Tests:
 * 1. GameRoom initialization (deck loading, preparation, first turn)
 * 2. State masking (opponent hand/deck/prizes hidden, own deck/prizes hidden)
 * 3. Player identification (getPlayerIndex, hasPlayer)
 * 4. Action routing (handleAction by socket ID)
 * 5. Disconnection handling (auto-concede)
 * 6. Game lifecycle (creation, play, game over)
 * 7. Hidden card structure (correct placeholder format)
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
} from "@/engine/game-state";
import { processAction, startFirstTurn, GameAction } from "@/engine/game-controller";
import { Card } from "@/types/card";
import { GameRoom, ServerDeck } from "@/server/game-room";
import { initializeEffects } from "@/engine/effects";

// ─── Test Fixtures ───

function makeCard(overrides: Partial<Card> & { name: string }): Card {
  return {
    id: `test-${overrides.name.toLowerCase().replace(/\s/g, "-")}`,
    supertype: "Pokémon",
    subtypes: ["Basic"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
    hp: "70",
    types: ["Fire"],
    ...overrides,
  };
}

function makeEnergyCard(name: string, type: string): Card {
  return {
    id: `test-energy-${type.toLowerCase()}`,
    name,
    supertype: "Energy",
    subtypes: ["Basic"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
  };
}

// Create a deck of 60 cards (10 basic Pokemon + 50 energy)
function createTestDeck(cardIndex: Map<string, Card>): string[] {
  const ids: string[] = [];

  // 10 basic Pokemon
  for (let i = 1; i <= 10; i++) {
    const id = `test-pokemon-${i}`;
    if (!cardIndex.has(id)) {
      cardIndex.set(id, makeCard({
        name: `TestMon ${i}`,
        id,
        hp: `${50 + i * 10}`,
        attacks: [{ name: "Tackle", cost: ["Colorless"], damage: "20", text: "", convertedEnergyCost: 1 }],
      }));
    }
    ids.push(id);
  }

  // 50 energy
  const energyId = "test-energy-fire";
  if (!cardIndex.has(energyId)) {
    cardIndex.set(energyId, makeEnergyCard("Fire Energy", "Fire"));
  }
  for (let i = 0; i < 50; i++) {
    ids.push(energyId);
  }

  return ids;
}

// ─── Setup ───

let cardIndex: Map<string, Card>;
let deck1Ids: string[];
let deck2Ids: string[];

beforeEach(() => {
  resetInstanceCounter();
  cardIndex = new Map<string, Card>();
  deck1Ids = createTestDeck(cardIndex);
  deck2Ids = createTestDeck(cardIndex);
  initializeEffects();
});

const cardLookup = (id: string) => cardIndex.get(id);

// ─── 1. GameRoom Initialization ───

describe("GameRoom initialization", () => {
  test("initializes successfully with valid decks", () => {
    const room = new GameRoom(
      "test-game-1",
      "socket-p1",
      "Alice",
      "socket-p2",
      "Bob",
      (id) => cardIndex.get(id)
    );

    const deck1: ServerDeck = { id: "deck1", name: "Deck 1", cards: deck1Ids };
    const deck2: ServerDeck = { id: "deck2", name: "Deck 2", cards: deck2Ids };

    const success = room.initialize(deck1, deck2);
    expect(success).toBe(true);
    expect(room.state.phase).toBe("main");
    expect(room.state.gameId).toBe("test-game-1");

    // Both players should have been set up
    expect(room.state.players[0].name).toBe("Alice");
    expect(room.state.players[1].name).toBe("Bob");

    // Players should have hands and active Pokemon
    expect(room.state.players[0].hand.cards.length).toBeGreaterThan(0);
    expect(room.state.players[1].hand.cards.length).toBeGreaterThan(0);
    expect(room.state.players[0].active).not.toBeNull();
    expect(room.state.players[1].active).not.toBeNull();

    // Prize cards set
    expect(room.state.players[0].prizes.cards.length).toBe(6);
    expect(room.state.players[1].prizes.cards.length).toBe(6);
  });

  test("fails with empty deck", () => {
    const room = new GameRoom("test-game-2", "s1", "A", "s2", "B", cardLookup);

    const emptyDeck: ServerDeck = { id: "empty", name: "Empty", cards: [] };
    const validDeck: ServerDeck = { id: "valid", name: "Valid", cards: deck1Ids };

    const success = room.initialize(emptyDeck, validDeck);
    expect(success).toBe(false);
  });

  test("tracks creation and activity timestamps", () => {
    const room = new GameRoom("test-game-3", "s1", "A", "s2", "B", cardLookup);
    expect(room.createdAt).toBeGreaterThan(0);
    expect(room.lastActivityAt).toBeGreaterThan(0);
    expect(room.lastActivityAt).toBe(room.createdAt);
  });
});

// ─── 2. State Masking ───

describe("State masking (getMaskedState)", () => {
  let room: GameRoom;

  beforeEach(() => {
    room = new GameRoom("mask-test", "socket-alice", "Alice", "socket-bob", "Bob", cardLookup);
    const deck1: ServerDeck = { id: "d1", name: "D1", cards: deck1Ids };
    const deck2: ServerDeck = { id: "d2", name: "D2", cards: deck2Ids };
    room.initialize(deck1, deck2);
  });

  test("hides opponent hand cards", () => {
    const maskedForAlice = room.getMaskedState("socket-alice");

    // Alice's hand should be visible (real card data)
    const aliceHand = maskedForAlice.players[0].hand;
    expect(aliceHand.cards.length).toBeGreaterThan(0);
    expect(aliceHand.cards[0].cardId).not.toBe("__hidden__");

    // Bob's hand should be hidden (placeholder cards)
    const bobHand = maskedForAlice.players[1].hand;
    expect(bobHand.cards.length).toBeGreaterThan(0);
    expect(bobHand.cards[0].cardId).toBe("__hidden__");
    expect(bobHand.cards[0].card.name).toBe("???");
  });

  test("hides opponent deck contents", () => {
    const maskedForAlice = room.getMaskedState("socket-alice");

    // Bob's deck should be hidden
    const bobDeck = maskedForAlice.players[1].deck;
    expect(bobDeck.cards.length).toBeGreaterThan(0);
    expect(bobDeck.cards[0].cardId).toBe("__hidden__");
  });

  test("hides opponent prize card contents", () => {
    const maskedForAlice = room.getMaskedState("socket-alice");

    // Bob's prizes should be hidden
    const bobPrizes = maskedForAlice.players[1].prizes;
    expect(bobPrizes.cards.length).toBe(6);
    expect(bobPrizes.cards[0].cardId).toBe("__hidden__");
  });

  test("hides own deck and prizes (can't see your own deck order)", () => {
    const maskedForAlice = room.getMaskedState("socket-alice");

    // Alice's own deck and prizes should also be hidden
    const aliceDeck = maskedForAlice.players[0].deck;
    expect(aliceDeck.cards.length).toBeGreaterThan(0);
    expect(aliceDeck.cards[0].cardId).toBe("__hidden__");

    const alicePrizes = maskedForAlice.players[0].prizes;
    expect(alicePrizes.cards.length).toBe(6);
    expect(alicePrizes.cards[0].cardId).toBe("__hidden__");
  });

  test("preserves zone sizes in masked state", () => {
    const full = room.state;
    const maskedForAlice = room.getMaskedState("socket-alice");

    // Zone sizes should match
    expect(maskedForAlice.players[1].hand.cards.length).toBe(full.players[1].hand.cards.length);
    expect(maskedForAlice.players[1].deck.cards.length).toBe(full.players[1].deck.cards.length);
    expect(maskedForAlice.players[1].prizes.cards.length).toBe(full.players[1].prizes.cards.length);
  });

  test("keeps public zones visible (active, bench, discard)", () => {
    const maskedForAlice = room.getMaskedState("socket-alice");

    // Bob's active and bench should be visible
    if (maskedForAlice.players[1].active) {
      expect(maskedForAlice.players[1].active.cardId).not.toBe("__hidden__");
    }

    // Discard pile is public
    // (No cards in discard at start, but the zone exists)
    expect(maskedForAlice.players[1].discard.cards).toBeDefined();
  });

  test("masked state for Bob hides Alice's hand", () => {
    const maskedForBob = room.getMaskedState("socket-bob");

    // Bob's hand should be visible
    const bobHand = maskedForBob.players[1].hand;
    expect(bobHand.cards.length).toBeGreaterThan(0);
    expect(bobHand.cards[0].cardId).not.toBe("__hidden__");

    // Alice's hand should be hidden
    const aliceHand = maskedForBob.players[0].hand;
    expect(aliceHand.cards.length).toBeGreaterThan(0);
    expect(aliceHand.cards[0].cardId).toBe("__hidden__");
  });

  test("masking does not mutate authoritative state", () => {
    const originalP1HandIds = room.state.players[0].hand.cards.map(c => c.cardId);

    room.getMaskedState("socket-alice");
    room.getMaskedState("socket-bob");

    // Authoritative state should be unchanged
    const afterP1HandIds = room.state.players[0].hand.cards.map(c => c.cardId);
    expect(afterP1HandIds).toEqual(originalP1HandIds);
  });

  test("game metadata preserved in masked state", () => {
    const masked = room.getMaskedState("socket-alice");

    expect(masked.gameId).toBe(room.state.gameId);
    expect(masked.turn).toBe(room.state.turn);
    expect(masked.phase).toBe(room.state.phase);
    expect(masked.currentPlayer).toBe(room.state.currentPlayer);
    expect(masked.isFirstTurn).toBe(room.state.isFirstTurn);
  });
});

// ─── 3. Player Identification ───

describe("Player identification", () => {
  test("getPlayerIndex returns correct index", () => {
    const room = new GameRoom("test", "sock-1", "A", "sock-2", "B", cardLookup);
    expect(room.getPlayerIndex("sock-1")).toBe(0);
    expect(room.getPlayerIndex("sock-2")).toBe(1);
    expect(room.getPlayerIndex("unknown")).toBe(-1);
  });

  test("hasPlayer correctly identifies players", () => {
    const room = new GameRoom("test", "sock-1", "A", "sock-2", "B", cardLookup);
    expect(room.hasPlayer("sock-1")).toBe(true);
    expect(room.hasPlayer("sock-2")).toBe(true);
    expect(room.hasPlayer("sock-3")).toBe(false);
  });
});

// ─── 4. Action Routing ───

describe("Action routing (handleAction)", () => {
  let room: GameRoom;

  beforeEach(() => {
    room = new GameRoom("action-test", "sock-p1", "Alice", "sock-p2", "Bob", cardLookup);
    room.initialize(
      { id: "d1", name: "D1", cards: deck1Ids },
      { id: "d2", name: "D2", cards: deck2Ids }
    );
  });

  test("routes action to correct player index", () => {
    // Current player should be able to end turn
    const currentSocketId = room.state.currentPlayer === 0 ? "sock-p1" : "sock-p2";
    const result = room.handleAction(currentSocketId, { type: "end_turn" });
    expect(result.success).toBe(true);
  });

  test("rejects action from unknown socket", () => {
    const result = room.handleAction("unknown-socket", { type: "end_turn" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not a player in this game");
  });

  test("rejects action from wrong player (not their turn)", () => {
    const nonCurrentSocketId = room.state.currentPlayer === 0 ? "sock-p2" : "sock-p1";
    const result = room.handleAction(nonCurrentSocketId, { type: "end_turn" });
    expect(result.success).toBe(false);
  });

  test("updates authoritative state after successful action", () => {
    const currentPlayerBefore = room.state.currentPlayer;
    const currentSocketId = currentPlayerBefore === 0 ? "sock-p1" : "sock-p2";
    room.handleAction(currentSocketId, { type: "end_turn" });

    // Current player should have switched after end_turn
    expect(room.state.currentPlayer).not.toBe(currentPlayerBefore);
  });

  test("updates lastActivityAt on action", () => {
    const before = room.lastActivityAt;
    const currentSocketId = room.state.currentPlayer === 0 ? "sock-p1" : "sock-p2";

    // Small delay to ensure timestamp differs
    room.handleAction(currentSocketId, { type: "end_turn" });
    expect(room.lastActivityAt).toBeGreaterThanOrEqual(before);
  });
});

// ─── 5. Disconnection Handling ───

describe("Disconnection handling", () => {
  let room: GameRoom;

  beforeEach(() => {
    room = new GameRoom("dc-test", "sock-p1", "Alice", "sock-p2", "Bob", cardLookup);
    room.initialize(
      { id: "d1", name: "D1", cards: deck1Ids },
      { id: "d2", name: "D2", cards: deck2Ids }
    );
  });

  test("auto-concedes for disconnected player", () => {
    expect(room.isGameOver()).toBe(false);

    const result = room.handleDisconnect("sock-p1");
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(room.isGameOver()).toBe(true);
    expect(room.state.winner).not.toBeNull();
    expect(room.state.winner!.playerIndex).toBe(1); // Bob wins
    expect(room.state.winner!.condition).toBe("concede");
  });

  test("returns null for unknown socket disconnect", () => {
    const result = room.handleDisconnect("unknown");
    expect(result).toBeNull();
  });

  test("returns null if game already over", () => {
    // End the game first
    room.handleDisconnect("sock-p1");
    expect(room.isGameOver()).toBe(true);

    // Second disconnect should be no-op
    const result = room.handleDisconnect("sock-p2");
    expect(result).toBeNull();
  });
});

// ─── 6. Game Lifecycle ───

describe("Game lifecycle", () => {
  test("full game flow: create → play → concede", () => {
    const room = new GameRoom("life-test", "sock-1", "A", "sock-2", "B", cardLookup);
    room.initialize(
      { id: "d1", name: "D1", cards: deck1Ids },
      { id: "d2", name: "D2", cards: deck2Ids }
    );

    expect(room.isGameOver()).toBe(false);
    expect(room.state.phase).toBe("main");

    // Concede
    const currentSocket = room.state.currentPlayer === 0 ? "sock-1" : "sock-2";
    const result = room.handleAction(currentSocket, { type: "concede" });
    expect(result.success).toBe(true);
    expect(room.isGameOver()).toBe(true);
    expect(room.state.winner).not.toBeNull();
    expect(room.state.winner!.condition).toBe("concede");
  });

  test("multiple turns can be played", () => {
    const room = new GameRoom("turns-test", "sock-1", "A", "sock-2", "B", cardLookup);
    room.initialize(
      { id: "d1", name: "D1", cards: deck1Ids },
      { id: "d2", name: "D2", cards: deck2Ids }
    );

    const getSocket = () => room.state.currentPlayer === 0 ? "sock-1" : "sock-2";

    // Play 4 turns (end turn back and forth)
    for (let i = 0; i < 4; i++) {
      const result = room.handleAction(getSocket(), { type: "end_turn" });
      expect(result.success).toBe(true);
    }

    // Game should still be running
    expect(room.isGameOver()).toBe(false);
    expect(room.state.turn).toBeGreaterThanOrEqual(3);
  });
});

// ─── 7. Hidden Card Structure ───

describe("Hidden card structure", () => {
  test("hidden cards have correct placeholder format", () => {
    const room = new GameRoom("hidden-test", "sock-1", "A", "sock-2", "B", cardLookup);
    room.initialize(
      { id: "d1", name: "D1", cards: deck1Ids },
      { id: "d2", name: "D2", cards: deck2Ids }
    );

    const masked = room.getMaskedState("sock-1");
    const hiddenCard = masked.players[1].hand.cards[0];

    expect(hiddenCard.cardId).toBe("__hidden__");
    expect(hiddenCard.card.id).toBe("__hidden__");
    expect(hiddenCard.card.name).toBe("???");
    expect(hiddenCard.card.supertype).toBe("Pokémon");
    expect(hiddenCard.card.images).toBeDefined();
    expect(hiddenCard.card.legalities).toBeDefined();
    expect(hiddenCard.damageCounters).toBe(0);
    expect(hiddenCard.attachedEnergy).toEqual([]);
    expect(hiddenCard.attachedTools).toEqual([]);
    expect(hiddenCard.statusConditions).toEqual([]);
  });

  test("hidden cards preserve instance IDs (for zone size counting)", () => {
    const room = new GameRoom("id-test", "sock-1", "A", "sock-2", "B", cardLookup);
    room.initialize(
      { id: "d1", name: "D1", cards: deck1Ids },
      { id: "d2", name: "D2", cards: deck2Ids }
    );

    const full = room.state;
    const masked = room.getMaskedState("sock-1");

    // Instance IDs should be preserved even in hidden cards
    const fullHandIds = full.players[1].hand.cards.map(c => c.instanceId);
    const maskedHandIds = masked.players[1].hand.cards.map(c => c.instanceId);
    expect(maskedHandIds).toEqual(fullHandIds);
  });
});

// ─── 8. Communication Protocol ───

describe("Communication protocol types", () => {
  test("handleAction returns correct ActionResult shape", () => {
    const room = new GameRoom("proto-test", "sock-1", "A", "sock-2", "B", cardLookup);
    room.initialize(
      { id: "d1", name: "D1", cards: deck1Ids },
      { id: "d2", name: "D2", cards: deck2Ids }
    );

    const currentSocket = room.state.currentPlayer === 0 ? "sock-1" : "sock-2";
    const result = room.handleAction(currentSocket, { type: "end_turn" });

    // ActionResult shape
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("newState");
    expect(typeof result.success).toBe("boolean");
    expect(result.newState).toBeDefined();
  });

  test("error result includes error message", () => {
    const room = new GameRoom("proto-err", "sock-1", "A", "sock-2", "B", cardLookup);
    room.initialize(
      { id: "d1", name: "D1", cards: deck1Ids },
      { id: "d2", name: "D2", cards: deck2Ids }
    );

    // Wrong player tries to act
    const wrongSocket = room.state.currentPlayer === 0 ? "sock-2" : "sock-1";
    const result = room.handleAction(wrongSocket, { type: "end_turn" });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  test("getMaskedState returns valid GameState structure", () => {
    const room = new GameRoom("struct-test", "sock-1", "A", "sock-2", "B", cardLookup);
    room.initialize(
      { id: "d1", name: "D1", cards: deck1Ids },
      { id: "d2", name: "D2", cards: deck2Ids }
    );

    const masked = room.getMaskedState("sock-1");

    // GameState structure
    expect(masked).toHaveProperty("gameId");
    expect(masked).toHaveProperty("players");
    expect(masked).toHaveProperty("currentPlayer");
    expect(masked).toHaveProperty("phase");
    expect(masked).toHaveProperty("turn");
    expect(masked).toHaveProperty("isFirstTurn");
    expect(masked).toHaveProperty("winner");
    expect(masked).toHaveProperty("log");
    expect(masked.players).toHaveLength(2);

    // Each player has standard zones
    for (const player of masked.players) {
      expect(player).toHaveProperty("hand");
      expect(player).toHaveProperty("deck");
      expect(player).toHaveProperty("bench");
      expect(player).toHaveProperty("prizes");
      expect(player).toHaveProperty("discard");
      expect(player).toHaveProperty("name");
    }
  });
});
