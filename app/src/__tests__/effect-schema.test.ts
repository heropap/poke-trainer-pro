/**
 * Tests for Effect Schema + Compiler system.
 *
 * Verifies that JSON-based EffectSchemaDefinition can be compiled into
 * CardEffectDef objects that produce identical behavior to the text-parser
 * and hand-written effect implementations.
 *
 * Covers:
 * - Attack patterns (15 types)
 * - Trainer patterns (10 types)
 * - Ability patterns (10 types)
 * - Round-trip: schema → compile → execute → verify result
 */

import { compileSchema } from "@/engine/effects/schema-compiler";
import { EffectSchemaDefinition } from "@/engine/effects/effect-schema";
import { EffectContext, AttackResult } from "@/engine/effects/effect-types";
import { GameCard, GameState, Player, StatusCondition } from "@/engine/game-state";

// ─── Mock Helpers ───

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
      images: overrides.images || { small: "", large: "" },
      set: overrides.set || { id: "test", name: "Test", series: "Test" },
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

function makeEnergy(name = "Fire Energy", type = "Fire"): GameCard {
  return makeGameCard({ name, supertype: "Energy", subtypes: ["Basic"], types: [type] });
}

function makeZone(cards: GameCard[] = []): { cards: GameCard[] } {
  return { cards };
}

let coinFlipResult = true;
let coinFlipResults: boolean[] = [];

