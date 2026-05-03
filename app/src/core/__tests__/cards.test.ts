import { getCard, tryGetCard, validateDeck, getAllCards } from "../cards";
import { charizardExDeck, DECKS } from "../decks";

describe("card registry", () => {
  it("has registered Charizard ex deck cards on import", () => {
    expect(getAllCards().length).toBeGreaterThanOrEqual(17);
  });

  it("looks up cards by id", () => {
    const charizard = getCard("obf-125");
    expect(charizard.name).toBe("Charizard ex");
    expect(charizard.kind).toBe("Pokemon");
  });

  it("returns undefined for missing card via tryGetCard", () => {
    expect(tryGetCard("nonexistent-999")).toBeUndefined();
  });

  it("throws for missing card via getCard", () => {
    expect(() => getCard("nonexistent-999")).toThrow(/not found/);
  });
});

describe("Charizard ex deck", () => {
  it("has 60 cards", () => {
    const total = charizardExDeck.cards.reduce((s, e) => s + e.count, 0);
    expect(total).toBe(60);
  });

  it("validates as legal", () => {
    const report = validateDeck(charizardExDeck);
    expect(report.valid).toBe(true);
    expect(report.totalCards).toBe(60);
    expect(report.issues).toEqual([]);
  });

  it("contains a Stage 2 ex Pokemon", () => {
    const charizard = getCard("obf-125");
    expect(charizard.kind).toBe("Pokemon");
    if (charizard.kind === "Pokemon") {
      expect(charizard.stage).toBe("Stage2");
      expect(charizard.rarity).toBe("ex");
      expect(charizard.hp).toBeGreaterThan(300);
    }
  });
});

describe("DECKS export", () => {
  it("includes the Charizard ex deck", () => {
    const slugs = DECKS.map((d) => d.slug);
    expect(slugs).toContain("charizard-ex");
  });
});
