/**
 * Card Data Integrity Tests
 *
 * Validates that the card data files contain all required cards
 * with complete field definitions. Uses the actual _index.json data.
 *
 * This acts as a CI gate: if any expected card ID is missing from
 * the data, the test fails with a detailed report.
 */

import * as fs from "fs";
import * as path from "path";

interface CardData {
  id: string;
  name: string;
  number: string;
  supertype: string;
  legalities: { standard?: string; expanded?: string; unlimited?: string };
  images: { small: string; large: string };
  set?: string;
}

// Load the real _index.json for data integrity checks
const INDEX_PATH = path.join(__dirname, "..", "data", "cards", "_index.json");

let allCards: CardData[] = [];
let cardIndex: Map<string, CardData> = new Map();

beforeAll(() => {
  const raw = fs.readFileSync(INDEX_PATH, "utf-8");
  allCards = JSON.parse(raw);
  for (const card of allCards) {
    cardIndex.set(card.id, card);
  }
});

describe("Card data file integrity", () => {
  it("_index.json 包含超过 3000 张卡牌", () => {
    expect(allCards.length).toBeGreaterThan(3000);
  });

  it("包含 Mega Evolution era 系列数据", () => {
    const me1Cards = allCards.filter((c) => c.set === "me1");
    const me2Cards = allCards.filter((c) => c.set === "me2");
    const me2pt5Cards = allCards.filter((c) => c.set === "me2pt5");

    expect(me1Cards.length).toBe(188);
    expect(me2Cards.length).toBe(130);
    expect(me2pt5Cards.length).toBe(295);
  });
});

describe("12 previously missing cards exist with complete fields", () => {
  const REQUIRED_CARDS = [
    { id: "me1-86", expectedName: "Mega Absol ex", set: "me1" },
    { id: "me1-104", expectedName: "Mega Kangaskhan ex", set: "me1" },
    { id: "me1-88", expectedName: "Yveltal", set: "me1" },
    { id: "me1-114", expectedName: "Boss's Orders", set: "me1" },
    { id: "me1-119", expectedName: "Lillie's Determination", set: "me1" },
    { id: "me1-115", expectedName: "Energy Switch", set: "me1" },
    { id: "me1-131", expectedName: "Ultra Ball", set: "me1" },
    { id: "me2pt5-39", expectedName: "Psyduck", set: "me2pt5" },
    { id: "me2pt5-142", expectedName: "Fezandipiti ex", set: "me2pt5" },
    { id: "me2pt5-196", expectedName: "Night Stretcher", set: "me2pt5" },
    { id: "me2-91", expectedName: "Jumbo Ice Cream", set: "me2" },
    { id: "sve-7", expectedName: "Basic Darkness Energy", set: "sve" },
  ];

  it.each(REQUIRED_CARDS)(
    "$id ($expectedName) 存在且字段完整",
    ({ id, expectedName, set }) => {
      const card = cardIndex.get(id);

      // Card must exist
      expect(card).toBeDefined();
      if (!card) return;

      // Name must match
      expect(card.name).toBe(expectedName);

      // Required fields must be populated
      expect(card.number).toBeTruthy();
      expect(card.supertype).toBeTruthy();
      expect(card.legalities).toBeDefined();
      expect(card.images).toBeDefined();
      expect(card.images.small).toMatch(/^https?:\/\//);
      expect(card.images.large).toMatch(/^https?:\/\//);
      expect(card.set).toBe(set);
    }
  );
});

describe("No duplicate card IDs in index", () => {
  it("每张卡牌的 ID 唯一", () => {
    const idCounts = new Map<string, number>();
    for (const card of allCards) {
      idCounts.set(card.id, (idCounts.get(card.id) || 0) + 1);
    }

    const duplicates = Array.from(idCounts.entries()).filter(
      ([, count]) => count > 1
    );

    if (duplicates.length > 0) {
      const report = duplicates
        .map(([id, count]) => `${id}: ${count} occurrences`)
        .join("\n");
      fail(`Found duplicate card IDs:\n${report}`);
    }
  });
});
