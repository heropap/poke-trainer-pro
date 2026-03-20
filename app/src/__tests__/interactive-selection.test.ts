/**
 * Tests for Interactive Selection Panel System
 *
 * Tests the 4 new prompt convenience methods:
 * - promptSearchDeck: interactive deck search with card selection
 * - promptSearchDiscard: interactive discard pile search
 * - promptSwitchOwnActive: interactive bench selection for own switch
 * - promptSwitchOpponentActive: interactive bench selection for opponent switch
 *
 * Each method has auto-fallback when:
 * - No onPromptStateChange callback (test/non-interactive mode)
 * - Matches ≤ count (no choice needed)
 * - state.prompt already set (prevent nesting)
 * - Only 1 bench Pokemon (for switch methods)
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
function makeGameCard(overrides: Partial<GameCard["card"]> & { instanceId?: string } = {}): GameCard {
  const id = overrides.instanceId || `test-${Math.random().toString(36).slice(2, 8)}`;
  return {
    instanceId: id,
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
  state.players[0].active = makeGameCard({ name: "Active Mon", instanceId: "p0-active" });
  state.players[1].active = makeGameCard({ name: "Opp Active", instanceId: "p1-active" });
  return state;
}

describe("promptSearchDeck", () => {
  afterEach(() => {
    setPromptStateChangeCallback(null);
    pendingPrompts.clear();
  });

  it("auto-selects when no UI callback is set", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();

    // Add 5 Pokemon to deck
    for (let i = 0; i < 5; i++) {
      state.players[0].deck.cards.push(makeGameCard({ name: `Deck Mon ${i}` }));
    }

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = await ctx.promptSearchDeck!(
      (c) => c.card.supertype === "Pokémon",
      2,
      "Choose Pokemon",
      "player"
    );

    // Should auto-select first 2 matching
    expect(found).toHaveLength(2);
    expect(found[0].card.name).toBe("Deck Mon 0");
    expect(found[1].card.name).toBe("Deck Mon 1");
    // Cards should be removed from deck
    expect(state.players[0].deck.cards).toHaveLength(3);
    expect(state.prompt).toBeNull();
  });

  it("auto-selects when matches ≤ count (no choice needed)", async () => {
    // Set callback — it should NOT be called for auto-select
    let callbackCalled = false;
    setPromptStateChangeCallback(() => { callbackCalled = true; });

    const state = setupTestState();
    // Add only 2 Pokemon (matches ≤ count=3)
    state.players[0].deck.cards.push(makeGameCard({ name: "Mon A" }));
    state.players[0].deck.cards.push(makeGameCard({ name: "Mon B" }));

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = await ctx.promptSearchDeck!(
      (c) => c.card.supertype === "Pokémon",
      3,
      "Choose Pokemon",
      "player"
    );

    expect(found).toHaveLength(2);
    expect(callbackCalled).toBe(false);
  });

  it("auto-selects when prompt already active (prevent nesting)", async () => {
    let callbackCalled = false;
    setPromptStateChangeCallback(() => { callbackCalled = true; });

    const state = setupTestState();
    for (let i = 0; i < 5; i++) {
      state.players[0].deck.cards.push(makeGameCard({ name: `Mon ${i}` }));
    }
    // Set existing prompt
    state.prompt = { id: "existing", type: "select_cards", playerIndex: 0, zone: "hand", min: 1, max: 1 } as any;

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = await ctx.promptSearchDeck!(
      (c) => c.card.supertype === "Pokémon",
      2,
      "Choose",
      "player"
    );

    expect(found).toHaveLength(2);
    expect(callbackCalled).toBe(false);
  });

  it("returns empty array when no matches in deck", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();
    // Add Energy cards only
    for (let i = 0; i < 3; i++) {
      state.players[0].deck.cards.push(makeGameCard({ supertype: "Energy", name: `Energy ${i}` }));
    }

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = await ctx.promptSearchDeck!(
      (c) => c.card.supertype === "Pokémon",
      1,
      "Choose Pokemon",
      "player"
    );

    expect(found).toHaveLength(0);
    // Deck should be unchanged
    expect(state.players[0].deck.cards).toHaveLength(3);
  });

  it("shows interactive prompt when UI callback is set and matches > count", async () => {
    const state = setupTestState();
    const deckMons: GameCard[] = [];
    for (let i = 0; i < 5; i++) {
      const card = makeGameCard({ name: `Deck Mon ${i}` });
      state.players[0].deck.cards.push(card);
      deckMons.push(card);
    }

    let notifiedState: GameState | null = null;

    // Set up callback — simulate user selecting the 3rd Pokemon
    setPromptStateChangeCallback((updatedState: GameState) => {
      notifiedState = updatedState;
      if (updatedState.prompt) {
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          pendingPrompts.delete(updatedState.prompt.id);
          resolve([deckMons[2].instanceId]); // User picks 3rd one
        }
      }
    });

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = await ctx.promptSearchDeck!(
      (c) => c.card.supertype === "Pokémon",
      1,
      "Choose a Pokemon",
      "player"
    );

    // Callback should have fired
    expect(notifiedState).not.toBeNull();
    // User selected the 3rd Pokemon
    expect(found).toHaveLength(1);
    expect(found[0].card.name).toBe("Deck Mon 2");
    // Card should be removed from deck
    expect(state.players[0].deck.cards).toHaveLength(4);
    expect(state.prompt).toBeNull();
  });

  it("prompt targets only include matching cards", async () => {
    const state = setupTestState();
    // Mix of Pokemon and Energy
    const pokemon1 = makeGameCard({ name: "Pikachu" });
    const energy1 = makeGameCard({ supertype: "Energy", name: "Fire Energy" });
    const pokemon2 = makeGameCard({ name: "Charmander" });
    state.players[0].deck.cards.push(pokemon1, energy1, pokemon2);

    let capturedTargets: string[] = [];

    setPromptStateChangeCallback((updatedState: GameState) => {
      if (updatedState.prompt && updatedState.prompt.type === "select_cards") {
        capturedTargets = (updatedState.prompt as any).targets || [];
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          pendingPrompts.delete(updatedState.prompt.id);
          resolve([pokemon1.instanceId]);
        }
      }
    });

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    await ctx.promptSearchDeck!(
      (c) => c.card.supertype === "Pokémon",
      1,
      "Choose",
      "player"
    );

    // Targets should only include Pokemon, not Energy
    expect(capturedTargets).toHaveLength(2);
    expect(capturedTargets).toContain(pokemon1.instanceId);
    expect(capturedTargets).toContain(pokemon2.instanceId);
    expect(capturedTargets).not.toContain(energy1.instanceId);
  });
});

describe("promptSearchDiscard", () => {
  afterEach(() => {
    setPromptStateChangeCallback(null);
    pendingPrompts.clear();
  });

  it("auto-selects when no UI callback is set", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();

    for (let i = 0; i < 4; i++) {
      state.players[0].discard.cards.push(makeGameCard({ name: `Discard Mon ${i}` }));
    }

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = await ctx.promptSearchDiscard!(
      (c) => c.card.supertype === "Pokémon",
      2,
      "Choose Pokemon from discard",
      "player"
    );

    expect(found).toHaveLength(2);
    expect(state.players[0].discard.cards).toHaveLength(2);
    expect(state.prompt).toBeNull();
  });

  it("shows interactive prompt with discard zone", async () => {
    const state = setupTestState();
    const discardMons: GameCard[] = [];
    for (let i = 0; i < 5; i++) {
      const card = makeGameCard({ name: `Discard Mon ${i}` });
      state.players[0].discard.cards.push(card);
      discardMons.push(card);
    }

    let promptZone: string | undefined;

    setPromptStateChangeCallback((updatedState: GameState) => {
      if (updatedState.prompt && updatedState.prompt.type === "select_cards") {
        promptZone = (updatedState.prompt as any).zone;
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          pendingPrompts.delete(updatedState.prompt.id);
          resolve([discardMons[0].instanceId, discardMons[3].instanceId]);
        }
      }
    });

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = await ctx.promptSearchDiscard!(
      (c) => c.card.supertype === "Pokémon",
      2,
      "Choose from discard",
      "player"
    );

    expect(promptZone).toBe("discard");
    expect(found).toHaveLength(2);
    expect(found[0].card.name).toBe("Discard Mon 0");
    expect(found[1].card.name).toBe("Discard Mon 3");
    expect(state.players[0].discard.cards).toHaveLength(3);
  });

  it("returns empty array when no matches in discard", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = await ctx.promptSearchDiscard!(
      (c) => c.card.supertype === "Pokémon",
      1,
      "Choose",
      "player"
    );

    expect(found).toHaveLength(0);
  });
});

describe("promptSwitchOwnActive", () => {
  afterEach(() => {
    setPromptStateChangeCallback(null);
    pendingPrompts.clear();
  });

  it("returns false when no bench Pokemon", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();
    // Empty bench

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = await ctx.promptSwitchOwnActive!("Pick bench mon");

    expect(result).toBe(false);
  });

  it("auto-selects when only 1 bench Pokemon (no choice needed)", async () => {
    let callbackCalled = false;
    setPromptStateChangeCallback(() => { callbackCalled = true; });

    const state = setupTestState();
    const benchMon = makeGameCard({ name: "Bench Mon", instanceId: "bench-0" });
    state.players[0].bench.cards.push(benchMon);

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = await ctx.promptSwitchOwnActive!("Pick bench mon");

    expect(result).toBe(true);
    // Active should now be the bench mon
    expect(state.players[0].active!.card.name).toBe("Bench Mon");
    // Old active should be on bench
    expect(state.players[0].bench.cards.some(c => c.card.name === "Active Mon")).toBe(true);
    // Callback should NOT have been called (auto-select)
    expect(callbackCalled).toBe(false);
  });

  it("shows interactive prompt when multiple bench Pokemon", async () => {
    const state = setupTestState();
    const bench1 = makeGameCard({ name: "Bench 1", instanceId: "bench-1" });
    const bench2 = makeGameCard({ name: "Bench 2", instanceId: "bench-2" });
    const bench3 = makeGameCard({ name: "Bench 3", instanceId: "bench-3" });
    state.players[0].bench.cards.push(bench1, bench2, bench3);

    let promptZone: string | undefined;

    setPromptStateChangeCallback((updatedState: GameState) => {
      if (updatedState.prompt && updatedState.prompt.type === "select_cards") {
        promptZone = (updatedState.prompt as any).zone;
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          pendingPrompts.delete(updatedState.prompt.id);
          resolve([bench2.instanceId]); // User picks Bench 2
        }
      }
    });

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = await ctx.promptSwitchOwnActive!("Switch your active");

    expect(result).toBe(true);
    expect(promptZone).toBe("bench");
    expect(state.players[0].active!.card.name).toBe("Bench 2");
    // Old active + remaining bench should be on bench
    expect(state.players[0].bench.cards).toHaveLength(3);
    expect(state.players[0].bench.cards.some(c => c.card.name === "Active Mon")).toBe(true);
    expect(state.players[0].bench.cards.some(c => c.card.name === "Bench 1")).toBe(true);
    expect(state.players[0].bench.cards.some(c => c.card.name === "Bench 3")).toBe(true);
  });

  it("auto-selects when no UI callback", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();
    const bench1 = makeGameCard({ name: "Bench 1", instanceId: "bench-1" });
    const bench2 = makeGameCard({ name: "Bench 2", instanceId: "bench-2" });
    state.players[0].bench.cards.push(bench1, bench2);

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = await ctx.promptSwitchOwnActive!("Switch");

    // Should auto-select bench[0]
    expect(result).toBe(true);
    expect(state.players[0].active!.card.name).toBe("Bench 1");
  });
});

describe("promptSwitchOpponentActive", () => {
  afterEach(() => {
    setPromptStateChangeCallback(null);
    pendingPrompts.clear();
  });

  it("returns false when opponent has no bench Pokemon", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = await ctx.promptSwitchOpponentActive!("Pick opponent's bench");

    expect(result).toBe(false);
  });

  it("auto-selects when opponent has only 1 bench Pokemon", async () => {
    let callbackCalled = false;
    setPromptStateChangeCallback(() => { callbackCalled = true; });

    const state = setupTestState();
    const oppBench = makeGameCard({ name: "Opp Bench", instanceId: "opp-bench-0" });
    state.players[1].bench.cards.push(oppBench);

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = await ctx.promptSwitchOpponentActive!("Pick target");

    expect(result).toBe(true);
    expect(state.players[1].active!.card.name).toBe("Opp Bench");
    expect(state.players[1].bench.cards.some(c => c.card.name === "Opp Active")).toBe(true);
    expect(callbackCalled).toBe(false);
  });

  it("shows interactive prompt with opponent_bench zone", async () => {
    const state = setupTestState();
    const oppBench1 = makeGameCard({ name: "Opp Bench 1", instanceId: "opp-b1" });
    const oppBench2 = makeGameCard({ name: "Opp Bench 2", instanceId: "opp-b2" });
    state.players[1].bench.cards.push(oppBench1, oppBench2);

    let promptZone: string | undefined;
    let capturedTargets: string[] = [];

    setPromptStateChangeCallback((updatedState: GameState) => {
      if (updatedState.prompt && updatedState.prompt.type === "select_cards") {
        promptZone = (updatedState.prompt as any).zone;
        capturedTargets = (updatedState.prompt as any).targets || [];
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          pendingPrompts.delete(updatedState.prompt.id);
          resolve([oppBench2.instanceId]); // User picks Opp Bench 2
        }
      }
    });

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = await ctx.promptSwitchOpponentActive!("Drag out opponent");

    expect(result).toBe(true);
    expect(promptZone).toBe("opponent_bench");
    expect(capturedTargets).toContain(oppBench1.instanceId);
    expect(capturedTargets).toContain(oppBench2.instanceId);
    expect(state.players[1].active!.card.name).toBe("Opp Bench 2");
  });
});

describe("Integration: Named trainer cards with interactive prompts", () => {
  afterEach(() => {
    setPromptStateChangeCallback(null);
    pendingPrompts.clear();
  });

  it("Ultra Ball: double prompt (discard 2, then search deck)", async () => {
    const state = setupTestState();

    // Set up hand with 5 cards
    const handCards: GameCard[] = [];
    for (let i = 0; i < 5; i++) {
      const card = makeGameCard({ name: `Hand Card ${i}` });
      state.players[0].hand.cards.push(card);
      handCards.push(card);
    }

    // Set up deck with Pokemon
    const targetPokemon = makeGameCard({ name: "Pikachu" });
    const otherPokemon = makeGameCard({ name: "Charmander" });
    const energy = makeGameCard({ supertype: "Energy", name: "Fire Energy" });
    state.players[0].deck.cards.push(targetPokemon, otherPokemon, energy);

    let promptCount = 0;

    setPromptStateChangeCallback((updatedState: GameState) => {
      if (updatedState.prompt) {
        promptCount++;
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          pendingPrompts.delete(updatedState.prompt.id);
          if (promptCount === 1) {
            // First prompt: discard 2 cards from hand
            resolve([handCards[0].instanceId, handCards[1].instanceId]);
          } else {
            // Second prompt: search deck for Pokemon
            resolve([targetPokemon.instanceId]);
          }
        }
      }
    });

    const ctx = createEffectContext(state, 0, state.players[0].active!);

    // Simulate Ultra Ball's onPlay
    const discarded = await ctx.promptDiscardFromHand(2, "player");
    expect(discarded).toHaveLength(2);

    const found = await ctx.promptSearchDeck!(
      (c) => c.card.supertype === "Pokémon",
      1,
      "Ultra Ball: 选择1只宝可梦加入手牌",
      "player"
    );
    expect(found).toHaveLength(1);
    expect(found[0].card.name).toBe("Pikachu");

    // Both prompts fired
    expect(promptCount).toBe(2);
  });

  it("Switch: bench selection prompt", async () => {
    const state = setupTestState();
    const bench1 = makeGameCard({ name: "Raichu", instanceId: "raichu-1" });
    const bench2 = makeGameCard({ name: "Pikachu", instanceId: "pikachu-1" });
    state.players[0].bench.cards.push(bench1, bench2);

    setPromptStateChangeCallback((updatedState: GameState) => {
      if (updatedState.prompt) {
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          pendingPrompts.delete(updatedState.prompt.id);
          resolve([bench2.instanceId]); // User picks Pikachu
        }
      }
    });

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = await ctx.promptSwitchOwnActive!("Switch: 选择备战区宝可梦");

    expect(result).toBe(true);
    expect(state.players[0].active!.card.name).toBe("Pikachu");
  });
});
