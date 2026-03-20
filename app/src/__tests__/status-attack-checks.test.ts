/**
 * Status Condition Attack/Retreat Checks Tests
 *
 * Session 15: Core PTCG rules for status conditions affecting attacks and retreats.
 *
 * Rules:
 * - Paralyzed Pokemon CANNOT attack or retreat
 * - Asleep Pokemon CANNOT attack or retreat
 * - Confused Pokemon can attempt to attack, but must flip a coin:
 *   - Heads: attack proceeds normally
 *   - Tails: 30 damage to self, attack fails
 * - Poisoned/Burned Pokemon CAN attack and retreat normally
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  createPlayer,
  resetInstanceCounter,
  StatusCondition,
  GamePhase,
} from "../engine/game-state";
import {
  canAttack,
  performAttack,
  checkKnockout,
  getPrizeCount,
} from "../engine/game-actions";
import {
  canRetreat,
  retreat,
} from "../engine/turn-actions";
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
        text: "Test attack",
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
  state.phase = GamePhase.MAIN;
  state.turn = 2; // Not first turn
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Alice: active + bench + hand with energy
  const aliceActive = createGameCard(createTestCard({ id: "alice-active", name: "Charizard" }));
  const fireEnergy = createGameCard(createEnergyCard("Fire"));
  aliceActive.attachedEnergy = [fireEnergy]; // Has energy to attack
  state.players[0].active = aliceActive;

  const aliceBench1 = createGameCard(createTestCard({ id: "alice-bench", name: "Charmander" }));
  state.players[0].bench = createZone([aliceBench1]);

  // Energy in hand for retreat cost
  const handEnergy = createGameCard(createEnergyCard("Fire"));
  state.players[0].hand = createZone([handEnergy]);

  // Bob: active + bench
  const bobActive = createGameCard(createTestCard({ id: "bob-active", name: "Blastoise", types: ["Water"] }));
  state.players[1].active = bobActive;

  const bobBench1 = createGameCard(createTestCard({ id: "bob-bench", name: "Squirtle", types: ["Water"] }));
  state.players[1].bench = createZone([bobBench1]);

  // Give both players some prize cards and deck
  for (let p = 0; p < 2; p++) {
    state.players[p as 0 | 1].prizes = createZone(
      Array.from({ length: 6 }, (_, i) =>
        createGameCard(createEnergyCard("Fire"))
      )
    );
    state.players[p as 0 | 1].deck = createZone(
      Array.from({ length: 10 }, (_, i) =>
        createGameCard(createEnergyCard("Fire"))
      )
    );
  }

  return state;
}

// ─── Tests ───

describe("Status Condition Attack Checks", () => {
  afterEach(() => {
    setRandomFn(); // Reset to default
  });

  // ─── Paralyzed: Cannot Attack ───

  describe("Paralyzed Pokemon", () => {
    it("cannot attack when paralyzed", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["paralyzed"];

      const result = canAttack(state, 0, "Test Attack");
      expect(result).toBe(false);
    });

    it("can attack after paralysis is cured", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["paralyzed"];

      // Verify can't attack
      expect(canAttack(state, 0, "Test Attack")).toBe(false);

      // Cure paralysis
      state.players[0].active!.statusConditions = [];

      // Now can attack
      expect(canAttack(state, 0, "Test Attack")).toBe(true);
    });

    it("cannot retreat when paralyzed", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["paralyzed"];

      // The active has retreat cost 1, provide 1 energy
      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      const result = canRetreat(state, [energyId]);
      expect(result.success).toBe(false);
      expect(result.error).toContain("麻痹");
    });

    it("can retreat after paralysis is cured", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["paralyzed"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;

      // Can't retreat while paralyzed
      expect(canRetreat(state, [energyId]).success).toBe(false);

      // Cure
      state.players[0].active!.statusConditions = [];

      // Now can retreat
      expect(canRetreat(state, [energyId]).success).toBe(true);
    });

    it("paralyzed blocks attack even with sufficient energy", () => {
      const state = setupBattleState();
      // Give extra energy
      state.players[0].active!.attachedEnergy.push(
        createGameCard(createEnergyCard("Fire")),
        createGameCard(createEnergyCard("Fire"))
      );
      state.players[0].active!.statusConditions = ["paralyzed"];

      expect(canAttack(state, 0, "Test Attack")).toBe(false);
    });
  });

  // ─── Asleep: Cannot Attack ───

  describe("Asleep Pokemon", () => {
    it("cannot attack when asleep", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["asleep"];

      const result = canAttack(state, 0, "Test Attack");
      expect(result).toBe(false);
    });

    it("can attack after waking up", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["asleep"];

      expect(canAttack(state, 0, "Test Attack")).toBe(false);

      // Wake up
      state.players[0].active!.statusConditions = [];
      expect(canAttack(state, 0, "Test Attack")).toBe(true);
    });

    it("cannot retreat when asleep", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["asleep"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      // PTCG Rule: Asleep Pokemon CANNOT retreat (same as Paralyzed)
      const result = canRetreat(state, [energyId]);
      expect(result.success).toBe(false);
      expect(result.error).toContain("睡眠");
    });

    it("asleep blocks attack even with sufficient energy", () => {
      const state = setupBattleState();
      state.players[0].active!.attachedEnergy.push(
        createGameCard(createEnergyCard("Fire"))
      );
      state.players[0].active!.statusConditions = ["asleep"];

      expect(canAttack(state, 0, "Test Attack")).toBe(false);
    });
  });

  // ─── Confused: Coin Flip Attack ───

  describe("Confused Pokemon", () => {
    it("CAN attempt to attack (canAttack returns true)", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];

      // canAttack should return true — confused doesn't prevent attempting
      expect(canAttack(state, 0, "Test Attack")).toBe(true);
    });

    it("attack succeeds on heads — deals normal damage", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];
      setRandomFn(() => 0.7); // heads

      const result = performAttack(state, 0, "Test Attack");
      expect(result.success).toBe(true);

      // Defender should have taken damage (50 base, possibly modified by weakness)
      expect(state.players[1].active!.damageCounters).toBeGreaterThan(0);

      // Attacker should NOT have taken self-damage
      expect(state.players[0].active!.damageCounters).toBe(0);
    });

    it("attack fails on tails — 30 damage to self, no damage to opponent", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];
      setRandomFn(() => 0.3); // tails

      const initialDefenderCounters = state.players[1].active!.damageCounters;

      const result = performAttack(state, 0, "Test Attack");
      expect(result.success).toBe(true); // Action is consumed even on tails

      // Attacker takes 30 self-damage (3 counters)
      expect(state.players[0].active!.damageCounters).toBe(3);

      // Defender takes NO damage
      expect(state.players[1].active!.damageCounters).toBe(initialDefenderCounters);
    });

    it("confusion self-damage can KO the attacker", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];
      // Set HP to 30, so 30 confusion damage will KO
      state.players[0].active!.card = createTestCard({
        id: "low-hp",
        name: "Weak Pokemon",
        hp: "30",
      });
      setRandomFn(() => 0.3); // tails

      const result = performAttack(state, 0, "Test Attack");
      expect(result.success).toBe(true);

      // Active should be KO'd (moved to discard, active = null)
      expect(state.players[0].active).toBeNull();
    });

    it("confusion self-KO awards prizes to opponent", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];
      state.players[0].active!.card = createTestCard({
        id: "low-hp",
        name: "Weak Pokemon",
        hp: "30",
      });
      setRandomFn(() => 0.3); // tails

      const opponentPrizesBefore = state.players[1].prizes.cards.length;
      const opponentHandBefore = state.players[1].hand.cards.length;

      performAttack(state, 0, "Test Attack");

      // Opponent should have gained a prize card (taken from their prizes to hand)
      expect(state.players[1].prizes.cards.length).toBe(opponentPrizesBefore - 1);
      expect(state.players[1].hand.cards.length).toBe(opponentHandBefore + 1);
    });

    it("confusion self-KO of ex Pokemon awards 2 prizes", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];
      state.players[0].active!.card = createTestCard({
        id: "ex-low-hp",
        name: "Charizard ex",
        hp: "30",
        subtypes: ["Stage 2", "ex"],
      });
      setRandomFn(() => 0.3); // tails

      const opponentPrizesBefore = state.players[1].prizes.cards.length;
      const opponentHandBefore = state.players[1].hand.cards.length;

      performAttack(state, 0, "Test Attack");

      // ex gives 2 prizes
      expect(state.players[1].prizes.cards.length).toBe(opponentPrizesBefore - 2);
      expect(state.players[1].hand.cards.length).toBe(opponentHandBefore + 2);
    });

    it("confused Pokemon CAN retreat (confusion does not block retreat)", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      const result = canRetreat(state, [energyId]);
      expect(result.success).toBe(true);
    });

    it("logs coin flip result for confusion", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];
      setRandomFn(() => 0.3); // tails

      const logLengthBefore = state.log.length;
      performAttack(state, 0, "Test Attack");

      // Should have logged a coin flip event
      const coinFlipEvents = state.log.slice(logLengthBefore).filter(e => e.type === "coin_flip");
      expect(coinFlipEvents.length).toBe(1);
      expect(coinFlipEvents[0].message).toContain("混乱");
      expect(coinFlipEvents[0].message).toContain("反面");
    });

    it("logs coin flip heads for confusion", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];
      setRandomFn(() => 0.7); // heads

      const logLengthBefore = state.log.length;
      performAttack(state, 0, "Test Attack");

      const coinFlipEvents = state.log.slice(logLengthBefore).filter(e => e.type === "coin_flip");
      expect(coinFlipEvents.length).toBe(1);
      expect(coinFlipEvents[0].message).toContain("正面");
    });
  });

  // ─── Poisoned/Burned: CAN Attack and Retreat ───

  describe("Poisoned Pokemon", () => {
    it("CAN attack when poisoned", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["poisoned"];

      expect(canAttack(state, 0, "Test Attack")).toBe(true);
    });

    it("CAN retreat when poisoned", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["poisoned"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      expect(canRetreat(state, [energyId]).success).toBe(true);
    });
  });

  describe("Burned Pokemon", () => {
    it("CAN attack when burned", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["burned"];

      expect(canAttack(state, 0, "Test Attack")).toBe(true);
    });

    it("CAN retreat when burned", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["burned"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      expect(canRetreat(state, [energyId]).success).toBe(true);
    });
  });

  // ─── Combined Status Conditions ───

  describe("Combined status conditions", () => {
    it("poisoned + paralyzed: cannot attack (paralyzed takes precedence)", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["poisoned", "paralyzed"];

      expect(canAttack(state, 0, "Test Attack")).toBe(false);
    });

    it("poisoned + asleep: cannot attack (asleep takes precedence)", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["poisoned", "asleep"];

      expect(canAttack(state, 0, "Test Attack")).toBe(false);
    });

    it("burned + confused: attack triggers coin flip", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["burned", "confused"];
      setRandomFn(() => 0.3); // tails

      const result = performAttack(state, 0, "Test Attack");
      expect(result.success).toBe(true);

      // Self damage from confusion (burn damage happens at end of turn, not during attack)
      expect(state.players[0].active?.damageCounters).toBe(3);
    });

    it("poisoned + confused: confusion coin flip still applies", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["poisoned", "confused"];
      setRandomFn(() => 0.7); // heads

      const result = performAttack(state, 0, "Test Attack");
      expect(result.success).toBe(true);

      // Heads: attack should have proceeded normally, hitting defender
      expect(state.players[1].active!.damageCounters).toBeGreaterThan(0);
    });
  });

  // ─── Edge Cases ───

  describe("Edge cases", () => {
    it("confusion self-KO when last active Pokemon causes game over", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];
      state.players[0].active!.card = createTestCard({
        id: "low-hp-2",
        name: "Dying Pokemon",
        hp: "30",
      });
      // Empty the bench so there's no promotion after KO
      state.players[0].bench = createZone([]);
      setRandomFn(() => 0.3); // tails

      const result = performAttack(state, 0, "Test Attack");
      expect(result.success).toBe(true);

      // Either game is over from no pokemon, or from prizes
      // With empty bench, the no_bench_pokemon win condition should trigger
      expect(state.players[0].active).toBeNull();
    });

    it("performAttack returns success even on confusion tails (action is consumed)", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];
      setRandomFn(() => 0.3); // tails

      const result = performAttack(state, 0, "Test Attack");
      // success = true because the player's attack action was spent
      expect(result.success).toBe(true);
    });

    it("paralyzed check in canAttack runs after energy check", () => {
      const state = setupBattleState();
      // Remove all energy so attack would fail on energy check too
      state.players[0].active!.attachedEnergy = [];
      state.players[0].active!.statusConditions = ["paralyzed"];

      // canAttack should still return false (energy check or paralysis check)
      expect(canAttack(state, 0, "Test Attack")).toBe(false);
    });
  });
});
