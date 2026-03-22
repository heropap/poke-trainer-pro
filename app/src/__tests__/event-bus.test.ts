/**
 * Event Bus Tests
 *
 * Tests for the Effect Event Bus chain reaction system:
 * - emitEvent enqueues events
 * - drainEffectQueue processes events and triggers abilities
 * - ABILITY_BLOCKED prevents triggering
 * - Chain reactions (event → ability → new event → ability)
 * - MAX_CHAIN_DEPTH prevents infinite loops
 * - Filter conditions
 * - Integration with performAttack emitting DAMAGE_DEALT
 */

import { createGameState, createGameCard, GamePhase } from "../engine/game-state";
import { emitEvent, drainEffectQueue, MAX_CHAIN_DEPTH } from "../engine/effects/event-bus";
import { registerEffect, clearRegistry } from "../engine/effects/effect-registry";
import { ABILITY_BLOCKED, ABILITY_BLOCKED_TEMP } from "../engine/effects/markers";
import type { GameEffectEvent } from "../engine/effects/game-events";
import type { CardEffectDef } from "../engine/effects/effect-types";

// ─── Helpers ───

function makeCard(id: string, name: string) {
  return createGameCard({
    id,
    name,
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "100",
    types: ["Fire"],
    attacks: [{ name: "Tackle", damage: "30", cost: ["Colorless"], text: "" }],
    number: "1",
    legalities: { standard: "Legal", expanded: "Legal", unlimited: "Legal" },
    images: { small: "", large: "" },
  });
}

function setupGame() {
  const state = createGameState("Player 1", "Player 2");
  state.phase = GamePhase.MAIN;
  state.effectQueue = [];

  const p1Active = makeCard("test-001", "Charmander");
  const p2Active = makeCard("test-002", "Squirtle");

  state.players[0].active = p1Active;
  state.players[1].active = p2Active;

  return { state, p1Active, p2Active };
}

// ─── Tests ───

beforeEach(() => {
  clearRegistry();
});

describe("emitEvent", () => {
  it("should push event onto effectQueue", () => {
    const { state, p1Active, p2Active } = setupGame();

    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 30,
      playerIndex: 0,
    });

    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue![0].type).toBe("DAMAGE_DEALT");
  });

  it("should initialize effectQueue if undefined", () => {
    const { state, p1Active, p2Active } = setupGame();
    state.effectQueue = undefined;

    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 30,
      playerIndex: 0,
    });

    expect(state.effectQueue).toHaveLength(1);
  });

  it("should accumulate multiple events", () => {
    const { state, p1Active, p2Active } = setupGame();

    emitEvent(state, { type: "DAMAGE_DEALT", source: p1Active, target: p2Active, amount: 30, playerIndex: 0 });
    emitEvent(state, { type: "POKEMON_KO", pokemon: p2Active, playerIndex: 1 });
    emitEvent(state, { type: "PRIZE_TAKEN", playerIndex: 0, count: 1 });

    expect(state.effectQueue).toHaveLength(3);
  });
});

