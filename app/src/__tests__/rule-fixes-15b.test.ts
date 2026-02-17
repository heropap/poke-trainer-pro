/**
 * Rule Fixes Session 15b — Core PTCG Rule Bug Fixes
 *
 * Tests for 4 critical rule bugs:
 * 1. Retreat now clears all status conditions
 * 2. switchOpponentActive now clears status on switched-out Pokemon
 * 3. endTurn processes BOTH players' status effects (between-turns)
 * 4. handleAttack promotion flow doesn't call endTurn prematurely
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  createPlayer,
  resetInstanceCounter,
} from "../engine/game-state";
import {
  canRetreat,
  retreat,
  endTurn,
  evolvePokemon,
} from "../engine/turn-actions";
import {
  performAttack,
  checkKnockout,
  autoPromoteBench,
} from "../engine/game-actions";
import { processAction } from "../engine/game-controller";
import { createEffectContext } from "../engine/effects/effect-context";
import { setRandomFn } from "../engine/effects/coin";
import { Card } from "../types/card";

// ─── Test Helpers ───

function createTestCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "test-pokemon-001",
    name: "Test Pokemon",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "100",
    types: ["Fire"],
    attacks: [
      {
        name: "Test Attack",
        cost: ["Fire"],
        convertedEnergyCost: 1,
        damage: "50",
        text: "",
      },
    ],
    weaknesses: [],
    resistances: [],
    retreatCost: ["Colorless"],
    convertedRetreatCost: 1,
    number: "1",
    rarity: "Common",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
    ...overrides,
  } as Card;
}

function createEnergyCard(type: string = "Fire"): Card {
  return {
    id: `energy-${type.toLowerCase()}-001`,
    name: `${type} Energy`,
    supertype: "Energy",
    subtypes: ["Basic"],
    types: [type],
    number: "1",
    rarity: "",
    legalities: {},
    images: { small: "", large: "" },
  } as Card;
}

function setupBattleState(): GameState {
  resetInstanceCounter();
  const state = createGameState("Alice", "Bob");
  state.phase = "main";
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Alice: active with energy + 1 bench
  const aliceActive = createGameCard(createTestCard({ id: "alice-active", name: "Charizard" }));
  const fireEnergy = createGameCard(createEnergyCard("Fire"));
  aliceActive.attachedEnergy = [fireEnergy];
  state.players[0].active = aliceActive;

  const aliceBench1 = createGameCard(createTestCard({ id: "alice-bench1", name: "Charmander" }));
  state.players[0].bench = createZone([aliceBench1]);

  // Bob: active + 2 bench
  const bobActive = createGameCard(createTestCard({ id: "bob-active", name: "Blastoise", types: ["Water"] }));
  state.players[1].active = bobActive;

  const bobBench1 = createGameCard(createTestCard({ id: "bob-bench1", name: "Squirtle", types: ["Water"] }));
  const bobBench2 = createGameCard(createTestCard({ id: "bob-bench2", name: "Wartortle", types: ["Water"] }));
  state.players[1].bench = createZone([bobBench1, bobBench2]);

  // Give both players prizes and deck
  for (let p = 0; p < 2; p++) {
    state.players[p as 0 | 1].prizes = createZone(
      Array.from({ length: 6 }, () => createGameCard(createEnergyCard("Fire")))
    );
    state.players[p as 0 | 1].deck = createZone(
      Array.from({ length: 20 }, () => createGameCard(createEnergyCard("Fire")))
    );
  }

  return state;
}

// ─── Tests ───

describe("Bug 1: Retreat clears status conditions", () => {
  afterEach(() => setRandomFn());

  it("clears poisoned status on retreat", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["poisoned"];

    const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
    const benchId = state.players[0].bench.cards[0].instanceId;

    retreat(state, [energyId], benchId);

    // The retreated Pokemon (now on bench) should have no status
    const retreatedPokemon = state.players[0].bench.cards.find(
      c => c.card.name === "Charizard"
    );
    expect(retreatedPokemon).toBeDefined();
    expect(retreatedPokemon!.statusConditions).toEqual([]);
  });

  it("clears burned status on retreat", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["burned"];

    const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
    const benchId = state.players[0].bench.cards[0].instanceId;

    retreat(state, [energyId], benchId);

    const retreatedPokemon = state.players[0].bench.cards.find(
      c => c.card.name === "Charizard"
    );
    expect(retreatedPokemon!.statusConditions).toEqual([]);
  });

  it("asleep blocks retreat (cannot test status clearing via retreat)", () => {
    const state = setupBattleState();
    // PTCG Rule: Asleep Pokemon CANNOT retreat (same as Paralyzed)
    state.players[0].active!.statusConditions = ["asleep"];

    const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
    const benchId = state.players[0].bench.cards[0].instanceId;

    const result = retreat(state, [energyId], benchId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("睡眠");
    // Pokemon stays active with asleep status
    expect(state.players[0].active!.statusConditions).toContain("asleep");
  });

  it("clears confused status on retreat", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["confused"];

    const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
    const benchId = state.players[0].bench.cards[0].instanceId;

    retreat(state, [energyId], benchId);

    const retreatedPokemon = state.players[0].bench.cards.find(
      c => c.card.name === "Charizard"
    );
    expect(retreatedPokemon!.statusConditions).toEqual([]);
  });

  it("clears multiple status conditions on retreat (poisoned + burned)", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["poisoned", "burned"];

    const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
    const benchId = state.players[0].bench.cards[0].instanceId;

    retreat(state, [energyId], benchId);

    const retreatedPokemon = state.players[0].bench.cards.find(
      c => c.card.name === "Charizard"
    );
    expect(retreatedPokemon!.statusConditions).toEqual([]);
  });

  it("Pokemon brought back from bench later does NOT have status", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["poisoned"];

    const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
    const benchId = state.players[0].bench.cards[0].instanceId;

    // Retreat: Charizard (poisoned) → bench, Charmander → active
    retreat(state, [energyId], benchId);

    // Give new active energy for another retreat
    const newEnergy = createGameCard(createEnergyCard("Fire"));
    state.players[0].active!.attachedEnergy = [newEnergy];

    // Retreat again: Charmander → bench, Charizard → active
    const charizardOnBench = state.players[0].bench.cards.find(c => c.card.name === "Charizard")!;
    retreat(state, [newEnergy.instanceId], charizardOnBench.instanceId);

    // Charizard is back in active and should still have NO poison
    expect(state.players[0].active!.card.name).toBe("Charizard");
    expect(state.players[0].active!.statusConditions).toEqual([]);
  });
});

describe("Bug 2: switchOpponentActive clears status", () => {
  it("clears status on opponent's switched-out Pokemon", () => {
    const state = setupBattleState();

    // Bob's active is poisoned
    state.players[1].active!.statusConditions = ["poisoned", "burned"];

    // Create effect context for Alice to force-switch Bob's active
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const bobBenchId = state.players[1].bench.cards[0].instanceId;

    ctx.switchOpponentActive(bobBenchId);

    // Bob's old active (now on bench) should have no status
    const switchedOutPokemon = state.players[1].bench.cards.find(
      c => c.card.name === "Blastoise"
    );
    expect(switchedOutPokemon).toBeDefined();
    expect(switchedOutPokemon!.statusConditions).toEqual([]);
  });

  it("new active from bench has clean status", () => {
    const state = setupBattleState();
    state.players[1].active!.statusConditions = ["confused"];

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const bobBenchId = state.players[1].bench.cards[0].instanceId;

    ctx.switchOpponentActive(bobBenchId);

    // New active should have no status (was on bench, bench Pokemon don't have status)
    expect(state.players[1].active!.statusConditions).toEqual([]);
  });
});

describe("Bug 3: endTurn processes BOTH players' status effects", () => {
  afterEach(() => setRandomFn());

  it("processes opponent's poison damage at end of turn", () => {
    const state = setupBattleState();

    // Bob's active is poisoned (e.g., from Alice's attack earlier)
    state.players[1].active!.statusConditions = ["poisoned"];

    const bobDamageBefore = state.players[1].active!.damageCounters;

    // Alice ends her turn
    endTurn(state);

    // Bob's active should have taken 10 poison damage (1 counter)
    expect(state.players[1].active!.damageCounters).toBe(bobDamageBefore + 1);
  });

  it("processes current player AND opponent poison damage", () => {
    const state = setupBattleState();

    // Both players' actives are poisoned
    state.players[0].active!.statusConditions = ["poisoned"];
    state.players[1].active!.statusConditions = ["poisoned"];

    const aliceDmgBefore = state.players[0].active!.damageCounters;
    const bobDmgBefore = state.players[1].active!.damageCounters;

    endTurn(state);

    // Both should take 10 damage each
    // Alice's Pokemon goes to bench after turn ends (it's now Bob's turn)
    // But the damage happened before the turn switch
    // Note: Alice's active took poison damage, then it's moved with the turn
    expect(state.players[0].bench.cards.some(c =>
      c.card.name === "Charizard" && c.damageCounters === aliceDmgBefore + 1
    ) || (state.players[0].active?.damageCounters === aliceDmgBefore + 1)).toBeTruthy();

    // Bob's active should have poison damage
    expect(state.players[1].active!.damageCounters).toBe(bobDmgBefore + 1);
  });

  it("processes opponent's burn damage with coin flip", () => {
    const state = setupBattleState();
    state.players[1].active!.statusConditions = ["burned"];
    setRandomFn(() => 0.3); // tails = burn not cured

    const bobDamageBefore = state.players[1].active!.damageCounters;

    endTurn(state);

    // Bob's active should have taken 20 burn damage (2 counters)
    expect(state.players[1].active!.damageCounters).toBe(bobDamageBefore + 2);
    // Burn not cured (tails)
    // Note: Bob's active was processed, still has burn
  });

  it("opponent poison KO awards prizes to current player", () => {
    const state = setupBattleState();
    // Bob's active has low HP and is poisoned → KO from poison at end of Alice's turn
    state.players[1].active!.card = createTestCard({
      id: "bob-low-hp",
      name: "Weak Pokemon",
      hp: "10",
      types: ["Water"],
    });
    state.players[1].active!.statusConditions = ["poisoned"];

    const alicePrizesBefore = state.players[0].prizes.cards.length;
    const aliceHandBefore = state.players[0].hand.cards.length;

    endTurn(state);

    // Alice should get a prize card for the KO
    expect(state.players[0].prizes.cards.length).toBe(alicePrizesBefore - 1);
    expect(state.players[0].hand.cards.length).toBe(aliceHandBefore + 1);
  });

  it("processes opponent's asleep check (coin flip for wake-up)", () => {
    const state = setupBattleState();
    state.players[1].active!.statusConditions = ["asleep"];
    setRandomFn(() => 0.7); // heads = wake up

    endTurn(state);

    // Bob's asleep Pokemon should have woken up
    expect(state.players[1].active!.statusConditions).not.toContain("asleep");
  });

  it("processes opponent's paralyzed cure at end of turn", () => {
    const state = setupBattleState();
    state.players[1].active!.statusConditions = ["paralyzed"];

    endTurn(state);

    // Bob's paralyzed Pokemon should be cured
    expect(state.players[1].active!.statusConditions).not.toContain("paralyzed");
  });
});

describe("Bug 4: handleAttack promotion flow", () => {
  afterEach(() => setRandomFn());

  it("multi-bench promotion: state.phase stays main until promote completes", async () => {
    const state = setupBattleState();

    // Make Bob's active very weak so attack KOs it
    state.players[1].active!.card = createTestCard({
      id: "bob-weak",
      name: "Weak Pokemon",
      hp: "10",
      types: ["Water"],
    });

    // Bob has 2 bench Pokemon — requires manual promotion
    expect(state.players[1].bench.cards.length).toBe(2);

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Test Attack",
    });

    expect(result.success).toBe(true);
    expect(result.promotionRequired).toBe(true);

    // Phase should still be "main" (endTurn not called yet)
    expect(result.newState.phase).toBe("main");
  });

  it("multi-bench promotion: endTurn runs after promote action", async () => {
    const state = setupBattleState();
    state.players[1].active!.card = createTestCard({
      id: "bob-weak",
      name: "Weak Pokemon",
      hp: "10",
      types: ["Water"],
    });

    // Attack KOs Bob's active
    const attackResult = await processAction(state, 0, {
      type: "attack",
      attackName: "Test Attack",
    });

    expect(attackResult.promotionRequired).toBe(true);

    // Now Bob promotes
    const benchId = state.players[1].bench.cards[0].instanceId;
    const promoteResult = await processAction(state, 1, {
      type: "promote",
      benchInstanceId: benchId,
    });

    expect(promoteResult.success).toBe(true);
    // After promote, endTurn should have been called
    // Current player should have switched to Bob (player 1)
    expect(state.currentPlayer).toBe(1);
  });

  it("single-bench auto-promote: normal endTurn flow", async () => {
    const state = setupBattleState();
    state.players[1].active!.card = createTestCard({
      id: "bob-weak",
      name: "Weak Pokemon",
      hp: "10",
      types: ["Water"],
    });

    // Remove one bench Pokemon so only 1 remains → auto-promote
    state.players[1].bench.cards.splice(1, 1);
    expect(state.players[1].bench.cards.length).toBe(1);

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Test Attack",
    });

    expect(result.success).toBe(true);
    expect(result.promotionRequired).toBeFalsy();
    // Should have auto-promoted and ended turn normally
    expect(state.players[1].active).not.toBeNull();
    expect(state.currentPlayer).toBe(1);
  });
});

describe("Regression tests: existing status clearing still works", () => {
  it("evolution still clears all status conditions", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["poisoned", "burned", "confused"];

    // Create a Stage 1 evolution card
    const evolutionCard = createGameCard(createTestCard({
      id: "charmeleon-001",
      name: "Charmeleon",
      subtypes: ["Stage 1"],
    }));
    state.players[0].hand = createZone([evolutionCard]);

    // Mark active as NOT played this turn (so it can evolve)
    state.players[0].active!.playedThisTurn = false;

    // Make the evolution card evolve FROM the active's name
    state.players[0].active!.card = createTestCard({
      id: "charmander-001",
      name: "Charmander",
    });
    evolutionCard.card = createTestCard({
      id: "charmeleon-001",
      name: "Charmeleon",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    }) as Card;

    evolvePokemon(state, evolutionCard.instanceId, state.players[0].active!.instanceId);

    // Status should be cleared
    expect(state.players[0].active!.statusConditions).toEqual([]);
  });

  it("switchOwnActive still clears status conditions", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["paralyzed", "poisoned"];

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const benchId = state.players[0].bench.cards[0].instanceId;

    ctx.switchOwnActive(benchId);

    // Old active (now on bench) should have no status
    const switchedOut = state.players[0].bench.cards.find(c => c.card.name === "Charizard");
    expect(switchedOut).toBeDefined();
    expect(switchedOut!.statusConditions).toEqual([]);
  });
});

describe("Integration scenarios", () => {
  afterEach(() => setRandomFn());

  it("full scenario: poison → retreat → status cleared → return to active → no poison", () => {
    const state = setupBattleState();

    // Alice's active gets poisoned
    state.players[0].active!.statusConditions = ["poisoned"];

    // Alice retreats
    const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
    const benchId = state.players[0].bench.cards[0].instanceId;
    retreat(state, [energyId], benchId);

    // Charizard on bench — no poison
    const charizard = state.players[0].bench.cards.find(c => c.card.name === "Charizard")!;
    expect(charizard.statusConditions).toEqual([]);

    // Later, bring Charizard back (give Charmander energy to retreat)
    const newEnergy = createGameCard(createEnergyCard("Fire"));
    state.players[0].active!.attachedEnergy = [newEnergy];
    retreat(state, [newEnergy.instanceId], charizard.instanceId);

    // Charizard is active again — still no poison
    expect(state.players[0].active!.card.name).toBe("Charizard");
    expect(state.players[0].active!.statusConditions).toEqual([]);
  });

  it("full scenario: attack poisons opponent → endTurn → opponent takes damage", () => {
    const state = setupBattleState();

    // Simulate: Alice's attack poisons Bob's active
    state.players[1].active!.statusConditions = ["poisoned"];

    const bobDmgBefore = state.players[1].active!.damageCounters;

    // Alice ends turn (between-turns should process Bob's poison)
    endTurn(state);

    // Bob's active took poison damage
    expect(state.players[1].active!.damageCounters).toBe(bobDmgBefore + 1);
  });
});
