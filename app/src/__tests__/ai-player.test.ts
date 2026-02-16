/**
 * Tests for AI Player Decision Engine
 *
 * Tests:
 * 1. computeAIAction - main entry point decisions
 * 2. Basic Pokemon play (to active, to bench)
 * 3. Evolution decisions
 * 4. Energy attachment strategy
 * 5. Attack selection (best damage)
 * 6. Retreat when active is low HP
 * 7. Promotion after KO (highest HP bench)
 * 8. Game-over / not-my-turn handling
 * 9. computeAITurnActions - full turn plan
 * 10. End turn fallback
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
} from "@/engine/game-state";
import { computeAIAction, computeAITurnActions, AIDecision } from "@/engine/ai-player";
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
 * Sets up a game state in main phase where player `playerIndex` is the current player.
 * Both players have active Pokemon and some bench/deck cards.
 */
function setupAIGame(aiIndex: 0 | 1 = 1): GameState {
  resetInstanceCounter();
  const state = createGameState("Human", "AI Bot");
  state.phase = "main";
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = aiIndex;

  // Human (Player 0)
  const humanActive = makeGameCard({
    name: "Pikachu",
    hp: "60",
    types: ["Lightning"],
    attacks: [
      { name: "Thunderbolt", damage: "60", cost: ["Lightning", "Lightning"], text: "", convertedEnergyCost: 2 },
    ],
  });
  state.players[0].active = humanActive;

  // Deck (need cards so draw doesn't fail)
  for (let i = 0; i < 10; i++) {
    state.players[0].deck.cards.push(makeGameCard({ name: `Filler ${i}`, hp: "40" }));
    state.players[1].deck.cards.push(makeGameCard({ name: `AI Filler ${i}`, hp: "40" }));
  }

  // AI (Player 1)
  const aiActive = makeGameCard({
    name: "Charmander",
    hp: "70",
    types: ["Fire"],
    attacks: [
      { name: "Ember", damage: "30", cost: ["Fire"], text: "", convertedEnergyCost: 1 },
      { name: "Fire Spin", damage: "100", cost: ["Fire", "Fire", "Fire"], text: "", convertedEnergyCost: 3 },
    ],
  });
  state.players[1].active = aiActive;

  return state;
}

// ─── computeAIAction: Game Over / Not My Turn ───

describe("AI Player - Game Over & Turn Checks", () => {
  it("game_over 时返回 null", () => {
    const state = setupAIGame(1);
    state.phase = "game_over";

    const result = computeAIAction(state, 1);
    expect(result).toBeNull();
  });

  it("不是我的回合且不需要 promote 时返回 null", () => {
    const state = setupAIGame(1);
    state.currentPlayer = 0; // Not AI's turn

    const result = computeAIAction(state, 1);
    expect(result).toBeNull();
  });

  it("不是主阶段时返回 null", () => {
    const state = setupAIGame(1);
    state.phase = "draw";

    const result = computeAIAction(state, 1);
    expect(result).toBeNull();
  });
});

// ─── Priority 2 & 3: Play Basic Pokemon ───

