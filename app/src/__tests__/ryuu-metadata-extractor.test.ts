/**
 * Tests for ryuu-metadata-extractor.ts
 *
 * Validates metadata extraction from ryuu-play card instances,
 * conversion to UI Card format, and batch extraction.
 */

import {
  extractCardMeta,
  metaToUICard,
  extractAllRyuuMetadata,
  extractRyuuAsUICards,
  RyuuCardMeta,
} from "@/engine/effects/ryuu-metadata-extractor";
import { PokemonCard } from "@/lib/ptcg-engine/store/card/pokemon-card";
import { TrainerCard } from "@/lib/ptcg-engine/store/card/trainer-card";
import { EnergyCard } from "@/lib/ptcg-engine/store/card/energy-card";
import {
  CardType,
  Stage,
  TrainerType,
  EnergyType,
  SuperType,
} from "@/lib/ptcg-engine/store/card/card-types";
import { PowerType } from "@/lib/ptcg-engine/store/card/pokemon-types";

// ─── Test helpers: concrete card subclasses ───

class TestPokemonCard extends PokemonCard {
  public set = "TEST";
  public name = "Test Pokemon";
  public fullName = "Test Pokemon TEST";
}

class TestTrainerCard extends TrainerCard {
  public set = "TEST";
  public name = "Test Trainer";
  public fullName = "Test Trainer TEST";
}

class TestEnergyCard extends EnergyCard {
  public set = "TEST";
  public name = "Test Energy";
  public fullName = "Test Energy TEST";
}

// ═══════════════════════════════════════════
// extractCardMeta — Pokemon Cards
// ═══════════════════════════════════════════

describe("ryuu-metadata-extractor: extractCardMeta — Pokemon", () => {
  test("extracts basic Pokemon metadata", () => {
    const card = new TestPokemonCard();
    card.stage = Stage.BASIC;
    card.hp = 60;
    card.cardTypes = [CardType.FIRE];
    card.attacks = [
      { name: "Tackle", cost: [CardType.COLORLESS], damage: "20", text: "" },
    ];
    card.retreat = [CardType.COLORLESS];

    const meta = extractCardMeta(card);

    expect(meta.supertype).toBe("Pokémon");
    expect(meta.subtypes).toEqual(["Basic"]);
    expect(meta.hp).toBe("60");
    expect(meta.types).toEqual(["Fire"]);
    expect(meta.name).toBe("Test Pokemon");
    expect(meta.fullName).toBe("Test Pokemon TEST");
    expect(meta.set).toBe("TEST");
    expect(meta.hasReduceEffect).toBe(true); // base Card has reduceEffect
  });

  test("extracts attack metadata with text", () => {
    const card = new TestPokemonCard();
    card.cardTypes = [CardType.LIGHTNING];
    card.hp = 40;
    card.attacks = [
      {
        name: "Thunder Jolt",
        cost: [CardType.LIGHTNING, CardType.COLORLESS],
        damage: "30",
        text: "Flip a coin. If tails, this Pokemon does 10 damage to itself.",
      },
    ];

    const meta = extractCardMeta(card);

    expect(meta.attacks).toHaveLength(1);
    expect(meta.attacks![0].name).toBe("Thunder Jolt");
    expect(meta.attacks![0].cost).toEqual(["Lightning", "Colorless"]);
    expect(meta.attacks![0].damage).toBe("30");
    expect(meta.attacks![0].text).toContain("Flip a coin");
    expect(meta.attacks![0].convertedEnergyCost).toBe(2);
  });

  test("extracts power/ability metadata", () => {
    const card = new TestPokemonCard();
    card.cardTypes = [CardType.FIRE];
    card.hp = 120;
    card.powers = [
      {
        name: "Energy Burn",
        powerType: PowerType.POKEPOWER,
        text: "Turn all Energy attached to Charizard into Fire Energy.",
      },
    ];

    const meta = extractCardMeta(card);

    expect(meta.abilities).toHaveLength(1);
    expect(meta.abilities![0].name).toBe("Energy Burn");
    expect(meta.abilities![0].type).toBe("Poké-Power");
    expect(meta.abilities![0].text).toContain("Turn all Energy");
  });

  test("extracts Stage 2 Pokemon with evolution", () => {
    const card = new TestPokemonCard();
    card.stage = Stage.STAGE_2;
    card.evolvesFrom = "Charmeleon";
    card.hp = 120;
    card.cardTypes = [CardType.FIRE];

    const meta = extractCardMeta(card);

    expect(meta.subtypes).toEqual(["Stage 2"]);
  });

  test("extracts multiple attacks", () => {
    const card = new TestPokemonCard();
    card.cardTypes = [CardType.WATER];
    card.hp = 80;
    card.attacks = [
      { name: "Bubble", cost: [CardType.WATER], damage: "10", text: "Flip a coin. If heads, the Defending Pokemon is now Paralyzed." },
      { name: "Withdraw", cost: [CardType.WATER, CardType.COLORLESS], damage: "0", text: "Flip a coin. If heads, prevent all damage done to this Pokemon during your opponent's next turn." },
    ];

    const meta = extractCardMeta(card);

    expect(meta.attacks).toHaveLength(2);
    expect(meta.attacks![0].name).toBe("Bubble");
    expect(meta.attacks![1].name).toBe("Withdraw");
  });

  test("handles Pokemon with no attacks", () => {
    const card = new TestPokemonCard();
    card.cardTypes = [CardType.PSYCHIC];
    card.hp = 30;
    card.attacks = [];

    const meta = extractCardMeta(card);

    expect(meta.attacks).toBeUndefined();
  });

  test("handles Pokemon with Ability (not PokePower/PokeBody)", () => {
    const card = new TestPokemonCard();
    card.cardTypes = [CardType.GRASS];
    card.hp = 90;
    card.powers = [
      {
        name: "Forest's Blessing",
        powerType: PowerType.ABILITY,
        text: "Once during your turn, you may attach a Grass Energy from your hand to this Pokemon.",
        useWhenInPlay: true,
      },
    ];

    const meta = extractCardMeta(card);

    expect(meta.abilities![0].type).toBe("Ability");
  });
});

