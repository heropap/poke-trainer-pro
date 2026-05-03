import { clearRegistry } from "@/engine/effects/effect-registry";
import type { Card } from "@/types/card";
import type { StoredDeck } from "@/services/deck-storage";
import { repairStoredDeck, buildDeckRepairQueue } from "@/services/deck-repair";

function createStoredDeckFixture(): StoredDeck {
  return {
    id: "deck-1",
    name: "测试卡组",
    createdAt: "2026-03-30T00:00:00.000Z",
    deckText: `Pokémon: 1
1 Lumineon V SWSH 250

Trainer: 1
1 Iono PAL 185

Energy: 58
58 Basic Water Energy SVE 3`,
    totalCards: 60,
    isValid: true,
    warnings: ["旧卡组里有未解析卡"],
    errors: [],
    cards: [
      {
        cardId: "",
        name: "Lumineon V",
        quantity: 1,
        setCode: "SWSH",
        number: "250",
        category: "pokemon",
        found: false,
        standardLegal: false,
      },
      {
        cardId: "sv2-185",
        name: "Iono",
        quantity: 1,
        setCode: "PAL",
        number: "185",
        category: "trainer",
        found: true,
        standardLegal: true,
      },
      {
        cardId: "sve-3",
        name: "Basic Water Energy",
        quantity: 58,
        setCode: "SVE",
        number: "3",
        category: "energy",
        found: true,
        standardLegal: true,
      },
    ],
  };
}

function createCard(overrides: Partial<Card>): Card {
  return {
    id: "default",
    name: "Default",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "100",
    types: ["Water"],
    attacks: [],
    legalities: { standard: "Legal" },
    number: "1",
    images: { small: "", large: "" },
    ...overrides,
  };
}

describe("deck repair", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("re-resolves stored decks using the latest name fallback", () => {
    const deck = createStoredDeckFixture();
    const lumineon = createCard({
      id: "swsh9-40",
      name: "Lumineon V",
      attacks: [{ name: "Aqua Return", cost: ["Water"], damage: "120", text: "Shuffle this Pokemon and all attached cards into your deck.", convertedEnergyCost: 1 }],
    });
    const iono = createCard({
      id: "sv2-185",
      name: "Iono",
      supertype: "Trainer",
      subtypes: ["Supporter"],
      rules: ["Each player shuffles their hand and puts it on the bottom of their deck."],
    });
    const energy = createCard({
      id: "sve-3",
      name: "Basic Water Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
    });

    const cardMap = new Map<string, Card>([
      [lumineon.id, lumineon],
      [iono.id, iono],
      [energy.id, energy],
    ]);

    const result = repairStoredDeck(
      deck,
      (id) => cardMap.get(id),
      (name) => [lumineon, iono, energy].filter((card) => card.name === name)
    );

    expect(result.deck.cards[0].found).toBe(true);
    expect(result.deck.cards[0].cardId).toBe("swsh9-40");
    expect(result.changed).toBe(true);
    expect(result.changes.join(" ")).toContain("修复了");
  });

  it("builds an aggregated repair queue from imported decks", () => {
    const decks: StoredDeck[] = [
      {
        ...createStoredDeckFixture(),
        ruleDiagnostics: {
          generatedAt: "2026-03-30T00:00:00.000Z",
          deckScore: 60,
          summary: {
            totalEntries: 3,
            unresolvedCards: 1,
            missingEffects: 0,
            fragileEffects: 0,
            unsupportedActionCards: 0,
            highPriorityCards: 1,
          },
          issues: [
            {
              type: "unresolved_card",
              severity: "high",
              cardId: null,
              cardName: "Lumineon V",
              quantity: 1,
              message: "Lumineon V 仍未解析到本地卡牌数据。",
            },
          ],
        },
      },
      {
        ...createStoredDeckFixture(),
        id: "deck-2",
        name: "测试卡组 2",
        ruleDiagnostics: {
          generatedAt: "2026-03-30T00:00:00.000Z",
          deckScore: 70,
          summary: {
            totalEntries: 3,
            unresolvedCards: 1,
            missingEffects: 0,
            fragileEffects: 0,
            unsupportedActionCards: 0,
            highPriorityCards: 1,
          },
          issues: [
            {
              type: "unresolved_card",
              severity: "high",
              cardId: null,
              cardName: "Lumineon V",
              quantity: 2,
              message: "Lumineon V 仍未解析到本地卡牌数据。",
            },
          ],
        },
      },
    ];

    const queue = buildDeckRepairQueue(decks);
    expect(queue).toHaveLength(1);
    expect(queue[0].deckCount).toBe(2);
    expect(queue[0].totalCopies).toBe(3);
    expect(queue[0].cardName).toBe("Lumineon V");
  });
});
