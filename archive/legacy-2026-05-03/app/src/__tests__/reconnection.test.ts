/**
 * Tests for WebSocket reconnection system
 *
 * Tests:
 * 1. Persistent player IDs generated on room creation
 * 2. Reconnection via playerId updates socket mapping
 * 3. markDisconnected grace period prevents immediate concede
 * 4. Force concede after grace period
 * 5. Reconnection clears disconnect state
 * 6. isPlayerDisconnected tracks status
 * 7. getPlayerId returns correct mapping
 */

import { GameRoom, ServerDeck, DISCONNECT_GRACE_MS } from "@/server/game-room";
import { Card } from "@/types/card";
import { resetInstanceCounter,
  GamePhase,
} from "@/engine/game-state";
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

function createTestDeck(cardIndex: Map<string, Card>): string[] {
  const ids: string[] = [];
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
  const energyId = "test-energy-fire";
  if (!cardIndex.has(energyId)) {
    cardIndex.set(energyId, {
      id: energyId, name: "Fire Energy", supertype: "Energy",
      subtypes: ["Basic"], number: "1", legalities: { standard: "Legal" },
      images: { small: "", large: "" },
    } as Card);
  }
  for (let i = 0; i < 50; i++) ids.push(energyId);
  return ids;
}

let cardIndex: Map<string, Card>;
let deck1Ids: string[];
let deck2Ids: string[];

beforeEach(() => {
  resetInstanceCounter();
  cardIndex = new Map();
  deck1Ids = createTestDeck(cardIndex);
  deck2Ids = createTestDeck(cardIndex);
  initializeEffects();
});

function createRoom() {
  const room = new GameRoom(
    "reconnect-test",
    "sock-alice",
    "Alice",
    "sock-bob",
    "Bob",
    (id) => cardIndex.get(id)
  );
  room.initialize(
    { id: "d1", name: "D1", cards: deck1Ids },
    { id: "d2", name: "D2", cards: deck2Ids }
  );
  return room;
}

// ─── 1. Persistent Player IDs ───

describe("Persistent player IDs", () => {
  test("generates unique player IDs on creation", () => {
    const room = createRoom();
    expect(room.player1Id).toBeDefined();
    expect(room.player2Id).toBeDefined();
    expect(room.player1Id).not.toBe(room.player2Id);
    expect(room.player1Id).toContain("pid-");
    expect(room.player2Id).toContain("pid-");
  });

  test("getPlayerId returns correct mapping", () => {
    const room = createRoom();
    expect(room.getPlayerId("sock-alice")).toBe(room.player1Id);
    expect(room.getPlayerId("sock-bob")).toBe(room.player2Id);
    expect(room.getPlayerId("unknown")).toBeNull();
  });
});

// ─── 2. Reconnection ───

describe("Reconnection via playerId", () => {
  test("reconnectPlayer updates socket ID", () => {
    const room = createRoom();
    const p1Id = room.player1Id;

    const result = room.reconnectPlayer(p1Id, "new-sock-alice");
    expect(result).toBe(0);
    expect(room.player1SocketId).toBe("new-sock-alice");

    expect(room.getPlayerIndex("sock-alice")).toBe(-1);
    expect(room.getPlayerIndex("new-sock-alice")).toBe(0);
  });

  test("reconnectPlayer for player 2", () => {
    const room = createRoom();
    const p2Id = room.player2Id;

    const result = room.reconnectPlayer(p2Id, "new-sock-bob");
    expect(result).toBe(1);
    expect(room.player2SocketId).toBe("new-sock-bob");
  });

  test("reconnectPlayer returns -1 for unknown playerId", () => {
    const room = createRoom();
    const result = room.reconnectPlayer("unknown-pid", "new-sock");
    expect(result).toBe(-1);
  });

  test("reconnectPlayer returns -1 for game over", async () => {
    const room = createRoom();
    await room.handleDisconnect("sock-alice");
    expect(room.isGameOver()).toBe(true);

    const result = room.reconnectPlayer(room.player1Id, "new-sock");
    expect(result).toBe(-1);
  });

  test("reconnectPlayer clears disconnect state", () => {
    const room = createRoom();
    const p1Id = room.player1Id;

    // Use markDisconnected for grace period
    room.markDisconnected("sock-alice");
    expect(room.isPlayerDisconnected(0)).toBe(true);

    room.reconnectPlayer(p1Id, "new-sock-alice");
    expect(room.isPlayerDisconnected(0)).toBe(false);
    expect(room.disconnectedPlayers.size).toBe(0);
  });

  test("reconnectPlayer updates lastActivityAt", () => {
    const room = createRoom();
    const before = room.lastActivityAt;
    room.reconnectPlayer(room.player1Id, "new-sock");
    expect(room.lastActivityAt).toBeGreaterThanOrEqual(before);
  });
});

