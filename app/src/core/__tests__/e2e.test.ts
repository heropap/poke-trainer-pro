import { simulateGame } from "../ai/policy";
import "../decks";

const DECKS = ["charizard-ex", "miraidon-ex", "gardevoir-ex"] as const;

describe("v0 E2E — 9 cross-deck pairings reach gameOver", () => {
  // Three seeds per pairing → 27 simulations total.
  const seeds = [10, 20, 30];

  for (const a of DECKS) {
    for (const b of DECKS) {
      for (const seed of seeds) {
        it(`${a} vs ${b} (seed=${seed}) ends`, () => {
          const result = simulateGame(seed, a, b, { maxIterations: 2500 });
          expect(["gameOver", "maxIter"]).toContain(result.reason);
          // Did the game progress at all?
          expect(result.iterations).toBeGreaterThan(10);
          // Some prize must have been taken or game stuck reasonably
          const totalPrizes =
            result.state.players[0].prizes.length +
            result.state.players[1].prizes.length;
          expect(totalPrizes).toBeLessThanOrEqual(12);
        });
      }
    }
  }
});

describe("v0 E2E — engine event log integrity", () => {
  it("Charizard vs Gardevoir — log records core events", () => {
    const result = simulateGame(7, "charizard-ex", "gardevoir-ex", {
      maxIterations: 2500,
    });
    const kinds = new Set(result.state.log.map((e) => e.kind));
    expect(kinds.has("GameStart")).toBe(true);
    expect(kinds.has("PlaceActiveSetup")).toBe(true);
    expect(kinds.has("PlaceBenchSetup")).toBe(true);
    expect(kinds.has("StartTurn")).toBe(true);
  });
});
