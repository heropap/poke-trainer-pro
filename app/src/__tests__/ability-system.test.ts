/**
 * Ability System Tests
 *
 * Tests for the complete ability/trait system:
 * - ABILITY_BLOCKED marker check in handleUseAbility
 * - Passive abilities in attack pipeline (modifyDamage, modifyIncomingDamage)
 * - Passive abilities in retreat (modifyRetreatCost)
 * - On-enter ability auto-trigger
 * - AI player ability usage
 */

import { createGameState, GameCard, GameState, resetInstanceCounter } from "@/engine/game-state";
import { processAction } from "@/engine/game-controller";
import { registerEffect, clearRegistry } from "@/engine/effects/effect-registry";
import { ABILITY_BLOCKED } from "@/engine/effects/markers";
import { resolveAttack } from "@/engine/systems/attack-system";
import { playBasicToBench } from "@/engine/turn-actions";
import { computeAIAction } from "@/engine/ai-player";

// ─── Test Helpers ───────────────────────────────

let cardCounter = 0;

function makeGameCard(overrides: Partial<GameCard["card"]> = {}): GameCard {
  cardCounter++;
  const cardId = overrides.id || `test-card-${cardCounter}`;
  return {
    instanceId: `inst-${cardCounter}`,
    cardId,
    card: {
      id: cardId,
      name: overrides.name || `TestMon${cardCounter}`,
      supertype: "Pokémon",
      subtypes: overrides.subtypes || ["Basic"],
      hp: overrides.hp || "100",
      types: overrides.types || ["Fire"],
      attacks: overrides.attacks || [
        { name: "Tackle", cost: ["Colorless"], convertedEnergyCost: 1, damage: "30", text: "" },
      ],
      abilities: overrides.abilities || undefined,
      weaknesses: overrides.weaknesses || [],
      resistances: overrides.resistances || [],
      retreatCost: overrides.retreatCost || [],
      convertedRetreatCost: overrides.convertedRetreatCost ?? 0,
      set: { id: "test", name: "Test" },
      number: "1",
      artist: "test",
      rarity: "Common",
      images: { small: "", large: "" },
      legalities: {},
      evolvesFrom: overrides.evolvesFrom,
      rules: overrides.rules || [],
    } as any,
    damageCounters: 0,
    attachedEnergy: [],
    attachedTools: [],
    statusConditions: [],
    playedThisTurn: false,
    evolvedThisTurn: false,
    abilityUsedThisTurn: false,
    markers: {} as Record<string, number>,
    evolutionStack: [],
  };
}

function makeEnergyCard(type: string = "Fire"): GameCard {
  cardCounter++;
  return {
    instanceId: `energy-${cardCounter}`,
    cardId: `energy-${type.toLowerCase()}-${cardCounter}`,
    card: {
      id: `energy-${type.toLowerCase()}-${cardCounter}`,
      name: `${type} Energy`,
      supertype: "Energy",
      subtypes: ["Basic"],
      hp: "",
      types: [type],
      attacks: [],
      weaknesses: [],
      resistances: [],
      retreatCost: [],
      convertedRetreatCost: 0,
      set: { id: "test", name: "Test" },
      number: "1",
      artist: "test",
      rarity: "Common",
      images: { small: "", large: "" },
      legalities: {},
      rules: [],
    } as any,
    damageCounters: 0,
    attachedEnergy: [],
    attachedTools: [],
    statusConditions: [],
    playedThisTurn: false,
    evolvedThisTurn: false,
    abilityUsedThisTurn: false,
    markers: {} as Record<string, number>,
    evolutionStack: [],
  };
}