describe("AI Player - Play Basic Pokemon", () => {
  it("手里有 Basic 且场上无 active 时，打出到 active", () => {
    const state = setupAIGame(1);
    state.players[1].active = null;

    const basic = makeGameCard({ name: "Magikarp", hp: "30", subtypes: ["Basic"] });
    state.players[1].hand.cards.push(basic);

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("play_card");
    expect((result!.action as any).targetZone).toBe("active");
    expect((result!.action as any).cardId).toBe(basic.instanceId);
  });

  it("备战区未满时将 Basic 打出到 bench", () => {
    const state = setupAIGame(1);
    // AI already has active, bench is empty

    const basic1 = makeGameCard({ name: "Magikarp", hp: "30", subtypes: ["Basic"] });
    const basic2 = makeGameCard({ name: "Geodude", hp: "60", subtypes: ["Basic"] });
    state.players[1].hand.cards.push(basic1, basic2);

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("play_card");
    expect((result!.action as any).targetZone).toBe("bench");
  });

  it("优先打出低 HP 的 Basic 到 bench（保留高 HP 的）", () => {
    const state = setupAIGame(1);

    const lowHp = makeGameCard({ name: "Magikarp", hp: "30", subtypes: ["Basic"] });
    const highHp = makeGameCard({ name: "Snorlax", hp: "120", subtypes: ["Basic"] });
    state.players[1].hand.cards.push(highHp, lowHp);

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    // Should play the lower HP card first
    expect((result!.action as any).cardId).toBe(lowHp.instanceId);
  });

  it("bench 已满(5个) 时不打出 Basic", () => {
    const state = setupAIGame(1);

    // Fill bench with 5 Pokemon
    for (let i = 0; i < 5; i++) {
      state.players[1].bench.cards.push(
        makeGameCard({ name: `Bench Mon ${i}`, hp: "50" })
      );
    }

    const basic = makeGameCard({ name: "Magikarp", hp: "30", subtypes: ["Basic"] });
    state.players[1].hand.cards.push(basic);

    const result = computeAIAction(state, 1);
    // Should NOT be play_card to bench (no room), should be something else (energy/attack/end)
    if (result) {
      if (result.action.type === "play_card") {
        expect((result.action as any).targetZone).not.toBe("bench");
      }
    }
  });
});

// ─── Priority 4: Evolution ───

describe("AI Player - Evolution", () => {
  it("可以进化时进化当前场上的宝可梦", () => {
    const state = setupAIGame(1);

    // AI has a Charmander active (set by setupAIGame)
    // Put a Charmeleon (Stage 1 that evolves from Charmander) in hand
    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
      attacks: [
        { name: "Flame Burst", damage: "50", cost: ["Fire"], text: "", convertedEnergyCost: 1 },
      ],
    });
    state.players[1].hand.cards.push(charmeleon);

    // Active Charmander must not have been played this turn
    state.players[1].active!.playedThisTurn = false;

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("evolve");
    expect((result!.action as any).cardId).toBe(charmeleon.instanceId);
    expect((result!.action as any).targetId).toBe(state.players[1].active!.instanceId);
  });

  it("第一回合不进化", () => {
    const state = setupAIGame(1);
    state.isFirstTurn = true;

    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    state.players[1].hand.cards.push(charmeleon);
    state.players[1].active!.playedThisTurn = false;

    const result = computeAIAction(state, 1);
    // Should not be evolve (first turn)
    if (result && result.action.type === "evolve") {
      fail("AI should not evolve on first turn");
    }
  });

  it("本回合打出的宝可梦不能进化", () => {
    const state = setupAIGame(1);

    const charmeleon = makeGameCard({
      name: "Charmeleon",
      hp: "90",
      subtypes: ["Stage 1"],
      evolvesFrom: "Charmander",
    });
    state.players[1].hand.cards.push(charmeleon);

    // Mark active as played this turn (can't evolve)
    state.players[1].active!.playedThisTurn = true;

    const result = computeAIAction(state, 1);
    // Should NOT evolve
    if (result && result.action.type === "evolve") {
      fail("AI should not evolve a Pokemon that was played this turn");
    }
  });
});

// ─── Priority 5: Energy Attachment ───

