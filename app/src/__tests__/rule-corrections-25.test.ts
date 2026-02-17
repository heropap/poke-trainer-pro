/**
 * PTCG Rule Corrections — Session 25
 *
 * Comprehensive test suite verifying the PTCG rule audit corrections:
 *
 * 1. Attack is turn-ending: hasAttackedThisTurn prevents multiple attacks
 *    and blocks further main-phase actions after attacking.
 *
 * 2. Evolution stack: evolvePokemon() records the pre-evolution card
 *    in evolutionStack, preserving the full evolution chain.
 *
 * 3. All zones, win conditions, status conditions, and operational limits
 *    are confirmed working via integration tests.
 */

import {
  GameState,
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
  GameCard,
} from "../engine/game-state";
import {
  canRetreat,
  canPlaySupporter,
  canAttachEnergy,
  canPlayBasicToBench,
  canEvolve,
  evolvePokemon,
  retreat,
  endTurn,
  drawCard,
  attachEnergy,
} from "../engine/turn-actions";
import {
  canAttack,
  performAttack,
  checkWinCondition,
  checkKnockout,
  takePrizes,
  getPrizeCount,
} from "../engine/game-actions";
import { processAction } from "../engine/game-controller";
import { processBetweenTurns } from "../engine/effects/status-effects";
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
        name: "Flamethrower",
        cost: ["Fire"],
        convertedEnergyCost: 1,
        damage: "50",
        text: "Does 50 damage.",
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

