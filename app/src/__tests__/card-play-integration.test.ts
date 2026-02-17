/**
 * Card Play Integration Tests
 *
 * Tests all card types going through processAction's play_card routing.
 * Verifies the Session 11b fix: handlePlayCard routes by card.supertype
 * FIRST, not by targetZone.
 *
 * Coverage:
 * 1. Basic Pokemon → active (when empty) / bench (when active exists)
 * 2. Energy → attach to active / bench with targetId
 * 3. Supporter → play and discard, once-per-turn
 * 4. Item (non-Tool) → play and discard
 * 5. Pokemon Tool → attach to target Pokemon
 * 6. Stage 1/2 Evolution → evolve target Pokemon
 * 7. Error cases: missing IDs, wrong phase, card not in hand
 * 8. Multi-step flows: energy → supporter → item in same turn
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
} from "@/engine/game-state";
import { processAction, GameAction } from "@/engine/game-controller";
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
 * Sets up a playable game with various card types in hand.
 * Player 0 (Alice) is the current player in main phase.
 */
function setupFullHand(): GameState {
  resetInstanceCounter();
  const state = createGameState("Alice", "Bob");
  state.phase = "main";
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Alice (Player 0) - Active Pokemon
  const aliceActive = makeGameCard({
    name: "Charizard",
    hp: "200",
    types: ["Fire"],
    attacks: [
      { name: "Fire Spin", damage: "100", cost: ["Fire", "Fire"], text: "", convertedEnergyCost: 2 },
    ],
  });
  state.players[0].active = aliceActive;

  // Bench with 2 Pokemon
  const eevee = makeGameCard({ name: "Eevee", hp: "50" });
  const vulpix = makeGameCard({ name: "Vulpix", hp: "60" });
  state.players[0].bench.cards.push(eevee, vulpix);

  // Hand: diverse card types
  const handBasic = makeGameCard({ name: "Charmander", hp: "70", types: ["Fire"] });
  const handEnergy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
  const handSupporter = makeGameCard({
    name: "Professor's Research",
    supertype: "Trainer",
    subtypes: ["Supporter"],
  });
  const handItem = makeGameCard({
    name: "Potion",
    supertype: "Trainer",
    subtypes: ["Item"],
  });
  const handTool = makeGameCard({
    name: "Choice Belt",
    supertype: "Trainer",
    subtypes: ["Item", "Pokémon Tool"],
  });
  const handStage1 = makeGameCard({
    name: "Charmeleon",
    supertype: "Pokémon",
    subtypes: ["Stage 1"],
    evolvesFrom: "Charmander",
    hp: "90",
  });

  state.players[0].hand.cards.push(
    handBasic, handEnergy, handSupporter, handItem, handTool, handStage1
  );

  // Deck and prizes
  for (let i = 0; i < 20; i++) {
    state.players[0].deck.cards.push(makeGameCard({ name: `Alice Deck ${i}` }));
  }
  for (let i = 0; i < 6; i++) {
    state.players[0].prizes.cards.push(makeGameCard({ name: `Alice Prize ${i}` }));
  }

  // Bob (Player 1) - simple setup
  const bobActive = makeGameCard({
    name: "Pikachu",
    hp: "60",
    types: ["Lightning"],
    attacks: [{ name: "Thunder Shock", damage: "30", cost: [], text: "", convertedEnergyCost: 0 }],
  });
  state.players[1].active = bobActive;
  const bobBench = makeGameCard({ name: "Squirtle", hp: "60" });
  state.players[1].bench.cards.push(bobBench);

  for (let i = 0; i < 20; i++) {
    state.players[1].deck.cards.push(makeGameCard({ name: `Bob Deck ${i}` }));
  }
  for (let i = 0; i < 6; i++) {
    state.players[1].prizes.cards.push(makeGameCard({ name: `Bob Prize ${i}` }));
  }

  return state;
}

// ─── Helper: find card in hand by name ───

function findInHand(state: GameState, playerIdx: number, name: string): GameCard {
  const card = state.players[playerIdx].hand.cards.find(c => c.card.name === name);
  if (!card) throw new Error(`Card "${name}" not found in player ${playerIdx} hand`);
  return card;
}

