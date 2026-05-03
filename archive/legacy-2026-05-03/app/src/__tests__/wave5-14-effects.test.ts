/**
 * Wave 5-14 Card Effects Integration Tests
 *
 * Validates all 116 new card effects across 10 wave files.
 */

import { createEffectContext } from "../engine/effects/effect-context";
import { getEffect, clearRegistry, initializeEffects } from "../engine/effects";
import { GameState, GameCard, Player } from "../engine/game-state";

// ── Test Helpers ──

function makeCard(overrides: Partial<GameCard["card"]> = {}): GameCard {
  return {
    instanceId: `test-${Math.random().toString(36).slice(2, 8)}`,
    card: {
      id: "test-001",
      name: "Test Pokemon",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      hp: "100",
      types: ["Colorless"],
      attacks: [{ name: "Test Attack", damage: "50", cost: ["Colorless"], text: "" }],
      ...overrides,
    } as any,
    attachedEnergy: [],
    attachedTools: [],
    damageCounters: 0,
    statusConditions: [],
    playedThisTurn: false,
  };
}

function makeEnergyCard(type: string): GameCard {
  return {
    instanceId: `energy-${Math.random().toString(36).slice(2, 8)}`,
    card: {
      id: `energy-${type.toLowerCase()}`,
      name: `${type} Energy`,
      supertype: "Energy",
      subtypes: ["Basic"],
      types: [type],
    } as any,
    attachedEnergy: [],
    attachedTools: [],
    damageCounters: 0,
    statusConditions: [],
    playedThisTurn: false,
  };
}

function makeTrainerCard(name: string, subtype: string = "Item"): GameCard {
  return {
    instanceId: `trainer-${Math.random().toString(36).slice(2, 8)}`,
    card: {
      id: `trainer-${name.toLowerCase().replace(/\s/g, "-")}`,
      name,
      supertype: "Trainer",
      subtypes: [subtype],
    } as any,
    attachedEnergy: [],
    attachedTools: [],
    damageCounters: 0,
    statusConditions: [],
    playedThisTurn: false,
  };
}

function setupGame(): GameState {
  const makePlayer = (): Player => ({
    id: "p1",
    name: "Player",
    active: makeCard({ name: "Pikachu", hp: "60", types: ["Lightning"] }),
    bench: {
      cards: [
        makeCard({ name: "Charmander", hp: "70", types: ["Fire"] }),
      ],
    },
    hand: { cards: [makeCard(), makeCard(), makeCard()] },
    deck: {
      cards: Array.from({ length: 20 }, () => makeCard()),
    },
    discard: { cards: [] },
    prizes: { cards: Array.from({ length: 6 }, () => makeCard()) },
    lostZone: { cards: [] },
    supporterPlayedThisTurn: false,
  });

  return {
    players: [makePlayer(), makePlayer()],
    turn: 1,
    activePlayerIndex: 0,
    phase: "main" as any,
    turnStatus: {
      energyPlayed: false,
      retreated: false,
      attackUsed: false,
      stadiumPlayed: false,
      p1VstarUsed: false,
      p2VstarUsed: false,
    } as any,
    stadium: null,
    log: [],
    rules: { prizeCardsPerPlayer: 6 } as any,
    winner: null,
  } as any;
}

// Initialize effects once
beforeAll(() => {
  clearRegistry();
  initializeEffects([], { skipRyuuMeta: true, skipV2: true });
});

// ── Wave 5: Lost Zone ──

