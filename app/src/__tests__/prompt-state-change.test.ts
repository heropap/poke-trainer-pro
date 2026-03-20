/**
 * Tests for the prompt state change notification system.
 *
 * Verifies that promptDiscardFromHand and promptUser correctly:
 * - Auto-discard when no UI callback is set (test/non-interactive mode)
 * - Notify the UI callback when set (interactive mode)
 * - Support external resolution via pendingPrompts
 */

import { GameState, GameCard, createGameState, resetInstanceCounter,
  GamePhase,
} from "@/engine/game-state";
import { createEffectContext } from "@/engine/effects/effect-context";
import {
  setPromptStateChangeCallback,
  pendingPrompts,
} from "@/engine/effects/effect-context";

// Helper to create a minimal game card
function makeGameCard(overrides: Partial<GameCard["card"]> = {}): GameCard {
  return {
    instanceId: `test-${Math.random().toString(36).slice(2, 8)}`,
    cardId: overrides.id || "test-001",
    card: {
      id: overrides.id || "test-001",
      name: overrides.name || "Test Pokemon",
      supertype: overrides.supertype || "Pokémon",
      subtypes: overrides.subtypes || ["Basic"],
      hp: overrides.hp || "100",
      types: overrides.types || ["Colorless"],
      attacks: overrides.attacks || [],
      images: overrides.images || { small: "", large: "" },
      set: overrides.set || { id: "test", name: "Test", series: "Test" },
      number: "1",
      rarity: "Common",
      ...(overrides as any),
    },
    damageCounters: 0,
    statusConditions: [],
    attachedEnergy: [],
    attachedTools: [],
    playedThisTurn: false,
    evolvedThisTurn: false,
    abilityUsedThisTurn: false,
    markers: {},
    evolutionStack: [],
  };
}

function setupTestState(): GameState {
  resetInstanceCounter();
  const state = createGameState("Player 1", "Player 2");
  state.phase = GamePhase.MAIN;
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = 0;
  state.players[0].active = makeGameCard({ name: "Active Mon" });
  state.players[1].active = makeGameCard({ name: "Opp Active" });
  return state;
}