// ───────────────────────────────────────────────
// 1. Basic Pokemon Play
// ───────────────────────────────────────────────

describe("Basic Pokemon Play (via play_card)", () => {
  it("基础宝可梦打到备战区（指定 targetZone=bench）", async () => {
    const state = setupFullHand();
    const charmander = findInHand(state, 0, "Charmander");
    const benchBefore = state.players[0].bench.cards.length;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });

    expect(result.success).toBe(true);
    expect(result.newState.players[0].bench.cards.length).toBe(benchBefore + 1);
    // Should be removed from hand
    expect(result.newState.players[0].hand.cards.find(c => c.instanceId === charmander.instanceId)).toBeUndefined();
  });

  it("基础宝可梦打到空战斗区（指定 targetZone=active）", async () => {
    const state = setupFullHand();
    state.players[0].active = null;
    const charmander = findInHand(state, 0, "Charmander");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "active",
    });

    expect(result.success).toBe(true);
    expect(result.newState.players[0].active).not.toBeNull();
    expect(result.newState.players[0].active!.card.name).toBe("Charmander");
  });

  it("基础宝可梦自动检测：active 为空 → 放到 active", async () => {
    const state = setupFullHand();
    state.players[0].active = null;
    const charmander = findInHand(state, 0, "Charmander");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      // No targetZone specified — auto-detect
    });

    expect(result.success).toBe(true);
    expect(result.newState.players[0].active!.card.name).toBe("Charmander");
  });

  it("基础宝可梦自动检测：active 已有 → 放到 bench", async () => {
    const state = setupFullHand();
    const charmander = findInHand(state, 0, "Charmander");
    const benchBefore = state.players[0].bench.cards.length;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      // No targetZone specified — active exists, so goes to bench
    });

    expect(result.success).toBe(true);
    expect(result.newState.players[0].bench.cards.length).toBe(benchBefore + 1);
  });

  it("备战区已满（5只）时不能放置", async () => {
    const state = setupFullHand();
    // Fill bench to 5
    while (state.players[0].bench.cards.length < 5) {
      state.players[0].bench.cards.push(makeGameCard({ name: `Filler ${state.players[0].bench.cards.length}` }));
    }
    const charmander = findInHand(state, 0, "Charmander");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ───────────────────────────────────────────────
// 2. Energy Attachment
// ───────────────────────────────────────────────

describe("Energy Attachment (via play_card)", () => {
  it("能量卡附加到战斗宝可梦（使用 targetId）", async () => {
    const state = setupFullHand();
    const energy = findInHand(state, 0, "Fire Energy");
    const active = state.players[0].active!;
    const energyBefore = active.attachedEnergy.length;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: energy.instanceId,
      targetId: active.instanceId,
    });

    expect(result.success).toBe(true);
    expect(result.newState.players[0].active!.attachedEnergy.length).toBe(energyBefore + 1);
  });

  it("能量卡附加到备战区宝可梦", async () => {
    const state = setupFullHand();
    const energy = findInHand(state, 0, "Fire Energy");
    const benchPokemon = state.players[0].bench.cards[0]; // Eevee
    const energyBefore = benchPokemon.attachedEnergy.length;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: energy.instanceId,
      targetId: benchPokemon.instanceId,
    });

    expect(result.success).toBe(true);
    expect(result.newState.players[0].bench.cards[0].attachedEnergy.length).toBe(energyBefore + 1);
  });

  it("能量卡使用 targetZone=attach + targetId 也能正确路由", async () => {
    const state = setupFullHand();
    const energy = findInHand(state, 0, "Fire Energy");
    const active = state.players[0].active!;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: energy.instanceId,
      targetZone: "attach",
      targetId: active.instanceId,
    });

    expect(result.success).toBe(true);
  });

  it("能量卡没有 targetId 时报错", async () => {
    const state = setupFullHand();
    const energy = findInHand(state, 0, "Fire Energy");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: energy.instanceId,
      // No targetId
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("目标");
  });

  it("每回合只能附加一次能量", async () => {
    const state = setupFullHand();
    const energy = findInHand(state, 0, "Fire Energy");
    const active = state.players[0].active!;

    // First attachment
    await processAction(state, 0, {
      type: "play_card",
      cardId: energy.instanceId,
      targetId: active.instanceId,
    });

    // Add another energy to hand for second attempt
    const energy2 = makeGameCard({ name: "Water Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].hand.cards.push(energy2);

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: energy2.instanceId,
      targetId: active.instanceId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy(); // "Cannot attach energy" or Chinese equivalent
  });
});

