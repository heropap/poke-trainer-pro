/**
 * Tests for Rare Candy trainer card implementation.
 *
 * Rare Candy allows evolving a Basic Pokemon directly to Stage 2,
 * skipping the Stage 1 intermediate. Restrictions:
 * - Cannot use on first turn
 * - Cannot target Pokemon played this turn
 * - Must have a valid Stage 2 in hand that matches via Stage 1 chain
 */

import { GameState, GameCard, createGameState, resetInstanceCounter,
  GamePhase,
} from "@/engine/game-state";
import { createEffectContext } from "@/engine/effects/effect-context";
import {
  setPromptStateChangeCallback,
  pendingPrompts,
} from "@/engine/effects/effect-context";
import { getEffect, clearRegistry } from "@/engine/effects/effect-registry";
import { initializeEffects } from "@/engine/effects";

// ─── Helpers ───

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

function makeBasic(name: string, instanceId?: string): GameCard {
  return makeGameCard({ name, subtypes: ["Basic"], instanceId });
}

function makeStage1(name: string, evolvesFrom: string, instanceId?: string): GameCard {
  return makeGameCard({ name, subtypes: ["Stage 1"], evolvesFrom, instanceId });
}

function makeStage2(name: string, evolvesFrom: string, instanceId?: string): GameCard {
  return makeGameCard({ name, subtypes: ["Stage 2"], evolvesFrom, hp: "160", instanceId });
}

function makeRareCandySource(): GameCard {
  return makeGameCard({
    name: "Rare Candy",
    supertype: "Trainer",
    subtypes: ["Item"],
    instanceId: "rare-candy-src",
  });
}

function setupTestState(): GameState {
  resetInstanceCounter();
  const state = createGameState("Player 1", "Player 2");
  state.phase = GamePhase.MAIN;
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = 0;
  state.players[0].active = makeBasic("Filler Active", "p0-active");
  state.players[1].active = makeBasic("Opp Active", "p1-active");
  return state;
}

// ─── Tests ───

beforeAll(() => {
  clearRegistry();
  initializeEffects();
});

describe("Rare Candy: canPlay", () => {
  afterEach(() => {
    setPromptStateChangeCallback(null);
    pendingPrompts.clear();
  });

  it("returns true when conditions are met (Stage 2 in hand, valid Basic on field, Stage 1 exists)", () => {
    const state = setupTestState();

    // Basic on bench
    const charmander = makeBasic("Charmander", "charmander-1");
    state.players[0].bench.cards.push(charmander);

    // Stage 2 in hand
    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);

    // Stage 1 somewhere in the game (deck) to validate chain
    const charmeleon = makeStage1("Charmeleon", "Charmander", "charmeleon-1");
    state.players[0].deck.cards.push(charmeleon);

    const effect = getEffect("__name__", "Rare Candy");
    expect(effect).not.toBeNull();

    const source = makeRareCandySource();
    const ctx = createEffectContext(state, 0, source);
    expect(effect!.trainer!.canPlay!(ctx)).toBe(true);
  });

  it("returns false on first turn", () => {
    const state = setupTestState();
    state.isFirstTurn = true;

    const charmander = makeBasic("Charmander", "charmander-1");
    state.players[0].bench.cards.push(charmander);
    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);
    const charmeleon = makeStage1("Charmeleon", "Charmander", "charmeleon-1");
    state.players[0].deck.cards.push(charmeleon);

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());
    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);
  });

  it("returns false when no Stage 2 in hand", () => {
    const state = setupTestState();
    const charmander = makeBasic("Charmander", "charmander-1");
    state.players[0].bench.cards.push(charmander);
    // No Stage 2 in hand

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());
    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);
  });

  it("returns false when Basic was played this turn", () => {
    const state = setupTestState();
    const charmander = makeBasic("Charmander", "charmander-1");
    charmander.playedThisTurn = true; // Just played!
    state.players[0].bench.cards.push(charmander);

    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);
    const charmeleon = makeStage1("Charmeleon", "Charmander", "charmeleon-1");
    state.players[0].deck.cards.push(charmeleon);

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());
    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);
  });

  it("returns false when Stage 2 evolution chain doesn't match any Basic on field", () => {
    const state = setupTestState();

    // Pikachu on bench — doesn't evolve to any Stage 2
    const pikachu = makeBasic("Pikachu", "pikachu-1");
    state.players[0].bench.cards.push(pikachu);

    // Charizard in hand — needs Charmander → Charmeleon chain
    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);
    const charmeleon = makeStage1("Charmeleon", "Charmander", "charmeleon-1");
    state.players[0].deck.cards.push(charmeleon);

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());
    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);
  });

  it("returns false when no Stage 1 intermediate exists in the game", () => {
    const state = setupTestState();

    const charmander = makeBasic("Charmander", "charmander-1");
    state.players[0].bench.cards.push(charmander);

    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);
    // No Charmeleon anywhere in the game!

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());
    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);
  });

  it("allows when active Pokemon is valid target", () => {
    const state = setupTestState();

    // Replace active with Charmander
    state.players[0].active = makeBasic("Charmander", "charmander-active");

    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);
    const charmeleon = makeStage1("Charmeleon", "Charmander", "charmeleon-1");
    state.players[0].deck.cards.push(charmeleon);

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());
    expect(effect!.trainer!.canPlay!(ctx)).toBe(true);
  });

  it("finds Stage 1 in opponent's deck for chain validation", () => {
    const state = setupTestState();

    const charmander = makeBasic("Charmander", "charmander-1");
    state.players[0].bench.cards.push(charmander);
    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);

    // Charmeleon in OPPONENT's discard
    const charmeleon = makeStage1("Charmeleon", "Charmander", "charmeleon-opp");
    state.players[1].discard.cards.push(charmeleon);

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());
    expect(effect!.trainer!.canPlay!(ctx)).toBe(true);
  });
});

