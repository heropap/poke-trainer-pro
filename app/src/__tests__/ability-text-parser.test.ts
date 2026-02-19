/**
 * Ability Text Parser Tests
 *
 * Tests that the text parser correctly converts ability description text
 * into executable AbilityEffect definitions.
 */

import { parseCardEffects } from "@/engine/effects/text-parser";
import { Card, CardAbility } from "@/types/card";

// ─── Test Helper ─────────────────────────────

function makeCard(ability: CardAbility, overrides: Partial<Card> = {}): Card {
  return {
    id: "test-1",
    name: overrides.name || "TestMon",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "100",
    types: ["Fire"],
    attacks: [],
    abilities: [ability],
    weaknesses: [],
    resistances: [],
    retreatCost: [],
    convertedRetreatCost: 0,
    set: "test",
    number: "1",
    artist: "test",
    rarity: "Common",
    images: { small: "", large: "" },
    legalities: {},
    rules: [],
    ...overrides,
  } as Card;
}

// ═══════════════════════════════════════════════
// Passive Abilities
// ═══════════════════════════════════════════════

describe("Passive ability text parsing", () => {
  it("解析伤害减少被动特性 — 'takes 30 less damage from attacks'", () => {
    const card = makeCard({
      name: "Diamond Coat",
      text: "This Pokémon takes 30 less damage from attacks (after applying Weakness and Resistance).",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();
    expect(result!.abilities).toHaveLength(1);

    const ability = result!.abilities![0];
    expect(ability.name).toBe("Diamond Coat");
    expect(ability.type).toBe("passive");
    expect(ability.modifyIncomingDamage).toBeDefined();

    // 100 damage → 70 damage
    const modified = ability.modifyIncomingDamage!(null as any, 100);
    expect(modified).toBe(70);

    // 20 damage → 0 (not negative)
    expect(ability.modifyIncomingDamage!(null as any, 20)).toBe(0);
  });

  it("解析伤害增加被动特性 — 'attacks used by this Pokémon do 30 more damage'", () => {
    const card = makeCard({
      name: "Power Charge",
      text: "Attacks used by this Pokémon do 30 more damage to your opponent's Active Pokémon.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("passive");
    expect(ability.modifyDamage).toBeDefined();

    // As attacker: 100 → 130
    expect(ability.modifyDamage!(null as any, 100, true)).toBe(130);
    // As defender: no change
    expect(ability.modifyDamage!(null as any, 100, false)).toBe(100);
  });

  it("解析无撤退费用被动特性 — 'has no Retreat Cost'", () => {
    const card = makeCard({
      name: "Agile",
      text: "If this Pokémon has no Energy attached, it has no Retreat Cost.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("passive");
    expect(ability.modifyRetreatCost).toBeDefined();
    expect(ability.modifyRetreatCost!(null as any, 3)).toBe(0);
  });

  it("解析防止备战区伤害被动特性", () => {
    const card = makeCard({
      name: "Ocean Barrier",
      text: "Prevent all damage done to your Benched Pokémon by attacks.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("passive");
    expect(ability.preventBenchDamage).toBe(true);
  });

  it("解析对手攻击减伤被动特性", () => {
    const card = makeCard({
      name: "Intimidating Fang",
      text: "As long as this Pokémon is in the Active Spot, attacks used by your opponent's Active Pokémon do 30 less damage.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("passive");
    expect(ability.modifyIncomingDamage).toBeDefined();
    expect(ability.modifyIncomingDamage!(null as any, 100)).toBe(70);
  });
});

// ═══════════════════════════════════════════════
// Activated Abilities
// ═══════════════════════════════════════════════

describe("Activated ability text parsing", () => {
  it("解析抽牌特性 — 'Draw 2 cards'", () => {
    const card = makeCard({
      name: "Instruct",
      text: "Once during your turn, you may use this Ability. Draw 2 cards.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.name).toBe("Instruct");
    expect(ability.type).toBe("activated");
    expect(ability.onActivate).toBeDefined();
  });

  it("解析抽牌到N张特性 — 'draw cards until you have 6'", () => {
    const card = makeCard({
      name: "Trade",
      text: "Once during your turn, you may use this Ability. Draw cards until you have 6 cards in your hand.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("activated");
    expect(ability.onActivate).toBeDefined();
  });

  it("解析治愈特性 — 'Heal 30 damage from 1 of your Pokémon'", () => {
    const card = makeCard({
      name: "Fermented Juice",
      text: "Once during your turn, if this Pokémon has any Grass Energy attached, you may use this Ability. Heal 30 damage from 1 of your Pokémon.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("activated");
    expect(ability.onActivate).toBeDefined();
  });

  it("解析搜索能量并附加特性", () => {
    const card = makeCard({
      name: "Sinister Surge",
      text: "Once during your turn, you may use this Ability. Search your deck for a Basic Darkness Energy card and attach it to 1 of your Pokémon. Then, shuffle your deck.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("activated");
    expect(ability.onActivate).toBeDefined();
  });

  it("解析移动能量特性 — 'Move a Basic Energy'", () => {
    const card = makeCard({
      name: "Solar Transfer",
      text: "As often as you like during your turn, you may use this Ability. Move a Basic Grass Energy from 1 of your Pokémon to another of your Pokémon.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("activated");
    expect(ability.onActivate).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// On-Evolve Abilities
// ═══════════════════════════════════════════════

describe("On-evolve ability text parsing", () => {
  it("解析进化抽牌特性 — 'when you play this ... to evolve ... Draw 3 cards'", () => {
    const card = makeCard({
      name: "Psychic Draw",
      text: "Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability. Draw 3 cards.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("on_enter");
    expect(ability.onEnter).toBeDefined();
  });

  it("解析进化治愈特性 — 'when you play this ... to evolve ... Heal'", () => {
    const card = makeCard({
      name: "Cast-Off Shell",
      text: "Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability. Heal 100 damage from this Pokémon.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("on_enter");
    expect(ability.onEnter).toBeDefined();
  });

  it("解析进化放置伤害指示物特性", () => {
    const card = makeCard({
      name: "Screaming Circle",
      text: "Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability. You may put 3 damage counters on 1 of your opponent's Pokémon.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("on_enter");
    expect(ability.onEnter).toBeDefined();
  });

  it("解析进化换对手主动宝可梦特性", () => {
    const card = makeCard({
      name: "Heave-Ho Catcher",
      text: "Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability. Switch in 1 of your opponent's Benched Pokémon to the Active Spot. Then, switch your Active Pokémon with 1 of your Benched Pokémon.",
      type: "Ability",
    });

    // should match the "switch opponent active" pattern
    const result = parseCardEffects(card);
    expect(result).not.toBeNull();

    const ability = result!.abilities![0];
    expect(ability.type).toBe("on_enter");
  });
});

// ═══════════════════════════════════════════════
// No Match (should return null for unrecognized)
// ═══════════════════════════════════════════════

describe("Unrecognized abilities return null", () => {
  it("复杂特性不会错误匹配", () => {
    const card = makeCard({
      name: "Wild Growth",
      text: "Each Basic Grass Energy attached to all of your Pokémon provides GrassGrass Energy.",
      type: "Ability",
    });

    const result = parseCardEffects(card);
    // This ability is too complex for the text parser — should not have abilities
    expect(result === null || !result.abilities || result.abilities.length === 0).toBe(true);
  });

  it("没有特性的卡不返回abilities", () => {
    const card = {
      id: "test-1",
      name: "TestMon",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      hp: "100",
      types: ["Fire"],
      attacks: [],
      weaknesses: [],
      resistances: [],
      retreatCost: [],
      convertedRetreatCost: 0,
      set: "test",
      number: "1",
      artist: "test",
      rarity: "Common",
      images: { small: "", large: "" },
      legalities: {},
      rules: [],
    } as Card;

    const result = parseCardEffects(card);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// Coverage Stats
// ═══════════════════════════════════════════════

describe("Ability text parser coverage", () => {
  it("能覆盖真实卡片数据中至少15%的特性", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cards = require("@/data/cards/_index.json") as Card[];
    const withAbilities = cards.filter(c => c.abilities && c.abilities.length > 0 && c.supertype === "Pokémon");

    let total = 0;
    let matched = 0;

    for (const card of withAbilities) {
      for (const _ability of card.abilities!) {
        total++;
      }
      const result = parseCardEffects(card);
      if (result && result.abilities && result.abilities.length > 0) {
        matched += result.abilities.length;
      }
    }

    console.log(`[Ability Coverage] ${matched}/${total} (${Math.round(matched / total * 100)}%)`);
    expect(matched).toBeGreaterThanOrEqual(total * 0.15);
  });
});