// ═══════════════════════════════════════════
// extractCardMeta — Trainer Cards
// ═══════════════════════════════════════════

describe("ryuu-metadata-extractor: extractCardMeta — Trainer", () => {
  test("extracts Supporter metadata", () => {
    const card = new TestTrainerCard();
    card.trainerType = TrainerType.SUPPORTER;
    card.text = "Draw 3 cards.";

    const meta = extractCardMeta(card);

    expect(meta.supertype).toBe("Trainer");
    expect(meta.subtypes).toEqual(["Supporter"]);
    expect(meta.rules).toEqual(["Draw 3 cards."]);
  });

  test("extracts Item metadata", () => {
    const card = new TestTrainerCard();
    card.trainerType = TrainerType.ITEM;
    card.text = "Search your deck for a Basic Pokemon and put it onto your Bench.";

    const meta = extractCardMeta(card);

    expect(meta.subtypes).toEqual(["Item"]);
    expect(meta.rules).toEqual(["Search your deck for a Basic Pokemon and put it onto your Bench."]);
  });

  test("extracts Stadium metadata", () => {
    const card = new TestTrainerCard();
    card.trainerType = TrainerType.STADIUM;
    card.text = "Each player's Active Pokemon has no Retreat Cost.";

    const meta = extractCardMeta(card);

    expect(meta.subtypes).toEqual(["Stadium"]);
  });

  test("extracts Tool metadata", () => {
    const card = new TestTrainerCard();
    card.trainerType = TrainerType.TOOL;
    card.text = "The Pokemon this card is attached to gets +20 HP.";

    const meta = extractCardMeta(card);

    expect(meta.subtypes).toEqual(["Pokémon Tool"]);
  });

  test("handles trainer with empty text", () => {
    const card = new TestTrainerCard();
    card.trainerType = TrainerType.ITEM;
    card.text = "";

    const meta = extractCardMeta(card);

    expect(meta.rules).toBeUndefined();
  });
});

// ═══════════════════════════════════════════
// extractCardMeta — Energy Cards
// ═══════════════════════════════════════════

describe("ryuu-metadata-extractor: extractCardMeta — Energy", () => {
  test("extracts basic energy metadata", () => {
    const card = new TestEnergyCard();
    card.energyType = EnergyType.BASIC;
    card.provides = [CardType.FIRE];
    card.text = "";

    const meta = extractCardMeta(card);

    expect(meta.supertype).toBe("Energy");
    expect(meta.subtypes).toEqual(["Basic"]);
    expect(meta.rules).toBeUndefined();
  });

  test("extracts special energy metadata", () => {
    const card = new TestEnergyCard();
    card.energyType = EnergyType.SPECIAL;
    card.provides = [CardType.METAL];
    card.text = "Damage done by attacks to the Pokemon that Metal Energy is attached to is reduced by 10.";

    const meta = extractCardMeta(card);

    expect(meta.subtypes).toEqual(["Special"]);
    expect(meta.rules).toEqual([
      "Damage done by attacks to the Pokemon that Metal Energy is attached to is reduced by 10.",
    ]);
  });
});

// ═══════════════════════════════════════════
// metaToUICard — Conversion
// ═══════════════════════════════════════════

