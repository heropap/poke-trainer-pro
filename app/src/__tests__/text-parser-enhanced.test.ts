/**
 * Tests for Enhanced Text-Based Effect Parser (Session B)
 *
 * Tests the ~20 new patterns added to the text-parser:
 * - Multi-coin flip damage
 * - Can't attack / can't retreat next turn
 * - Damage counter based damage
 * - Damage reduction next turn
 * - Draw cards as attack effect
 * - Switch self / opponent
 * - Discard opponent energy / deck / hand
 * - Skip weakness/resistance
 * - Prize-based damage
 * - Heal all / heal + remove status
 * - Bench count damage
 * - Conditional bonus (damaged / special condition)
 * - Move energy to bench
 * - Search evolution
 * - Trainer: energy from discard, attach from discard, recover, switch opponent,
 *   discard stadium, discard opponent hand, search pokemon/evolution/supporter,
 *   shuffle draw (self), opponent shuffle draw
 */

import { parseCardEffects } from "@/engine/effects/text-parser";
import { Card, CardAttack } from "@/types/card";
import { EffectContext } from "@/engine/effects/effect-types";
import { GameCard, Player } from "@/engine/game-state";
import { CANT_ATTACK_NEXT_TURN, PREVENT_RETREAT_NEXT_TURN } from "@/engine/effects/markers";

// ─── Helper factories ───

function makePokemonCard(overrides: Partial<Card> & { attacks?: CardAttack[] } = {}): Card {
  return {
    id: "test-pokemon-1",
    name: "Test Pokemon",
    supertype: "Pok\u00e9mon",
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

function makeMockCtx(overrides: Partial<EffectContext> = {}): EffectContext {
  const mockPlayer: Partial<Player> = {
    bench: { cards: [] },
    hand: { cards: [] },
    deck: { cards: [] },
    discard: { cards: [] },
    prizes: { cards: [{}, {}, {}, {}, {}, {}] as any[] },
    name: "Test Player",
  };

  const mockOpponent: Partial<Player> = {
    bench: { cards: [] },
    hand: { cards: [] },
    deck: { cards: [] },
    discard: { cards: [] },
    prizes: { cards: [{}, {}, {}, {}, {}, {}] as any[] },
    active: { card: { name: "Opp Active" }, damageCounters: 0, statusConditions: [], attachedEnergy: [] } as any,
    name: "Opponent",
  };

  return {
    state: {} as any,
    player: mockPlayer as Player,
    opponent: mockOpponent as Player,
    playerIndex: 0,
    opponentIndex: 1,
    source: { attachedEnergy: [], damageCounters: 0, card: { name: "Source" } } as any,
    flipCoin: jest.fn(() => true),
    flipCoins: jest.fn(() => ({ heads: 2, tails: 1 })),
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
    moveEnergy: jest.fn(() => true),
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
    addMarker: jest.fn(),
    removeMarker: jest.fn(),
    getMarker: jest.fn(() => 0),
    hasMarker: jest.fn(() => false),
    promptUser: jest.fn(() => Promise.resolve([])),
    promptDiscardFromHand: jest.fn(() => Promise.resolve([])),
    log: jest.fn(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// NEW Attack Patterns
// ═══════════════════════════════════════════

describe("text-parser enhanced: attack — multi-coin flip damage", () => {
  test("parses 'Flip 3 coins. This attack does 10 damage for each heads.'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Triple Kick",
        damage: "10x",
        text: "Flip 3 coins. This attack does 10 damage for each heads.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const ctx = makeMockCtx({ flipCoins: jest.fn(() => ({ heads: 2, tails: 1 })) });
    const result = def!.attacks![0].onAttack(ctx, 0);
    expect(ctx.flipCoins).toHaveBeenCalledWith(3);
    expect(result.damage).toBe(20); // 10 * 2 heads
  });

  test("Flip 2 coins, 40 damage per heads", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Double Stomp",
        damage: "40x",
        text: "Flip 2 coins. This attack does 40 damage for each heads.",
      })],
    });

    const def = parseCardEffects(card);
    const ctx = makeMockCtx({ flipCoins: jest.fn(() => ({ heads: 1, tails: 1 })) });
    const result = def!.attacks![0].onAttack(ctx, 0);
    expect(result.damage).toBe(40); // 40 * 1
  });
});

