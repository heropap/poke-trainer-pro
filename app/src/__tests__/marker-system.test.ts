/**
 * Marker System Tests
 *
 * Tests for the persistent marker/counter system on GameCards:
 * - CRUD operations (add, remove, get, has)
 * - Between-turns marker cleanup (decrement, remove at 0)
 * - canAttack blocking (CANT_ATTACK_NEXT_TURN, CANT_USE_ATTACK:*)
 * - canRetreat blocking (PREVENT_RETREAT_NEXT_TURN)
 * - Evolution clears markers
 * - Meta-attack integration (Miraidon ex, Koraidon ex, Bloodmoon Ursaluna ex, Dusknoir)
 */

import {
  createGameState,
  createGameCard,
  GameState,
  GameCard,
} from "../engine/game-state";
import { createEffectContext } from "../engine/effects/effect-context";
import { processBetweenTurns } from "../engine/effects/status-effects";
import { canAttack } from "../engine/game-actions";
import { canRetreat, evolvePokemon } from "../engine/turn-actions";
import {
  CANT_ATTACK_NEXT_TURN,
  PREVENT_RETREAT_NEXT_TURN,
  cantUseAttackMarker,
  VSTAR_USED,
  ABILITY_BLOCKED,
  TURN_BASED_MARKERS,
} from "../engine/effects/markers";
import { Card } from "../types/card";

// ─── Test Helpers ───

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "test-001",
    name: "Test Pokemon",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "100",
    types: ["Fire"],
    attacks: [
      {
        name: "Flamethrower",
        cost: ["Fire"],
        damage: "90",
        text: "",
        convertedEnergyCost: 1,
      },
      {
        name: "Ember",
        cost: ["Colorless"],
        damage: "30",
        text: "",
        convertedEnergyCost: 1,
      },
    ],
    weaknesses: [],
    resistances: [],
    retreatCost: ["Colorless"],
    convertedRetreatCost: 1,
    set: "test",
    number: "1",
    rarity: "Common",
    legalities: {},
    images: { small: "", large: "" },
    ...overrides,
  } as Card;
}

function makeEnergyCard(type: string = "Fire"): Card {
  return {
    id: `energy-${type.toLowerCase()}`,
    name: `${type} Energy`,
    supertype: "Energy",
    subtypes: ["Basic"],
    types: [type],
    hp: "",
    attacks: [],
    weaknesses: [],
    resistances: [],
    retreatCost: [],
    convertedRetreatCost: 0,
    set: "test",
    number: "1",
    rarity: "Common",
    legalities: {},
    images: { small: "", large: "" },
  } as Card;
}

function makeEvolutionCard(): Card {
  return makeCard({
    id: "test-evo-001",
    name: "Test Pokemon Stage 1",
    subtypes: ["Stage 1"],
    hp: "130",
    evolvesFrom: "Test Pokemon",
  });
}

function setupGameWithActive(): GameState {
  const state = createGameState("Alice", "Bob");
  state.phase = "main";
  state.turn = 2;
  state.isFirstTurn = false;

  const card = createGameCard(makeCard());
  const energy = createGameCard(makeEnergyCard());
  card.attachedEnergy = [energy];
  state.players[0].active = card;

  const oppCard = createGameCard(makeCard({ name: "Opponent Pokemon" }));
  state.players[1].active = oppCard;

  // Add bench pokemon for retreat tests
  const benchCard = createGameCard(makeCard({ name: "Bench Pokemon" }));
  state.players[0].bench.cards.push(benchCard);

  return state;
}

// ═══════════════════════════════════════════
// CRUD Operations
// ═══════════════════════════════════════════

