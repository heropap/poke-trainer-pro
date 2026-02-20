/**
 * Offline Rule Generator — Unit Tests
 *
 * Tests the deterministic pattern-matching engine that converts
 * PTCG card effect text into CTA JSON rules.
 */

import { generateRule, generateRules, getGenerationStats } from "../engine/llm/offline-rule-generator";
import { CardInput } from "../engine/llm/prompt-builder";
import { validateRule } from "../engine/rules/rule-validator";
import { CardRuleDef } from "../engine/rules/card-rule-def";

// ═══════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════

function makeCard(overrides: Partial<CardInput> & { id: string; name: string }): CardInput {
  return {
    supertype: "Pokémon",
    ...overrides,
  };
}

function expectValid(rule: CardRuleDef | null): CardRuleDef {
  expect(rule).not.toBeNull();
  const result = validateRule(rule!);
  if (!result.valid) {
    throw new Error(
      `Validation failed: ${[...result.structuralErrors, ...result.semanticErrors].join("; ")}`
    );
  }
  return rule!;
}

// ═══════════════════════════════════════════════════════
// Attack Pattern Tests
// ═══════════════════════════════════════════════════════

describe("Offline Rule Generator — Attack Patterns", () => {
  test("pure damage attack (no text)", () => {
    const rule = generateRule(makeCard({
      id: "test-1", name: "Pikachu",
      attacks: [{ name: "Thunderbolt", cost: ["Lightning"], damage: "40", text: "" }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toEqual([
      { action: "deal_damage", value: 40 },
    ]);
  });

  test("coin flip heads = bonus damage", () => {
    const rule = generateRule(makeCard({
      id: "test-2", name: "Ponyta",
      attacks: [{ name: "Stomp", cost: ["Fire"], damage: "20+", text: "Flip a coin. If heads, this attack does 30 more damage." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toEqual([
      { action: "deal_damage", value: 20 },
      { action: "flip_coin", on_heads: [{ action: "deal_damage", value: 30 }] },
    ]);
  });

  test("coin flip tails = does nothing", () => {
    const rule = generateRule(makeCard({
      id: "test-3", name: "Scorbunny",
      attacks: [{ name: "Wild Kick", cost: ["Fire"], damage: "30", text: "Flip a coin. If tails, this attack does nothing." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toEqual([
      { action: "flip_coin", on_heads: [{ action: "deal_damage", value: 30 }] },
    ]);
  });

  test("multi-coin damage", () => {
    const rule = generateRule(makeCard({
      id: "test-4", name: "Golem",
      attacks: [{ name: "Rock Throw", cost: ["Fighting"], damage: "", text: "Flip 4 coins. This attack does 40 damage for each heads." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toEqual([
      { action: "flip_coins", count: 4, per_heads: [{ action: "deal_damage", value: 40 }] },
    ]);
  });

  test("per-energy self damage", () => {
    const rule = generateRule(makeCard({
      id: "test-5", name: "Charizard",
      attacks: [{ name: "Fire Blast", cost: ["Fire"], damage: "50×", text: "This attack does 50 damage for each Fire Energy attached to this Pokémon." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toEqual([
      { action: "deal_damage", value: { per: "energy_on_self", multiply: 50 } },
    ]);
  });

  test("per-bench own damage", () => {
    const rule = generateRule(makeCard({
      id: "test-6", name: "Kangaskhan",
      attacks: [{ name: "Rally Back", cost: ["Colorless"], damage: "20+", text: "This attack does 20 damage plus 20 more damage for each of your Benched Pokémon." }],
    }));
    const valid = expectValid(rule);
    // Should have base damage + per-bench
    expect(valid.attacks![0].steps.length).toBe(2);
    expect(valid.attacks![0].steps[0]).toEqual({ action: "deal_damage", value: 20 });
    expect(valid.attacks![0].steps[1]).toEqual({
      action: "deal_damage",
      value: { per: "own_bench_count", multiply: 20 },
    });
  });

  test("status effect (direct)", () => {
    const rule = generateRule(makeCard({
      id: "test-7", name: "Vulpix",
      attacks: [{ name: "Ember", cost: ["Fire"], damage: "30", text: "Your opponent's Active Pokémon is now Burned." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({ action: "deal_damage", value: 30 });
    expect(valid.attacks![0].steps).toContainEqual({ action: "apply_status", status: "burned" });
  });

  test("self damage", () => {
    const rule = generateRule(makeCard({
      id: "test-8", name: "Chansey",
      attacks: [{ name: "Double-Edge", cost: ["Colorless"], damage: "100", text: "This Pokémon also does 50 damage to itself." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({ action: "deal_damage", value: 100 });
    expect(valid.attacks![0].steps).toContainEqual({ action: "self_damage", value: 50 });
  });

  test("discard energy", () => {
    const rule = generateRule(makeCard({
      id: "test-9", name: "Pikachu",
      attacks: [{ name: "Bolt", cost: ["Lightning"], damage: "200", text: "Discard 3 Energy from this Pokémon." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({
      action: "discard_energy", count: 3, target: { zone: "self_active" },
    });
  });

  test("heal self", () => {
    const rule = generateRule(makeCard({
      id: "test-10", name: "Oddish",
      attacks: [{ name: "Absorb", cost: ["Grass"], damage: "20", text: "Heal 20 damage from this Pokémon." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({
      action: "heal", value: 20, target: { zone: "self_active" },
    });
  });

  test("switch self", () => {
    const rule = generateRule(makeCard({
      id: "test-11", name: "Eevee",
      attacks: [{ name: "Flee", cost: ["Colorless"], damage: "20", text: "Switch this Pokémon with 1 of your Benched Pokémon." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({
      action: "switch_pokemon", who: "player",
    });
  });

  test("can't retreat", () => {
    const rule = generateRule(makeCard({
      id: "test-12", name: "Bulbasaur",
      attacks: [{ name: "Bind", cost: ["Grass"], damage: "10", text: "During your opponent's next turn, the Defending Pokémon can't retreat." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({
      action: "cant_retreat", target: { zone: "opp_active" },
    });
  });

  test("reduce damage next turn", () => {
    const rule = generateRule(makeCard({
      id: "test-13", name: "Snorlax",
      attacks: [{ name: "Block", cost: ["Colorless"], damage: "30", text: "During your opponent's next turn, this Pokémon takes 30 less damage from attacks." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({
      action: "reduce_damage_next_turn", amount: 30,
    });
  });

  test("bench snipe", () => {
    const rule = generateRule(makeCard({
      id: "test-14", name: "Gengar",
      attacks: [{ name: "Shadow Ball", cost: ["Psychic"], damage: "60", text: "This attack also does 20 damage to 1 of your opponent's Benched Pokémon." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({
      action: "bench_damage", value: 20, side: "opponent", count: 1,
    });
  });

  test("zero damage attack with text gets log step", () => {
    const rule = generateRule(makeCard({
      id: "test-15", name: "Spiritomb",
      attacks: [{ name: "Hex", cost: ["Darkness"], damage: "", text: "Choose a Pokémon in play and it is Knocked Out." }],
    }));
    const valid = expectValid(rule);
    // Should have at least a log step
    expect(valid.attacks![0].steps.length).toBeGreaterThan(0);
  });

  test("defender does less damage", () => {
    const rule = generateRule(makeCard({
      id: "test-16", name: "Buneary",
      attacks: [{ name: "Charm", cost: ["Colorless"], damage: "10", text: "During your opponent's next turn, attacks used by the Defending Pokémon do 20 less damage." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({
      action: "reduce_damage_next_turn", amount: 20,
    });
  });

  test("damage counters per hand size", () => {
    const rule = generateRule(makeCard({
      id: "test-17", name: "Alakazam",
      attacks: [{ name: "Powerful Hand", cost: ["Psychic"], damage: "", text: "Place 2 damage counters on your opponent's Active Pokémon for each card in your hand." }],
    }));
    const valid = expectValid(rule);
    expect(valid.attacks![0].steps).toContainEqual({
      action: "put_damage_counters",
      value: { per: "own_hand_size", multiply: 2 },
      target: { zone: "opp_active" },
    });
  });
});

// ═══════════════════════════════════════════════════════
// Ability Pattern Tests
// ═══════════════════════════════════════════════════════

describe("Offline Rule Generator — Ability Patterns", () => {
  test("passive: reduce incoming damage", () => {
    const rule = generateRule(makeCard({
      id: "test-20", name: "Pyroar",
      abilities: [{ name: "Intimidating Fang", type: "Ability",
        text: "As long as this Pokémon is in the Active Spot, attacks used by your opponent's Active Pokémon do 30 less damage." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("passive");
    expect(valid.abilities![0].modifiers![0].type).toEqual({ modify: "incoming_damage", amount: -30 });
    expect(valid.abilities![0].condition).toEqual({ check: "is_in_active_spot" });
  });

  test("passive: boost outgoing damage", () => {
    const rule = generateRule(makeCard({
      id: "test-21", name: "Garganacl",
      abilities: [{ name: "Powerful Assault", type: "Ability",
        text: "Attacks used by your Fighting Pokémon do 30 more damage." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("passive");
    expect(valid.abilities![0].modifiers![0].type).toEqual({ modify: "outgoing_damage", amount: 30 });
  });

  test("passive: no retreat cost", () => {
    const rule = generateRule(makeCard({
      id: "test-22", name: "Manaphy",
      abilities: [{ name: "Wave Veil", type: "Ability",
        text: "As long as this Pokémon is on your Bench, this Pokémon has no Retreat Cost." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("passive");
    expect(valid.abilities![0].modifiers![0].type).toEqual({ modify: "retreat_cost", amount: -99 });
  });

  test("passive: prevent effects", () => {
    const rule = generateRule(makeCard({
      id: "test-23", name: "Empoleon",
      abilities: [{ name: "Emperor's Stance", type: "Ability",
        text: "Prevent all effects of attacks used by your opponent's Pokémon done to this Pokémon." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("passive");
    expect(valid.abilities![0].modifiers![0].type).toEqual({ modify: "prevent_effects", scope: "all" });
  });

  test("activated: once per turn draw", () => {
    const rule = generateRule(makeCard({
      id: "test-24", name: "Bibarel",
      abilities: [{ name: "Industrious Incisors", type: "Ability",
        text: "Once during your turn, you may draw cards until you have 5 cards in your hand." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("activated");
    expect(valid.abilities![0].oncePerTurn).toBe(true);
    expect(valid.abilities![0].steps!.length).toBeGreaterThan(0);
  });

  test("activated: search deck", () => {
    const rule = generateRule(makeCard({
      id: "test-25", name: "Greninja",
      abilities: [{ name: "Concealed Card", type: "Ability",
        text: "Once during your turn, you may discard a card from your hand. If you do, draw 2 cards." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("activated");
    expect(valid.abilities![0].steps!).toContainEqual({ action: "draw_cards", count: 2 });
  });

  test("triggered: on play from hand", () => {
    const rule = generateRule(makeCard({
      id: "test-26", name: "Lumineon",
      abilities: [{ name: "Luminous Sign", type: "Ability",
        text: "When you play this Pokémon from your hand onto your Bench during your turn, you may search your deck for a Supporter card, reveal it, and put it into your hand. Then, shuffle your deck." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("triggered");
    expect(valid.abilities![0].trigger).toBe("on_play_from_hand");
  });

  test("triggered: evolve trigger", () => {
    const rule = generateRule(makeCard({
      id: "test-27", name: "Hariyama",
      abilities: [{ name: "Heave-Ho", type: "Ability",
        text: "Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may switch your opponent's Active Pokémon with 1 of their Benched Pokémon." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("triggered");
    expect(valid.abilities![0].trigger).toBe("on_evolve");
  });

  test("passive: energy provision", () => {
    const rule = generateRule(makeCard({
      id: "test-28", name: "Meganium",
      abilities: [{ name: "Wild Growth", type: "Ability",
        text: "Each Basic Grass Energy attached to all of your Pokémon provides GrassGrass Energy." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("passive");
    expect(valid.abilities![0].modifiers!.some(m => m.type.modify === "provide_energy_type")).toBe(true);
  });

  test("passive: KO → no prize", () => {
    const rule = generateRule(makeCard({
      id: "test-29", name: "Shedinja",
      abilities: [{ name: "Fragile Husk", type: "Ability",
        text: "If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon ex, your opponent can't take any Prize cards." }],
    }));
    const valid = expectValid(rule);
    expect(valid.abilities![0].type).toBe("passive");
    expect(valid.abilities![0].modifiers!.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// Trainer Pattern Tests
// ═══════════════════════════════════════════════════════

describe("Offline Rule Generator — Trainer Patterns", () => {
  test("supporter: discard hand + draw", () => {
    const rule = generateRule(makeCard({
      id: "test-30", name: "Professor's Research",
      supertype: "Trainer", subtypes: ["Supporter"],
      rules: ["Discard your hand and draw 7 cards.", "You may play only 1 Supporter card during your turn."],
    }));
    const valid = expectValid(rule);
    expect(valid.trainer!.subtype).toBe("Supporter");
    expect(valid.trainer!.steps).toEqual([
      { action: "discard_hand" },
      { action: "draw_cards", count: 7 },
    ]);
  });

  test("item: switch", () => {
    const rule = generateRule(makeCard({
      id: "test-31", name: "Switch",
      supertype: "Trainer", subtypes: ["Item"],
      rules: ["Switch your Active Pokémon with 1 of your Benched Pokémon.", "You may play any number of Item cards during your turn."],
    }));
    const valid = expectValid(rule);
    expect(valid.trainer!.subtype).toBe("Item");
    expect(valid.trainer!.steps).toContainEqual({ action: "switch_pokemon", who: "player" });
  });

  test("supporter: shuffle hand + draw", () => {
    const rule = generateRule(makeCard({
      id: "test-32", name: "Judge",
      supertype: "Trainer", subtypes: ["Supporter"],
      rules: ["Shuffle your hand into your deck. Then, draw 5 cards.", "You may play only 1 Supporter card during your turn."],
    }));
    const valid = expectValid(rule);
    expect(valid.trainer!.steps).toEqual([
      { action: "shuffle_hand_into_deck" },
      { action: "draw_cards", count: 5 },
    ]);
  });

  test("supporter: search deck", () => {
    const rule = generateRule(makeCard({
      id: "test-33", name: "Nest Ball",
      supertype: "Trainer", subtypes: ["Item"],
      rules: ["Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.", "You may play any number of Item cards during your turn."],
    }));
    const valid = expectValid(rule);
    expect(valid.trainer!.steps!.some(s => s.action === "search_deck")).toBe(true);
  });

  test("tool: HP boost", () => {
    const rule = generateRule(makeCard({
      id: "test-34", name: "Heavy Baton",
      supertype: "Trainer", subtypes: ["Pokémon Tool"],
      rules: ["The Pokémon this card is attached to gets +30 HP.", "Attach a Pokémon Tool to 1 of your Pokémon that doesn't already have a Pokémon Tool attached."],
    }));
    const valid = expectValid(rule);
    expect(valid.trainer!.subtype).toBe("Tool");
    expect(valid.trainer!.toolModifiers).toBeDefined();
    expect(valid.trainer!.toolModifiers!.some(m => m.type.modify === "max_hp")).toBe(true);
  });

  test("stadium: generates valid rule", () => {
    const rule = generateRule(makeCard({
      id: "test-35", name: "Beach Court",
      supertype: "Trainer", subtypes: ["Stadium"],
      rules: ["Once during each player's turn, that player may draw a card.", "This card stays in play when you play it."],
    }));
    const valid = expectValid(rule);
    expect(valid.trainer!.subtype).toBe("Stadium");
    expect(valid.trainer!.stadiumEffect).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════
// Edge Cases & Batch Tests
// ═══════════════════════════════════════════════════════

describe("Offline Rule Generator — Edge Cases", () => {
  test("returns null for vanilla Pokemon (no text, no ability)", () => {
    const rule = generateRule(makeCard({
      id: "test-40", name: "Magikarp",
      attacks: [{ name: "Splash", cost: ["Water"], damage: "10" }],
    }));
    // Pure damage — should still generate
    expect(rule).not.toBeNull();
    expect(rule!.attacks![0].steps).toEqual([{ action: "deal_damage", value: 10 }]);
  });

  test("returns null for card with no attacks, no abilities, no rules", () => {
    const rule = generateRule(makeCard({
      id: "test-41", name: "Basic Energy",
      supertype: "Energy",
    }));
    expect(rule).toBeNull();
  });

  test("batch generation works", () => {
    const cards: CardInput[] = [
      makeCard({ id: "b1", name: "A", attacks: [{ name: "Hit", cost: [], damage: "30" }] }),
      makeCard({ id: "b2", name: "B", attacks: [{ name: "Zap", cost: [], damage: "50", text: "Your opponent's Active Pokémon is now Paralyzed." }] }),
    ];
    const rules = generateRules(cards);
    expect(rules.length).toBe(2);
    rules.forEach(r => expectValid(r));
  });

  test("stats calculation works", () => {
    const cards: CardInput[] = [
      makeCard({ id: "s1", name: "X", attacks: [{ name: "A", cost: [], damage: "10" }] }),
      makeCard({ id: "s2", name: "Y", supertype: "Energy" }),
    ];
    const rules = generateRules(cards);
    const stats = getGenerationStats(cards, rules);
    expect(stats.total).toBe(2);
    expect(stats.generated).toBe(1);
    expect(stats.skipped).toBe(1);
  });

  test("confidence is higher for well-parsed cards", () => {
    // Well-parsed: simple damage + status
    const rule1 = generateRule(makeCard({
      id: "c1", name: "Fire",
      attacks: [{ name: "Burn", cost: ["Fire"], damage: "30", text: "Your opponent's Active Pokémon is now Burned." }],
    }));
    // Poorly-parsed: complex text
    const rule2 = generateRule(makeCard({
      id: "c2", name: "Complex",
      attacks: [{ name: "Weird", cost: [], damage: "", text: "Do something extremely unique that no pattern matches." }],
    }));
    expect(rule1!.meta!.confidence).toBeGreaterThanOrEqual(rule2!.meta!.confidence!);
  });
});

// ═══════════════════════════════════════════════════════
// Full Database Validation
// ═══════════════════════════════════════════════════════

describe("Offline Rule Generator — Full Database", () => {
  let allCards: CardInput[];
  let allRules: CardRuleDef[];

  beforeAll(() => {
    const rawCards = require("../data/cards/_index.json");
    allCards = rawCards.map((c: any) => ({
      id: c.id, name: c.name, supertype: c.supertype, subtypes: c.subtypes,
      hp: c.hp, types: c.types, attacks: c.attacks, abilities: c.abilities,
      retreatCost: c.retreatCost, rules: c.rules,
    }));
    allRules = generateRules(allCards);
  });

  test("generates rules for 90%+ of cards", () => {
    // Should cover at least 90% of all cards
    expect(allRules.length / allCards.length).toBeGreaterThan(0.90);
  });

  test("all generated rules pass Zod validation", () => {
    let invalidCount = 0;
    for (const rule of allRules) {
      const result = validateRule(rule);
      if (!result.valid) invalidCount++;
    }
    expect(invalidCount).toBe(0);
  });

  test("100% Pokémon coverage", () => {
    const pokemonCards = allCards.filter(c => c.supertype === "Pokémon");
    const pokemonRules = allRules.filter(r => {
      const card = allCards.find(c => c.id === r.cardId);
      return card?.supertype === "Pokémon";
    });
    expect(pokemonRules.length).toBe(pokemonCards.length);
  });

  test("high confidence rules are majority", () => {
    const highConf = allRules.filter(r => (r.meta?.confidence ?? 0) >= 0.8);
    expect(highConf.length / allRules.length).toBeGreaterThan(0.5);
  });

  test("generation is fast (<100ms)", () => {
    const start = Date.now();
    generateRules(allCards);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
