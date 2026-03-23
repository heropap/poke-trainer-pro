/**
 * Promotion Modal Tests
 *
 * Tests the KO → promotion flow:
 * 1. When active is KO'd with 1 bench → auto-promote (unchanged)
 * 2. When active is KO'd with 2+ bench → promotionRequired signal for modal
 * 3. handlePromote correctly places selected bench Pokemon as active
 * 4. Game continues correctly after promotion
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
import {
  promoteBenchPokemon,
  autoPromoteBench,
  performAttack,
} from "@/engine/game-actions";
import { processAction, startFirstTurn } from "@/engine/game-controller";

// ─── Test Card Fixtures ───

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "sv1-1",
    name: "TestMon",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "60",
    types: ["Fire"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "https://example.com/s.png", large: "https://example.com/l.png" },
    set: "sv1",
    ...overrides,
  };
}

function makeBasic(name: string, hp: string, attacks?: Card["attacks"]): Card {
  return makeCard({
    id: `sv1-${name.toLowerCase().replace(/\s/g, "")}`,
    name,
    hp,
    attacks: attacks || [{ name: "Tackle", cost: ["Colorless"], damage: "20", text: "", convertedEnergyCost: 1 }],
  });
}

function makeEnergy(): Card {
  return makeCard({
    id: "sv1-energy-fire",
    name: "Basic Fire Energy",
    supertype: "Energy",
    subtypes: ["Basic"],
    hp: undefined,
    types: ["Fire"],
  });
}

/**
 * Create a game state where player 0 has attacked and player 1's active
 * is about to be KO'd, with multiple bench Pokemon.
 */
function createPromotionTestState(): GameState {
  resetInstanceCounter();
  const state = createGameState("玩家", "AI 对手");
  state.phase = GamePhase.MAIN;
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Player 0: strong active with energy
  const attacker = createGameCard(makeBasic("Charizard", "180", [
    { name: "Fire Blast", cost: ["Fire"], damage: "120", text: "", convertedEnergyCost: 1 },
  ]));
  attacker.attachedEnergy = [createGameCard(makeEnergy())];
  state.players[0].active = attacker;
  state.players[0].bench = createZone([
    createGameCard(makeBasic("Charmander", "70")),
  ]);

  // Player 1: weak active (will be KO'd) + 3 bench Pokemon
  const defender = createGameCard(makeBasic("Pidgey", "60"));
  state.players[1].active = defender;
  state.players[1].bench = createZone([
    createGameCard(makeBasic("Eevee", "50")),
    createGameCard(makeBasic("Pikachu", "60")),
    createGameCard(makeBasic("Squirtle", "70")),
  ]);

  // Fill decks and prizes
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < 30; i++) {
      state.players[p as 0 | 1].deck.cards.push(createGameCard(makeEnergy()));
    }
    for (let i = 0; i < 6; i++) {
      state.players[p as 0 | 1].prizes.cards.push(createGameCard(makeEnergy()));
    }
  }

  return state;
}

// ─── Tests ───