describe("Prompt State Change System", () => {
  afterEach(() => {
    // Clean up callback after each test
    setPromptStateChangeCallback(null);
    pendingPrompts.clear();
  });

  it("promptDiscardFromHand auto-discards when no UI callback is set", async () => {
    // Ensure no callback
    setPromptStateChangeCallback(null);

    const state = setupTestState();
    // Add 5 cards to hand
    for (let i = 0; i < 5; i++) {
      state.players[0].hand.cards.push(makeGameCard({ name: `Card ${i}` }));
    }

    const source = state.players[0].active!;
    const ctx = createEffectContext(state, 0, source);

    const discarded = await ctx.promptDiscardFromHand(2, "player");

    // Should have auto-discarded 2 cards from the end
    expect(discarded).toHaveLength(2);
    expect(state.players[0].hand.cards).toHaveLength(3);
    expect(state.players[0].discard.cards).toHaveLength(2);
    // No prompt should be set
    expect(state.prompt).toBeNull();
  });

  it("promptDiscardFromHand notifies UI callback when set", async () => {
    const state = setupTestState();
    // Add 5 cards to hand
    const handCards: GameCard[] = [];
    for (let i = 0; i < 5; i++) {
      const card = makeGameCard({ name: `Card ${i}` });
      state.players[0].hand.cards.push(card);
      handCards.push(card);
    }

    const source = state.players[0].active!;
    const ctx = createEffectContext(state, 0, source);

    let notifiedState: GameState | null = null;

    // Set up callback — when notified, auto-resolve the pending prompt
    setPromptStateChangeCallback((updatedState: GameState) => {
      notifiedState = updatedState;
      // Simulate user selecting the first 2 cards
      if (updatedState.prompt) {
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          const selectedIds = [handCards[0].instanceId, handCards[1].instanceId];
          pendingPrompts.delete(updatedState.prompt.id);
          updatedState.prompt = null;
          resolve(selectedIds);
        }
      }
    });

    const discarded = await ctx.promptDiscardFromHand(2, "player");

    // Callback should have been called
    expect(notifiedState).not.toBeNull();
    // The selected cards (first 2) should have been discarded
    expect(discarded).toHaveLength(2);
    expect(discarded[0].card.name).toBe("Card 0");
    expect(discarded[1].card.name).toBe("Card 1");
    expect(state.players[0].hand.cards).toHaveLength(3);
    expect(state.players[0].discard.cards).toHaveLength(2);
  });

  it("promptDiscardFromHand auto-discards when hand <= count", async () => {
    setPromptStateChangeCallback(() => {
      throw new Error("Should not be called when auto-discarding");
    });

    const state = setupTestState();
    // Add exactly 2 cards
    state.players[0].hand.cards.push(makeGameCard({ name: "A" }));
    state.players[0].hand.cards.push(makeGameCard({ name: "B" }));

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const discarded = await ctx.promptDiscardFromHand(2, "player");

    expect(discarded).toHaveLength(2);
    expect(state.players[0].hand.cards).toHaveLength(0);
  });

  it("promptDiscardFromHand auto-discards when prompt already active", async () => {
    let callbackCalled = false;
    setPromptStateChangeCallback(() => { callbackCalled = true; });

    const state = setupTestState();
    for (let i = 0; i < 5; i++) {
      state.players[0].hand.cards.push(makeGameCard({ name: `Card ${i}` }));
    }
    // Set an existing prompt (simulating nested prompt)
    state.prompt = { id: "existing", type: "select_cards", playerIndex: 0, zone: "hand", min: 1, max: 1 } as any;

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const discarded = await ctx.promptDiscardFromHand(2, "player");

    // Should auto-discard without triggering callback
    expect(discarded).toHaveLength(2);
    expect(callbackCalled).toBe(false);
  });

  it("promptUser notifies UI callback when set", () => {
    const state = setupTestState();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    let notifiedState: GameState | null = null;
    setPromptStateChangeCallback((updatedState: GameState) => {
      notifiedState = updatedState;
    });

    // Call promptUser (returns a promise, we don't await it)
    const _promise = ctx.promptUser({
      zone: "hand",
      min: 1,
      max: 1,
      message: "Select a card",
    });

    // Callback should have fired
    expect(notifiedState).not.toBeNull();
    expect(notifiedState!.prompt).toBeTruthy();
    expect(notifiedState!.prompt!.type).toBe("select_cards");
    // Use type assertion since GamePrompt is a discriminated union
    const prompt = notifiedState!.prompt as any;
    expect(prompt.zone).toBe("hand");

    // Clean up: resolve the pending promise to avoid hanging
    if (state.prompt) {
      const resolve = pendingPrompts.get(state.prompt.id);
      if (resolve) resolve([]);
    }
  });

  it("pendingPrompts can be resolved externally with delay", async () => {
    const state = setupTestState();
    for (let i = 0; i < 5; i++) {
      state.players[0].hand.cards.push(makeGameCard({ name: `Card ${i}` }));
    }
    const card0Id = state.players[0].hand.cards[0].instanceId;
    const card1Id = state.players[0].hand.cards[1].instanceId;

    // Set up callback that simulates delayed external resolution
    setPromptStateChangeCallback((updatedState: GameState) => {
      if (updatedState.prompt) {
        // Simulate a short delay then resolve (like a user clicking after a moment)
        setTimeout(() => {
          const resolve = pendingPrompts.get(updatedState.prompt!.id);
          if (resolve) {
            pendingPrompts.delete(updatedState.prompt!.id);
            updatedState.prompt = null;
            resolve([card0Id, card1Id]);
          }
        }, 10);
      }
    });

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const discarded = await ctx.promptDiscardFromHand(2, "player");

    expect(discarded).toHaveLength(2);
    expect(discarded.map(c => c.instanceId)).toContain(card0Id);
    expect(discarded.map(c => c.instanceId)).toContain(card1Id);
  });
});