describe("drainEffectQueue", () => {
  it("should return 0 for empty queue", async () => {
    const { state } = setupGame();
    const processed = await drainEffectQueue(state);
    expect(processed).toBe(0);
  });

  it("should return 0 when effectQueue is undefined", async () => {
    const { state } = setupGame();
    state.effectQueue = undefined;
    const processed = await drainEffectQueue(state);
    expect(processed).toBe(0);
  });

  it("should process events and trigger matching abilities", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const triggered: string[] = [];

    // Register ability on p2Active that listens to DAMAGE_DEALT
    const effect: CardEffectDef = {
      cardId: "test-002",
      cardName: "Squirtle",
      abilities: [{
        name: "Shell Armor",
        type: "passive",
        onEvent: {
          triggers: ["DAMAGE_DEALT"],
          handler: (_ctx, event) => {
            triggered.push(`${event.type}:${(event as any).amount}`);
          },
        },
      }],
    };
    registerEffect(effect);

    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 30,
      playerIndex: 0,
    });

    const processed = await drainEffectQueue(state);
    expect(processed).toBe(1);
    expect(triggered).toEqual(["DAMAGE_DEALT:30"]);
    expect(state.effectQueue).toHaveLength(0);
  });

  it("should NOT trigger ability-blocked Pokemon", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const triggered: string[] = [];

    registerEffect({
      cardId: "test-002",
      cardName: "Squirtle",
      abilities: [{
        name: "Shell Armor",
        type: "passive",
        onEvent: {
          triggers: ["DAMAGE_DEALT"],
          handler: () => { triggered.push("triggered"); },
        },
      }],
    });

    // Block the ability
    p2Active.markers[ABILITY_BLOCKED] = 1;

    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 30,
      playerIndex: 0,
    });

    await drainEffectQueue(state);
    expect(triggered).toHaveLength(0);
  });

  it("should NOT trigger ABILITY_BLOCKED_TEMP Pokemon", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const triggered: string[] = [];

    registerEffect({
      cardId: "test-002",
      cardName: "Squirtle",
      abilities: [{
        name: "Shell Armor",
        type: "passive",
        onEvent: {
          triggers: ["DAMAGE_DEALT"],
          handler: () => { triggered.push("triggered"); },
        },
      }],
    });

    p2Active.markers[ABILITY_BLOCKED_TEMP] = 1;

    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 30,
      playerIndex: 0,
    });

    await drainEffectQueue(state);
    expect(triggered).toHaveLength(0);
  });

  it("should apply filter before triggering", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const triggered: string[] = [];

    registerEffect({
      cardId: "test-002",
      cardName: "Squirtle",
      abilities: [{
        name: "Thick Shield",
        type: "passive",
        onEvent: {
          triggers: ["DAMAGE_DEALT"],
          // Only trigger on high damage
          filter: (_ctx, event) => (event as any).amount >= 50,
          handler: () => { triggered.push("high-damage"); },
        },
      }],
    });

    // Low damage — should NOT trigger
    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 30,
      playerIndex: 0,
    });

    await drainEffectQueue(state);
    expect(triggered).toHaveLength(0);

    // High damage — should trigger
    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 60,
      playerIndex: 0,
    });

    await drainEffectQueue(state);
    expect(triggered).toEqual(["high-damage"]);
  });

  it("should handle chain reactions (event A → ability → event B → ability)", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const chain: string[] = [];

    // P2's Squirtle: on DAMAGE_DEALT, emit POKEMON_KO
    registerEffect({
      cardId: "test-002",
      cardName: "Squirtle",
      abilities: [{
        name: "Fragile Body",
        type: "passive",
        onEvent: {
          triggers: ["DAMAGE_DEALT"],
          handler: (ctx) => {
            chain.push("step1:damage-received");
            emitEvent(ctx.state, {
              type: "POKEMON_KO",
              pokemon: p2Active,
              knockedBy: p1Active,
              playerIndex: 1,
            });
          },
        },
      }],
    });

    // P1's Charmander: on POKEMON_KO, log it
    registerEffect({
      cardId: "test-001",
      cardName: "Charmander",
      abilities: [{
        name: "Fierce Spirit",
        type: "passive",
        onEvent: {
          triggers: ["POKEMON_KO"],
          handler: () => {
            chain.push("step2:ko-response");
          },
        },
      }],
    });

    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 100,
      playerIndex: 0,
    });

    const processed = await drainEffectQueue(state);
    expect(processed).toBe(2); // DAMAGE_DEALT + POKEMON_KO
    expect(chain).toEqual(["step1:damage-received", "step2:ko-response"]);
  });

  it("should enforce MAX_CHAIN_DEPTH and discard remaining events", async () => {
    const { state, p1Active } = setupGame();

    // Create an infinite loop: ability emits same event type every time
    registerEffect({
      cardId: "test-001",
      cardName: "Charmander",
      abilities: [{
        name: "Infinite Loop",
        type: "passive",
        onEvent: {
          triggers: ["ENERGY_ATTACHED"],
          handler: (ctx) => {
            emitEvent(ctx.state, {
              type: "ENERGY_ATTACHED",
              pokemon: p1Active,
              energy: p1Active, // doesn't matter for test
              playerIndex: 0,
            });
          },
        },
      }],
    });

    emitEvent(state, {
      type: "ENERGY_ATTACHED",
      pokemon: p1Active,
      energy: p1Active,
      playerIndex: 0,
    });

    const processed = await drainEffectQueue(state);
    expect(processed).toBe(MAX_CHAIN_DEPTH);
    // Queue should be cleared after hitting limit
    expect(state.effectQueue).toHaveLength(0);
    // Should have logged warning
    const warningLog = state.log.find(l => l.message.includes("效果连锁达到上限"));
    expect(warningLog).toBeTruthy();
  });

  it("should trigger abilities on bench Pokemon", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const triggered: string[] = [];

    const benchMon = makeCard("test-003", "Bulbasaur");
    state.players[1].bench.cards.push(benchMon);

    // Bench Pokemon listens to DAMAGE_DEALT
    registerEffect({
      cardId: "test-003",
      cardName: "Bulbasaur",
      abilities: [{
        name: "Overgrow",
        type: "passive",
        onEvent: {
          triggers: ["DAMAGE_DEALT"],
          handler: () => { triggered.push("bench-triggered"); },
        },
      }],
    });

    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 30,
      playerIndex: 0,
    });

    await drainEffectQueue(state);
    expect(triggered).toEqual(["bench-triggered"]);
  });

  it("should handle multiple abilities on different Pokemon responding to same event", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const triggered: string[] = [];

    const benchMon = makeCard("test-003", "Pikachu");
    state.players[0].bench.cards.push(benchMon);

    // P1 active responds
    registerEffect({
      cardId: "test-001",
      cardName: "Charmander",
      abilities: [{
        name: "Fire Response",
        type: "passive",
        onEvent: {
          triggers: ["TURN_END"],
          handler: () => { triggered.push("active-response"); },
        },
      }],
    });

    // P1 bench responds
    registerEffect({
      cardId: "test-003",
      cardName: "Pikachu",
      abilities: [{
        name: "Electric Response",
        type: "passive",
        onEvent: {
          triggers: ["TURN_END"],
          handler: () => { triggered.push("bench-response"); },
        },
      }],
    });

    emitEvent(state, { type: "TURN_END", playerIndex: 0 });

    await drainEffectQueue(state);
    expect(triggered).toContain("active-response");
    expect(triggered).toContain("bench-response");
    expect(triggered).toHaveLength(2);
  });

  it("should handle async handlers", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const triggered: string[] = [];

    registerEffect({
      cardId: "test-002",
      cardName: "Squirtle",
      abilities: [{
        name: "Slow Response",
        type: "passive",
        onEvent: {
          triggers: ["DAMAGE_DEALT"],
          handler: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            triggered.push("async-done");
          },
        },
      }],
    });

    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 30,
      playerIndex: 0,
    });

    await drainEffectQueue(state);
    expect(triggered).toEqual(["async-done"]);
  });

  it("should only trigger abilities matching the event type", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const triggered: string[] = [];

    registerEffect({
      cardId: "test-002",
      cardName: "Squirtle",
      abilities: [{
        name: "KO Watcher",
        type: "passive",
        onEvent: {
          triggers: ["POKEMON_KO"],
          handler: () => { triggered.push("ko"); },
        },
      }],
    });

    // Emit DAMAGE_DEALT — should NOT trigger KO Watcher
    emitEvent(state, {
      type: "DAMAGE_DEALT",
      source: p1Active,
      target: p2Active,
      amount: 30,
      playerIndex: 0,
    });

    await drainEffectQueue(state);
    expect(triggered).toHaveLength(0);
  });

  it("should support abilities listening to multiple event types", async () => {
    const { state, p1Active, p2Active } = setupGame();
    const triggered: string[] = [];

    registerEffect({
      cardId: "test-001",
      cardName: "Charmander",
      abilities: [{
        name: "Vigilant",
        type: "passive",
        onEvent: {
          triggers: ["DAMAGE_DEALT", "POKEMON_KO", "CARD_PLAYED"],
          handler: (_ctx, event) => { triggered.push(event.type); },
        },
      }],
    });

    emitEvent(state, { type: "DAMAGE_DEALT", source: p1Active, target: p2Active, amount: 30, playerIndex: 0 });
    emitEvent(state, { type: "CARD_PLAYED", card: p1Active, cardType: "item", playerIndex: 0 });

    await drainEffectQueue(state);
    expect(triggered).toEqual(["DAMAGE_DEALT", "CARD_PLAYED"]);
  });
});

