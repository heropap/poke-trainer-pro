# Game Rules Test Cases

This document outlines the test coverage for the refactored rule engine.
Test File: `src/__tests__/rule-refactor.test.ts`

## 1. Setup Phase & Initialization
*   **Goal**: Verify game starts with correct state.
*   **Checks**:
    *   Players initialized with Decks and Hands.
    *   Turn Counter = 1.
    *   Current Player = 0 (Player 1).
    *   Phase = "main" (after draw).

## 2. First Turn Restrictions (Player 1)
*   **Scenario**: Player 1 starts the game.
*   **Test A: Attack Ban**
    *   Action: Player 1 attempts to use an attack (e.g., "Tackle").
    *   Expected Result: **Failure**.
    *   Error Code: `FIRST_TURN_ATTACK`.
*   **Test B: Supporter Ban**
    *   Action: Player 1 attempts to play "Professor's Research".
    *   Expected Result: **Failure**.
    *   Error Code: `FIRST_TURN_SUPPORTER`.

## 3. Second Turn Transition (Player 2)
*   **Scenario**: Player 1 ends turn. Player 2 starts turn.
*   **Checks**:
    *   Turn Counter = 2.
    *   Current Player = 1 (Player 2).
*   **Test C: Supporter Allowed**
    *   Action: Player 2 attempts to play "Professor's Research".
    *   Expected Result: **Success**.

## 4. Status Effect Persistence (Paralysis)
*   **Scenario**: Player 2 ends turn. Player 1 becomes Paralyzed.
*   **Test D: Persistence through Opponent Turn**
    *   Action: Player 1 is Paralyzed. Player 2 ends turn.
    *   Check: Player 1 is *still* Paralyzed at start of their turn.
*   **Test E: Cure at End of Turn**
    *   Action: Player 1 (Paralyzed) ends their turn.
    *   Check: Player 1 is **Cured** (Paralysis removed).

## 5. Evolution Rules
*   **Scenario**: Player attempts to evolve a Pokemon.
*   **Test F: Same Turn Evolution**
    *   Action: Play Basic -> Attempt Evolve immediately.
    *   Expected Result: **Failure** (`playedThisTurn` is true).
*   **Test G: Valid Evolution**
    *   Action: Play Basic -> End Turn -> End Turn -> Attempt Evolve.
    *   Expected Result: **Success**.
