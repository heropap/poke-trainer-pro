/**
 * Stadium Card System Tests
 *
 * Tests for:
 * - Playing stadium cards
 * - Stadium replacement (old discarded, new placed)
 * - Same-name restriction
 * - One stadium per turn limit
 * - Beach Court retreat cost reduction
 * - Stadium display in GameState
 * - EffectContext stadium methods
 * - Game controller routing
 */

import {
  createGameState,
  createGameCard,
  GameState,
  GamePhase,
  GameCard,
} from "@/engine/game-state";
import {
  canPlayStadium,
  playStadium,
  canRetreat,
} from "@/engine/turn-actions";
import { processAction } from "@/engine/game-controller";
import { createEffectContext } from "@/engine/effects/effect-context";
import { addToBottom } from "@/engine/zones";
import { Card } from "@/types/card";
import { initializeEffects } from "@/engine/effects";

// ─── Test Helpers ───

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "test-card-1",
    name: "Test Card",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "100",
    types: ["Colorless"],
    attacks: [],
    weaknesses: [],
    retreatCost: ["Colorless"],
    convertedRetreatCost: 1,
    set: "sv1",
    number: "1",
    artist: "Test",
    rarity: "Common",
    images: { small: "", large: "" },
    legalities: {},
    ...overrides,
  } as Card;
}

function makeStadiumCard(name: string, id: string = "test-stadium"): GameCard {
  return createGameCard(makeCard({
    id,
    name,
    supertype: "Trainer",
    subtypes: ["Stadium"],
    hp: undefined,
    types: [],
    retreatCost: [],
    convertedRetreatCost: 0,
  }));
}

function makePokemonCard(name: string, overrides: Partial<Card> = {}): GameCard {
  return createGameCard(makeCard({
    name,
    ...overrides,
  }));
}

function makeEnergyCard(type: string = "Colorless"): GameCard {
  return createGameCard(makeCard({
    id: `energy-${type.toLowerCase()}`,
    name: `${type} Energy`,
    supertype: "Energy",
    subtypes: ["Basic"],
    hp: undefined,
    types: [type],
    retreatCost: [],
    convertedRetreatCost: 0,
  }));
}

function setupGame(): GameState {
  const state = createGameState("Alice", "Bob");
  state.phase = GamePhase.MAIN;
  state.turn = 2;
  state.isFirstTurn = false;
  state.turnStatus.currentPhase = GamePhase.MAIN;

  // Give both players active Pokemon
  state.players[0].active = makePokemonCard("Pikachu", { convertedRetreatCost: 1 });
  state.players[1].active = makePokemonCard("Charmander", { convertedRetreatCost: 1 });

  // Give bench Pokemon
  state.players[0].bench.cards.push(makePokemonCard("Eevee"));
  state.players[1].bench.cards.push(makePokemonCard("Squirtle"));

  return state;
}

// ─── Initialize effects ───
beforeAll(() => {
  initializeEffects();
});

// ───────────────────────────────────────────────
// 1. canPlayStadium Validation
// ───────────────────────────────────────────────

describe("canPlayStadium", () => {
  test("allows playing a stadium in main phase", () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);

    const result = canPlayStadium(state, stadium.instanceId);
    expect(result.success).toBe(true);
  });

  test("rejects playing a stadium outside main phase", () => {
    const state = setupGame();
    state.phase = GamePhase.DRAW;
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);

    const result = canPlayStadium(state, stadium.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("主阶段");
  });

  test("rejects playing more than one stadium per turn", () => {
    const state = setupGame();
    state.turnStatus.hasPlayedStadium = true;
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);

    const result = canPlayStadium(state, stadium.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("一张场地卡");
  });

  test("rejects card not in hand", () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    // Not adding to hand

    const result = canPlayStadium(state, stadium.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("找不到");
  });

  test("rejects non-stadium trainer card", () => {
    const state = setupGame();
    const item = createGameCard(makeCard({
      name: "Potion",
      supertype: "Trainer",
      subtypes: ["Item"],
    }));
    state.players[0].hand.cards.push(item);

    const result = canPlayStadium(state, item.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("场地卡");
  });

  test("rejects same-name stadium as current one in play", () => {
    const state = setupGame();
    state.stadium = {
      card: makeStadiumCard("Beach Court", "stadium-1"),
      owner: 1,
    };
    const stadium = makeStadiumCard("Beach Court", "stadium-2");
    state.players[0].hand.cards.push(stadium);

    const result = canPlayStadium(state, stadium.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("同名");
  });

  test("allows different-name stadium when one is in play", () => {
    const state = setupGame();
    state.stadium = {
      card: makeStadiumCard("Beach Court", "stadium-1"),
      owner: 1,
    };
    const stadium = makeStadiumCard("Artazon", "stadium-2");
    state.players[0].hand.cards.push(stadium);

    const result = canPlayStadium(state, stadium.instanceId);
    expect(result.success).toBe(true);
  });
});

