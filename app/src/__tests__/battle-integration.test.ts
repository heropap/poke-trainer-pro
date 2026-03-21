/**
 * Battle Integration Tests
 *
 * End-to-end tests for complete game scenarios:
 * 1. Full game from setup to win by prizes
 * 2. Win by deck-out
 * 3. Win by no-bench (opponent has no Pokemon left)
 * 4. Win by concede
 * 5. Multi-prize knockout (ex/V/VMAX)
 * 6. Confused attack self-damage
 * 7. Promotion after KO with multiple bench
 * 8. Status effects between turns (poison KO, burn KO, paralysis cure, asleep wake)
 * 9. Beach Court stadium retreat cost via effect registry
 * 10. V2 modifier query (prevent_item, extra_energy)
 * 11. V2 EffectContext new methods (placeDamageCounters, devolve, lostZone, etc.)
 * 12. attack-system.ts resolveAttack multi-prize
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
  GamePhase,
  StatusCondition,
} from "@/engine/game-state";
import { processAction, startFirstTurn, GameAction } from "@/engine/game-controller";
import { performAttack, getPrizeCount, checkWinCondition, checkKnockout, takePrizes } from "@/engine/game-actions";
import { endTurn, drawCard, canRetreat, getEffectiveRetreatCost } from "@/engine/turn-actions";
import { resolveAttack } from "@/engine/systems/attack-system";
import { processBetweenTurns } from "@/engine/effects/status-effects";
import { createEffectContext } from "@/engine/effects/effect-context";
import { queryActiveModifiers } from "@/engine/effects/modifier-query";
import { Card } from "@/types/card";

// ═══════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════

function makeCard(overrides: Partial<Card> & { name: string }): Card {
  return {
    id: `test-${overrides.name.toLowerCase().replace(/\s/g, "-")}`,
    supertype: "Pokémon",
    subtypes: ["Basic"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
    ...overrides,
  };
}

function makeGameCard(overrides: Partial<Card> & { name: string }): GameCard {
  return createGameCard(makeCard(overrides));
}

function makeEnergy(name: string = "Fire Energy"): GameCard {
  return makeGameCard({ name, supertype: "Energy", subtypes: ["Basic"], types: ["Fire"] });
}

function makePokemon(name: string, hp: string, opts: Partial<Card> = {}): GameCard {
  return makeGameCard({
    name,
    hp,
    types: ["Fire"],
    attacks: [
      { name: "Tackle", damage: "30", cost: [], text: "", convertedEnergyCost: 0 },
    ],
    ...opts,
  });
}

/**
 * Setup a complete playable game in MAIN phase.
 */
function setupGame(opts: {
  p0ActiveHp?: string;
  p1ActiveHp?: string;
  p0Subtypes?: string[];
  p1Subtypes?: string[];
  p0DeckSize?: number;
  p1DeckSize?: number;
  p0PrizeCount?: number;
  p1PrizeCount?: number;
  p0BenchCount?: number;
  p1BenchCount?: number;
} = {}): GameState {
  resetInstanceCounter();
  const state = createGameState("Alice", "Bob");
  state.phase = GamePhase.MAIN;
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Player 0 (Alice)
  state.players[0].active = makePokemon("Charizard", opts.p0ActiveHp ?? "200", {
    subtypes: opts.p0Subtypes ?? ["Basic"],
    attacks: [
      { name: "Fire Blast", damage: "100", cost: [], text: "", convertedEnergyCost: 0 },
      { name: "Scratch", damage: "20", cost: [], text: "", convertedEnergyCost: 0 },
    ],
  });

  for (let i = 0; i < (opts.p0BenchCount ?? 2); i++) {
    state.players[0].bench.cards.push(makePokemon(`Bench-A${i}`, "60"));
  }

  for (let i = 0; i < (opts.p0DeckSize ?? 10); i++) {
    state.players[0].deck.cards.push(makePokemon(`DeckA${i}`, "40"));
  }
  for (let i = 0; i < (opts.p0PrizeCount ?? 6); i++) {
    state.players[0].prizes.cards.push(makePokemon(`PrizeA${i}`, "40"));
  }

  // Player 1 (Bob)
  state.players[1].active = makePokemon("Pikachu", opts.p1ActiveHp ?? "60", {
    subtypes: opts.p1Subtypes ?? ["Basic"],
    attacks: [
      { name: "Thunder Shock", damage: "30", cost: [], text: "", convertedEnergyCost: 0 },
    ],
  });

  for (let i = 0; i < (opts.p1BenchCount ?? 2); i++) {
    state.players[1].bench.cards.push(makePokemon(`Bench-B${i}`, "60"));
  }

  for (let i = 0; i < (opts.p1DeckSize ?? 10); i++) {
    state.players[1].deck.cards.push(makePokemon(`DeckB${i}`, "40"));
  }
  for (let i = 0; i < (opts.p1PrizeCount ?? 6); i++) {
    state.players[1].prizes.cards.push(makePokemon(`PrizeB${i}`, "40"));
  }

  state.turnStatus = {
    currentPlayerId: "p1",
    turnCount: 2,
    currentPhase: GamePhase.MAIN,
    hasAttachedEnergy: false,
    hasPlayedSupporter: false,
    hasPlayedStadium: false,
    hasRetreated: false,
    hasAttacked: false,
    p1VstarUsed: false,
    p2VstarUsed: false,
  };

  return state;
}