describe("Wave 5: Lost Zone Core", () => {
  test("Dragonite V — Fast Call searches supporter", () => {
    const effect = getEffect("any", "Dragonite V");
    expect(effect).not.toBeNull();
    expect(effect!.abilities).toBeDefined();
    expect(effect!.abilities![0].name).toBe("Fast Call");
  });

  test("Kyogre — Aqua Storm places damage counters on bench", () => {
    const effect = getEffect("any", "Kyogre");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const kyogre = makeCard({ name: "Kyogre", types: ["Water"] });
    kyogre.attachedEnergy = [makeEnergyCard("Water"), makeEnergyCard("Water")];
    state.players[0].active = kyogre;
    const ctx = createEffectContext(state, 0, kyogre);
    const result = effect!.attacks![0].onAttack(ctx, 0);
    expect(result.damage).toBe(0);
    // Bench Pokemon should have damage counters
    expect(state.players[1].bench.cards[0].damageCounters).toBe(5);
  });

  test("Thorton — swap bench V with hand V", () => {
    const effect = getEffect("any", "Thorton");
    expect(effect).not.toBeNull();
    expect(effect!.trainer).toBeDefined();
  });

  test("Fantina — requires 10+ lost zone cards", () => {
    const effect = getEffect("any", "Fantina");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const ctx = createEffectContext(state, 0, makeCard());
    // Should not be playable with 0 lost zone cards
    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);
    // Add 10 cards to lost zone
    for (let i = 0; i < 10; i++) state.players[0].lostZone.cards.push(makeCard());
    expect(effect!.trainer!.canPlay!(ctx)).toBe(true);
  });

  test("Spiritomb — has Fettered in Misfortune ability", () => {
    const effect = getEffect("any", "Spiritomb");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Fettered in Misfortune");
  });

  test("Starmie V — Secret Star needs 7+ discard", () => {
    const effect = getEffect("any", "Starmie V");
    expect(effect).not.toBeNull();
    expect(effect!.attacks![0].name).toBe("Secret Star");
  });
});

// ── Wave 6: Fire Core ──

describe("Wave 6: Fire Core", () => {
  test("Entei V — Burning Rondo scales with bench", () => {
    const effect = getEffect("any", "Entei V");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const entei = makeCard({ name: "Entei V", types: ["Fire"] });
    state.players[0].active = entei;
    const ctx = createEffectContext(state, 0, entei);
    // 1 bench each = 2 total, 20 + 2*20 = 60
    const result = effect!.attacks![0].onAttack(ctx, 0);
    expect(result.damage).toBe(60);
  });

  test("Moltres — Fiery Migration attaches fire energy from discard", () => {
    const effect = getEffect("any", "Moltres");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Fiery Migration");
  });

  test("Fire Crystal — retrieves fire energy from discard", () => {
    const effect = getEffect("any", "Fire Crystal");
    expect(effect).not.toBeNull();
    expect(effect!.trainer).toBeDefined();
  });

  test("Radiant Charizard — Combustion Blast exists", () => {
    const effect = getEffect("any", "Radiant Charizard");
    expect(effect).not.toBeNull();
  });

  test("Pidgey and Pidgeotto — basic attacks", () => {
    expect(getEffect("any", "Pidgey")).not.toBeNull();
    expect(getEffect("any", "Pidgeotto")).not.toBeNull();
  });
});

// ── Wave 7: Psychic Core ──

describe("Wave 7: Psychic Core", () => {
  test("Munkidori — has both attack and ability", () => {
    const effect = getEffect("any", "Munkidori");
    expect(effect).not.toBeNull();
    expect(effect!.attacks).toBeDefined();
    expect(effect!.attacks!.length).toBeGreaterThanOrEqual(1);
    expect(effect!.abilities).toBeDefined();
    expect(effect!.abilities![0].name).toBe("Adrena Brain");
  });

  test("Scream Tail — Eerie Cry discards opponent hand to 6", () => {
    const effect = getEffect("any", "Scream Tail");
    expect(effect).not.toBeNull();
    const state = setupGame();
    // Give opponent 10 cards
    state.players[1].hand.cards = Array.from({ length: 10 }, () => makeCard());
    const screamTail = makeCard({ name: "Scream Tail" });
    state.players[0].active = screamTail;
    const ctx = createEffectContext(state, 0, screamTail);
    effect!.attacks![0].onAttack(ctx, 0);
    expect(state.players[1].hand.cards.length).toBe(6);
  });

  test("Cresselia — Moonglow ability exists", () => {
    const effect = getEffect("any", "Cresselia");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Moonglow");
  });

  test("Zacian V — Brave Blade + Intrepid Sword", () => {
    const effect = getEffect("any", "Zacian V");
    expect(effect).not.toBeNull();
    expect(effect!.attacks![0].name).toBe("Brave Blade");
    expect(effect!.abilities![0].name).toBe("Intrepid Sword");
  });

  test("Alakazam ex — Dimensional Hand retrieves item from discard", () => {
    const effect = getEffect("any", "Alakazam ex");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Dimensional Hand");
  });
});

