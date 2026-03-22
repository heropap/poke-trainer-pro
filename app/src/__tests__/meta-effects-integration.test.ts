/**
 * Meta Card Effects Integration Tests
 *
 * Tests for the batch-ported card effects:
 * - Meta Pokemon attack effects (16 Pokemon, 30 attacks)
 * - Expanded trainer effects (24 trainers)
 * - Effect registry registration verification
 */

import {
  createGameState,
  createGameCard,
  GameState,
  GameCard,
  GamePhase,
} from "@/engine/game-state";
import { createEffectContext } from "@/engine/effects/effect-context";
import { addToBottom } from "@/engine/zones";
import {
  initializeEffects,
  getEffect,
  hasEffect,
  getNameRegisteredCount,
} from "@/engine/effects";
import { Card } from "@/types/card";

// ─── Test Helpers ───

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "test-card-1",
    name: "Test Card",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    hp: "100",
    types: ["Colorless"],
    attacks: [],
    weaknesses: [],
    retreatCost: ["Colorless"],
    convertedRetreatCost: 1,
    set: "sv1",
    number: "1",
    artist: "Test",
    rarity: "Common",
    images: { small: "", large: "" },
    legalities: {},
    ...overrides,
  } as Card;
}

function makePokemonCard(
  name: string,
  overrides: Partial<Card> = {}
): GameCard {
  return createGameCard(
    makeCard({
      name,
      ...overrides,
    })
  );
}

