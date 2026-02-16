/**
 * Evolution Middleware Tests
 *
 * Tests the declarative rule pipeline for EVOLVE_ACTION interception.
 * Covers:
 *   1. Individual rule validation (unit tests per rule)
 *   2. Pipeline composition & priority ordering
 *   3. Integration with canEvolve / evolvePokemon (end-to-end)
 *   4. Edge cases (double evolve, bench targets, Stage 2)
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
} from "@/engine/game-state";
import {
  canEvolve,
  evolvePokemon,
  playBasicToBench,
  endTurn,
  drawCard,
  getCurrentPlayer,
} from "@/engine/turn-actions";
import { Card } from "@/types/card";
import { ActionEvent } from "@/engine/middleware/types";
import {
  validateEvolution,
  phaseGateRule,
  firstTurnRule,
  cardValidityRule,
  evolutionChainRule,
  alreadyEvolvedThisTurnRule,
  sameEntryTurnRule,
  EVOLUTION_RULES,
} from "@/engine/middleware/evolution.middleware";
import { ALLOW, runMiddleware } from "@/engine/middleware/types";

// ═══════════════════════════════════════════════
//  Test Fixtures
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

/** Standard main-phase state: turn 2, not first turn, player 0 active */
function setupMainPhase(): GameState {
  resetInstanceCounter();
  const state = createGameState("Alice", "Bob");
  state.phase = "main";
  state.turn = 2;
  state.isFirstTurn = false;
  return state;
}

/** Create a valid evolution scenario: Charmander (active) + Charmeleon (hand) */
function setupEvolutionScenario() {
  const state = setupMainPhase();
  const player = getCurrentPlayer(state);

  const charmander = makeGameCard({ name: "Charmander", hp: "70", types: ["Fire"] });
  charmander.playedThisTurn = false;
  charmander.evolvedThisTurn = false;
  player.active = charmander;

  const charmeleon = makeGameCard({
    name: "Charmeleon",
    hp: "90",
    types: ["Fire"],
    subtypes: ["Stage 1"],
    evolvesFrom: "Charmander",
  });
  player.hand.cards.push(charmeleon);

  return { state, player, charmander, charmeleon };
}

/** Build an EVOLVE_ACTION event from instance IDs */
function makeEvolveEvent(
  evolutionCardId: string,
  targetPokemonId: string,
  playerIndex: 0 | 1 = 0
): ActionEvent<"EVOLVE_ACTION"> {
  return {
    type: "EVOLVE_ACTION",
    playerIndex,
    payload: { evolutionCardId, targetPokemonId },
  };
}

// ═══════════════════════════════════════════════
//  1. Individual Rule Unit Tests
// ═══════════════════════════════════════════════