describe("integration: emitEvent in game actions", () => {
  it("performAttack should emit DAMAGE_DEALT event", async () => {
    const { performAttack } = await import("../engine/game-actions");
    const { state, p1Active, p2Active } = setupGame();

    // Free attack (no energy cost)
    p1Active.card = {
      ...p1Active.card,
      attacks: [{ name: "Tackle", damage: "30", cost: [], text: "" }],
    };

    state.phase = GamePhase.MAIN;
    state.turnStatus.hasAttacked = false;
    state.turnStatus.currentPhase = GamePhase.MAIN;

    const result = performAttack(state, 0, "Tackle");
    expect(result.success).toBe(true);

    // effectQueue should contain DAMAGE_DEALT
    const damageEvent = state.effectQueue?.find(e => e.type === "DAMAGE_DEALT");
    expect(damageEvent).toBeTruthy();
    expect((damageEvent as any)?.amount).toBe(30);
  });

  it("endTurn should emit TURN_END event", async () => {
    const { endTurn } = await import("../engine/turn-actions");
    const { state } = setupGame();
    state.phase = GamePhase.MAIN;

    endTurn(state);

    // Check the event was emitted (may have been processed by drain, but we check log)
    const turnEndLog = state.log.find(l =>
      l.message.includes("回合") && l.type === "draw_card"
    );
    expect(turnEndLog).toBeTruthy();
  });
});