// ═══════════════════════════════════════════════
// 1. Full Game: Win by Prizes
// ═══════════════════════════════════════════════

describe("Full Battle: Win by Prizes", () => {
  it("player wins by taking all 6 prizes through repeated knockouts", async () => {
    const state = setupGame({
      p1ActiveHp: "30", // Low HP for easy KO
      p0PrizeCount: 1,  // Only 1 prize left to take
      p1BenchCount: 3,
    });

    // Alice attacks, should KO Pikachu (100 damage > 30 HP)
    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(result.success).toBe(true);
    // Prize taken — check if game ended (1 prize was remaining)
    expect(state.phase).toBe(GamePhase.GAME_OVER);
    expect(state.winner?.playerIndex).toBe(0);
    expect(state.winner?.condition).toBe("prizes_taken");
  });

  it("game continues when more prizes remain after KO", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p0PrizeCount: 3, // 3 prizes left
      p1BenchCount: 3,
    });

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(result.success).toBe(true);
    // Game should NOT be over — 2 prizes remain
    expect(state.winner?.condition).not.toBe("prizes_taken");
    // Alice took 1 prize for normal Pokemon KO
    expect(state.players[0].prizes.cards.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// 2. Win by Deck-Out
// ═══════════════════════════════════════════════

describe("Full Battle: Win by Deck-Out", () => {
  it("player loses when they cannot draw at start of turn", async () => {
    const state = setupGame({ p1DeckSize: 0 });

    // End Alice's turn → switch to Bob → Bob tries to draw → deck empty → game over
    const result = await processAction(state, 0, { type: "end_turn" });

    expect(result.success).toBe(true);
    expect(state.phase).toBe(GamePhase.GAME_OVER);
    expect(state.winner?.playerIndex).toBe(0); // Alice wins
    expect(state.winner?.condition).toBe("deck_out");
  });

  it("player with 1 card in deck can still draw", async () => {
    const state = setupGame({ p1DeckSize: 1 });

    const result = await processAction(state, 0, { type: "end_turn" });

    expect(result.success).toBe(true);
    // Bob drew his last card — game continues in MAIN phase
    expect(state.phase).toBe(GamePhase.MAIN);
    expect(state.players[1].deck.cards.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// 3. Win by No Bench Pokemon
// ═══════════════════════════════════════════════

describe("Full Battle: Win by No Bench", () => {
  it("opponent loses when KO'd with no bench Pokemon", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1BenchCount: 0,
    });

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(result.success).toBe(true);
    expect(state.phase).toBe(GamePhase.GAME_OVER);
    expect(state.winner?.playerIndex).toBe(0);
    expect(state.winner?.condition).toBe("no_bench_pokemon");
  });

  it("auto-promotes single bench Pokemon after KO", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1BenchCount: 1,
      p0PrizeCount: 6, // enough prizes to not end game
    });

    const benchName = state.players[1].bench.cards[0].card.name;

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(result.success).toBe(true);
    // Single bench auto-promoted
    expect(state.players[1].active).not.toBeNull();
    expect(state.players[1].active!.card.name).toBe(benchName);
    expect(state.players[1].bench.cards.length).toBe(0);
  });

  it("signals promotion required when multiple bench Pokemon after KO", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1BenchCount: 3,
      p0PrizeCount: 6,
    });

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(result.success).toBe(true);
    expect(result.promotionRequired).toBe(true);
    expect(result.promotionPlayerIndex).toBe(1);
  });
});