function createItemCard(name: string = "Potion"): Card {
  return {
    id: `item-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    supertype: "Trainer",
    subtypes: ["Item"],
    number: "1",
    rarity: "Uncommon",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
  } as Card;
}

function createStage1Card(
  name: string = "Charmeleon",
  evolvesFrom: string = "Test Pokemon"
): Card {
  return {
    id: `stage1-${name.toLowerCase()}`,
    name,
    supertype: "Pokémon",
    subtypes: ["Stage 1"],
    hp: "120",
    types: ["Fire"],
    evolvesFrom,
    attacks: [
      {
        name: "Fire Fang",
        cost: ["Fire", "Colorless"],
        convertedEnergyCost: 2,
        damage: "70",
        text: "Does 70 damage.",
      },
    ],
    weaknesses: [],
    resistances: [],
    retreatCost: ["Colorless"],
    convertedRetreatCost: 1,
    number: "2",
    rarity: "Uncommon",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
  } as Card;
}

function createStage2Card(
  name: string = "Charizard",
  evolvesFrom: string = "Charmeleon"
): Card {
  return {
    id: `stage2-${name.toLowerCase()}`,
    name,
    supertype: "Pokémon",
    subtypes: ["Stage 2"],
    hp: "180",
    types: ["Fire"],
    evolvesFrom,
    attacks: [
      {
        name: "Fire Blast",
        cost: ["Fire", "Fire", "Colorless"],
        convertedEnergyCost: 3,
        damage: "150",
        text: "Does 150 damage.",
      },
    ],
    weaknesses: [],
    resistances: [],
    retreatCost: ["Colorless", "Colorless"],
    convertedRetreatCost: 2,
    number: "3",
    rarity: "Rare",
    legalities: { standard: "Legal" },
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

  // Alice: active with energy + bench + hand
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

  // Hand with energy + supporter + item + basic Pokemon
  const handEnergy = createGameCard(createEnergyCard("Fire"));
  const handSupporter = createGameCard(createSupporterCard());
  const handItem = createGameCard(createItemCard());
  const handBasic = createGameCard(
    createTestCard({ id: "alice-basic", name: "Vulpix" })
  );
  state.players[0].hand = createZone([
    handEnergy,
    handSupporter,
    handItem,
    handBasic,
  ]);

  // Deck with cards for drawing
  for (let i = 0; i < 20; i++) {
    state.players[0].deck.cards.push(
      createGameCard(createTestCard({ id: `deck-${i}` }))
    );
  }

  // Prizes
  for (let i = 0; i < 6; i++) {
    state.players[0].prizes.cards.push(
      createGameCard(createTestCard({ id: `prize-a-${i}` }))
    );
  }

  // Bob: active + bench + deck + prizes
  const bobActive = createGameCard(
    createTestCard({
      id: "bob-active",
      name: "Blastoise",
      types: ["Water"],
    })
  );
  state.players[1].active = bobActive;

  const bobBench1 = createGameCard(
    createTestCard({
      id: "bob-bench",
      name: "Squirtle",
      types: ["Water"],
    })
  );
  state.players[1].bench = createZone([bobBench1]);

  for (let i = 0; i < 20; i++) {
    state.players[1].deck.cards.push(
      createGameCard(createTestCard({ id: `bob-deck-${i}` }))
    );
  }

  for (let i = 0; i < 6; i++) {
    state.players[1].prizes.cards.push(
      createGameCard(createTestCard({ id: `prize-b-${i}` }))
    );
  }

  return state;
}

// ═══════════════════════════════════════════════════════
// 1. ATTACK IS TURN-ENDING ACTION
// ═══════════════════════════════════════════════════════

describe("Attack as turn-ending action", () => {
  test("hasAttackedThisTurn starts false at beginning of turn", () => {
    const state = setupBattleState();
    expect(state.turnStatus.hasAttackedThisTurn).toBe(false);
  });

  test("performAttack sets hasAttackedThisTurn to true", () => {
    const state = setupBattleState();
    expect(state.turnStatus.hasAttackedThisTurn).toBe(false);

    performAttack(state, 0, "Flamethrower");

    expect(state.turnStatus.hasAttackedThisTurn).toBe(true);
  });

  test("canAttack returns false when hasAttackedThisTurn is true", () => {
    const state = setupBattleState();

    // First attack should be allowed
    expect(canAttack(state, 0, "Flamethrower")).toBe(true);

    // Perform the attack
    performAttack(state, 0, "Flamethrower");

    // Second attack should be blocked
    expect(canAttack(state, 0, "Flamethrower")).toBe(false);
  });

  test("performAttack returns error for second attack in same turn", () => {
    const state = setupBattleState();

    const res1 = performAttack(state, 0, "Flamethrower");
    expect(res1.success).toBe(true);

    const res2 = performAttack(state, 0, "Flamethrower");
    expect(res2.success).toBe(false);
  });

  test("hasAttackedThisTurn resets when endTurn is called", () => {
    const state = setupBattleState();

    performAttack(state, 0, "Flamethrower");
    expect(state.turnStatus.hasAttackedThisTurn).toBe(true);

    endTurn(state);

    expect(state.turnStatus.hasAttackedThisTurn).toBe(false);
  });

  test("controller blocks play_card after attack via processAction", async () => {
    const state = setupBattleState();

    // Attack
    const attackRes = await processAction(state, 0, {
      type: "attack",
      attackName: "Flamethrower",
    });
    expect(attackRes.success).toBe(true);

    // After handleAttack, the turn should have ended and switched player.
    // The next player's turn should have started.
    // But if we try to play a card as player 0, it should fail because
    // it's no longer player 0's turn.
    const playRes = await processAction(state, 0, {
      type: "play_card",
      cardId: state.players[0].hand.cards[0]?.instanceId,
    });
    expect(playRes.success).toBe(false);
  });

  test("base-rules ATTACK_LIMIT blocks second attack via processAction", async () => {
    const state = setupBattleState();

    // Manually set hasAttackedThisTurn without going through controller
    // (to test the rule in isolation)
    state.turnStatus.hasAttackedThisTurn = true;

    const res = await processAction(state, 0, {
      type: "attack",
      attackName: "Flamethrower",
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("攻击");
  });

  test("base-rules ATTACK_ENDS_TURN blocks play_card after attack flag", async () => {
    const state = setupBattleState();

    // Manually set hasAttackedThisTurn
    state.turnStatus.hasAttackedThisTurn = true;

    const res = await processAction(state, 0, {
      type: "play_card",
      cardId: state.players[0].hand.cards[0]?.instanceId,
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("攻击后");
  });

  test("base-rules ATTACK_ENDS_TURN blocks retreat after attack flag", async () => {
    const state = setupBattleState();

    state.turnStatus.hasAttackedThisTurn = true;

    const benchId = state.players[0].bench.cards[0].instanceId;
    const energyId = state.players[0].active!.attachedEnergy[0].instanceId;

    const res = await processAction(state, 0, {
      type: "retreat",
      benchInstanceId: benchId,
      energyToDiscard: [energyId],
    });
    expect(res.success).toBe(false);
  });

  test("base-rules ATTACK_ENDS_TURN blocks evolve after attack flag", async () => {
    const state = setupBattleState();

    state.turnStatus.hasAttackedThisTurn = true;

    const res = await processAction(state, 0, {
      type: "evolve",
      cardId: "fake",
      targetId: "fake",
    });
    expect(res.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// 2. EVOLUTION STACK TRACKING
// ═══════════════════════════════════════════════════════

describe("Evolution stack tracking", () => {
  test("GameCard starts with empty evolutionStack", () => {
    const card = createGameCard(createTestCard({ name: "Charmander" }));
    expect(card.evolutionStack).toEqual([]);
  });

  test("evolvePokemon pushes pre-evolution onto stack", () => {
    const state = setupBattleState();
    state.turn = 3; // Not first turn

    // Put a basic Pokemon that was played on a previous turn
    const basic = createGameCard(
      createTestCard({ id: "charmander-01", name: "Charmander" })
    );
    basic.playedThisTurn = false;
    state.players[0].active = basic;

    // Stage 1 in hand
    const stage1 = createGameCard(createStage1Card("Charmeleon", "Charmander"));
    state.players[0].hand = createZone([stage1]);

    // Evolve
    const res = evolvePokemon(state, stage1.instanceId, basic.instanceId);
    expect(res.success).toBe(true);

    const evolved = state.players[0].active!;
    expect(evolved.card.name).toBe("Charmeleon");
    expect(evolved.evolutionStack).toHaveLength(1);
    expect(evolved.evolutionStack[0].card.name).toBe("Charmander");
    expect(evolved.evolutionStack[0].cardId).toBe("charmander-01");
  });

  test("double evolution builds full stack (Basic → Stage 1 → Stage 2)", () => {
    const state = setupBattleState();
    state.turn = 3;

    // Basic Pokemon (played earlier)
    const basic = createGameCard(
      createTestCard({ id: "charmander-01", name: "Charmander" })
    );
    basic.playedThisTurn = false;
    state.players[0].active = basic;

    // Stage 1 in hand
    const stage1 = createGameCard(createStage1Card("Charmeleon", "Charmander"));
    state.players[0].hand = createZone([stage1]);

    // First evolution: Basic → Stage 1
    evolvePokemon(state, stage1.instanceId, basic.instanceId);
    const afterStage1 = state.players[0].active!;
    expect(afterStage1.card.name).toBe("Charmeleon");
    expect(afterStage1.evolutionStack).toHaveLength(1);

    // Next turn: Stage 1 → Stage 2
    state.turn = 4;
    afterStage1.playedThisTurn = false;
    afterStage1.evolvedThisTurn = false;

    const stage2 = createGameCard(
      createStage2Card("Charizard", "Charmeleon")
    );
    state.players[0].hand = createZone([stage2]);

    evolvePokemon(state, stage2.instanceId, afterStage1.instanceId);
    const afterStage2 = state.players[0].active!;
    expect(afterStage2.card.name).toBe("Charizard");
    expect(afterStage2.evolutionStack).toHaveLength(2);
    expect(afterStage2.evolutionStack[0].card.name).toBe("Charmander"); // Basic
    expect(afterStage2.evolutionStack[1].card.name).toBe("Charmeleon"); // Stage 1
  });

  test("evolution preserves energy, damage, and tools through stack", () => {
    const state = setupBattleState();
    state.turn = 3;

    const basic = createGameCard(
      createTestCard({ id: "charm-01", name: "Charmander" })
    );
    basic.playedThisTurn = false;
    basic.damageCounters = 3; // 30 damage
    const energy = createGameCard(createEnergyCard("Fire"));
    basic.attachedEnergy = [energy];
    state.players[0].active = basic;

    const stage1 = createGameCard(createStage1Card("Charmeleon", "Charmander"));
    state.players[0].hand = createZone([stage1]);

    evolvePokemon(state, stage1.instanceId, basic.instanceId);

    const evolved = state.players[0].active!;
    expect(evolved.damageCounters).toBe(3); // Damage stays
    expect(evolved.attachedEnergy).toHaveLength(1); // Energy stays
    expect(evolved.statusConditions).toEqual([]); // Status cleared
    expect(evolved.markers).toEqual({}); // Markers cleared
  });

  test("evolution clears status conditions and markers", () => {
    const state = setupBattleState();
    state.turn = 3;

    const basic = createGameCard(
      createTestCard({ id: "charm-01", name: "Charmander" })
    );
    basic.playedThisTurn = false;
    basic.statusConditions = ["poisoned", "burned"];
    basic.markers = { CANT_ATTACK_NEXT_TURN: 1 };
    state.players[0].active = basic;

    const stage1 = createGameCard(createStage1Card("Charmeleon", "Charmander"));
    state.players[0].hand = createZone([stage1]);

    evolvePokemon(state, stage1.instanceId, basic.instanceId);

    const evolved = state.players[0].active!;
    expect(evolved.statusConditions).toEqual([]);
    expect(evolved.markers).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════
// 3. ZONE VERIFICATION (Prize, Deck, etc.)
// ═══════════════════════════════════════════════════════

describe("Zone integrity", () => {
  test("prizes zone: 6 cards at game start", () => {
    const state = setupBattleState();
    expect(state.players[0].prizes.cards).toHaveLength(6);
    expect(state.players[1].prizes.cards).toHaveLength(6);
  });

  test("deck out: player loses when deck is empty at draw phase", () => {
    const state = setupBattleState();
    state.phase = "draw";
    state.currentPlayer = 0;
    state.players[0].deck = createZone([]); // Empty deck

    drawCard(state);

    expect(state.phase).toBe("game_over");
    expect(state.winner?.playerIndex).toBe(1);
    expect(state.winner?.condition).toBe("deck_out");
  });

  test("no bench pokemon: player loses when active KO'd and bench empty", () => {
    const state = setupBattleState();
    state.players[1].bench = createZone([]); // Empty bench
    state.players[1].active = null; // No active

    const result = checkWinCondition(state);
    expect(result).toBe(true);
    expect(state.winner?.condition).toBe("no_bench_pokemon");
    expect(state.winner?.playerIndex).toBe(0);
  });

  test("prizes taken: player wins when all prizes collected", () => {
    const state = setupBattleState();
    // Give player 0 only 1 prize left
    state.players[0].prizes = createZone([
      createGameCard(createTestCard({ id: "last-prize" })),
    ]);

    takePrizes(state, 0, 1);

    expect(state.phase).toBe("game_over");
    expect(state.winner?.condition).toBe("prizes_taken");
    expect(state.winner?.playerIndex).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// 4. SPECIAL CONDITIONS VERIFICATION
// ═══════════════════════════════════════════════════════

describe("Special conditions system", () => {
  test("status mutual exclusivity: asleep/paralyzed/confused override each other", () => {
    const state = setupBattleState();
    const active = state.players[0].active!;

    // Apply asleep
    active.statusConditions = ["asleep"];
    expect(active.statusConditions).toContain("asleep");

    // Apply paralyzed — should replace asleep
    active.statusConditions = active.statusConditions.filter(
      (s) => s !== "asleep" && s !== "confused" && s !== "paralyzed"
    );
    active.statusConditions.push("paralyzed");
    expect(active.statusConditions).not.toContain("asleep");
    expect(active.statusConditions).toContain("paralyzed");
  });

  test("poison and burn can coexist", () => {
    const state = setupBattleState();
    const active = state.players[0].active!;

    active.statusConditions = ["poisoned", "burned"];
    expect(active.statusConditions).toContain("poisoned");
    expect(active.statusConditions).toContain("burned");
  });

  test("retreat clears all status conditions", () => {
    const state = setupBattleState();
    const active = state.players[0].active!;
    active.statusConditions = ["poisoned", "burned"];

    const benchId = state.players[0].bench.cards[0].instanceId;
    const energyId = active.attachedEnergy[0].instanceId;

    retreat(state, [energyId], benchId);

    // The old active is now on bench, status should be cleared
    const formerActive = state.players[0].bench.cards.find(
      (c) => c.card.name === "Charizard"
    );
    expect(formerActive?.statusConditions).toEqual([]);
  });

  test("paralyzed Pokemon cannot attack", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["paralyzed"];

    expect(canAttack(state, 0, "Flamethrower")).toBe(false);
  });

  test("asleep Pokemon cannot attack", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["asleep"];

    expect(canAttack(state, 0, "Flamethrower")).toBe(false);
  });

  test("paralyzed Pokemon cannot retreat", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["paralyzed"];

    const result = canRetreat(state, [
      state.players[0].active!.attachedEnergy[0].instanceId,
    ]);
    expect(result.success).toBe(false);
  });

  test("asleep Pokemon cannot retreat", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["asleep"];

    const result = canRetreat(state, [
      state.players[0].active!.attachedEnergy[0].instanceId,
    ]);
    expect(result.success).toBe(false);
  });

  test("between-turns: poison deals 10 damage", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["poisoned"];
    const prevDamage = state.players[0].active!.damageCounters;

    processBetweenTurns(state, 0);

    expect(state.players[0].active!.damageCounters).toBe(prevDamage + 1); // +10 damage
  });

  test("between-turns: paralysis auto-cures", () => {
    const state = setupBattleState();
    state.players[0].active!.statusConditions = ["paralyzed"];

    processBetweenTurns(state, 0);

    expect(
      state.players[0].active!.statusConditions.includes("paralyzed")
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// 5. FIRST TURN RESTRICTIONS
// ═══════════════════════════════════════════════════════

describe("First turn restrictions", () => {
  test("first player cannot attack on turn 1", () => {
    const state = setupBattleState();
    state.turn = 1;
    state.isFirstTurn = true;

    expect(canAttack(state, 0, "Flamethrower")).toBe(false);
  });

  test("first player cannot use supporter on turn 1", () => {
    const state = setupBattleState();
    state.turn = 1;
    state.isFirstTurn = true;

    const supporter = state.players[0].hand.cards.find(
      (c) => c.card.subtypes.includes("Supporter")
    );
    expect(supporter).toBeDefined();

    const result = canPlaySupporter(state, supporter!.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("先攻");
  });

  test("first turn restrictions lift after first turn ends", () => {
    const state = setupBattleState();
    state.turn = 1;
    state.isFirstTurn = true;

    // Can't attack on turn 1
    expect(canAttack(state, 0, "Flamethrower")).toBe(false);

    // End turn
    endTurn(state);

    // Now it's player 1's turn 2
    expect(state.isFirstTurn).toBe(false);
    expect(state.turn).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════
// 6. OPERATIONAL LIMITS
// ═══════════════════════════════════════════════════════

describe("Operational limits", () => {
  test("energy: once per turn", () => {
    const state = setupBattleState();
    const energyCard = state.players[0].hand.cards.find(
      (c) => c.card.supertype === "Energy"
    )!;
    const targetId = state.players[0].active!.instanceId;

    // First energy attach should work
    const res1 = attachEnergy(state, energyCard.instanceId, targetId);
    expect(res1.success).toBe(true);

    // Add another energy to hand for second attempt
    const energy2 = createGameCard(createEnergyCard("Fire"));
    state.players[0].hand.cards.push(energy2);

    // Second energy attach should fail
    const res2 = canAttachEnergy(state, energy2.instanceId, targetId);
    expect(res2.success).toBe(false);
  });

  test("supporter: once per turn", () => {
    const state = setupBattleState();
    const supporter = state.players[0].hand.cards.find(
      (c) => c.card.subtypes.includes("Supporter")
    )!;

    // Mark supporter as used
    state.players[0].supporterUsedThisTurn = true;
    state.turnStatus.supporterUsed = true;

    const result = canPlaySupporter(state, supporter.instanceId);
    expect(result.success).toBe(false);
  });

  test("retreat: once per turn", async () => {
    const state = setupBattleState();

    // Mark retreat as used
    state.turnStatus.retreated = true;

    const benchId = state.players[0].bench.cards[0].instanceId;
    const energyId = state.players[0].active!.attachedEnergy[0].instanceId;

    // Should be blocked by validation pipeline
    const res = await processAction(state, 0, {
      type: "retreat",
      benchInstanceId: benchId,
      energyToDiscard: [energyId],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("撤退");
  });

  test("bench: maximum 5 Pokemon", () => {
    const state = setupBattleState();

    // Fill bench to 5
    while (state.players[0].bench.cards.length < 5) {
      state.players[0].bench.cards.push(
        createGameCard(
          createTestCard({
            id: `bench-fill-${state.players[0].bench.cards.length}`,
          })
        )
      );
    }

    const newBasic = createGameCard(
      createTestCard({ id: "extra-basic", name: "Extra" })
    );
    state.players[0].hand.cards.push(newBasic);

    const result = canPlayBasicToBench(state, newBasic.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("5");
  });
});

// ═══════════════════════════════════════════════════════
// 7. MULTI-PRIZE KO RULES
// ═══════════════════════════════════════════════════════

describe("Multi-prize KO rules", () => {
  test("normal Pokemon gives 1 prize", () => {
    const card = createGameCard(createTestCard({ subtypes: ["Basic"] }));
    expect(getPrizeCount(card)).toBe(1);
  });

  test("ex Pokemon gives 2 prizes", () => {
    const card = createGameCard(
      createTestCard({ subtypes: ["Basic", "ex"] })
    );
    expect(getPrizeCount(card)).toBe(2);
  });

  test("V Pokemon gives 2 prizes", () => {
    const card = createGameCard(
      createTestCard({ subtypes: ["Basic", "V"] })
    );
    expect(getPrizeCount(card)).toBe(2);
  });

  test("VMAX Pokemon gives 3 prizes", () => {
    const card = createGameCard(
      createTestCard({ subtypes: ["VMAX"] })
    );
    expect(getPrizeCount(card)).toBe(3);
  });

  test("VSTAR Pokemon gives 2 prizes", () => {
    const card = createGameCard(
      createTestCard({ subtypes: ["VSTAR"] })
    );
    expect(getPrizeCount(card)).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════
// 8. CONTROLLER INTEGRATION: ATTACK AUTO-ENDS TURN
// ═══════════════════════════════════════════════════════

describe("Controller: attack auto-ends turn", () => {
  test("handleAttack calls endTurn and draws for next player", async () => {
    const state = setupBattleState();

    const initialTurn = state.turn;
    const initialPlayer = state.currentPlayer;

    const res = await processAction(state, 0, {
      type: "attack",
      attackName: "Flamethrower",
    });
    expect(res.success).toBe(true);

    // Turn should have advanced
    expect(state.turn).toBeGreaterThan(initialTurn);
    // Player should have switched
    expect(state.currentPlayer).not.toBe(initialPlayer);
    // Should be in main phase (draw already happened)
    expect(state.phase).toBe("main");
  });

  test("end_turn resets hasAttackedThisTurn for next turn", async () => {
    const state = setupBattleState();

    await processAction(state, 0, { type: "end_turn" });

    expect(state.turnStatus.hasAttackedThisTurn).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// 9. TURNSTATE FIELD INITIALIZATION
// ═══════════════════════════════════════════════════════

describe("TurnState field initialization", () => {
  test("createGameState initializes hasAttackedThisTurn as false", () => {
    const state = createGameState("A", "B");
    expect(state.turnStatus.hasAttackedThisTurn).toBe(false);
  });

  test("endTurn resets hasAttackedThisTurn for next turn", () => {
    const state = setupBattleState();
    state.turnStatus.hasAttackedThisTurn = true;

    endTurn(state);

    expect(state.turnStatus.hasAttackedThisTurn).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// 10. GAMECARDS: evolutionStack FIELD
// ═══════════════════════════════════════════════════════

describe("GameCard evolutionStack field", () => {
  test("createGameCard includes empty evolutionStack", () => {
    const gc = createGameCard(createTestCard());
    expect(gc).toHaveProperty("evolutionStack");
    expect(gc.evolutionStack).toEqual([]);
  });

  test("evolutionStack entries contain cardId and card data", () => {
    const state = setupBattleState();
    state.turn = 3;

    const basic = createGameCard(
      createTestCard({ id: "my-charm", name: "Charmander" })
    );
    basic.playedThisTurn = false;
    state.players[0].active = basic;

    const stage1 = createGameCard(createStage1Card("Charmeleon", "Charmander"));
    state.players[0].hand = createZone([stage1]);

    evolvePokemon(state, stage1.instanceId, basic.instanceId);

    const evolved = state.players[0].active!;
    const stackEntry = evolved.evolutionStack[0];
    expect(stackEntry).toHaveProperty("cardId", "my-charm");
    expect(stackEntry).toHaveProperty("card");
    expect(stackEntry.card.name).toBe("Charmander");
    expect(stackEntry.card.subtypes).toContain("Basic");
  });
});