// ───────────────────────────────────────────────
// 2. playStadium Execution
// ───────────────────────────────────────────────

describe("playStadium", () => {
  test("places stadium on the field", async () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);

    const result = await playStadium(state, stadium.instanceId);
    expect(result.success).toBe(true);
    expect(state.stadium).not.toBeNull();
    expect(state.stadium!.card.card.name).toBe("Beach Court");
    expect(state.stadium!.owner).toBe(0);
  });

  test("removes card from hand", async () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);
    const handSize = state.players[0].hand.cards.length;

    await playStadium(state, stadium.instanceId);
    expect(state.players[0].hand.cards.length).toBe(handSize - 1);
  });

  test("sets stadiumPlayed flag", async () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);

    expect(state.turnStatus.hasPlayedStadium).toBe(false);
    await playStadium(state, stadium.instanceId);
    expect(state.turnStatus.hasPlayedStadium).toBe(true);
  });

  test("discards old stadium to its owner's discard pile", async () => {
    const state = setupGame();
    const oldStadium = makeStadiumCard("Artazon", "old-stadium");
    state.stadium = { card: oldStadium, owner: 1 };

    const newStadium = makeStadiumCard("Beach Court", "new-stadium");
    state.players[0].hand.cards.push(newStadium);

    await playStadium(state, newStadium.instanceId);

    // Old stadium goes to player 1's discard (it was player 1's stadium)
    expect(state.players[1].discard.cards).toContainEqual(
      expect.objectContaining({ card: expect.objectContaining({ name: "Artazon" }) })
    );
    // New stadium is in play
    expect(state.stadium!.card.card.name).toBe("Beach Court");
    expect(state.stadium!.owner).toBe(0);
  });

  test("logs play_stadium event", async () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);
    const logBefore = state.log.length;

    await playStadium(state, stadium.instanceId);

    const newEvents = state.log.slice(logBefore);
    expect(newEvents.some(e => e.type === "play_stadium")).toBe(true);
  });

  test("logs remove_stadium when replacing", async () => {
    const state = setupGame();
    state.stadium = { card: makeStadiumCard("Artazon"), owner: 1 };

    const newStadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(newStadium);
    const logBefore = state.log.length;

    await playStadium(state, newStadium.instanceId);

    const newEvents = state.log.slice(logBefore);
    expect(newEvents.some(e => e.type === "remove_stadium")).toBe(true);
    expect(newEvents.some(e => e.type === "play_stadium")).toBe(true);
  });
});

// ───────────────────────────────────────────────
// 3. Beach Court Retreat Cost Reduction
// ───────────────────────────────────────────────

describe("Beach Court (retreat cost -1 for Basic)", () => {
  test("reduces retreat cost for Basic Pokemon", () => {
    const state = setupGame();
    state.stadium = { card: makeStadiumCard("Beach Court"), owner: 0 };

    // Active Pikachu is Basic with retreat cost 1 → becomes 0
    const energy = makeEnergyCard("Colorless");
    state.players[0].active!.attachedEnergy.push(energy);

    // Should be able to retreat with 0 energy (cost 1 - 1 = 0)
    const result = canRetreat(state, []);
    expect(result.success).toBe(true);
  });

  test("does not reduce retreat cost for non-Basic Pokemon", () => {
    const state = setupGame();
    state.stadium = { card: makeStadiumCard("Beach Court"), owner: 0 };

    // Make active a Stage 1 Pokemon with retreat cost 2
    state.players[0].active = makePokemonCard("Raichu", {
      subtypes: ["Stage 1"],
      convertedRetreatCost: 2,
      retreatCost: ["Colorless", "Colorless"],
    });

    // Stage 1 doesn't benefit from Beach Court, needs 2 energy
    const result = canRetreat(state, []);
    expect(result.success).toBe(false);
    expect(result.error).toContain("能量不足");
  });

  test("works for both players", () => {
    const state = setupGame();
    state.stadium = { card: makeStadiumCard("Beach Court"), owner: 0 };

    // Switch to player 1's turn
    state.currentPlayer = 1;

    // Player 1's Charmander is Basic with retreat cost 1 → becomes 0
    const result = canRetreat(state, []);
    expect(result.success).toBe(true);
  });

  test("retreat cost doesn't go below 0", () => {
    const state = setupGame();
    state.stadium = { card: makeStadiumCard("Beach Court"), owner: 0 };

    // Pokemon with 0 retreat cost
    state.players[0].active = makePokemonCard("Abra", {
      convertedRetreatCost: 0,
      retreatCost: [],
    });

    // Should still work fine (0 - 1 = -1, clamped to 0)
    const result = canRetreat(state, []);
    expect(result.success).toBe(true);
  });
});