describe("text-parser enhanced: attack — can't attack next turn", () => {
  test("parses 'During your next turn, this Pokemon can't attack.'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Hyper Beam",
        damage: "150",
        text: "During your next turn, this Pok\u00e9mon can't attack.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockAddMarker = jest.fn();
    const ctx = makeMockCtx({ addMarker: mockAddMarker });
    const result = def!.attacks![0].onAttack(ctx, 150);
    expect(result.damage).toBe(150);
    expect(mockAddMarker).toHaveBeenCalledWith(ctx.source, CANT_ATTACK_NEXT_TURN, 1);
  });
});

describe("text-parser enhanced: attack — can't retreat next turn", () => {
  test("parses 'the Defending Pokemon can't retreat'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Bind",
        damage: "30",
        text: "The Defending Pok\u00e9mon can't retreat during your opponent's next turn.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const oppActive = { card: { name: "Opp" }, markers: {} } as any;
    const mockAddMarker = jest.fn();
    const ctx = makeMockCtx({
      addMarker: mockAddMarker,
      opponent: { active: oppActive, bench: { cards: [] } } as any,
    });
    const result = def!.attacks![0].onAttack(ctx, 30);
    expect(result.damage).toBe(30);
    expect(result.preventRetreat).toBe(true);
    expect(mockAddMarker).toHaveBeenCalledWith(oppActive, PREVENT_RETREAT_NEXT_TURN, 1);
  });
});

describe("text-parser enhanced: attack — damage per damage counter on self", () => {
  test("parses '+10 for each damage counter on this Pokemon'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Rage",
        damage: "20",
        text: "This attack does 10 more damage for each damage counter on this Pok\u00e9mon.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const ctx = makeMockCtx({
      source: { attachedEnergy: [], damageCounters: 5, card: { name: "Rager" } } as any,
    });
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(70); // 20 + 10*5
  });
});

describe("text-parser enhanced: attack — damage per damage counter on opponent", () => {
  test("parses '+10 for each damage counter on opponent's Active'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Low Kick",
        damage: "20",
        text: "This attack does 10 more damage for each damage counter on your opponent's Active Pok\u00e9mon.",
      })],
    });

    const def = parseCardEffects(card);
    const ctx = makeMockCtx({
      opponent: { active: { damageCounters: 3, card: { name: "Opp" }, statusConditions: [], attachedEnergy: [] } as any, bench: { cards: [] } } as any,
    });
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(50); // 20 + 10*3
  });
});

describe("text-parser enhanced: attack — conditional bonus if damaged", () => {
  test("parses 'If this Pokemon has any damage counters, +100 more damage'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Berserk",
        damage: "60",
        text: "If this Pok\u00e9mon has any damage counters on it, this attack does 100 more damage.",
      })],
    });

    const def = parseCardEffects(card);

    // With damage
    const ctx1 = makeMockCtx({
      source: { attachedEnergy: [], damageCounters: 2, card: { name: "Mon" } } as any,
    });
    expect(def!.attacks![0].onAttack(ctx1, 60).damage).toBe(160);

    // Without damage
    const ctx2 = makeMockCtx({
      source: { attachedEnergy: [], damageCounters: 0, card: { name: "Mon" } } as any,
    });
    expect(def!.attacks![0].onAttack(ctx2, 60).damage).toBe(60);
  });
});

