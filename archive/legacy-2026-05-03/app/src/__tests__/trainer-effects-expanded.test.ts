/**
 * Tests for Expanded Trainer Effects System
 *
 * Covers:
 * 1. Name-based registry (registerByName, getEffect with name fallback)
 * 2. New EffectContext methods (searchDiscard, shuffleHandIntoDeck, etc.)
 * 3. Name-based trainer effects (Iono, Ultra Ball, Switch, etc.)
 * 4. Attacker tool damage modifiers (Choice Belt, Vitality Band, Defiance Band)
 * 5. initializeEffects includes name-based effects
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
import { performAttack } from "@/engine/game-actions";
import { playSupporter, playItem } from "@/engine/turn-actions";
import {
  registerEffect,
  registerByName,
  registerAllByName,
  clearRegistry,
  getEffect,
  hasEffect,
  getRegisteredCount,
  getNameRegisteredCount,
  getRegisteredCardNames,
  initializeEffects,
} from "@/engine/effects";
import { createEffectContext } from "@/engine/effects/effect-context";
import { setRandomFn } from "@/engine/effects/coin";
import { Card } from "@/types/card";

// ─── Test Fixtures ───

function makeCard(overrides: Partial<Card> & { name: string }): Card {
  return {
    id: overrides.id || `test-${overrides.name.toLowerCase().replace(/['\s]/g, "-")}`,
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
  state.phase = GamePhase.MAIN;
  state.turn = 2;
  state.isFirstTurn = false;
  state.currentPlayer = 0;

  // Alice (Player 0)
  state.players[0].active = makeGameCard({
    name: "Charizard ex",
    hp: "330",
    types: ["Fire"],
    subtypes: ["Stage 2", "ex"],
    attacks: [
      { name: "Burning Dark", damage: "180", cost: ["Fire", "Fire"], text: "", convertedEnergyCost: 2 },
    ],
  });

  // Bob (Player 1)
  state.players[1].active = makeGameCard({
    name: "Pikachu ex",
    hp: "200",
    types: ["Lightning"],
    subtypes: ["Basic", "ex"],
    attacks: [
      { name: "Thunder", damage: "120", cost: ["Lightning", "Lightning"], text: "", convertedEnergyCost: 2 },
    ],
  });

  // Decks (20 cards each)
  for (let i = 0; i < 20; i++) {
    state.players[0].deck.cards.push(makeGameCard({ name: `Filler A${i}`, hp: "40" }));
    state.players[1].deck.cards.push(makeGameCard({ name: `Filler B${i}`, hp: "40" }));
  }

  // Add some specific deck cards for searching
  state.players[0].deck.cards.push(makeGameCard({ name: "Ralts", hp: "60", subtypes: ["Basic"] }));
  state.players[0].deck.cards.push(makeGameCard({
    name: "Fire Energy",
    supertype: "Energy",
    subtypes: ["Basic"],
    types: ["Fire"],
  }));

  // Prizes (3 each)
  for (let i = 0; i < 3; i++) {
    state.players[0].prizes.cards.push(makeGameCard({ name: `Prize A${i}`, hp: "40" }));
    state.players[1].prizes.cards.push(makeGameCard({ name: `Prize B${i}`, hp: "40" }));
  }

  return state;
}

// ─── Setup & Teardown ───

beforeEach(() => {
  clearRegistry();
  setRandomFn(undefined);
});

// ═══════════════════════════════════════════════
// 1. Name-based Registry
// ═══════════════════════════════════════════════

describe("Name-based Registry", () => {
  it("registerByName 注册效果并可通过名称查找", () => {
    registerByName({
      cardId: "__name__",
      cardName: "Iono",
      trainer: { onPlay: () => {} },
    });

    expect(getNameRegisteredCount()).toBe(1);
    expect(getRegisteredCardNames()).toContain("Iono");
  });

  it("getEffect 名称回退: 未知 ID 通过名称找到效果", () => {
    registerByName({
      cardId: "__name__",
      cardName: "Iono",
      trainer: { onPlay: () => {} },
    });

    // Unknown ID but known name → found
    const effect = getEffect("unknown-id-xyz", "Iono");
    expect(effect).not.toBeNull();
    expect(effect!.cardName).toBe("Iono");
  });

  it("getEffect ID 优先于名称", () => {
    // Register by ID
    registerEffect({
      cardId: "specific-id-1",
      cardName: "Test Card (ID)",
      trainer: { onPlay: () => {} },
    });

    // Register by name with same cardName
    registerByName({
      cardId: "__name__",
      cardName: "Test Card (Name)",
      trainer: { onPlay: () => {} },
    });

    // ID match takes priority
    const byId = getEffect("specific-id-1", "Test Card (Name)");
    expect(byId!.cardName).toBe("Test Card (ID)");
  });

  it("hasEffect 支持名称回退", () => {
    registerByName({
      cardId: "__name__",
      cardName: "Switch",
      trainer: { onPlay: () => {} },
    });

    expect(hasEffect("random-id", "Switch")).toBe(true);
    expect(hasEffect("random-id")).toBe(false); // No name passed → not found by ID
    expect(hasEffect("random-id", "Nonexistent")).toBe(false);
  });

  it("clearRegistry 清除 ID 和名称两个注册表", () => {
    registerEffect({ cardId: "id-1", attacks: [] });
    registerByName({ cardId: "__name__", cardName: "Test", trainer: { onPlay: () => {} } });

    expect(getRegisteredCount()).toBe(1);
    expect(getNameRegisteredCount()).toBe(1);

    clearRegistry();
    expect(getRegisteredCount()).toBe(0);
    expect(getNameRegisteredCount()).toBe(0);
  });

  it("registerAllByName 批量注册", () => {
    registerAllByName([
      { cardId: "__name__", cardName: "Iono", trainer: { onPlay: () => {} } },
      { cardId: "__name__", cardName: "Judge", trainer: { onPlay: () => {} } },
      { cardId: "__name__", cardName: "Switch", trainer: { onPlay: () => {} } },
    ]);

    expect(getNameRegisteredCount()).toBe(3);
    expect(hasEffect("any-id", "Iono")).toBe(true);
    expect(hasEffect("any-id", "Judge")).toBe(true);
    expect(hasEffect("any-id", "Switch")).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 2. New EffectContext Methods
// ═══════════════════════════════════════════════

describe("EffectContext - New Methods", () => {
  it("searchDiscard 从弃牌堆搜索并移除", () => {
    const state = setupGame();
    // Add Pokemon to discard
    const discardedMon = makeGameCard({ name: "Gardevoir", hp: "120" });
    state.players[0].discard.cards.push(discardedMon);
    const discardSizeBefore = state.players[0].discard.cards.length;

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const found = ctx.searchDiscard((c) => c.card.supertype === "Pokémon", 1);

    expect(found.length).toBe(1);
    expect(found[0].card.name).toBe("Gardevoir");
    expect(state.players[0].discard.cards.length).toBe(discardSizeBefore - 1);
  });

  it("shuffleHandIntoDeck 洗手牌入牌组", () => {
    const state = setupGame();
    // Give player some hand cards
    for (let i = 0; i < 5; i++) {
      state.players[0].hand.cards.push(makeGameCard({ name: `Hand Card ${i}` }));
    }
    const deckSizeBefore = state.players[0].deck.cards.length;

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const count = ctx.shuffleHandIntoDeck("player");

    expect(count).toBe(5);
    expect(state.players[0].hand.cards.length).toBe(0);
    expect(state.players[0].deck.cards.length).toBe(deckSizeBefore + 5);
  });

  it("switchOwnActive 切换自己的战斗宝可梦", () => {
    const state = setupGame();
    const benchMon = makeGameCard({ name: "Gardevoir", hp: "120" });
    state.players[0].bench.cards.push(benchMon);
    const originalActive = state.players[0].active!;

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const success = ctx.switchOwnActive(benchMon.instanceId);

    expect(success).toBe(true);
    expect(state.players[0].active!.card.name).toBe("Gardevoir");
    expect(state.players[0].bench.cards.some(c => c.instanceId === originalActive.instanceId)).toBe(true);
  });

  it("switchOwnActive 清除换下宝可梦的状态异常", () => {
    const state = setupGame();
    state.players[0].active!.statusConditions = ["poisoned", "burned"];
    const benchMon = makeGameCard({ name: "Gardevoir", hp: "120" });
    state.players[0].bench.cards.push(benchMon);

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    ctx.switchOwnActive(benchMon.instanceId);

    // The formerly active Pokemon (now on bench) should have status cleared
    const formerActive = state.players[0].bench.cards.find(c => c.card.name === "Charizard ex");
    expect(formerActive!.statusConditions).toEqual([]);
  });

  it("revealTopCards 翻开牌组顶部并移除", () => {
    const state = setupGame();
    const deckSizeBefore = state.players[0].deck.cards.length;

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const revealed = ctx.revealTopCards(3);

    expect(revealed.length).toBe(3);
    expect(state.players[0].deck.cards.length).toBe(deckSizeBefore - 3);
  });

  it("putOnTopOfDeck 放回牌组顶部", () => {
    const state = setupGame();
    const cards = [
      makeGameCard({ name: "Card A" }),
      makeGameCard({ name: "Card B" }),
    ];

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    ctx.putOnTopOfDeck(cards);

    expect(state.players[0].deck.cards[0].card.name).toBe("Card A");
    expect(state.players[0].deck.cards[1].card.name).toBe("Card B");
  });

  it("shuffleIntoDeck 洗入牌组", () => {
    const state = setupGame();
    const deckSizeBefore = state.players[0].deck.cards.length;
    const cards = [makeGameCard({ name: "Returned Card" })];

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    ctx.shuffleIntoDeck(cards);

    expect(state.players[0].deck.cards.length).toBe(deckSizeBefore + 1);
  });

  it("attachEnergyFromDiscard 从弃牌堆附加能量", () => {
    const state = setupGame();
    const energy = makeGameCard({
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      types: ["Fire"],
    });
    state.players[0].discard.cards.push(energy);

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const attached = ctx.attachEnergyFromDiscard(
      (c) => c.card.supertype === "Energy",
      1,
      state.players[0].active!
    );

    expect(attached.length).toBe(1);
    expect(state.players[0].active!.attachedEnergy.length).toBeGreaterThan(0);
    expect(state.players[0].discard.cards.length).toBe(0);
  });

  it("pickUpPokemon 回收宝可梦及附件", () => {
    const state = setupGame();
    // Attach energy and tool to active
    const energy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].active!.attachedEnergy.push(energy);
    const tool = makeGameCard({ name: "Choice Belt", supertype: "Trainer", subtypes: ["Pokémon Tool"] });
    state.players[0].active!.attachedTools.push(tool);
    state.players[0].active!.damageCounters = 5;

    // Must have bench to pick up active
    const benchMon = makeGameCard({ name: "Ralts", hp: "60" });
    state.players[0].bench.cards.push(benchMon);

    const ctx = createEffectContext(state, 0, state.players[0].active!);
    const collected = ctx.pickUpPokemon(state.players[0].active!.instanceId, "player");

    // Should collect energy + tool + Pokemon = 3 cards
    expect(collected.length).toBe(3);
    expect(state.players[0].active).toBeNull();
    // The Pokemon should have been reset
    const pokemon = collected.find(c => c.card.name === "Charizard ex");
    expect(pokemon!.damageCounters).toBe(0);
    expect(pokemon!.statusConditions).toEqual([]);
    expect(pokemon!.attachedEnergy).toEqual([]);
    expect(pokemon!.attachedTools).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// 3. Name-based Trainer Effects
// ═══════════════════════════════════════════════

describe("Trainer Effects (Name-based) - Iono", () => {
  it("Iono: 双方洗手牌入牌组，按奖励卡数抽牌", async () => {
    initializeEffects();
    const state = setupGame();

    // Give both players some hand cards
    for (let i = 0; i < 4; i++) {
      state.players[0].hand.cards.push(makeGameCard({ name: `Alice Hand ${i}` }));
      state.players[1].hand.cards.push(makeGameCard({ name: `Bob Hand ${i}` }));
    }

    // Alice has 3 prizes, Bob has 3 prizes
    // After Iono: Alice draws 3, Bob draws 3

    // Play Iono using any ID (name-based matching)
    const iono = makeGameCard({
      id: "sv2-254",
      name: "Iono",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    state.players[0].hand.cards.push(iono);

    const result = await playSupporter(state, iono.instanceId);
    expect(result.success).toBe(true);

    // Alice should have exactly 3 cards (= her prize count)
    expect(state.players[0].hand.cards.length).toBe(3);
    // Bob should have exactly 3 cards (= his prize count)
    expect(state.players[1].hand.cards.length).toBe(3);
  });
});

describe("Trainer Effects (Name-based) - Judge", () => {
  it("Judge: 双方洗手牌入牌组，各抽 4 张", async () => {
    initializeEffects();
    const state = setupGame();

    for (let i = 0; i < 6; i++) {
      state.players[0].hand.cards.push(makeGameCard({ name: `Hand ${i}` }));
      state.players[1].hand.cards.push(makeGameCard({ name: `Opp Hand ${i}` }));
    }

    const judge = makeGameCard({
      name: "Judge",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    state.players[0].hand.cards.push(judge);

    const result = await playSupporter(state, judge.instanceId);
    expect(result.success).toBe(true);
    expect(state.players[0].hand.cards.length).toBe(4);
    expect(state.players[1].hand.cards.length).toBe(4);
  });
});

describe("Trainer Effects (Name-based) - Nemona", () => {
  it("Nemona: 抽 3 张", async () => {
    initializeEffects();
    const state = setupGame();

    const nemona = makeGameCard({
      name: "Nemona",
      supertype: "Trainer",
      subtypes: ["Supporter"],
    });
    state.players[0].hand.cards.push(nemona);
    const handBefore = state.players[0].hand.cards.length;

    const result = await playSupporter(state, nemona.instanceId);
    expect(result.success).toBe(true);
    // Drew 3 cards (hand was 1 before playing, minus supporter, plus 3)
    expect(state.players[0].hand.cards.length).toBe(handBefore - 1 + 3);
  });
});

describe("Trainer Effects (Name-based) - Ultra Ball", () => {
  it("Ultra Ball: 丢弃 2 张搜索宝可梦", async () => {
    initializeEffects();
    const state = setupGame();

    // Give hand cards to discard
    for (let i = 0; i < 3; i++) {
      state.players[0].hand.cards.push(makeGameCard({ name: `Fodder ${i}` }));
    }

    const ultraBall = makeGameCard({
      name: "Ultra Ball",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(ultraBall);

    const handBefore = state.players[0].hand.cards.length;
    const result = await playItem(state, ultraBall.instanceId);

    expect(result.success).toBe(true);
    // Hand: started with 3 fodder + ultra ball = 4
    // Ultra ball removed from hand by engine (-1)
    // Effect: discard 2 from hand (-2), search 1 Pokemon (+1)
    // Net: 4 - 1 - 2 + 1 = 2
    expect(state.players[0].hand.cards.length).toBe(handBefore - 1 - 2 + 1);
  });
});

describe("Trainer Effects (Name-based) - Switch", () => {
  it("Switch: 切换自己的战斗宝可梦", async () => {
    initializeEffects();
    const state = setupGame();

    const benchMon = makeGameCard({ name: "Snorlax", hp: "150" });
    state.players[0].bench.cards.push(benchMon);

    const switchCard = makeGameCard({
      name: "Switch",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(switchCard);

    const result = await playItem(state, switchCard.instanceId);
    expect(result.success).toBe(true);
    expect(state.players[0].active!.card.name).toBe("Snorlax");
  });
});

describe("Trainer Effects (Name-based) - Potion", () => {
  it("Potion: 治疗 30 HP", async () => {
    initializeEffects();
    const state = setupGame();
    state.players[0].active!.damageCounters = 5; // 50 damage

    const potion = makeGameCard({
      name: "Potion",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(potion);

    await playItem(state, potion.instanceId);
    expect(state.players[0].active!.damageCounters).toBe(2); // 50 - 30 = 20, 2 counters
  });
});

describe("Trainer Effects (Name-based) - Night Stretcher", () => {
  it("Night Stretcher: 从弃牌堆取回 1 只宝可梦", async () => {
    initializeEffects();
    const state = setupGame();

    const discardedPokemon = makeGameCard({ name: "Gardevoir", hp: "120" });
    state.players[0].discard.cards.push(discardedPokemon);

    const nightStretcher = makeGameCard({
      name: "Night Stretcher",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(nightStretcher);

    await playItem(state, nightStretcher.instanceId);
    expect(state.players[0].hand.cards.some(c => c.card.name === "Gardevoir")).toBe(true);
  });
});

describe("Trainer Effects (Name-based) - Energy Search", () => {
  it("Energy Search: 搜索 1 张基础能量", async () => {
    initializeEffects();
    const state = setupGame();

    const energySearch = makeGameCard({
      name: "Energy Search",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(energySearch);

    await playItem(state, energySearch.instanceId);
    // Should have found the Fire Energy we put in deck in setupGame
    expect(state.players[0].hand.cards.some(c => c.card.name === "Fire Energy")).toBe(true);
  });
});

describe("Trainer Effects (Name-based) - Pokemon Catcher", () => {
  it("Pokemon Catcher 正面: 换对手战斗区", async () => {
    initializeEffects();
    setRandomFn(() => 0.9); // Always heads
    const state = setupGame();

    const benchMon = makeGameCard({ name: "Geodude", hp: "60" });
    state.players[1].bench.cards.push(benchMon);

    const catcher = makeGameCard({
      name: "Pokémon Catcher",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(catcher);

    await playItem(state, catcher.instanceId);
    expect(state.players[1].active!.card.name).toBe("Geodude");
  });

  it("Pokemon Catcher 反面: 无效果", async () => {
    initializeEffects();
    setRandomFn(() => 0.1); // Always tails
    const state = setupGame();

    const benchMon = makeGameCard({ name: "Geodude", hp: "60" });
    state.players[1].bench.cards.push(benchMon);

    const catcher = makeGameCard({
      name: "Pokémon Catcher",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(catcher);

    await playItem(state, catcher.instanceId);
    expect(state.players[1].active!.card.name).toBe("Pikachu ex"); // unchanged
  });
});

describe("Trainer Effects (Name-based) - Super Rod", () => {
  it("Super Rod: 从弃牌堆洗回宝可梦/能量到牌组", async () => {
    initializeEffects();
    const state = setupGame();

    const discardedMon = makeGameCard({ name: "Gardevoir", hp: "120" });
    const discardedEnergy = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    state.players[0].discard.cards.push(discardedMon, discardedEnergy);

    const deckBefore = state.players[0].deck.cards.length;

    const superRod = makeGameCard({
      name: "Super Rod",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(superRod);

    await playItem(state, superRod.instanceId);
    // Both cards should be back in deck
    expect(state.players[0].deck.cards.length).toBe(deckBefore + 2);
    // Discard has 1 card left: the Super Rod itself (discarded after use by engine)
    expect(state.players[0].discard.cards.length).toBe(1);
    expect(state.players[0].discard.cards[0].card.name).toBe("Super Rod");
  });
});

describe("Trainer Effects (Name-based) - Pal Pad", () => {
  it("Pal Pad: 从弃牌堆洗 2 张支持者回牌组", async () => {
    initializeEffects();
    const state = setupGame();

    const supporter1 = makeGameCard({ name: "Iono", supertype: "Trainer", subtypes: ["Supporter"] });
    const supporter2 = makeGameCard({ name: "Judge", supertype: "Trainer", subtypes: ["Supporter"] });
    state.players[0].discard.cards.push(supporter1, supporter2);

    const deckBefore = state.players[0].deck.cards.length;

    const palPad = makeGameCard({
      name: "Pal Pad",
      supertype: "Trainer",
      subtypes: ["Item"],
    });
    state.players[0].hand.cards.push(palPad);

    await playItem(state, palPad.instanceId);
    expect(state.players[0].deck.cards.length).toBe(deckBefore + 2);
  });
});

// ═══════════════════════════════════════════════
// 4. Attacker Tool Damage Modifiers
// ═══════════════════════════════════════════════

describe("Tool Effects - Attacker Damage Modifiers", () => {
  it("Vitality Band: +10 伤害", () => {
    initializeEffects();
    const state = setupGame();

    // Attach Vitality Band to attacker
    const vb = makeGameCard({
      name: "Vitality Band",
      supertype: "Trainer",
      subtypes: ["Pokémon Tool"],
    });
    state.players[0].active!.attachedTools.push(vb);

    // Give energy for attack
    for (let i = 0; i < 2; i++) {
      const e = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Fire"] });
      state.players[0].active!.attachedEnergy.push(e);
    }

    // Burning Dark does 180 base damage
    performAttack(state, 0, "Burning Dark");
    // 180 + 10 = 190 damage. Pikachu ex HP = 200
    expect(state.players[1].active!.damageCounters).toBe(19); // 190 / 10
  });

  it("Choice Belt: +30 对 ex 宝可梦", () => {
    initializeEffects();
    const state = setupGame();

    const cb = makeGameCard({
      name: "Choice Belt",
      supertype: "Trainer",
      subtypes: ["Pokémon Tool"],
    });
    state.players[0].active!.attachedTools.push(cb);

    for (let i = 0; i < 2; i++) {
      const e = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Fire"] });
      state.players[0].active!.attachedEnergy.push(e);
    }

    // Pikachu ex is an ex → +30
    // 180 + 30 = 210, Pikachu ex HP = 200 → KO!
    performAttack(state, 0, "Burning Dark");
    expect(state.players[1].active).toBeNull(); // KO'd
  });

  it("Choice Belt: 不加对普通宝可梦", () => {
    initializeEffects();
    const state = setupGame();

    // Replace defender with non-ex
    state.players[1].active = makeGameCard({
      name: "Pikachu",
      hp: "60",
      types: ["Lightning"],
      subtypes: ["Basic"],
      attacks: [{ name: "Thunderbolt", damage: "50", cost: [], text: "", convertedEnergyCost: 0 }],
    });

    const cb = makeGameCard({
      name: "Choice Belt",
      supertype: "Trainer",
      subtypes: ["Pokémon Tool"],
    });
    state.players[0].active!.attachedTools.push(cb);

    for (let i = 0; i < 2; i++) {
      const e = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Fire"] });
      state.players[0].active!.attachedEnergy.push(e);
    }

    // Pikachu is not ex → no +30. 180 damage to 60 HP → KO
    // But let's verify no +30: if we KO with 180 we can't distinguish
    // Let's just test the defense modifier doesn't add 30
    // Actually since Pikachu is 60 HP and 180 base, both KO it.
    // Let's verify that when we use a weaker attack it doesn't add 30
    // Change attacker to have a weaker attack
    state.players[0].active!.card.attacks = [
      { name: "Flare", damage: "30", cost: [], text: "", convertedEnergyCost: 0 },
    ];

    performAttack(state, 0, "Flare");
    // Should be 30 (no +30 since non-ex). Pikachu 60 HP → 3 damage counters
    expect(state.players[1].active!.damageCounters).toBe(3);
  });

  it("Defiance Band: +30 落后时", () => {
    initializeEffects();
    const state = setupGame();

    // Make player behind on prizes (more remaining = behind)
    state.players[0].prizes.cards.push(makeGameCard({ name: "Extra Prize" }));
    // Now: Alice has 4 prizes, Bob has 3 → Alice is behind

    const db = makeGameCard({
      name: "Defiance Band",
      supertype: "Trainer",
      subtypes: ["Pokémon Tool"],
    });
    state.players[0].active!.attachedTools.push(db);

    for (let i = 0; i < 2; i++) {
      const e = makeGameCard({ name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Fire"] });
      state.players[0].active!.attachedEnergy.push(e);
    }

    // 180 + 30 = 210, Pikachu ex HP = 200 → KO!
    performAttack(state, 0, "Burning Dark");
    expect(state.players[1].active).toBeNull(); // KO'd
  });
});

// ═══════════════════════════════════════════════
// 5. initializeEffects includes name-based
// ═══════════════════════════════════════════════

describe("initializeEffects with name-based effects", () => {
  it("注册了名称效果", () => {
    initializeEffects();
    expect(getNameRegisteredCount()).toBeGreaterThan(20);
  });

  it("竞技常用卡牌都可通过名称找到效果", () => {
    initializeEffects();
    const commonCards = [
      "Iono", "Judge", "Nemona", "Arven", "Penny",
      "Ultra Ball", "Switch", "Night Stretcher", "Buddy-Buddy Poffin",
      "Super Rod", "Potion", "Energy Search", "Pal Pad",
      "Choice Belt", "Vitality Band", "Defiance Band",
      "Boss's Orders", "Professor's Research",
      "Nest Ball", "Energy Switch",
      "Air Balloon", "Sacred Charm",
    ];

    for (const name of commonCards) {
      expect(hasEffect("any-id", name)).toBe(true);
    }
  });

  it("ID 注册效果不受影响", () => {
    initializeEffects();
    // Original ID-based effects still work
    expect(hasEffect("me1-114")).toBe(true); // Boss's Orders
    expect(hasEffect("sv1-189")).toBe(true); // Professor's Research
    expect(hasEffect("me1-6")).toBe(true); // Tangela
  });
});