// ───────────────────────────────────────────────
// 3. Supporter Play
// ───────────────────────────────────────────────

describe("Supporter Play (via play_card)", () => {
  it("支持者卡成功打出并进入弃牌堆", async () => {
    const state = setupFullHand();
    const supporter = findInHand(state, 0, "Professor's Research");
    const discardBefore = state.players[0].discard.cards.length;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: supporter.instanceId,
    });

    expect(result.success).toBe(true);
    // Card should be removed from hand
    expect(result.newState.players[0].hand.cards.find(c => c.instanceId === supporter.instanceId)).toBeUndefined();
    // Card should be in discard pile
    expect(result.newState.players[0].discard.cards.length).toBe(discardBefore + 1);
  });

  it("每回合只能使用一张支持者", async () => {
    const state = setupFullHand();
    const supporter = findInHand(state, 0, "Professor's Research");

    // Play first supporter
    await processAction(state, 0, {
      type: "play_card",
      cardId: supporter.instanceId,
    });

    // Add another supporter to hand
    const supporter2 = makeGameCard({
      name: "Boss's Orders",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    state.players[0].hand.cards.push(supporter2);

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: supporter2.instanceId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("一张支持者");
  });

  it("支持者卡不需要 targetId", async () => {
    const state = setupFullHand();
    const supporter = findInHand(state, 0, "Professor's Research");

    // Even with targetId, should still route correctly to supporter handler
    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: supporter.instanceId,
      targetId: "some-random-id",
    });

    // Should succeed (targetId is ignored for supporters)
    expect(result.success).toBe(true);
  });
});

// ───────────────────────────────────────────────
// 4. Item Play (non-Tool)
// ───────────────────────────────────────────────

describe("Item Play (via play_card)", () => {
  it("物品卡成功打出并进入弃牌堆", async () => {
    const state = setupFullHand();
    const item = findInHand(state, 0, "Potion");
    const discardBefore = state.players[0].discard.cards.length;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: item.instanceId,
    });

    expect(result.success).toBe(true);
    // Card removed from hand
    expect(result.newState.players[0].hand.cards.find(c => c.instanceId === item.instanceId)).toBeUndefined();
    // Card in discard
    expect(result.newState.players[0].discard.cards.length).toBe(discardBefore + 1);
  });

  it("物品卡不受每回合一次限制（可多次使用）", async () => {
    const state = setupFullHand();
    const item = findInHand(state, 0, "Potion");

    // Play first item
    const result1 = await processAction(state, 0, {
      type: "play_card",
      cardId: item.instanceId,
    });
    expect(result1.success).toBe(true);

    // Add another item to hand
    const item2 = makeGameCard({
      name: "Super Potion",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(item2);

    const result2 = await processAction(state, 0, {
      type: "play_card",
      cardId: item2.instanceId,
    });
    expect(result2.success).toBe(true);
  });
});

// ───────────────────────────────────────────────
// 5. Pokemon Tool Attachment
// ───────────────────────────────────────────────

