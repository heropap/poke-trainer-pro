/**
 * Pokemon Placement Modal Tests
 *
 * Tests the manual placement flow:
 * 1. executePreparation with manualPlacementPlayers skips auto-placement
 * 2. finalizeManualPlacement places pokemon and sets prizes
 * 3. Integration with initializeGame
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
  shuffleZone,
  drawMultiple,
  addCards,
  getBasicPokemon,
  zoneSize,
} from "@/engine/zones";
import {
  executePreparation,
  finalizeManualPlacement,
  placeBasicPokemon,
  autoPlaceBasicPokemon,
  INITIAL_HAND_SIZE,
  PRIZE_CARD_COUNT,
  PlacementChoice,
} from "@/engine/battle-prepare";

// ─── Test Card Fixtures ───

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "sv1-1",
    name: "Pineco",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "60",
    types: ["Grass"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "https://example.com/s.png", large: "https://example.com/l.png" },
    set: "sv1",
    ...overrides,
  };
}

function makeBasic(name: string, hp: string, id?: string): Card {
  return makeCard({
    id: id || `sv1-${name.toLowerCase()}`,
    name,
    hp,
    subtypes: ["Basic"],
  });
}

function makeTrainer(name: string): Card {
  return makeCard({
    id: `sv1-trainer-${name.toLowerCase()}`,
    name,
    supertype: "Trainer",
    subtypes: ["Item"],
    hp: undefined,
    types: [],
  });
}

function makeEnergy(name: string): Card {
  return makeCard({
    id: `sv1-energy-${name.toLowerCase()}`,
    name,
    supertype: "Energy",
    subtypes: ["Basic"],
    hp: undefined,
    types: [name],
  });
}

/**
 * Create a GameState where both players have hands with basic Pokemon
 * and full decks ready for preparation.
 */
function createTestState(): GameState {
  resetInstanceCounter();
  const state = createGameState("玩家", "AI 对手");

  // Player 0: 3 basics + trainers + energies in hand, 40 cards in deck
  const p0Basics = [
    createGameCard(makeBasic("Charmander", "70")),
    createGameCard(makeBasic("Squirtle", "60")),
    createGameCard(makeBasic("Bulbasaur", "80")),
  ];
  const p0Others = [
    createGameCard(makeTrainer("Potion")),
    createGameCard(makeTrainer("Switch")),
    createGameCard(makeEnergy("Fire")),
    createGameCard(makeEnergy("Water")),
  ];
  state.players[0].hand = createZone([...p0Basics, ...p0Others]);

  // Player 1: 2 basics + trainers + energies
  const p1Basics = [
    createGameCard(makeBasic("Pikachu", "60")),
    createGameCard(makeBasic("Eevee", "50")),
  ];
  const p1Others = [
    createGameCard(makeTrainer("Potion")),
    createGameCard(makeTrainer("Switch")),
    createGameCard(makeEnergy("Lightning")),
    createGameCard(makeEnergy("Grass")),
    createGameCard(makeEnergy("Psychic")),
  ];
  state.players[1].hand = createZone([...p1Basics, ...p1Others]);

  // Fill decks with dummy cards
  for (let i = 0; i < 40; i++) {
    state.players[0].deck.cards.push(createGameCard(makeEnergy("Fire")));
    state.players[1].deck.cards.push(createGameCard(makeEnergy("Lightning")));
  }

  return state;
}

// ─── Tests ───

