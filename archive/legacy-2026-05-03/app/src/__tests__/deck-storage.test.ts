/**
 * Deck Storage Service Tests
 *
 * Tests localStorage-based deck persistence,
 * deck creation from validation results, and integrity checks.
 */

import {
  StoredDeck,
  createStoredDeck,
  saveDeck,
  getAllDecks,
  getDeckById,
  deleteDeck,
  getValidDecks,
  getDeckCardIds,
  checkDeckIntegrity,
} from "@/services/deck-storage";
import { DeckValidation } from "@/lib/deck-parser";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

// Mock validation result
function createMockValidation(overrides?: Partial<DeckValidation>): DeckValidation {
  return {
    isValid: true,
    totalCards: 60,
    errors: [],
    warnings: [],
    cardDetails: [
      {
        entry: { quantity: 4, name: "Charizard ex", setCode: "OBF", number: "125", category: "pokemon" },
        cardId: "sv3-125",
        found: true,
        standardLegal: true,
      },
      {
        entry: { quantity: 4, name: "Ultra Ball", setCode: "SVI", number: "196", category: "trainer" },
        cardId: "sv1-196",
        found: true,
        standardLegal: true,
      },
      {
        entry: { quantity: 12, name: "Basic Fire Energy", setCode: "SVE", number: "2", category: "energy" },
        cardId: "sve-2",
        found: true,
        standardLegal: true,
      },
    ],
    ...overrides,
  };
}

describe("Deck Storage Service", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe("createStoredDeck", () => {
    it("从验证结果创建 StoredDeck", () => {
      const validation = createMockValidation();
      const deck = createStoredDeck(validation, "test deck text");

      expect(deck.id).toMatch(/^deck-/);
      expect(deck.name).toContain("Charizard ex");
      expect(deck.totalCards).toBe(60);
      expect(deck.isValid).toBe(true);
      expect(deck.deckText).toBe("test deck text");
      expect(deck.cards).toHaveLength(3);
      expect(deck.createdAt).toBeTruthy();
    });

    it("卡牌字段正确映射", () => {
      const validation = createMockValidation();
      const deck = createStoredDeck(validation, "text");

      const card = deck.cards[0];
      expect(card.cardId).toBe("sv3-125");
      expect(card.name).toBe("Charizard ex");
      expect(card.quantity).toBe(4);
      expect(card.setCode).toBe("OBF");
      expect(card.number).toBe("125");
      expect(card.category).toBe("pokemon");
      expect(card.found).toBe(true);
      expect(card.standardLegal).toBe(true);
    });

    it("无效卡组标记正确", () => {
      const validation = createMockValidation({
        isValid: false,
        errors: ["卡组应包含 60 张卡牌"],
      });
      const deck = createStoredDeck(validation, "text");
      expect(deck.isValid).toBe(false);
      expect(deck.errors).toContain("卡组应包含 60 张卡牌");
    });
  });

  describe("saveDeck / getAllDecks", () => {
    it("保存和读取卡组", () => {
      const deck = createStoredDeck(createMockValidation(), "text");
      saveDeck(deck);

      const decks = getAllDecks();
      expect(decks).toHaveLength(1);
      expect(decks[0].id).toBe(deck.id);
    });

    it("多副卡组保存", () => {
      const deck1 = createStoredDeck(createMockValidation(), "text1");
      const deck2 = createStoredDeck(createMockValidation(), "text2");
      saveDeck(deck1);
      saveDeck(deck2);

      expect(getAllDecks()).toHaveLength(2);
    });

    it("相同 ID 的卡组覆盖更新", () => {
      const deck = createStoredDeck(createMockValidation(), "original");
      saveDeck(deck);

      deck.deckText = "updated";
      saveDeck(deck);

      const decks = getAllDecks();
      expect(decks).toHaveLength(1);
      expect(decks[0].deckText).toBe("updated");
    });
  });

  describe("getDeckById", () => {
    it("按 ID 获取卡组", () => {
      const deck = createStoredDeck(createMockValidation(), "text");
      saveDeck(deck);

      const found = getDeckById(deck.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe(deck.name);
    });

    it("不存在的 ID 返回 undefined", () => {
      expect(getDeckById("nonexistent")).toBeUndefined();
    });
  });

  describe("deleteDeck", () => {
    it("删除卡组", () => {
      const deck = createStoredDeck(createMockValidation(), "text");
      saveDeck(deck);
      expect(getAllDecks()).toHaveLength(1);

      const result = deleteDeck(deck.id);
      expect(result).toBe(true);
      expect(getAllDecks()).toHaveLength(0);
    });

    it("删除不存在的卡组返回 false", () => {
      expect(deleteDeck("nonexistent")).toBe(false);
    });
  });

  describe("getValidDecks", () => {
    it("仅返回合法卡组", () => {
      const validDeck = createStoredDeck(createMockValidation(), "valid");
      const invalidDeck = createStoredDeck(
        createMockValidation({ isValid: false, errors: ["error"] }),
        "invalid"
      );
      saveDeck(validDeck);
      saveDeck(invalidDeck);

      const valid = getValidDecks();
      expect(valid).toHaveLength(1);
      expect(valid[0].isValid).toBe(true);
    });
  });

  describe("getDeckCardIds", () => {
    it("展开卡牌 ID 按数量", () => {
      const deck = createStoredDeck(createMockValidation(), "text");
      const ids = getDeckCardIds(deck);

      // 4 Charizard + 4 Ultra Ball + 12 Fire Energy = 20
      expect(ids).toHaveLength(20);
      expect(ids.filter((id) => id === "sv3-125")).toHaveLength(4);
      expect(ids.filter((id) => id === "sv1-196")).toHaveLength(4);
      expect(ids.filter((id) => id === "sve-2")).toHaveLength(12);
    });

    it("跳过未找到的卡牌", () => {
      const validation = createMockValidation();
      validation.cardDetails.push({
        entry: { quantity: 2, name: "Missing Card", setCode: "XXX", number: "1", category: "pokemon" },
        cardId: null,
        found: false,
        standardLegal: false,
      });
      const deck = createStoredDeck(validation, "text");
      const ids = getDeckCardIds(deck);

      // Should not include the missing card
      expect(ids).toHaveLength(20); // same as above, missing card skipped
    });
  });

  describe("checkDeckIntegrity", () => {
    it("健康卡组无缺失", () => {
      const deck = createStoredDeck(createMockValidation(), "text");
      const missing = checkDeckIntegrity(deck);
      expect(missing).toHaveLength(0);
    });

    it("检测未解析的卡牌", () => {
      const validation = createMockValidation();
      validation.cardDetails.push({
        entry: { quantity: 1, name: "Bad Card", setCode: "ZZZ", number: "99", category: "pokemon" },
        cardId: null,
        found: false,
        standardLegal: false,
      });
      const deck = createStoredDeck(validation, "text");
      const missing = checkDeckIntegrity(deck);
      expect(missing).toHaveLength(1);
      expect(missing[0]).toContain("Bad Card");
    });
  });
});