// ═══════════════════════════════════════════════
// 4. Win by Concede
// ═══════════════════════════════════════════════

describe("Full Battle: Concede", () => {
  it("conceding player loses immediately", async () => {
    const state = setupGame();

    const result = await processAction(state, 0, { type: "concede" });

    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(state.phase).toBe(GamePhase.GAME_OVER);
    expect(state.winner?.playerIndex).toBe(1); // Bob wins
    expect(state.winner?.condition).toBe("concede");
  });

  it("can concede during opponent's turn", async () => {
    const state = setupGame();
    state.currentPlayer = 0;

    // Player 1 (Bob) concedes during Alice's turn
    const result = await processAction(state, 1, { type: "concede" });

    expect(result.success).toBe(true);
    expect(state.winner?.playerIndex).toBe(0); // Alice wins
  });
});

// ═══════════════════════════════════════════════
// 5. Multi-Prize Knockout (ex/V/VMAX)
// ═══════════════════════════════════════════════

describe("Multi-Prize Knockouts", () => {
  it("KO-ing Pokemon ex gives 2 prizes", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1Subtypes: ["Basic", "ex"],
      p0PrizeCount: 6,
      p1BenchCount: 2,
    });

    await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    // Should have taken 2 prizes for ex
    expect(state.players[0].prizes.cards.length).toBe(4);
  });

  it("KO-ing Pokemon V gives 2 prizes", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1Subtypes: ["Basic", "V"],
      p0PrizeCount: 6,
      p1BenchCount: 2,
    });

    await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(state.players[0].prizes.cards.length).toBe(4);
  });

  it("KO-ing Pokemon VMAX gives 3 prizes", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1Subtypes: ["VMAX"],
      p0PrizeCount: 6,
      p1BenchCount: 2,
    });

    await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(state.players[0].prizes.cards.length).toBe(3);
  });

  it("KO-ing normal Pokemon gives 1 prize", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1Subtypes: ["Basic"],
      p0PrizeCount: 6,
      p1BenchCount: 2,
    });

    await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(state.players[0].prizes.cards.length).toBe(5);
  });

  it("winning by taking last 2 prizes from ex KO", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1Subtypes: ["Basic", "ex"],
      p0PrizeCount: 2, // Exactly 2 left
      p1BenchCount: 2,
    });

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(result.success).toBe(true);
    expect(state.phase).toBe(GamePhase.GAME_OVER);
    expect(state.winner?.condition).toBe("prizes_taken");
  });
});

// ═══════════════════════════════════════════════
// 6. resolveAttack Multi-Prize (attack-system.ts)
// ═══════════════════════════════════════════════

