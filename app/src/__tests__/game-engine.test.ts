/**
 * Game Engine Core Tests
 *
 * Tests game state creation, zone management, and battle setup.
 */

import { Card } from "@/types/card";
import {
  createGameCard,
  createZone,
  createPlayer,
  createGameState,
  logEvent,
  resetInstanceCounter,
} from "@/engine/game-state";
import {
  shuffleZone,
  drawFromTop,
  drawMultiple,
  addToBottom,
  addToTop,
  addCards,
  removeCard,
  findCard,
  hasBasicPokemon,
  getBasicPokemon,
  zoneSize,
  isZoneEmpty,
  moveCard,
} from "@/engine/zones";
import { loadDeckCards, initializeGame } from "@/engine/battle-setup";
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

const basicPokemon = makeCard({ id: "sv1-1", name: "Pineco", subtypes: ["Basic"] });
const stage1Pokemon = makeCard({ id: "sv1-10", name: "Forretress", subtypes: ["Stage 1"] });
const exPokemon = makeCard({ id: "sv2-50", name: "Charizard ex", subtypes: ["Stage 2", "ex"], hp: "330" });
const trainerCard = makeCard({ id: "sv1-200", name: "Professor's Research", supertype: "Trainer", subtypes: ["Supporter"] });
const energyCard = makeCard({ id: "sve-2", name: "Basic Fire Energy", supertype: "Energy", subtypes: ["Basic"] });

// ─── Game State Tests ───

describe("Game State", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  describe("createGameCard", () => {
    it("创建 GameCard 实例", () => {
      const gc = createGameCard(basicPokemon);
      expect(gc.instanceId).toMatch(/^gc-/);
      expect(gc.cardId).toBe("sv1-1");
      expect(gc.card.name).toBe("Pineco");
      expect(gc.damageCounters).toBe(0);
      expect(gc.attachedEnergy).toHaveLength(0);
      expect(gc.statusConditions).toHaveLength(0);
      expect(gc.playedThisTurn).toBe(false);
    });

    it("每次创建的 instanceId 唯一", () => {
      const gc1 = createGameCard(basicPokemon);
      const gc2 = createGameCard(basicPokemon);
      expect(gc1.instanceId).not.toBe(gc2.instanceId);
    });
  });

  describe("createPlayer", () => {
    it("创建空的玩家状态", () => {
      const player = createPlayer("p1", "玩家 1");
      expect(player.id).toBe("p1");
      expect(player.name).toBe("玩家 1");
      expect(player.deck.cards).toHaveLength(0);
      expect(player.hand.cards).toHaveLength(0);
      expect(player.active).toBeNull();
      expect(player.bench.cards).toHaveLength(0);
      expect(player.prizes.cards).toHaveLength(0);
      expect(player.discard.cards).toHaveLength(0);
      expect(player.energyAttachedThisTurn).toBe(false);
      expect(player.supporterUsedThisTurn).toBe(false);
    });
  });

  describe("createGameState", () => {
    it("创建初始游戏状态", () => {
      const state = createGameState("玩家 A", "玩家 B");
      expect(state.gameId).toMatch(/^game-/);
      expect(state.players).toHaveLength(2);
      expect(state.players[0].name).toBe("玩家 A");
      expect(state.players[1].name).toBe("玩家 B");
      expect(state.phase).toBe("not_started");
      expect(state.turn).toBe(0);
      expect(state.winner).toBeNull();
      expect(state.log).toHaveLength(0);
    });
  });

  describe("logEvent", () => {
    it("记录游戏事件", () => {
      const state = createGameState("A", "B");
      logEvent(state, 0, "draw_card", "玩家 A 抽了一张牌");
      expect(state.log).toHaveLength(1);
      expect(state.log[0].playerIndex).toBe(0);
      expect(state.log[0].type).toBe("draw_card");
      expect(state.log[0].message).toBe("玩家 A 抽了一张牌");
      expect(state.log[0].timestamp).toBeTruthy();
    });
  });
});

// ─── Zone Management Tests ───

