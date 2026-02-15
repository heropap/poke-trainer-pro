import { Card } from "@/types/card";
import {
  loadCardsSync,
  getCardById,
  getCardsByName,
  searchCards,
  getCardsBySet,
  getStandardLegalCards,
  isStandardLegal,
  getAvailableTypes,
  getAvailableSets,
  queryCards,
  clearCache,
} from "@/services/card-service";

// Test fixture data
const testCards: Card[] = [
  {
    id: "sv1-1",
    name: "Pineco",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "60",
    types: ["Grass"],
    attacks: [
      {
        cost: ["Colorless", "Colorless"],
        name: "Guard Press",
        damage: "10",
        text: "During your opponent's next turn, this Pokémon takes 30 less damage.",
        convertedEnergyCost: 2,
      },
    ],
    weaknesses: [{ type: "Fire", value: "×2" }],
    retreatCost: ["Colorless", "Colorless"],
    convertedRetreatCost: 2,
    number: "1",
    rarity: "Common",
    legalities: { unlimited: "Legal", standard: "Legal", expanded: "Legal" },
    regulationMark: "G",
    images: {
      small: "https://images.pokemontcg.io/sv1/1.png",
      large: "https://images.pokemontcg.io/sv1/1_hires.png",
    },
    set: "sv1",
  },
  {
    id: "sv1-2",
    name: "Heracross",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "120",
    types: ["Grass"],
    attacks: [
      {
        cost: ["Grass", "Colorless"],
        name: "Superpowered Throw",
        damage: "10+",
        text: "This attack does 30 more damage for each Colorless in your opponent's Active Pokémon's Retreat Cost.",
        convertedEnergyCost: 2,
      },
    ],
    weaknesses: [{ type: "Fire", value: "×2" }],
    retreatCost: ["Colorless", "Colorless"],
    convertedRetreatCost: 2,
    number: "2",
    rarity: "Uncommon",
    legalities: { unlimited: "Legal", standard: "Legal", expanded: "Legal" },
    regulationMark: "G",
    images: {
      small: "https://images.pokemontcg.io/sv1/2.png",
      large: "https://images.pokemontcg.io/sv1/2_hires.png",
    },
    set: "sv1",
  },
  {
    id: "sv2-50",
    name: "Charizard ex",
    supertype: "Pokémon",
    subtypes: ["Stage 2", "ex"],
    hp: "330",
    types: ["Fire"],
    evolvesFrom: "Charmeleon",
    attacks: [
      {
        cost: ["Fire", "Fire"],
        name: "Burning Darkness",
        damage: "180+",
        text: "This attack does 30 more damage for each Prize card your opponent has taken.",
        convertedEnergyCost: 2,
      },
    ],
    weaknesses: [{ type: "Water", value: "×2" }],
    retreatCost: ["Colorless", "Colorless"],
    convertedRetreatCost: 2,
    number: "50",
    rarity: "Double Rare",
    legalities: { unlimited: "Legal", standard: "Legal", expanded: "Legal" },
    regulationMark: "G",
    images: {
      small: "https://images.pokemontcg.io/sv2/50.png",
      large: "https://images.pokemontcg.io/sv2/50_hires.png",
    },
    set: "sv2",
  },
  {
    id: "old-1",
    name: "Dark Charizard",
    supertype: "Pokémon",
    subtypes: ["Stage 2"],
    hp: "80",
    types: ["Fire"],
    attacks: [],
    number: "1",
    legalities: { unlimited: "Legal" },
    images: {
      small: "https://example.com/old.png",
      large: "https://example.com/old_hires.png",
    },
    set: "base2",
  },
  {
    id: "sv1-200",
    name: "Professor's Research",
    supertype: "Trainer",
    subtypes: ["Supporter"],
    number: "200",
    legalities: { unlimited: "Legal", standard: "Legal", expanded: "Legal" },
    images: {
      small: "https://images.pokemontcg.io/sv1/200.png",
      large: "https://images.pokemontcg.io/sv1/200_hires.png",
    },
    set: "sv1",
  },
  {
    id: "sv1-250",
    name: "Basic Fire Energy",
    supertype: "Energy",
    subtypes: ["Basic"],
    number: "250",
    legalities: { unlimited: "Legal", standard: "Legal", expanded: "Legal" },
    images: {
      small: "https://images.pokemontcg.io/sv1/250.png",
      large: "https://images.pokemontcg.io/sv1/250_hires.png",
    },
    set: "sv1",
  },
];

