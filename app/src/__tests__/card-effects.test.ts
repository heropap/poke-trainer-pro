/**
 * Tests for Card Effects Framework
 *
 * Tests:
 * 1. Effect Registry (register, get, has, clear)
 * 2. Coin flip system
 * 3. Effect Context helper methods
 * 4. Attack effects integration with performAttack
 *    - Status attacks (poison)
 *    - Self-damage attacks
 *    - Bench damage attacks
 *    - Energy discard attacks
 *    - Damage per energy attacks
 *    - Coin flip conditional damage
 * 5. Trainer effects (Supporter + Item)
 *    - Professor's Research (discard hand, draw 7)
 *    - Nest Ball (search deck for basic)
 * 6. Tool effects
 *    - Air Balloon (retreat cost -2)
 *    - Sacred Charm (incoming damage -30)
 * 7. Status condition between-turns
 *    - Poison (10 damage)
 *    - Burn (20 damage + flip)
 *    - Paralyzed (auto-cure)
 *    - Asleep (flip to cure)
 * 8. Use Ability action
 */

import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  resetInstanceCounter,
} from "@/engine/game-state";
import { processAction, startFirstTurn, GameAction } from "@/engine/game-controller";
import { performAttack, canAttack } from "@/engine/game-actions";
import { playSupporter, playItem, endTurn, canRetreat } from "@/engine/turn-actions";
import {
  registerEffect,
  clearRegistry,
  getEffect,
  hasEffect,
  getRegisteredCount,
  initializeEffects,
} from "@/engine/effects";
import { createEffectContext } from "@/engine/effects/effect-context";
import { flipCoin, flipCoins, setRandomFn } from "@/engine/effects/coin";
import { processBetweenTurns } from "@/engine/effects/status-effects";
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

function setupGame(): GameState {
  resetInstanceCounter();
  const state = createGameState("Alice", "Bob");
  state.phase = "main";
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Alice (Player 0)
  const aliceActive = makeGameCard({
    name: "Charmander",
    hp: "70",
    types: ["Fire"],
    attacks: [
      { name: "Ember", damage: "30", cost: ["Fire"], text: "", convertedEnergyCost: 1 },
    ],
  });
  state.players[0].active = aliceActive;

  // Bob (Player 1)
  const bobActive = makeGameCard({
    name: "Pikachu",
    hp: "60",
    types: ["Lightning"],
    attacks: [
      { name: "Thunder Shock", damage: "20", cost: [], text: "", convertedEnergyCost: 0 },
    ],
  });
  state.players[1].active = bobActive;

  // Decks
  for (let i = 0; i < 10; i++) {
    state.players[0].deck.cards.push(makeGameCard({ name: `Filler A${i}`, hp: "40" }));
    state.players[1].deck.cards.push(makeGameCard({ name: `Filler B${i}`, hp: "40" }));
  }

  return state;
}

// ─── Setup & Teardown ───

beforeEach(() => {
  clearRegistry();
  setRandomFn(undefined); // Reset to Math.random
});

// ═══════════════════════════════════════════════
// 1. Effect Registry
// ═══════════════════════════════════════════════

describe("Effect Registry", () => {
  it("注册和获取效果", () => {
    registerEffect({
      cardId: "test-card-1",
      cardName: "Test Card",
      attacks: [{ name: "Test Attack", onAttack: (ctx, dmg) => ({ damage: dmg }) }],
    });

    expect(hasEffect("test-card-1")).toBe(true);
    expect(hasEffect("nonexistent")).toBe(false);

    const effect = getEffect("test-card-1");
    expect(effect).not.toBeNull();
    expect(effect!.cardName).toBe("Test Card");
  });

  it("清除注册表", () => {
    registerEffect({ cardId: "a", attacks: [] });
    registerEffect({ cardId: "b", attacks: [] });
    expect(getRegisteredCount()).toBe(2);

    clearRegistry();
    expect(getRegisteredCount()).toBe(0);
  });

  it("initializeEffects 注册所有内置效果", () => {
    initializeEffects();
    expect(getRegisteredCount()).toBeGreaterThan(10);
    // Check some known cards
    expect(hasEffect("me1-114")).toBe(true); // Boss's Orders
    expect(hasEffect("sv1-189")).toBe(true); // Professor's Research
    expect(hasEffect("me1-6")).toBe(true); // Tangela (Poison Powder)
  });
});

