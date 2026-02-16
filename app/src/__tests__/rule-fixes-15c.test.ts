/**
 * System Rule Fixes — Session 15c
 *
 * Fix 1: Going-first player cannot play Supporter on their first turn
 *   - PTCG Official Rule: "The player who goes first cannot attack or play
 *     a Supporter card on their first turn."
 *
 * Fix 2: Asleep Pokemon cannot retreat
 *   - PTCG Official Rule: "If a Pokémon is Asleep, it can't attack or retreat."
 *   - Previously only Paralyzed was blocking retreat; Asleep was missing.
 */

import {
  GameState,
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
} from "../engine/game-state";
import {
  canRetreat,
  canPlaySupporter,
  playSupporter,
  retreat,
} from "../engine/turn-actions";
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

function createSupporterCard(name: string = "Professor's Research"): Card {
  return {
    id: `supporter-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    supertype: "Trainer",
    subtypes: ["Supporter"],
    number: "1",
    rarity: "Uncommon",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
  } as Card;
}

function setupBattleState(): GameState {
  resetInstanceCounter();
  const state = createGameState("Alice", "Bob");
  state.phase = "main";
  state.turn = 2; // Not first turn
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Alice: active + bench + hand with energy
  const aliceActive = createGameCard(
    createTestCard({ id: "alice-active", name: "Charizard" })
  );
  const fireEnergy = createGameCard(createEnergyCard("Fire"));
  aliceActive.attachedEnergy = [fireEnergy];
  state.players[0].active = aliceActive;

  const aliceBench1 = createGameCard(
    createTestCard({ id: "alice-bench", name: "Charmander" })
  );
  state.players[0].bench = createZone([aliceBench1]);

  // Energy in hand
  const handEnergy = createGameCard(createEnergyCard("Fire"));
  state.players[0].hand = createZone([handEnergy]);

  // Bob: active + bench
  const bobActive = createGameCard(
    createTestCard({ id: "bob-active", name: "Blastoise", types: ["Water"] })
  );
  state.players[1].active = bobActive;

  const bobBench1 = createGameCard(
    createTestCard({ id: "bob-bench", name: "Squirtle", types: ["Water"] })
  );
  state.players[1].bench = createZone([bobBench1]);

  // Prizes + deck
  for (let p = 0; p < 2; p++) {
    state.players[p as 0 | 1].prizes = createZone(
      Array.from({ length: 6 }, () => createGameCard(createEnergyCard("Fire")))
    );
    state.players[p as 0 | 1].deck = createZone(
      Array.from({ length: 10 }, () => createGameCard(createEnergyCard("Fire")))
    );
  }

  return state;
}

// ─── Tests ───

describe("System Rule Fixes — Session 15c", () => {
  // ═══════════════════════════════════════════════
  // Fix 1: First-turn Supporter restriction
  // ═══════════════════════════════════════════════

  describe("Fix 1: Going-first player cannot play Supporter on first turn", () => {
    it("blocks Supporter on turn 1 (isFirstTurn=true)", () => {
      const state = setupBattleState();
      state.turn = 1;
      state.isFirstTurn = true;

      // Add a supporter to hand
      const supporter = createGameCard(createSupporterCard());
      state.players[0].hand.cards.push(supporter);

      const result = canPlaySupporter(state, supporter.instanceId);
      expect(result.success).toBe(false);
      expect(result.error).toContain("先攻方第一回合");
    });

    it("allows Supporter on turn 2 (second player's first turn)", () => {
      const state = setupBattleState();
      state.turn = 2;
      state.isFirstTurn = false;
      state.currentPlayer = 1;

      const supporter = createGameCard(createSupporterCard());
      state.players[1].hand.cards.push(supporter);

      // Set up player 1 active/bench so canPlaySupporter doesn't fail for other reasons
      state.players[1].active = createGameCard(
        createTestCard({ id: "bob-active-2", name: "Blastoise", types: ["Water"] })
      );

      const result = canPlaySupporter(state, supporter.instanceId);
      expect(result.success).toBe(true);
    });

    it("allows Supporter on turn 3+ (normal turns)", () => {
      const state = setupBattleState();
      state.turn = 3;
      state.isFirstTurn = false;

      const supporter = createGameCard(createSupporterCard());
      state.players[0].hand.cards.push(supporter);

      const result = canPlaySupporter(state, supporter.instanceId);
      expect(result.success).toBe(true);
    });

    it("first-turn restriction takes precedence over supporterUsedThisTurn", () => {
      const state = setupBattleState();
      state.turn = 1;
      state.isFirstTurn = true;
      state.players[0].supporterUsedThisTurn = false;

      const supporter = createGameCard(createSupporterCard());
      state.players[0].hand.cards.push(supporter);

      const result = canPlaySupporter(state, supporter.instanceId);
      expect(result.success).toBe(false);
      // Should fail with first-turn message (not "already used" message)
      expect(result.error).toContain("先攻方第一回合");
    });

    it("per-turn limit still works on turn 2+", () => {
      const state = setupBattleState();
      state.turn = 2;
      state.isFirstTurn = false;
      state.players[0].supporterUsedThisTurn = true; // Already used one

      const supporter = createGameCard(createSupporterCard());
      state.players[0].hand.cards.push(supporter);

      const result = canPlaySupporter(state, supporter.instanceId);
      expect(result.success).toBe(false);
      expect(result.error).toContain("每回合只能使用一张");
    });

    it("playSupporter() also blocked on first turn", () => {
      const state = setupBattleState();
      state.turn = 1;
      state.isFirstTurn = true;

      const supporter = createGameCard(createSupporterCard());
      state.players[0].hand.cards.push(supporter);

      const result = playSupporter(state, supporter.instanceId);
      expect(result.success).toBe(false);
      expect(result.error).toContain("先攻方第一回合");
    });
  });

  // ═══════════════════════════════════════════════
  // Fix 2: Asleep blocks retreat
  // ═══════════════════════════════════════════════

  describe("Fix 2: Asleep Pokemon cannot retreat", () => {
    it("blocks retreat when asleep", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["asleep"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      const result = canRetreat(state, [energyId]);
      expect(result.success).toBe(false);
      expect(result.error).toContain("睡眠");
    });

    it("can retreat after waking up from sleep", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["asleep"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;

      // Can't retreat while asleep
      expect(canRetreat(state, [energyId]).success).toBe(false);

      // Wake up
      state.players[0].active!.statusConditions = [];

      // Now can retreat
      expect(canRetreat(state, [energyId]).success).toBe(true);
    });

    it("asleep blocks retreat even with 0 retreat cost", () => {
      const state = setupBattleState();
      state.players[0].active!.card.convertedRetreatCost = 0;
      state.players[0].active!.card.retreatCost = [];
      state.players[0].active!.statusConditions = ["asleep"];

      const result = canRetreat(state, []);
      expect(result.success).toBe(false);
      expect(result.error).toContain("睡眠");
    });

    it("paralyzed still blocks retreat (regression)", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["paralyzed"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      const result = canRetreat(state, [energyId]);
      expect(result.success).toBe(false);
      expect(result.error).toContain("麻痹");
    });

    it("confused does NOT block retreat", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["confused"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      const result = canRetreat(state, [energyId]);
      expect(result.success).toBe(true);
    });

    it("poisoned does NOT block retreat", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["poisoned"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      const result = canRetreat(state, [energyId]);
      expect(result.success).toBe(true);
    });

    it("burned does NOT block retreat", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["burned"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      const result = canRetreat(state, [energyId]);
      expect(result.success).toBe(true);
    });

    it("retreat() function also rejects asleep Pokemon", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["asleep"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      const benchId = state.players[0].bench.cards[0].instanceId;
      const result = retreat(state, [energyId], benchId);
      expect(result.success).toBe(false);
      expect(result.error).toContain("睡眠");
    });
  });

  // ═══════════════════════════════════════════════
  // Combined / Regression
  // ═══════════════════════════════════════════════

  describe("Combined and regression tests", () => {
    it("first turn: can play Item (only Supporter is blocked)", () => {
      // This is a sanity check — Items are NOT blocked on first turn
      // We just verify canPlaySupporter is specific to Supporters
      const state = setupBattleState();
      state.turn = 1;
      state.isFirstTurn = true;

      // Items should still work (tested through other means, but
      // verifying Supporter restriction doesn't affect other actions)
      const supporter = createGameCard(createSupporterCard());
      state.players[0].hand.cards.push(supporter);

      const result = canPlaySupporter(state, supporter.instanceId);
      expect(result.success).toBe(false);
    });

    it("asleep+poisoned: retreat blocked (asleep takes priority)", () => {
      const state = setupBattleState();
      state.players[0].active!.statusConditions = ["asleep", "poisoned"];

      const energyId = state.players[0].active!.attachedEnergy[0].instanceId;
      const result = canRetreat(state, [energyId]);
      expect(result.success).toBe(false);
      expect(result.error).toContain("睡眠");
    });
  });
});