describe("Zone Management", () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  describe("基本操作", () => {
    it("创建空区域", () => {
      const zone = createZone();
      expect(zoneSize(zone)).toBe(0);
      expect(isZoneEmpty(zone)).toBe(true);
    });

    it("创建带卡牌的区域", () => {
      const gc = createGameCard(basicPokemon);
      const zone = createZone([gc]);
      expect(zoneSize(zone)).toBe(1);
      expect(isZoneEmpty(zone)).toBe(false);
    });

    it("添加到底部", () => {
      const zone = createZone();
      const gc1 = createGameCard(basicPokemon);
      const gc2 = createGameCard(exPokemon);
      addToBottom(zone, gc1);
      addToBottom(zone, gc2);
      expect(zone.cards[0].cardId).toBe("sv1-1");
      expect(zone.cards[1].cardId).toBe("sv2-50");
    });

    it("添加到顶部", () => {
      const zone = createZone();
      const gc1 = createGameCard(basicPokemon);
      const gc2 = createGameCard(exPokemon);
      addToBottom(zone, gc1);
      addToTop(zone, gc2);
      expect(zone.cards[0].cardId).toBe("sv2-50");
      expect(zone.cards[1].cardId).toBe("sv1-1");
    });

    it("批量添加", () => {
      const zone = createZone();
      const cards = [createGameCard(basicPokemon), createGameCard(exPokemon)];
      addCards(zone, cards);
      expect(zoneSize(zone)).toBe(2);
    });
  });

  describe("抽牌", () => {
    it("从顶部抽一张", () => {
      const gc1 = createGameCard(basicPokemon);
      const gc2 = createGameCard(exPokemon);
      const zone = createZone([gc1, gc2]);

      const drawn = drawFromTop(zone);
      expect(drawn?.cardId).toBe("sv1-1");
      expect(zoneSize(zone)).toBe(1);
    });

    it("空区域抽牌返回 null", () => {
      const zone = createZone();
      expect(drawFromTop(zone)).toBeNull();
    });

    it("抽多张", () => {
      const cards = Array.from({ length: 10 }, (_, i) =>
        createGameCard(makeCard({ id: `sv1-${i}`, name: `Card ${i}` }))
      );
      const zone = createZone(cards);

      const drawn = drawMultiple(zone, 7);
      expect(drawn).toHaveLength(7);
      expect(zoneSize(zone)).toBe(3);
    });

    it("抽牌数超过区域卡牌数", () => {
      const zone = createZone([createGameCard(basicPokemon)]);
      const drawn = drawMultiple(zone, 5);
      expect(drawn).toHaveLength(1);
      expect(isZoneEmpty(zone)).toBe(true);
    });
  });

  describe("查找和移除", () => {
    it("按 instanceId 查找卡牌", () => {
      const gc = createGameCard(basicPokemon);
      const zone = createZone([gc]);

      expect(findCard(zone, gc.instanceId)).toBe(gc);
      expect(findCard(zone, "nonexistent")).toBeUndefined();
    });

    it("按 instanceId 移除卡牌", () => {
      const gc1 = createGameCard(basicPokemon);
      const gc2 = createGameCard(exPokemon);
      const zone = createZone([gc1, gc2]);

      const removed = removeCard(zone, gc1.instanceId);
      expect(removed).toBe(gc1);
      expect(zoneSize(zone)).toBe(1);
    });

    it("移除不存在的卡牌返回 null", () => {
      const zone = createZone();
      expect(removeCard(zone, "nonexistent")).toBeNull();
    });
  });

  describe("区域间移动", () => {
    it("从一个区域移到另一个", () => {
      const gc = createGameCard(basicPokemon);
      const from = createZone([gc]);
      const to = createZone();

      const moved = moveCard(from, to, gc.instanceId);
      expect(moved).toBe(gc);
      expect(isZoneEmpty(from)).toBe(true);
      expect(zoneSize(to)).toBe(1);
    });
  });

  describe("宝可梦过滤", () => {
    it("检测基础宝可梦", () => {
      const zone = createZone([
        createGameCard(basicPokemon),
        createGameCard(trainerCard),
      ]);
      expect(hasBasicPokemon(zone)).toBe(true);
    });

    it("无基础宝可梦", () => {
      const zone = createZone([
        createGameCard(stage1Pokemon),
        createGameCard(trainerCard),
      ]);
      expect(hasBasicPokemon(zone)).toBe(false);
    });

    it("获取所有基础宝可梦", () => {
      const zone = createZone([
        createGameCard(basicPokemon),
        createGameCard(stage1Pokemon),
        createGameCard(basicPokemon),
      ]);
      expect(getBasicPokemon(zone)).toHaveLength(2);
    });
  });

  describe("shuffleZone", () => {
    it("洗牌不改变数量", () => {
      const cards = Array.from({ length: 20 }, (_, i) =>
        createGameCard(makeCard({ id: `sv1-${i}` }))
      );
      const zone = createZone(cards);
      shuffleZone(zone);
      expect(zoneSize(zone)).toBe(20);
    });
  });
});

// ─── Battle Setup Tests ───