describe("Rare Candy: onPlay", () => {
  afterEach(() => {
    setPromptStateChangeCallback(null);
    pendingPrompts.clear();
  });

  it("evolves Basic to Stage 2, skipping Stage 1", async () => {
    setPromptStateChangeCallback(null); // Auto-select mode
    const state = setupTestState();

    const charmander = makeBasic("Charmander", "charmander-1");
    state.players[0].bench.cards.push(charmander);

    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);
    const charmeleon = makeStage1("Charmeleon", "Charmander", "charmeleon-1");
    state.players[0].deck.cards.push(charmeleon);

    const effect = getEffect("__name__", "Rare Candy");
    const source = makeRareCandySource();
    const ctx = createEffectContext(state, 0, source);

    await effect!.trainer!.onPlay!(ctx);

    // The bench Pokemon should now be Charizard
    const evolvedPokemon = state.players[0].bench.cards.find(c => c.instanceId === "charmander-1");
    expect(evolvedPokemon).toBeDefined();
    expect(evolvedPokemon!.card.name).toBe("Charizard");

    // Evolution stack should contain original Charmander
    expect(evolvedPokemon!.evolutionStack).toHaveLength(1);
    expect(evolvedPokemon!.evolutionStack[0].card.name).toBe("Charmander");

    // Stage 2 should be removed from hand
    expect(state.players[0].hand.cards.find(c => c.instanceId === "charizard-1")).toBeUndefined();

    // Flags should be set
    expect(evolvedPokemon!.evolvedThisTurn).toBe(true);
    expect(evolvedPokemon!.playedThisTurn).toBe(true);
  });

  it("clears status conditions and markers on evolution", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();

    const charmander = makeBasic("Charmander", "charmander-1");
    charmander.statusConditions = [{ type: "Poisoned", damagePerTurn: 10 } as any];
    charmander.markers = { burn_counter: 2 };
    state.players[0].bench.cards.push(charmander);

    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);
    const charmeleon = makeStage1("Charmeleon", "Charmander");
    state.players[0].deck.cards.push(charmeleon);

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());

    await effect!.trainer!.onPlay!(ctx);

    const evolved = state.players[0].bench.cards.find(c => c.instanceId === "charmander-1")!;
    expect(evolved.statusConditions).toHaveLength(0);
    expect(evolved.markers).toEqual({});
  });

  it("can evolve active Pokemon", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();

    // Active is the Basic target
    state.players[0].active = makeBasic("Charmander", "charmander-active");

    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);
    const charmeleon = makeStage1("Charmeleon", "Charmander");
    state.players[0].deck.cards.push(charmeleon);

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());

    await effect!.trainer!.onPlay!(ctx);

    expect(state.players[0].active!.card.name).toBe("Charizard");
    expect(state.players[0].active!.evolutionStack).toHaveLength(1);
    expect(state.players[0].active!.evolutionStack[0].card.name).toBe("Charmander");
  });

  it("prompts user to select target Basic (interactive mode, 1 matching Stage 2)", async () => {
    const state = setupTestState();

    // Two valid Basics on bench
    const charmander = makeBasic("Charmander", "charmander-1");
    const oddish = makeBasic("Oddish", "oddish-1");
    state.players[0].bench.cards.push(charmander, oddish);

    // Two Stage 2s in hand (each matches a different Basic → only 1 per Basic)
    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    const vileplume = makeStage2("Vileplume", "Gloom", "vileplume-1");
    state.players[0].hand.cards.push(charizard, vileplume);

    // Stage 1 intermediates
    state.players[0].deck.cards.push(
      makeStage1("Charmeleon", "Charmander"),
      makeStage1("Gloom", "Oddish")
    );

    let promptCount = 0;

    setPromptStateChangeCallback((updatedState: GameState) => {
      if (updatedState.prompt) {
        promptCount++;
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          pendingPrompts.delete(updatedState.prompt.id);
          // Select Oddish — only 1 matching Stage 2 (Vileplume), auto-selected
          resolve([oddish.instanceId]);
        }
      }
    });

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());

    await effect!.trainer!.onPlay!(ctx);

    // Only 1 prompt: select Basic target (Stage 2 auto-selected since only 1 matches)
    expect(promptCount).toBe(1);

    // Oddish should now be Vileplume
    const evolved = state.players[0].bench.cards.find(c => c.instanceId === "oddish-1")!;
    expect(evolved.card.name).toBe("Vileplume");
  });

  it("prompts twice when multiple Stage 2s match the selected Basic", async () => {
    const state = setupTestState();

    // Charmander on bench
    const charmander = makeBasic("Charmander", "charmander-1");
    state.players[0].bench.cards.push(charmander);

    // Two Stage 2s that BOTH evolve from Charmeleon (e.g. Charizard + Charizard ex)
    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    const charizardEx = makeStage2("Charizard ex", "Charmeleon", "charizard-ex-1");
    state.players[0].hand.cards.push(charizard, charizardEx);

    // Stage 1 intermediate
    state.players[0].deck.cards.push(makeStage1("Charmeleon", "Charmander"));

    let promptCount = 0;

    setPromptStateChangeCallback((updatedState: GameState) => {
      if (updatedState.prompt) {
        promptCount++;
        const resolve = pendingPrompts.get(updatedState.prompt.id);
        if (resolve) {
          pendingPrompts.delete(updatedState.prompt.id);
          if (promptCount === 1) {
            // First prompt: select target Basic
            resolve([charmander.instanceId]);
          } else {
            // Second prompt: select which Stage 2 — pick Charizard ex
            resolve([charizardEx.instanceId]);
          }
        }
      }
    });

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());

    await effect!.trainer!.onPlay!(ctx);

    // Should have prompted twice (select Basic + select Stage 2)
    expect(promptCount).toBe(2);

    // Charmander should now be Charizard ex
    const evolved = state.players[0].bench.cards.find(c => c.instanceId === "charmander-1")!;
    expect(evolved.card.name).toBe("Charizard ex");
  });

  it("preserves attached energy through evolution", async () => {
    setPromptStateChangeCallback(null);
    const state = setupTestState();

    const charmander = makeBasic("Charmander", "charmander-1");
    const fireEnergy = makeGameCard({
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      instanceId: "fire-1",
    });
    charmander.attachedEnergy.push(fireEnergy);
    state.players[0].bench.cards.push(charmander);

    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");
    state.players[0].hand.cards.push(charizard);
    state.players[0].deck.cards.push(makeStage1("Charmeleon", "Charmander"));

    const effect = getEffect("__name__", "Rare Candy");
    const ctx = createEffectContext(state, 0, makeRareCandySource());

    await effect!.trainer!.onPlay!(ctx);

    const evolved = state.players[0].bench.cards.find(c => c.instanceId === "charmander-1")!;
    expect(evolved.card.name).toBe("Charizard");
    // Energy should still be attached
    expect(evolved.attachedEnergy).toHaveLength(1);
    expect(evolved.attachedEnergy[0].card.name).toBe("Fire Energy");
  });
});