describe("Pokemon Tool Attachment (via play_card)", () => {
  it("工具卡装备到战斗宝可梦", async () => {
    const state = setupFullHand();
    const tool = findInHand(state, 0, "Choice Belt");
    const active = state.players[0].active!;
    const toolsBefore = active.attachedTools.length;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: tool.instanceId,
      targetId: active.instanceId,
    });

    expect(result.success).toBe(true);
    expect(result.newState.players[0].active!.attachedTools.length).toBe(toolsBefore + 1);
    // Card removed from hand
    expect(result.newState.players[0].hand.cards.find(c => c.instanceId === tool.instanceId)).toBeUndefined();
  });

  it("工具卡装备到备战区宝可梦", async () => {
    const state = setupFullHand();
    const tool = findInHand(state, 0, "Choice Belt");
    const benchPokemon = state.players[0].bench.cards[0]; // Eevee

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: tool.instanceId,
      targetId: benchPokemon.instanceId,
    });

    expect(result.success).toBe(true);
    expect(result.newState.players[0].bench.cards[0].attachedTools.length).toBe(1);
  });

  it("工具卡没有 targetId 时报错", async () => {
    const state = setupFullHand();
    const tool = findInHand(state, 0, "Choice Belt");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: tool.instanceId,
      // No targetId
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("目标");
  });

  it("工具卡使用 targetZone=attach 也能正确路由（不走能量路径）", async () => {
    const state = setupFullHand();
    const tool = findInHand(state, 0, "Choice Belt");
    const active = state.players[0].active!;

    // This was the broken path before Session 11b fix!
    // Previously, targetZone="attach" would route to gaAttachEnergy
    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: tool.instanceId,
      targetZone: "attach",
      targetId: active.instanceId,
    });

    expect(result.success).toBe(true);
    // Should be attached as tool, NOT as energy
    expect(result.newState.players[0].active!.attachedTools.length).toBe(1);
    // Energy count should NOT have changed
    expect(result.newState.players[0].active!.attachedEnergy.length).toBe(0);
  });

  it("已有工具的宝可梦不能再装备", async () => {
    const state = setupFullHand();
    const tool = findInHand(state, 0, "Choice Belt");
    const active = state.players[0].active!;

    // Pre-attach a tool
    active.attachedTools.push(makeGameCard({
      name: "Existing Tool",
      supertype: "Trainer",
      subtypes: ["Item", "Pokémon Tool"],
    }));

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: tool.instanceId,
      targetId: active.instanceId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("工具");
  });
});

// ───────────────────────────────────────────────
// 6. Evolution (Stage 1/2 via play_card)
// ───────────────────────────────────────────────

describe("Evolution (via play_card)", () => {
  it("Stage 1 进化卡成功进化场上宝可梦", async () => {
    const state = setupFullHand();
    // First, place Charmander on bench so it's a valid evolution target
    const charmander = findInHand(state, 0, "Charmander");
    await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });

    // Charmander was just played this turn, so mark it as not played this turn to allow evolution
    const benchCharmander = state.players[0].bench.cards.find(c => c.card.name === "Charmander")!;
    benchCharmander.playedThisTurn = false;

    const charmeleon = findInHand(state, 0, "Charmeleon");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmeleon.instanceId,
      targetId: benchCharmander.instanceId,
    });

    expect(result.success).toBe(true);
    // The bench Pokemon should now be Charmeleon
    const evolvedPokemon = result.newState.players[0].bench.cards.find(
      c => c.instanceId === benchCharmander.instanceId
    );
    expect(evolvedPokemon!.card.name).toBe("Charmeleon");
  });

  it("进化卡没有 targetId 时报错", async () => {
    const state = setupFullHand();
    const charmeleon = findInHand(state, 0, "Charmeleon");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmeleon.instanceId,
      // No targetId
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("目标");
  });

  it("不能进化本回合刚入场的宝可梦", async () => {
    const state = setupFullHand();
    // Place Charmander on bench (playedThisTurn will be true)
    const charmander = findInHand(state, 0, "Charmander");
    await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });

    const benchCharmander = state.players[0].bench.cards.find(c => c.card.name === "Charmander")!;
    // playedThisTurn should be true
    expect(benchCharmander.playedThisTurn).toBe(true);

    const charmeleon = findInHand(state, 0, "Charmeleon");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmeleon.instanceId,
      targetId: benchCharmander.instanceId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("本回合");
  });

  it("进化链不匹配时报错", async () => {
    const state = setupFullHand();
    const charmeleon = findInHand(state, 0, "Charmeleon"); // evolvesFrom: Charmander
    const eevee = state.players[0].bench.cards[0]; // Eevee ≠ Charmander
    eevee.playedThisTurn = false;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmeleon.instanceId,
      targetId: eevee.instanceId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("不能从");
  });
});

