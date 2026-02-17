/**
 * Tests for Layer 3 (P2): Text-Based Effect Parser
 *
 * Tests that card rules text is parsed into working CardEffectDefs,
 * covering common attack and trainer patterns.
 */

import { parseCardEffects, autoRegisterTextEffects } from "@/engine/effects/text-parser";
import { Card, CardAttack } from "@/types/card";
import { clearRegistry, hasEffect, getEffect, getNameRegisteredCount } from "@/engine/effects/effect-registry";
import { AttackResult, EffectContext } from "@/engine/effects/effect-types";
import { GameCard, Player, createGameCard } from "@/engine/game-state";

// ─── Helper factories ───

function makePokemonCard(overrides: Partial<Card> & { attacks?: CardAttack[] } = {}): Card {
  return {
    id: "test-pokemon-1",
    name: "Test Pokemon",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "70",
    types: ["Fire"],
    attacks: overrides.attacks || [],
    retreatCost: ["Colorless"],
    number: "1",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
    ...overrides,
  };
}

function makeTrainerCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "test-trainer-1",
    name: "Test Trainer",
    supertype: "Trainer",
    subtypes: ["Item"],
    number: "100",
    legalities: { standard: "Legal" },
    images: { small: "", large: "" },
    rules: [],
    ...overrides,
  };
}

function makeAttack(overrides: Partial<CardAttack> = {}): CardAttack {
  return {
    name: "Test Attack",
    cost: ["Fire"],
    damage: "30",
    text: "",
    convertedEnergyCost: 1,
    ...overrides,
  };
}

/**
 * Create a minimal mock EffectContext for testing parsed attack effects.
 * Only implements the methods our text parser actually uses.
 */
function makeMockCtx(overrides: Partial<EffectContext> = {}): EffectContext {
  const mockPlayer: Partial<Player> = {
    bench: { cards: [] },
    hand: { cards: [] },
    deck: { cards: [] },
    prizes: { cards: [] },
    name: "Test Player",
  };

  const mockOpponent: Partial<Player> = {
    bench: { cards: [] },
    hand: { cards: [] },
    deck: { cards: [] },
    prizes: { cards: [] },
    name: "Opponent",
  };

  return {
    state: {} as any,
    player: mockPlayer as Player,
    opponent: mockOpponent as Player,
    playerIndex: 0,
    opponentIndex: 1,
    source: { attachedEnergy: [] } as any,
    flipCoin: jest.fn(() => true),
    flipCoins: jest.fn(() => ({ heads: 1, tails: 0 })),
    damage: jest.fn(),
    damageAll: jest.fn(),
    heal: jest.fn(),
    drawCards: jest.fn(() => []),
    discardFromHand: jest.fn(() => []),
    discardHand: jest.fn(() => []),
    searchDeck: jest.fn(() => []),
    addToHand: jest.fn(),
    shuffleDeck: jest.fn(),
    attachEnergyFromDeck: jest.fn(() => false),
    moveEnergy: jest.fn(() => false),
    applyStatus: jest.fn(),
    removeStatus: jest.fn(),
    removeAllStatus: jest.fn(),
    switchOpponentActive: jest.fn(() => true),
    switchOwnActive: jest.fn(() => true),
    searchDiscard: jest.fn(() => []),
    shuffleHandIntoDeck: jest.fn(() => 0),
    revealTopCards: jest.fn(() => []),
    putOnTopOfDeck: jest.fn(),
    shuffleIntoDeck: jest.fn(),
    attachEnergyFromDiscard: jest.fn(() => []),
    pickUpPokemon: jest.fn(() => []),
    findPokemon: jest.fn(() => null),
    getAllPokemon: jest.fn(() => []),
    getStadium: jest.fn(() => null),
    removeStadium: jest.fn(() => false),
    promptUser: jest.fn(() => Promise.resolve([])),
    log: jest.fn(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// Attack Text Parsing — Status Application
// ═══════════════════════════════════════════

describe("text-parser: attack — status application", () => {
  test("parses 'The Defending Pokémon is now Poisoned'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Poison Sting",
        damage: "20",
        text: "The Defending Pokémon is now Poisoned.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();
    expect(def!.attacks).toHaveLength(1);
    expect(def!.attacks![0].name).toBe("Poison Sting");

    const ctx = makeMockCtx();
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(20);
    expect(result.statusEffects).toHaveLength(1);
    expect(result.statusEffects![0].target).toBe("defender");
    expect(result.statusEffects![0].status).toBe("poisoned");
  });

  test("parses 'Active Pokemon is now Paralyzed'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Thunder Shock",
        damage: "10",
        text: "The Active Pokémon is now Paralyzed.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const result = def!.attacks![0].onAttack(makeMockCtx(), 10);
    expect(result.statusEffects![0].status).toBe("paralyzed");
  });

  test("parses Burned status", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Flamethrower",
        damage: "60",
        text: "The Defending Pokémon is now Burned.",
      })],
    });

    const def = parseCardEffects(card);
    const result = def!.attacks![0].onAttack(makeMockCtx(), 60);
    expect(result.statusEffects![0].status).toBe("burned");
  });
});