describe("Battle Setup", () => {
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
      id: `deck-${Date.now()}`,
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
    // Return a basic Pokemon for sv1-* IDs below 100
    const num = parseInt(id.split("-")[1]);
    if (id.startsWith("sv1-") && num < 100) {
      return makeCard({
        id,
        name: `Pokemon ${num}`,
        subtypes: ["Basic"],
      });
    }
    // Return a trainer for sv1-100+ IDs
    if (id.startsWith("sv1-") && num >= 100) {
      return makeCard({
        id,
        name: `Trainer ${num - 99}`,
        supertype: "Trainer",
        subtypes: ["Item"],
      });
    }
    // Return energy
    if (id === "sve-2") {
      return makeCard({
        id: "sve-2",
        name: "Basic Fire Energy",
        supertype: "Energy",
        subtypes: ["Basic"],
      });
    }
    return undefined;
  }

  describe("loadDeckCards", () => {
    it("加载卡组中的所有卡牌", () => {
      const deck = createMockDeck();
      const result = loadDeckCards(deck, mockCardLookup);

      expect(result.totalLoaded).toBe(60);
      expect(result.totalExpected).toBe(60);
      expect(result.missingCards).toHaveLength(0);
      expect(result.gameCards).toHaveLength(60);
    });

    it("报告缺失的卡牌", () => {
      const deck = createMockDeck();
      // Add a card that won't be found
      deck.cards.push({
        cardId: "unknown-999",
        name: "Unknown Card",
        quantity: 1,
        setCode: "XXX",
        number: "999",
        category: "pokemon",
        found: true, // marked found in deck, but not in cardLookup
        standardLegal: true,
      });

      const result = loadDeckCards(deck, mockCardLookup);
      expect(result.missingCards).toContain("unknown-999");
      expect(result.totalLoaded).toBe(60); // only the 60 known cards
    });
  });

  describe("initializeGame", () => {
    it("成功初始化对战", () => {
      const deck1 = createMockDeck("Deck A");
      const deck2 = createMockDeck("Deck B");

      const result = initializeGame(deck1, deck2, mockCardLookup, "Alice", "Bob");

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.gameState).not.toBeNull();

      const state = result.gameState!;
      expect(state.phase).toBe("draw");
      expect(state.turn).toBe(1);
      expect(state.players[0].name).toBe("Alice");
      expect(state.players[1].name).toBe("Bob");

      // Each player should have: 7 hand + 6 prizes + rest in deck
      for (const player of state.players) {
        expect(player.hand.cards).toHaveLength(7);
        expect(player.prizes.cards).toHaveLength(6);
        expect(player.deck.cards).toHaveLength(60 - 7 - 6); // 47
      }
    });

    it("事件日志记录了关键步骤", () => {
      const deck1 = createMockDeck("Deck A");
      const deck2 = createMockDeck("Deck B");

      const result = initializeGame(deck1, deck2, mockCardLookup);
      const state = result.gameState!;

      expect(state.log.length).toBeGreaterThanOrEqual(5);
      expect(state.log.some((e) => e.type === "game_start")).toBe(true);
      expect(state.log.some((e) => e.message.includes("洗牌"))).toBe(true);
      expect(state.log.some((e) => e.message.includes("初始手牌"))).toBe(true);
      expect(state.log.some((e) => e.message.includes("奖励卡"))).toBe(true);
    });

    it("无效卡组拒绝初始化", () => {
      const deck1 = createMockDeck("Deck A");
      const deck2 = createMockDeck("Deck B");
      deck2.isValid = false;
      deck2.errors = ["卡组不合法"];

      const result = initializeGame(deck1, deck2, mockCardLookup);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.gameState).toBeNull();
    });

    it("导入的卡牌能在对战中使用", () => {
      const deck1 = createMockDeck("Deck A");
      const deck2 = createMockDeck("Deck B");

      const result = initializeGame(deck1, deck2, mockCardLookup);
      const state = result.gameState!;

      // Verify cards in hand are real GameCard instances with card data
      for (const player of state.players) {
        for (const gc of player.hand.cards) {
          expect(gc.instanceId).toBeTruthy();
          expect(gc.cardId).toBeTruthy();
          expect(gc.card).toBeDefined();
          expect(gc.card.name).toBeTruthy();
          expect(gc.card.supertype).toBeTruthy();
        }
      }

      // Verify cards in deck are real
      for (const player of state.players) {
        for (const gc of player.deck.cards) {
          expect(gc.card).toBeDefined();
          expect(gc.card.images).toBeDefined();
        }
      }

      // Verify prize cards are real
      for (const player of state.players) {
        for (const gc of player.prizes.cards) {
          expect(gc.card).toBeDefined();
        }
      }
    });
  });
});