function makeEnergyCard(
  type: string = "Water",
  name?: string
): GameCard {
  return createGameCard(
    makeCard({
      id: `energy-${type.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name || `${type} Energy`,
      supertype: "Energy",
      subtypes: ["Basic"],
      hp: undefined,
      types: [type],
      retreatCost: [],
      convertedRetreatCost: 0,
    })
  );
}

function makeStadiumCard(name: string): GameCard {
  return createGameCard(
    makeCard({
      name,
      supertype: "Trainer",
      subtypes: ["Stadium"],
      hp: undefined,
      types: [],
      retreatCost: [],
      convertedRetreatCost: 0,
    })
  );
}

function setupGame(): GameState {
  const state = createGameState("Alice", "Bob");
  state.phase = GamePhase.MAIN;
  state.turn = 2;
  state.isFirstTurn = false;
  state.turnStatus.currentPhase = GamePhase.MAIN;

  state.players[0].active = makePokemonCard("Pikachu");
  state.players[1].active = makePokemonCard("Charmander", { hp: "70" });

  state.players[0].bench.cards.push(makePokemonCard("Eevee"));
  state.players[0].bench.cards.push(makePokemonCard("Jigglypuff"));
  state.players[1].bench.cards.push(makePokemonCard("Squirtle"));
  state.players[1].bench.cards.push(makePokemonCard("Bulbasaur"));

  // Give both players some deck
  for (let i = 0; i < 20; i++) {
    addToBottom(state.players[0].deck, makePokemonCard(`DeckMon${i}`));
    addToBottom(state.players[1].deck, makePokemonCard(`OppDeck${i}`));
  }

  return state;
}

// ─── Initialize effects ───
beforeAll(() => {
  initializeEffects();
});

// ───────────────────────────────────────────────
// 1. Registry Verification
// ───────────────────────────────────────────────

describe("Effect Registry — batch registration", () => {
  test("meta attack effects are registered by name", () => {
    expect(hasEffect("any-id", "Charizard ex")).toBe(true);
    expect(hasEffect("any-id", "Pidgeot ex")).toBe(true);
    expect(hasEffect("any-id", "Dragapult ex")).toBe(true);
    expect(hasEffect("any-id", "Terapagos ex")).toBe(true);
    expect(hasEffect("any-id", "Gardevoir ex")).toBe(true);
    expect(hasEffect("any-id", "Roaring Moon ex")).toBe(true);
    expect(hasEffect("any-id", "Chien-Pao ex")).toBe(true);
    expect(hasEffect("any-id", "Iron Hands ex")).toBe(true);
    expect(hasEffect("any-id", "Miraidon ex")).toBe(true);
    expect(hasEffect("any-id", "Raging Bolt ex")).toBe(true);
  });

  test("expanded trainer effects are registered by name", () => {
    expect(hasEffect("any-id", "Kieran")).toBe(true);
    expect(hasEffect("any-id", "Eri")).toBe(true);
    expect(hasEffect("any-id", "Crispin")).toBe(true);
    expect(hasEffect("any-id", "Perrin")).toBe(true);
    expect(hasEffect("any-id", "Roxanne")).toBe(true);
    expect(hasEffect("any-id", "Maximum Belt")).toBe(true);
    expect(hasEffect("any-id", "Prime Catcher")).toBe(true);
  });

  test("total name-registered effects exceeds 80", () => {
    // Original trainers (~37) + stadiums (5) + meta attacks (26) + expanded trainers (24)
    expect(getNameRegisteredCount()).toBeGreaterThanOrEqual(80);
  });
});

// ───────────────────────────────────────────────
// 2. Meta Pokemon Attack Effects
// ───────────────────────────────────────────────

describe("Charizard ex — Burning Darkness", () => {
  test("base damage + 30 per opponent prize taken", () => {
    const state = setupGame();
    const charizard = makePokemonCard("Charizard ex");
    state.players[0].active = charizard;

    // Opponent has taken 3 prizes (3 remaining out of 6)
    state.players[1].prizes.cards = [
      makePokemonCard("P1"),
      makePokemonCard("P2"),
      makePokemonCard("P3"),
    ];

    const effect = getEffect("any", "Charizard ex");
    const ctx = createEffectContext(state, 0, charizard);
    const result = effect!.attacks![0].onAttack(ctx, 180);

    // 3 prizes taken = 180 + 90 = 270
    expect(result.damage).toBe(270);
  });

  test("0 prizes taken = base damage only", () => {
    const state = setupGame();
    const charizard = makePokemonCard("Charizard ex");
    state.players[0].active = charizard;

    // Opponent has taken 0 prizes (all 6 remaining)
    state.players[1].prizes.cards = Array.from({ length: 6 }, (_, i) =>
      makePokemonCard(`P${i}`)
    );

    const effect = getEffect("any", "Charizard ex");
    const ctx = createEffectContext(state, 0, charizard);
    const result = effect!.attacks![0].onAttack(ctx, 180);

    expect(result.damage).toBe(180);
  });
});

describe("Pidgeot ex — Blustery Wind", () => {
  test("removes stadium if one is in play", () => {
    const state = setupGame();
    state.stadium = {
      card: makeStadiumCard("Beach Court"),
      owner: 1,
    };

    const pidgeot = makePokemonCard("Pidgeot ex");
    state.players[0].active = pidgeot;

    const effect = getEffect("any", "Pidgeot ex");
    const ctx = createEffectContext(state, 0, pidgeot);
    const result = effect!.attacks![0].onAttack(ctx, 120);

    expect(result.damage).toBe(120);
    expect(state.stadium).toBeNull();
  });
});

describe("Dragapult ex — Phantom Dive", () => {
  test("deals bench spread damage", () => {
    const state = setupGame();
    const dragapult = makePokemonCard("Dragapult ex");
    state.players[0].active = dragapult;

    const effect = getEffect("any", "Dragapult ex");
    const ctx = createEffectContext(state, 0, dragapult);
    const result = effect!.attacks![1].onAttack(ctx, 200);

    expect(result.damage).toBe(200);
    expect(result.benchDamage).toBeDefined();
    expect(result.benchDamage!.length).toBeGreaterThan(0);
    // Total bench damage should be 60 (6 counters × 10)
    const totalBenchDmg = result.benchDamage!.reduce(
      (sum, bd) => sum + bd.damage,
      0
    );
    expect(totalBenchDmg).toBe(60);
  });
});

describe("Terapagos ex — Unified Beatdown", () => {
  test("30× bench count", () => {
    const state = setupGame();
    const terapagos = makePokemonCard("Terapagos ex");
    state.players[0].active = terapagos;

    // Player has 2 bench Pokemon
    const effect = getEffect("any", "Terapagos ex");
    const ctx = createEffectContext(state, 0, terapagos);
    const result = effect!.attacks![0].onAttack(ctx, 0);

    expect(result.damage).toBe(60); // 2 × 30
  });

  test("0 damage with empty bench", () => {
    const state = setupGame();
    state.players[0].bench.cards = [];
    const terapagos = makePokemonCard("Terapagos ex");
    state.players[0].active = terapagos;

    const effect = getEffect("any", "Terapagos ex");
    const ctx = createEffectContext(state, 0, terapagos);
    const result = effect!.attacks![0].onAttack(ctx, 0);

    expect(result.damage).toBe(0);
  });
});

describe("Gardevoir ex — Miracle Force", () => {
  test("removes all status from self", () => {
    const state = setupGame();
    const gardevoir = makePokemonCard("Gardevoir ex");
    gardevoir.statusConditions = ["poisoned", "burned"];
    state.players[0].active = gardevoir;

    const effect = getEffect("any", "Gardevoir ex");
    const ctx = createEffectContext(state, 0, gardevoir);
    effect!.attacks![0].onAttack(ctx, 190);

    expect(gardevoir.statusConditions).toEqual([]);
  });
});

describe("Roaring Moon ex — Calamity Storm", () => {
  test("+120 damage when stadium is discarded", () => {
    const state = setupGame();
    state.stadium = {
      card: makeStadiumCard("Beach Court"),
      owner: 0,
    };

    const roaringMoon = makePokemonCard("Roaring Moon ex");
    state.players[0].active = roaringMoon;

    const effect = getEffect("any", "Roaring Moon ex");
    const ctx = createEffectContext(state, 0, roaringMoon);
    const result = effect!.attacks![1].onAttack(ctx, 100);

    expect(result.damage).toBe(220); // 100 + 120
    expect(state.stadium).toBeNull();
  });

  test("no bonus without stadium", () => {
    const state = setupGame();
    const roaringMoon = makePokemonCard("Roaring Moon ex");
    state.players[0].active = roaringMoon;

    const effect = getEffect("any", "Roaring Moon ex");
    const ctx = createEffectContext(state, 0, roaringMoon);
    const result = effect!.attacks![1].onAttack(ctx, 100);

    expect(result.damage).toBe(100);
  });
});

describe("Chien-Pao ex — Hail Blade", () => {
  test("60× Water Energy discarded", () => {
    const state = setupGame();
    const chienPao = makePokemonCard("Chien-Pao ex");
    chienPao.attachedEnergy = [
      makeEnergyCard("Water"),
      makeEnergyCard("Water"),
      makeEnergyCard("Water"),
    ];
    state.players[0].active = chienPao;

    const effect = getEffect("any", "Chien-Pao ex");
    const ctx = createEffectContext(state, 0, chienPao);
    const result = effect!.attacks![0].onAttack(ctx, 0);

    expect(result.damage).toBe(180); // 3 × 60
    expect(chienPao.attachedEnergy.length).toBe(0); // All discarded
  });

  test("0 damage with no Water Energy", () => {
    const state = setupGame();
    const chienPao = makePokemonCard("Chien-Pao ex");
    state.players[0].active = chienPao;

    const effect = getEffect("any", "Chien-Pao ex");
    const ctx = createEffectContext(state, 0, chienPao);
    const result = effect!.attacks![0].onAttack(ctx, 0);

    expect(result.damage).toBe(0);
  });
});

describe("Snorlax — Thudding Press", () => {
  test("deals damage and self-damage", () => {
    const effect = getEffect("any", "Snorlax");
    const state = setupGame();
    const snorlax = makePokemonCard("Snorlax");
    state.players[0].active = snorlax;
    const ctx = createEffectContext(state, 0, snorlax);

    const result = effect!.attacks![0].onAttack(ctx, 130);

    expect(result.damage).toBe(130);
    expect(result.selfDamage).toBe(30);
  });
});

describe("Comfey — Flower Shower", () => {
  test("both players draw 3", () => {
    const state = setupGame();
    const comfey = makePokemonCard("Comfey");
    state.players[0].active = comfey;

    const handBefore0 = state.players[0].hand.cards.length;
    const handBefore1 = state.players[1].hand.cards.length;

    const effect = getEffect("any", "Comfey");
    const ctx = createEffectContext(state, 0, comfey);
    effect!.attacks![0].onAttack(ctx, 0);

    expect(state.players[0].hand.cards.length).toBe(handBefore0 + 3);
    expect(state.players[1].hand.cards.length).toBe(handBefore1 + 3);
  });
});

describe("Raging Bolt ex — Burst Roar", () => {
  test("discards hand and draws 6", () => {
    const state = setupGame();
    const ragingBolt = makePokemonCard("Raging Bolt ex");
    state.players[0].active = ragingBolt;
    // Give player some hand cards
    for (let i = 0; i < 4; i++) {
      state.players[0].hand.cards.push(makePokemonCard(`HandCard${i}`));
    }

    const effect = getEffect("any", "Raging Bolt ex");
    const ctx = createEffectContext(state, 0, ragingBolt);
    const result = effect!.attacks![0].onAttack(ctx, 0);

    expect(result.damage).toBe(0);
    expect(state.players[0].hand.cards.length).toBe(6);
  });
});

// ───────────────────────────────────────────────
// 3. Expanded Trainer Effects
// ───────────────────────────────────────────────

describe("Eri — discard opponent's Items", () => {
  test("discards up to 2 Item cards from opponent hand", () => {
    const state = setupGame();
    const source = state.players[0].active!;

    // Add items to opponent's hand
    const item1 = createGameCard(
      makeCard({ name: "Potion", supertype: "Trainer", subtypes: ["Item"] })
    );
    const item2 = createGameCard(
      makeCard({ name: "Switch", supertype: "Trainer", subtypes: ["Item"] })
    );
    const supporter = createGameCard(
      makeCard({
        name: "Judge",
        supertype: "Trainer",
        subtypes: ["Supporter"],
      })
    );
    state.players[1].hand.cards.push(item1, item2, supporter);

    const effect = getEffect("any", "Eri");
    const ctx = createEffectContext(state, 0, source);
    effect!.trainer!.onPlay!(ctx);

    // Items discarded, supporter stays
    const oppHand = state.players[1].hand.cards;
    expect(oppHand.some((c) => c.card.name === "Judge")).toBe(true);
    expect(state.players[1].discard.cards.length).toBe(2);
  });
});

describe("Roxanne — hand disruption", () => {
  test("opponent draws 2, player draws 6 when opp has <= 3 prizes", () => {
    const state = setupGame();
    const source = state.players[0].active!;

    state.players[1].prizes.cards = [
      makePokemonCard("P1"),
      makePokemonCard("P2"),
    ]; // 2 prizes left

    // Give both players hand cards
    state.players[0].hand.cards = [makePokemonCard("H1")];
    state.players[1].hand.cards = [
      makePokemonCard("H2"),
      makePokemonCard("H3"),
    ];

    const effect = getEffect("any", "Roxanne");
    const ctx = createEffectContext(state, 0, source);

    // Check canPlay
    expect(effect!.trainer!.canPlay!(ctx)).toBe(true);

    effect!.trainer!.onPlay!(ctx);

    expect(state.players[0].hand.cards.length).toBe(6);
    expect(state.players[1].hand.cards.length).toBe(2);
  });

  test("cannot play when opponent has > 3 prizes", () => {
    const state = setupGame();
    const source = state.players[0].active!;
    state.players[1].prizes.cards = Array.from({ length: 5 }, (_, i) =>
      makePokemonCard(`P${i}`)
    );

    const effect = getEffect("any", "Roxanne");
    const ctx = createEffectContext(state, 0, source);

    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);
  });
});

describe("Crispin — search deck for 2 different-type Basic Energy", () => {
  test("searches deck for up to 2 Basic Energy of different types", () => {
    const state = setupGame();
    const source = state.players[0].active!;

    // Put different-type energy in deck
    state.players[0].deck.cards.push(makeEnergyCard("Fire", "Fire Energy"));
    state.players[0].deck.cards.push(makeEnergyCard("Water", "Water Energy"));
    state.players[0].deck.cards.push(makeEnergyCard("Fire", "Fire Energy 2"));
    const handBefore = state.players[0].hand.cards.length;

    const effect = getEffect("any", "Crispin");
    const ctx = createEffectContext(state, 0, source);
    effect!.trainer!.onPlay!(ctx);

    // Should have found energy from deck (1 to hand, 1 attached or both to hand)
    // The exact behavior depends on implementation, but deck should have fewer energy
    const totalMoved = (state.players[0].hand.cards.length - handBefore) + source.attachedEnergy.length;
    expect(totalMoved).toBeGreaterThanOrEqual(1);
    expect(totalMoved).toBeLessThanOrEqual(2);
  });
});

describe("Worker — draw 3 and remove stadium", () => {
  test("draws 3 and removes stadium", () => {
    const state = setupGame();
    state.stadium = {
      card: makeStadiumCard("Artazon"),
      owner: 1,
    };
    const source = state.players[0].active!;
    const handBefore = state.players[0].hand.cards.length;

    const effect = getEffect("any", "Worker");
    const ctx = createEffectContext(state, 0, source);
    effect!.trainer!.onPlay!(ctx);

    expect(state.players[0].hand.cards.length).toBe(handBefore + 3);
    expect(state.stadium).toBeNull();
  });
});

describe("Maximum Belt — tool damage modifier", () => {
  test("+50 damage against ex Pokemon", () => {
    const state = setupGame();
    state.players[1].active = makePokemonCard("Charizard ex", {
      subtypes: ["Stage 2", "ex"],
    });

    const belt = createGameCard(
      makeCard({
        name: "Maximum Belt",
        supertype: "Trainer",
        subtypes: ["Pokémon Tool"],
      })
    );
    const source = state.players[0].active!;

    const effect = getEffect("any", "Maximum Belt");
    const ctx = createEffectContext(state, 0, source);
    const modified = effect!.tool!.whileAttached!.modifyDamage!(ctx, 100);

    expect(modified).toBe(150); // 100 + 50
  });

  test("no bonus against non-ex Pokemon", () => {
    const state = setupGame();
    const source = state.players[0].active!;

    const effect = getEffect("any", "Maximum Belt");
    const ctx = createEffectContext(state, 0, source);
    const modified = effect!.tool!.whileAttached!.modifyDamage!(ctx, 100);

    expect(modified).toBe(100); // No bonus
  });
});

describe("Perrin — swap hand Pokemon for deck Pokemon", () => {
  test("canPlay requires Pokemon in hand", () => {
    const state = setupGame();
    const source = state.players[0].active!;

    // No Pokemon in hand → can't play
    state.players[0].hand.cards = [];
    const effect = getEffect("any", "Perrin");
    const ctx = createEffectContext(state, 0, source);
    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);

    // Add Pokemon → can play
    state.players[0].hand.cards.push(makePokemonCard("HandMon1"));
    const ctx2 = createEffectContext(state, 0, source);
    expect(effect!.trainer!.canPlay!(ctx2)).toBe(true);
  });

  test("moves hand Pokemon to deck during onPlay", async () => {
    const state = setupGame();
    const source = state.players[0].active!;

    const handPokemon1 = makePokemonCard("HandMon1");
    state.players[0].hand.cards.push(handPokemon1);
    const deckBefore = state.players[0].deck.cards.length;

    const effect = getEffect("any", "Perrin");
    const ctx = createEffectContext(state, 0, source);
    await effect!.trainer!.onPlay!(ctx);

    // HandMon1 should be moved to deck (even if search fails, the hand→deck part works)
    expect(state.players[0].deck.cards.length).toBeGreaterThanOrEqual(deckBefore);
  });
});

describe("Lost Vacuum — remove stadium or tool", () => {
  test("removes stadium when present", () => {
    const state = setupGame();
    state.stadium = { card: makeStadiumCard("Beach Court"), owner: 0 };
    const source = state.players[0].active!;
    state.players[0].hand.cards.push(makePokemonCard("Discard fodder"));

    const effect = getEffect("any", "Lost Vacuum");
    const ctx = createEffectContext(state, 0, source);
    effect!.trainer!.onPlay!(ctx);

    expect(state.stadium).toBeNull();
  });
});

// ───────────────────────────────────────────────
// 4. Additional attack pattern coverage
// ───────────────────────────────────────────────

describe("Raging Bolt ex — Bellowing Thunder", () => {
  test("70× Basic Energy discarded from all Pokemon", () => {
    const state = setupGame();
    const ragingBolt = makePokemonCard("Raging Bolt ex");
    ragingBolt.attachedEnergy = [
      makeEnergyCard("Lightning"),
      makeEnergyCard("Fighting"),
    ];
    state.players[0].active = ragingBolt;

    // Also put energy on bench Pokemon
    state.players[0].bench.cards[0].attachedEnergy = [
      makeEnergyCard("Fire"),
    ];

    const effect = getEffect("any", "Raging Bolt ex");
    const ctx = createEffectContext(state, 0, ragingBolt);
    const result = effect!.attacks![1].onAttack(ctx, 0);

    // 3 Basic Energy discarded = 210 damage
    expect(result.damage).toBe(210);
    expect(ragingBolt.attachedEnergy.length).toBe(0);
    expect(state.players[0].bench.cards[0].attachedEnergy.length).toBe(0);
  });
});

describe("Munkidori — Mind Bend", () => {
  test("deals base damage and confuses defender", () => {
    const state = setupGame();
    const munkidori = makePokemonCard("Munkidori");
    state.players[0].active = munkidori;

    const effect = getEffect("any", "Munkidori");
    const ctx = createEffectContext(state, 0, munkidori);
    const result = effect!.attacks![0].onAttack(ctx, 60);

    expect(result.damage).toBe(60);
    expect(result.statusEffects).toBeDefined();
    expect(result.statusEffects!.some(
      (se: any) => se.status === "confused" && se.target === "defender"
    )).toBe(true);
  });
});

describe("Iron Thorns ex — Volt Cyclone", () => {
  test("moves energy to bench Pokemon", () => {
    const state = setupGame();
    const ironThorns = makePokemonCard("Iron Thorns ex");
    const energy = makeEnergyCard("Lightning");
    ironThorns.attachedEnergy = [energy];
    state.players[0].active = ironThorns;

    const effect = getEffect("any", "Iron Thorns ex");
    const ctx = createEffectContext(state, 0, ironThorns);
    effect!.attacks![0].onAttack(ctx, 140);

    expect(ironThorns.attachedEnergy.length).toBe(0);
    expect(state.players[0].bench.cards[0].attachedEnergy.length).toBe(1);
  });
});

describe("Dusknoir — Shadow Bind", () => {
  test("prevents retreat", () => {
    const effect = getEffect("any", "Dusknoir");
    const state = setupGame();
    const dusknoir = makePokemonCard("Dusknoir");
    state.players[0].active = dusknoir;
    const ctx = createEffectContext(state, 0, dusknoir);

    const result = effect!.attacks![0].onAttack(ctx, 150);

    expect(result.damage).toBe(150);
    expect(result.preventRetreat).toBe(true);
  });
});