// ───────────────────────────────────────────────
// 7. Error Cases
// ───────────────────────────────────────────────

describe("Play Card Error Cases", () => {
  it("非主阶段不能打出任何卡", async () => {
    const state = setupFullHand();
    state.phase = "draw";
    const charmander = findInHand(state, 0, "Charmander");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("主阶段");
  });

  it("对方回合不能打出卡牌", async () => {
    const state = setupFullHand();
    state.currentPlayer = 1; // Bob's turn

    // Alice tries to play a card
    const charmander = findInHand(state, 0, "Charmander");
    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("不是你的回合");
  });

  it("缺少 cardId 时报错", async () => {
    const state = setupFullHand();

    const result = await processAction(state, 0, {
      type: "play_card",
      // No cardId
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("卡牌 ID");
  });

  it("手牌中不存在的 cardId 报错", async () => {
    const state = setupFullHand();

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: "nonexistent-id",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("找不到");
  });

  it("游戏结束后不能打出卡牌", async () => {
    const state = setupFullHand();
    state.phase = "game_over";
    const charmander = findInHand(state, 0, "Charmander");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("结束");
  });
});

// ───────────────────────────────────────────────
// 8. Multi-Step Turn Flows
// ───────────────────────────────────────────────

describe("Multi-Step Turn Flows", () => {
  it("同一回合内：附加能量 → 使用物品 → 放置宝可梦", async () => {
    const state = setupFullHand();
    const active = state.players[0].active!;

    // Step 1: Attach energy
    const energy = findInHand(state, 0, "Fire Energy");
    const res1 = await processAction(state, 0, {
      type: "play_card",
      cardId: energy.instanceId,
      targetId: active.instanceId,
    });
    expect(res1.success).toBe(true);

    // Step 2: Play item
    const item = findInHand(state, 0, "Potion");
    const res2 = await processAction(state, 0, {
      type: "play_card",
      cardId: item.instanceId,
    });
    expect(res2.success).toBe(true);

    // Step 3: Play basic to bench
    const charmander = findInHand(state, 0, "Charmander");
    const res3 = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "bench",
    });
    expect(res3.success).toBe(true);

    // Verify final state
    expect(state.players[0].bench.cards.length).toBe(3); // 2 original + Charmander
    expect(state.players[0].active!.attachedEnergy.length).toBe(1);
    expect(state.players[0].discard.cards.length).toBe(1); // Potion
  });

  it("同一回合内：支持者 → 工具 → 结束回合", async () => {
    const state = setupFullHand();
    const active = state.players[0].active!;

    // Step 1: Play supporter
    const supporter = findInHand(state, 0, "Professor's Research");
    const res1 = await processAction(state, 0, {
      type: "play_card",
      cardId: supporter.instanceId,
    });
    expect(res1.success).toBe(true);

    // Step 2: Attach tool to active
    const tool = findInHand(state, 0, "Choice Belt");
    const res2 = await processAction(state, 0, {
      type: "play_card",
      cardId: tool.instanceId,
      targetId: active.instanceId,
    });
    expect(res2.success).toBe(true);

    // Step 3: End turn
    const res3 = await processAction(state, 0, { type: "end_turn" });
    expect(res3.success).toBe(true);
    expect(res3.newState.currentPlayer).toBe(1); // Bob's turn now

    // Verify tool persists after turn end
    expect(state.players[0].active!.attachedTools.length).toBe(1);
    expect(state.players[0].active!.attachedTools[0].card.name).toBe("Choice Belt");
  });

  it("完整回合流程：放置宝可梦 → 附加能量 → 打工具 → 使用支持者 → 结束", async () => {
    const state = setupFullHand();

    // Place basic pokemon
    const charmander = findInHand(state, 0, "Charmander");
    expect((await processAction(state, 0, {
      type: "play_card", cardId: charmander.instanceId, targetZone: "bench",
    })).success).toBe(true);

    // Attach energy to active
    const energy = findInHand(state, 0, "Fire Energy");
    expect((await processAction(state, 0, {
      type: "play_card", cardId: energy.instanceId, targetId: state.players[0].active!.instanceId,
    })).success).toBe(true);

    // Equip tool to active
    const tool = findInHand(state, 0, "Choice Belt");
    expect((await processAction(state, 0, {
      type: "play_card", cardId: tool.instanceId, targetId: state.players[0].active!.instanceId,
    })).success).toBe(true);

    // Play supporter
    const supporter = findInHand(state, 0, "Professor's Research");
    expect((await processAction(state, 0, {
      type: "play_card", cardId: supporter.instanceId,
    })).success).toBe(true);

    // Play item
    const item = findInHand(state, 0, "Potion");
    expect((await processAction(state, 0, {
      type: "play_card", cardId: item.instanceId,
    })).success).toBe(true);

    // Only evolution card should remain in hand (Charmeleon, can't play without target)
    const handNames = state.players[0].hand.cards.map(c => c.card.name);
    expect(handNames).toContain("Charmeleon");
    expect(state.players[0].hand.cards.length).toBe(1);

    // End turn
    expect((await processAction(state, 0, { type: "end_turn" })).success).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });
});