// ═══════════════════════════════════════════
// Attack Text Parsing — Self-Damage
// ═══════════════════════════════════════════

describe("text-parser: attack — self-damage", () => {
  test("parses 'This Pokémon also does 30 damage to itself'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Take Down",
        damage: "60",
        text: "This Pokémon also does 30 damage to itself.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const result = def!.attacks![0].onAttack(makeMockCtx(), 60);
    expect(result.damage).toBe(60);
    expect(result.selfDamage).toBe(30);
  });

  test("parses 'This Pokemon does 10 damage to itself'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Struggle",
        damage: "30",
        text: "This Pokemon does 10 damage to itself.",
      })],
    });

    const def = parseCardEffects(card);
    const result = def!.attacks![0].onAttack(makeMockCtx(), 30);
    expect(result.selfDamage).toBe(10);
  });
});

// ═══════════════════════════════════════════
// Attack Text Parsing — Coin Flip
// ═══════════════════════════════════════════

describe("text-parser: attack — coin flip", () => {
  test("parses 'Flip a coin. If heads, this attack does 30 more damage' (heads)", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Slash",
        damage: "20",
        text: "Flip a coin. If heads, this attack does 30 more damage.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const ctx = makeMockCtx({ flipCoin: jest.fn(() => true) });
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(50); // 20 + 30
  });

  test("coin flip extra damage — tails gives base damage only", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Slash",
        damage: "20",
        text: "Flip a coin. If heads, this attack does 30 more damage.",
      })],
    });

    const def = parseCardEffects(card);
    const ctx = makeMockCtx({ flipCoin: jest.fn(() => false) });
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(20); // no bonus
  });

  test("parses 'Flip a coin. If tails, this attack does nothing'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Psybeam",
        damage: "50",
        text: "Flip a coin. If tails, this attack does nothing.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    // Heads = normal damage
    const ctxHeads = makeMockCtx({ flipCoin: jest.fn(() => true) });
    const resultH = def!.attacks![0].onAttack(ctxHeads, 50);
    expect(resultH.damage).toBe(50);

    // Tails = 0 damage
    const ctxTails = makeMockCtx({ flipCoin: jest.fn(() => false) });
    const resultT = def!.attacks![0].onAttack(ctxTails, 50);
    expect(resultT.damage).toBe(0);
  });
});

// ═══════════════════════════════════════════
// Attack Text Parsing — Discard Energy
// ═══════════════════════════════════════════

describe("text-parser: attack — discard energy", () => {
  test("parses 'Discard 2 Fire Energy from this Pokémon'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Heat Blast",
        damage: "120",
        text: "Discard 2 Fire Energy from this Pokémon.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const result = def!.attacks![0].onAttack(makeMockCtx(), 120);
    expect(result.damage).toBe(120);
    expect(result.discardEnergy).toBe(2);
  });

  test("parses 'Discard an Energy from this Pokémon'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Power Blast",
        damage: "80",
        text: "Discard an Energy from this Pokémon.",
      })],
    });

    const def = parseCardEffects(card);
    const result = def!.attacks![0].onAttack(makeMockCtx(), 80);
    expect(result.discardEnergy).toBe(1);
  });
});

// ═══════════════════════════════════════════
// Attack Text Parsing — Bench Damage
// ═══════════════════════════════════════════