describe("Manual Pokemon Placement", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  describe("executePreparation with manualPlacementPlayers", () => {
    test("skips auto-placement for specified player and returns pending placements", () => {
      const state = createTestState();

      const result = executePreparation(state, () => 0.3, {
        manualPlacementPlayers: [0],
      });

      expect(result.success).toBe(true);

      // Player 0 should NOT have been placed (manual)
      expect(state.players[0].active).toBeNull();
      expect(state.players[0].bench.cards).toHaveLength(0);

      // Player 1 SHOULD have been placed (auto)
      expect(state.players[1].active).not.toBeNull();

      // pendingPlacements should have player 0's basics
      expect(result.pendingPlacements).toBeDefined();
      expect(result.pendingPlacements![0]).toBeDefined();
      expect(result.pendingPlacements![0].length).toBe(3); // 3 basic Pokemon
    });

    test("auto-places AI player even when human is manual", () => {
      const state = createTestState();

      const result = executePreparation(state, () => 0.3, {
        manualPlacementPlayers: [0],
      });

      expect(result.success).toBe(true);

      // AI (player 1) should have active set (auto-placed)
      expect(state.players[1].active).not.toBeNull();
      expect(state.players[1].active!.card.name).toBe("Pikachu"); // highest HP = 60, same HP → first in hand
    });

    test("skips prize setup for manual placement players", () => {
      const state = createTestState();

      const result = executePreparation(state, () => 0.3, {
        manualPlacementPlayers: [0],
      });

      expect(result.success).toBe(true);

      // Player 0 should have 0 prizes (not set yet)
      expect(state.players[0].prizes.cards).toHaveLength(0);

      // Player 1 should have 6 prizes (auto-placed → prizes set)
      expect(state.players[1].prizes.cards).toHaveLength(PRIZE_CARD_COUNT);
    });

    test("without manualPlacementPlayers, both players auto-place (backward compat)", () => {
      const state = createTestState();

      const result = executePreparation(state, () => 0.3);

      expect(result.success).toBe(true);
      expect(result.pendingPlacements).toBeUndefined();

      // Both players should have active Pokemon
      expect(state.players[0].active).not.toBeNull();
      expect(state.players[1].active).not.toBeNull();

      // Both should have prizes
      expect(state.players[0].prizes.cards).toHaveLength(PRIZE_CARD_COUNT);
      expect(state.players[1].prizes.cards).toHaveLength(PRIZE_CARD_COUNT);
    });

    test("coin flip still happens with manual placement", () => {
      const state = createTestState();

      const result = executePreparation(state, () => 0.3, {
        manualPlacementPlayers: [0],
      });

      expect(result.success).toBe(true);
      expect(result.coinFlipResult).not.toBeNull();
      expect(result.coinFlipResult!.result).toBe("heads"); // 0.3 < 0.5 = heads
    });
  });

  describe("finalizeManualPlacement", () => {
    test("places active and bench Pokemon from hand", () => {
      const state = createTestState();

      // Run preparation with manual placement for player 0
      const prepResult = executePreparation(state, () => 0.3, {
        manualPlacementPlayers: [0],
      });
      expect(prepResult.success).toBe(true);

      const basics = prepResult.pendingPlacements![0];
      const choice: PlacementChoice = {
        activeInstanceId: basics[0].instanceId, // Charmander
        benchInstanceIds: [basics[1].instanceId], // Squirtle
      };

      const result = finalizeManualPlacement(state, 0, choice);

      expect(result.success).toBe(true);

      // Active should be set
      expect(state.players[0].active).not.toBeNull();
      expect(state.players[0].active!.card.name).toBe("Charmander");

      // Bench should have 1 Pokemon
      expect(state.players[0].bench.cards).toHaveLength(1);
      expect(state.players[0].bench.cards[0].card.name).toBe("Squirtle");

      // Prize cards should be set (6)
      expect(state.players[0].prizes.cards).toHaveLength(PRIZE_CARD_COUNT);
    });

    test("places only active (no bench) when player chooses", () => {
      const state = createTestState();

      const prepResult = executePreparation(state, () => 0.3, {
        manualPlacementPlayers: [0],
      });
      expect(prepResult.success).toBe(true);

      const basics = prepResult.pendingPlacements![0];
      const choice: PlacementChoice = {
        activeInstanceId: basics[2].instanceId, // Bulbasaur (HP 80)
        benchInstanceIds: [],
      };

      const result = finalizeManualPlacement(state, 0, choice);

      expect(result.success).toBe(true);
      expect(state.players[0].active!.card.name).toBe("Bulbasaur");
      expect(state.players[0].bench.cards).toHaveLength(0);
      expect(state.players[0].prizes.cards).toHaveLength(PRIZE_CARD_COUNT);
    });

    test("removes placed cards from hand", () => {
      const state = createTestState();

      const prepResult = executePreparation(state, () => 0.3, {
        manualPlacementPlayers: [0],
      });
      expect(prepResult.success).toBe(true);

      const handSizeBefore = state.players[0].hand.cards.length;
      const basics = prepResult.pendingPlacements![0];

      const choice: PlacementChoice = {
        activeInstanceId: basics[0].instanceId,
        benchInstanceIds: [basics[1].instanceId, basics[2].instanceId],
      };

      finalizeManualPlacement(state, 0, choice);

      // Hand should have 3 fewer cards (3 basics removed)
      expect(state.players[0].hand.cards.length).toBe(handSizeBefore - 3);
    });

    test("rejects invalid placement (non-basic card)", () => {
      const state = createTestState();

      const prepResult = executePreparation(state, () => 0.3, {
        manualPlacementPlayers: [0],
      });
      expect(prepResult.success).toBe(true);

      // Try to place a trainer card as active
      const trainers = state.players[0].hand.cards.filter(
        (c) => c.card.supertype === "Trainer"
      );
      expect(trainers.length).toBeGreaterThan(0);

      const choice: PlacementChoice = {
        activeInstanceId: trainers[0].instanceId,
        benchInstanceIds: [],
      };

      const result = finalizeManualPlacement(state, 0, choice);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Full flow: manual placement → finalize → game start", () => {
    test("complete game initialization with manual placement", () => {
      const state = createTestState();

      // Step 1: Preparation with manual placement
      const prepResult = executePreparation(state, () => 0.3, {
        manualPlacementPlayers: [0],
      });
      expect(prepResult.success).toBe(true);
      expect(prepResult.pendingPlacements![0]).toBeDefined();

      // Step 2: Player chooses placement
      const basics = prepResult.pendingPlacements![0];
      const choice: PlacementChoice = {
        activeInstanceId: basics[0].instanceId,
        benchInstanceIds: [basics[1].instanceId],
      };

      const placeResult = finalizeManualPlacement(state, 0, choice);
      expect(placeResult.success).toBe(true);

      // Step 3: Verify game state is ready
      // Both players have active Pokemon
      expect(state.players[0].active).not.toBeNull();
      expect(state.players[1].active).not.toBeNull();

      // Both players have prize cards
      expect(state.players[0].prizes.cards).toHaveLength(PRIZE_CARD_COUNT);
      expect(state.players[1].prizes.cards).toHaveLength(PRIZE_CARD_COUNT);

      // Game phase should be DRAW (ready to start)
      expect(state.phase).toBe(GamePhase.DRAW);
      expect(state.turn).toBe(1);
    });
  });
});