describe("Rare Candy: evolvePokemonDirect", () => {
  afterEach(() => {
    setPromptStateChangeCallback(null);
    pendingPrompts.clear();
  });

  it("performs direct evolution on bench Pokemon", () => {
    const state = setupTestState();
    const charmander = makeBasic("Charmander", "charmander-1");
    state.players[0].bench.cards.push(charmander);

    const charizard = makeStage2("Charizard", "Charmeleon", "charizard-1");

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = ctx.evolvePokemonDirect!("charmander-1", charizard);

    expect(result).toBe(true);
    const evolved = state.players[0].bench.cards.find(c => c.instanceId === "charmander-1")!;
    expect(evolved.card.name).toBe("Charizard");
    expect(evolved.evolvedThisTurn).toBe(true);
    expect(evolved.playedThisTurn).toBe(true);
    expect(evolved.statusConditions).toHaveLength(0);
    expect(evolved.markers).toEqual({});
    expect(evolved.evolutionStack).toHaveLength(1);
    expect(evolved.evolutionStack[0].card.name).toBe("Charmander");
  });

  it("performs direct evolution on active Pokemon", () => {
    const state = setupTestState();
    state.players[0].active = makeBasic("Charmander", "charmander-active");

    const charizard = makeStage2("Charizard", "Charmeleon");

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = ctx.evolvePokemonDirect!("charmander-active", charizard);

    expect(result).toBe(true);
    expect(state.players[0].active!.card.name).toBe("Charizard");
  });

  it("returns false when target not found", () => {
    const state = setupTestState();
    const charizard = makeStage2("Charizard", "Charmeleon");

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = ctx.evolvePokemonDirect!("nonexistent-id", charizard);

    expect(result).toBe(false);
  });
});