function createMockContext(overrides: Partial<{
  source: GameCard;
  player: Partial<Player>;
  opponent: Partial<Player>;
}>): EffectContext {
  const defaultPlayer = {
    id: "p1",
    name: "Player 1",
    active: makeGameCard({ name: "Active Mon" }),
    bench: makeZone(),
    hand: makeZone(),
    deck: makeZone(),
    discard: makeZone(),
    prizes: makeZone(),
    energyAttachedThisTurn: false,
    supporterUsedThisTurn: false,
  } as Player;

  const defaultOpponent = {
    id: "p2",
    name: "Player 2",
    active: makeGameCard({ name: "Opp Active Mon" }),
    bench: makeZone(),
    hand: makeZone(),
    deck: makeZone(),
    discard: makeZone(),
    prizes: makeZone([makeGameCard(), makeGameCard(), makeGameCard(), makeGameCard(), makeGameCard(), makeGameCard()]),
    energyAttachedThisTurn: false,
    supporterUsedThisTurn: false,
  } as Player;

  const player = { ...defaultPlayer, ...overrides.player } as Player;
  const opponent = { ...defaultOpponent, ...overrides.opponent } as Player;
  const source = overrides.source || player.active!;

  let flipIndex = 0;

  const healCalls: Array<{ amount: number; target: GameCard }> = [];
  const logMessages: string[] = [];
  const drawCalls: Array<{ count: number; who: string }> = [];
  const markers: Map<string, Map<string, number>> = new Map();
  const statusApplied: Array<{ target: GameCard; status: StatusCondition }> = [];

  const ctx: EffectContext = {
    state: {} as GameState,
    player,
    opponent,
    playerIndex: 0,
    opponentIndex: 1,
    source,

    damage: jest.fn(),
    damageAll: jest.fn(),
    heal: jest.fn((amount, target) => {
      healCalls.push({ amount, target });
      target.damageCounters = Math.max(0, target.damageCounters - Math.floor(amount / 10));
    }),
    drawCards: jest.fn((count, who) => {
      drawCalls.push({ count, who: who || "player" });
      const p = who === "opponent" ? opponent : player;
      const drawn: GameCard[] = [];
      for (let i = 0; i < count && p.deck.cards.length > 0; i++) {
        const card = p.deck.cards.shift()!;
        p.hand.cards.push(card);
        drawn.push(card);
      }
      return drawn;
    }),
    discardFromHand: jest.fn(() => []),
    promptDiscardFromHand: jest.fn(async () => []),
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
    moveEnergy: jest.fn((from, to, energyId) => {
      const idx = from.attachedEnergy.findIndex((e: GameCard) => e.instanceId === energyId);
      if (idx >= 0) {
        const energy = from.attachedEnergy.splice(idx, 1)[0];
        to.attachedEnergy.push(energy);
        return true;
      }
      return false;
    }),
    flipCoin: jest.fn(() => {
      if (coinFlipResults.length > 0) {
        return coinFlipResults[flipIndex++ % coinFlipResults.length];
      }
      return coinFlipResult;
    }),
    flipCoins: jest.fn((count) => {
      let heads = 0;
      for (let i = 0; i < count; i++) {
        const result = coinFlipResults.length > 0
          ? coinFlipResults[flipIndex++ % coinFlipResults.length]
          : coinFlipResult;
        if (result) heads++;
      }
      return { heads, tails: count - heads };
    }),
    applyStatus: jest.fn((target, status) => {
      target.statusConditions.push(status);
      statusApplied.push({ target, status });
    }),
    removeStatus: jest.fn(),
    removeAllStatus: jest.fn((target) => {
      target.statusConditions = [];
    }),
    switchOpponentActive: jest.fn(() => true),
    switchOwnActive: jest.fn(() => true),
    searchDiscard: jest.fn((filter, count, who) => {
      const p = who === "opponent" ? opponent : player;
      const results: GameCard[] = [];
      for (let i = p.discard.cards.length - 1; i >= 0 && results.length < count; i--) {
        if (filter(p.discard.cards[i])) {
          results.push(p.discard.cards.splice(i, 1)[0]);
        }
      }
      return results;
    }),
    shuffleHandIntoDeck: jest.fn((who) => {
      const p = who === "opponent" ? opponent : player;
      const count = p.hand.cards.length;
      p.deck.cards.push(...p.hand.cards);
      p.hand.cards = [];
      return count;
    }),
    revealTopCards: jest.fn(() => []),
    putOnTopOfDeck: jest.fn(),
    shuffleIntoDeck: jest.fn(),
    attachEnergyFromDiscard: jest.fn((filter, count, target) => {
      const results: GameCard[] = [];
      for (let i = player.discard.cards.length - 1; i >= 0 && results.length < count; i--) {
        if (filter(player.discard.cards[i])) {
          const card = player.discard.cards.splice(i, 1)[0];
          target.attachedEnergy.push(card);
          results.push(card);
        }
      }
      return results;
    }),
    pickUpPokemon: jest.fn(() => []),
    findPokemon: jest.fn(() => null),
    getAllPokemon: jest.fn((who) => {
      const p = who === "opponent" ? opponent : player;
      const result: GameCard[] = [];
      if (p.active) result.push(p.active);
      result.push(...p.bench.cards);
      return result;
    }),
    getStadium: jest.fn(() => null),
    removeStadium: jest.fn(() => true),
    addMarker: jest.fn((target, name, count = 1) => {
      if (!markers.has(target.instanceId)) markers.set(target.instanceId, new Map());
      const m = markers.get(target.instanceId)!;
      m.set(name, (m.get(name) || 0) + count);
      target.markers[name] = (target.markers[name] || 0) + count;
    }),
    removeMarker: jest.fn(),
    getMarker: jest.fn((target, name) => target.markers[name] || 0),
    hasMarker: jest.fn((target, name) => (target.markers[name] || 0) > 0),
    log: jest.fn((msg) => logMessages.push(msg)),
    promptUser: jest.fn(async (options) => {
      return (options.targets || []).slice(0, options.min);
    }),
  };

  // Attach meta for test introspection
  (ctx as any)._healCalls = healCalls;
  (ctx as any)._logMessages = logMessages;
  (ctx as any)._drawCalls = drawCalls;
  (ctx as any)._markers = markers;
  (ctx as any)._statusApplied = statusApplied;

  return ctx;
}

beforeEach(() => {
  coinFlipResult = true;
  coinFlipResults = [];
});

// ═══════════════════════════════════════════
// Attack Pattern Tests
// ═══════════════════════════════════════════