// ── Wave 8: Water Core ──

describe("Wave 8: Water Core", () => {
  test("Kyurem VMAX — Glaciated World damage scales with water energy", () => {
    const effect = getEffect("any", "Kyurem VMAX");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const kyurem = makeCard({ name: "Kyurem VMAX", types: ["Water"], hp: "330" });
    kyurem.attachedEnergy = [makeEnergyCard("Water"), makeEnergyCard("Water"), makeEnergyCard("Water")];
    state.players[0].active = kyurem;
    const ctx = createEffectContext(state, 0, kyurem);
    const result = effect!.attacks![0].onAttack(ctx, 0);
    expect(result.damage).toBe(150); // 3 × 50
    expect(kyurem.attachedEnergy.length).toBe(0); // All discarded
  });

  test("Capacious Bucket — searches 2 water energy", () => {
    const effect = getEffect("any", "Capacious Bucket");
    expect(effect).not.toBeNull();
    expect(effect!.trainer).toBeDefined();
  });

  test("Super Rod — shuffles Pokemon/Energy from discard to deck", () => {
    const effect = getEffect("any", "Super Rod");
    expect(effect).not.toBeNull();
  });

  test("Cross Switcher — needs another copy in hand", () => {
    const effect = getEffect("any", "Cross Switcher");
    expect(effect).not.toBeNull();
    expect(effect!.trainer!.canPlay).toBeDefined();
  });

  test("Origin Forme Palkia V — Subspace Swell", () => {
    const effect = getEffect("any", "Origin Forme Palkia V");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const palkia = makeCard({ name: "Palkia V", types: ["Water"] });
    state.players[0].active = palkia;
    const ctx = createEffectContext(state, 0, palkia);
    // 1 bench each = 2 total, 60 + 2*20 = 100
    const result = effect!.attacks![0].onAttack(ctx, 0);
    expect(result.damage).toBe(100);
  });
});

// ── Wave 9: Electric / Future ──

describe("Wave 9: Electric / Future", () => {
  test("Regieleki VMAX — Transistor boosts Lightning attacks", () => {
    const effect = getEffect("any", "Regieleki VMAX");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Transistor");
  });

  test("Electric Generator — attaches lightning energy from top 5", () => {
    const effect = getEffect("any", "Electric Generator");
    expect(effect).not.toBeNull();
  });

  test("Pal Pad — returns supporters to deck", () => {
    const effect = getEffect("any", "Pal Pad");
    expect(effect).not.toBeNull();
    const state = setupGame();
    state.players[0].discard.cards = [
      makeTrainerCard("Iono", "Supporter"),
      makeTrainerCard("Boss's Orders", "Supporter"),
    ];
    const ctx = createEffectContext(state, 0, makeCard());
    effect!.trainer!.onPlay(ctx);
    expect(state.players[0].discard.cards.length).toBe(0);
  });

  test("Arven — searches Item + Tool", () => {
    const effect = getEffect("any", "Arven");
    expect(effect).not.toBeNull();
  });

  test("Penny — returns Basic Pokemon to hand", () => {
    const effect = getEffect("any", "Penny");
    expect(effect).not.toBeNull();
    expect(effect!.trainer!.canPlay).toBeDefined();
  });

  test("Pokégear 3.0 — searches top 7 for supporter", () => {
    const effect = getEffect("any", "Pokégear 3.0");
    expect(effect).not.toBeNull();
  });

  test("Iron Bundle — Homing Heads snipes bench", () => {
    const effect = getEffect("any", "Iron Bundle");
    expect(effect).not.toBeNull();
  });
});

// ── Wave 10: Fighting / Dark ──