describe("text-parser enhanced: attack — prize-based damage", () => {
  test("parses '+30 for each Prize card opponent has taken'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Vengeance",
        damage: "20",
        text: "This attack does 30 more damage for each Prize card your opponent has taken.",
      })],
    });

    const def = parseCardEffects(card);
    // Opponent has taken 2 prizes (4 left of 6)
    const ctx = makeMockCtx({
      opponent: {
        active: { card: { name: "Opp" }, damageCounters: 0, statusConditions: [], attachedEnergy: [] } as any,
        bench: { cards: [] },
        hand: { cards: [] },
        deck: { cards: [] },
        discard: { cards: [] },
        prizes: { cards: [{}, {}, {}, {}] as any[] },
      } as any,
    });
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(80); // 20 + 30*2
  });
});

describe("text-parser enhanced: attack — bench count damage", () => {
  test("parses '+20 for each of opponent's Benched Pokemon'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Chain Lightning",
        damage: "20",
        text: "This attack does 20 more damage for each of your opponent's Benched Pok\u00e9mon.",
      })],
    });

    const def = parseCardEffects(card);
    const ctx = makeMockCtx({
      opponent: {
        active: { card: { name: "Opp" }, damageCounters: 0, statusConditions: [], attachedEnergy: [] } as any,
        bench: { cards: [{}, {}, {}] as any[] },
      } as any,
    });
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(80); // 20 + 20*3
  });
});

describe("text-parser enhanced: attack — skip weakness/resistance", () => {
  test("parses 'Don't apply Weakness and Resistance'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Void Slash",
        damage: "100",
        text: "Don't apply Weakness and Resistance for this attack.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const result = def!.attacks![0].onAttack(makeMockCtx(), 100);
    expect(result.damage).toBe(100);
    expect(result.skipWeakness).toBe(true);
    expect(result.skipResistance).toBe(true);
  });

  test("parses 'isn't affected by Resistance'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Pierce",
        damage: "50",
        text: "This attack's damage isn't affected by Resistance.",
      })],
    });

    const def = parseCardEffects(card);
    const result = def!.attacks![0].onAttack(makeMockCtx(), 50);
    expect(result.skipWeakness).toBeUndefined();
    expect(result.skipResistance).toBe(true);
  });
});

describe("text-parser enhanced: attack — draw cards", () => {
  test("parses 'Draw 2 cards.' as attack effect", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Nuzzle",
        damage: "0",
        text: "Draw 2 cards.",
      })],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({ drawCards: mockDraw });
    def!.attacks![0].onAttack(ctx, 0);
    expect(mockDraw).toHaveBeenCalledWith(2, "player");
  });

  test("parses 'Draw a card.'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Headbutt",
        damage: "10",
        text: "Draw a card.",
      })],
    });

    const def = parseCardEffects(card);
    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({ drawCards: mockDraw });
    def!.attacks![0].onAttack(ctx, 10);
    expect(mockDraw).toHaveBeenCalledWith(1, "player");
  });
});

describe("text-parser enhanced: attack — draw until N cards", () => {
  test("parses 'draw cards until you have 6 cards in your hand'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Collect",
        damage: "0",
        text: "You may draw cards until you have 6 cards in your hand.",
      })],
    });

    const def = parseCardEffects(card);
    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({
      drawCards: mockDraw,
      player: { hand: { cards: [{}, {}, {}] as any[] }, bench: { cards: [] }, deck: { cards: [] }, discard: { cards: [] } } as any,
    });
    def!.attacks![0].onAttack(ctx, 0);
    expect(mockDraw).toHaveBeenCalledWith(3, "player"); // 6 - 3 = 3
  });
});

describe("text-parser enhanced: attack — switch self", () => {
  test("parses 'Switch this Pokemon with 1 of your Benched'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Hit and Run",
        damage: "30",
        text: "Switch this Pok\u00e9mon with 1 of your Benched Pok\u00e9mon.",
      })],
    });

    const def = parseCardEffects(card);
    const benchMon = { instanceId: "bench-1" } as any;
    const mockSwitch = jest.fn(() => true);
    const ctx = makeMockCtx({
      switchOwnActive: mockSwitch,
      player: { bench: { cards: [benchMon] } } as any,
    });
    const result = def!.attacks![0].onAttack(ctx, 30);
    expect(result.damage).toBe(30);
    expect(mockSwitch).toHaveBeenCalledWith("bench-1");
  });
});

