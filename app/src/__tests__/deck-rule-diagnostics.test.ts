import { clearRegistry, registerEffect } from "@/engine/effects/effect-registry";
import { analyzeDeckRuleCoverage } from "@/services/deck-rule-diagnostics";
import type { DeckValidation } from "@/lib/deck-parser";
import type { Card } from "@/types/card";

function buildValidation(cardId: string | null, name: string, found = true): DeckValidation {
  return {
    isValid: true,
    totalCards: 60,
    errors: [],
    warnings: [],
    cardDetails: [
      {
        entry: {
          quantity: 4,
          name,
          setCode: "MEG",
          number: "20",
          category: "pokemon",
        },
        cardId,
        found,
        standardLegal: true,
      },
    ],
  };
}

function createPokemonCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "me1-20",
    name: "Ninetales",
    supertype: "Pokémon",
    subtypes: ["Stage 1"],
    hp: "110",
    types: ["Fire"],
    attacks: [
      {
        name: "Supernatural Shapeshifter",
        cost: ["Colorless"],
        damage: "",
        text: "Discard the top card of your deck, and if that card is a Supporter card, use the effect of that card as the effect of this attack.",
        convertedEnergyCost: 1,
      },
    ],
    number: "20",
    rarity: "Rare",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
    ...overrides,
  };
}

describe("deck rule diagnostics", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("flags unresolved imported cards as high priority", () => {
    const diagnostics = analyzeDeckRuleCoverage(
      buildValidation(null, "Unknown Card", false),
      () => undefined
    );

    expect(diagnostics.summary.unresolvedCards).toBe(1);
    expect(diagnostics.summary.highPriorityCards).toBe(1);
    expect(diagnostics.issues[0].type).toBe("unresolved_card");
  });

  it("flags cards that need effects but have no registered rule", () => {
    const card = createPokemonCard();
    const diagnostics = analyzeDeckRuleCoverage(
      buildValidation(card.id, card.name, true),
      (id) => (id === card.id ? card : undefined)
    );

    expect(diagnostics.summary.missingEffects).toBe(1);
    expect(diagnostics.issues[0].type).toBe("missing_effect");
  });

  it("flags L2.5 cards whose V2 rules use unsupported actions", () => {
    const card = createPokemonCard();
    registerEffect({ cardId: card.id, cardName: card.name }, "L2.5");

    const diagnostics = analyzeDeckRuleCoverage(
      buildValidation(card.id, card.name, true),
      (id) => (id === card.id ? card : undefined)
    );

    expect(diagnostics.summary.unsupportedActionCards).toBe(1);
    expect(diagnostics.issues[0].type).toBe("unsupported_actions");
    expect(diagnostics.issues[0].unsupportedActions).toEqual(
      expect.arrayContaining(["discard_cards", "use_attack"])
    );
  });
});