describe("marker system: CRUD operations", () => {
  test("addMarker sets a new marker with default count 1", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, CANT_ATTACK_NEXT_TURN);

    expect(target.markers[CANT_ATTACK_NEXT_TURN]).toBe(1);
  });

  test("addMarker increments existing marker", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, CANT_ATTACK_NEXT_TURN);
    ctx.addMarker(target, CANT_ATTACK_NEXT_TURN);

    expect(target.markers[CANT_ATTACK_NEXT_TURN]).toBe(2);
  });

  test("addMarker with custom count", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, "CUSTOM_COUNTER", 5);

    expect(target.markers["CUSTOM_COUNTER"]).toBe(5);
  });

  test("removeMarker without count deletes the marker entirely", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, CANT_ATTACK_NEXT_TURN, 3);
    ctx.removeMarker(target, CANT_ATTACK_NEXT_TURN);

    expect(target.markers[CANT_ATTACK_NEXT_TURN]).toBeUndefined();
  });

  test("removeMarker with count decrements", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, "COUNTER", 5);
    ctx.removeMarker(target, "COUNTER", 2);

    expect(target.markers["COUNTER"]).toBe(3);
  });

  test("removeMarker with count equal to value deletes marker", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, "COUNTER", 3);
    ctx.removeMarker(target, "COUNTER", 3);

    expect(target.markers["COUNTER"]).toBeUndefined();
  });

  test("removeMarker with count > value deletes marker", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, "COUNTER", 2);
    ctx.removeMarker(target, "COUNTER", 5);

    expect(target.markers["COUNTER"]).toBeUndefined();
  });

  test("getMarker returns 0 for nonexistent marker", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    expect(ctx.getMarker(target, "NONEXISTENT")).toBe(0);
  });

  test("getMarker returns the count", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, "COUNTER", 7);

    expect(ctx.getMarker(target, "COUNTER")).toBe(7);
  });

  test("hasMarker returns false for nonexistent marker", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    expect(ctx.hasMarker(target, "NONEXISTENT")).toBe(false);
  });

  test("hasMarker returns true when marker exists", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, CANT_ATTACK_NEXT_TURN);

    expect(ctx.hasMarker(target, CANT_ATTACK_NEXT_TURN)).toBe(true);
  });

  test("multiple different markers on same card", () => {
    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[0].active!;

    ctx.addMarker(target, CANT_ATTACK_NEXT_TURN);
    ctx.addMarker(target, VSTAR_USED);
    ctx.addMarker(target, ABILITY_BLOCKED);

    expect(ctx.hasMarker(target, CANT_ATTACK_NEXT_TURN)).toBe(true);
    expect(ctx.hasMarker(target, VSTAR_USED)).toBe(true);
    expect(ctx.hasMarker(target, ABILITY_BLOCKED)).toBe(true);
  });
});

// ═══════════════════════════════════════════
// createGameCard initializes markers
// ═══════════════════════════════════════════

describe("marker system: GameCard initialization", () => {
  test("createGameCard initializes empty markers", () => {
    const card = createGameCard(makeCard());
    expect(card.markers).toEqual({});
  });
});

// ═══════════════════════════════════════════
// Between-Turns Cleanup
// ═══════════════════════════════════════════

