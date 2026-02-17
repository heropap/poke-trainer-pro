/**
 * Tests for Layer 2 (P1): Manual Override Toolkit
 *
 * Tests that manual overrides correctly execute game actions
 * bypassing normal restrictions, and integrate properly with
 * the game controller.
 */

import { executeManualOverride, ManualOverrideAction } from "@/engine/manual-override";
import { processAction, GameAction } from "@/engine/game-controller";
import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  logEvent,
} from "@/engine/game-state";
import { Card } from "@/types/card";
import { addCards, shuffleZone } from "@/engine/zones";

// ─── Test Helpers ───

function createTestCard(name: string, supertype = "Pokémon", subtypes = ["Basic"], hp = "100"): Card {
  return {
    id: `test-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    supertype,
    subtypes,
    hp: supertype === "Pokémon" ? hp : undefined,
    types: ["Colorless"],
    attacks: supertype === "Pokémon" ? [
      { name: "Tackle", cost: ["Colorless"], damage: "30", text: "", convertedEnergyCost: 1 },
    ] : undefined,
    retreatCost: supertype === "Pokémon" ? ["Colorless"] : undefined,
    number: "1",
    legalities: {},
    images: { small: "", large: "" },
  };
}

function setupTestGame(): GameState {
  const state = createGameState("Player 1", "Player 2");
  state.phase = "main";
  state.turn = 1;
  state.currentPlayer = 0;

  // Player 0: active + 2 bench + hand + deck
  const p0Active = createGameCard(createTestCard("Pikachu"));
  state.players[0].active = p0Active;

  const p0Bench1 = createGameCard(createTestCard("Eevee"));
  const p0Bench2 = createGameCard(createTestCard("Charmander"));
  state.players[0].bench = createZone([p0Bench1, p0Bench2]);

  // Hand with mixed cards
  const handCards = [
    createGameCard(createTestCard("Raichu", "Pokémon", ["Stage 1"])),
    createGameCard(createTestCard("Professor's Research", "Trainer", ["Supporter"])),
    createGameCard(createTestCard("Basic Fire Energy", "Energy", ["Basic"])),
  ];
  state.players[0].hand = createZone(handCards);

  // Deck with 20 cards
  const deckCards = Array.from({ length: 20 }, (_, i) =>
    createGameCard(createTestCard(`Deck Card ${i + 1}`))
  );
  state.players[0].deck = createZone(deckCards);

  // Discard pile with some cards
  const discardCards = [
    createGameCard(createTestCard("Discarded Mon")),
    createGameCard(createTestCard("Discarded Energy", "Energy", ["Basic"])),
  ];
  state.players[0].discard = createZone(discardCards);

  // Player 1: active + 1 bench
  const p1Active = createGameCard(createTestCard("Meowth"));
  state.players[1].active = p1Active;

  const p1Bench = createGameCard(createTestCard("Rattata"));
  state.players[1].bench = createZone([p1Bench]);

  state.players[1].deck = createZone(
    Array.from({ length: 20 }, (_, i) =>
      createGameCard(createTestCard(`Opp Deck Card ${i + 1}`))
    )
  );

  return state;
}

// ═══════════════════════════════════════════
// Draw Cards
// ═══════════════════════════════════════════

describe("manual_override: draw_cards", () => {
  test("draws specified number of cards", () => {
    const state = setupTestGame();
    const initialHandSize = state.players[0].hand.cards.length;
    const initialDeckSize = state.players[0].deck.cards.length;

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "draw_cards",
      params: { count: 3 },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(state.players[0].hand.cards.length).toBe(initialHandSize + 3);
    expect(state.players[0].deck.cards.length).toBe(initialDeckSize - 3);
  });

  test("rejects invalid count", () => {
    const state = setupTestGame();
    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "draw_cards",
      params: { count: 25 },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(false);
    expect(result.error).toContain("1-20");
  });
});

// ═══════════════════════════════════════════
// Discard Hand
// ═══════════════════════════════════════════

describe("manual_override: discard_hand", () => {
  test("discards entire hand", () => {
    const state = setupTestGame();
    const initialDiscardSize = state.players[0].discard.cards.length;
    const handSize = state.players[0].hand.cards.length;

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "discard_hand",
      params: {},
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(state.players[0].hand.cards.length).toBe(0);
    expect(state.players[0].discard.cards.length).toBe(initialDiscardSize + handSize);
  });
});

// ═══════════════════════════════════════════
// Search Deck
// ═══════════════════════════════════════════

describe("manual_override: search_deck", () => {
  test("searches deck and adds to hand", () => {
    const state = setupTestGame();
    const initialHandSize = state.players[0].hand.cards.length;

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "search_deck",
      params: { filter: "any", count: 2 },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(state.players[0].hand.cards.length).toBe(initialHandSize + 2);
  });
});

// ═══════════════════════════════════════════
// Add Damage
// ═══════════════════════════════════════════

describe("manual_override: add_damage", () => {
  test("adds damage counters to target", () => {
    const state = setupTestGame();
    const target = state.players[0].active!;
    expect(target.damageCounters).toBe(0);

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "add_damage",
      params: { targetInstanceId: target.instanceId, amount: 40 },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(target.damageCounters).toBe(4); // 40/10 = 4 counters
  });

  test("requires target", () => {
    const state = setupTestGame();
    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "add_damage",
      params: { amount: 30 },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(false);
    expect(result.error).toContain("目标");
  });
});

// ═══════════════════════════════════════════
// Heal
// ═══════════════════════════════════════════

describe("manual_override: heal", () => {
  test("removes damage from target", () => {
    const state = setupTestGame();
    const target = state.players[0].active!;
    target.damageCounters = 5; // 50 damage

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "heal",
      params: { targetInstanceId: target.instanceId, amount: 30 },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(target.damageCounters).toBe(2); // 50-30=20, 2 counters
  });
});

// ═══════════════════════════════════════════
// Force Switch Self
// ═══════════════════════════════════════════

describe("manual_override: force_switch_self", () => {
  test("switches own active with bench", () => {
    const state = setupTestGame();
    const originalActive = state.players[0].active!.card.name;
    const benchTarget = state.players[0].bench.cards[0];

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "force_switch_self",
      params: { benchInstanceId: benchTarget.instanceId },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(state.players[0].active!.card.name).toBe(benchTarget.card.name);
    // Original active should be on bench
    expect(state.players[0].bench.cards.some(c => c.card.name === originalActive)).toBe(true);
  });
});

// ═══════════════════════════════════════════
// Force Switch Opponent
// ═══════════════════════════════════════════

describe("manual_override: force_switch_opponent", () => {
  test("switches opponent active with their bench", () => {
    const state = setupTestGame();
    const originalActive = state.players[1].active!.card.name;
    const benchTarget = state.players[1].bench.cards[0];

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "force_switch_opponent",
      params: { benchInstanceId: benchTarget.instanceId },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(state.players[1].active!.card.name).toBe(benchTarget.card.name);
  });
});

// ═══════════════════════════════════════════
// Attach Energy From Nowhere
// ═══════════════════════════════════════════

describe("manual_override: attach_energy_from_nowhere", () => {
  test("creates and attaches virtual energy", () => {
    const state = setupTestGame();
    const target = state.players[0].active!;
    expect(target.attachedEnergy).toHaveLength(0);

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "attach_energy_from_nowhere",
      params: { targetInstanceId: target.instanceId, energyType: "Fire" },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(target.attachedEnergy).toHaveLength(1);
    expect(target.attachedEnergy[0].card.types).toEqual(["Fire"]);
    expect(target.attachedEnergy[0].card.supertype).toBe("Energy");
  });
});

// ═══════════════════════════════════════════
// Apply / Remove Status
// ═══════════════════════════════════════════

describe("manual_override: apply_status", () => {
  test("applies status condition to target", () => {
    const state = setupTestGame();
    const target = state.players[1].active!;

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "apply_status",
      params: { targetInstanceId: target.instanceId, status: "poisoned" },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(target.statusConditions).toContain("poisoned");
  });
});

describe("manual_override: remove_status", () => {
  test("removes all status conditions from target", () => {
    const state = setupTestGame();
    const target = state.players[0].active!;
    target.statusConditions = ["poisoned", "burned"];

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "remove_status",
      params: { targetInstanceId: target.instanceId },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(target.statusConditions).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// Force Evolve
// ═══════════════════════════════════════════

describe("manual_override: force_evolve", () => {
  test("evolves bypassing all restrictions", () => {
    const state = setupTestGame();
    const target = state.players[0].active!;
    const evoCard = state.players[0].hand.cards[0]; // Raichu (Stage 1)
    const originalName = target.card.name;

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "force_evolve",
      params: { cardId: evoCard.instanceId, targetInstanceId: target.instanceId },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(state.players[0].active!.card.name).toBe("Raichu");
    // Raichu should be removed from hand
    expect(state.players[0].hand.cards.find(c => c.card.name === "Raichu")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════
// Search Discard
// ═══════════════════════════════════════════

describe("manual_override: search_discard", () => {
  test("retrieves cards from discard pile to hand", () => {
    const state = setupTestGame();
    const initialHandSize = state.players[0].hand.cards.length;
    const initialDiscardSize = state.players[0].discard.cards.length;

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "search_discard",
      params: { filter: "any", count: 1 },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    expect(state.players[0].hand.cards.length).toBe(initialHandSize + 1);
    expect(state.players[0].discard.cards.length).toBe(initialDiscardSize - 1);
  });
});

// ═══════════════════════════════════════════
// Shuffle Hand Draw
// ═══════════════════════════════════════════

describe("manual_override: shuffle_hand_draw", () => {
  test("shuffles hand into deck and draws new cards", () => {
    const state = setupTestGame();
    const initialHandSize = state.players[0].hand.cards.length;

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "shuffle_hand_draw",
      params: { count: 5 },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(true);
    // Should have exactly 5 cards (shuffled old hand back, drew 5 new)
    expect(state.players[0].hand.cards.length).toBe(5);
  });
});

// ═══════════════════════════════════════════
// Game Controller Integration
// ═══════════════════════════════════════════

describe("processAction — manual_override routing", () => {
  test("routes manual_override through game controller", async () => {
    const state = setupTestGame();
    const target = state.players[0].active!;

    const action: GameAction = {
      type: "manual_override",
      overrideType: "add_damage",
      params: { targetInstanceId: target.instanceId, amount: 20 },
    };

    const result = await processAction(state, 0, action);
    expect(result.success).toBe(true);
    expect(target.damageCounters).toBe(2);
  });

  test("manual_override bypasses turn check", async () => {
    const state = setupTestGame();
    state.currentPlayer = 0;
    // Player 1 tries manual override on their own turn — should work!
    const target = state.players[1].active!;

    const action: GameAction = {
      type: "manual_override",
      overrideType: "add_damage",
      params: { targetInstanceId: target.instanceId, amount: 10 },
    };

    const result = await processAction(state, 1, action);
    expect(result.success).toBe(true);
    expect(target.damageCounters).toBe(1);
  });

  test("manual_override missing overrideType fails", async () => {
    const state = setupTestGame();

    const action: GameAction = {
      type: "manual_override",
    };

    const result = await processAction(state, 0, action);
    expect(result.success).toBe(false);
    expect(result.error).toContain("手动操作类型");
  });
});

// ═══════════════════════════════════════════
// Log Events
// ═══════════════════════════════════════════

describe("manual_override logging", () => {
  test("logs manual override events", () => {
    const state = setupTestGame();
    const initialLogCount = state.log.length;

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "draw_cards",
      params: { count: 1 },
    };

    executeManualOverride(state, 0, action);
    // Should have at least one new log entry with "[手动]"
    const newLogs = state.log.slice(initialLogCount);
    expect(newLogs.some(l => l.message?.includes("[手动]"))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════

describe("manual_override error handling", () => {
  test("invalid target ID returns error", () => {
    const state = setupTestGame();

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "add_damage",
      params: { targetInstanceId: "nonexistent-id", amount: 30 },
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(false);
    expect(result.error).toContain("找不到");
  });

  test("unknown override type returns error", () => {
    const state = setupTestGame();

    const action: ManualOverrideAction = {
      type: "manual_override",
      overrideType: "nonexistent_type" as any,
      params: {},
    };

    const result = executeManualOverride(state, 0, action);
    expect(result.success).toBe(false);
    expect(result.error).toContain("未知");
  });
});
