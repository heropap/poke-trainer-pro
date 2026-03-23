/**
 * Engine Error Recovery Tests
 *
 * Verifies that processAction catches thrown errors gracefully
 * and returns an error result instead of crashing the game.
 */

import {
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
  GamePhase,
} from "@/engine/game-state";
import { processAction } from "@/engine/game-controller";
import { Card } from "@/types/card";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "sv1-1", name: "TestMon", supertype: "Pokémon", subtypes: ["Basic"],
    hp: "100", types: ["Fire"], number: "1",
    legalities: { standard: "Legal" }, images: { small: "", large: "" }, set: "sv1",
    attacks: [{ name: "Tackle", cost: ["Colorless"], damage: "30", text: "", convertedEnergyCost: 1 }],
    ...overrides,
  };
}

function makeEnergy(): Card {
  return makeCard({
    id: "sve-2", name: "Basic Fire Energy", supertype: "Energy",
    subtypes: ["Basic"], hp: undefined, types: ["Fire"], attacks: [],
  });
}

describe("Engine Error Recovery", () => {
  beforeEach(() => resetInstanceCounter());

  test("processAction returns error result for unknown action type", async () => {
    const state = createGameState("P1", "P2");
    state.phase = GamePhase.MAIN;
    state.currentPlayer = 0;
    state.players[0].active = createGameCard(makeCard());
    state.players[1].active = createGameCard(makeCard({ id: "sv1-2" }));

    const result = await processAction(state, 0, { type: "nonexistent" as any });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // Game should NOT be in GAME_OVER — just a failed action
    expect(state.phase).toBe(GamePhase.MAIN);
  });

  test("processAction does not crash on malformed action", async () => {
    const state = createGameState("P1", "P2");
    state.phase = GamePhase.MAIN;
    state.currentPlayer = 0;
    state.players[0].active = createGameCard(makeCard());
    state.players[1].active = createGameCard(makeCard({ id: "sv1-2" }));

    // Missing required fields
    const result = await processAction(state, 0, { type: "attack" } as any);
    expect(result.success).toBe(false);
    // Should return gracefully, not throw
    expect(result.newState).toBeDefined();
  });

  test("processAction returns state even on error", async () => {
    const state = createGameState("P1", "P2");
    state.phase = GamePhase.MAIN;
    state.currentPlayer = 0;
    state.players[0].active = createGameCard(makeCard());

    const result = await processAction(state, 0, {
      type: "promote",
      benchInstanceId: "nonexistent-id",
    });

    expect(result.success).toBe(false);
    expect(result.newState).toBeDefined();
    expect(result.newState.phase).toBe(GamePhase.MAIN);
  });

  test("game state remains usable after error", async () => {
    const state = createGameState("P1", "P2");
    state.phase = GamePhase.MAIN;
    state.turn = 2;
    state.isFirstTurn = false;
    state.currentPlayer = 0;

    const active = createGameCard(makeCard());
    active.attachedEnergy = [createGameCard(makeEnergy())];
    state.players[0].active = active;
    state.players[1].active = createGameCard(makeCard({ id: "sv1-2" }));
    state.players[0].bench = createZone([createGameCard(makeCard({ id: "sv1-3", name: "Bench1" }))]);

    // Fill decks/prizes
    for (let p = 0; p < 2; p++) {
      for (let i = 0; i < 20; i++) state.players[p as 0 | 1].deck.cards.push(createGameCard(makeEnergy()));
      for (let i = 0; i < 6; i++) state.players[p as 0 | 1].prizes.cards.push(createGameCard(makeEnergy()));
    }

    // Trigger an error (bad promote)
    const errorResult = await processAction(state, 0, { type: "promote", benchInstanceId: "bad" });
    expect(errorResult.success).toBe(false);

    // Game should still be functional — can end turn
    const endResult = await processAction(state, 0, { type: "end_turn" });
    expect(endResult.success).toBe(true);
  });
});
