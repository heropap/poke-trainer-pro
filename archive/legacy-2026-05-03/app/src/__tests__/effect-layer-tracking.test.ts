/**
 * Tests for effect source layer tracking (L1/L2/L3/L4).
 *
 * Validates that the parallel source tracking maps in effect-registry
 * correctly record which layer registered each effect, and that
 * getEffectSource returns the right layer via ID-first, name-fallback lookup.
 */

import {
  registerEffect,
  registerAll,
  registerByName,
  registerAllByName,
  getEffect,
  getEffectSource,
  hasEffect,
  clearRegistry,
  getRegisteredCount,
  getNameRegisteredCount,
} from "@/engine/effects/effect-registry";
import type { EffectSourceLayer } from "@/engine/effects/effect-registry";
import type { CardEffectDef } from "@/engine/effects/effect-types";

// ─── Helpers ───

function makeDef(cardId: string, cardName?: string): CardEffectDef {
  return {
    cardId,
    cardName,
    attacks: [{ name: "TestAttack", onAttack: (_ctx, dmg) => ({ damage: dmg }) }],
  };
}

function makeNameDef(cardId: string, cardName: string): CardEffectDef & { cardName: string } {
  return {
    cardId,
    cardName,
    trainer: { onPlay: () => {} },
  };
}

// ─── Tests ───

beforeEach(() => {
  clearRegistry();
});

describe("effect-layer-tracking: registerEffect + getEffectSource (ID-based)", () => {
  test("returns null when no effect is registered", () => {
    expect(getEffectSource("nonexistent-id")).toBeNull();
    expect(getEffectSource("nonexistent-id", "SomeName")).toBeNull();
  });

  test("registers L1 source for ID-based effect", () => {
    registerEffect(makeDef("sv1-25"), "L1");
    expect(getEffectSource("sv1-25")).toBe("L1");
  });

  test("registers L4 source for text-parser effect", () => {
    registerEffect(makeDef("base-42"), "L4");
    expect(getEffectSource("base-42")).toBe("L4");
  });

  test("overwrites source when re-registered", () => {
    registerEffect(makeDef("sv1-25"), "L4");
    expect(getEffectSource("sv1-25")).toBe("L4");

    // Re-register with higher-priority source
    registerEffect(makeDef("sv1-25"), "L1");
    expect(getEffectSource("sv1-25")).toBe("L1");
  });

  test("registers without source parameter (backward compatible)", () => {
    registerEffect(makeDef("sv1-25"));
    // Effect exists but source is null
    expect(hasEffect("sv1-25")).toBe(true);
    expect(getEffectSource("sv1-25")).toBeNull();
  });
});

describe("effect-layer-tracking: registerAll + getEffectSource (batch ID-based)", () => {
  test("batch registers with L1 source", () => {
    const defs = [makeDef("sv1-1"), makeDef("sv1-2"), makeDef("sv1-3")];
    registerAll(defs, "L1");

    expect(getEffectSource("sv1-1")).toBe("L1");
    expect(getEffectSource("sv1-2")).toBe("L1");
    expect(getEffectSource("sv1-3")).toBe("L1");
  });

  test("batch registers without source (backward compatible)", () => {
    registerAll([makeDef("sv1-1"), makeDef("sv1-2")]);

    expect(hasEffect("sv1-1")).toBe(true);
    expect(getEffectSource("sv1-1")).toBeNull();
  });
});

describe("effect-layer-tracking: registerByName + getEffectSource (name-based)", () => {
  test("registers L2 source for name-based effect", () => {
    registerByName(makeNameDef("name:Iono", "Iono"), "L2");
    // Name-based registration stores in nameRegistry, not idRegistry
    // So we need to pass the name for fallback lookup
    expect(getEffectSource("name:Iono", "Iono")).toBe("L2");
    // Also accessible via name fallback with any unknown ID
    expect(getEffectSource("unknown-id", "Iono")).toBe("L2");
  });

  test("registers L3 source for ryuu text-parsed effect", () => {
    registerByName(makeNameDef("name:Bill", "Bill"), "L3");
    expect(getEffectSource("some-other-id", "Bill")).toBe("L3");
  });

  test("name fallback only used when ID not found", () => {
    registerEffect(makeDef("sv1-25"), "L1");
    registerByName(makeNameDef("name:Pikachu", "Pikachu"), "L2");

    // sv1-25 resolves via ID → L1
    expect(getEffectSource("sv1-25", "Pikachu")).toBe("L1");

    // Unknown ID falls back to name → L2
    expect(getEffectSource("unknown-id", "Pikachu")).toBe("L2");
  });

  test("registers without source parameter", () => {
    registerByName(makeNameDef("name:Test", "Test"));
    expect(hasEffect("anything", "Test")).toBe(true);
    expect(getEffectSource("anything", "Test")).toBeNull();
  });
});