describe("text-parser: attack — bench damage", () => {
  test("parses 'This attack does 20 damage to 1 of your opponent's Benched Pokémon'", () => {
    const benchCard = { card: { name: "Bench Mon" } } as GameCard;
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Stony Kick",
        damage: "40",
        text: "This attack does 20 damage to 1 of your opponent's Benched Pokémon.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const ctx = makeMockCtx({
      opponent: { bench: { cards: [benchCard] } } as any,
    });
    const result = def!.attacks![0].onAttack(ctx, 40);
    expect(result.damage).toBe(40);
    expect(result.benchDamage).toHaveLength(1);
    expect(result.benchDamage![0].damage).toBe(20);
  });

  test("parses 'does 10 damage to each of your opponent's Benched Pokémon'", () => {
    const bench1 = { card: { name: "Bench 1" } } as GameCard;
    const bench2 = { card: { name: "Bench 2" } } as GameCard;
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Earthquake",
        damage: "70",
        text: "This attack also does 10 damage to each of your opponent's Benched Pokémon.",
      })],
    });

    const def = parseCardEffects(card);
    const ctx = makeMockCtx({
      opponent: { bench: { cards: [bench1, bench2] } } as any,
    });
    const result = def!.attacks![0].onAttack(ctx, 70);
    expect(result.damage).toBe(70);
    expect(result.benchDamage).toHaveLength(2);
    expect(result.benchDamage![0].damage).toBe(10);
    expect(result.benchDamage![1].damage).toBe(10);
  });
});

// ═══════════════════════════════════════════
// Attack Text Parsing — Per-Energy Damage
// ═══════════════════════════════════════════

describe("text-parser: attack — per-energy damage", () => {
  test("parses 'This attack does 20 damage for each Energy attached'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Mega Punch",
        damage: "0",
        text: "This attack does 20 damage for each Energy attached to this Pokémon.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const ctx = makeMockCtx({
      source: { attachedEnergy: [{}, {}, {}] } as any, // 3 energy
    });
    const result = def!.attacks![0].onAttack(ctx, 0);
    expect(result.damage).toBe(60); // 20 * 3
  });
});

// ═══════════════════════════════════════════
// Attack Text Parsing — Heal Self
// ═══════════════════════════════════════════

describe("text-parser: attack — heal self", () => {
  test("parses 'Heal 30 damage from this Pokémon'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Drain Punch",
        damage: "40",
        text: "Heal 30 damage from this Pokémon.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockHeal = jest.fn();
    const ctx = makeMockCtx({ heal: mockHeal });
    const result = def!.attacks![0].onAttack(ctx, 40);
    expect(result.damage).toBe(40);
    expect(mockHeal).toHaveBeenCalledWith(30, ctx.source);
  });
});

// ═══════════════════════════════════════════
// Trainer Text Parsing — Draw Cards
// ═══════════════════════════════════════════