// ─── 3. markDisconnected Grace Period ───

describe("markDisconnected grace period", () => {
  test("markDisconnected marks player as disconnected without conceding", () => {
    const room = createRoom();
    const result = room.markDisconnected("sock-alice");
    expect(result).not.toBeNull();
    expect(result!.playerIndex).toBe(0);
    expect(result!.playerId).toBe(room.player1Id);
    expect(room.isGameOver()).toBe(false);
    expect(room.isPlayerDisconnected(0)).toBe(true);
  });

  test("markDisconnected returns null for unknown socket", () => {
    const room = createRoom();
    const result = room.markDisconnected("unknown");
    expect(result).toBeNull();
  });

  test("markDisconnected returns null for game-over", async () => {
    const room = createRoom();
    await room.handleDisconnect("sock-alice");
    expect(room.isGameOver()).toBe(true);

    const result = room.markDisconnected("sock-bob");
    expect(result).toBeNull();
  });

  test("markDisconnected for player 2", () => {
    const room = createRoom();
    const result = room.markDisconnected("sock-bob");
    expect(result).not.toBeNull();
    expect(result!.playerIndex).toBe(1);
    expect(result!.playerId).toBe(room.player2Id);
    expect(room.isPlayerDisconnected(1)).toBe(true);
  });
});

// ─── 4. Force Concede ───

describe("Force concede", () => {
  test("forceConcede ends the game after grace period", async () => {
    const room = createRoom();
    room.markDisconnected("sock-alice");

    const result = await room.forceConcede(room.player1Id);
    expect(result?.success).toBe(true);
    expect(room.isGameOver()).toBe(true);
    expect(room.state.winner?.playerIndex).toBe(1);
    expect(room.state.winner?.condition).toBe("concede");
  });

  test("forceConcede returns null for unknown playerId", async () => {
    const room = createRoom();
    const result = await room.forceConcede("unknown-pid");
    expect(result).toBeNull();
  });

  test("forceConcede returns null if game already over", async () => {
    const room = createRoom();
    room.markDisconnected("sock-alice");
    await room.forceConcede(room.player1Id);

    const result = await room.forceConcede(room.player2Id);
    expect(result).toBeNull();
  });

  test("forceConcede cleans up disconnect state", async () => {
    const room = createRoom();
    room.markDisconnected("sock-alice");
    expect(room.disconnectedPlayers.size).toBe(1);

    await room.forceConcede(room.player1Id);
    expect(room.disconnectedPlayers.size).toBe(0);
  });
});

// ─── 5. DISCONNECT_GRACE_MS constant ───

describe("Configuration", () => {
  test("DISCONNECT_GRACE_MS is 60 seconds", () => {
    expect(DISCONNECT_GRACE_MS).toBe(60_000);
  });
});

// ─── 6. Full reconnection flow ───

describe("Full reconnection flow", () => {
  test("markDisconnected → reconnect → continue playing", async () => {
    const room = createRoom();
    const p1Id = room.player1Id;

    // Alice disconnects (grace period, not immediate concede)
    room.markDisconnected("sock-alice");
    expect(room.isPlayerDisconnected(0)).toBe(true);
    expect(room.isGameOver()).toBe(false);

    // Alice reconnects with new socket
    const result = room.reconnectPlayer(p1Id, "new-sock-alice");
    expect(result).toBe(0);
    expect(room.isPlayerDisconnected(0)).toBe(false);

    // Game continues working
    const maskedForAlice = room.getMaskedState("new-sock-alice");
    expect(maskedForAlice.phase).toBe(GamePhase.MAIN);
    expect(maskedForAlice.players[0].hand.cards.length).toBeGreaterThan(0);

    // Can still perform actions
    const currentSocket = room.state.currentPlayer === 0 ? "new-sock-alice" : "sock-bob";
    const actionResult = await room.handleAction(currentSocket, { type: "end_turn" });
    expect(actionResult.success).toBe(true);
  });

  test("markDisconnected → grace expires → forceConcede", async () => {
    const room = createRoom();
    room.markDisconnected("sock-alice");
    expect(room.isGameOver()).toBe(false);

    // Grace period expires
    const result = await room.forceConcede(room.player1Id);
    expect(result?.success).toBe(true);
    expect(room.isGameOver()).toBe(true);
    expect(room.state.winner?.condition).toBe("concede");
  });
});
