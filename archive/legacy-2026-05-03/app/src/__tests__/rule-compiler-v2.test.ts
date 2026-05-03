/**
 * Rule Compiler V2 — Integration Tests
 *
 * Verifies that card-rules-v2.json can be compiled into executable CardEffectDefs.
 */

import { compileCardV2, compileAllV2, CardRuleV2Entry } from "../engine/rules/rule-compiler-v2";
import * as fs from "fs";
import * as path from "path";

// Load card-rules-v2.json
const RULES_PATH = path.join(__dirname, "..", "data", "card-rules-v2.json");
let allCards: CardRuleV2Entry[] = [];

beforeAll(() => {
  const raw = fs.readFileSync(RULES_PATH, "utf-8");
  allCards = JSON.parse(raw);
});

describe("V2 Rule Compiler — Compilation", () => {
  test("loads card-rules-v2.json successfully", () => {
    expect(allCards.length).toBeGreaterThan(5000);
  });

  test("compiles all cards without throwing", () => {
    let compiled = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const card of allCards) {
      try {
        const result = compileCardV2(card);
        if (result) compiled++;
      } catch (e: any) {
        failed++;
        if (errors.length < 10) {
          errors.push(`${card.cardId} (${card.cardName}): ${e.message}`);
        }
      }
    }

    console.log(`Compiled: ${compiled}, Failed: ${failed}, Total: ${allCards.length}`);
    if (errors.length > 0) {
      console.log("First errors:", errors);
    }

    expect(failed).toBe(0);
    expect(compiled).toBeGreaterThan(4000);
  });

  test("compileAllV2 returns correct count", () => {
    const defs = compileAllV2(allCards);
    expect(defs.length).toBeGreaterThan(4000);
    console.log(`compileAllV2: ${defs.length} CardEffectDefs from ${allCards.length} cards`);
  });
});

describe("V2 Rule Compiler — Attack Compilation", () => {
  test("compiles a damage-only attack", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "attack" && r.parseSource === "damage_only" && r.mapped
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
    expect(def!.attacks).toBeDefined();
    expect(def!.attacks!.length).toBeGreaterThan(0);
    expect(def!.attacks![0].name).toBeDefined();
  });

  test("compiles an attack with status effect", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "attack" && r.mapped && r.originalText?.includes("now Poisoned")
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
    expect(def!.attacks).toBeDefined();
  });

  test("compiles an attack with coin flip", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "attack" && r.mapped && r.originalText?.includes("Flip a coin")
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
    expect(def!.attacks).toBeDefined();
  });

  test("compiles an attack with dynamic damage", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "attack" && r.mapped && r.dynamicDamage
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
    expect(def!.attacks).toBeDefined();
  });
});

describe("V2 Rule Compiler — Ability Compilation", () => {
  test("compiles an activated ability", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "ability" && r.mapped && r.abilitySubType === "activated"
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
    expect(def!.abilities).toBeDefined();
    expect(def!.abilities![0].type).toBe("activated");
    expect(def!.abilities![0].onActivate).toBeDefined();
  });

  test("compiles a passive ability", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "ability" && r.mapped && r.abilitySubType === "passive"
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
    expect(def!.abilities).toBeDefined();
    expect(def!.abilities![0].type).toBe("passive");
  });

  test("compiles an on_enter ability", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "ability" && r.mapped && r.abilitySubType === "on_enter"
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
    expect(def!.abilities).toBeDefined();
    expect(def!.abilities![0].onEnter).toBeDefined();
  });
});

describe("V2 Rule Compiler — Trainer Compilation", () => {
  test("compiles a Supporter card", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "trainer_effect" && r.mapped && r.trainerSubType === "Supporter"
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
    expect(def!.trainer).toBeDefined();
    expect(def!.trainer!.onPlay).toBeDefined();
  });

  test("compiles an Item card", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "trainer_effect" && r.mapped && r.trainerSubType === "Item"
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
  });

  test("compiles a Tool card", () => {
    const card = allCards.find(c => c.rules.some(r =>
      r.type === "trainer_effect" && r.mapped && r.trainerSubType === "Tool"
    ));
    expect(card).toBeDefined();

    const def = compileCardV2(card!);
    expect(def).not.toBeNull();
    // Tool should have either tool or trainer effect
    expect(def!.tool || def!.trainer).toBeDefined();
  });
});

describe("V2 Rule Compiler — Coverage Statistics", () => {
  test("reports coverage stats", () => {
    const defs = compileAllV2(allCards);

    let totalAttacks = 0;
    let totalAbilities = 0;
    let totalTrainers = 0;

    for (const def of defs) {
      totalAttacks += def.attacks?.length || 0;
      totalAbilities += def.abilities?.length || 0;
      if (def.trainer) totalTrainers++;
    }

    console.log("\n═══ V2 Compilation Coverage ═══");
    console.log(`Cards compiled: ${defs.length} / ${allCards.length}`);
    console.log(`Attacks: ${totalAttacks}`);
    console.log(`Abilities: ${totalAbilities}`);
    console.log(`Trainers: ${totalTrainers}`);
    console.log(`Tools: ${defs.filter(d => d.tool).length}`);

    expect(defs.length).toBeGreaterThan(4000);
    expect(totalAttacks).toBeGreaterThan(5000);
  });
});
