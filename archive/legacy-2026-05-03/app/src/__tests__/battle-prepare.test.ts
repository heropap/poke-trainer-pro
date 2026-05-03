/**
 * Battle Preparation Phase Tests
 *
 * Tests mulligan resolution, coin flip, basic Pokemon placement,
 * prize card setup, and the full preparation flow.
 */

import { Card } from "@/types/card";
import {
  createGameCard,
  createGameState,
  createZone,
  resetInstanceCounter,
  GameState,
  logEvent,
  GamePhase,
} from "@/engine/game-state";
import {
  shuffleZone,
  drawMultiple,
  addCards,
  hasBasicPokemon,
  getBasicPokemon,
  zoneSize,
} from "@/engine/zones";
import {
  performSingleMulligan,
  resolveMulligans,
  flipCoin,
  validatePlacement,
  placeBasicPokemon,
  autoPlaceBasicPokemon,
  setPrizeCards,
  executePreparation,
  INITIAL_HAND_SIZE,
  PRIZE_CARD_COUNT,
  MAX_BENCH_SIZE,
  MAX_MULLIGAN_ROUNDS,
} from "@/engine/battle-prepare";
import { initializeGame } from "@/engine/battle-setup";
import { StoredDeck } from "@/services/deck-storage";

// ─── Test Card Fixtures ───

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "sv1-1",
    name: "Pineco",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "60",
    types: ["Grass"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "https://example.com/s.png", large: "https://example.com/l.png" },
    set: "sv1",
    ...overrides,
  };
}

const basicPokemon1 = makeCard({ id: "sv1-1", name: "Pineco", subtypes: ["Basic"], hp: "60" });
const basicPokemon2 = makeCard({ id: "sv1-2", name: "Ralts", subtypes: ["Basic"], hp: "70" });
const basicPokemon3 = makeCard({ id: "sv1-3", name: "Lechonk", subtypes: ["Basic"], hp: "80" });
const basicPokemonEx = makeCard({ id: "sv2-50", name: "Charizard ex", subtypes: ["Basic", "ex"], hp: "180" });
const stage1Pokemon = makeCard({ id: "sv1-10", name: "Forretress", subtypes: ["Stage 1"] });
const trainerCard = makeCard({ id: "sv1-200", name: "Professor's Research", supertype: "Trainer", subtypes: ["Supporter"] });
const energyCard = makeCard({ id: "sve-2", name: "Basic Fire Energy", supertype: "Energy", subtypes: ["Basic"] });

/**
 * Create a game state with specific hand compositions for testing
 */
function createTestState(
  hand1Cards: Card[],
  hand2Cards: Card[],
  deckSize = 40
): GameState {
  const state = createGameState("Alice", "Bob");
  state.phase = GamePhase.SETUP;

  // Build hands
  state.players[0].hand = createZone(hand1Cards.map(createGameCard));
  state.players[1].hand = createZone(hand2Cards.map(createGameCard));

  // Build decks with basic Pokemon (so mulligans can eventually resolve)
  for (let p = 0; p < 2; p++) {
    const deckCards: Card[] = [];
    // 10 basic pokemon in deck
    for (let i = 0; i < 10; i++) {
      deckCards.push(makeCard({ id: `deck-${p}-basic-${i}`, name: `DeckPokemon ${i}`, subtypes: ["Basic"], hp: "60" }));
    }
    // Fill the rest with trainers
    for (let i = 10; i < deckSize; i++) {
      deckCards.push(makeCard({ id: `deck-${p}-trainer-${i}`, name: `Trainer ${i}`, supertype: "Trainer", subtypes: ["Item"] }));
    }
    state.players[p as 0 | 1].deck = createZone(deckCards.map(createGameCard));
  }

  return state;
}

// ─── Mulligan Tests ───

