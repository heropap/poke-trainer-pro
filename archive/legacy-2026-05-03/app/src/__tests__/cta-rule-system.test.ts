/**
 * CTA Rule System — Unit Tests
 *
 * Tests the complete pipeline:
 *   CardRuleDef JSON → Zod Validation → Rule Compiler → CardEffectDef → Execution
 *
 * Covers 10 representative cards:
 * 1. Pyroar (passive ability — damage reduction)
 * 2. Mega Charizard X ex (per-energy damage + discard all Fire)
 * 3. Pikachu ex (300 damage + discard 3 energy)
 * 4. Professor's Research (Supporter: discard hand + draw 7)
 * 5. Switch (Item: switch own active)
 * 6. Mega Gardevoir ex (for_each bench + per-energy damage)
 * 7. Frosmoth (activated ability — both players draw)
 * 8. Oddish (heal self after damage)
 * 9. Ponyta (coin flip bonus damage)
 * 10. Chansey (self-damage)
 */

import { validateCardRuleDef } from "@/engine/rules/rule-schema-zod";
import { validateRule } from "@/engine/rules/rule-validator";
import { compileRule } from "@/engine/rules/rule-compiler";
import { ModifierPipeline } from "@/engine/rules/modifier-pipeline";
import { EventHookRegistry } from "@/engine/rules/event-hooks";
import { CardRuleDef } from "@/engine/rules/card-rule-def";
import { EffectContext, AttackResult, CardEffectDef } from "@/engine/effects/effect-types";
import { GameCard, Player, GameState, StatusCondition } from "@/engine/game-state";

// Load test card rules
import cardRules from "@/data/card-rules/index.json";

// ═══════════════════════════════════════════════════════
// Mock Helpers
// ═══════════════════════════════════════════════════════

let coinResult = true;
let coinResults: boolean[] = [];

function makeGameCard(overrides: Partial<GameCard["card"]> & { instanceId?: string } = {}): GameCard {
  const id = overrides.instanceId || `test-${Math.random().toString(36).slice(2, 8)}`;
  return {
    instanceId: id,
    cardId: overrides.id || "test-001",
    card: {
      id: overrides.id || "test-001",
      name: overrides.name || "Test Pokemon",
      supertype: overrides.supertype || "Pokémon",
      subtypes: overrides.subtypes || ["Basic"],
      hp: overrides.hp || "100",
      types: overrides.types || ["Colorless"],
      attacks: overrides.attacks || [],
      images: { small: "", large: "" },
      set: { id: "test", name: "Test", series: "Test" },
      number: "1",
      rarity: "Common",
      ...(overrides as any),
    },
    damageCounters: 0,
    statusConditions: [],
    attachedEnergy: [],
    attachedTools: [],
    playedThisTurn: false,
    evolvedThisTurn: false,
    abilityUsedThisTurn: false,
    markers: {},
    evolutionStack: [],
  };
}

function makeEnergy(type = "Fire", name?: string): GameCard {
  return makeGameCard({
    name: name || `${type} Energy`,
    supertype: "Energy",
    subtypes: ["Basic"],
    types: [type],
  });
}

function makeZone(cards: GameCard[] = []) {
  return { cards };
}

