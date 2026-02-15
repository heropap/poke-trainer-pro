import {
  parseDeckList,
  validateDeck,
  resolveSetCode,
  buildCardId,
  DeckEntry,
} from "@/lib/deck-parser";

describe("Deck Parser", () => {
  describe("resolveSetCode", () => {
    it("将 PTCG Live 代码映射到 set ID", () => {
      expect(resolveSetCode("SVI")).toBe("sv1");
      expect(resolveSetCode("PAL")).toBe("sv2");
      expect(resolveSetCode("OBF")).toBe("sv3");
      expect(resolveSetCode("MEW")).toBe("sv3pt5");
      expect(resolveSetCode("SVE")).toBe("sve");
    });

    it("不区分大小写", () => {
      expect(resolveSetCode("svi")).toBe("sv1");
      expect(resolveSetCode("Pal")).toBe("sv2");
    });

    it("未知代码返回 null", () => {
      expect(resolveSetCode("XXX")).toBeNull();
      expect(resolveSetCode("")).toBeNull();
    });
  });

  describe("buildCardId", () => {
    it("构造 card_id", () => {
      expect(buildCardId("SVI", "1")).toBe("sv1-1");
      expect(buildCardId("OBF", "125")).toBe("sv3-125");
    });

    it("未知系列返回 null", () => {
      expect(buildCardId("XXX", "1")).toBeNull();
    });
  });

  describe("parseDeckList", () => {
    const sampleDeck = `Pokémon: 6
4 Comfey LOR 79
2 Charizard ex OBF 125

Trainer: 10
4 Battle VIP Pass FST 225
3 Boss's Orders PAL 172
3 Professor's Research SVI 190

Energy: 4
4 Basic Fire Energy SVE 2`;

    it("解析完整卡组文本", () => {
      const result = parseDeckList(sampleDeck);
      expect(result.entries).toHaveLength(6);
      expect(result.totalCards).toBe(20);
      expect(result.errors).toHaveLength(0);
    });

    it("正确分类卡牌", () => {
      const result = parseDeckList(sampleDeck);
      expect(result.pokemon).toHaveLength(2);
      expect(result.trainers).toHaveLength(3);
      expect(result.energy).toHaveLength(1);
    });

    it("正确解析卡牌字段", () => {
      const result = parseDeckList(sampleDeck);
      const comfey = result.entries[0];
      expect(comfey.quantity).toBe(4);
      expect(comfey.name).toBe("Comfey");
      expect(comfey.setCode).toBe("LOR");
      expect(comfey.number).toBe("79");
      expect(comfey.category).toBe("pokemon");
    });

    it("处理多词卡牌名", () => {
      const result = parseDeckList(sampleDeck);
      const boss = result.entries[3];
      expect(boss.name).toBe("Boss's Orders");
      expect(boss.setCode).toBe("PAL");
    });

    it("解析带有 Pokemon 拼写变体的 header", () => {
      const deck = `Pokemon: 2
2 Pikachu SVI 50`;
      const result = parseDeckList(deck);
      expect(result.pokemon).toHaveLength(1);
      expect(result.pokemon[0].name).toBe("Pikachu");
    });

    it("跳过空行", () => {
      const deck = `Pokémon: 2

2 Pikachu SVI 50

`;
      const result = parseDeckList(deck);
      expect(result.entries).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it("跳过 Total Cards 行", () => {
      const deck = `Pokémon: 2
2 Pikachu SVI 50
Total Cards: 60`;
      const result = parseDeckList(deck);
      expect(result.entries).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it("记录无法解析的行", () => {
      const deck = `Pokémon: 2
2 Pikachu SVI 50
this is garbage`;
      const result = parseDeckList(deck);
      expect(result.entries).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("第 3 行无法解析");
    });

    it("无 header 时 category 为 unknown", () => {
      const deck = `4 Pikachu SVI 50`;
      const result = parseDeckList(deck);
      expect(result.entries[0].category).toBe("unknown");
    });

    it("处理空文本", () => {
      const result = parseDeckList("");
      expect(result.entries).toHaveLength(0);
      expect(result.totalCards).toBe(0);
    });
  });

  describe("validateDeck", () => {
    const mockLookup = (id: string) => {
      const cards: Record<string, { legalities: { standard?: string } }> = {
        "sv1-50": { legalities: { standard: "Legal" } },
        "sv3-125": { legalities: { standard: "Legal" } },
        "sve-2": { legalities: { standard: "Legal" } },
        "swsh11-79": { legalities: {} }, // Not standard legal
      };
      return cards[id];
    };

    it("60 张合法卡组通过验证", () => {
      const parsed = parseDeckList(
        `Pokémon: 4
4 Pikachu SVI 50

Energy: 56
56 Basic Fire Energy SVE 2`
      );
      const result = validateDeck(parsed, mockLookup);
      expect(result.totalCards).toBe(60);
      expect(result.errors).toHaveLength(0);
      expect(result.isValid).toBe(true);
    });

    it("非 60 张卡组报错", () => {
      const parsed = parseDeckList(
        `Pokémon: 2
2 Pikachu SVI 50`
      );
      const result = validateDeck(parsed, mockLookup);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("60"))).toBe(true);
    });

    it("标记非 Standard 合法卡牌", () => {
      const parsed = parseDeckList(
        `Pokémon: 4
4 Comfey LOR 79`
      );
      const result = validateDeck(parsed, mockLookup);
      expect(result.warnings.some((w) => w.includes("非 Standard"))).toBe(
        true
      );
    });

    it("标记未知系列代码", () => {
      const parsed = parseDeckList(
        `Pokémon: 4
4 Unknown XXX 1`
      );
      const result = validateDeck(parsed, mockLookup);
      expect(result.warnings.some((w) => w.includes("未知系列代码"))).toBe(
        true
      );
    });

    it("标记找不到的卡牌", () => {
      const parsed = parseDeckList(
        `Pokémon: 4
4 Nonexistent SVI 999`
      );
      const result = validateDeck(parsed, mockLookup);
      expect(result.warnings.some((w) => w.includes("卡牌未找到"))).toBe(
        true
      );
    });

    it("超过 4 张限制报错", () => {
      const parsed = parseDeckList(
        `Pokémon: 5
5 Pikachu SVI 50`
      );
      const result = validateDeck(parsed, mockLookup);
      expect(result.errors.some((e) => e.includes("超过 4 张"))).toBe(true);
    });

    it("基础能量可以超过 4 张", () => {
      const parsed = parseDeckList(
        `Energy: 10
10 Basic Fire Energy SVE 2`
      );
      const result = validateDeck(parsed, mockLookup);
      expect(result.errors.some((e) => e.includes("超过 4 张"))).toBe(false);
    });

    it("cardDetails 包含每张卡的详情", () => {
      const parsed = parseDeckList(
        `Pokémon: 2
2 Pikachu SVI 50`
      );
      const result = validateDeck(parsed, mockLookup);
      expect(result.cardDetails).toHaveLength(1);
      expect(result.cardDetails[0].cardId).toBe("sv1-50");
      expect(result.cardDetails[0].found).toBe(true);
      expect(result.cardDetails[0].standardLegal).toBe(true);
    });
  });
});