function setupGame(): GameState {
  const state = createGameState();
  state.phase = "main";
  state.currentPlayer = 0;
  state.turn = 2;
  state.isFirstTurn = false;

  // Player 0: active + bench + hand + deck + prizes
  state.players[0].active = makeGameCard({ name: "Charizard", hp: "150" });
  state.players[0].bench.cards = [makeGameCard({ name: "Pikachu", hp: "70" })];
  state.players[0].hand.cards = [
    makeGameCard({ name: "Bulbasaur", hp: "60", subtypes: ["Basic"] }),
    makeEnergyCard("Fire"),
  ];
  state.players[0].deck.cards = Array.from({ length: 10 }, () => makeGameCard());
  state.players[0].prizes.cards = Array.from({ length: 6 }, () => makeGameCard());

  // Player 1: active + deck + prizes
  state.players[1].active = makeGameCard({ name: "Blastoise", hp: "140" });
  state.players[1].bench.cards = [makeGameCard({ name: "Squirtle", hp: "60" })];
  state.players[1].deck.cards = Array.from({ length: 10 }, () => makeGameCard());
  state.players[1].prizes.cards = Array.from({ length: 6 }, () => makeGameCard());

  return state;
}

beforeEach(() => {
  clearRegistry();
  resetInstanceCounter();
  cardCounter = 0;
});

// ═══════════════════════════════════════════════
// 1. ABILITY_BLOCKED Check
// ═══════════════════════════════════════════════

