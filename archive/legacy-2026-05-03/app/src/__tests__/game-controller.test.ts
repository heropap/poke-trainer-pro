/**
 * Tests for the Local Game Controller
 *
 * Tests:
 * 1. processAction routing (play_card, attack, end_turn, evolve, retreat, promote, concede)
 * 2. Turn validation (can't act on opponent's turn)
 * 3. Phase validation (can only do things in correct phase)
 * 4. Auto-draw at turn start
 * 5. Attack → end turn → auto-draw flow
 * 6. End turn → auto-draw flow
 * 7. Promotion after KO
 * 8. Game over detection
 * 9. startFirstTurn helper
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
  GamePhase,
} from "@/engine/game-state";
import { processAction, startFirstTurn, GameAction } from "@/engine/game-controller";
import { Card } from "@/types/card";

// ─── Test Fixtures ───

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

/**
 * Sets up a ready-to-play game state in main phase.
 * Both players have active Pokemon, bench, deck, and prizes.
 */
function setupPlayableGame(): GameState {
  resetInstanceCounter();
  const state = createGameState("Alice", "Bob");
  state.phase = GamePhase.MAIN;
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Alice (Player 0)
  const aliceActive = makeGameCard({
    name: "Charizard",
    hp: "200",
    types: ["Fire"],
    attacks: [
      { name: "Fire Spin", damage: "100", cost: ["Fire", "Fire"], text: "", convertedEnergyCost: 2 },
      { name: "Scratch", damage: "20", cost: [], text: "", convertedEnergyCost: 0 },
    ],
  });
  state.players[0].active = aliceActive;

  const aliceBench1 = makeGameCard({ name: "Eevee", hp: "50" });
  const aliceBench2 = makeGameCard({ name: "Vulpix", hp: "60" });
  state.players[0].bench.cards.push(aliceBench1, aliceBench2);

  // Give Alice some energy
  const energy1 = makeGameCard({ name: "Fire Energy 1", supertype: "Energy", subtypes: ["Basic"] });
  const energy2 = makeGameCard({ name: "Fire Energy 2", supertype: "Energy", subtypes: ["Basic"] });
  aliceActive.attachedEnergy.push(energy1, energy2);

  // Hand with various cards
  const handEnergy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
  const handBasic = makeGameCard({ name: "Charmander", hp: "70", types: ["Fire"] });
  state.players[0].hand.cards.push(handEnergy, handBasic);

  // Deck and prizes
  for (let i = 0; i < 10; i++) {
    state.players[0].deck.cards.push(makeGameCard({ name: `Alice Deck ${i}` }));
  }
  for (let i = 0; i < 6; i++) {
    state.players[0].prizes.cards.push(makeGameCard({ name: `Alice Prize ${i}` }));
  }

  // Bob (Player 1)
  const bobActive = makeGameCard({
    name: "Pikachu",
    hp: "60",
    types: ["Lightning"],
    weaknesses: [{ type: "Fighting", value: "×2" }],
    attacks: [{ name: "Thunder Shock", damage: "30", cost: [], text: "", convertedEnergyCost: 0 }],
  });
  state.players[1].active = bobActive;

  const bobBench = makeGameCard({ name: "Squirtle", hp: "60" });
  state.players[1].bench.cards.push(bobBench);

  for (let i = 0; i < 10; i++) {
    state.players[1].deck.cards.push(makeGameCard({ name: `Bob Deck ${i}` }));
  }
  for (let i = 0; i < 6; i++) {
    state.players[1].prizes.cards.push(makeGameCard({ name: `Bob Prize ${i}` }));
  }

  return state;
}

// ─── Turn Validation ───