describe("marker system: between-turns cleanup", () => {
  test("CANT_ATTACK_NEXT_TURN is decremented and removed at 0", () => {
    const state = setupGameWithActive();
    const active = state.players[0].active!;
    active.markers[CANT_ATTACK_NEXT_TURN] = 1;

    processBetweenTurns(state, 0);

    expect(active.markers[CANT_ATTACK_NEXT_TURN]).toBeUndefined();
  });

  test("CANT_ATTACK_NEXT_TURN with count 2 decrements to 1", () => {
    const state = setupGameWithActive();
    const active = state.players[0].active!;
    active.markers[CANT_ATTACK_NEXT_TURN] = 2;

    processBetweenTurns(state, 0);

    expect(active.markers[CANT_ATTACK_NEXT_TURN]).toBe(1);
  });

  test("PREVENT_RETREAT_NEXT_TURN is decremented between turns", () => {
    const state = setupGameWithActive();
    const active = state.players[0].active!;
    active.markers[PREVENT_RETREAT_NEXT_TURN] = 1;

    processBetweenTurns(state, 0);

    expect(active.markers[PREVENT_RETREAT_NEXT_TURN]).toBeUndefined();
  });

  test("CANT_USE_ATTACK:* markers are decremented between turns", () => {
    const state = setupGameWithActive();
    const active = state.players[0].active!;
    const marker = cantUseAttackMarker("Photon Blaster");
    active.markers[marker] = 1;

    processBetweenTurns(state, 0);

    expect(active.markers[marker]).toBeUndefined();
  });

  test("permanent markers (VSTAR_USED) are NOT decremented", () => {
    const state = setupGameWithActive();
    const active = state.players[0].active!;
    active.markers[VSTAR_USED] = 1;

    processBetweenTurns(state, 0);

    expect(active.markers[VSTAR_USED]).toBe(1);
  });

  test("bench Pokemon markers are also cleaned up", () => {
    const state = setupGameWithActive();
    const benchCard = state.players[0].bench.cards[0];
    benchCard.markers[CANT_ATTACK_NEXT_TURN] = 1;

    processBetweenTurns(state, 0);

    expect(benchCard.markers[CANT_ATTACK_NEXT_TURN]).toBeUndefined();
  });

  test("no error when active has no markers", () => {
    const state = setupGameWithActive();
    expect(() => processBetweenTurns(state, 0)).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// canAttack Blocking
// ═══════════════════════════════════════════

describe("marker system: canAttack blocking", () => {
  test("CANT_ATTACK_NEXT_TURN blocks all attacks", () => {
    const state = setupGameWithActive();
    const active = state.players[0].active!;
    active.markers[CANT_ATTACK_NEXT_TURN] = 1;

    expect(canAttack(state, 0, "Flamethrower")).toBe(false);
    expect(canAttack(state, 0, "Ember")).toBe(false);
  });

  test("CANT_USE_ATTACK:Flamethrower blocks only Flamethrower", () => {
    const state = setupGameWithActive();
    const active = state.players[0].active!;
    active.markers[cantUseAttackMarker("Flamethrower")] = 1;

    // Add colorless energy for Ember
    const colorlessEnergy = createGameCard(makeEnergyCard("Colorless"));
    active.attachedEnergy.push(colorlessEnergy);

    expect(canAttack(state, 0, "Flamethrower")).toBe(false);
    expect(canAttack(state, 0, "Ember")).toBe(true);
  });

  test("attack is allowed when markers are 0 or absent", () => {
    const state = setupGameWithActive();
    expect(canAttack(state, 0, "Flamethrower")).toBe(true);
  });

  test("CANT_ATTACK_NEXT_TURN clears after between-turns, attack succeeds", () => {
    const state = setupGameWithActive();
    const active = state.players[0].active!;
    active.markers[CANT_ATTACK_NEXT_TURN] = 1;

    // Before cleanup: blocked
    expect(canAttack(state, 0, "Flamethrower")).toBe(false);

    // Process between turns (decrements marker)
    processBetweenTurns(state, 0);

    // After cleanup: allowed
    expect(canAttack(state, 0, "Flamethrower")).toBe(true);
  });
});

// ═══════════════════════════════════════════
// canRetreat Blocking
// ═══════════════════════════════════════════

describe("marker system: canRetreat blocking", () => {
  test("PREVENT_RETREAT_NEXT_TURN blocks retreat", () => {
    const state = setupGameWithActive();
    state.currentPlayer = 0;
    const active = state.players[0].active!;
    active.markers[PREVENT_RETREAT_NEXT_TURN] = 1;

    const energyIds = active.attachedEnergy.map(e => e.instanceId);
    const result = canRetreat(state, energyIds);

    expect(result.success).toBe(false);
    expect(result.error).toContain("禁止撤退");
  });

  test("retreat allowed when PREVENT_RETREAT_NEXT_TURN is absent", () => {
    const state = setupGameWithActive();
    state.currentPlayer = 0;
    const energyIds = state.players[0].active!.attachedEnergy.map(e => e.instanceId);
    const result = canRetreat(state, energyIds);

    expect(result.success).toBe(true);
  });

  test("PREVENT_RETREAT_NEXT_TURN clears after between-turns", () => {
    const state = setupGameWithActive();
    state.currentPlayer = 0;
    const active = state.players[0].active!;
    active.markers[PREVENT_RETREAT_NEXT_TURN] = 1;

    // Process between turns
    processBetweenTurns(state, 0);

    const energyIds = active.attachedEnergy.map(e => e.instanceId);
    const result = canRetreat(state, energyIds);

    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════
// Evolution Clears Markers
// ═══════════════════════════════════════════

describe("marker system: evolution clears markers", () => {
  test("evolving a Pokemon clears all markers", () => {
    const state = setupGameWithActive();
    state.currentPlayer = 0;
    const active = state.players[0].active!;

    // Add some markers
    active.markers[CANT_ATTACK_NEXT_TURN] = 1;
    active.markers[VSTAR_USED] = 1;
    active.markers[cantUseAttackMarker("Flamethrower")] = 1;

    // Mark as NOT played this turn (so evolution is allowed)
    active.playedThisTurn = false;

    // Add evolution card to hand
    const evoCard = createGameCard(makeEvolutionCard());
    state.players[0].hand.cards.push(evoCard);

    const result = evolvePokemon(state, evoCard.instanceId, active.instanceId);

    expect(result.success).toBe(true);
    expect(active.markers).toEqual({});
  });
});

// ═══════════════════════════════════════════
// Marker Constants
// ═══════════════════════════════════════════

describe("marker system: constants", () => {
  test("cantUseAttackMarker generates correct format", () => {
    expect(cantUseAttackMarker("Photon Blaster")).toBe("CANT_USE_ATTACK:Photon Blaster");
    expect(cantUseAttackMarker("Shinobi Blade")).toBe("CANT_USE_ATTACK:Shinobi Blade");
  });

  test("TURN_BASED_MARKERS includes expected markers", () => {
    expect(TURN_BASED_MARKERS).toContain(CANT_ATTACK_NEXT_TURN);
    expect(TURN_BASED_MARKERS).toContain(PREVENT_RETREAT_NEXT_TURN);
  });
});

// ═══════════════════════════════════════════
// Meta-Attack Integration
// ═══════════════════════════════════════════

describe("marker system: meta-attack integration", () => {
  test("Miraidon ex Photon Blaster sets CANT_ATTACK_NEXT_TURN", () => {
    // Import meta-attacks to verify they use addMarker
    const { metaAttackEffects } = require("../engine/effects/cards/meta-attacks");
    const miraidon = metaAttackEffects.find(
      (e: { cardName: string }) => e.cardName === "Miraidon ex"
    );
    expect(miraidon).toBeDefined();

    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const attack = miraidon.attacks!.find(
      (a: { name: string }) => a.name === "Photon Blaster"
    );
    attack!.onAttack(ctx, 220);

    expect(state.players[0].active!.markers[CANT_ATTACK_NEXT_TURN]).toBe(1);
  });

  test("Koraidon ex Wild Impact sets CANT_ATTACK_NEXT_TURN", () => {
    const { metaAttackEffects } = require("../engine/effects/cards/meta-attacks");
    const koraidon = metaAttackEffects.find(
      (e: { cardName: string }) => e.cardName === "Koraidon ex"
    );

    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const attack = koraidon.attacks!.find(
      (a: { name: string }) => a.name === "Wild Impact"
    );
    attack!.onAttack(ctx, 220);

    expect(state.players[0].active!.markers[CANT_ATTACK_NEXT_TURN]).toBe(1);
  });

  test("Bloodmoon Ursaluna ex Blood Moon sets CANT_ATTACK_NEXT_TURN", () => {
    const { metaAttackEffects } = require("../engine/effects/cards/meta-attacks");
    const ursaluna = metaAttackEffects.find(
      (e: { cardName: string }) => e.cardName === "Bloodmoon Ursaluna ex"
    );

    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const attack = ursaluna.attacks!.find(
      (a: { name: string }) => a.name === "Blood Moon"
    );
    attack!.onAttack(ctx, 240);

    expect(state.players[0].active!.markers[CANT_ATTACK_NEXT_TURN]).toBe(1);
  });

  test("Dusknoir Shadow Bind sets PREVENT_RETREAT_NEXT_TURN on defender", () => {
    const { metaAttackEffects } = require("../engine/effects/cards/meta-attacks");
    const dusknoir = metaAttackEffects.find(
      (e: { cardName: string }) => e.cardName === "Dusknoir"
    );

    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const attack = dusknoir.attacks!.find(
      (a: { name: string }) => a.name === "Shadow Bind"
    );
    attack!.onAttack(ctx, 150);

    expect(state.players[1].active!.markers[PREVENT_RETREAT_NEXT_TURN]).toBe(1);
  });

  test("Greninja ex Shinobi Blade sets CANT_USE_ATTACK:Shinobi Blade", () => {
    const { metaAttackEffects } = require("../engine/effects/cards/meta-attacks");
    const greninja = metaAttackEffects.find(
      (e: { cardName: string }) => e.cardName === "Greninja ex"
    );

    const state = setupGameWithActive();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const attack = greninja.attacks!.find(
      (a: { name: string }) => a.name === "Shinobi Blade"
    );
    attack!.onAttack(ctx, 170);

    const markerKey = cantUseAttackMarker("Shinobi Blade");
    expect(state.players[0].active!.markers[markerKey]).toBe(1);
  });
});