describe("Evolution Middleware — Individual Rules", () => {
  // ─── phaseGateRule (priority 0) ───

  describe("phaseGateRule", () => {
    it("allows during main phase", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      expect(phaseGateRule.validate(state, event)).toEqual(ALLOW);
    });

    it("blocks during draw phase", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      state.phase = "draw";
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      const result = phaseGateRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("PHASE_NOT_MAIN");
    });

    it("blocks during attack phase", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      state.phase = "attack";
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      expect(phaseGateRule.validate(state, event).allowed).toBe(false);
    });

    it("blocks during game_over phase", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      state.phase = "game_over";
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      expect(phaseGateRule.validate(state, event).allowed).toBe(false);
    });
  });

  // ─── firstTurnRule (priority 1) ───

  describe("firstTurnRule", () => {
    it("allows on non-first turn", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      expect(firstTurnRule.validate(state, event)).toEqual(ALLOW);
    });

    it("blocks on first turn", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      state.isFirstTurn = true;
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      const result = firstTurnRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("FIRST_TURN_BLOCK");
      expect(result.reason).toContain("第一回合");
    });
  });

  // ─── cardValidityRule (priority 10) ───

  describe("cardValidityRule", () => {
    it("allows valid Stage 1 evolution card in hand", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      expect(cardValidityRule.validate(state, event)).toEqual(ALLOW);
    });

    it("allows valid Stage 2 evolution card in hand", () => {
      const { state, player, charmander } = setupEvolutionScenario();
      // Replace hand card with Stage 2
      player.hand.cards = [];
      const charizard = makeGameCard({
        name: "Charizard",
        hp: "180",
        subtypes: ["Stage 2"],
        evolvesFrom: "Charmeleon",
      });
      player.hand.cards.push(charizard);
      // Target needs to be Charmeleon for chain, but cardValidityRule only checks the evo card
      const event = makeEvolveEvent(charizard.instanceId, charmander.instanceId);
      expect(cardValidityRule.validate(state, event)).toEqual(ALLOW);
    });

    it("blocks when card not in hand", () => {
      const { state, charmander } = setupEvolutionScenario();
      const event = makeEvolveEvent("nonexistent-id", charmander.instanceId);
      const result = cardValidityRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("CARD_NOT_IN_HAND");
    });

    it("blocks when card is not a Pokemon", () => {
      const { state, player, charmander } = setupEvolutionScenario();
      player.hand.cards = [];
      const trainer = makeGameCard({
        name: "Rare Candy",
        supertype: "Trainer",
        subtypes: ["Item"],
      });
      player.hand.cards.push(trainer);
      const event = makeEvolveEvent(trainer.instanceId, charmander.instanceId);
      const result = cardValidityRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("NOT_POKEMON");
    });

    it("blocks when card is Basic (not Stage 1/2)", () => {
      const { state, player, charmander } = setupEvolutionScenario();
      player.hand.cards = [];
      const basic = makeGameCard({ name: "Pikachu", hp: "60", subtypes: ["Basic"] });
      player.hand.cards.push(basic);
      const event = makeEvolveEvent(basic.instanceId, charmander.instanceId);
      const result = cardValidityRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("NOT_EVOLUTION_CARD");
    });

    it("blocks when evolution card has no evolvesFrom field", () => {
      const { state, player, charmander } = setupEvolutionScenario();
      player.hand.cards = [];
      const broken = makeGameCard({
        name: "Broken Evo",
        hp: "90",
        subtypes: ["Stage 1"],
        // no evolvesFrom
      });
      player.hand.cards.push(broken);
      const event = makeEvolveEvent(broken.instanceId, charmander.instanceId);
      const result = cardValidityRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("MISSING_EVOLVES_FROM");
    });
  });

  // ─── evolutionChainRule (priority 11) ───

  describe("evolutionChainRule", () => {
    it("allows when evolvesFrom matches target name", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      expect(evolutionChainRule.validate(state, event)).toEqual(ALLOW);
    });

    it("blocks when chain does not match", () => {
      const { state, player } = setupEvolutionScenario();
      // Put a Pikachu as active instead
      const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
      player.active = pikachu;

      const charmeleon = player.hand.cards[0]; // Charmeleon evolvesFrom Charmander
      const event = makeEvolveEvent(charmeleon.instanceId, pikachu.instanceId);
      const result = evolutionChainRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("CHAIN_MISMATCH");
      expect(result.reason).toContain("Charmander");
      expect(result.reason).toContain("Pikachu");
    });

    it("blocks when target is not on field", () => {
      const { state, charmeleon } = setupEvolutionScenario();
      const event = makeEvolveEvent(charmeleon.instanceId, "nonexistent-target");
      const result = evolutionChainRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("TARGET_NOT_ON_FIELD");
    });

    it("finds target on bench", () => {
      const { state, player, charmeleon } = setupEvolutionScenario();
      // Move Charmander to bench, put something else active
      const charmander = player.active!;
      player.active = makeGameCard({ name: "Pikachu", hp: "60" });
      player.bench.cards.push(charmander);

      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      expect(evolutionChainRule.validate(state, event)).toEqual(ALLOW);
    });
  });

  // ─── alreadyEvolvedThisTurnRule (priority 20) ───

  describe("alreadyEvolvedThisTurnRule", () => {
    it("allows when target was NOT evolved this turn", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      expect(alreadyEvolvedThisTurnRule.validate(state, event)).toEqual(ALLOW);
    });

    it("blocks when target was evolved this turn", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      charmander.evolvedThisTurn = true;
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      const result = alreadyEvolvedThisTurnRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("ALREADY_EVOLVED_THIS_TURN");
      expect(result.reason).toContain("已经进化过");
    });
  });

  // ─── sameEntryTurnRule (priority 21) ───

  describe("sameEntryTurnRule", () => {
    it("allows when target was played on a previous turn", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      expect(sameEntryTurnRule.validate(state, event)).toEqual(ALLOW);
    });

    it("blocks when target was played this turn", () => {
      const { state, charmeleon, charmander } = setupEvolutionScenario();
      charmander.playedThisTurn = true;
      const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
      const result = sameEntryTurnRule.validate(state, event);
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe("SAME_TURN_ENTRY");
      expect(result.reason).toContain("刚入场");
    });
  });
});