describe("Turn Validation", () => {
  it("不能在对方回合行动", async () => {
    const state = setupPlayableGame();
    state.currentPlayer = 0;

    // Player 1 (Bob) tries to act
    const result = await processAction(state, 1, { type: "end_turn" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("不是你的回合");
  });

  it("可以在自己的回合行动", async () => {
    const state = setupPlayableGame();
    state.currentPlayer = 0;

    const result = await processAction(state, 0, { type: "end_turn" });
    expect(result.success).toBe(true);
  });

  it("认输不受回合限制", async () => {
    const state = setupPlayableGame();
    state.currentPlayer = 0;

    // Player 1 can concede even when it's not their turn
    const result = await processAction(state, 1, { type: "concede" });
    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
  });

  it("游戏已结束时不能行动", async () => {
    const state = setupPlayableGame();
    state.phase = GamePhase.GAME_OVER;

    const result = await processAction(state, 0, { type: "end_turn" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("已结束");
  });
});

// ─── End Turn Flow ───

describe("End Turn Flow", () => {
  it("结束回合后切换到对手并自动抽牌", async () => {
    const state = setupPlayableGame();
    const bobHandBefore = state.players[1].hand.cards.length;
    const bobDeckBefore = state.players[1].deck.cards.length;

    const result = await processAction(state, 0, { type: "end_turn" });
    expect(result.success).toBe(true);

    // Should now be Bob's turn (player 1) in main phase after auto-draw
    expect(result.newState.currentPlayer).toBe(1);
    expect(result.newState.phase).toBe(GamePhase.MAIN);
    // Bob should have drawn 1 card
    expect(result.newState.players[1].hand.cards.length).toBe(bobHandBefore + 1);
    expect(result.newState.players[1].deck.cards.length).toBe(bobDeckBefore - 1);
  });

  it("对手牌组为空时结束回合触发 deck_out", async () => {
    const state = setupPlayableGame();
    // Empty Bob's deck
    state.players[1].deck.cards = [];

    const result = await processAction(state, 0, { type: "end_turn" });
    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(result.newState.phase).toBe(GamePhase.GAME_OVER);
    expect(result.newState.winner!.condition).toBe("deck_out");
    expect(result.newState.winner!.playerIndex).toBe(0); // Alice wins because Bob can't draw
  });
});

// ─── Play Card ───

describe("Play Card Actions", () => {
  it("打出基础宝可梦到备战区", async () => {
    const state = setupPlayableGame();
    const charmander = state.players[0].hand.cards.find(c => c.card.name === "Charmander")!;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });
    expect(result.success).toBe(true);
    expect(result.newState.players[0].bench.cards).toHaveLength(3);
  });

  it("打出基础宝可梦到空的战斗区", async () => {
    const state = setupPlayableGame();
    state.players[0].active = null;

    const charmander = state.players[0].hand.cards.find(c => c.card.name === "Charmander")!;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "active",
    });
    expect(result.success).toBe(true);
    expect(result.newState.players[0].active).not.toBeNull();
    expect(result.newState.players[0].active!.card.name).toBe("Charmander");
  });

  it("附加能量到战斗宝可梦", async () => {
    const state = setupPlayableGame();
    const energy = state.players[0].hand.cards.find(c => c.card.supertype === "Energy")!;
    const active = state.players[0].active!;
    const energyBefore = active.attachedEnergy.length;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: energy.instanceId,
      targetZone: "attach",
      targetId: active.instanceId,
    });
    expect(result.success).toBe(true);
    expect(result.newState.players[0].active!.attachedEnergy.length).toBe(energyBefore + 1);
  });

  it("非主阶段不能打出卡牌", async () => {
    const state = setupPlayableGame();
    state.phase = GamePhase.DRAW;
    const charmander = state.players[0].hand.cards.find(c => c.card.name === "Charmander")!;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("主阶段");
  });
});

// ─── Attack Flow ───

describe("Attack Flow", () => {
  it("攻击成功后自动结束回合并抽牌", async () => {
    const state = setupPlayableGame();
    const bobHandBefore = state.players[1].hand.cards.length;

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Scratch",
    });
    expect(result.success).toBe(true);
    // Bob should have been damaged
    expect(result.newState.players[1].active!.damageCounters).toBeGreaterThan(0);
    // Turn should have switched to Bob with auto-draw
    expect(result.newState.currentPlayer).toBe(1);
    expect(result.newState.phase).toBe(GamePhase.MAIN);
    expect(result.newState.players[1].hand.cards.length).toBe(bobHandBefore + 1);
  });

  it("攻击击倒对手后正确处理", async () => {
    const state = setupPlayableGame();
    // Give Pikachu enough damage to be KO'd by Scratch (20 damage)
    state.players[1].active!.damageCounters = 4; // 40 existing + 20 = 60 = KO

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Scratch",
    });
    expect(result.success).toBe(true);
    // Prize should be taken
    expect(result.newState.players[0].prizes.cards.length).toBe(5);
  });

  it("非主阶段不能攻击", async () => {
    const state = setupPlayableGame();
    state.phase = GamePhase.DRAW;

    const result = await processAction(state, 0, {
      type: "attack",
      attackName: "Scratch",
    });
    expect(result.success).toBe(false);
  });
});

