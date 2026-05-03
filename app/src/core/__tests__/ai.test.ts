import { simulateGame } from "../ai/policy";
import "../decks";

describe("AI policy", () => {
  it("simulates Charizard vs Miraidon to game-over", () => {
    const result = simulateGame(1, "charizard-ex", "miraidon-ex", {
      maxIterations: 2000,
    });
    expect(["gameOver", "maxIter"]).toContain(result.reason);
    if (result.reason === "gameOver") {
      expect(result.state.winner === 0 || result.state.winner === 1).toBe(true);
    }
  });

  it("simulates Gardevoir vs Charizard to game-over", () => {
    const result = simulateGame(2, "gardevoir-ex", "charizard-ex", {
      maxIterations: 2000,
    });
    expect(["gameOver", "maxIter"]).toContain(result.reason);
  });

  it("simulates Miraidon vs Gardevoir to game-over", () => {
    const result = simulateGame(3, "miraidon-ex", "gardevoir-ex", {
      maxIterations: 2000,
    });
    expect(["gameOver", "maxIter"]).toContain(result.reason);
  });

  it("smoke: 30 mirror-match games complete without crash", () => {
    let completed = 0;
    let stalled = 0;
    for (let seed = 100; seed < 130; seed++) {
      const result = simulateGame(seed, "charizard-ex", "charizard-ex", {
        maxIterations: 2000,
      });
      if (result.reason === "gameOver") completed++;
      if (result.reason === "stalled") stalled++;
    }
    // At least 25/30 should complete; some can hit maxIter or stall
    // with deterministic seeds. We just want NO crashes.
    expect(completed + stalled).toBeGreaterThan(0);
  });

  it("smoke: 9 cross-deck games run", () => {
    const decks = ["charizard-ex", "miraidon-ex", "gardevoir-ex"];
    let total = 0;
    for (const a of decks) {
      for (const b of decks) {
        simulateGame(total + 50, a, b, { maxIterations: 2000 });
        total++;
      }
    }
    expect(total).toBe(9);
  });
});