describe("effect-layer-tracking: registerAllByName (batch name-based)", () => {
  test("batch registers with L2 source", () => {
    const defs = [
      makeNameDef("name:Professor", "Professor's Research"),
      makeNameDef("name:Boss", "Boss's Orders"),
    ];
    registerAllByName(defs, "L2");

    expect(getEffectSource("any", "Professor's Research")).toBe("L2");
    expect(getEffectSource("any", "Boss's Orders")).toBe("L2");
  });

  test("batch registers without source", () => {
    registerAllByName([makeNameDef("name:X", "CardX")]);
    expect(hasEffect("any", "CardX")).toBe(true);
    expect(getEffectSource("any", "CardX")).toBeNull();
  });
});

describe("effect-layer-tracking: clearRegistry clears source maps", () => {
  test("clear removes all sources", () => {
    registerEffect(makeDef("sv1-1"), "L1");
    registerByName(makeNameDef("name:Bill", "Bill"), "L2");

    expect(getEffectSource("sv1-1")).toBe("L1");
    expect(getEffectSource("any", "Bill")).toBe("L2");

    clearRegistry();

    expect(getEffectSource("sv1-1")).toBeNull();
    expect(getEffectSource("any", "Bill")).toBeNull();
    expect(getRegisteredCount()).toBe(0);
    expect(getNameRegisteredCount()).toBe(0);
  });
});

describe("effect-layer-tracking: source priority (ID > Name)", () => {
  test("ID source takes priority over name source", () => {
    // Register same card by ID (L1) and by name (L2)
    registerEffect(makeDef("sv1-25", "Pikachu"), "L1");
    registerByName(makeNameDef("name:Pikachu", "Pikachu"), "L2");

    // ID match wins
    expect(getEffectSource("sv1-25", "Pikachu")).toBe("L1");
    // Unknown ID falls through to name
    expect(getEffectSource("different-id", "Pikachu")).toBe("L2");
  });

  test("all four layers can coexist", () => {
    registerEffect(makeDef("id-l1"), "L1");
    registerByName(makeNameDef("name:l2", "L2Card"), "L2");
    registerByName(makeNameDef("name:l3", "L3Card"), "L3");
    registerEffect(makeDef("id-l4"), "L4");

    expect(getEffectSource("id-l1")).toBe("L1");
    expect(getEffectSource("x", "L2Card")).toBe("L2");
    expect(getEffectSource("x", "L3Card")).toBe("L3");
    expect(getEffectSource("id-l4")).toBe("L4");
  });
});

describe("effect-layer-tracking: integration with getEffect", () => {
  test("getEffect and getEffectSource use same lookup path", () => {
    registerEffect(makeDef("sv1-25", "Pikachu"), "L1");

    const effect = getEffect("sv1-25");
    const source = getEffectSource("sv1-25");

    expect(effect).not.toBeNull();
    expect(source).toBe("L1");
  });

  test("name fallback works for both getEffect and getEffectSource", () => {
    registerByName(makeNameDef("name:Iono", "Iono"), "L2");

    const effect = getEffect("sv2-185", "Iono");
    const source = getEffectSource("sv2-185", "Iono");

    expect(effect).not.toBeNull();
    expect(source).toBe("L2");
  });
});

describe("effect-layer-tracking: initializeEffects integration", () => {
  test("initializeEffects marks layers correctly", () => {
    // This test imports and runs the full initialization pipeline
    // to verify end-to-end source tracking
    const { initializeEffects, getRegisteredCardIds, getRegisteredCardNames } =
      require("@/engine/effects");
    const { getEffectSource: getSource } =
      require("@/engine/effects/effect-registry");

    clearRegistry();

    const cardsData = require("@/data/cards/_index.json");
    initializeEffects(cardsData);

    const ids = getRegisteredCardIds();
    const names = getRegisteredCardNames();

    // Should have some ID-based effects (L1)
    let l1Count = 0;
    let l2Count = 0;
    for (const id of ids) {
      const src = getSource(id);
      if (src === "L1") l1Count++;
    }
    for (const name of names) {
      const src = getSource("__lookup__", name);
      if (src === "L2") l2Count++;
      // L3/L4 registered by name too
    }

    // L1 effects exist (hand-written by ID)
    expect(l1Count).toBeGreaterThan(0);
    // L2 effects exist (hand-written by name)
    expect(l2Count).toBeGreaterThan(0);

    // Total registered should be substantial
    expect(ids.length + names.length).toBeGreaterThan(10);
  });
});