describe("ryuu-metadata-extractor: metaToUICard", () => {
  test("converts Pokemon meta to UICard", () => {
    const meta: RyuuCardMeta = {
      fullName: "Pikachu BS",
      name: "Pikachu",
      set: "BS",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      hp: "40",
      types: ["Lightning"],
      attacks: [
        {
          name: "Thunder Jolt",
          cost: ["Lightning", "Colorless"],
          damage: "30",
          text: "Flip a coin. If tails, this Pokemon does 10 damage to itself.",
          convertedEnergyCost: 2,
        },
      ],
      hasReduceEffect: true,
    };

    const uiCard = metaToUICard(meta);

    expect(uiCard.id).toBe("ryuu:Pikachu BS");
    expect(uiCard.name).toBe("Pikachu");
    expect(uiCard.supertype).toBe("Pokémon");
    expect(uiCard.subtypes).toEqual(["Basic"]);
    expect(uiCard.hp).toBe("40");
    expect(uiCard.attacks).toHaveLength(1);
    expect(uiCard.attacks![0].name).toBe("Thunder Jolt");
    expect(uiCard.attacks![0].text).toContain("Flip a coin");
  });

  test("converts Trainer meta to UICard", () => {
    const meta: RyuuCardMeta = {
      fullName: "Bill BS",
      name: "Bill",
      set: "BS",
      supertype: "Trainer",
      subtypes: ["Item"],
      rules: ["Draw 2 cards."],
      hasReduceEffect: true,
    };

    const uiCard = metaToUICard(meta);

    expect(uiCard.id).toBe("ryuu:Bill BS");
    expect(uiCard.name).toBe("Bill");
    expect(uiCard.supertype).toBe("Trainer");
    expect(uiCard.rules).toEqual(["Draw 2 cards."]);
  });

  test("UICard has required fields for text-parser", () => {
    const meta: RyuuCardMeta = {
      fullName: "Test BASIC",
      name: "Test",
      set: "BASIC",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      hasReduceEffect: false,
    };

    const uiCard = metaToUICard(meta);

    // Required fields for UICard interface
    expect(uiCard.number).toBeDefined();
    expect(uiCard.legalities).toBeDefined();
    expect(uiCard.images).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// extractAllRyuuMetadata — Batch
// ═══════════════════════════════════════════

describe("ryuu-metadata-extractor: extractAllRyuuMetadata", () => {
  test("extracts metadata from all ryuu-play sets", () => {
    const metas = extractAllRyuuMetadata();

    // Should have hundreds of cards
    expect(metas.length).toBeGreaterThan(400);

    // Should have mixed supertypes
    const supertypes = new Set(metas.map((m) => m.supertype));
    expect(supertypes.has("Pokémon")).toBe(true);
    expect(supertypes.has("Trainer")).toBe(true);
    expect(supertypes.has("Energy")).toBe(true);
  });

  test("all metas have required fields", () => {
    const metas = extractAllRyuuMetadata();

    for (const meta of metas) {
      expect(meta.name).toBeTruthy();
      expect(meta.fullName).toBeTruthy();
      expect(meta.supertype).toBeTruthy();
      expect(meta.subtypes.length).toBeGreaterThan(0);
    }
  });

  test("Pokemon cards have attack text", () => {
    const metas = extractAllRyuuMetadata();
    const pokemonWithAttacks = metas.filter(
      (m) => m.supertype === "Pokémon" && m.attacks && m.attacks.length > 0
    );

    // Most Pokemon should have attacks
    expect(pokemonWithAttacks.length).toBeGreaterThan(200);

    // Some should have attack text
    const withText = pokemonWithAttacks.filter((m) =>
      m.attacks!.some((a) => a.text.length > 0)
    );
    expect(withText.length).toBeGreaterThan(100);
  });

  test("Trainer cards have text rules", () => {
    const metas = extractAllRyuuMetadata();
    const trainers = metas.filter((m) => m.supertype === "Trainer");

    expect(trainers.length).toBeGreaterThan(30);

    const withRules = trainers.filter(
      (m) => m.rules && m.rules.length > 0
    );
    expect(withRules.length).toBeGreaterThan(20);
  });
});

// ═══════════════════════════════════════════
// extractRyuuAsUICards
// ═══════════════════════════════════════════

describe("ryuu-metadata-extractor: extractRyuuAsUICards", () => {
  test("produces deduplicated UI cards", () => {
    const cards = extractRyuuAsUICards();

    // Should have many unique cards
    expect(cards.length).toBeGreaterThan(200);

    // Should be deduplicated by name
    const names = cards.map((c) => c.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  test("excludes basic energies without text", () => {
    const cards = extractRyuuAsUICards();

    const basicEnergies = cards.filter(
      (c) =>
        c.supertype === "Energy" &&
        c.subtypes.includes("Basic") &&
        (!c.rules || c.rules.length === 0)
    );

    // Should not include basic energies with no text
    expect(basicEnergies.length).toBe(0);
  });

  test("all cards have valid UICard structure", () => {
    const cards = extractRyuuAsUICards();

    for (const card of cards) {
      expect(card.id).toBeTruthy();
      expect(card.id).toMatch(/^ryuu:/);
      expect(card.name).toBeTruthy();
      expect(card.supertype).toBeTruthy();
      expect(card.number).toBeDefined();
      expect(card.legalities).toBeDefined();
      expect(card.images).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════
// Integration with text-parser
// ═══════════════════════════════════════════

describe("ryuu-metadata-extractor: text-parser integration", () => {
  test("ryuu UI cards can be parsed by text-parser", () => {
    const { parseCardEffects } = require("@/engine/effects/text-parser");

    const cards = extractRyuuAsUICards();

    let parseable = 0;
    for (const card of cards) {
      const def = parseCardEffects(card);
      if (def) parseable++;
    }

    // Should parse a significant portion of cards
    expect(parseable).toBeGreaterThan(50);
  });
});