describe("text-parser: trainer — draw cards", () => {
  test("parses 'Draw 3 cards'", () => {
    const card = makeTrainerCard({
      name: "Hau",
      rules: ["Draw 3 cards."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();
    expect(def!.trainer).toBeDefined();

    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({ drawCards: mockDraw });
    def!.trainer!.onPlay(ctx);
    expect(mockDraw).toHaveBeenCalledWith(3, "player");
  });

  test("parses 'Draw 2 cards'", () => {
    const card = makeTrainerCard({
      name: "Tierno",
      rules: ["Draw 2 cards."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({ drawCards: mockDraw });
    def!.trainer!.onPlay(ctx);
    expect(mockDraw).toHaveBeenCalledWith(2, "player");
  });
});

// ═══════════════════════════════════════════
// Trainer Text Parsing — Discard Hand and Draw
// ═══════════════════════════════════════════

describe("text-parser: trainer — discard hand and draw", () => {
  test("parses 'Discard your hand and draw 7 cards'", () => {
    const card = makeTrainerCard({
      name: "Professor's Research",
      subtypes: ["Supporter"],
      rules: ["Discard your hand and draw 7 cards."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockDiscard = jest.fn(() => []);
    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({ discardHand: mockDiscard, drawCards: mockDraw });
    def!.trainer!.onPlay(ctx);
    expect(mockDiscard).toHaveBeenCalledWith("player");
    expect(mockDraw).toHaveBeenCalledWith(7, "player");
  });
});

// ═══════════════════════════════════════════
// Trainer Text Parsing — Search Deck
// ═══════════════════════════════════════════

describe("text-parser: trainer — search deck", () => {
  test("parses 'Search your deck for a Basic Pokémon and put it onto your Bench'", () => {
    const card = makeTrainerCard({
      name: "Nest Ball",
      rules: ["Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck."],
    });

    const mockBasic = {
      card: { supertype: "Pokémon", subtypes: ["Basic"], name: "Pikachu" },
      playedThisTurn: false,
    } as any;

    const mockSearch = jest.fn(() => [mockBasic]);
    const mockShuffle = jest.fn();
    const ctx = makeMockCtx({
      searchDeck: mockSearch,
      shuffleDeck: mockShuffle,
      player: { bench: { cards: [] }, hand: { cards: [] } } as any,
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();
    expect(def!.trainer).toBeDefined();

    def!.trainer!.onPlay(ctx);
    expect(mockSearch).toHaveBeenCalled();
    expect(mockShuffle).toHaveBeenCalledWith("player");
    // The found pokemon should be pushed to bench
    expect(ctx.player.bench.cards).toHaveLength(1);
  });

  test("parses 'Search your deck for up to 2 Basic Pokémon'", () => {
    const card = makeTrainerCard({
      name: "Fan Club",
      rules: ["Search your deck for up to 2 Basic Pokémon and put them onto your Bench."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockSearch = jest.fn(() => []);
    const ctx = makeMockCtx({
      searchDeck: mockSearch,
      shuffleDeck: jest.fn(),
      player: { bench: { cards: [] }, hand: { cards: [] } } as any,
    });

    def!.trainer!.onPlay(ctx);
    // The search count should be 2
    expect(mockSearch).toHaveBeenCalledWith(expect.any(Function), 2, "player");
  });

  test("parses 'Search your deck for a card and put it into your hand'", () => {
    const card = makeTrainerCard({
      name: "Quick Search",
      rules: ["Search your deck for a card and put it into your hand. Then, shuffle your deck."],
    });

    const mockFound = { card: { name: "Anything" } } as any;
    const mockSearch = jest.fn(() => [mockFound]);
    const mockAddToHand = jest.fn();
    const mockShuffle = jest.fn();
    const ctx = makeMockCtx({
      searchDeck: mockSearch,
      addToHand: mockAddToHand,
      shuffleDeck: mockShuffle,
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    def!.trainer!.onPlay(ctx);
    expect(mockSearch).toHaveBeenCalledWith(expect.any(Function), 1, "player");
    expect(mockAddToHand).toHaveBeenCalledWith(mockFound, "player");
    expect(mockShuffle).toHaveBeenCalledWith("player");
  });
});

// ═══════════════════════════════════════════
// Trainer Text Parsing — Switch
// ═══════════════════════════════════════════

describe("text-parser: trainer — switch", () => {
  test("parses 'Switch your Active Pokémon with 1 of your Benched Pokémon'", () => {
    const card = makeTrainerCard({
      name: "Switch",
      rules: ["Switch your Active Pokémon with 1 of your Benched Pokémon."],
    });

    const benchMon = { instanceId: "bench-1" } as any;
    const mockSwitch = jest.fn(() => true);
    const ctx = makeMockCtx({
      switchOwnActive: mockSwitch,
      player: { bench: { cards: [benchMon] } } as any,
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();
    expect(def!.trainer!.canPlay).toBeDefined();

    // canPlay should require a bench Pokemon
    expect(def!.trainer!.canPlay!(ctx)).toBe(true);

    def!.trainer!.onPlay(ctx);
    expect(mockSwitch).toHaveBeenCalledWith("bench-1");
  });

  test("canPlay returns false with empty bench", () => {
    const card = makeTrainerCard({
      name: "Switch",
      rules: ["Switch your Active Pokémon with 1 of your Benched Pokémon."],
    });

    const ctx = makeMockCtx({
      player: { bench: { cards: [] } } as any,
    });

    const def = parseCardEffects(card);
    expect(def!.trainer!.canPlay!(ctx)).toBe(false);
  });
});

// ═══════════════════════════════════════════
// Trainer Text Parsing — Heal
// ═══════════════════════════════════════════

describe("text-parser: trainer — heal", () => {
  test("parses 'Heal 30 damage from 1 of your Pokémon'", () => {
    const card = makeTrainerCard({
      name: "Potion",
      rules: ["Heal 30 damage from 1 of your Pokémon."],
    });

    const activeMon = { card: { name: "Pikachu" } } as any;
    const mockHeal = jest.fn();
    const ctx = makeMockCtx({
      heal: mockHeal,
      player: { active: activeMon } as any,
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    def!.trainer!.onPlay(ctx);
    expect(mockHeal).toHaveBeenCalledWith(30, activeMon);
  });
});

// ═══════════════════════════════════════════
// Trainer Text Parsing — Each Player Shuffle + Draw
// ═══════════════════════════════════════════

describe("text-parser: trainer — each player shuffle and draw", () => {
  test("parses 'Each player shuffles their hand into their deck and draws 4 cards'", () => {
    const card = makeTrainerCard({
      name: "Judge",
      subtypes: ["Supporter"],
      rules: ["Each player shuffles their hand into their deck and draws 4 cards."],
    });

    const mockShuffleHand = jest.fn(() => 0);
    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({
      shuffleHandIntoDeck: mockShuffleHand,
      drawCards: mockDraw,
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    def!.trainer!.onPlay(ctx);
    expect(mockShuffleHand).toHaveBeenCalledWith("player");
    expect(mockShuffleHand).toHaveBeenCalledWith("opponent");
    expect(mockDraw).toHaveBeenCalledWith(4, "player");
    expect(mockDraw).toHaveBeenCalledWith(4, "opponent");
  });
});

// ═══════════════════════════════════════════
// Trainer Text Parsing — Search Energy
// ═══════════════════════════════════════════

describe("text-parser: trainer — search energy", () => {
  test("parses 'Search your deck for a basic Energy card and put it into your hand'", () => {
    const card = makeTrainerCard({
      name: "Energy Search",
      rules: ["Search your deck for a basic Energy card and put it into your hand. Then, shuffle your deck."],
    });

    const mockEnergy = { card: { name: "Fire Energy", supertype: "Energy" } } as any;
    const mockSearch = jest.fn(() => [mockEnergy]);
    const mockAddToHand = jest.fn();
    const mockShuffle = jest.fn();
    const ctx = makeMockCtx({
      searchDeck: mockSearch,
      addToHand: mockAddToHand,
      shuffleDeck: mockShuffle,
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    def!.trainer!.onPlay(ctx);
    expect(mockSearch).toHaveBeenCalled();
    expect(mockAddToHand).toHaveBeenCalledWith(mockEnergy, "player");
    expect(mockShuffle).toHaveBeenCalledWith("player");
  });
});

// ═══════════════════════════════════════════
// parseCardEffects — null cases
// ═══════════════════════════════════════════

describe("text-parser: null returns", () => {
  test("returns null for Pokemon with no attack text", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({ text: "" })],
    });
    expect(parseCardEffects(card)).toBeNull();
  });

  test("returns null for Pokemon with no attacks", () => {
    const card = makePokemonCard({ attacks: [] });
    expect(parseCardEffects(card)).toBeNull();
  });

  test("returns null for Trainer with no rules", () => {
    const card = makeTrainerCard({ rules: [] });
    expect(parseCardEffects(card)).toBeNull();
  });

  test("returns null for Trainer with unparseable text", () => {
    const card = makeTrainerCard({
      rules: ["Put this card on 1 of your Benched Pokémon that doesn't have a Pokémon Tool attached."],
    });
    expect(parseCardEffects(card)).toBeNull();
  });

  test("returns null for Energy cards", () => {
    const card: Card = {
      id: "test-energy",
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Basic"],
      number: "1",
      legalities: { standard: "Legal" },
      images: { small: "", large: "" },
    };
    expect(parseCardEffects(card)).toBeNull();
  });
});

// ═══════════════════════════════════════════
// autoRegisterTextEffects
// ═══════════════════════════════════════════

describe("autoRegisterTextEffects", () => {
  beforeEach(() => {
    clearRegistry();
  });

  test("registers parseable cards and counts correctly", () => {
    const cards: Card[] = [
      makeTrainerCard({
        id: "t1",
        name: "Draw Trainer",
        rules: ["Draw 3 cards."],
      }),
      makeTrainerCard({
        id: "t2",
        name: "Heal Trainer",
        rules: ["Heal 20 damage from 1 of your Pokémon."],
      }),
      makePokemonCard({
        id: "p1",
        name: "No Text Mon",
        attacks: [makeAttack({ text: "" })],
      }),
    ];

    const result = autoRegisterTextEffects(cards);
    expect(result.registered).toBe(2);
    expect(result.skipped).toBe(1);

    // Should be registered by name
    expect(hasEffect("__text_parsed__", "Draw Trainer")).toBe(true);
    expect(hasEffect("__text_parsed__", "Heal Trainer")).toBe(true);
  });

  test("does not overwrite already-registered effects", () => {
    // Pre-register an effect for "Draw Trainer" by name
    const { registerByName } = require("@/engine/effects/effect-registry");
    registerByName({
      cardId: "custom-id",
      cardName: "Draw Trainer",
      trainer: { onPlay: () => {} },
    });

    const cards: Card[] = [
      makeTrainerCard({
        id: "t1",
        name: "Draw Trainer",
        rules: ["Draw 3 cards."],
      }),
    ];

    const result = autoRegisterTextEffects(cards);
    expect(result.registered).toBe(0);
    expect(result.skipped).toBe(1);

    // The effect should still be the original, not text-parsed
    const effect = getEffect("custom-id", "Draw Trainer");
    expect(effect).not.toBeNull();
    expect(effect!.cardId).toBe("custom-id"); // not "__text_parsed__"
  });

  test("deduplicates by name (reprints)", () => {
    const cards: Card[] = [
      makeTrainerCard({ id: "t1-a", name: "Potion", rules: ["Heal 30 damage from 1 of your Pokémon."] }),
      makeTrainerCard({ id: "t1-b", name: "Potion", rules: ["Heal 30 damage from 1 of your Pokémon."] }),
    ];

    const result = autoRegisterTextEffects(cards);
    // First Potion registered, second skipped as duplicate name
    expect(result.registered).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

// ═══════════════════════════════════════════
// End-to-end: real-ish card text → effect execution
// ═══════════════════════════════════════════

describe("text-parser: end-to-end", () => {
  beforeEach(() => {
    clearRegistry();
  });

  test("Professor's Research: discard hand, draw 7", () => {
    const card = makeTrainerCard({
      name: "Professor's Research",
      subtypes: ["Supporter"],
      rules: ["Discard your hand and draw 7 cards. You may play only 1 Supporter card during your turn."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const discardOrder: string[] = [];
    const ctx = makeMockCtx({
      discardHand: jest.fn(() => { discardOrder.push("discard"); return []; }),
      drawCards: jest.fn(() => { discardOrder.push("draw"); return []; }),
    });

    def!.trainer!.onPlay(ctx);
    // Discard should happen before draw
    expect(discardOrder).toEqual(["discard", "draw"]);
  });

  test("Poison Fang: 30 damage + Poison", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Poison Fang",
        damage: "30",
        text: "The Defending Pokémon is now Poisoned.",
      })],
    });

    autoRegisterTextEffects([card]);
    const effect = getEffect("__text_parsed__", card.name);
    expect(effect).not.toBeNull();

    const ctx = makeMockCtx();
    const result = effect!.attacks![0].onAttack(ctx, 30);
    expect(result.damage).toBe(30);
    expect(result.statusEffects![0].status).toBe("poisoned");
  });

  test("Switch: registered and executable", () => {
    const card = makeTrainerCard({
      name: "Switch",
      rules: ["Switch your Active Pokémon with 1 of your Benched Pokémon."],
    });

    autoRegisterTextEffects([card]);
    const effect = getEffect("__text_parsed__", "Switch");
    expect(effect).not.toBeNull();
    expect(effect!.trainer).toBeDefined();
  });

  test("Multi-attack Pokemon: only parseable attacks get effects", () => {
    const card = makePokemonCard({
      name: "Dual Move Mon",
      attacks: [
        makeAttack({ name: "Scratch", damage: "20", text: "" }), // no text
        makeAttack({
          name: "Fire Blast",
          damage: "80",
          text: "Discard 1 Fire Energy from this Pokémon.",
        }),
      ],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();
    // Only 1 attack should be parsed (the one with text)
    expect(def!.attacks).toHaveLength(1);
    expect(def!.attacks![0].name).toBe("Fire Blast");
  });
});