describe("text-parser enhanced: attack — switch opponent's active", () => {
  test("parses 'Switch out your opponent's Active Pokemon'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Whirlwind",
        damage: "40",
        text: "Switch out your opponent's Active Pok\u00e9mon to the Bench.",
      })],
    });

    const def = parseCardEffects(card);
    const oppBench = { instanceId: "opp-bench-1" } as any;
    const mockSwitch = jest.fn(() => true);
    const ctx = makeMockCtx({
      switchOpponentActive: mockSwitch,
      opponent: {
        active: { card: { name: "Opp" } } as any,
        bench: { cards: [oppBench] },
      } as any,
    });
    def!.attacks![0].onAttack(ctx, 40);
    expect(mockSwitch).toHaveBeenCalledWith("opp-bench-1");
  });
});

describe("text-parser enhanced: attack — discard opponent energy (coin)", () => {
  test("parses 'Flip a coin. If heads, discard an Energy from opponent'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Spark",
        damage: "20",
        text: "Flip a coin. If heads, discard an Energy from your opponent's Active Pok\u00e9mon.",
      })],
    });

    const def = parseCardEffects(card);
    const oppEnergy = { instanceId: "e1", card: { name: "Fire Energy" } } as any;
    const ctx = makeMockCtx({
      flipCoin: jest.fn(() => true),
      opponent: {
        active: { card: { name: "Opp" }, attachedEnergy: [oppEnergy], damageCounters: 0, statusConditions: [] } as any,
        bench: { cards: [] },
        discard: { cards: [] },
      } as any,
    });
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(20);
    expect(ctx.opponent.active!.attachedEnergy).toHaveLength(0);
    expect(ctx.opponent.discard.cards).toHaveLength(1);
  });
});

describe("text-parser enhanced: attack — discard opponent energy (no coin)", () => {
  test("parses 'Discard an Energy from your opponent's Active Pokemon'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Drain",
        damage: "50",
        text: "Discard an Energy from your opponent's Active Pok\u00e9mon.",
      })],
    });

    const def = parseCardEffects(card);
    const oppEnergy = { instanceId: "e1", card: { name: "Water Energy" } } as any;
    const ctx = makeMockCtx({
      opponent: {
        active: { card: { name: "Opp" }, attachedEnergy: [oppEnergy], damageCounters: 0, statusConditions: [] } as any,
        bench: { cards: [] },
        discard: { cards: [] },
      } as any,
    });
    def!.attacks![0].onAttack(ctx, 50);
    expect(ctx.opponent.active!.attachedEnergy).toHaveLength(0);
  });
});

describe("text-parser enhanced: attack — discard opponent's deck", () => {
  test("parses 'Discard the top 2 cards of your opponent's deck'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Mill",
        damage: "0",
        text: "Discard the top 2 cards of your opponent's deck.",
      })],
    });

    const def = parseCardEffects(card);
    const deckCard1 = { card: { name: "Card 1" } } as any;
    const deckCard2 = { card: { name: "Card 2" } } as any;
    const ctx = makeMockCtx({
      opponent: {
        active: { card: { name: "Opp" }, damageCounters: 0, statusConditions: [], attachedEnergy: [] } as any,
        bench: { cards: [] },
        deck: { cards: [deckCard1, deckCard2] },
        discard: { cards: [] },
      } as any,
    });
    def!.attacks![0].onAttack(ctx, 0);
    expect(ctx.opponent.deck.cards).toHaveLength(0);
    expect(ctx.opponent.discard.cards).toHaveLength(2);
  });
});

