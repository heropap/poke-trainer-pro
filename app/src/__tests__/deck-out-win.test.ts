/**
 * Deck Out Win Condition Tests
 *
 * PTCG Rule: If a player cannot draw a card at the start of their turn,
 * their opponent wins with condition "deck_out".
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
import { drawCard } from "@/engine/turn-actions";
import { processAction } from "@/engine/game-controller";

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

function createDeckOutState(): GameState {
  resetInstanceCounter();
  const state = createGameState("玩家", "AI 对手");
  state.phase = GamePhase.DRAW;
  state.turn = 10;
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Both players have active Pokemon
  const active0 = createGameCard(makeCard());
  active0.attachedEnergy = [createGameCard(makeEnergy())];
  state.players[0].active = active0;
  state.players[1].active = createGameCard(makeCard({ id: "sv1-2", name: "OppMon" }));

  // Player 0: EMPTY deck (will deck out)
  state.players[0].deck = createZone([]);
  state.players[0].hand = createZone([createGameCard(makeEnergy())]);

  // Player 1: normal deck
  for (let i = 0; i < 20; i++) {
    state.players[1].deck.cards.push(createGameCard(makeEnergy()));
  }

  // Prizes
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < 3; i++) {
      state.players[p as 0 | 1].prizes.cards.push(createGameCard(makeEnergy()));
    }
  }

  return state;
}

describe("Deck Out Win Condition", () => {
  beforeEach(() => resetInstanceCounter());

  test("drawCard sets GAME_OVER when deck is empty", () => {
    const state = createDeckOutState();
    expect(state.players[0].deck.cards.length).toBe(0);

    drawCard(state);

    expect(state.phase).toBe(GamePhase.GAME_OVER);
    expect(state.winner).not.toBeNull();
    expect(state.winner!.condition).toBe("deck_out");
    expect(state.winner!.playerIndex).toBe(1); // Opponent wins
  });

  test("game-controller detects deck out during end_turn auto-draw", async () => {
    const state = createDeckOutState();
    state.phase = GamePhase.MAIN;
    state.currentPlayer = 0;

    // End turn → opponent draws → then it becomes player 0's turn → deck out
    // But player 0's deck is empty. The draw happens when the turn switches.
    // Let's simulate: player 0 ends turn, player 1 draws (has cards),
    // then player 1 ends turn, player 0 tries to draw → deck out

    // First give player 1 a deck
    state.players[1].deck = createZone([]);
    for (let i = 0; i < 5; i++) {
      state.players[1].deck.cards.push(createGameCard(makeEnergy()));
    }

    // Player 0 ends turn → auto-draw for player 1 (succeeds)
    const endResult = await processAction(state, 0, { type: "end_turn" });
    expect(endResult.success).toBe(true);
    expect(endResult.newState.currentPlayer).toBe(1);

    // Player 1 ends turn → auto-draw for player 0 (deck empty → deck out)
    const endResult2 = await processAction(endResult.newState, 1, { type: "end_turn" });
    expect(endResult2.success).toBe(true);
    expect(endResult2.gameEnded).toBe(true);
    expect(endResult2.newState.phase).toBe(GamePhase.GAME_OVER);
    expect(endResult2.newState.winner!.condition).toBe("deck_out");
    expect(endResult2.newState.winner!.playerIndex).toBe(1); // Player 1 wins
  });

  test("Game Over UI shows correct deck_out message", () => {
    const state = createDeckOutState();
    drawCard(state);

    // Verify the log contains the deck out message
    const gameOverLog = state.log.find(l => l.type === "game_over");
    expect(gameOverLog).toBeDefined();
    expect(gameOverLog!.message).toContain("无法抽牌");
  });

  test("drawCard succeeds when deck has cards", () => {
    const state = createDeckOutState();
    // Add a card to the deck
    state.players[0].deck.cards.push(createGameCard(makeEnergy()));

    drawCard(state);

    expect(state.phase).toBe(GamePhase.MAIN); // Transitioned to main, not game over
    expect(state.winner).toBeNull();
    expect(state.players[0].hand.cards.length).toBe(2); // Started with 1 + drew 1
  });
});