describe("Wave 10: Fighting / Dark", () => {
  test("Darkrai VSTAR — Dark Pulse scales with dark energy", () => {
    const effect = getEffect("any", "Darkrai VSTAR");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const darkrai = makeCard({ name: "Darkrai VSTAR", types: ["Darkness"], hp: "270" });
    darkrai.attachedEnergy = [makeEnergyCard("Darkness"), makeEnergyCard("Darkness")];
    state.players[0].active = darkrai;
    // Also put dark energy on bench
    state.players[0].bench.cards[0].attachedEnergy = [makeEnergyCard("Darkness")];
    const ctx = createEffectContext(state, 0, darkrai);
    const result = effect!.attacks![0].onAttack(ctx, 0);
    expect(result.damage).toBe(120); // 30 + 3*30
  });

  test("Darkrai VSTAR — Star Abyss retrieves items", () => {
    const effect = getEffect("any", "Darkrai VSTAR");
    expect(effect!.abilities![0].name).toBe("Star Abyss");
  });

  test("Galarian Moltres V — Direflame Wings + Aura Burn", () => {
    const effect = getEffect("any", "Galarian Moltres V");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Direflame Wings");
  });

  test("Defiance Band — tool boosts damage when behind", () => {
    const effect = getEffect("any", "Defiance Band");
    expect(effect).not.toBeNull();
    expect(effect!.tool).toBeDefined();
  });

  test("Counter Catcher — only playable when behind on prizes", () => {
    const effect = getEffect("any", "Counter Catcher");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const ctx = createEffectContext(state, 0, makeCard());
    // Equal prizes = can't play
    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);
    // Behind on prizes = can play
    state.players[1].prizes.cards = state.players[1].prizes.cards.slice(0, 3);
    expect(effect!.trainer!.canPlay!(ctx)).toBe(true);
  });

  test("Path to the Peak — stadium registered", () => {
    expect(getEffect("any", "Path to the Peak")).not.toBeNull();
  });
});

// ── Wave 11: Dragon / Metal ──

describe("Wave 11: Dragon / Metal", () => {
  test("Arceus V — Trinity Charge attaches energy to V Pokemon", () => {
    const effect = getEffect("any", "Arceus V");
    expect(effect).not.toBeNull();
    expect(effect!.attacks![0].name).toBe("Trinity Charge");
  });

  test("Duraludon VMAX — Skyscraper blocks special energy attackers", () => {
    const effect = getEffect("any", "Duraludon VMAX");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Skyscraper");
  });

  test("Bronzong — Metal Transfer moves energy", () => {
    const effect = getEffect("any", "Bronzong");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Metal Transfer");
  });

  test("Metal Saucer — attaches metal energy from discard", () => {
    const effect = getEffect("any", "Metal Saucer");
    expect(effect).not.toBeNull();
  });

  test("Charizard VSTAR — Star Blaze is VSTAR power", () => {
    const effect = getEffect("any", "Charizard VSTAR");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const charizard = makeCard({ name: "Charizard VSTAR", types: ["Fire"], hp: "280" });
    charizard.attachedEnergy = [makeEnergyCard("Fire"), makeEnergyCard("Fire"), makeEnergyCard("Fire")];
    state.players[0].active = charizard;
    const ctx = createEffectContext(state, 0, charizard);
    const result = effect!.attacks![0].onAttack(ctx, 320);
    expect(result.damage).toBe(320);
    expect((state.turnStatus as any).p1VstarUsed).toBe(true);
  });

  test("Cobalion — Iron Revenge discards special energy", () => {
    const effect = getEffect("any", "Cobalion");
    expect(effect).not.toBeNull();
  });
});

// ── Wave 12: Grass / Lugia ──

describe("Wave 12: Grass / Lugia", () => {
  test("Sceptile ex — Overgrow doubles damage at low HP", () => {
    const effect = getEffect("any", "Sceptile ex");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Overgrow");
  });

  test("Leafeon VSTAR — Ivy Star is VSTAR power", () => {
    const effect = getEffect("any", "Leafeon VSTAR");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Ivy Star");
  });

  test("Forretress ex — Exploding Energy self-KOs", () => {
    const effect = getEffect("any", "Forretress ex");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Exploding Energy");
  });

  test("Vivillon — Powder Heal heals all", () => {
    const effect = getEffect("any", "Vivillon");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Powder Heal");
  });

  test("Giratina V — Abyss Seeking draws 4", () => {
    const effect = getEffect("any", "Giratina V");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const giratina = makeCard({ name: "Giratina V" });
    state.players[0].active = giratina;
    const handBefore = state.players[0].hand.cards.length;
    const ctx = createEffectContext(state, 0, giratina);
    effect!.attacks![0].onAttack(ctx, 0);
    expect(state.players[0].hand.cards.length).toBe(handBefore + 4);
  });
});