function createMockContext(overrides: Partial<{
  source: GameCard;
  player: Partial<Player>;
  opponent: Partial<Player>;
}> = {}): EffectContext {
  const defaultPlayer = {
    id: "p1",
    name: "Player 1",
    active: makeGameCard({ name: "Active Mon" }),
    bench: makeZone(),
    hand: makeZone(),
    deck: makeZone(Array.from({ length: 30 }, () => makeGameCard())),
    discard: makeZone(),
    prizes: makeZone(Array.from({ length: 6 }, () => makeGameCard())),
    energyAttachedThisTurn: false,
    supporterUsedThisTurn: false,
  } as Player;

  const defaultOpponent = {
    id: "p2",
    name: "Player 2",
    active: makeGameCard({ name: "Opp Active Mon" }),
    bench: makeZone(),
    hand: makeZone(Array.from({ length: 5 }, () => makeGameCard())),
    deck: makeZone(Array.from({ length: 30 }, () => makeGameCard())),
    discard: makeZone(),
    prizes: makeZone(Array.from({ length: 6 }, () => makeGameCard())),
    energyAttachedThisTurn: false,
    supporterUsedThisTurn: false,
  } as Player;

  const player = { ...defaultPlayer, ...overrides.player } as Player;
  const opponent = { ...defaultOpponent, ...overrides.opponent } as Player;
  const source = overrides.source || player.active!;

  let flipIndex = 0;

  const ctx: EffectContext = {
    state: { players: [player, opponent] } as GameState,
    player,
    opponent,
    playerIndex: 0,
    opponentIndex: 1,
    source,

    damage: jest.fn(),
    damageAll: jest.fn(),
    heal: jest.fn((amount, target) => {
      target.damageCounters = Math.max(0, target.damageCounters - Math.floor(amount / 10));
    }),
    drawCards: jest.fn((count, who) => {
      const p = who === "opponent" ? opponent : player;
      const drawn: GameCard[] = [];
      for (let i = 0; i < count && p.deck.cards.length > 0; i++) {
        drawn.push(p.deck.cards.shift()!);
        p.hand.cards.push(drawn[drawn.length - 1]);
      }
      return drawn;
    }),
    discardFromHand: jest.fn((count, who) => {
      const p = who === "opponent" ? opponent : player;
      return p.hand.cards.splice(0, count);
    }),
    promptDiscardFromHand: jest.fn(async (count, who) => {
      const p = who === "opponent" ? opponent : player;
      return p.hand.cards.splice(0, count);
    }),
    discardHand: jest.fn((who) => {
      const p = who === "opponent" ? opponent : player;
      const cards = [...p.hand.cards];
      p.discard.cards.push(...cards);
      p.hand.cards = [];
      return cards;
    }),
    searchDeck: jest.fn((filter, count, who) => {
      const p = who === "opponent" ? opponent : player;
      const results: GameCard[] = [];
      for (let i = 0; i < p.deck.cards.length && results.length < count; i++) {
        if (filter(p.deck.cards[i])) {
          results.push(p.deck.cards.splice(i, 1)[0]);
          i--;
        }
      }
      return results;
    }),
    addToHand: jest.fn((card, who) => {
      const p = who === "opponent" ? opponent : player;
      p.hand.cards.push(card);
    }),
    shuffleDeck: jest.fn(),
    attachEnergyFromDeck: jest.fn(() => false),
    attachEnergyFromDiscard: jest.fn(() => []),
    moveEnergy: jest.fn(() => true),
    flipCoin: jest.fn(() => {
      if (coinResults.length > 0) return coinResults[flipIndex++ % coinResults.length];
      return coinResult;
    }),
    flipCoins: jest.fn((count) => {
      let heads = 0;
      for (let i = 0; i < count; i++) {
        if (coinResults.length > 0) {
          if (coinResults[flipIndex++ % coinResults.length]) heads++;
        } else if (coinResult) {
          heads++;
        }
      }
      return { heads, tails: count - heads };
    }),
    applyStatus: jest.fn(),
    removeStatus: jest.fn(),
    removeAllStatus: jest.fn(),
    switchOwnActive: jest.fn(() => true),
    switchOpponentActive: jest.fn(() => true),
    searchDiscard: jest.fn(() => []),
    shuffleHandIntoDeck: jest.fn(() => 0),
    revealTopCards: jest.fn(() => []),
    putOnTopOfDeck: jest.fn(),
    shuffleIntoDeck: jest.fn(),
    pickUpPokemon: jest.fn(() => []),
    findPokemon: jest.fn(() => null),
    getAllPokemon: jest.fn((who) => {
      const p = who === "opponent" ? opponent : player;
      const all = p.active ? [p.active] : [];
      all.push(...p.bench.cards);
      return all;
    }),
    getStadium: jest.fn(() => null),
    removeStadium: jest.fn(() => false),
    addMarker: jest.fn((target, name, count = 1) => {
      target.markers[name] = (target.markers[name] || 0) + count;
    }),
    removeMarker: jest.fn((target, name, count) => {
      if (count === undefined) {
        delete target.markers[name];
      } else {
        target.markers[name] = Math.max(0, (target.markers[name] || 0) - count);
      }
    }),
    getMarker: jest.fn((target, name) => target.markers[name] || 0),
    hasMarker: jest.fn((target, name) => (target.markers[name] || 0) > 0),
    log: jest.fn(),
    promptUser: jest.fn(async () => []),
  };

  return ctx;
}