describe("KO Promotion Flow", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  describe("promoteBenchPokemon (engine level)", () => {
    test("moves bench Pokemon to active slot", () => {
      const state = createPromotionTestState();
      const benchCard = state.players[1].bench.cards[1]; // Pikachu

      // Manually set active to null (simulating KO)
      state.players[1].active = null;

      const result = promoteBenchPokemon(state, 1, benchCard.instanceId);

      expect(result.success).toBe(true);
      expect(state.players[1].active).not.toBeNull();
      expect(state.players[1].active!.card.name).toBe("Pikachu");
      expect(state.players[1].bench.cards.length).toBe(2); // Was 3, now 2
    });

    test("rejects promotion when active already exists", () => {
      const state = createPromotionTestState();
      const benchCard = state.players[1].bench.cards[0];

      const result = promoteBenchPokemon(state, 1, benchCard.instanceId);

      expect(result.success).toBe(false);
    });

    test("rejects promotion with invalid instanceId", () => {
      const state = createPromotionTestState();
      state.players[1].active = null;

      const result = promoteBenchPokemon(state, 1, "nonexistent-id");

      expect(result.success).toBe(false);
    });
  });

  describe("autoPromoteBench (single bench)", () => {
    test("auto-promotes when only 1 bench Pokemon", () => {
      const state = createPromotionTestState();
      state.players[1].active = null;
      // Keep only one bench Pokemon
      state.players[1].bench.cards = [state.players[1].bench.cards[0]];

      const result = autoPromoteBench(state, 1);

      expect(result.success).toBe(true);
      expect(state.players[1].active).not.toBeNull();
      expect(state.players[1].active!.card.name).toBe("Eevee");
      expect(state.players[1].bench.cards.length).toBe(0);
    });
  });

  describe("processAction promote (controller level)", () => {
    test("attack that KOs with 2+ bench returns promotionRequired", async () => {
      const state = createPromotionTestState();

      // Perform attack that will KO defender (120 damage > 60 HP)
      const result = await processAction(state, 0, {
        type: "attack",
        attackName: "Fire Blast",
      });

      expect(result.success).toBe(true);
      expect(result.promotionRequired).toBe(true);
      expect(result.promotionPlayerIndex).toBe(1);
      // Defender's active should be null (KO'd)
      expect(result.newState.players[1].active).toBeNull();
      // Bench should still have 3 Pokemon
      expect(result.newState.players[1].bench.cards.length).toBe(3);
    });

    test("promote action after KO sets active and continues game", async () => {
      const state = createPromotionTestState();

      // Step 1: Attack to KO
      const attackResult = await processAction(state, 0, {
        type: "attack",
        attackName: "Fire Blast",
      });
      expect(attackResult.promotionRequired).toBe(true);

      // Step 2: Player 1 promotes Squirtle (HP 70 — best choice)
      const squirtle = attackResult.newState.players[1].bench.cards.find(
        c => c.card.name === "Squirtle"
      );
      expect(squirtle).toBeDefined();

      const promoteResult = await processAction(attackResult.newState, 1, {
        type: "promote",
        benchInstanceId: squirtle!.instanceId,
      });

      expect(promoteResult.success).toBe(true);
      expect(promoteResult.newState.players[1].active).not.toBeNull();
      expect(promoteResult.newState.players[1].active!.card.name).toBe("Squirtle");
      expect(promoteResult.newState.players[1].bench.cards.length).toBe(2);
    });

    test("attack that KOs with 1 bench auto-promotes", async () => {
      const state = createPromotionTestState();
      // Keep only 1 bench Pokemon for defender
      state.players[1].bench.cards = [state.players[1].bench.cards[0]];

      const result = await processAction(state, 0, {
        type: "attack",
        attackName: "Fire Blast",
      });

      expect(result.success).toBe(true);
      // Should NOT require promotion (auto-promoted)
      expect(result.promotionRequired).toBeFalsy();
      // Active should be the auto-promoted bench Pokemon
      expect(result.newState.players[1].active).not.toBeNull();
      expect(result.newState.players[1].active!.card.name).toBe("Eevee");
    });

    test("player can choose any bench Pokemon for promotion", async () => {
      const state = createPromotionTestState();

      // Attack to KO
      const attackResult = await processAction(state, 0, {
        type: "attack",
        attackName: "Fire Blast",
      });

      // Try promoting each bench Pokemon
      for (const benchCard of attackResult.newState.players[1].bench.cards) {
        // Clone state for each test
        const testState = JSON.parse(JSON.stringify(attackResult.newState));

        const result = await processAction(testState, 1, {
          type: "promote",
          benchInstanceId: benchCard.instanceId,
        });

        expect(result.success).toBe(true);
        expect(result.newState.players[1].active!.card.name).toBe(benchCard.card.name);
      }
    });
  });
});