describe("AI Player - Energy Attachment", () => {
  it("手里有能量卡时附加到 active 宝可梦", () => {
    const state = setupAIGame(1);
    state.players[1].energyAttachedThisTurn = false;

    const energy = makeGameCard({
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    state.players[1].hand.cards.push(energy);

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("play_card");
    expect((result!.action as any).targetZone).toBe("attach");
    expect((result!.action as any).targetId).toBe(state.players[1].active!.instanceId);
  });

  it("本回合已经附加过能量时不再附加", () => {
    const state = setupAIGame(1);
    state.players[1].energyAttachedThisTurn = true;

    const energy = makeGameCard({
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    state.players[1].hand.cards.push(energy);

    const result = computeAIAction(state, 1);
    // Should not be energy attachment (already attached this turn)
    if (result && result.action.type === "play_card") {
      expect((result!.action as any).targetZone).not.toBe("attach");
    }
  });

  it("active 宝可梦优先获得能量", () => {
    const state = setupAIGame(1);
    state.players[1].energyAttachedThisTurn = false;

    // Add bench Pokemon
    const benchMon = makeGameCard({
      name: "Geodude",
      hp: "60",
      attacks: [
        { name: "Tackle", damage: "20", cost: ["Fighting"], text: "", convertedEnergyCost: 1 },
      ],
    });
    state.players[1].bench.cards.push(benchMon);

    const energy = makeGameCard({
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    state.players[1].hand.cards.push(energy);

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("play_card");
    expect((result!.action as any).targetZone).toBe("attach");
    // Should attach to active (priority +100)
    expect((result!.action as any).targetId).toBe(state.players[1].active!.instanceId);
  });
});

// ─── Priority 7: Attack Selection ───

describe("AI Player - Attack Selection", () => {
  it("选择可用的最高伤害攻击", () => {
    const state = setupAIGame(1);

    // Give AI enough energy for Ember (1 Fire) but not Fire Spin (3 Fire)
    const energy = makeGameCard({
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    state.players[1].active!.attachedEnergy.push(energy);

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("attack");
    expect((result!.action as any).attackName).toBe("Ember");
  });

  it("能量足够时选择更高伤害的攻击", () => {
    const state = setupAIGame(1);

    // Give AI 3 Fire Energy for Fire Spin
    for (let i = 0; i < 3; i++) {
      const energy = makeGameCard({
        name: `Fire Energy ${i}`,
        supertype: "Energy",
        subtypes: ["Basic"],
      });
      state.players[1].active!.attachedEnergy.push(energy);
    }

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("attack");
    expect((result!.action as any).attackName).toBe("Fire Spin");
  });

  it("没有足够能量时不攻击（结束回合）", () => {
    const state = setupAIGame(1);
    // No energy attached, no hand cards → should end turn

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("end_turn");
  });
});

// ─── Priority 6: Retreat ───

describe("AI Player - Retreat", () => {
  it("active HP 低于 30% 且 bench 有更健康的宝可梦时撤退", () => {
    const state = setupAIGame(1);

    // Set active to very low HP
    const active = state.players[1].active!;
    const maxHp = parseInt(active.card.hp || "0", 10);
    // Set damage so remaining HP is < 30% of max
    active.damageCounters = Math.ceil(maxHp * 0.8 / 10); // 80% damaged

    // Give active retreat cost 0 (or enough energy)
    active.card.convertedRetreatCost = 0;

    // Add a healthy bench Pokemon
    const healthyBench = makeGameCard({
      name: "Snorlax",
      hp: "120",
      attacks: [
        { name: "Body Slam", damage: "60", cost: ["Colorless", "Colorless"], text: "", convertedEnergyCost: 2 },
      ],
    });
    state.players[1].bench.cards.push(healthyBench);

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("retreat");
    expect((result!.action as any).benchInstanceId).toBe(healthyBench.instanceId);
  });

  it("HP 充足时不撤退", () => {
    const state = setupAIGame(1);

    // Active is full HP
    state.players[1].active!.damageCounters = 0;
    state.players[1].active!.card.convertedRetreatCost = 0;

    const benchMon = makeGameCard({ name: "Snorlax", hp: "120" });
    state.players[1].bench.cards.push(benchMon);

    const result = computeAIAction(state, 1);
    // Should NOT retreat (HP is fine)
    if (result) {
      expect(result.action.type).not.toBe("retreat");
    }
  });

  it("撤退费用不足时不撤退", () => {
    const state = setupAIGame(1);
    const active = state.players[1].active!;

    // Low HP
    const maxHp = parseInt(active.card.hp || "0", 10);
    active.damageCounters = Math.ceil(maxHp * 0.8 / 10);

    // Retreat cost 3, but no energy attached
    active.card.convertedRetreatCost = 3;
    active.attachedEnergy = [];

    const benchMon = makeGameCard({ name: "Snorlax", hp: "120" });
    state.players[1].bench.cards.push(benchMon);

    const result = computeAIAction(state, 1);
    // Can't afford retreat, so should not retreat
    if (result) {
      expect(result.action.type).not.toBe("retreat");
    }
  });

  it("bench 无宝可梦时不撤退", () => {
    const state = setupAIGame(1);
    const active = state.players[1].active!;

    const maxHp = parseInt(active.card.hp || "0", 10);
    active.damageCounters = Math.ceil(maxHp * 0.8 / 10);
    active.card.convertedRetreatCost = 0;

    // No bench
    state.players[1].bench.cards = [];

    const result = computeAIAction(state, 1);
    if (result) {
      expect(result.action.type).not.toBe("retreat");
    }
  });
});

// ─── Promotion after KO ───

describe("AI Player - Promotion", () => {
  it("active 被击倒后选择 HP 最高的 bench 宝可梦上场", () => {
    const state = setupAIGame(1);

    // AI has no active (KO'd)
    state.players[1].active = null;
    state.currentPlayer = 0; // Not AI's turn, but needs to promote

    // Multiple bench options
    const low = makeGameCard({ name: "Magikarp", hp: "30" });
    const high = makeGameCard({ name: "Snorlax", hp: "120" });
    const mid = makeGameCard({ name: "Geodude", hp: "60" });
    state.players[1].bench.cards.push(low, high, mid);

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("promote");
    // Should pick the highest HP
    expect((result!.action as any).benchInstanceId).toBe(high.instanceId);
  });

  it("考虑剩余 HP（有伤的宝可梦排名靠后）", () => {
    const state = setupAIGame(1);
    state.players[1].active = null;
    state.currentPlayer = 0;

    const damagedHigh = makeGameCard({ name: "Snorlax", hp: "120" });
    damagedHigh.damageCounters = 10; // 20 remaining HP

    const healthyMid = makeGameCard({ name: "Geodude", hp: "60" });
    healthyMid.damageCounters = 0; // 60 remaining HP

    state.players[1].bench.cards.push(damagedHigh, healthyMid);

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("promote");
    // Geodude has 60 remaining HP vs Snorlax's 20, should pick Geodude
    expect((result!.action as any).benchInstanceId).toBe(healthyMid.instanceId);
  });
});

// ─── End Turn Fallback ───

describe("AI Player - End Turn", () => {
  it("无任何有效操作时结束回合", () => {
    const state = setupAIGame(1);

    // No hand cards, no energy for attacks, bench full, etc.
    state.players[1].hand.cards = [];
    state.players[1].active!.attachedEnergy = [];
    state.players[1].energyAttachedThisTurn = true;

    // bench is full
    for (let i = 0; i < 5; i++) {
      state.players[1].bench.cards.push(
        makeGameCard({ name: `Mon ${i}`, hp: "50" })
      );
    }

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("end_turn");
  });
});

// ─── computeAITurnActions: Full Turn Planning ───

describe("AI Player - computeAITurnActions", () => {
  it("返回一个完整回合的行动列表", () => {
    const state = setupAIGame(1);
    state.players[1].energyAttachedThisTurn = false;

    // Give AI some hand cards
    const basic1 = makeGameCard({ name: "Geodude", hp: "60", subtypes: ["Basic"] });
    const energy = makeGameCard({
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });
    state.players[1].hand.cards.push(basic1, energy);

    const actions = computeAITurnActions(state, 1);
    expect(actions.length).toBeGreaterThan(0);

    // Should include: play basic to bench, attach energy, and attack or end turn
    const types = actions.map((a) => a.action.type);
    expect(types).toContain("play_card");
  });

  it("不是自己回合时返回空列表", () => {
    const state = setupAIGame(1);
    state.currentPlayer = 0;

    const actions = computeAITurnActions(state, 1);
    expect(actions).toHaveLength(0);
  });

  it("非 main 阶段返回空列表", () => {
    const state = setupAIGame(1);
    state.phase = "draw";

    const actions = computeAITurnActions(state, 1);
    expect(actions).toHaveLength(0);
  });

  it("最后总是以攻击或结束回合结尾", () => {
    const state = setupAIGame(1);
    state.players[1].hand.cards = [];
    state.players[1].energyAttachedThisTurn = true;

    const actions = computeAITurnActions(state, 1);
    expect(actions.length).toBeGreaterThan(0);

    const lastAction = actions[actions.length - 1];
    expect(["attack", "end_turn"]).toContain(lastAction.action.type);
  });

  it("多个 Basic 在手时批量打出到 bench", () => {
    const state = setupAIGame(1);

    const basic1 = makeGameCard({ name: "Magikarp", hp: "30", subtypes: ["Basic"] });
    const basic2 = makeGameCard({ name: "Geodude", hp: "60", subtypes: ["Basic"] });
    const basic3 = makeGameCard({ name: "Eevee", hp: "50", subtypes: ["Basic"] });
    state.players[1].hand.cards.push(basic1, basic2, basic3);

    const actions = computeAITurnActions(state, 1);

    // Count play_card bench actions
    const benchPlays = actions.filter(
      (a) => a.action.type === "play_card" && (a.action as any).targetZone === "bench"
    );
    expect(benchPlays.length).toBe(3);
  });

  it("bench 只剩 2 个空位时最多打 2 个 Basic", () => {
    const state = setupAIGame(1);

    // Fill 3 bench spots
    for (let i = 0; i < 3; i++) {
      state.players[1].bench.cards.push(
        makeGameCard({ name: `Bench ${i}`, hp: "50" })
      );
    }

    const basic1 = makeGameCard({ name: "Magikarp", hp: "30", subtypes: ["Basic"] });
    const basic2 = makeGameCard({ name: "Geodude", hp: "60", subtypes: ["Basic"] });
    const basic3 = makeGameCard({ name: "Eevee", hp: "50", subtypes: ["Basic"] });
    state.players[1].hand.cards.push(basic1, basic2, basic3);

    const actions = computeAITurnActions(state, 1);

    const benchPlays = actions.filter(
      (a) => a.action.type === "play_card" && (a.action as any).targetZone === "bench"
    );
    expect(benchPlays.length).toBe(2); // Only 2 slots available
  });
});

// ─── AIDecision has reason string ───

describe("AI Player - Decision Reasons", () => {
  it("每个决策都包含理由说明", () => {
    const state = setupAIGame(1);
    state.players[1].hand.cards = [];
    state.players[1].energyAttachedThisTurn = true;

    const result = computeAIAction(state, 1);
    expect(result).not.toBeNull();
    expect(result!.reason).toBeDefined();
    expect(typeof result!.reason).toBe("string");
    expect(result!.reason.length).toBeGreaterThan(0);
  });

  it("computeAITurnActions 中每个行动都有理由", () => {
    const state = setupAIGame(1);

    const basic = makeGameCard({ name: "Geodude", hp: "60", subtypes: ["Basic"] });
    state.players[1].hand.cards.push(basic);

    const actions = computeAITurnActions(state, 1);
    for (const action of actions) {
      expect(action.reason).toBeDefined();
      expect(typeof action.reason).toBe("string");
      expect(action.reason.length).toBeGreaterThan(0);
    }
  });
});

// ─── AI as Player 0 (verifies playerIndex parameter works) ───

describe("AI Player - Player Index Independence", () => {
  it("AI 作为 Player 0 也能正常决策", () => {
    const state = setupAIGame(1);
    // Switch: AI is player 0 now
    state.currentPlayer = 0;

    // Give player 0 an active with energy and attack
    const active = state.players[0].active!;
    active.card.attacks = [
      { name: "Quick Attack", damage: "20", cost: [], text: "", convertedEnergyCost: 0 },
    ];

    const result = computeAIAction(state, 0);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe("attack");
    expect((result!.action as any).attackName).toBe("Quick Attack");
  });
});