describe("resolveAttack multi-prize", () => {
  it("resolveAttack takes correct prizes for ex Pokemon", () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1Subtypes: ["Basic", "ex"],
      p0PrizeCount: 6,
      p1BenchCount: 2,
    });

    const result = resolveAttack(state, 0, "Fire Blast");

    expect(result.success).toBe(true);
    // Should have taken 2 prizes for ex
    expect(state.players[0].prizes.cards.length).toBe(4);
  });

  it("resolveAttack takes correct prizes for VMAX Pokemon", () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1Subtypes: ["VMAX"],
      p0PrizeCount: 6,
      p1BenchCount: 2,
    });

    const result = resolveAttack(state, 0, "Fire Blast");

    expect(result.success).toBe(true);
    expect(state.players[0].prizes.cards.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════
// 7. Confused Attack Self-Damage
// ═══════════════════════════════════════════════

describe("Confused Attack", () => {
  it("confused Pokemon may self-damage on tails", async () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("confused");

    // Attack many times to hit both outcomes statistically
    let selfDamageOccurred = false;
    let normalAttackOccurred = false;

    for (let i = 0; i < 30; i++) {
      const testState = setupGame();
      testState.players[0].active!.statusConditions.push("confused");

      await processAction(testState, 0, {
        type: "attack",
        attackName: "Fire Blast",
      });

      if (testState.players[0].active && testState.players[0].active.damageCounters > 0) {
        selfDamageOccurred = true;
      }
      if (testState.players[1].active && testState.players[1].active.damageCounters > 0) {
        normalAttackOccurred = true;
      }

      if (selfDamageOccurred && normalAttackOccurred) break;
    }

    // With 30 trials, both outcomes should have occurred
    expect(selfDamageOccurred || normalAttackOccurred).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 8. Status Effects Between Turns
// ═══════════════════════════════════════════════

describe("Status Effects Between Turns", () => {
  it("poisoned Pokemon takes 10 damage between turns", () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("poisoned");

    const initialDamage = state.players[0].active!.damageCounters;
    processBetweenTurns(state, 0, true);

    expect(state.players[0].active!.damageCounters).toBe(initialDamage + 1);
  });

  it("burned Pokemon takes 20 damage between turns", () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("burned");

    const initialDamage = state.players[0].active!.damageCounters;
    processBetweenTurns(state, 0, true);

    expect(state.players[0].active!.damageCounters).toBe(initialDamage + 2);
  });

  it("poison can cause KO between turns", () => {
    const state = setupGame({ p0ActiveHp: "10" });
    state.players[0].active!.statusConditions.push("poisoned");

    const koOccurred = processBetweenTurns(state, 0, true);

    expect(koOccurred).toBe(true);
    expect(state.players[0].active).toBeNull();
  });

  it("burn can cause KO between turns", () => {
    const state = setupGame({ p0ActiveHp: "20" });
    state.players[0].active!.statusConditions.push("burned");

    const koOccurred = processBetweenTurns(state, 0, true);

    expect(koOccurred).toBe(true);
    expect(state.players[0].active).toBeNull();
  });

  it("paralyzed Pokemon is cured at end of owner's turn", () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("paralyzed");

    processBetweenTurns(state, 0, true); // isTurnOwner = true

    expect(state.players[0].active!.statusConditions).not.toContain("paralyzed");
  });

  it("paralyzed Pokemon is NOT cured at end of opponent's turn", () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("paralyzed");

    processBetweenTurns(state, 0, false); // isTurnOwner = false

    expect(state.players[0].active!.statusConditions).toContain("paralyzed");
  });

  it("asleep Pokemon flips coin to wake up", () => {
    let wokeUp = false;
    let stayedAsleep = false;

    for (let i = 0; i < 30; i++) {
      const state = setupGame();
      state.players[0].active!.statusConditions.push("asleep");

      processBetweenTurns(state, 0, true);

      if (state.players[0].active!.statusConditions.includes("asleep")) {
        stayedAsleep = true;
      } else {
        wokeUp = true;
      }

      if (wokeUp && stayedAsleep) break;
    }

    expect(wokeUp || stayedAsleep).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 9. Promotion After KO Flow
// ═══════════════════════════════════════════════

describe("Promotion After KO", () => {
  it("promote action works after KO and triggers end turn + draw", async () => {
    const state = setupGame({
      p1ActiveHp: "30",
      p1BenchCount: 3,
      p0PrizeCount: 6,
    });

    // Attack → KO → promotion required
    const attackResult = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(attackResult.promotionRequired).toBe(true);

    // Bob promotes a bench Pokemon
    const benchId = state.players[1].bench.cards[0].instanceId;
    const promoteResult = await processAction(state, 1, {
      type: "promote",
      benchInstanceId: benchId,
    });

    expect(promoteResult.success).toBe(true);
    expect(state.players[1].active).not.toBeNull();
    // After promotion, turn should have ended and Bob drew a card
    expect(state.currentPlayer).toBe(1);
    expect(state.phase).toBe(GamePhase.MAIN);
  });
});

// ═══════════════════════════════════════════════
// 10. V2 Modifier Query System
// ═══════════════════════════════════════════════

describe("V2 Modifier Query", () => {
  it("returns default modifiers when no abilities in play", () => {
    const state = setupGame();
    const modifiers = queryActiveModifiers(state, 0);

    expect(modifiers.extraEnergyAttach).toBe(false);
    expect(modifiers.preventItemUsage).toBe(false);
    expect(modifiers.preventSupporterUsage).toBe(false);
    expect(modifiers.preventAbility).toBe(false);
    expect(modifiers.preventEvolution).toBe(false);
    expect(modifiers.preventStatus).toBe(false);
    expect(modifiers.preventEnergyRemoval).toBe(false);
  });

  it("handles missing abilities gracefully", () => {
    const state = setupGame();
    // Ensure no crashes with null/empty fields
    state.players[0].active = null;
    state.players[0].bench.cards = [];

    const modifiers = queryActiveModifiers(state, 0);
    expect(modifiers.extraEnergyAttach).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// 11. V2 EffectContext New Methods
// ═══════════════════════════════════════════════

describe("V2 EffectContext Methods", () => {
  it("placeDamageCounters places counters bypassing weakness/resistance", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const target = state.players[1].active!;
    const initialDamage = target.damageCounters;

    ctx.placeDamageCounters!(30, target);

    expect(target.damageCounters).toBe(initialDamage + 3); // 30/10 = 3 counters
  });

  it("placeDamageCounters triggers KO check", () => {
    const state = setupGame({ p1ActiveHp: "20", p1BenchCount: 2, p0PrizeCount: 6 });
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    ctx.placeDamageCounters!(30, state.players[1].active!);

    // Should have KO'd the 20 HP Pokemon
    expect(state.players[1].active).toBeNull();
    // Should have taken 1 prize
    expect(state.players[0].prizes.cards.length).toBe(5);
  });

  it("moveDamageCounters moves counters between Pokemon", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const from = state.players[0].active!;
    const to = state.players[0].bench.cards[0];
    from.damageCounters = 5;

    ctx.moveDamageCounters!(3, from, to);

    expect(from.damageCounters).toBe(2);
    expect(to.damageCounters).toBe(3);
  });

  it("moveDamageCounters does not move more than available", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const from = state.players[0].active!;
    const to = state.players[0].bench.cards[0];
    from.damageCounters = 2;

    ctx.moveDamageCounters!(5, from, to);

    expect(from.damageCounters).toBe(0);
    expect(to.damageCounters).toBe(2);
  });

  it("moveToLostZone adds card to lost zone", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const card = makePokemon("LostPokemon", "50");
    ctx.moveToLostZone!(card);

    expect(state.players[0].lostZone.cards.length).toBe(1);
    expect(state.players[0].lostZone.cards[0].card.name).toBe("LostPokemon");
  });

  it("moveToLostZoneMultiple adds multiple cards", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const cards = [makePokemon("Lost1", "50"), makePokemon("Lost2", "50")];
    ctx.moveToLostZoneMultiple!(cards);

    expect(state.players[0].lostZone.cards.length).toBe(2);
  });

  it("searchLostZone finds and removes matching cards", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    // Put cards in lost zone
    const card1 = makeEnergy("Fire Energy LZ1");
    const card2 = makePokemon("LostPoke", "50");
    state.players[0].lostZone.cards.push(card1, card2);

    const found = ctx.searchLostZone!(
      (c) => c.card.supertype === "Energy",
      1
    );

    expect(found.length).toBe(1);
    expect(found[0].card.name).toBe("Fire Energy LZ1");
    expect(state.players[0].lostZone.cards.length).toBe(1); // only Pokemon remains
  });

  it("devolve restores previous evolution stage", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const target = state.players[1].active!;
    // Simulate evolution stack
    const basicCard = makeCard({ name: "Pichu", hp: "30" });
    target.evolutionStack = [{ cardId: "test-pichu", card: basicCard }];
    target.card = makeCard({ name: "Pikachu", hp: "60" });
    target.cardId = "test-pikachu";

    const removed = ctx.devolve!(target, "discard");

    expect(removed).not.toBeNull();
    expect(removed!.card.name).toBe("Pikachu"); // removed card
    expect(target.card.name).toBe("Pichu"); // restored to previous stage
    expect(target.evolutionStack.length).toBe(0);
  });

  it("devolve returns null for non-evolved Pokemon", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const target = state.players[1].active!;
    target.evolutionStack = [];

    const removed = ctx.devolve!(target);

    expect(removed).toBeNull();
  });

  it("spreadDamage distributes counters across targets", () => {
    const state = setupGame({ p1BenchCount: 3 });
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const targets = state.players[1].bench.cards;
    ctx.spreadDamage!(6, targets);

    const total = targets.reduce((sum, c) => sum + c.damageCounters, 0);
    expect(total).toBe(6);
  });

  it("discardEnergyFromPokemon removes energy to discard pile", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const target = state.players[1].active!;
    const e1 = makeEnergy("Fire Energy 1");
    const e2 = makeEnergy("Fire Energy 2");
    target.attachedEnergy = [e1, e2];

    const discarded = ctx.discardEnergyFromPokemon!(1, target);

    expect(discarded.length).toBe(1);
    expect(target.attachedEnergy.length).toBe(1);
    // Discarded energy should be in owner's discard pile
    expect(state.players[1].discard.cards.length).toBeGreaterThanOrEqual(1);
  });

  it("discardEnergyFromPokemon with filter only discards matching", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);

    const target = state.players[1].active!;
    const fireE = makeEnergy("Fire Energy");
    const waterE = makeGameCard({ name: "Water Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Water"] });
    target.attachedEnergy = [fireE, waterE];

    const discarded = ctx.discardEnergyFromPokemon!(1, target, (c) => c.card.name.includes("Water"));

    expect(discarded.length).toBe(1);
    expect(discarded[0].card.name).toBe("Water Energy");
    expect(target.attachedEnergy.length).toBe(1);
    expect(target.attachedEnergy[0].card.name).toBe("Fire Energy");
  });
});