// ═══════════════════════════════════════════════
//  2. Pipeline Composition & Priority Tests
// ═══════════════════════════════════════════════

describe("Evolution Middleware — Pipeline", () => {
  it("EVOLUTION_RULES contains all 6 rules", () => {
    expect(EVOLUTION_RULES).toHaveLength(6);
  });

  it("rules are sorted by priority (ascending)", () => {
    const priorities = EVOLUTION_RULES.map((r) => r.priority);
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i - 1]);
    }
  });

  it("all rules have unique names", () => {
    const names = EVOLUTION_RULES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all rules target EVOLVE_ACTION", () => {
    for (const rule of EVOLUTION_RULES) {
      expect(rule.appliesTo).toContain("EVOLVE_ACTION");
    }
  });

  it("validateEvolution allows a fully valid evolution", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
    const result = validateEvolution(state, event);
    expect(result.allowed).toBe(true);
  });

  it("first denial short-circuits — phase check before card lookup", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    state.phase = "draw";
    // Also make the card invalid to confirm we don't reach that rule
    state.players[0].hand.cards = [];
    const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
    const result = validateEvolution(state, event);
    expect(result.allowed).toBe(false);
    expect(result.rule).toBe("PHASE_NOT_MAIN"); // Not CARD_NOT_IN_HAND
  });

  it("first turn denial short-circuits before card-level rules", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    state.isFirstTurn = true;
    // Also break the evolution chain to confirm short-circuit
    charmander.card.name = "Pikachu";
    const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
    const result = validateEvolution(state, event);
    expect(result.allowed).toBe(false);
    expect(result.rule).toBe("FIRST_TURN_BLOCK"); // Not CHAIN_MISMATCH
  });

  it("alreadyEvolvedThisTurn (priority 20) fires before sameEntryTurn (priority 21)", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    // Both flags true: evolved this turn also sets playedThisTurn
    charmander.evolvedThisTurn = true;
    charmander.playedThisTurn = true;
    const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
    const result = validateEvolution(state, event);
    expect(result.allowed).toBe(false);
    // Should be "已进化" not "刚入场"
    expect(result.rule).toBe("ALREADY_EVOLVED_THIS_TURN");
  });

  it("sameEntryTurn fires for played-this-turn (not evolved)", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    charmander.playedThisTurn = true;
    charmander.evolvedThisTurn = false;
    const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
    const result = validateEvolution(state, event);
    expect(result.allowed).toBe(false);
    expect(result.rule).toBe("SAME_TURN_ENTRY");
  });
});

// ═══════════════════════════════════════════════
//  3. runMiddleware Infrastructure Tests
// ═══════════════════════════════════════════════

describe("Evolution Middleware — runMiddleware infrastructure", () => {
  it("returns ALLOW when no rules apply", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
    const result = runMiddleware([], state, event);
    expect(result).toEqual(ALLOW);
  });

  it("runs rules in priority order regardless of array order", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    state.phase = "draw";
    state.isFirstTurn = true;

    // Pass rules in reverse order — pipeline should still sort by priority
    const reversed = [...EVOLUTION_RULES].reverse();
    const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
    const result = runMiddleware(reversed, state, event);
    // phaseGateRule (priority 0) should fire first
    expect(result.rule).toBe("PHASE_NOT_MAIN");
  });
});

// ═══════════════════════════════════════════════
//  4. Integration: canEvolve delegates to middleware
// ═══════════════════════════════════════════════