// ───────────────────────────────────────────────
// 9. Cross-type Routing Regression
// ───────────────────────────────────────────────

describe("Card Type Routing Regression Tests", () => {
  it("Trainer/Tool 使用 targetZone=attach 不会走能量路径", async () => {
    // This is THE regression test for the Session 11b fix
    const state = setupFullHand();
    const tool = findInHand(state, 0, "Choice Belt");
    const active = state.players[0].active!;
    const energyBefore = active.attachedEnergy.length;
    const toolsBefore = active.attachedTools.length;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: tool.instanceId,
      targetZone: "attach",
      targetId: active.instanceId,
    });

    expect(result.success).toBe(true);
    // Tool count incremented, energy count unchanged
    expect(state.players[0].active!.attachedTools.length).toBe(toolsBefore + 1);
    expect(state.players[0].active!.attachedEnergy.length).toBe(energyBefore);
  });

  it("Energy 使用 targetZone=attach 仍然正确附加", async () => {
    const state = setupFullHand();
    const energy = findInHand(state, 0, "Fire Energy");
    const active = state.players[0].active!;

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: energy.instanceId,
      targetZone: "attach",
      targetId: active.instanceId,
    });

    expect(result.success).toBe(true);
    expect(state.players[0].active!.attachedEnergy.length).toBe(1);
  });

  it("Supporter 即使有 targetZone 也走支持者路径", async () => {
    const state = setupFullHand();
    const supporter = findInHand(state, 0, "Professor's Research");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: supporter.instanceId,
      targetZone: "attach", // Wrong targetZone, should still route correctly
      targetId: state.players[0].active!.instanceId,
    });

    // Should succeed via supporter path
    expect(result.success).toBe(true);
    expect(state.players[0].supporterUsedThisTurn).toBe(true);
  });

  it("Item 即使有 targetZone 也走物品路径", async () => {
    const state = setupFullHand();
    const item = findInHand(state, 0, "Potion");

    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: item.instanceId,
      targetZone: "bench", // Wrong targetZone, should still route correctly
    });

    expect(result.success).toBe(true);
    expect(state.players[0].discard.cards.find(c => c.card.name === "Potion")).toBeTruthy();
  });

  it("Basic Pokemon 使用 targetZone=attach 不会报错，走自动检测", async () => {
    const state = setupFullHand();
    const charmander = findInHand(state, 0, "Charmander");

    // Even with a weird targetZone, basic Pokemon routing should work
    const result = await processAction(state, 0, {
      type: "play_card",
      cardId: charmander.instanceId,
      targetZone: "attach", // Wrong, but should still auto-detect as bench
    });

    // The handler checks "active" and "bench" targetZone first,
    // then falls to auto-detect, which should succeed
    expect(result.success).toBe(true);
    expect(state.players[0].bench.cards.length).toBe(3); // Auto-detect → bench
  });
});