// ═══════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════

describe("CTA Rule System", () => {
  beforeEach(() => {
    coinResult = true;
    coinResults = [];
  });

  // ─── 1. Zod Validation ───

  describe("Zod Structural Validation", () => {
    test("all 10 card rules pass Zod validation", () => {
      for (const rule of cardRules) {
        const result = validateCardRuleDef(rule);
        expect(result.valid).toBe(true);
        if (!result.valid) {
          console.error(`Validation failed for ${(rule as any).cardName}:`, result.errors);
        }
      }
    });

    test("rejects invalid JSON (missing required fields)", () => {
      const invalid = { cardId: "test-1" }; // missing cardName, version
      const result = validateCardRuleDef(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    test("rejects invalid action type", () => {
      const invalid = {
        cardId: "test-1",
        cardName: "Test",
        version: 1,
        attacks: [{
          name: "Test Attack",
          steps: [{ action: "nonexistent_action" }],
        }],
      };
      const result = validateCardRuleDef(invalid);
      expect(result.valid).toBe(false);
    });

    test("rejects invalid energy type", () => {
      const invalid = {
        cardId: "test-1",
        cardName: "Test",
        version: 1,
        attacks: [{
          name: "Test Attack",
          steps: [{ action: "apply_status", status: "frozen" }], // invalid status
        }],
      };
      const result = validateCardRuleDef(invalid);
      expect(result.valid).toBe(false);
    });
  });

  // ─── 2. Semantic Validation ───

  describe("Semantic Validation", () => {
    test("validates card with card data cross-reference", () => {
      const rule = cardRules[0]; // Pyroar
      const result = validateRule(rule, {
        id: "me1-24",
        name: "Pyroar",
        supertype: "Pokémon",
        subtypes: ["Stage 1"],
        hp: "130",
        types: ["Fire"],
        attacks: [{ name: "Scorching Breath", cost: ["Fire", "Colorless", "Colorless"], damage: "120" }],
        abilities: [{ name: "Intimidating Fang", text: "...", type: "Ability" }],
      });
      expect(result.valid).toBe(true);
      expect(result.semanticErrors).toHaveLength(0);
    });

    test("detects attack name mismatch", () => {
      const rule = cardRules[0]; // Pyroar
      const result = validateRule(rule, {
        id: "me1-24",
        name: "Pyroar",
        supertype: "Pokémon",
        attacks: [{ name: "Wrong Name", cost: [], damage: "0" }],
      });
      expect(result.semanticErrors.length).toBeGreaterThan(0);
      expect(result.semanticErrors[0]).toContain("Scorching Breath");
    });
  });

  // ─── 3. Rule Compiler ───

  describe("Rule Compiler", () => {
    test("compiles all 10 card rules into CardEffectDef", () => {
      for (const rule of cardRules) {
        const def = compileRule(rule as CardRuleDef);
        expect(def).not.toBeNull();
        expect(def!.cardId).toBe((rule as any).cardId);
      }
    });

    test("compiled attack has onAttack callback", () => {
      const ponytaRule = cardRules.find((r: any) => r.cardName === "Ponyta") as CardRuleDef;
      const def = compileRule(ponytaRule)!;
      expect(def.attacks).toBeDefined();
      expect(def.attacks!.length).toBe(2);
      expect(typeof def.attacks![0].onAttack).toBe("function");
    });

    test("compiled trainer has onPlay callback", () => {
      const profRule = cardRules.find((r: any) => r.cardName.includes("Professor")) as CardRuleDef;
      const def = compileRule(profRule)!;
      expect(def.trainer).toBeDefined();
      expect(typeof def.trainer!.onPlay).toBe("function");
    });

    test("compiled passive ability has modifyIncomingDamage", () => {
      const pyroarRule = cardRules.find((r: any) => r.cardName === "Pyroar") as CardRuleDef;
      const def = compileRule(pyroarRule)!;
      expect(def.abilities).toBeDefined();
      expect(def.abilities![0].type).toBe("passive");
      expect(def.abilities![0].modifyIncomingDamage).toBeDefined();
    });
  });

  // ─── 4. Attack Execution: Chansey (self-damage) ───

  describe("Chansey — Double-Edge (self-damage)", () => {
    test("deals 80 damage and 80 self-damage", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Chansey") as CardRuleDef;
      const def = compileRule(rule)!;
      const ctx = createMockContext();
      const result = def.attacks![0].onAttack(ctx, 80);

      expect(result.damage).toBe(80);
      expect(result.selfDamage).toBe(80);
    });
  });

  // ─── 5. Attack Execution: Ponyta (coin flip bonus) ───

  describe("Ponyta — Stomp (coin flip bonus)", () => {
    test("deals 50 on heads (base 20 + coin flip sets 50)", () => {
      coinResult = true;
      const rule = cardRules.find((r: any) => r.cardName === "Ponyta") as CardRuleDef;
      const def = compileRule(rule)!;
      const ctx = createMockContext();
      // Stomp is the second attack
      const result = def.attacks![1].onAttack(ctx, 20);

      // deal_damage sets to 20, then flip_coin heads → deal_damage sets to 50
      expect(result.damage).toBe(50);
    });

    test("deals 20 on tails", () => {
      coinResult = false;
      const rule = cardRules.find((r: any) => r.cardName === "Ponyta") as CardRuleDef;
      const def = compileRule(rule)!;
      const ctx = createMockContext();
      const result = def.attacks![1].onAttack(ctx, 20);

      expect(result.damage).toBe(20);
    });
  });

  // ─── 6. Attack Execution: Oddish (heal self) ───

  describe("Oddish — Absorb (heal self)", () => {
    test("deals 10 damage and heals self", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Oddish") as CardRuleDef;
      const def = compileRule(rule)!;
      const ctx = createMockContext();
      ctx.source.damageCounters = 3; // 30 damage

      const result = def.attacks![0].onAttack(ctx, 10);
      expect(result.damage).toBe(10);
      expect(ctx.heal).toHaveBeenCalledWith(10, ctx.source);
    });
  });

  // ─── 7. Trainer Execution: Professor's Research ───

  describe("Professor's Research (discard hand + draw 7)", () => {
    test("discards hand then draws 7", async () => {
      const rule = cardRules.find((r: any) => r.cardName.includes("Professor")) as CardRuleDef;
      const def = compileRule(rule)!;
      const ctx = createMockContext({
        player: {
          hand: makeZone([makeGameCard(), makeGameCard(), makeGameCard()]),
        } as any,
      });

      await def.trainer!.onPlay(ctx);
      expect(ctx.discardHand).toHaveBeenCalledWith("player");
      expect(ctx.drawCards).toHaveBeenCalledWith(7, "player");
    });
  });

  // ─── 8. Trainer Execution: Switch ───

  describe("Switch (switch own active)", () => {
    test("switches own active with bench Pokemon", async () => {
      const rule = cardRules.find((r: any) => r.cardName === "Switch") as CardRuleDef;
      const def = compileRule(rule)!;
      const benchMon = makeGameCard({ name: "Bench Mon" });
      const ctx = createMockContext({
        player: {
          bench: makeZone([benchMon]),
        } as any,
      });

      await def.trainer!.onPlay(ctx);
      expect(ctx.switchOwnActive).toHaveBeenCalled();
    });

    test("canPlay returns false when no bench Pokemon", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Switch") as CardRuleDef;
      const def = compileRule(rule)!;
      const ctx = createMockContext({
        player: { bench: makeZone([]) } as any,
      });

      expect(def.trainer!.canPlay!(ctx)).toBe(false);
    });
  });

  // ─── 9. Pikachu ex — Topaz Bolt (discard energy) ───

  describe("Pikachu ex — Topaz Bolt (300 damage + discard 3)", () => {
    test("deals 300 and sets discardEnergy", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Pikachu ex") as CardRuleDef;
      const def = compileRule(rule)!;
      const ctx = createMockContext();

      const result = def.attacks![0].onAttack(ctx, 300);
      expect(result.damage).toBe(300);
      expect(result.discardEnergy).toBe(3);
    });
  });

  // ─── 10. Mega Charizard X ex — per-energy damage ───

  describe("Mega Charizard X ex — Inferno X (per-energy damage)", () => {
    test("deals 90 per energy on self", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Mega Charizard X ex") as CardRuleDef;
      const def = compileRule(rule)!;
      const source = makeGameCard({ name: "Mega Charizard X ex" });
      source.attachedEnergy = [
        makeEnergy("Fire"),
        makeEnergy("Fire"),
        makeEnergy("Fire"),
      ];
      const ctx = createMockContext({ source });

      const result = def.attacks![0].onAttack(ctx, 0);
      expect(result.damage).toBe(270); // 3 × 90
    });

    test("deals 0 with no energy", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Mega Charizard X ex") as CardRuleDef;
      const def = compileRule(rule)!;
      const source = makeGameCard({ name: "Mega Charizard X ex" });
      source.attachedEnergy = [];
      const ctx = createMockContext({ source });

      const result = def.attacks![0].onAttack(ctx, 0);
      expect(result.damage).toBe(0);
    });
  });

  // ─── 11. Pyroar — Passive Ability (damage reduction) ───

  describe("Pyroar — Intimidating Fang (passive -30)", () => {
    test("passive ability reduces incoming damage by 30", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Pyroar") as CardRuleDef;
      const def = compileRule(rule)!;
      const ctx = createMockContext();

      expect(def.abilities![0].modifyIncomingDamage).toBeDefined();
      const reduced = def.abilities![0].modifyIncomingDamage!(ctx, 100);
      expect(reduced).toBe(70); // 100 - 30
    });

    test("damage cannot go below 0", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Pyroar") as CardRuleDef;
      const def = compileRule(rule)!;
      const ctx = createMockContext();

      const reduced = def.abilities![0].modifyIncomingDamage!(ctx, 20);
      expect(reduced).toBe(0); // max(0, 20-30)
    });
  });

  // ─── 12. Frosmoth — Activated Ability ───

  describe("Frosmoth — Alluring Wings (activated: both draw)", () => {
    test("compiled as activated ability", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Frosmoth") as CardRuleDef;
      const def = compileRule(rule)!;

      expect(def.abilities).toBeDefined();
      expect(def.abilities![0].type).toBe("activated");
      expect(def.abilities![0].onActivate).toBeDefined();
    });

    test("canActivate checks is_in_active_spot", () => {
      const rule = cardRules.find((r: any) => r.cardName === "Frosmoth") as CardRuleDef;
      const def = compileRule(rule)!;
      const source = makeGameCard({ name: "Frosmoth" });
      const ctx = createMockContext({
        source,
        player: { active: source } as any,
      });

      // When source IS the active Pokemon, canActivate returns true
      expect(def.abilities![0].canActivate!(ctx)).toBe(true);
    });
  });

  // ─── 13. ModifierPipeline ───

  describe("ModifierPipeline", () => {
    test("registers and applies outgoing damage modifier", () => {
      const pipeline = new ModifierPipeline();
      const source = makeGameCard({ name: "Boost Mon" });
      const target = makeGameCard({ name: "Target Mon" });

      pipeline.register(
        source.instanceId,
        "Boost Mon",
        { type: { modify: "outgoing_damage", amount: 20 } },
        0,
      );

      const damage = pipeline.applyOutgoingDamage(100, {
        target,
        targetPlayerIndex: 0,
        source,
        sourcePlayerIndex: 0,
      });
      expect(damage).toBe(120);
    });

    test("registers and applies incoming damage modifier", () => {
      const pipeline = new ModifierPipeline();
      const source = makeGameCard({ name: "Tank Mon" });

      pipeline.register(
        source.instanceId,
        "Tank Mon",
        { type: { modify: "incoming_damage", amount: -30 } },
        0,
      );

      const damage = pipeline.applyIncomingDamage(100, {
        target: source,
        targetPlayerIndex: 0,
      });
      expect(damage).toBe(70);
    });

    test("unregisters modifier by source", () => {
      const pipeline = new ModifierPipeline();
      const source = makeGameCard({ name: "Mon" });

      pipeline.register(source.instanceId, "Mon", { type: { modify: "incoming_damage", amount: -20 } }, 0);
      expect(pipeline.count).toBe(1);

      pipeline.unregisterBySource(source.instanceId);
      expect(pipeline.count).toBe(0);
    });

    test("prevents bench damage", () => {
      const pipeline = new ModifierPipeline();
      const source = makeGameCard({ name: "Protector" });

      pipeline.register(
        source.instanceId,
        "Protector",
        { type: { modify: "prevent_bench_damage" } },
        0,
      );

      expect(pipeline.isBenchDamagePrevented({
        target: source,
        targetPlayerIndex: 0,
      })).toBe(true);
    });
  });

  // ─── 14. EventHookRegistry ───

  describe("EventHookRegistry", () => {
    test("registers and emits event hooks", async () => {
      const registry = new EventHookRegistry();
      let fired = false;

      registry.register(
        "on_knocked_out",
        "card-1",
        "Test Card",
        0,
        [{ action: "log", message: "Knocked out!" }],
      );

      expect(registry.hasHooks("on_knocked_out")).toBe(true);
      expect(registry.count).toBe(1);

      const ctx = createMockContext();
      const firedCount = await registry.emit(
        { event: "on_knocked_out", triggerPlayerIndex: 0 },
        () => ctx,
      );

      expect(firedCount).toBe(1);
      expect(ctx.log).toHaveBeenCalledWith("Knocked out!");
    });

    test("once hooks auto-remove after firing", async () => {
      const registry = new EventHookRegistry();

      registry.register(
        "on_turn_start",
        "card-1",
        "Once Card",
        0,
        [{ action: "log", message: "Turn start!" }],
        { once: true },
      );

      const ctx = createMockContext();
      await registry.emit(
        { event: "on_turn_start", triggerPlayerIndex: 0 },
        () => ctx,
      );

      expect(registry.count).toBe(0);
      expect(registry.hasHooks("on_turn_start")).toBe(false);
    });

    test("unregisters hooks by source card", () => {
      const registry = new EventHookRegistry();

      registry.register("on_turn_start", "card-1", "Card 1", 0, []);
      registry.register("on_turn_end", "card-1", "Card 1", 0, []);
      registry.register("on_turn_start", "card-2", "Card 2", 0, []);

      expect(registry.count).toBe(3);
      registry.unregisterBySource("card-1");
      expect(registry.count).toBe(1);
    });
  });

  // ─── 15. End-to-end: JSON → Validate → Compile → Execute ───

  describe("End-to-end Pipeline", () => {
    test("complete pipeline for Oddish Absorb", () => {
      const oddishRule = cardRules.find((r: any) => r.cardName === "Oddish");

      // Step 1: Zod validation
      const zodResult = validateCardRuleDef(oddishRule);
      expect(zodResult.valid).toBe(true);

      // Step 2: Semantic validation
      const semResult = validateRule(oddishRule);
      expect(semResult.valid).toBe(true);

      // Step 3: Compile
      const def = compileRule(semResult.data!);
      expect(def).not.toBeNull();
      expect(def!.attacks!.length).toBe(1);

      // Step 4: Execute
      const ctx = createMockContext();
      ctx.source.damageCounters = 5;
      const result = def!.attacks![0].onAttack(ctx, 10);

      expect(result.damage).toBe(10);
      expect(ctx.heal).toHaveBeenCalledWith(10, ctx.source);
    });

    test("complete pipeline for Professor's Research", async () => {
      const profRule = cardRules.find((r: any) => r.cardName.includes("Professor"));

      const zodResult = validateCardRuleDef(profRule);
      expect(zodResult.valid).toBe(true);

      const semResult = validateRule(profRule);
      expect(semResult.valid).toBe(true);

      const def = compileRule(semResult.data!);
      expect(def).not.toBeNull();
      expect(def!.trainer).toBeDefined();

      const ctx = createMockContext({
        player: {
          hand: makeZone([makeGameCard(), makeGameCard()]),
        } as any,
      });

      await def!.trainer!.onPlay(ctx);
      expect(ctx.discardHand).toHaveBeenCalled();
      expect(ctx.drawCards).toHaveBeenCalledWith(7, "player");
    });
  });
});
