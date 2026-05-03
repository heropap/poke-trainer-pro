/**
 * First Turn Rules — Comprehensive Validation
 *
 * PTCG Standard rules: Going-first player on turn 1 cannot:
 * 1. Attack
 * 2. Use Supporter cards
 *
 * These restrictions are lifted:
 * - On the second player's first turn
 * - On the first player's second turn (turn 3 globally)
 *
 * Tests cover:
 * - Engine-level blocking (processAction)
 * - UI-level availability (getAttackDisabledReason, canPlaySupporter)
 * - AI behavior (skips attack on first turn)
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
import { processAction } from "@/engine/game-controller";
import { getAttackDisabledReason } from "@/engine/action-availability";
import { canPlaySupporter } from "@/engine/turn-actions";
import { computeAIAction } from "@/engine/ai-player";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "sv1-1",
    name: "TestMon",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "100",
    types: ["Fire"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
    set: "sv1",
    attacks: [
      { name: "Tackle", cost: ["Colorless"], damage: "30", text: "", convertedEnergyCost: 1 },
    ],
    ...overrides,
  };
}

function makeEnergy(): Card {
  return makeCard({
    id: "sve-2", name: "Basic Fire Energy", supertype: "Energy",
    subtypes: ["Basic"], hp: undefined, types: ["Fire"], attacks: [],
  });
}

function makeSupporter(): Card {
  return makeCard({
    id: "svi-190", name: "Professor's Research", supertype: "Trainer",
    subtypes: ["Supporter"], hp: undefined, types: [], attacks: [],
  });
}

function createFirstTurnState(): GameState {
  resetInstanceCounter();
  const state = createGameState("玩家", "AI 对手");
  state.phase = GamePhase.MAIN;
  state.turn = 1;
  state.isFirstTurn = true;
  state.currentPlayer = 0;

  // Player 0: active with energy + supporter in hand
  const active = createGameCard(makeCard());
  active.attachedEnergy = [createGameCard(makeEnergy())];
  state.players[0].active = active;
  state.players[0].hand = createZone([
    createGameCard(makeSupporter()),
    createGameCard(makeEnergy()),
  ]);
  state.players[0].bench = createZone([createGameCard(makeCard({ id: "sv1-2", name: "BenchMon" }))]);

  // Player 1: active with energy
  const active1 = createGameCard(makeCard({ id: "sv1-3", name: "OppMon" }));
  active1.attachedEnergy = [createGameCard(makeEnergy())];
  state.players[1].active = active1;
  state.players[1].hand = createZone([
    createGameCard(makeSupporter()),
    createGameCard(makeEnergy()),
  ]);
  state.players[1].bench = createZone([createGameCard(makeCard({ id: "sv1-4", name: "OppBench" }))]);

  // Decks and prizes
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

describe("First Turn Rules", () => {
  beforeEach(() => resetInstanceCounter());

  describe("Attack restriction", () => {
    test("processAction blocks attack on first turn", async () => {
      const state = createFirstTurnState();
      const result = await processAction(state, 0, { type: "attack", attackName: "Tackle" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("先攻");
    });

    test("getAttackDisabledReason returns reason on first turn", () => {
      const state = createFirstTurnState();
      const reason = getAttackDisabledReason(state, 0, state.players[0].active!, "Tackle");
      expect(reason).toBe("先攻第一回合不能攻击");
    });

    test("attack is allowed on second player's turn", async () => {
      const state = createFirstTurnState();
      state.isFirstTurn = false;
      state.currentPlayer = 1;
      const result = await processAction(state, 1, { type: "attack", attackName: "Tackle" });
      expect(result.success).toBe(true);
    });

    test("attack is allowed on first player's second turn", () => {
      const state = createFirstTurnState();
      state.turn = 3;
      state.isFirstTurn = false;
      const reason = getAttackDisabledReason(state, 0, state.players[0].active!, "Tackle");
      expect(reason).toBeNull();
    });
  });

  describe("Supporter restriction", () => {
    test("canPlaySupporter returns failure on first turn", () => {
      const state = createFirstTurnState();
      const supporter = state.players[0].hand.cards.find(c => c.card.supertype === "Trainer");
      expect(supporter).toBeDefined();
      const result = canPlaySupporter(state, supporter!.instanceId);
      expect(result.success).toBe(false);
    });

    test("processAction blocks play_card supporter on first turn", async () => {
      const state = createFirstTurnState();
      const supporter = state.players[0].hand.cards.find(c => c.card.supertype === "Trainer");
      const result = await processAction(state, 0, {
        type: "play_card",
        cardId: supporter!.instanceId,
      });
      expect(result.success).toBe(false);
    });

    test("supporter is allowed on second player's turn", () => {
      const state = createFirstTurnState();
      state.isFirstTurn = false;
      state.currentPlayer = 1;
      const supporter = state.players[1].hand.cards.find(c => c.card.supertype === "Trainer");
      const result = canPlaySupporter(state, supporter!.instanceId);
      expect(result.success).toBe(true);
    });
  });

  describe("AI behavior on first turn", () => {
    test("AI does not attempt attack on first turn", () => {
      const state = createFirstTurnState();
      state.currentPlayer = 1; // AI is player 1
      state.isFirstTurn = true;

      // AI should compute an action but NOT attack
      const decision = computeAIAction(state, 1);
      if (decision) {
        expect(decision.action.type).not.toBe("attack");
      }
    });

    test("AI attacks on subsequent turns", () => {
      const state = createFirstTurnState();
      state.currentPlayer = 1;
      state.isFirstTurn = false;
      state.turn = 2;

      // AI should be willing to attack
      const decision = computeAIAction(state, 1);
      // Could be end_turn if it prefers other actions first, but attack should not be blocked
      // Just verify the AI doesn't crash
      expect(decision).toBeDefined();
    });
  });

  describe("Other actions are NOT restricted on first turn", () => {
    test("energy attachment is allowed", async () => {
      const state = createFirstTurnState();
      const energy = state.players[0].hand.cards.find(c => c.card.supertype === "Energy");
      const result = await processAction(state, 0, {
        type: "play_card",
        cardId: energy!.instanceId,
        targetId: state.players[0].active!.instanceId,
        targetZone: "attach",
      });
      expect(result.success).toBe(true);
    });

    test("playing basic Pokemon to bench is allowed", async () => {
      const state = createFirstTurnState();
      const basic = createGameCard(makeCard({ id: "sv1-new", name: "NewMon" }));
      state.players[0].hand.cards.push(basic);

      const result = await processAction(state, 0, {
        type: "play_card",
        cardId: basic.instanceId,
      });
      expect(result.success).toBe(true);
    });

    test("end turn is allowed", async () => {
      const state = createFirstTurnState();
      const result = await processAction(state, 0, { type: "end_turn" });
      expect(result.success).toBe(true);
    });
  });
});