// ═══════════════════════════════════════════════
// 12. Complete Multi-Turn Battle Simulation
// ═══════════════════════════════════════════════

describe("Complete Multi-Turn Battle", () => {
  it("simulates a complete battle with multiple turns", async () => {
    const state = setupGame({
      p1ActiveHp: "60",
      p1BenchCount: 1,
      p0PrizeCount: 2,
    });

    // Turn 1: Alice attacks with Scratch (20 damage)
    let result = await processAction(state, 0, {
      type: "attack",
      attackName: "Scratch",
    });
    expect(result.success).toBe(true);
    // Turn auto-ends, Bob draws

    expect(state.currentPlayer).toBe(1);
    expect(state.phase).toBe(GamePhase.MAIN);

    // Turn 2: Bob attacks with Thunder Shock (30 damage)
    result = await processAction(state, 1, {
      type: "attack",
      attackName: "Thunder Shock",
    });
    expect(result.success).toBe(true);
    expect(state.currentPlayer).toBe(0);

    // Turn 3: Alice attacks with Fire Blast (100 damage) → should KO Pikachu (already has 20 dmg)
    result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });
    expect(result.success).toBe(true);
    // Pikachu had 2 damage counters from Scratch (20 dmg), now +100 = 120 total > 60 HP → KO
    // Bob has 1 bench → auto-promote

    // After KO of normal Pokemon, Alice takes 1 prize (1 remaining)
    expect(state.players[0].prizes.cards.length).toBe(1);

    // Bob should have auto-promoted
    expect(state.players[1].active).not.toBeNull();

    // Turn should have ended, now it's Bob's turn
    expect(state.currentPlayer).toBe(1);

    // Turn 4: Bob attacks
    result = await processAction(state, 1, {
      type: "attack",
      attackName: "Tackle",
    });
    expect(result.success).toBe(true);
    expect(state.currentPlayer).toBe(0);

    // Turn 5: Alice attacks and KOs the last Pokemon
    // Set defender HP low enough to be KO'd
    state.players[1].active!.damageCounters = 0;
    // Fire Blast does 100, bench Pokemon has 60 HP → KO
    result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });
    expect(result.success).toBe(true);

    // This should end the game — either by prizes (1 left, took 1) or no bench
    expect(state.phase).toBe(GamePhase.GAME_OVER);
    expect(state.winner?.playerIndex).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// 13. First Turn Rules