describe("Card Service", () => {
  beforeEach(() => {
    clearCache();
    loadCardsSync(testCards);
  });

  afterAll(() => {
    clearCache();
  });

  describe("getCardById", () => {
    it("通过 ID 找到卡牌", () => {
      const card = getCardById("sv1-1");
      expect(card).toBeDefined();
      expect(card!.name).toBe("Pineco");
    });

    it("找不到不存在的 ID 返回 undefined", () => {
      const card = getCardById("nonexistent-999");
      expect(card).toBeUndefined();
    });
  });

  describe("getCardsByName", () => {
    it("通过名称精确匹配（不区分大小写）", () => {
      const cards = getCardsByName("pineco");
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe("sv1-1");
    });

    it("返回所有同名卡牌", () => {
      // Both Charizard ex and Dark Charizard have different names
      const cards = getCardsByName("Charizard ex");
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe("sv2-50");
    });

    it("找不到匹配时返回空数组", () => {
      const cards = getCardsByName("Mewtwo");
      expect(cards).toHaveLength(0);
    });
  });

  describe("searchCards", () => {
    it("通过部分名称搜索卡牌", () => {
      const results = searchCards("char");
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((c) => c.name === "Charizard ex")).toBe(true);
      expect(results.some((c) => c.name === "Dark Charizard")).toBe(true);
    });

    it("搜索不区分大小写", () => {
      const results = searchCards("PINECO");
      expect(results).toHaveLength(1);
    });

    it("限制返回数量", () => {
      const results = searchCards("", 2);
      expect(results).toHaveLength(2);
    });
  });

  describe("getCardsBySet", () => {
    it("按系列查询卡牌", () => {
      const sv1Cards = getCardsBySet("sv1");
      expect(sv1Cards.length).toBe(4); // Pineco, Heracross, Prof Research, Fire Energy
      expect(sv1Cards.every((c) => c.set === "sv1")).toBe(true);
    });

    it("空系列返回空数组", () => {
      const cards = getCardsBySet("nonexistent");
      expect(cards).toHaveLength(0);
    });
  });

  describe("Standard Legality", () => {
    it("过滤出 Standard 合法卡牌", () => {
      const standardCards = getStandardLegalCards();
      expect(standardCards.length).toBe(5); // All except Dark Charizard
      expect(standardCards.every((c) => c.legalities.standard === "Legal")).toBe(
        true
      );
    });

    it("检查单张卡牌的 Standard 合法性", () => {
      expect(isStandardLegal("sv1-1")).toBe(true);
      expect(isStandardLegal("old-1")).toBe(false);
      expect(isStandardLegal("nonexistent")).toBe(false);
    });
  });

  describe("getAvailableTypes", () => {
    it("返回所有可用的宝可梦类型", () => {
      const types = getAvailableTypes();
      expect(types).toContain("Grass");
      expect(types).toContain("Fire");
      expect(types.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getAvailableSets", () => {
    it("返回所有可用的系列 ID", () => {
      const sets = getAvailableSets();
      expect(sets).toContain("sv1");
      expect(sets).toContain("sv2");
      expect(sets).toContain("base2");
    });
  });

  describe("queryCards", () => {
    it("按 supertype 过滤", () => {
      const trainers = queryCards({ supertype: "Trainer" });
      expect(trainers).toHaveLength(1);
      expect(trainers[0].name).toBe("Professor's Research");
    });

    it("按 subtypes 过滤", () => {
      const exCards = queryCards({ subtypes: ["ex"] });
      expect(exCards).toHaveLength(1);
      expect(exCards[0].name).toBe("Charizard ex");
    });

    it("按 types 过滤", () => {
      const fireCards = queryCards({ types: ["Fire"] });
      expect(fireCards).toHaveLength(2); // Charizard ex, Dark Charizard
    });

    it("仅 Standard 合法过滤", () => {
      const standardFire = queryCards({
        types: ["Fire"],
        standardOnly: true,
      });
      expect(standardFire).toHaveLength(1); // Only Charizard ex
      expect(standardFire[0].name).toBe("Charizard ex");
    });

    it("组合多个过滤条件", () => {
      const results = queryCards({
        supertype: "Pokémon",
        types: ["Grass"],
        set: "sv1",
        standardOnly: true,
      });
      expect(results).toHaveLength(2); // Pineco and Heracross
    });

    it("按名称过滤", () => {
      const results = queryCards({ name: "pin" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Pineco");
    });

    it("限制返回数量", () => {
      const results = queryCards({ supertype: "Pokémon", limit: 2 });
      expect(results).toHaveLength(2);
    });
  });
});