// ═══════════════════════════════════════════════
// 2. Coin Flip System
// ═══════════════════════════════════════════════

describe("Coin Flip System", () => {
  it("flipCoin 返回 boolean", () => {
    const result = flipCoin();
    expect(typeof result).toBe("boolean");
  });

  it("可注入确定性随机函数", () => {
    setRandomFn(() => 0.9); // Always heads
    expect(flipCoin()).toBe(true);
    expect(flipCoin()).toBe(true);

    setRandomFn(() => 0.1); // Always tails
    expect(flipCoin()).toBe(false);
  });

  it("flipCoins 返回正确统计", () => {
    setRandomFn(() => 0.9); // Always heads
    const result = flipCoins(5);
    expect(result.heads).toBe(5);
    expect(result.tails).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// 3. Effect Context Helper Methods
// ═══════════════════════════════════════════════

describe("Effect Context", () => {
  it("damage 对目标造成伤害", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    ctx.damage(30, state.players[1].active!);
    expect(state.players[1].active!.damageCounters).toBe(3); // 30/10
  });

  it("heal 恢复伤害", () => {
    const state = setupGame();
    state.players[0].active!.damageCounters = 5; // 50 damage
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    ctx.heal(30, state.players[0].active!);
    expect(state.players[0].active!.damageCounters).toBe(2); // 50-30=20, 2 counters
  });

  it("heal 不会使伤害小于 0", () => {
    const state = setupGame();
    state.players[0].active!.damageCounters = 1; // 10 damage
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    ctx.heal(50, state.players[0].active!);
    expect(state.players[0].active!.damageCounters).toBe(0);
  });

  it("drawCards 抽指定数量的牌", () => {
    const state = setupGame();
    const initialHandSize = state.players[0].hand.cards.length;
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const drawn = ctx.drawCards(3, "player");
    expect(drawn.length).toBe(3);
    expect(state.players[0].hand.cards.length).toBe(initialHandSize + 3);
  });

  it("applyStatus 添加状态异常", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    ctx.applyStatus(state.players[1].active!, "poisoned");
    expect(state.players[1].active!.statusConditions).toContain("poisoned");
  });

  it("applyStatus 互斥状态（asleep/confused/paralyzed）替换", () => {
    const state = setupGame();
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const target = state.players[1].active!;

    ctx.applyStatus(target, "asleep");
    expect(target.statusConditions).toContain("asleep");

    ctx.applyStatus(target, "paralyzed");
    expect(target.statusConditions).not.toContain("asleep");
    expect(target.statusConditions).toContain("paralyzed");
  });

  it("searchDeck 搜索并移除匹配的牌", () => {
    const state = setupGame();
    const basicInDeck = makeGameCard({ name: "Magikarp", hp: "30", subtypes: ["Basic"] });
    state.players[0].deck.cards.unshift(basicInDeck);
    const deckSizeBefore = state.players[0].deck.cards.length;

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = ctx.searchDeck(
      (c) => c.card.supertype === "Pokémon" && c.card.subtypes.includes("Basic"),
      1,
      "player"
    );

    expect(found.length).toBe(1);
    expect(found[0].card.name).toBe("Magikarp");
    expect(state.players[0].deck.cards.length).toBe(deckSizeBefore - 1);
  });

  it("switchOpponentActive 交换对手战斗区", () => {
    const state = setupGame();
    const bench1 = makeGameCard({ name: "Geodude", hp: "60" });
    state.players[1].bench.cards.push(bench1);

    const originalActive = state.players[1].active!;
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const success = ctx.switchOpponentActive(bench1.instanceId);

    expect(success).toBe(true);
    expect(state.players[1].active!.card.name).toBe("Geodude");
    // Original active should be on bench
    expect(state.players[1].bench.cards.some(c => c.card.name === originalActive.card.name)).toBe(true);
  });

  it("flipCoin 记录日志", () => {
    const state = setupGame();
    setRandomFn(() => 0.9);
    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const result = ctx.flipCoin();
    expect(result).toBe(true);
    const coinLog = state.log.find(l => l.message.includes("正面"));
    expect(coinLog).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// 4. Attack Effects Integration
// ═══════════════════════════════════════════════

describe("Attack Effects - Status", () => {
  it("攻击效果附带中毒", () => {
    const state = setupGame();
    // Register a poison attack effect
    registerEffect({
      cardId: state.players[0].active!.cardId,
      attacks: [{
        name: "Ember",
        onAttack: (ctx, baseDamage) => ({
          damage: baseDamage,
          statusEffects: [{ target: "defender", status: "poisoned" }],
        }),
      }],
    });

    // Give energy for attack
    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].active!.attachedEnergy.push(energy);

    const result = performAttack(state, 0, "Ember");
    expect(result.success).toBe(true);
    expect(state.players[1].active!.statusConditions).toContain("poisoned");
  });
});

describe("Attack Effects - Self Damage", () => {
  it("攻击对自己造成伤害", () => {
    const state = setupGame();
    registerEffect({
      cardId: state.players[0].active!.cardId,
      attacks: [{
        name: "Ember",
        onAttack: (ctx, baseDamage) => ({
          damage: baseDamage,
          selfDamage: 10,
        }),
      }],
    });

    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].active!.attachedEnergy.push(energy);

    performAttack(state, 0, "Ember");
    expect(state.players[0].active!.damageCounters).toBe(1); // 10/10 = 1
  });
});

describe("Attack Effects - Bench Damage", () => {
  it("攻击同时伤害备战区", () => {
    const state = setupGame();
    const benchMon = makeGameCard({ name: "Geodude", hp: "60" });
    state.players[1].bench.cards.push(benchMon);

    registerEffect({
      cardId: state.players[0].active!.cardId,
      attacks: [{
        name: "Ember",
        onAttack: (ctx, baseDamage) => ({
          damage: baseDamage,
          benchDamage: [{ target: benchMon, damage: 20 }],
        }),
      }],
    });

    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].active!.attachedEnergy.push(energy);

    performAttack(state, 0, "Ember");
    expect(benchMon.damageCounters).toBe(2); // 20/10 = 2
  });
});

describe("Attack Effects - Energy Discard", () => {
  it("攻击后丢弃能量", () => {
    const state = setupGame();
    registerEffect({
      cardId: state.players[0].active!.cardId,
      attacks: [{
        name: "Ember",
        onAttack: (ctx, baseDamage) => ({
          damage: baseDamage,
          discardEnergy: 1,
        }),
      }],
    });

    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].active!.attachedEnergy.push(energy);

    performAttack(state, 0, "Ember");
    expect(state.players[0].active!.attachedEnergy.length).toBe(0);
    expect(state.players[0].discard.cards.length).toBeGreaterThan(0);
  });
});

describe("Attack Effects - Damage Per Energy", () => {
  it("根据附加能量数增加伤害", () => {
    const state = setupGame();
    registerEffect({
      cardId: state.players[0].active!.cardId,
      attacks: [{
        name: "Ember",
        onAttack: (ctx, baseDamage) => {
          const energyCount = ctx.source.attachedEnergy.length;
          return { damage: baseDamage + energyCount * 20 };
        },
      }],
    });

    // Attach 3 energy
    for (let i = 0; i < 3; i++) {
      const e = makeGameCard({ name: `Fire Energy ${i}`, supertype: "Energy", subtypes: ["Basic"] });
      state.players[0].active!.attachedEnergy.push(e);
    }

    performAttack(state, 0, "Ember");
    // Base 30 + 3*20 = 90. Pikachu HP = 60 → should be KO'd
    // Damage: 90/10 = 9 counters
    // Actually let's check the defender's damage counters if still alive
    // Pikachu has 60 HP, 90 damage → KO!
    expect(state.players[1].active).toBeNull(); // KO'd and moved to discard
  });
});

describe("Attack Effects - Coin Flip", () => {
  it("硬币翻转增加伤害", () => {
    const state = setupGame();
    setRandomFn(() => 0.9); // Always heads

    registerEffect({
      cardId: state.players[0].active!.cardId,
      attacks: [{
        name: "Ember",
        onAttack: (ctx, baseDamage) => {
          let extra = 0;
          // Flip 3 coins, +10 for each heads
          const result = ctx.flipCoins(3);
          extra = result.heads * 10;
          return { damage: baseDamage + extra };
        },
      }],
    });

    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].active!.attachedEnergy.push(energy);

    performAttack(state, 0, "Ember");
    // 30 + 3*10 = 60, Pikachu HP = 60 → KO!
    expect(state.players[1].active).toBeNull();
  });
});

describe("Attack Effects - No Effect Fallback", () => {
  it("没有注册效果时使用默认伤害", () => {
    const state = setupGame();
    // Don't register any effect
    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].active!.attachedEnergy.push(energy);

    performAttack(state, 0, "Ember");
    // Default: 30 damage
    expect(state.players[1].active!.damageCounters).toBe(3);
  });
});