describe("text-parser enhanced: attack — discard random from opponent hand", () => {
  test("parses 'Discard a random card from your opponent's hand'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Disruption",
        damage: "20",
        text: "Discard a random card from your opponent's hand.",
      })],
    });

    const def = parseCardEffects(card);
    const handCards = [{ card: { name: "C1" } }, { card: { name: "C2" } }] as any[];
    const ctx = makeMockCtx({
      opponent: {
        active: { card: { name: "Opp" }, damageCounters: 0, statusConditions: [], attachedEnergy: [] } as any,
        bench: { cards: [] },
        hand: { cards: [...handCards] },
        discard: { cards: [] },
      } as any,
    });
    def!.attacks![0].onAttack(ctx, 20);
    expect(ctx.opponent.hand.cards.length).toBe(1);
    expect(ctx.opponent.discard.cards.length).toBe(1);
  });
});

describe("text-parser enhanced: attack — heal all own Pokemon", () => {
  test("parses 'Heal 30 damage from each of your Pokemon'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Gentle Breeze",
        damage: "0",
        text: "Heal 30 damage from each of your Pok\u00e9mon.",
      })],
    });

    const def = parseCardEffects(card);
    const mockHeal = jest.fn();
    const allPokemon = [{ card: { name: "P1" } }, { card: { name: "P2" } }] as any[];
    const ctx = makeMockCtx({
      heal: mockHeal,
      getAllPokemon: jest.fn(() => allPokemon),
    });
    def!.attacks![0].onAttack(ctx, 0);
    expect(mockHeal).toHaveBeenCalledTimes(2);
    expect(mockHeal).toHaveBeenCalledWith(30, allPokemon[0]);
    expect(mockHeal).toHaveBeenCalledWith(30, allPokemon[1]);
  });
});

describe("text-parser enhanced: attack — conditional bonus vs special condition", () => {
  test("parses 'If opponent has Special Condition, +120 more damage'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Venoshock",
        damage: "40",
        text: "If your opponent's Active Pok\u00e9mon is affected by a Special Condition, this attack does 120 more damage.",
      })],
    });

    const def = parseCardEffects(card);

    // With status
    const ctx1 = makeMockCtx({
      opponent: {
        active: { card: { name: "Opp" }, statusConditions: ["poisoned"], damageCounters: 0, attachedEnergy: [] } as any,
        bench: { cards: [] },
      } as any,
    });
    expect(def!.attacks![0].onAttack(ctx1, 40).damage).toBe(160);

    // Without status
    const ctx2 = makeMockCtx({
      opponent: {
        active: { card: { name: "Opp" }, statusConditions: [], damageCounters: 0, attachedEnergy: [] } as any,
        bench: { cards: [] },
      } as any,
    });
    expect(def!.attacks![0].onAttack(ctx2, 40).damage).toBe(40);
  });
});

describe("text-parser enhanced: attack — move energy to bench", () => {
  test("parses 'Move an Energy from this Pokemon to 1 of your Benched'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Energy Transfer",
        damage: "30",
        text: "Move an Energy from this Pok\u00e9mon to 1 of your Benched Pok\u00e9mon.",
      })],
    });

    const def = parseCardEffects(card);
    const energy = { instanceId: "e1", card: { name: "Fire Energy" } } as any;
    const benchMon = { instanceId: "b1" } as any;
    const mockMoveEnergy = jest.fn(() => true);
    const ctx = makeMockCtx({
      moveEnergy: mockMoveEnergy,
      source: { attachedEnergy: [energy], damageCounters: 0, card: { name: "Mon" } } as any,
      player: { bench: { cards: [benchMon] } } as any,
    });
    def!.attacks![0].onAttack(ctx, 30);
    expect(mockMoveEnergy).toHaveBeenCalledWith(ctx.source, benchMon, "e1");
  });
});