// ─── Promote ───

describe("Promote Action", () => {
  it("成功提升备战区宝可梦", async () => {
    const state = setupPlayableGame();
    state.players[0].active = null;
    const eevee = state.players[0].bench.cards[0];

    const result = await processAction(state, 0, {
      type: "promote",
      benchInstanceId: eevee.instanceId,
    });
    expect(result.success).toBe(true);
    expect(result.newState.players[0].active!.card.name).toBe("Eevee");
  });

  it("提升不受回合限制（对方回合也可以提升）", async () => {
    const state = setupPlayableGame();
    state.currentPlayer = 0; // Alice's turn
    state.players[1].active = null; // Bob needs to promote

    const squirtle = state.players[1].bench.cards[0];

    // Bob can promote even though it's Alice's turn
    const result = await processAction(state, 1, {
      type: "promote",
      benchInstanceId: squirtle.instanceId,
    });
    expect(result.success).toBe(true);
    expect(result.newState.players[1].active!.card.name).toBe("Squirtle");
  });
});

// ─── Concede ───

describe("Concede Action", () => {
  it("认输后对手获胜", async () => {
    const state = setupPlayableGame();

    const result = await processAction(state, 0, { type: "concede" });
    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(result.newState.winner!.playerIndex).toBe(1);
    expect(result.newState.winner!.condition).toBe("concede");
  });
});

// ─── startFirstTurn ───

describe("startFirstTurn", () => {
  it("从 draw 阶段自动抽牌进入 main 阶段", () => {
    const state = setupPlayableGame();
    state.phase = GamePhase.DRAW;
    state.turn = 1;
    const handBefore = state.players[0].hand.cards.length;

    const newState = startFirstTurn(state);
    expect(newState.phase).toBe(GamePhase.MAIN);
    expect(newState.players[0].hand.cards.length).toBe(handBefore + 1);
  });

  it("已在 main 阶段时不做额外操作", () => {
    const state = setupPlayableGame();
    state.phase = GamePhase.MAIN;
    const handBefore = state.players[0].hand.cards.length;

    const newState = startFirstTurn(state);
    expect(newState.phase).toBe(GamePhase.MAIN);
    expect(newState.players[0].hand.cards.length).toBe(handBefore);
  });
});

// ─── Full Game Flow ───

describe("Full Game Flow Integration", () => {
  it("完整的多回合游戏流程", async () => {
    const state = setupPlayableGame();
    state.currentPlayer = 0;

    // Turn 1: Alice plays a Basic to bench then ends turn
    const charmander = state.players[0].hand.cards.find(c => c.card.name === "Charmander")!;
    let result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });
    expect(result.success).toBe(true);
    expect(result.newState.players[0].bench.cards).toHaveLength(3);

    // Alice ends turn
    result = await processAction(state, 0, { type: "end_turn" });
    expect(result.success).toBe(true);
    expect(result.newState.currentPlayer).toBe(1);
    expect(result.newState.phase).toBe(GamePhase.MAIN);

    // Turn 2: Bob attacks Alice's Charizard
    result = await processAction(state, 1, {
      type: "attack",
      attackName: "Thunder Shock",
    });
    expect(result.success).toBe(true);
    // 30 damage on Charizard (200 HP)
    // Turn should switch back to Alice
    expect(result.newState.currentPlayer).toBe(0);

    // Turn 3: Alice attacks with Scratch
    result = await processAction(state, 0, {
      type: "attack",
      attackName: "Scratch",
    });
    expect(result.success).toBe(true);
    // Turn should switch to Bob
    expect(result.newState.currentPlayer).toBe(1);
  });
});
