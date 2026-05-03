
import { createGameState, createGameCard, GameState, GamePhase } from "../game-state";
import { checkHardRules } from "../rules/base-rules";
import { GameAction } from "../game-controller";

describe("Turn Rules (The Golden Loop)", () => {
  let state: GameState;
  
  beforeEach(() => {
    state = createGameState("P1", "P2");
    state.phase = GamePhase.MAIN;
    state.turnStatus.currentPhase = GamePhase.MAIN;
    state.currentPlayer = 0;
  });

  test("First turn player cannot attack", () => {
    state.turn = 1;
    state.isFirstTurn = true;
    
    const action: GameAction = { type: "attack", attackName: "Scratch" };
    const result = checkHardRules(state, action, 0);
    
    expect(result.valid).toBe(false);
    expect(result.code).toBe("FIRST_TURN_ATTACK");
  });

  test("Second player (turn 1) CAN attack", () => {
    // It's technically turn 1 for player 2 if we count turns globally as 1, 2...
    // But usually "Turn 1" implies the very first turn of the game.
    // If state.isFirstTurn is false, it means it's P2's turn (or P1's second turn).
    
    state.turn = 1; 
    state.isFirstTurn = false; // P2's turn
    state.currentPlayer = 1;
    
    const action: GameAction = { type: "attack", attackName: "Scratch" };
    const result = checkHardRules(state, action, 1);
    
    expect(result.valid).toBe(true);
  });

  test("Cannot retreat twice", () => {
    state.turnStatus.hasRetreated = true;
    const action: GameAction = { type: "retreat", benchInstanceId: "bench-1" };
    const result = checkHardRules(state, action, 0);
    
    expect(result.valid).toBe(false);
    expect(result.code).toBe("RETREAT_LIMIT");
  });
});