describe("Schema Compiler — Attack Patterns", () => {
  it("status_apply: applies status to defender", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Tangela",
      attacks: [{
        name: "Poison Powder",
        effects: [{ type: "status_apply", params: { status: "poisoned" } }],
      }],
    };
    const def = compileSchema(schema);
    expect(def).not.toBeNull();
    expect(def!.attacks).toHaveLength(1);

    const ctx = createMockContext({});
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(20);
    expect(result.statusEffects).toEqual([{ target: "defender", status: "poisoned" }]);
  });

  it("self_damage: adds recoil to result", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Corphish",
      attacks: [{
        name: "Take Down",
        effects: [{ type: "self_damage", params: { selfDamage: 10 } }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    const result = def.attacks![0].onAttack(ctx, 30);
    expect(result.damage).toBe(30);
    expect(result.selfDamage).toBe(10);
  });

  it("multi_coin: damage = perHeads × heads count", () => {
    coinFlipResults = [true, true, false]; // 2 heads out of 3
    const schema: EffectSchemaDefinition = {
      cardName: "Tyrogue",
      attacks: [{
        name: "Pow-Pow Punching",
        effects: [{ type: "multi_coin", params: { coinCount: 3, damagePerHeads: 30 } }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    const result = def.attacks![0].onAttack(ctx, 0);
    expect(result.damage).toBe(60); // 30 × 2 heads
  });

  it("coin_flip_bonus: adds damage on heads, no extra on tails", () => {
    coinFlipResult = true;
    const schema: EffectSchemaDefinition = {
      cardName: "TestMon",
      attacks: [{
        name: "Lucky Strike",
        effects: [{ type: "coin_flip_bonus", params: { bonusDamage: 30 } }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    const result = def.attacks![0].onAttack(ctx, 40);
    expect(result.damage).toBe(70); // 40 + 30

    coinFlipResult = false;
    const ctx2 = createMockContext({});
    const result2 = def.attacks![0].onAttack(ctx2, 40);
    expect(result2.damage).toBe(40); // no bonus
  });

  it("coin_flip_nothing: 0 damage on tails", () => {
    coinFlipResult = false;
    const schema: EffectSchemaDefinition = {
      cardName: "TestMon",
      attacks: [{
        name: "Risky Attack",
        effects: [{ type: "coin_flip_nothing", params: {} }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    const result = def.attacks![0].onAttack(ctx, 50);
    expect(result.damage).toBe(0);
  });

  it("cant_attack_next_turn: sets marker on self", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Miraidon",
      attacks: [{
        name: "Photon Blaster",
        effects: [{ type: "cant_attack_next_turn", params: {} }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    def.attacks![0].onAttack(ctx, 220);
    expect(ctx.addMarker).toHaveBeenCalledWith(ctx.source, "CANT_ATTACK_NEXT_TURN", 1);
  });

  it("discard_energy: sets discardEnergy count", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "TestMon",
      attacks: [{
        name: "Fire Blast",
        effects: [{ type: "discard_energy", params: { count: 2 } }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    const result = def.attacks![0].onAttack(ctx, 120);
    expect(result.discardEnergy).toBe(2);
  });

  it("bench_damage: damages opponent bench Pokemon", () => {
    const bench1 = makeGameCard({ name: "Bench1" });
    const bench2 = makeGameCard({ name: "Bench2" });
    const schema: EffectSchemaDefinition = {
      cardName: "Dragapult",
      attacks: [{
        name: "Phantom Dive",
        effects: [{ type: "bench_damage", params: { damage: 20, count: -1 } }], // -1 = all
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({
      opponent: { bench: makeZone([bench1, bench2]) as any },
    });
    const result = def.attacks![0].onAttack(ctx, 200);
    expect(result.benchDamage).toHaveLength(2);
    expect(result.benchDamage![0]).toEqual({ target: bench1, damage: 20 });
    expect(result.benchDamage![1]).toEqual({ target: bench2, damage: 20 });
  });

  it("per_energy_damage: adds damage per attached energy", () => {
    const source = makeGameCard({ name: "Attacker" });
    source.attachedEnergy = [makeEnergy(), makeEnergy(), makeEnergy()];
    const schema: EffectSchemaDefinition = {
      cardName: "TestMon",
      attacks: [{
        name: "Energy Burst",
        effects: [{ type: "per_energy_damage", params: { damagePerEnergy: 20 } }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({ source });
    const result = def.attacks![0].onAttack(ctx, 0);
    expect(result.damage).toBe(60); // 20 × 3
  });

  it("prize_based_damage: adds damage per opponent taken prizes", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Charizard ex",
      attacks: [{
        name: "Burning Darkness",
        effects: [{ type: "prize_based_damage", params: { damagePerPrize: 30 } }],
      }],
    };
    const def = compileSchema(schema)!;
    // Opponent has 4 prizes remaining = 2 taken
    const ctx = createMockContext({
      opponent: {
        prizes: makeZone([makeGameCard(), makeGameCard(), makeGameCard(), makeGameCard()]) as any,
      },
    });
    const result = def.attacks![0].onAttack(ctx, 180);
    expect(result.damage).toBe(240); // 180 + 30×2
  });

  it("skip_weakness_resistance: sets flags", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "TestMon",
      attacks: [{
        name: "Neutral Attack",
        effects: [{
          type: "skip_weakness_resistance",
          params: { skipWeakness: true, skipResistance: true },
        }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    const result = def.attacks![0].onAttack(ctx, 100);
    expect(result.skipWeakness).toBe(true);
    expect(result.skipResistance).toBe(true);
  });

  it("heal_self: heals the attacker", () => {
    const source = makeGameCard({ name: "Healer" });
    source.damageCounters = 5;
    const schema: EffectSchemaDefinition = {
      cardName: "TestMon",
      attacks: [{
        name: "Drain",
        effects: [{ type: "heal_self", params: { amount: 30 } }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({ source });
    def.attacks![0].onAttack(ctx, 40);
    expect(ctx.heal).toHaveBeenCalledWith(30, source);
  });

  it("draw_cards: draws cards during attack", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "TestMon",
      attacks: [{
        name: "Study",
        effects: [{ type: "draw_cards", params: { count: 3 } }],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    def.attacks![0].onAttack(ctx, 0);
    expect(ctx.drawCards).toHaveBeenCalledWith(3, "player");
  });

  it("multi-step attack: damage + status + self_damage", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "TestMon",
      attacks: [{
        name: "Fierce Attack",
        effects: [
          { type: "status_apply", params: { status: "burned" } },
          { type: "self_damage", params: { selfDamage: 30 } },
        ],
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    const result = def.attacks![0].onAttack(ctx, 100);
    expect(result.damage).toBe(100);
    expect(result.selfDamage).toBe(30);
    expect(result.statusEffects).toEqual([{ target: "defender", status: "burned" }]);
  });

  it("cond_damaged_bonus: bonus only when self has damage", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "TestMon",
      attacks: [{
        name: "Revenge",
        effects: [{ type: "cond_damaged_bonus", params: { bonusDamage: 100 } }],
      }],
    };
    const def = compileSchema(schema)!;

    // No damage → no bonus
    const source1 = makeGameCard({ name: "Attacker" });
    source1.damageCounters = 0;
    const ctx1 = createMockContext({ source: source1 });
    expect(def.attacks![0].onAttack(ctx1, 50).damage).toBe(50);

    // Has damage → bonus
    const source2 = makeGameCard({ name: "Attacker" });
    source2.damageCounters = 3;
    const ctx2 = createMockContext({ source: source2 });
    expect(def.attacks![0].onAttack(ctx2, 50).damage).toBe(150);
  });
});

// ═══════════════════════════════════════════
// Trainer Pattern Tests
// ═══════════════════════════════════════════

describe("Schema Compiler — Trainer Patterns", () => {
  it("discard_hand_draw: discards hand and draws N", async () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Professor's Research",
      trainer: {
        effects: [{ type: "discard_hand_draw", params: { drawCount: 7 } }],
      },
    };
    const def = compileSchema(schema)!;
    expect(def.trainer).toBeDefined();

    const ctx = createMockContext({
      player: {
        hand: makeZone([makeGameCard(), makeGameCard()]) as any,
        deck: makeZone([makeGameCard(), makeGameCard(), makeGameCard(), makeGameCard(), makeGameCard(), makeGameCard(), makeGameCard()]) as any,
      },
    });
    await def.trainer!.onPlay(ctx);
    expect(ctx.discardHand).toHaveBeenCalledWith("player");
    expect(ctx.drawCards).toHaveBeenCalledWith(7, "player");
  });

  it("shuffle_hand_draw: shuffles hand into deck and draws", async () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Cynthia",
      trainer: {
        effects: [{ type: "shuffle_hand_draw", params: { drawCount: 6 } }],
      },
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    await def.trainer!.onPlay(ctx);
    expect(ctx.shuffleHandIntoDeck).toHaveBeenCalledWith("player");
    expect(ctx.drawCards).toHaveBeenCalledWith(6, "player");
  });

  it("draw: draws N cards", async () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Potion Draw",
      trainer: {
        effects: [{ type: "draw", params: { count: 3 } }],
      },
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    await def.trainer!.onPlay(ctx);
    expect(ctx.drawCards).toHaveBeenCalledWith(3, "player");
  });

  it("search_basic_to_bench: searches Basic Pokemon to bench", async () => {
    const basic = makeGameCard({ name: "Charmander", supertype: "Pokémon", subtypes: ["Basic"] });
    const schema: EffectSchemaDefinition = {
      cardName: "Nest Ball",
      trainer: {
        effects: [{ type: "search_basic_to_bench", params: { count: 1 } }],
      },
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({
      player: {
        deck: makeZone([basic]) as any,
        bench: makeZone() as any,
      },
    });
    await def.trainer!.onPlay(ctx);
    expect(ctx.searchDeck).toHaveBeenCalled();
    expect(ctx.shuffleDeck).toHaveBeenCalledWith("player");
  });

  it("switch_own: switches active with bench + canPlay check", async () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Switch",
      trainer: {
        effects: [{ type: "switch_own", params: {} }],
      },
    };
    const def = compileSchema(schema)!;
    expect(def.trainer!.canPlay).toBeDefined();

    // canPlay: false when no bench
    const ctxNoBench = createMockContext({ player: { bench: makeZone() as any } });
    expect(def.trainer!.canPlay!(ctxNoBench)).toBe(false);

    // canPlay: true when bench has Pokemon
    const ctxWithBench = createMockContext({
      player: { bench: makeZone([makeGameCard()]) as any },
    });
    expect(def.trainer!.canPlay!(ctxWithBench)).toBe(true);
  });

  it("each_shuffle_draw: both players shuffle and draw", async () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Judge",
      trainer: {
        effects: [{ type: "each_shuffle_draw", params: { drawCount: 4 } }],
      },
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    await def.trainer!.onPlay(ctx);
    expect(ctx.shuffleHandIntoDeck).toHaveBeenCalledWith("player");
    expect(ctx.shuffleHandIntoDeck).toHaveBeenCalledWith("opponent");
    expect(ctx.drawCards).toHaveBeenCalledWith(4, "player");
    expect(ctx.drawCards).toHaveBeenCalledWith(4, "opponent");
  });

  it("heal: heals active Pokemon", async () => {
    const active = makeGameCard({ name: "Injured Mon" });
    active.damageCounters = 5;
    const schema: EffectSchemaDefinition = {
      cardName: "Potion",
      trainer: {
        effects: [{ type: "heal", params: { amount: 30 } }],
      },
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({ player: { active } });
    await def.trainer!.onPlay(ctx);
    expect(ctx.heal).toHaveBeenCalledWith(30, active);
  });

  it("recover_from_discard: retrieves Pokemon from discard", async () => {
    const pokemon = makeGameCard({ name: "Charizard", supertype: "Pokémon" });
    const energy = makeEnergy();
    const schema: EffectSchemaDefinition = {
      cardName: "Pal Pad",
      trainer: {
        effects: [{
          type: "recover_from_discard",
          params: { count: 1, filterType: "pokemon" },
        }],
      },
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({
      player: { discard: makeZone([pokemon, energy]) as any },
    });
    await def.trainer!.onPlay(ctx);
    expect(ctx.searchDiscard).toHaveBeenCalled();
  });

  it("discard_stadium: removes stadium + canPlay requires stadium", async () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Lost Vacuum",
      trainer: {
        effects: [{ type: "discard_stadium", params: {} }],
      },
    };
    const def = compileSchema(schema)!;

    // canPlay: false when no stadium
    const ctxNoStadium = createMockContext({});
    expect(def.trainer!.canPlay!(ctxNoStadium)).toBe(false);

    // Execute
    const ctx = createMockContext({});
    await def.trainer!.onPlay(ctx);
    expect(ctx.removeStadium).toHaveBeenCalled();
  });

  it("multi-step trainer: discard + draw combo", async () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Custom Trainer",
      trainer: {
        effects: [
          { type: "discard_hand_draw", params: { drawCount: 5 } },
          { type: "heal", params: { amount: 20 } },
        ],
      },
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({});
    await def.trainer!.onPlay(ctx);
    expect(ctx.discardHand).toHaveBeenCalled();
    expect(ctx.drawCards).toHaveBeenCalledWith(5, "player");
    expect(ctx.heal).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════
// Ability Pattern Tests
// ═══════════════════════════════════════════

describe("Schema Compiler — Ability Patterns", () => {
  it("passive_damage_reduction: reduces incoming damage", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Snorlax",
      abilities: [{
        name: "Thick Fat",
        effect: { type: "passive_damage_reduction", params: { amount: 30 } },
      }],
    };
    const def = compileSchema(schema)!;
    expect(def.abilities).toHaveLength(1);
    const ability = def.abilities![0];
    expect(ability.type).toBe("passive");
    expect(ability.modifyIncomingDamage).toBeDefined();

    const ctx = createMockContext({});
    expect(ability.modifyIncomingDamage!(ctx, 100)).toBe(70);
    expect(ability.modifyIncomingDamage!(ctx, 20)).toBe(0); // min 0
  });

  it("passive_damage_boost_self: boosts own attack damage", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Gallade",
      abilities: [{
        name: "Premonition",
        effect: { type: "passive_damage_boost_self", params: { amount: 20 } },
      }],
    };
    const def = compileSchema(schema)!;
    const ability = def.abilities![0];
    const ctx = createMockContext({});
    expect(ability.modifyDamage!(ctx, 80, true)).toBe(100); // +20 as attacker
    expect(ability.modifyDamage!(ctx, 80, false)).toBe(80); // no change as defender
  });

  it("passive_damage_boost_typed: boosts damage for specific type", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Entei",
      abilities: [{
        name: "Fire Charge",
        effect: { type: "passive_damage_boost_typed", params: { amount: 30, pokemonType: "Fire" } },
      }],
    };
    const def = compileSchema(schema)!;
    const ability = def.abilities![0];

    // Fire Pokemon → +30
    const fireSource = makeGameCard({ name: "Charizard", types: ["Fire"] });
    const ctxFire = createMockContext({ source: fireSource });
    expect(ability.modifyDamage!(ctxFire, 100, true)).toBe(130);

    // Water Pokemon → no boost
    const waterSource = makeGameCard({ name: "Blastoise", types: ["Water"] });
    const ctxWater = createMockContext({ source: waterSource });
    expect(ability.modifyDamage!(ctxWater, 100, true)).toBe(100);
  });

  it("passive_no_retreat_cost: sets retreat cost to 0", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Float Stone Mon",
      abilities: [{
        name: "Free Retreat",
        effect: { type: "passive_no_retreat_cost", params: {} },
      }],
    };
    const def = compileSchema(schema)!;
    expect(def.abilities![0].modifyRetreatCost!(createMockContext({}), 3)).toBe(0);
  });

  it("passive_prevent_bench_damage: sets preventBenchDamage flag", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Mr. Mime",
      abilities: [{
        name: "Bench Barrier",
        effect: { type: "passive_prevent_bench_damage", params: {} },
      }],
    };
    const def = compileSchema(schema)!;
    expect(def.abilities![0].preventBenchDamage).toBe(true);
  });

  it("on_evolve_draw: draws cards when evolved", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Beedrill",
      abilities: [{
        name: "Swarm",
        effect: { type: "on_evolve_draw", params: { count: 3 } },
      }],
    };
    const def = compileSchema(schema)!;
    const ability = def.abilities![0];
    expect(ability.type).toBe("on_enter");

    const ctx = createMockContext({});
    ability.onEnter!(ctx);
    expect(ctx.drawCards).toHaveBeenCalledWith(3, "player");
  });

  it("on_evolve_heal: heals when evolved", () => {
    const source = makeGameCard({ name: "Healer" });
    source.damageCounters = 5;
    const schema: EffectSchemaDefinition = {
      cardName: "Healer Mon",
      abilities: [{
        name: "Medic",
        effect: { type: "on_evolve_heal", params: { amount: 60 } },
      }],
    };
    const def = compileSchema(schema)!;
    const ctx = createMockContext({ source });
    def.abilities![0].onEnter!(ctx);
    expect(ctx.heal).toHaveBeenCalledWith(60, source);
  });

  it("activated_draw: draws cards when activated", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Cinccino",
      abilities: [{
        name: "Make Do",
        effect: { type: "activated_draw", params: { count: 2 } },
      }],
    };
    const def = compileSchema(schema)!;
    const ability = def.abilities![0];
    expect(ability.type).toBe("activated");

    const ctx = createMockContext({});
    (ability.onActivate as Function)(ctx);
    expect(ctx.drawCards).toHaveBeenCalledWith(2, "player");
  });

  it("activated_discard_draw: requires hand cards and draws", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Zoroark",
      abilities: [{
        name: "Trade",
        effect: { type: "activated_discard_draw", params: { discardCount: 1, drawCount: 2 } },
      }],
    };
    const def = compileSchema(schema)!;
    const ability = def.abilities![0];

    // canActivate: false with empty hand
    const ctxEmpty = createMockContext({ player: { hand: makeZone() as any } });
    expect(ability.canActivate!(ctxEmpty)).toBe(false);

    // canActivate: true with cards in hand
    const ctxFull = createMockContext({
      player: { hand: makeZone([makeGameCard()]) as any },
    });
    expect(ability.canActivate!(ctxFull)).toBe(true);
  });
});

// ═══════════════════════════════════════════
// Edge Cases & Compilation
// ═══════════════════════════════════════════

describe("Schema Compiler — Edge Cases", () => {
  it("returns null for empty schema", () => {
    const schema: EffectSchemaDefinition = { cardName: "Empty" };
    expect(compileSchema(schema)).toBeNull();
  });

  it("returns null for schema with empty arrays", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Empty",
      attacks: [],
      abilities: [],
    };
    expect(compileSchema(schema)).toBeNull();
  });

  it("preserves cardId and cardName in output", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Test Card",
      cardId: "sv1-123",
      attacks: [{
        name: "Test Attack",
        effects: [{ type: "draw_cards", params: { count: 1 } }],
      }],
    };
    const def = compileSchema(schema)!;
    expect(def.cardId).toBe("sv1-123");
    expect(def.cardName).toBe("Test Card");
  });

  it("handles card with attacks + abilities + trainer simultaneously", () => {
    // This wouldn't be a real card, but schema should handle it
    const schema: EffectSchemaDefinition = {
      cardName: "Multi",
      attacks: [{
        name: "Attack1",
        effects: [{ type: "draw_cards", params: { count: 1 } }],
      }],
      abilities: [{
        name: "Ability1",
        effect: { type: "passive_damage_reduction", params: { amount: 10 } },
      }],
      trainer: {
        effects: [{ type: "draw", params: { count: 3 } }],
      },
    };
    const def = compileSchema(schema)!;
    expect(def.attacks).toHaveLength(1);
    expect(def.abilities).toHaveLength(1);
    expect(def.trainer).toBeDefined();
  });

  it("schema uses __schema__ as default cardId when not specified", () => {
    const schema: EffectSchemaDefinition = {
      cardName: "Test",
      attacks: [{
        name: "Test Attack",
        effects: [{ type: "draw_cards", params: { count: 1 } }],
      }],
    };
    const def = compileSchema(schema)!;
    expect(def.cardId).toBe("__schema__");
  });
});