// ───────────────────────────────────────────────
// 4. EffectContext Stadium Methods
// ───────────────────────────────────────────────

describe("EffectContext stadium methods", () => {
  test("getStadium returns null when no stadium in play", () => {
    const state = setupGame();
    const source = state.players[0].active!;
    const ctx = createEffectContext(state, 0, source);

    expect(ctx.getStadium()).toBeNull();
  });

  test("getStadium returns the stadium card", () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.stadium = { card: stadium, owner: 0 };

    const source = state.players[0].active!;
    const ctx = createEffectContext(state, 0, source);

    expect(ctx.getStadium()).not.toBeNull();
    expect(ctx.getStadium()!.card.name).toBe("Beach Court");
  });

  test("removeStadium removes and discards to owner", () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.stadium = { card: stadium, owner: 1 };

    const source = state.players[0].active!;
    const ctx = createEffectContext(state, 0, source);

    const result = ctx.removeStadium();
    expect(result).toBe(true);
    expect(state.stadium).toBeNull();
    // Discarded to player 1 (the owner)
    expect(state.players[1].discard.cards.some(
      c => c.card.name === "Beach Court"
    )).toBe(true);
  });

  test("removeStadium returns false when no stadium", () => {
    const state = setupGame();
    const source = state.players[0].active!;
    const ctx = createEffectContext(state, 0, source);

    expect(ctx.removeStadium()).toBe(false);
  });
});

// ───────────────────────────────────────────────
// 5. Game Controller Routing
// ───────────────────────────────────────────────

describe("processAction routing for Stadium cards", () => {
  test("routes Stadium card through play_card action", async () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: stadium.instanceId,
    });

    expect(result.success).toBe(true);
    expect(state.stadium).not.toBeNull();
    expect(state.stadium!.card.card.name).toBe("Beach Court");
  });

  test("opponent can also play a stadium", async () => {
    const state = setupGame();
    state.currentPlayer = 1;
    const stadium = makeStadiumCard("Artazon");
    state.players[1].hand.cards.push(stadium);

    const result = await processAction(state, 1, {
      type: "play_card",
      cardId: stadium.instanceId,
    });

    expect(result.success).toBe(true);
    expect(state.stadium!.owner).toBe(1);
  });
});

// ───────────────────────────────────────────────
// 6. GameState stadium field
// ───────────────────────────────────────────────

describe("GameState stadium field", () => {
  test("createGameState initializes stadium as null", () => {
    const state = createGameState("Alice", "Bob");
    expect(state.stadium).toBeNull();
  });

  test("turnStatus includes stadiumPlayed flag", () => {
    const state = createGameState("Alice", "Bob");
    expect(state.turnStatus.hasPlayedStadium).toBe(false);
  });
});

// ───────────────────────────────────────────────
// 7. End Turn resets stadiumPlayed
// ───────────────────────────────────────────────

describe("endTurn resets stadiumPlayed", () => {
  test("stadiumPlayed resets when turn ends", async () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);

    await playStadium(state, stadium.instanceId);
    expect(state.turnStatus.hasPlayedStadium).toBe(true);

    // End turn via processAction
    // Add cards to deck so draw doesn't fail
    for (let i = 0; i < 10; i++) {
      addToBottom(state.players[1].deck, makePokemonCard(`Filler${i}`));
    }

    const result = await processAction(state, 0, { type: "end_turn" });
    expect(result.success).toBe(true);
    expect(state.turnStatus.hasPlayedStadium).toBe(false);
  });
});

// ───────────────────────────────────────────────
// 8. Stadium persists across turns
// ───────────────────────────────────────────────

describe("Stadium persistence", () => {
  test("stadium stays in play after turn ends", async () => {
    const state = setupGame();
    const stadium = makeStadiumCard("Beach Court");
    state.players[0].hand.cards.push(stadium);

    await playStadium(state, stadium.instanceId);

    // Ensure player 1 has cards to draw
    for (let i = 0; i < 10; i++) {
      addToBottom(state.players[1].deck, makePokemonCard(`Filler${i}`));
    }

    await processAction(state, 0, { type: "end_turn" });

    // Stadium should still be in play
    expect(state.stadium).not.toBeNull();
    expect(state.stadium!.card.card.name).toBe("Beach Court");
    expect(state.stadium!.owner).toBe(0);
  });
});