describe("Evolution Middleware — canEvolve integration", () => {
  it("canEvolve allows valid evolution (middleware passes)", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    const result = canEvolve(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(true);
  });

  it("canEvolve blocks first turn via middleware", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    state.isFirstTurn = true;
    const result = canEvolve(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("第一回合");
  });

  it("canEvolve blocks same-turn entry via middleware", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    charmander.playedThisTurn = true;
    const result = canEvolve(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("刚入场");
  });

  it("canEvolve blocks already-evolved-this-turn via middleware", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    charmander.evolvedThisTurn = true;
    charmander.playedThisTurn = true;
    const result = canEvolve(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("已经进化过");
  });

  it("canEvolve blocks chain mismatch via middleware", () => {
    const { state, player, charmeleon } = setupEvolutionScenario();
    const pikachu = makeGameCard({ name: "Pikachu", hp: "60" });
    player.active = pikachu;
    const result = canEvolve(state, charmeleon.instanceId, pikachu.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Charmander");
  });

  it("canEvolve blocks wrong phase via middleware", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    state.phase = "draw";
    const result = canEvolve(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("主阶段");
  });
});

// ═══════════════════════════════════════════════
//  5. Integration: evolvePokemon sets flags correctly
// ═══════════════════════════════════════════════

describe("Evolution Middleware — evolvePokemon flag tracking", () => {
  it("evolvePokemon sets evolvedThisTurn on target", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    evolvePokemon(state, charmeleon.instanceId, charmander.instanceId);
    const active = state.players[0].active!;
    expect(active.evolvedThisTurn).toBe(true);
    expect(active.playedThisTurn).toBe(true);
  });

  it("evolvePokemon prevents second evolution this turn", () => {
    const { state, player, charmander } = setupEvolutionScenario();

    // First evolution: Charmander → Charmeleon
    const charmeleon = player.hand.cards[0];
    const result1 = evolvePokemon(state, charmeleon.instanceId, charmander.instanceId);
    expect(result1.success).toBe(true);
    expect(player.active!.card.name).toBe("Charmeleon");

    // Second evolution attempt: Charmeleon → Charizard (same turn)
    const charizard = makeGameCard({
      name: "Charizard",
      hp: "180",
      subtypes: ["Stage 2"],
      evolvesFrom: "Charmeleon",
    });
    player.hand.cards.push(charizard);

    const result2 = canEvolve(state, charizard.instanceId, player.active!.instanceId);
    expect(result2.success).toBe(false);
    // Should get the "already evolved" message, not "just entered"
    expect(result2.error).toContain("已经进化过");
  });

  it("endTurn resets evolvedThisTurn flag", () => {
    const { state, player, charmeleon, charmander } = setupEvolutionScenario();

    evolvePokemon(state, charmeleon.instanceId, charmander.instanceId);
    expect(player.active!.evolvedThisTurn).toBe(true);

    endTurn(state);
    // After endTurn, the previous player's flags are reset
    expect(state.players[0].active!.evolvedThisTurn).toBe(false);
    expect(state.players[0].active!.playedThisTurn).toBe(false);
  });
});

// ═══════════════════════════════════════════════
//  6. Edge Cases
// ═══════════════════════════════════════════════