// ═══════════════════════════════════════════════
// 5. Trainer Effects
// ═══════════════════════════════════════════════

describe("Trainer Effects - Supporter", () => {
  it("Professor's Research: 弃手牌抽7张", async () => {
    const state = setupGame();
    // Register effect
    registerEffect({
      cardId: "test-prof-research",
      cardName: "Professor's Research",
      trainer: {
        onPlay: (ctx) => {
          ctx.discardHand("player");
          ctx.drawCards(7, "player");
        },
      },
    });

    // Add supporter to hand
    const supporter = makeGameCard({
      id: "test-prof-research",
      name: "Professor's Research",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    state.players[0].hand.cards.push(supporter);

    // Add some other hand cards
    const handCard = makeGameCard({ name: "Random Card", hp: "40" });
    state.players[0].hand.cards.push(handCard);

    const result = await playSupporter(state, supporter.instanceId);
    expect(result.success).toBe(true);
    // Should have drawn 7 new cards (hand was discarded before drawing)
    expect(state.players[0].hand.cards.length).toBe(7);
    expect(state.players[0].supporterUsedThisTurn).toBe(true);
  });
});

describe("Trainer Effects - Item", () => {
  it("Nest Ball: 从牌组搜索基础宝可梦到备战区", async () => {
    const state = setupGame();
    registerEffect({
      cardId: "test-nest-ball",
      cardName: "Nest Ball",
      trainer: {
        onPlay: (ctx) => {
          const found = ctx.searchDeck(
            (c) => c.card.supertype === "Pokémon" && c.card.subtypes.includes("Basic"),
            1,
            "player"
          );
          if (found.length > 0) {
            found[0].playedThisTurn = true;
            ctx.player.bench.cards.push(found[0]);
          }
          ctx.shuffleDeck("player");
        },
      },
    });

    // Add a basic Pokemon to deck
    const basicInDeck = makeGameCard({ name: "Magikarp", hp: "30", subtypes: ["Basic"] });
    state.players[0].deck.cards.unshift(basicInDeck);

    const item = makeGameCard({
      id: "test-nest-ball",
      name: "Nest Ball",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(item);

    const benchBefore = state.players[0].bench.cards.length;
    const result = await playItem(state, item.instanceId);

    expect(result.success).toBe(true);
    expect(state.players[0].bench.cards.length).toBe(benchBefore + 1);
    expect(state.players[0].bench.cards.some(c => c.card.name === "Magikarp")).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 6. Tool Effects
// ═══════════════════════════════════════════════

describe("Tool Effects - Retreat Cost Reduction", () => {
  it("Air Balloon 减少撤退费用 2", () => {
    const state = setupGame();
    state.players[0].active!.card.convertedRetreatCost = 3;

    registerEffect({
      cardId: "test-air-balloon",
      cardName: "Air Balloon",
      tool: {
        whileAttached: {
          modifyRetreatCost: (_ctx, cost) => Math.max(0, cost - 2),
        },
      },
    });

    // Attach tool
    const tool = makeGameCard({
      id: "test-air-balloon",
      name: "Air Balloon",
      supertype: "Trainer",
      subtypes: ["Pokémon Tool"],
    });
    state.players[0].active!.attachedTools.push(tool);

    // Add bench Pokemon
    const bench = makeGameCard({ name: "Snorlax", hp: "120" });
    state.players[0].bench.cards.push(bench);

    // Only need 1 energy (3-2=1) to retreat
    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].active!.attachedEnergy.push(energy);

    const check = canRetreat(state, [energy.instanceId]);
    expect(check.success).toBe(true);
  });
});

describe("Tool Effects - Damage Reduction", () => {
  it("Sacred Charm 减少受到伤害 30", () => {
    const state = setupGame();
    registerEffect({
      cardId: "test-sacred-charm",
      cardName: "Sacred Charm",
      tool: {
        whileAttached: {
          modifyIncomingDamage: (_ctx, damage) => Math.max(0, damage - 30),
        },
      },
    });

    // Attach tool to defender
    const tool = makeGameCard({
      id: "test-sacred-charm",
      name: "Sacred Charm",
      supertype: "Trainer",
      subtypes: ["Pokémon Tool"],
    });
    state.players[1].active!.attachedTools.push(tool);

    // Alice attacks with Ember (30 damage)
    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].active!.attachedEnergy.push(energy);

    performAttack(state, 0, "Ember");
    // 30 - 30 = 0 damage
    expect(state.players[1].active!.damageCounters).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// 7. Status Condition Between-Turns
// ═══════════════════════════════════════════════

describe("Status Effects - Between Turns", () => {
  it("中毒造成 10 点伤害", () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("poisoned");

    processBetweenTurns(state, 0);
    expect(state.players[0].active!.damageCounters).toBe(1); // 10/10
    // Poison persists
    expect(state.players[0].active!.statusConditions).toContain("poisoned");
  });

  it("灼伤造成 20 点伤害", () => {
    const state = setupGame();
    setRandomFn(() => 0.1); // Tails — burn NOT cured
    state.players[0].active!.statusConditions.push("burned");

    processBetweenTurns(state, 0);
    expect(state.players[0].active!.damageCounters).toBe(2); // 20/10
    expect(state.players[0].active!.statusConditions).toContain("burned");
  });

  it("灼伤翻正面时恢复", () => {
    const state = setupGame();
    setRandomFn(() => 0.9); // Heads — burn cured
    state.players[0].active!.statusConditions.push("burned");

    processBetweenTurns(state, 0);
    expect(state.players[0].active!.damageCounters).toBe(2); // Still takes 20 damage
    expect(state.players[0].active!.statusConditions).not.toContain("burned"); // But cured
  });

  it("麻痹自动恢复", () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("paralyzed");

    processBetweenTurns(state, 0);
    expect(state.players[0].active!.statusConditions).not.toContain("paralyzed");
  });

  it("睡眠翻正面时醒来", () => {
    const state = setupGame();
    setRandomFn(() => 0.9); // Heads — wake up
    state.players[0].active!.statusConditions.push("asleep");

    processBetweenTurns(state, 0);
    expect(state.players[0].active!.statusConditions).not.toContain("asleep");
  });

  it("睡眠翻反面时继续睡", () => {
    const state = setupGame();
    setRandomFn(() => 0.1); // Tails — stay asleep
    state.players[0].active!.statusConditions.push("asleep");

    processBetweenTurns(state, 0);
    expect(state.players[0].active!.statusConditions).toContain("asleep");
  });

  it("中毒致死触发击倒", () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("poisoned");
    // Set to 1 HP remaining (HP=70, damage=60, counters=6)
    state.players[0].active!.damageCounters = 6;

    // Need prizes and bench for proper game flow
    state.players[1].prizes.cards.push(makeGameCard({ name: "Prize", hp: "40" }));

    const koOccurred = processBetweenTurns(state, 0);
    expect(koOccurred).toBe(true);
    expect(state.players[0].active).toBeNull();
  });

  it("endTurn 触发状态异常处理", () => {
    const state = setupGame();
    state.players[0].active!.statusConditions.push("poisoned");

    endTurn(state);
    // Poison should have been processed
    // Active takes 10 damage from poison
    // Note: after endTurn, currentPlayer switches, so we check player 0's active
    // Poison is checked on player 0 (the player whose turn is ending)
    // After processing, player 0's active should have 1 damage counter
    // But wait - endTurn switches the player, so let's check the state
    // Actually the active might have damage from the poison
    // The active belongs to the player who ended their turn (player 0)
    expect(state.players[0].active!.damageCounters).toBe(1);
  });
});

// ═══════════════════════════════════════════════
// 8. Use Ability Action
// ═══════════════════════════════════════════════

describe("Use Ability Action", () => {
  it("激活宝可梦特性", async () => {
    const state = setupGame();
    let abilityExecuted = false;

    // Give active an ability
    state.players[0].active!.card.abilities = [
      { name: "Solar Transfer", text: "Move energy", type: "Ability" },
    ];

    registerEffect({
      cardId: state.players[0].active!.cardId,
      abilities: [{
        name: "Solar Transfer",
        type: "activated",
        onActivate: (ctx) => {
          abilityExecuted = true;
          ctx.log("Solar Transfer activated!");
        },
      }],
    });

    const result = await processAction(state, 0, {
      type: "use_ability",
      cardId: state.players[0].active!.instanceId,
      abilityName: "Solar Transfer",
    });

    expect(result.success).toBe(true);
    expect(abilityExecuted).toBe(true);
    expect(state.players[0].active!.abilityUsedThisTurn).toBe(true);
  });

  it("每回合只能用一次特性", async () => {
    const state = setupGame();
    state.players[0].active!.card.abilities = [
      { name: "Test Ability", text: "", type: "Ability" },
    ];
    registerEffect({
      cardId: state.players[0].active!.cardId,
      abilities: [{
        name: "Test Ability",
        type: "activated",
        onActivate: () => {},
      }],
    });

    // First use should succeed
    const r1 = await processAction(state, 0, {
      type: "use_ability",
      cardId: state.players[0].active!.instanceId,
      abilityName: "Test Ability",
    });
    expect(r1.success).toBe(true);

    // Second use should fail
    const r2 = await processAction(state, 0, {
      type: "use_ability",
      cardId: state.players[0].active!.instanceId,
      abilityName: "Test Ability",
    });
    expect(r2.success).toBe(false);
    expect(r2.error).toContain("已经使用过");
  });

  it("不存在的特性返回错误", async () => {
    const state = setupGame();
    const result = await processAction(state, 0, {
      type: "use_ability",
      cardId: state.players[0].active!.instanceId,
      abilityName: "Nonexistent",
    });
    expect(result.success).toBe(false);
  });

  it("备战区宝可梦也能使用特性", async () => {
    const state = setupGame();
    const benchMon = makeGameCard({ name: "Gardevoir", hp: "120" });
    benchMon.card.abilities = [
      { name: "Psychic Embrace", text: "Attach energy", type: "Ability" },
    ];
    state.players[0].bench.cards.push(benchMon);

    let activated = false;
    registerEffect({
      cardId: benchMon.cardId,
      abilities: [{
        name: "Psychic Embrace",
        type: "activated",
        onActivate: () => { activated = true; },
      }],
    });

    const result = await processAction(state, 0, {
      type: "use_ability",
      cardId: benchMon.instanceId,
      abilityName: "Psychic Embrace",
    });

    expect(result.success).toBe(true);
    expect(activated).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 9. Built-in Card Effects (Integration)
// ═══════════════════════════════════════════════

describe("Built-in Effects Integration", () => {
  it("initializeEffects 后攻击效果生效（Tangela Poison Powder）", () => {
    initializeEffects();
    const state = setupGame();

    // Replace active with Tangela
    const tangela = makeGameCard({
      id: "me1-6",
      name: "Tangela",
      hp: "80",
      types: ["Grass"],
      attacks: [
        { name: "Poison Powder", damage: "0", cost: [], text: "Poisoned", convertedEnergyCost: 0 },
      ],
    });
    state.players[0].active = tangela;

    performAttack(state, 0, "Poison Powder");
    expect(state.players[1].active!.statusConditions).toContain("poisoned");
  });
});