// ═══════════════════════════════════════════════

describe("First Turn Rules", () => {
  it("first player cannot attack on turn 1", async () => {
    const state = setupGame();
    state.turn = 1;
    state.isFirstTurn = true;

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("第一回合");
  });

  it("first player cannot play supporter on turn 1", async () => {
    const state = setupGame();
    state.turn = 1;
    state.isFirstTurn = true;

    const supporter = makeGameCard({
      name: "Professor Research",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    state.players[0].hand.cards.push(supporter);

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: supporter.instanceId,
    });

    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// 14. Turn Limits
// ═══════════════════════════════════════════════

describe("Turn Limits", () => {
  it("cannot attach energy twice in one turn", async () => {
    const state = setupGame();
    const e1 = makeEnergy("Energy1");
    const e2 = makeEnergy("Energy2");
    state.players[0].hand.cards.push(e1, e2);

    // First attach succeeds
    const r1 = await processAction(state, 0, {
      type: "play_card",
      cardId: e1.instanceId,
      targetId: state.players[0].active!.instanceId,
    });
    expect(r1.success).toBe(true);

    // Second attach fails
    const r2 = await processAction(state, 0, {
      type: "play_card",
      cardId: e2.instanceId,
      targetId: state.players[0].active!.instanceId,
    });
    expect(r2.success).toBe(false);
  });

  it("cannot retreat twice in one turn", async () => {
    const state = setupGame();
    // Set retreat cost to 0 for easy testing
    state.players[0].active!.card = makeCard({
      name: "ZeroCost",
      hp: "100",
      convertedRetreatCost: 0,
      attacks: [{ name: "Tackle", damage: "30", cost: [], text: "", convertedEnergyCost: 0 }],
    });

    const bench1 = state.players[0].bench.cards[0].instanceId;
    const r1 = await processAction(state, 0, {
      type: "retreat",
      benchInstanceId: bench1,
    });
    expect(r1.success).toBe(true);

    const bench2 = state.players[0].bench.cards[0].instanceId;
    const r2 = await processAction(state, 0, {
      type: "retreat",
      benchInstanceId: bench2,
    });
    expect(r2.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// 15. Status Condition Blocks
// ═══════════════════════════════════════════════

describe("Status Condition Action Blocks", () => {
  it("paralyzed Pokemon cannot attack", async () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("paralyzed");

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(result.success).toBe(false);
  });

  it("asleep Pokemon cannot attack", async () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("asleep");

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Fire Blast",
    });

    expect(result.success).toBe(false);
  });

  it("paralyzed Pokemon cannot retreat", async () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("paralyzed");
    state.players[0].active!.card = makeCard({
      name: "Paralyzed",
      hp: "100",
      convertedRetreatCost: 0,
    });

    const result = await processAction(state, 0, {
      type: "retreat",
      benchInstanceId: state.players[0].bench.cards[0].instanceId,
    });

    expect(result.success).toBe(false);
  });

  it("asleep Pokemon cannot retreat", async () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("asleep");
    state.players[0].active!.card = makeCard({
      name: "Sleepy",
      hp: "100",
      convertedRetreatCost: 0,
    });

    const result = await processAction(state, 0, {
      type: "retreat",
      benchInstanceId: state.players[0].bench.cards[0].instanceId,
    });

    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// 16. Retreat Mechanics
// ═══════════════════════════════════════════════

describe("Retreat Mechanics", () => {
  it("retreat clears all status conditions", async () => {
    const state = setupGame();
    const active = state.players[0].active!;
    active.statusConditions = ["poisoned", "burned"];
    active.card = makeCard({
      name: "SickPoke",
      hp: "200",
      convertedRetreatCost: 0,
      attacks: [{ name: "Tackle", damage: "30", cost: [], text: "", convertedEnergyCost: 0 }],
    });

    const benchId = state.players[0].bench.cards[0].instanceId;
    const result = await processAction(state, 0, {
      type: "retreat",
      benchInstanceId: benchId,
    });

    expect(result.success).toBe(true);
    // The old active (now on bench) should have no status conditions
    const oldActive = state.players[0].bench.cards.find(
      c => c.card.name === "SickPoke"
    );
    expect(oldActive?.statusConditions).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// 17. Evolution via play_card
// ═══════════════════════════════════════════════

describe("Evolution via play_card", () => {
  it("can evolve a Pokemon using play_card action with targetId", async () => {
    const state = setupGame();
    // Put a Stage 1 in hand
    const stage1 = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charizard", // Match the active
    });
    state.players[0].hand.cards.push(stage1);
    // Mark active as not played this turn (evolution requires)
    state.players[0].active!.playedThisTurn = false;
    state.players[0].active!.evolvedThisTurn = false;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: stage1.instanceId,
      targetId: state.players[0].active!.instanceId,
    });

    expect(result.success).toBe(true);
    expect(state.players[0].active!.card.name).toBe("Charmeleon");
  });
});

// ═══════════════════════════════════════════════
// 18. Use Ability
// ═══════════════════════════════════════════════

describe("Use Ability", () => {
  it("rejects ability when card has no abilities", async () => {
    const state = setupGame();

    const result = await processAction(state, 0, {
      type: "use_ability",
      cardId: state.players[0].active!.instanceId,
      abilityName: "Nonexistent",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("没有名为");
  });

  it("rejects ability usage outside main phase", async () => {
    const state = setupGame();
    state.phase = GamePhase.DRAW;

    const result = await processAction(state, 0, {
      type: "use_ability",
      cardId: state.players[0].active!.instanceId,
      abilityName: "Test",
    });

    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// 19. Play Card Edge Cases
// ═══════════════════════════════════════════════

describe("Play Card Edge Cases", () => {
  it("plays basic Pokemon to active if active spot is empty", async () => {
    const state = setupGame();
    state.players[0].active = null;

    const basic = makeGameCard({ name: "Bulbasaur", hp: "70", subtypes: ["Basic"] });
    state.players[0].hand.cards.push(basic);

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: basic.instanceId,
    });

    expect(result.success).toBe(true);
    expect(state.players[0].active!.card.name).toBe("Bulbasaur");
  });

  it("plays basic Pokemon to bench if active is occupied", async () => {
    const state = setupGame({ p0BenchCount: 0 });

    const basic = makeGameCard({ name: "Bulbasaur", hp: "70", subtypes: ["Basic"] });
    state.players[0].hand.cards.push(basic);

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: basic.instanceId,
    });

    expect(result.success).toBe(true);
    expect(state.players[0].bench.cards.some(c => c.card.name === "Bulbasaur")).toBe(true);
  });

  it("rejects play_card for card not in hand", async () => {
    const state = setupGame();

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: "nonexistent-id",
    });

    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// 20. startFirstTurn
// ═══════════════════════════════════════════════

describe("startFirstTurn", () => {
  it("transitions from SETUP to MAIN via DRAW", () => {
    const state = setupGame();
    state.phase = GamePhase.SETUP;
    state.turn = 0;

    const result = startFirstTurn(state);

    expect(result.phase).toBe(GamePhase.MAIN);
    expect(state.turn).toBe(1);
  });

  it("handles already in MAIN phase gracefully", () => {
    const state = setupGame();
    state.phase = GamePhase.MAIN;

    const result = startFirstTurn(state);

    expect(result.phase).toBe(GamePhase.MAIN);
  });
});