describe("Evolution Middleware — Edge Cases", () => {
  it("evolve bench Pokemon (not just active)", () => {
    const { state, player } = setupEvolutionScenario();

    // Put Charmander on bench, put something else active
    const charmander = player.active!;
    player.active = makeGameCard({ name: "Pikachu", hp: "60" });
    player.bench.cards.push(charmander);

    const charmeleon = player.hand.cards[0];
    const result = evolvePokemon(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(true);
    // The bench card should be updated
    const evolved = player.bench.cards.find(
      (c) => c.instanceId === charmander.instanceId
    );
    expect(evolved!.card.name).toBe("Charmeleon");
    expect(evolved!.evolvedThisTurn).toBe(true);
  });

  it("play Basic this turn → cannot evolve it immediately", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);
    player.active = makeGameCard({ name: "Pikachu", hp: "60" });

    // Play a new Charmander to bench
    const charmander = makeGameCard({ name: "Charmander", hp: "70" });
    player.hand.cards.push(charmander);
    playBasicToBench(state, charmander.instanceId);
    expect(charmander.playedThisTurn).toBe(true);

    // Try to evolve it immediately
    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(charmeleon);
    const benchCharmander = player.bench.cards.find(
      (c) => c.card.name === "Charmander"
    )!;

    const result = canEvolve(state, charmeleon.instanceId, benchCharmander.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("刚入场");
  });

  it("evolution after turn change is allowed", () => {
    const state = setupMainPhase();
    const player = state.players[0];

    // Player 0: set up active and bench
    player.active = makeGameCard({ name: "Pikachu", hp: "60" });
    const charmander = makeGameCard({ name: "Charmander", hp: "70" });
    charmander.playedThisTurn = true; // played this turn
    player.bench.cards.push(charmander);

    // Put a card in each deck so endTurn → drawCard doesn't deck out
    player.deck.cards.push(makeGameCard({ name: "Filler", hp: "10" }));
    state.players[1].active = makeGameCard({ name: "Bulbasaur", hp: "70" });
    state.players[1].deck.cards.push(makeGameCard({ name: "Filler2", hp: "10" }));

    // End turn (resets player 0 flags, switches to player 1)
    endTurn(state);
    drawCard(state); // Player 1 draws

    // Player 1 ends turn (switches back to player 0)
    endTurn(state);
    drawCard(state); // Player 0 draws

    // Now it's player 0's turn again, charmander's flags should be reset
    expect(state.currentPlayer).toBe(0);
    expect(state.phase).toBe("main");
    expect(charmander.playedThisTurn).toBe(false);

    // Evolution should now be allowed
    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(charmeleon);

    const result = canEvolve(state, charmeleon.instanceId, charmander.instanceId);
    expect(result.success).toBe(true);
  });

  it("Stage 2 evolution blocked by same rules", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);

    // Active is a Charmeleon that was just evolved this turn
    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    charmeleon.playedThisTurn = true;
    charmeleon.evolvedThisTurn = true;
    player.active = charmeleon;

    const charizard = makeGameCard({
      name: "Charizard",
      hp: "180",
      subtypes: ["Stage 2"],
      evolvesFrom: "Charmeleon",
    });
    player.hand.cards.push(charizard);

    const result = canEvolve(state, charizard.instanceId, charmeleon.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("已经进化过");
  });

  it("multiple bench Pokemon — correct target validated", () => {
    const state = setupMainPhase();
    const player = getCurrentPlayer(state);
    player.active = makeGameCard({ name: "Pikachu", hp: "60" });

    // Two Charmanders on bench: one played last turn, one this turn
    const oldCharmander = makeGameCard({ name: "Charmander", hp: "70" });
    oldCharmander.playedThisTurn = false;
    const newCharmander = makeGameCard({ name: "Charmander", hp: "70" });
    newCharmander.playedThisTurn = true;
    player.bench.cards.push(oldCharmander, newCharmander);

    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    player.hand.cards.push(charmeleon);

    // Old Charmander: evolution allowed
    expect(canEvolve(state, charmeleon.instanceId, oldCharmander.instanceId).success).toBe(true);

    // New Charmander: evolution blocked
    const result = canEvolve(state, charmeleon.instanceId, newCharmander.instanceId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("刚入场");
  });

  it("evolution clears status conditions (integration)", () => {
    const { state, player, charmeleon, charmander } = setupEvolutionScenario();
    charmander.statusConditions = ["poisoned", "paralyzed"];

    evolvePokemon(state, charmeleon.instanceId, charmander.instanceId);
    expect(player.active!.statusConditions).toHaveLength(0);
    expect(player.active!.card.name).toBe("Charmeleon");
  });

  it("evolution preserves attached energy and damage (integration)", () => {
    const { state, player, charmeleon, charmander } = setupEvolutionScenario();
    const energy = makeGameCard({
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    charmander.attachedEnergy.push(energy);
    charmander.damageCounters = 4;

    evolvePokemon(state, charmeleon.instanceId, charmander.instanceId);
    expect(player.active!.attachedEnergy).toHaveLength(1);
    expect(player.active!.attachedEnergy[0].card.name).toBe("Fire Energy");
    expect(player.active!.damageCounters).toBe(4);
  });
});

// ═══════════════════════════════════════════════
//  7. Purity Tests (middleware must not mutate)
// ═══════════════════════════════════════════════

describe("Evolution Middleware — Purity", () => {
  it("validateEvolution does not mutate state", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    const stateBefore = JSON.stringify(state);

    const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
    validateEvolution(state, event);

    expect(JSON.stringify(state)).toBe(stateBefore);
  });

  it("validateEvolution does not mutate state on denial", () => {
    const { state, charmeleon, charmander } = setupEvolutionScenario();
    state.isFirstTurn = true;
    const stateBefore = JSON.stringify(state);

    const event = makeEvolveEvent(charmeleon.instanceId, charmander.instanceId);
    validateEvolution(state, event);

    expect(JSON.stringify(state)).toBe(stateBefore);
  });
});
