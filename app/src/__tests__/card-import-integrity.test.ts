/**
 * Card Import Integrity Tests
 *
 * Verifies that previously missing cards (meg-86, meg-104, asc-39, etc.)
 * can now be correctly resolved and found through the deck import pipeline.
 *
 * Root cause: SET_CODE_MAP had incorrect mappings:
 *   MEG -> "meg" (should be "me1")
 *   ASC -> "asc" (should be "me2pt5")
 *   PFL -> "pfl" (should be "me2")
 *   MEE -> "mee" (should be "sve")
 *
 * These sets also had no downloaded data files.
 */

import { resolveSetCode, buildCardId, parseDeckList, validateDeck } from "@/lib/deck-parser";

describe("Mega Evolution era set code resolution", () => {
  it("MEG 映射到 me1 (Mega Evolution)", () => {
    expect(resolveSetCode("MEG")).toBe("me1");
  });

  it("PFL 映射到 me2 (Phantasmal Flames)", () => {
    expect(resolveSetCode("PFL")).toBe("me2");
  });

  it("ASC 映射到 me2pt5 (Ascended Heroes)", () => {
    expect(resolveSetCode("ASC")).toBe("me2pt5");
  });

  it("MEE 映射到 sve (Mega Evolution Energy → SV Energies)", () => {
    expect(resolveSetCode("MEE")).toBe("sve");
  });

  it("大小写不敏感", () => {
    expect(resolveSetCode("meg")).toBe("me1");
    expect(resolveSetCode("Pfl")).toBe("me2");
    expect(resolveSetCode("asc")).toBe("me2pt5");
    expect(resolveSetCode("mee")).toBe("sve");
  });
});

describe("Card ID construction for 12 previously missing cards", () => {
  const EXPECTED_CARD_IDS: Array<{ ptcgCode: string; number: string; expectedId: string }> = [
    { ptcgCode: "MEG", number: "86", expectedId: "me1-86" },
    { ptcgCode: "MEG", number: "104", expectedId: "me1-104" },
    { ptcgCode: "MEG", number: "88", expectedId: "me1-88" },
    { ptcgCode: "MEG", number: "114", expectedId: "me1-114" },
    { ptcgCode: "MEG", number: "119", expectedId: "me1-119" },
    { ptcgCode: "MEG", number: "115", expectedId: "me1-115" },
    { ptcgCode: "MEG", number: "131", expectedId: "me1-131" },
    { ptcgCode: "ASC", number: "39", expectedId: "me2pt5-39" },
    { ptcgCode: "ASC", number: "142", expectedId: "me2pt5-142" },
    { ptcgCode: "ASC", number: "196", expectedId: "me2pt5-196" },
    { ptcgCode: "PFL", number: "91", expectedId: "me2-91" },
    { ptcgCode: "MEE", number: "7", expectedId: "sve-7" },
  ];

  it.each(EXPECTED_CARD_IDS)(
    "$ptcgCode $number → $expectedId",
    ({ ptcgCode, number, expectedId }) => {
      expect(buildCardId(ptcgCode, number)).toBe(expectedId);
    }
  );
});

describe("Deck validation with Mega Evolution era cards", () => {
  // Mock card lookup that includes the 12 previously missing cards
  const meraCardsLookup = (id: string) => {
    const cards: Record<string, { legalities: { standard?: string } }> = {
      "me1-86": { legalities: { standard: "Legal" } },    // Mega Absol ex
      "me1-104": { legalities: { standard: "Legal" } },   // Mega Kangaskhan ex
      "me1-88": { legalities: { standard: "Legal" } },    // Yveltal
      "me1-114": { legalities: { standard: "Legal" } },   // Boss's Orders
      "me1-119": { legalities: { standard: "Legal" } },   // Lillie's Determination
      "me1-115": { legalities: { standard: "Legal" } },   // Energy Switch
      "me1-131": { legalities: { standard: "Legal" } },   // Ultra Ball
      "me2pt5-39": { legalities: { standard: "Legal" } }, // Psyduck
      "me2pt5-142": { legalities: { standard: "Legal" } },// Fezandipiti ex
      "me2pt5-196": { legalities: { standard: "Legal" } },// Night Stretcher
      "me2-91": { legalities: { standard: "Legal" } },    // Jumbo Ice Cream
      "sve-7": { legalities: { standard: "Legal" } },     // Basic Darkness Energy
    };
    return cards[id];
  };

  it("解析包含所有 12 张卡牌的卡组不产生'卡牌未找到'警告", () => {
    const deckText = `Pokémon: 16
4 Mega Absol ex MEG 86
2 Mega Kangaskhan ex MEG 104
2 Yveltal MEG 88
2 Psyduck ASC 39
2 Fezandipiti ex ASC 142
2 Jumbo Ice Cream PFL 91

Trainer: 28
4 Boss's Orders MEG 114
4 Lillie's Determination MEG 119
4 Energy Switch MEG 115
4 Ultra Ball MEG 131
4 Night Stretcher ASC 196
4 Boss's Orders MEG 114
4 Energy Switch MEG 115

Energy: 16
16 Basic Darkness Energy MEE 7`;

    const parsed = parseDeckList(deckText);
    expect(parsed.errors).toHaveLength(0);

    const validation = validateDeck(parsed, meraCardsLookup);

    // No "卡牌未找到" warnings
    const notFoundWarnings = validation.warnings.filter((w) =>
      w.includes("卡牌未找到")
    );
    expect(notFoundWarnings).toHaveLength(0);

    // No "未知系列代码" warnings
    const unknownCodeWarnings = validation.warnings.filter((w) =>
      w.includes("未知系列代码")
    );
    expect(unknownCodeWarnings).toHaveLength(0);

    // All cards should be found
    for (const detail of validation.cardDetails) {
      expect(detail.cardId).not.toBeNull();
      expect(detail.found).toBe(true);
    }
  });

  it("每张卡的 cardId 正确构造", () => {
    const deckText = `Pokémon: 2
1 Mega Absol ex MEG 86
1 Psyduck ASC 39`;

    const parsed = parseDeckList(deckText);
    const validation = validateDeck(parsed, meraCardsLookup);

    expect(validation.cardDetails[0].cardId).toBe("me1-86");
    expect(validation.cardDetails[1].cardId).toBe("me2pt5-39");
  });
});
