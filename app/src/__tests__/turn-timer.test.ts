/**
 * Tests for Turn Timer system
 *
 * Tests:
 * 1. TURN_TIME_LIMIT configuration
 * 2. GameState turnTimer field
 * 3. startTurnTimer initializes timer state
 * 4. stopTurnTimer clears interval
 * 5. Timer countdown decrements
 * 6. cleanup stops all timers
 */

import { GameRoom, TURN_TIME_LIMIT } from "@/server/game-room";
import { Card } from "@/types/card";
import { resetInstanceCounter, createGameState,
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
  jest.useFakeTimers();
  resetInstanceCounter();
  cardIndex = new Map();
  deck1Ids = createTestDeck(cardIndex);
  deck2Ids = createTestDeck(cardIndex);
  initializeEffects();
});

afterEach(() => {
  jest.useRealTimers();
});

function createRoom() {
  const room = new GameRoom(
    "timer-test",
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

// ─── 1. Configuration ───

describe("Turn timer configuration", () => {
  test("TURN_TIME_LIMIT is 90 seconds", () => {
    expect(TURN_TIME_LIMIT).toBe(90);
  });
});

// ─── 2. GameState turnTimer field ───

describe("GameState turnTimer field", () => {
  test("createGameState initializes turnTimer as null", () => {
    const state = createGameState("A", "B");
    expect(state.turnTimer).toBeNull();
  });
});

// ─── 3. startTurnTimer ───

describe("startTurnTimer", () => {
  test("initializes timer state on game state", () => {
    const room = createRoom();
    expect(room.state.turnTimer).toBeNull();

    room.startTurnTimer();
    expect(room.state.turnTimer).not.toBeNull();
    expect(room.state.turnTimer!.remaining).toBe(TURN_TIME_LIMIT);
    expect(room.state.turnTimer!.total).toBe(TURN_TIME_LIMIT);
    expect(room.state.turnTimer!.active).toBe(true);

    room.cleanup();
  });

  test("decrements remaining every second", () => {
    const room = createRoom();
    room.startTurnTimer();

    jest.advanceTimersByTime(3000); // 3 seconds
    expect(room.state.turnTimer!.remaining).toBe(TURN_TIME_LIMIT - 3);

    jest.advanceTimersByTime(5000); // 5 more seconds
    expect(room.state.turnTimer!.remaining).toBe(TURN_TIME_LIMIT - 8);

    room.cleanup();
  });

  test("calls onTurnTimeout when timer reaches 0", () => {
    const room = createRoom();
    const mockCallback = jest.fn();
    room.onTurnTimeout = mockCallback;
    room.startTurnTimer();

    // Advance to just before timeout
    jest.advanceTimersByTime((TURN_TIME_LIMIT - 1) * 1000);
    expect(mockCallback).not.toHaveBeenCalled();
    expect(room.state.turnTimer!.remaining).toBe(1);

    // Advance to timeout
    jest.advanceTimersByTime(1000);
    expect(room.state.turnTimer!.remaining).toBe(0);
    expect(room.state.turnTimer!.active).toBe(false);
    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(room);

    room.cleanup();
  });

  test("restart resets timer", () => {
    const room = createRoom();
    room.startTurnTimer();

    jest.advanceTimersByTime(30000); // 30 seconds
    expect(room.state.turnTimer!.remaining).toBe(60);

    // Restart
    room.startTurnTimer();
    expect(room.state.turnTimer!.remaining).toBe(TURN_TIME_LIMIT);

    jest.advanceTimersByTime(5000);
    expect(room.state.turnTimer!.remaining).toBe(TURN_TIME_LIMIT - 5);

    room.cleanup();
  });
});

// ─── 4. stopTurnTimer ───

describe("stopTurnTimer", () => {
  test("stops the interval", () => {
    const room = createRoom();
    room.startTurnTimer();
    jest.advanceTimersByTime(5000);
    expect(room.state.turnTimer!.remaining).toBe(TURN_TIME_LIMIT - 5);

    room.stopTurnTimer();
    jest.advanceTimersByTime(10000);
    // Should stay at the same value
    expect(room.state.turnTimer!.remaining).toBe(TURN_TIME_LIMIT - 5);

    room.cleanup();
  });
});

// ─── 5. cleanup ───

describe("cleanup", () => {
  test("stops turn timer and clears disconnected players", () => {
    const room = createRoom();
    room.startTurnTimer();
    room.markDisconnected("sock-alice");

    expect(room.turnTimerInterval).not.toBeNull();
    expect(room.disconnectedPlayers.size).toBe(1);

    room.cleanup();
    expect(room.turnTimerInterval).toBeNull();
    expect(room.disconnectedPlayers.size).toBe(0);
  });
});

// ─── 6. Timer with game actions ───

describe("Timer interaction with game", () => {
  test("timer does not fire callback after game over", () => {
    const room = createRoom();
    const mockCallback = jest.fn();
    room.onTurnTimeout = mockCallback;
    room.startTurnTimer();

    // End the game manually
    room.state.phase = GamePhase.GAME_OVER;
    room.state.turnTimer!.active = false;

    jest.advanceTimersByTime(TURN_TIME_LIMIT * 1000);
    expect(mockCallback).not.toHaveBeenCalled();

    room.cleanup();
  });
});