describe("Mulligan Resolution", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  describe("performSingleMulligan", () => {
    it("将手牌洗回牌组并重新抽 7 张", () => {
      // Hand with only trainers (no basics)
      const state = createTestState(
        [trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
        [basicPokemon1, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
      );

      const originalDeckSize = zoneSize(state.players[0].deck);
      const originalHandSize = zoneSize(state.players[0].hand);

      performSingleMulligan(state, 0);

      // Hand should be 7 cards again
      expect(zoneSize(state.players[0].hand)).toBe(INITIAL_HAND_SIZE);
      // Deck size should be original + 7 (put back) - 7 (drew) = same
      expect(zoneSize(state.players[0].deck)).toBe(originalDeckSize);
      // Event should be logged
      expect(state.log.some((e) => e.type === "mulligan" && e.playerIndex === 0)).toBe(true);
    });

    it("牌组不够 7 张时抽尽所有", () => {
      const state = createGameState("A", "B");
      // Tiny deck
      state.players[0].deck = createZone([
        createGameCard(basicPokemon1),
        createGameCard(basicPokemon2),
        createGameCard(basicPokemon3),
      ]);
      state.players[0].hand = createZone([
        createGameCard(trainerCard),
        createGameCard(trainerCard),
      ]);

      // After mulligan: 2 cards back in deck → deck has 5, draw 5
      performSingleMulligan(state, 0);
      expect(zoneSize(state.players[0].hand)).toBe(5);
      expect(zoneSize(state.players[0].deck)).toBe(0);
    });
  });

  describe("resolveMulligans", () => {
    it("双方都有基础宝可梦时不执行 Mulligan", () => {
      const state = createTestState(
        [basicPokemon1, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
        [basicPokemon2, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
      );

      const result = resolveMulligans(state);

      expect(result.success).toBe(true);
      expect(result.player0Mulligans).toBe(0);
      expect(result.player1Mulligans).toBe(0);
    });

    it("一方 Mulligan 后对手额外抽牌", () => {
      // Player 0 has no basics (will mulligan), Player 1 has basics
      const state = createTestState(
        [trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
        [basicPokemon1, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
      );

      const p1OriginalHand = zoneSize(state.players[1].hand);

      const result = resolveMulligans(state);

      expect(result.success).toBe(true);
      expect(result.player0Mulligans).toBeGreaterThanOrEqual(1);
      // Player 1 should have drawn extra cards
      expect(zoneSize(state.players[1].hand)).toBe(
        p1OriginalHand + result.player0Mulligans
      );
    });

    it("双方同时 Mulligan", () => {
      // Both hands have no basics
      const state = createTestState(
        [trainerCard, trainerCard, energyCard, trainerCard, energyCard, trainerCard, trainerCard],
        [energyCard, trainerCard, trainerCard, energyCard, trainerCard, trainerCard, trainerCard]
      );

      const result = resolveMulligans(state);

      expect(result.success).toBe(true);
      // Both should have mulliganed at least once
      expect(result.player0Mulligans).toBeGreaterThanOrEqual(1);
      expect(result.player1Mulligans).toBeGreaterThanOrEqual(1);
      // After resolution, both should have basics in hand (from the deck)
      expect(hasBasicPokemon(state.players[0].hand)).toBe(true);
      expect(hasBasicPokemon(state.players[1].hand)).toBe(true);
    });

    it("Mulligan 后手牌中确实有基础宝可梦", () => {
      const state = createTestState(
        [trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
        [basicPokemon1, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
      );

      resolveMulligans(state);

      expect(hasBasicPokemon(state.players[0].hand)).toBe(true);
    });

    it("记录 Mulligan 总结日志", () => {
      const state = createTestState(
        [trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
        [basicPokemon1, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
      );

      resolveMulligans(state);

      // Should have mulligan summary event
      expect(state.log.some((e) => e.type === "mulligan" && e.message.includes("阶段结束"))).toBe(true);
    });
  });
});

// ─── Coin Flip Tests ───

describe("Coin Flip", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  it("正面时玩家 0 先攻", () => {
    const state = createGameState("A", "B");
    const result = flipCoin(state, () => 0.1); // < 0.5 → heads

    expect(result.result).toBe("heads");
    expect(result.winner).toBe(0);
    expect(state.currentPlayer).toBe(0);
  });

  it("反面时玩家 1 先攻", () => {
    const state = createGameState("A", "B");
    const result = flipCoin(state, () => 0.9); // >= 0.5 → tails

    expect(result.result).toBe("tails");
    expect(result.winner).toBe(1);
    expect(state.currentPlayer).toBe(1);
  });

  it("记录掷硬币事件", () => {
    const state = createGameState("Alice", "Bob");
    flipCoin(state, () => 0.3);

    expect(state.log.some((e) => e.message.includes("掷硬币"))).toBe(true);
    expect(state.log.some((e) => e.message.includes("Alice") && e.message.includes("先攻"))).toBe(true);
  });

  it("边界值 0.5 为反面", () => {
    const state = createGameState("A", "B");
    const result = flipCoin(state, () => 0.5);

    expect(result.result).toBe("tails");
    expect(result.winner).toBe(1);
  });
});

// ─── Basic Pokemon Placement Tests ───

describe("Basic Pokemon Placement", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  describe("validatePlacement", () => {
    it("合法放置通过验证", () => {
      const state = createGameState("A", "B");
      const gc1 = createGameCard(basicPokemon1);
      const gc2 = createGameCard(basicPokemon2);
      state.players[0].hand = createZone([gc1, gc2, createGameCard(trainerCard)]);

      const errors = validatePlacement(state, 0, {
        activeInstanceId: gc1.instanceId,
        benchInstanceIds: [gc2.instanceId],
      });

      expect(errors).toHaveLength(0);
    });

    it("非基础宝可梦不能放在战斗区", () => {
      const state = createGameState("A", "B");
      const gc = createGameCard(stage1Pokemon);
      state.players[0].hand = createZone([gc]);

      const errors = validatePlacement(state, 0, {
        activeInstanceId: gc.instanceId,
        benchInstanceIds: [],
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("不是基础宝可梦");
    });

    it("训练家卡不能放在备战区", () => {
      const state = createGameState("A", "B");
      const basic = createGameCard(basicPokemon1);
      const trainer = createGameCard(trainerCard);
      state.players[0].hand = createZone([basic, trainer]);

      const errors = validatePlacement(state, 0, {
        activeInstanceId: basic.instanceId,
        benchInstanceIds: [trainer.instanceId],
      });

      expect(errors.some((e) => e.includes("不是基础宝可梦"))).toBe(true);
    });

    it("备战区超过 5 只报错", () => {
      const state = createGameState("A", "B");
      const cards = Array.from({ length: 7 }, (_, i) =>
        createGameCard(makeCard({ id: `sv1-bench-${i}`, name: `Basic ${i}`, subtypes: ["Basic"] }))
      );
      state.players[0].hand = createZone(cards);

      const errors = validatePlacement(state, 0, {
        activeInstanceId: cards[0].instanceId,
        benchInstanceIds: cards.slice(1).map((c) => c.instanceId), // 6 on bench
      });

      expect(errors.some((e) => e.includes("最多放置 5"))).toBe(true);
    });

    it("不能将同一张牌放到多个位置", () => {
      const state = createGameState("A", "B");
      const gc = createGameCard(basicPokemon1);
      state.players[0].hand = createZone([gc]);

      const errors = validatePlacement(state, 0, {
        activeInstanceId: gc.instanceId,
        benchInstanceIds: [gc.instanceId],
      });

      expect(errors.some((e) => e.includes("同一张卡牌"))).toBe(true);
    });

    it("不在手牌中的卡牌报错", () => {
      const state = createGameState("A", "B");
      state.players[0].hand = createZone([createGameCard(basicPokemon1)]);

      const errors = validatePlacement(state, 0, {
        activeInstanceId: "nonexistent-id",
        benchInstanceIds: [],
      });

      expect(errors.some((e) => e.includes("不在手牌中"))).toBe(true);
    });
  });

  describe("placeBasicPokemon", () => {
    it("成功放置战斗区和备战区", () => {
      const state = createGameState("A", "B");
      const gc1 = createGameCard(basicPokemon1);
      const gc2 = createGameCard(basicPokemon2);
      const gc3 = createGameCard(basicPokemon3);
      state.players[0].hand = createZone([gc1, gc2, gc3, createGameCard(trainerCard)]);

      const result = placeBasicPokemon(state, 0, {
        activeInstanceId: gc1.instanceId,
        benchInstanceIds: [gc2.instanceId, gc3.instanceId],
      });

      expect(result.success).toBe(true);
      expect(state.players[0].active).not.toBeNull();
      expect(state.players[0].active!.card.name).toBe("Pineco");
      expect(zoneSize(state.players[0].bench)).toBe(2);
      // Trainer stays in hand
      expect(zoneSize(state.players[0].hand)).toBe(1);
    });

    it("放置后卡牌标记为本回合已出", () => {
      const state = createGameState("A", "B");
      const gc = createGameCard(basicPokemon1);
      state.players[0].hand = createZone([gc]);

      placeBasicPokemon(state, 0, {
        activeInstanceId: gc.instanceId,
        benchInstanceIds: [],
      });

      expect(state.players[0].active!.playedThisTurn).toBe(true);
    });

    it("记录放置事件", () => {
      const state = createGameState("A", "B");
      const gc = createGameCard(basicPokemon1);
      state.players[0].hand = createZone([gc]);

      placeBasicPokemon(state, 0, {
        activeInstanceId: gc.instanceId,
        benchInstanceIds: [],
      });

      expect(state.log.some((e) => e.type === "play_pokemon" && e.message.includes("战斗区"))).toBe(true);
    });

    it("验证失败时不执行放置", () => {
      const state = createGameState("A", "B");
      const gc = createGameCard(stage1Pokemon);
      state.players[0].hand = createZone([gc]);

      const result = placeBasicPokemon(state, 0, {
        activeInstanceId: gc.instanceId,
        benchInstanceIds: [],
      });

      expect(result.success).toBe(false);
      expect(state.players[0].active).toBeNull();
    });
  });

  describe("autoPlaceBasicPokemon", () => {
    it("选择最高 HP 的基础宝可梦为战斗宝可梦", () => {
      const state = createGameState("A", "B");
      const low = createGameCard(basicPokemon1);   // 60 HP
      const mid = createGameCard(basicPokemon3);   // 80 HP
      const high = createGameCard(basicPokemonEx);  // 180 HP
      state.players[0].hand = createZone([low, mid, high, createGameCard(trainerCard)]);

      const choice = autoPlaceBasicPokemon(state, 0);

      expect(choice).not.toBeNull();
      expect(choice!.activeInstanceId).toBe(high.instanceId);
    });

    it("其余基础宝可梦放到备战区", () => {
      const state = createGameState("A", "B");
      const cards = [
        createGameCard(basicPokemon1),
        createGameCard(basicPokemon2),
        createGameCard(basicPokemon3),
      ];
      state.players[0].hand = createZone([...cards, createGameCard(trainerCard)]);

      const choice = autoPlaceBasicPokemon(state, 0);

      expect(choice!.benchInstanceIds).toHaveLength(2);
    });

    it("备战区最多 5 只", () => {
      const state = createGameState("A", "B");
      const cards = Array.from({ length: 7 }, (_, i) =>
        createGameCard(makeCard({ id: `sv1-${i}`, name: `Pokemon ${i}`, subtypes: ["Basic"], hp: `${60 + i * 10}` }))
      );
      state.players[0].hand = createZone(cards);

      const choice = autoPlaceBasicPokemon(state, 0);

      expect(choice!.benchInstanceIds.length).toBeLessThanOrEqual(MAX_BENCH_SIZE);
    });

    it("无基础宝可梦时返回 null", () => {
      const state = createGameState("A", "B");
      state.players[0].hand = createZone([
        createGameCard(trainerCard),
        createGameCard(energyCard),
      ]);

      const choice = autoPlaceBasicPokemon(state, 0);
      expect(choice).toBeNull();
    });
  });
});

// ─── Prize Card Tests ───

describe("Prize Card Setup", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  it("设置 6 张奖励卡", () => {
    const state = createGameState("A", "B");
    const deckCards = Array.from({ length: 40 }, (_, i) =>
      createGameCard(makeCard({ id: `sv1-${i}` }))
    );
    state.players[0].deck = createZone(deckCards);

    const count = setPrizeCards(state, 0);

    expect(count).toBe(PRIZE_CARD_COUNT);
    expect(zoneSize(state.players[0].prizes)).toBe(6);
    expect(zoneSize(state.players[0].deck)).toBe(34);
  });

  it("牌组不足 6 张时设置尽可能多的奖励卡", () => {
    const state = createGameState("A", "B");
    const deckCards = Array.from({ length: 3 }, (_, i) =>
      createGameCard(makeCard({ id: `sv1-${i}` }))
    );
    state.players[0].deck = createZone(deckCards);

    const count = setPrizeCards(state, 0);

    expect(count).toBe(3);
    expect(zoneSize(state.players[0].prizes)).toBe(3);
    expect(zoneSize(state.players[0].deck)).toBe(0);
  });

  it("记录奖励卡设置事件", () => {
    const state = createGameState("Alice", "B");
    const deckCards = Array.from({ length: 40 }, (_, i) =>
      createGameCard(makeCard({ id: `sv1-${i}` }))
    );
    state.players[0].deck = createZone(deckCards);

    setPrizeCards(state, 0);

    expect(state.log.some((e) => e.message.includes("奖励卡") && e.message.includes("Alice"))).toBe(true);
  });
});

// ─── Full Preparation Flow Tests ───

describe("executePreparation", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  it("完整准备流程成功", () => {
    const state = createTestState(
      [basicPokemon1, basicPokemon2, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
      [basicPokemon3, basicPokemonEx, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
    );

    const result = executePreparation(state, () => 0.3);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.coinFlipResult).not.toBeNull();

    // Both players should have active Pokemon
    expect(state.players[0].active).not.toBeNull();
    expect(state.players[1].active).not.toBeNull();

    // Prize cards set
    expect(zoneSize(state.players[0].prizes)).toBe(6);
    expect(zoneSize(state.players[1].prizes)).toBe(6);

    // Phase should be draw
    expect(state.phase).toBe(GamePhase.DRAW);
    expect(state.turn).toBe(1);
    expect(state.isFirstTurn).toBe(true);
  });

  it("包含 Mulligan 的准备流程", () => {
    // Player 0 has no basics, Player 1 has basics
    const state = createTestState(
      [trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
      [basicPokemon1, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
    );

    const result = executePreparation(state, () => 0.3);

    expect(result.success).toBe(true);
    expect(result.mulliganResult.player0Mulligans).toBeGreaterThanOrEqual(1);
    // After mulligan, player 0 should have active Pokemon placed
    expect(state.players[0].active).not.toBeNull();
  });

  it("硬币正面时玩家 0 先攻", () => {
    const state = createTestState(
      [basicPokemon1, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
      [basicPokemon2, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
    );

    const result = executePreparation(state, () => 0.1); // heads

    expect(result.coinFlipResult!.winner).toBe(0);
    expect(state.currentPlayer).toBe(0);
  });

  it("硬币反面时玩家 1 先攻", () => {
    const state = createTestState(
      [basicPokemon1, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
      [basicPokemon2, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
    );

    const result = executePreparation(state, () => 0.9); // tails

    expect(result.coinFlipResult!.winner).toBe(1);
    expect(state.currentPlayer).toBe(1);
  });

  it("总卡牌数守恒（所有区域卡牌总和不变）", () => {
    const state = createTestState(
      [basicPokemon1, basicPokemon2, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard],
      [basicPokemon3, basicPokemonEx, trainerCard, trainerCard, trainerCard, trainerCard, trainerCard]
    );

    // Count total cards before
    const totalBefore =
      zoneSize(state.players[0].deck) + zoneSize(state.players[0].hand) +
      zoneSize(state.players[1].deck) + zoneSize(state.players[1].hand);

    executePreparation(state, () => 0.3);

    // Count total cards after (including active and bench)
    const totalAfter =
      zoneSize(state.players[0].deck) + zoneSize(state.players[0].hand) +
      zoneSize(state.players[0].prizes) + zoneSize(state.players[0].bench) +
      (state.players[0].active ? 1 : 0) + zoneSize(state.players[0].discard) +
      zoneSize(state.players[1].deck) + zoneSize(state.players[1].hand) +
      zoneSize(state.players[1].prizes) + zoneSize(state.players[1].bench) +
      (state.players[1].active ? 1 : 0) + zoneSize(state.players[1].discard);

    expect(totalAfter).toBe(totalBefore);
  });
});

// ─── Integration: initializeGame with preparation ───

describe("initializeGame with preparation", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  function createMockDeck(name = "Test Deck"): StoredDeck {
    const cards = [];

    // 15 basic Pokemon
    for (let i = 0; i < 15; i++) {
      cards.push({
        cardId: `sv1-${i + 1}`,
        name: `Pokemon ${i + 1}`,
        quantity: 1,
        setCode: "SVI",
        number: String(i + 1),
        category: "pokemon" as const,
        found: true,
        standardLegal: true,
      });
    }

    // 33 trainers
    for (let i = 0; i < 33; i++) {
      cards.push({
        cardId: `sv1-${i + 100}`,
        name: `Trainer ${i + 1}`,
        quantity: 1,
        setCode: "SVI",
        number: String(i + 100),
        category: "trainer" as const,
        found: true,
        standardLegal: true,
      });
    }

    // 12 energy
    for (let i = 0; i < 12; i++) {
      cards.push({
        cardId: "sve-2",
        name: "Basic Fire Energy",
        quantity: 1,
        setCode: "SVE",
        number: "2",
        category: "energy" as const,
        found: true,
        standardLegal: true,
      });
    }

    return {
      id: `deck-${Date.now()}-${Math.random()}`,
      name,
      createdAt: new Date().toISOString(),
      deckText: "mock deck text",
      totalCards: 60,
      isValid: true,
      cards,
      warnings: [],
      errors: [],
    };
  }

  function mockCardLookup(id: string): Card | undefined {
    const num = parseInt(id.split("-")[1]);
    if (id.startsWith("sv1-") && num < 100) {
      return makeCard({
        id,
        name: `Pokemon ${num}`,
        subtypes: ["Basic"],
        hp: `${50 + num * 5}`,
      });
    }
    if (id.startsWith("sv1-") && num >= 100) {
      return makeCard({
        id,
        name: `Trainer ${num - 99}`,
        supertype: "Trainer",
        subtypes: ["Item"],
      });
    }
    if (id === "sve-2") {
      return makeCard({
        id: "sve-2",
        name: "Basic Fire Energy",
        supertype: "Energy",
        subtypes: ["Basic"],
      });
    }
    if (id.startsWith("deck-")) {
      return makeCard({ id, name: `Deck Card ${id}`, subtypes: ["Basic"] });
    }
    return undefined;
  }

  it("完整初始化后双方有战斗宝可梦", () => {
    const deck1 = createMockDeck("Deck A");
    const deck2 = createMockDeck("Deck B");

    const result = initializeGame(deck1, deck2, mockCardLookup, "Alice", "Bob", { fullPreparation: true, randomFn: () => 0.3 });

    expect(result.success).toBe(true);
    const state = result.gameState!;

    // Both players should have active Pokemon
    expect(state.players[0].active).not.toBeNull();
    expect(state.players[1].active).not.toBeNull();
    expect(state.players[0].active!.card.supertype).toBe("Pokémon");
    expect(state.players[1].active!.card.supertype).toBe("Pokémon");
  });

  it("完整初始化后双方有奖励卡", () => {
    const deck1 = createMockDeck("Deck A");
    const deck2 = createMockDeck("Deck B");

    const result = initializeGame(deck1, deck2, mockCardLookup, "Alice", "Bob", { fullPreparation: true, randomFn: () => 0.3 });
    const state = result.gameState!;

    expect(zoneSize(state.players[0].prizes)).toBe(6);
    expect(zoneSize(state.players[1].prizes)).toBe(6);
  });

  it("完整初始化后设置了先攻玩家", () => {
    const deck1 = createMockDeck("Deck A");
    const deck2 = createMockDeck("Deck B");

    const result = initializeGame(deck1, deck2, mockCardLookup, "Alice", "Bob", { fullPreparation: true, randomFn: () => 0.9 });
    const state = result.gameState!;

    // Tails → player 1 goes first
    expect(state.currentPlayer).toBe(1);
  });

  it("60 张卡牌分配守恒", () => {
    const deck1 = createMockDeck("Deck A");
    const deck2 = createMockDeck("Deck B");

    const result = initializeGame(deck1, deck2, mockCardLookup, "A", "B", { fullPreparation: true, randomFn: () => 0.3 });
    const state = result.gameState!;

    for (const player of state.players) {
      const totalCards =
        zoneSize(player.deck) +
        zoneSize(player.hand) +
        zoneSize(player.prizes) +
        zoneSize(player.bench) +
        (player.active ? 1 : 0) +
        zoneSize(player.discard);

      expect(totalCards).toBe(60);
    }
  });

  it("事件日志包含所有关键步骤", () => {
    const deck1 = createMockDeck("Deck A");
    const deck2 = createMockDeck("Deck B");

    const result = initializeGame(deck1, deck2, mockCardLookup, "Alice", "Bob", { fullPreparation: true, randomFn: () => 0.3 });
    const state = result.gameState!;

    // Should have game_start, draw_card, play_pokemon, and coin flip events
    expect(state.log.some((e) => e.type === "game_start")).toBe(true);
    expect(state.log.some((e) => e.type === "draw_card")).toBe(true);
    expect(state.log.some((e) => e.type === "play_pokemon")).toBe(true);
    // Coin flip logged as game_start type
    expect(state.log.some((e) => e.message.includes("掷硬币"))).toBe(true);
    expect(state.log.some((e) => e.message.includes("准备阶段完成"))).toBe(true);
  });
});
