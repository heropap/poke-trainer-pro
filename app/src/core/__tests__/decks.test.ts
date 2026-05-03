import { validateDeck } from "../cards";
import {
  DECKS,
  charizardExDeck,
  miraidonExDeck,
  gardevoirExDeck,
  getDeck,
} from "../decks";

describe("DECKS roster", () => {
  it("contains the 3 v0 master decks", () => {
    const slugs = DECKS.map((d) => d.slug);
    expect(slugs).toEqual(["charizard-ex", "miraidon-ex", "gardevoir-ex"]);
  });

  it.each([
    ["charizard-ex", charizardExDeck],
    ["miraidon-ex", miraidonExDeck],
    ["gardevoir-ex", gardevoirExDeck],
  ])("%s has 60 legal cards", (_slug, deck) => {
    const total = deck.cards.reduce((s, e) => s + e.count, 0);
    expect(total).toBe(60);

    const report = validateDeck(deck);
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("getDeck looks up by slug", () => {
    expect(getDeck("miraidon-ex").slug).toBe("miraidon-ex");
    expect(() => getDeck("nonexistent")).toThrow(/not found/);
  });
});