describe("ABILITY_BLOCKED marker check", () => {
  it("被封锁的宝可梦不能使用特性", async () => {
    const state = setupGame();
    const active = state.players[0].active!;
    active.card.abilities = [
      { name: "Energy Transfer", text: "Move energy", type: "Ability" },
    ];
    active.markers[ABILITY_BLOCKED] = 1;

    registerEffect({
      cardId: active.cardId,
      abilities: [{
        name: "Energy Transfer",
        type: "activated",
        onActivate: () => {},
      }],
    });

    const result = await processAction(state, 0, {
      type: "use_ability",
      cardId: active.instanceId,
      abilityName: "Energy Transfer",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("封锁");
  });

  it("未被封锁的宝可梦可以正常使用特性", async () => {
    const state = setupGame();
    const active = state.players[0].active!;
    active.card.abilities = [
      { name: "Energy Transfer", text: "Move energy", type: "Ability" },
    ];

    let executed = false;
    registerEffect({
      cardId: active.cardId,
      abilities: [{
        name: "Energy Transfer",
        type: "activated",
        onActivate: () => { executed = true; },
      }],
    });

    const result = await processAction(state, 0, {
      type: "use_ability",
      cardId: active.instanceId,
      abilityName: "Energy Transfer",
    });

    expect(result.success).toBe(true);
    expect(executed).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 2. Passive Abilities in Attack Pipeline
// ═══════════════════════════════════════════════

describe("Passive abilities in attack pipeline", () => {
  it("攻击方被动特性增加伤害 (modifyDamage isAttacker=true)", () => {
    const state = setupGame();
    const attacker = state.players[0].active!;
    attacker.card.attacks = [
      { name: "Fire Blast", cost: ["Fire"], convertedEnergyCost: 1, damage: "100", text: "" },
    ];

    registerEffect({
      cardId: attacker.cardId,
      cardName: attacker.card.name,
      abilities: [{
        name: "Blaze",
        type: "passive",
        modifyDamage: (_ctx, damage, isAttacker) => {
          return isAttacker ? damage + 30 : damage;
        },
      }],
    });

    resolveAttack(state, 0, "Fire Blast");

    // 100 + 30 = 130 damage = 13 damage counters
    expect(state.players[1].active!.damageCounters).toBe(13);
  });

  it("防守方被动特性减少伤害 (modifyIncomingDamage)", () => {
    const state = setupGame();
    const attacker = state.players[0].active!;
    attacker.card.attacks = [
      { name: "Tackle", cost: ["Colorless"], convertedEnergyCost: 1, damage: "60", text: "" },
    ];

    const defender = state.players[1].active!;
    registerEffect({
      cardId: defender.cardId,
      cardName: defender.card.name,
      abilities: [{
        name: "Hard Shell",
        type: "passive",
        modifyIncomingDamage: (_ctx, damage) => {
          return Math.max(0, damage - 20);
        },
      }],
    });

    resolveAttack(state, 0, "Tackle");

    // 60 - 20 = 40 damage = 4 damage counters
    expect(state.players[1].active!.damageCounters).toBe(4);
  });

  it("被ABILITY_BLOCKED的被动特性不生效", () => {
    const state = setupGame();
    const attacker = state.players[0].active!;
    attacker.card.attacks = [
      { name: "Tackle", cost: ["Colorless"], convertedEnergyCost: 1, damage: "60", text: "" },
    ];

    const defender = state.players[1].active!;
    defender.markers[ABILITY_BLOCKED] = 1;

    registerEffect({
      cardId: defender.cardId,
      cardName: defender.card.name,
      abilities: [{
        name: "Hard Shell",
        type: "passive",
        modifyIncomingDamage: (_ctx, damage) => {
          return Math.max(0, damage - 20);
        },
      }],
    });

    resolveAttack(state, 0, "Tackle");

    // Ability blocked, so full 60 damage = 6 damage counters
    expect(state.players[1].active!.damageCounters).toBe(6);
  });

  it("防守方 modifyDamage (isAttacker=false) 减少伤害", () => {
    const state = setupGame();
    const attacker = state.players[0].active!;
    attacker.card.attacks = [
      { name: "Slash", cost: ["Colorless"], convertedEnergyCost: 1, damage: "80", text: "" },
    ];

    const defender = state.players[1].active!;
    registerEffect({
      cardId: defender.cardId,
      cardName: defender.card.name,
      abilities: [{
        name: "Thick Fat",
        type: "passive",
        modifyDamage: (_ctx, damage, isAttacker) => {
          return isAttacker ? damage : damage - 30;
        },
      }],
    });

    resolveAttack(state, 0, "Slash");

    // 80 - 30 = 50 damage = 5 damage counters
    expect(state.players[1].active!.damageCounters).toBe(5);
  });
});

// ═══════════════════════════════════════════════
// 3. Passive Abilities in Retreat
// ═══════════════════════════════════════════════

describe("Passive abilities modify retreat cost", () => {
  it("被动特性减少撤退费用", async () => {
    const state = setupGame();
    const active = state.players[0].active!;
    active.card.convertedRetreatCost = 3;
    active.card.retreatCost = ["Colorless", "Colorless", "Colorless"];

    // Give just 2 energy (would normally fail with cost 3)
    const e1 = makeEnergyCard("Fire");
    const e2 = makeEnergyCard("Fire");
    active.attachedEnergy = [e1, e2];

    // Bench Pokemon with ability to reduce retreat cost
    const benchMon = state.players[0].bench.cards[0];
    registerEffect({
      cardId: benchMon.cardId,
      cardName: benchMon.card.name,
      abilities: [{
        name: "Free Flight",
        type: "passive",
        modifyRetreatCost: (_ctx, cost) => Math.max(0, cost - 1),
      }],
    });

    // Add a second bench mon for retreat target
    const retreatTarget = makeGameCard({ name: "Magikarp", hp: "30" });
    state.players[0].bench.cards.push(retreatTarget);

    const result = await processAction(state, 0, {
      type: "retreat",
      energyToDiscard: [e1.instanceId, e2.instanceId],
      benchInstanceId: retreatTarget.instanceId,
    });

    // Cost reduced from 3 to 2, so 2 energy is enough
    expect(result.success).toBe(true);
  });

  it("被ABILITY_BLOCKED的被动特性不减少撤退费用", async () => {
    const state = setupGame();
    const active = state.players[0].active!;
    active.card.convertedRetreatCost = 3;
    active.card.retreatCost = ["Colorless", "Colorless", "Colorless"];

    const e1 = makeEnergyCard("Fire");
    const e2 = makeEnergyCard("Fire");
    active.attachedEnergy = [e1, e2];

    const benchMon = state.players[0].bench.cards[0];
    benchMon.markers[ABILITY_BLOCKED] = 1; // Blocked!

    registerEffect({
      cardId: benchMon.cardId,
      cardName: benchMon.card.name,
      abilities: [{
        name: "Free Flight",
        type: "passive",
        modifyRetreatCost: (_ctx, cost) => Math.max(0, cost - 1),
      }],
    });

    const retreatTarget = makeGameCard({ name: "Magikarp", hp: "30" });
    state.players[0].bench.cards.push(retreatTarget);

    const result = await processAction(state, 0, {
      type: "retreat",
      energyToDiscard: [e1.instanceId, e2.instanceId],
      benchInstanceId: retreatTarget.instanceId,
    });

    // Ability blocked, cost stays at 3, but only 2 energy → should fail
    expect(result.success).toBe(false);
    expect(result.error).toContain("能量不足");
  });
});

// ═══════════════════════════════════════════════
// 4. On-Enter Ability Auto-Trigger
// ═══════════════════════════════════════════════

describe("On-enter ability auto-trigger", () => {
  it("放到备战区时触发入场特性", () => {
    const state = setupGame();

    // Create a card with on_enter ability in hand
    const shaymin = makeGameCard({
      name: "Shaymin-EX",
      hp: "110",
      subtypes: ["Basic"],
      abilities: [{ name: "Set Up", text: "Draw until 6 cards", type: "Ability" }],
    });
    state.players[0].hand.cards.push(shaymin);

    let enterTriggered = false;
    registerEffect({
      cardId: shaymin.cardId,
      cardName: shaymin.card.name,
      abilities: [{
        name: "Set Up",
        type: "on_enter",
        onEnter: (ctx) => {
          enterTriggered = true;
          ctx.log("Set Up triggered!");
        },
      }],
    });

    // Play to bench
    playBasicToBench(state, shaymin.instanceId);

    expect(enterTriggered).toBe(true);
    // Verify it's on the bench
    expect(state.players[0].bench.cards.some(c => c.card.name === "Shaymin-EX")).toBe(true);
  });

  it("被ABILITY_BLOCKED的宝可梦入场时不触发", () => {
    const state = setupGame();

    const mon = makeGameCard({
      name: "Uxie",
      hp: "70",
      subtypes: ["Basic"],
      abilities: [{ name: "Set Up", text: "Draw cards", type: "Ability" }],
    });
    mon.markers[ABILITY_BLOCKED] = 1;
    state.players[0].hand.cards.push(mon);

    let enterTriggered = false;
    registerEffect({
      cardId: mon.cardId,
      cardName: mon.card.name,
      abilities: [{
        name: "Set Up",
        type: "on_enter",
        onEnter: () => { enterTriggered = true; },
      }],
    });

    playBasicToBench(state, mon.instanceId);

    expect(enterTriggered).toBe(false);
  });

  it("入场特性在日志中记录", () => {
    const state = setupGame();

    const mon = makeGameCard({
      name: "Tapu Lele",
      hp: "170",
      subtypes: ["Basic"],
      abilities: [{ name: "Wonder Tag", text: "Search supporter", type: "Ability" }],
    });
    state.players[0].hand.cards.push(mon);

    registerEffect({
      cardId: mon.cardId,
      cardName: mon.card.name,
      abilities: [{
        name: "Wonder Tag",
        type: "on_enter",
        onEnter: () => {},
      }],
    });

    const logBefore = state.log.length;
    playBasicToBench(state, mon.instanceId);

    // Should have at least 2 new log entries: play_pokemon + use_ability
    const newLogs = state.log.slice(logBefore);
    expect(newLogs.some(l => l.type === "use_ability" && l.message.includes("Wonder Tag"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 5. AI Player Ability Usage
// ═══════════════════════════════════════════════

describe("AI player uses abilities", () => {
  it("AI 在回合中使用可用的 activated 特性", () => {
    const state = setupGame();
    state.currentPlayer = 1;

    // Remove all basics from AI hand to prevent play_card
    state.players[1].hand.cards = [];

    const aiActive = state.players[1].active!;
    aiActive.card.abilities = [
      { name: "Dark Pulse", text: "Draw a card", type: "Ability" },
    ];

    registerEffect({
      cardId: aiActive.cardId,
      cardName: aiActive.card.name,
      abilities: [{
        name: "Dark Pulse",
        type: "activated",
        onActivate: () => {},
      }],
    });

    const decision = computeAIAction(state, 1);
    expect(decision).not.toBeNull();
    expect(decision!.action.type).toBe("use_ability");
    expect(decision!.action.abilityName).toBe("Dark Pulse");
  });

  it("AI 不使用已用过的特性", () => {
    const state = setupGame();
    state.currentPlayer = 1;
    state.players[1].hand.cards = [];

    const aiActive = state.players[1].active!;
    aiActive.card.abilities = [
      { name: "Power Draw", text: "Draw cards", type: "Ability" },
    ];
    aiActive.abilityUsedThisTurn = true; // Already used

    registerEffect({
      cardId: aiActive.cardId,
      cardName: aiActive.card.name,
      abilities: [{
        name: "Power Draw",
        type: "activated",
        onActivate: () => {},
      }],
    });

    const decision = computeAIAction(state, 1);
    // Should not try to use ability again
    expect(decision).not.toBeNull();
    expect(decision!.action.type).not.toBe("use_ability");
  });

  it("AI 不使用被封锁的特性", () => {
    const state = setupGame();
    state.currentPlayer = 1;
    state.players[1].hand.cards = [];

    const aiActive = state.players[1].active!;
    aiActive.card.abilities = [
      { name: "Dark Cloak", text: "Free retreat", type: "Ability" },
    ];
    aiActive.markers[ABILITY_BLOCKED] = 1;

    registerEffect({
      cardId: aiActive.cardId,
      cardName: aiActive.card.name,
      abilities: [{
        name: "Dark Cloak",
        type: "activated",
        onActivate: () => {},
      }],
    });

    const decision = computeAIAction(state, 1);
    expect(decision).not.toBeNull();
    expect(decision!.action.type).not.toBe("use_ability");
  });

  it("AI 不使用 passive 类型特性（自动生效）", () => {
    const state = setupGame();
    state.currentPlayer = 1;
    state.players[1].hand.cards = [];

    const aiActive = state.players[1].active!;
    aiActive.card.abilities = [
      { name: "Intimidate", text: "-20 damage", type: "Ability" },
    ];

    registerEffect({
      cardId: aiActive.cardId,
      cardName: aiActive.card.name,
      abilities: [{
        name: "Intimidate",
        type: "passive",
        modifyIncomingDamage: (_ctx, damage) => damage - 20,
      }],
    });

    const decision = computeAIAction(state, 1);
    expect(decision).not.toBeNull();
    // Passive abilities are not "used" — AI should skip to attack or end_turn
    expect(decision!.action.type).not.toBe("use_ability");
  });
});

// ═══════════════════════════════════════════════
// 6. Edge Cases
// ═══════════════════════════════════════════════

describe("Ability edge cases", () => {
  it("不在主阶段不能使用特性", async () => {
    const state = setupGame();
    state.phase = "draw";
    const active = state.players[0].active!;
    active.card.abilities = [
      { name: "Test", text: "", type: "Ability" },
    ];

    registerEffect({
      cardId: active.cardId,
      abilities: [{
        name: "Test",
        type: "activated",
        onActivate: () => {},
      }],
    });

    const result = await processAction(state, 0, {
      type: "use_ability",
      cardId: active.instanceId,
      abilityName: "Test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("主阶段");
  });

  it("PREVENT_ALL_DAMAGE 标记阻挡所有伤害", () => {
    const state = setupGame();
    const attacker = state.players[0].active!;
    attacker.card.attacks = [
      { name: "Mega Punch", cost: ["Colorless"], convertedEnergyCost: 1, damage: "200", text: "" },
    ];

    const defender = state.players[1].active!;
    defender.markers["PREVENT_ALL_DAMAGE_NEXT_TURN"] = 1;

    resolveAttack(state, 0, "Mega Punch");

    // All damage prevented
    expect(defender.damageCounters).toBe(0);
  });
});