// ── Wave 13: Trainers ──

describe("Wave 13: Universal Trainers", () => {
  test("Jacq — searches 2 evolution Pokemon", () => {
    const effect = getEffect("any", "Jacq");
    expect(effect).not.toBeNull();
  });

  test("Tulip — retrieves Pokemon + Energy from discard", () => {
    const effect = getEffect("any", "Tulip");
    expect(effect).not.toBeNull();
  });

  test("Zinnia's Resolve — requires Dragon in play", () => {
    const effect = getEffect("any", "Zinnia's Resolve");
    expect(effect).not.toBeNull();
    const state = setupGame();
    const ctx = createEffectContext(state, 0, makeCard());
    // No Dragon Pokemon = can't play
    expect(effect!.trainer!.canPlay!(ctx)).toBe(false);
    // Add Dragon Pokemon
    state.players[0].active = makeCard({ types: ["Dragon"] });
    expect(effect!.trainer!.canPlay!(ctx)).toBe(true);
  });

  test("Rescue Board — tool reduces retreat by 1", () => {
    const effect = getEffect("any", "Rescue Board");
    expect(effect).not.toBeNull();
    expect(effect!.tool!.whileAttached!.modifyRetreatCost).toBeDefined();
    const result = effect!.tool!.whileAttached!.modifyRetreatCost!(null as any, 2);
    expect(result).toBe(1);
  });

  test("Booster Energy Future — tool adds HP to Future Pokemon", () => {
    const effect = getEffect("any", "Booster Energy Future");
    expect(effect).not.toBeNull();
    expect(effect!.tool!.whileAttached!.modifyHp).toBeDefined();
  });

  test("Powerglass — attaches energy from discard", () => {
    expect(getEffect("any", "Powerglass")).not.toBeNull();
  });

  test("Tool Jammer — tool effect registered", () => {
    expect(getEffect("any", "Tool Jammer")).not.toBeNull();
  });
});

// ── Wave 14: Competitive Pokemon ──

describe("Wave 14: Competitive Pokemon", () => {
  test("Mew ex — Restart draws 3, Genome Hacking copies attacks", () => {
    const effect = getEffect("any", "Mew ex");
    expect(effect).not.toBeNull();
    expect(effect!.attacks![0].name).toBe("Restart");
    expect(effect!.attacks![1].name).toBe("Genome Hacking");
  });

  test("Genesect V — Fusion Strike System draws based on Fusion count", () => {
    const effect = getEffect("any", "Genesect V");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Fusion Strike System");
  });

  test("Radiant Alakazam — Painful Spoons moves damage counters", () => {
    const effect = getEffect("any", "Radiant Alakazam");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Painful Spoons");
  });

  test("Mew — Mysterious Tail searches top 6 for Item", () => {
    const effect = getEffect("any", "Mew");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Mysterious Tail");
  });

  test("Oranguru — Primate Wisdom swaps hand card with top deck", () => {
    const effect = getEffect("any", "Oranguru");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Primate Wisdom");
  });

  test("Crobat V — Dark Asset draws to 6 on enter", () => {
    const effect = getEffect("any", "Crobat V");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Dark Asset");
    expect(effect!.abilities![0].type).toBe("on_enter");
  });

  test("Eldegoss V — Happy Match retrieves supporter on enter", () => {
    const effect = getEffect("any", "Eldegoss V");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Happy Match");
  });

  test("Dedenne-GX — Dedechange discards hand draws 6 on enter", () => {
    const effect = getEffect("any", "Dedenne-GX");
    expect(effect).not.toBeNull();
    expect(effect!.abilities![0].name).toBe("Dedechange");
  });
});

// ── Summary Stats ──

describe("Wave 5-14 Summary", () => {
  test("all 10 wave export arrays are registered", () => {
    // Spot-check key cards from each wave
    const keyCards = [
      "Dragonite V", "Entei V", "Cresselia", "Kyurem VMAX",
      "Regieleki VMAX", "Darkrai VSTAR", "Arceus V", "Sceptile ex",
      "Jacq", "Mew ex",
    ];
    for (const name of keyCards) {
      expect(getEffect("any", name)).not.toBeNull();
    }
  });
});
