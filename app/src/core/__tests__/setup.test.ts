import { autoSetup, createGameState, reducer } from "../reducer";
import { getCard } from "../cards";
import {
  BENCH_SIZE,
  PRIZE_COUNT,
  type GameCard,
} from "../state";

const TEST_SEED = 42;

describe("setup phase", () => {
  it("autoSetup brings both players to draw phase", () => {
    const s = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex");
    expect(s.phase).toBe("draw");
    expect(s.turnNumber).toBe(1);
    expect(s.pendingPrompt).toBeNull();
  });

  it("each player has exactly 6 prizes", () => {
    const s = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex");
    expect(s.players[0].prizes).toHaveLength(PRIZE_COUNT);
    expect(s.players[1].prizes).toHaveLength(PRIZE_COUNT);
  });

  it("each player has an active Basic Pokemon", () => {
    const s = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex");
    for (const p of s.players) {
      expect(p.active).not.toBeNull();
      const def = getCard((p.active as GameCard).cardId);
      expect(def.kind).toBe("Pokemon");
      if (def.kind === "Pokemon") {
        expect(def.stage).toBe("Basic");
      }
    }
  });

  it("bench has at most 5 slots and only Basic Pokemon", () => {
    const s = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex");
    for (const p of s.players) {
      expect(p.bench).toHaveLength(BENCH_SIZE);
      for (const slot of p.bench) {
        if (slot) {
          const def = getCard(slot.cardId);
          if (def.kind === "Pokemon") {
            expect(def.stage).toBe("Basic");
          }
        }
      }
    }
  });

  it("deck shrinks correctly after dealing hand and prizes", () => {
    const s = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex");
    for (const p of s.players) {
      const inHand = p.hand.length;
      const inActive = p.active ? 1 : 0;
      const inBench = p.bench.filter(Boolean).length;
      const inPrizes = p.prizes.length;
      const inDeck = p.deck.length;
      const total = inHand + inActive + inBench + inPrizes + inDeck;
      expect(total).toBe(60);
    }
  });

  it("uses the goesFirst flag to set activePlayer", () => {
    const s0 = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex", 0);
    expect(s0.activePlayer).toBe(0);
    const s1 = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex", 1);
    expect(s1.activePlayer).toBe(1);
  });
});

describe("Concede", () => {
  it("ends the game and credits the other player", () => {
    let s = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex");
    s = reducer(s, { type: "Concede", player: 0 });
    expect(s.phase).toBe("gameOver");
    expect(s.winner).toBe(1);
    expect(s.winReason).toBe("concede");
  });
});

describe("DrawCard action", () => {
  it("moves N cards from deck to hand", () => {
    let s = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex");
    const beforeDeck = s.players[0].deck.length;
    const beforeHand = s.players[0].hand.length;
    s = reducer(s, { type: "DrawCard", player: 0, count: 1 });
    expect(s.players[0].deck.length).toBe(beforeDeck - 1);
    expect(s.players[0].hand.length).toBe(beforeHand + 1);
  });

  it("throws when deck has too few cards", () => {
    const s = autoSetup(TEST_SEED, "charizard-ex", "miraidon-ex");
    expect(() =>
      reducer(s, { type: "DrawCard", player: 0, count: 999 }),
    ).toThrow();
  });
});

describe("RNG determinism", () => {
  it("same seed produces identical setup state", () => {
    const a = autoSetup(123, "charizard-ex", "miraidon-ex");
    const b = autoSetup(123, "charizard-ex", "miraidon-ex");
    expect(a.players[0].hand.map((c) => c.cardId)).toEqual(
      b.players[0].hand.map((c) => c.cardId),
    );
  });

  it("different seeds produce different shuffles", () => {
    const a = autoSetup(1, "charizard-ex", "miraidon-ex");
    const b = autoSetup(2, "charizard-ex", "miraidon-ex");
    // Highly likely to differ for the first 7 cards
    const aHand = a.players[0].hand.map((c) => c.cardId).join(",");
    const bHand = b.players[0].hand.map((c) => c.cardId).join(",");
    expect(aHand).not.toBe(bHand);
  });
});

describe("createGameState bare init", () => {
  it("initializes empty board", () => {
    const s = createGameState(0);
    expect(s.phase).toBe("preGame");
    expect(s.players[0].deck).toHaveLength(0);
    expect(s.players[1].deck).toHaveLength(0);
  });
});