describe("text-parser enhanced: attack — damage reduction marker", () => {
  test("parses 'this Pokemon takes 30 less damage next turn'", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Iron Defense",
        damage: "20",
        text: "During your opponent's next turn, this Pok\u00e9mon takes 30 less damage from attacks (after applying Weakness and Resistance).",
      })],
    });

    const def = parseCardEffects(card);
    const mockAddMarker = jest.fn();
    const ctx = makeMockCtx({ addMarker: mockAddMarker });
    const result = def!.attacks![0].onAttack(ctx, 20);
    expect(result.damage).toBe(20);
    expect(mockAddMarker).toHaveBeenCalledWith(ctx.source, "DAMAGE_REDUCTION:30", 1);
  });
});

// ═══════════════════════════════════════════
// NEW Trainer Patterns
// ═══════════════════════════════════════════

describe("text-parser enhanced: trainer — search any Pokemon", () => {
  test("parses 'Search your deck for a Pokemon and put it into your hand'", () => {
    const card = makeTrainerCard({
      name: "Pokemon Fan Club",
      rules: ["Search your deck for a Pok\u00e9mon, reveal it, and put it into your hand. Then, shuffle your deck."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const found = { card: { name: "Pikachu", supertype: "Pok\u00e9mon" } } as any;
    const mockSearch = jest.fn(() => [found]);
    const mockAddToHand = jest.fn();
    const mockShuffle = jest.fn();
    const ctx = makeMockCtx({
      searchDeck: mockSearch,
      addToHand: mockAddToHand,
      shuffleDeck: mockShuffle,
    });

    def!.trainer!.onPlay(ctx);
    expect(mockSearch).toHaveBeenCalled();
    expect(mockAddToHand).toHaveBeenCalledWith(found, "player");
    expect(mockShuffle).toHaveBeenCalledWith("player");
  });
});

describe("text-parser enhanced: trainer — search supporter", () => {
  test("parses 'Search your deck for a Supporter card'", () => {
    const card = makeTrainerCard({
      name: "VS Seeker",
      rules: ["Search your deck for a Supporter card, reveal it, and put it into your hand. Then, shuffle your deck."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockSearch = jest.fn(() => []);
    const ctx = makeMockCtx({ searchDeck: mockSearch, shuffleDeck: jest.fn() });
    def!.trainer!.onPlay(ctx);
    expect(mockSearch).toHaveBeenCalled();
    // Verify the filter checks for Supporter subtype
    const filterFn = (mockSearch.mock.calls as any[][])[0][0];
    expect(filterFn({ card: { supertype: "Trainer", subtypes: ["Supporter"] } })).toBe(true);
    expect(filterFn({ card: { supertype: "Trainer", subtypes: ["Item"] } })).toBe(false);
  });
});

describe("text-parser enhanced: trainer — switch opponent's active", () => {
  test("parses 'Switch in 1 of your opponent's Benched Pokemon'", () => {
    const card = makeTrainerCard({
      name: "Boss's Orders",
      rules: ["Switch in 1 of your opponent's Benched Pok\u00e9mon to the Active Spot."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();
    expect(def!.trainer!.canPlay).toBeDefined();

    const oppBench = { instanceId: "opp-b1" } as any;
    const mockSwitch = jest.fn(() => true);
    const ctx = makeMockCtx({
      switchOpponentActive: mockSwitch,
      opponent: {
        active: { card: { name: "Opp" } } as any,
        bench: { cards: [oppBench] },
      } as any,
    });

    expect(def!.trainer!.canPlay!(ctx)).toBe(true);
    def!.trainer!.onPlay(ctx);
    expect(mockSwitch).toHaveBeenCalledWith("opp-b1");
  });

  test("canPlay returns false when opponent has no bench", () => {
    const card = makeTrainerCard({
      name: "Boss's Orders",
      rules: ["Switch in 1 of your opponent's Benched Pok\u00e9mon to the Active Spot."],
    });

    const def = parseCardEffects(card);
    const ctx = makeMockCtx({
      opponent: { active: {} as any, bench: { cards: [] } } as any,
    });
    expect(def!.trainer!.canPlay!(ctx)).toBe(false);
  });
});

describe("text-parser enhanced: trainer — energy from discard to hand", () => {
  test("parses 'Put 2 Energy cards from your discard pile into your hand'", () => {
    const card = makeTrainerCard({
      name: "Energy Retrieval",
      rules: ["Put 2 Energy cards from your discard pile into your hand."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const e1 = { card: { supertype: "Energy" } } as any;
    const e2 = { card: { supertype: "Energy" } } as any;
    const mockSearchDiscard = jest.fn(() => [e1, e2]);
    const mockAddToHand = jest.fn();
    const ctx = makeMockCtx({
      searchDiscard: mockSearchDiscard,
      addToHand: mockAddToHand,
    });

    def!.trainer!.onPlay(ctx);
    expect(mockSearchDiscard).toHaveBeenCalled();
    expect(mockAddToHand).toHaveBeenCalledTimes(2);
  });
});

describe("text-parser enhanced: trainer — attach energy from discard", () => {
  test("parses 'Attach a basic Energy card from your discard pile'", () => {
    const card = makeTrainerCard({
      name: "Energy Recycler",
      rules: ["Attach a basic Energy card from your discard pile to 1 of your Pok\u00e9mon."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockAttach = jest.fn(() => []);
    const activeMon = { card: { name: "Active" } } as any;
    const ctx = makeMockCtx({
      attachEnergyFromDiscard: mockAttach,
      player: { active: activeMon, bench: { cards: [] } } as any,
    });

    def!.trainer!.onPlay(ctx);
    expect(mockAttach).toHaveBeenCalledWith(expect.any(Function), 1, activeMon);
  });
});

describe("text-parser enhanced: trainer — recover from discard", () => {
  test("parses 'Put a Pokemon from your discard pile into your hand'", () => {
    const card = makeTrainerCard({
      name: "Rescue Board",
      rules: ["Put a Pok\u00e9mon from your discard pile into your hand."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const poke = { card: { supertype: "Pok\u00e9mon", name: "Pikachu" } } as any;
    const mockSearchDiscard = jest.fn(() => [poke]);
    const mockAddToHand = jest.fn();
    const ctx = makeMockCtx({
      searchDiscard: mockSearchDiscard,
      addToHand: mockAddToHand,
    });

    def!.trainer!.onPlay(ctx);
    expect(mockSearchDiscard).toHaveBeenCalled();
    // Verify filter only finds Pokemon
    const filterFn = (mockSearchDiscard.mock.calls as any[][])[0][0];
    expect(filterFn({ card: { supertype: "Pok\u00e9mon" } })).toBe(true);
    expect(filterFn({ card: { supertype: "Trainer" } })).toBe(false);
    expect(mockAddToHand).toHaveBeenCalledWith(poke, "player");
  });
});

describe("text-parser enhanced: trainer — discard stadium", () => {
  test("parses 'Discard a Stadium card in play'", () => {
    const card = makeTrainerCard({
      name: "Lost Vacuum",
      rules: ["Discard a Stadium card in play."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();
    expect(def!.trainer!.canPlay).toBeDefined();

    const mockRemoveStadium = jest.fn(() => true);
    const mockGetStadium = jest.fn(() => ({ card: { name: "Beach Court" } } as any));
    const ctx = makeMockCtx({
      getStadium: mockGetStadium,
      removeStadium: mockRemoveStadium,
    });

    expect(def!.trainer!.canPlay!(ctx)).toBe(true);
    def!.trainer!.onPlay(ctx);
    expect(mockRemoveStadium).toHaveBeenCalled();
  });

  test("canPlay returns false with no stadium", () => {
    const card = makeTrainerCard({
      name: "Lost Vacuum",
      rules: ["Discard a Stadium card in play."],
    });

    const def = parseCardEffects(card);
    const ctx = makeMockCtx({ getStadium: jest.fn(() => null) });
    expect(def!.trainer!.canPlay!(ctx)).toBe(false);
  });
});

describe("text-parser enhanced: trainer — discard from opponent hand", () => {
  test("parses 'Your opponent discards a random card from their hand'", () => {
    const card = makeTrainerCard({
      name: "Team Rocket's Disruption",
      rules: ["Your opponent discards a random card from their hand."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const handCards = [{ card: { name: "C1" } }, { card: { name: "C2" } }] as any[];
    const ctx = makeMockCtx({
      opponent: {
        active: {} as any,
        bench: { cards: [] },
        hand: { cards: [...handCards] },
        discard: { cards: [] },
      } as any,
    });

    def!.trainer!.onPlay(ctx);
    expect(ctx.opponent.hand.cards.length).toBe(1);
    expect(ctx.opponent.discard.cards.length).toBe(1);
  });
});

describe("text-parser enhanced: trainer — shuffle hand and draw (self)", () => {
  test("parses 'Shuffle your hand into your deck. Then, draw 5 cards'", () => {
    const card = makeTrainerCard({
      name: "Cynthia",
      subtypes: ["Supporter"],
      rules: ["Shuffle your hand into your deck. Then, draw 5 cards."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockShuffle = jest.fn(() => 0);
    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({
      shuffleHandIntoDeck: mockShuffle,
      drawCards: mockDraw,
    });

    def!.trainer!.onPlay(ctx);
    expect(mockShuffle).toHaveBeenCalledWith("player");
    expect(mockDraw).toHaveBeenCalledWith(5, "player");
  });
});

describe("text-parser enhanced: trainer — opponent shuffle draw", () => {
  test("parses 'Your opponent shuffles their hand into their deck and draws 4 cards'", () => {
    const card = makeTrainerCard({
      name: "Disruption Supporter",
      subtypes: ["Supporter"],
      rules: ["Your opponent shuffles their hand into their deck and draws 4 cards."],
    });

    const def = parseCardEffects(card);
    expect(def).not.toBeNull();

    const mockShuffle = jest.fn(() => 0);
    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({
      shuffleHandIntoDeck: mockShuffle,
      drawCards: mockDraw,
    });

    def!.trainer!.onPlay(ctx);
    expect(mockShuffle).toHaveBeenCalledWith("opponent");
    expect(mockDraw).toHaveBeenCalledWith(4, "opponent");
  });
});

// ═══════════════════════════════════════════
// Regression: existing patterns still work
// ═══════════════════════════════════════════

describe("text-parser enhanced: regression — existing patterns", () => {
  test("status application still works", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Poison Sting",
        damage: "20",
        text: "The Defending Pok\u00e9mon is now Poisoned.",
      })],
    });
    const def = parseCardEffects(card);
    const result = def!.attacks![0].onAttack(makeMockCtx(), 20);
    expect(result.statusEffects![0].status).toBe("poisoned");
  });

  test("self-damage still works", () => {
    const card = makePokemonCard({
      attacks: [makeAttack({
        name: "Take Down",
        damage: "60",
        text: "This Pok\u00e9mon also does 30 damage to itself.",
      })],
    });
    const def = parseCardEffects(card);
    expect(def!.attacks![0].onAttack(makeMockCtx(), 60).selfDamage).toBe(30);
  });

  test("trainer draw still works", () => {
    const card = makeTrainerCard({
      name: "Hau",
      rules: ["Draw 3 cards."],
    });
    const def = parseCardEffects(card);
    const mockDraw = jest.fn(() => []);
    const ctx = makeMockCtx({ drawCards: mockDraw });
    def!.trainer!.onPlay(ctx);
    expect(mockDraw).toHaveBeenCalledWith(3, "player");
  });

  test("trainer search basic still works", () => {
    const card = makeTrainerCard({
      name: "Nest Ball",
      rules: ["Search your deck for a Basic Pok\u00e9mon and put it onto your Bench."],
    });
    const def = parseCardEffects(card);
    expect(def!.trainer!.canPlay).toBeDefined();
  });
});
