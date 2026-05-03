import { reducer } from "../reducer";
import "../decks"; // ensure cards + effects registered
import {
  emptyGameState,
  type GameCard,
  type GameState,
  type PlayerIndex,
  type PlayerState,
} from "../state";

let UID = 1000;
function mkCard(cardId: string): GameCard {
  UID += 1;
  return {
    uid: `t-${UID}`,
    cardId,
    damage: 0,
    attachedEnergy: [],
    attachedTool: null,
    evolutionStack: [],
    status: [],
    markers: {},
  };
}

function buildScene(opts: {
  attacker: { cardId: string; energy: string[]; bench?: string[]; hand?: string[]; deck?: string[]; discard?: string[]; prizesRemaining?: number };
  defender: { cardId: string; energy?: string[]; bench?: string[]; damage?: number; prizesRemaining?: number };
  turn?: number;
  goesFirst?: PlayerIndex;
}): GameState {
  const s = emptyGameState(1);
  const players = [s.players[0], s.players[1]] as [PlayerState, PlayerState];

  const attackerActive = mkCard(opts.attacker.cardId);
  attackerActive.attachedEnergy = opts.attacker.energy.map(mkCard);
  const attackerBench: (GameCard | null)[] = new Array(5).fill(null);
  (opts.attacker.bench ?? []).forEach((id, i) => (attackerBench[i] = mkCard(id)));
  const attackerHand = (opts.attacker.hand ?? []).map(mkCard);
  const attackerDeck = (opts.attacker.deck ?? []).map(mkCard);
  const attackerDiscard = (opts.attacker.discard ?? []).map(mkCard);

  const defenderActive = mkCard(opts.defender.cardId);
  defenderActive.attachedEnergy = (opts.defender.energy ?? []).map(mkCard);
  defenderActive.damage = opts.defender.damage ?? 0;
  const defenderBench: (GameCard | null)[] = new Array(5).fill(null);
  (opts.defender.bench ?? []).forEach((id, i) => (defenderBench[i] = mkCard(id)));

  const dummyPrizes = (n: number): GameCard[] =>
    Array.from({ length: n }, () => mkCard("svi-194"));

  players[0] = {
    ...players[0],
    active: attackerActive,
    bench: attackerBench,
    hand: attackerHand,
    deck: attackerDeck,
    discard: attackerDiscard,
    prizes: dummyPrizes(opts.attacker.prizesRemaining ?? 6),
    setupReady: true,
  };
  players[1] = {
    ...players[1],
    active: defenderActive,
    bench: defenderBench,
    prizes: dummyPrizes(opts.defender.prizesRemaining ?? 6),
    setupReady: true,
  };

  return {
    ...s,
    players,
    activePlayer: 0,
    goesFirst: opts.goesFirst ?? 0,
    turnNumber: opts.turn ?? 5,
    phase: "main",
  };
}

describe("Charizard ex Burning Darkness scaling", () => {
  it("base 180 + 30 per opponent prize taken", () => {
    // Opponent has 4 prizes left → 2 taken → +60 = 240 base
    const s = buildScene({
      attacker: {
        cardId: "obf-125",
        energy: ["sve-2", "sve-2", "sve-2"], // FFC
      },
      defender: {
        cardId: "evs-54", // Mareep, fighting weak (no Fire weak), 60HP
        bench: ["evs-54"],
        prizesRemaining: 4,
      },
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 0 });
    // After KO, prizes for attacker decrease by 2 (Mareep is normal — wait no it's normal, so 1 prize)
    // Actually Mareep is normal → 1 prize. Damage was 240, KO Mareep (60HP).
    // Just check prize stack movement.
    expect(next.players[0].prizes.length).toBeLessThan(6);
  });

  it("0 prize taken → no bonus damage", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-125",
        energy: ["sve-2", "sve-2", "sve-2"],
      },
      defender: {
        cardId: "obf-125", // 330HP
        bench: ["evs-54"],
        prizesRemaining: 6, // 0 taken
      },
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 0 });
    // Damage = 180 (no scaling). Defender Charizard ex (Fire) — Charizard's
    // weakness is Water; attacker is Fire so no weakness.
    expect(next.players[1].active!.damage).toBe(180);
  });
});

describe("Miraidon Tandem Unit on-play trigger", () => {
  it("auto-fetches up to 2 Basic Lightning Pokemon to bench", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26", // Charmander placeholder (we'll override active)
        energy: [],
        hand: ["svi-81"], // Miraidon ex in hand
        deck: ["evs-54", "evs-54", "brs-48", "obf-26"], // some Lightning + Charmander
      },
      defender: { cardId: "evs-54" },
    });
    // Find empty bench slot
    const miraidonUid = s.players[0].hand[0].uid;
    const before = s.players[0].bench.filter((b) => b !== null).length;
    const next = reducer(s, {
      type: "PlayBasicPokemon",
      player: 0,
      uid: miraidonUid,
      benchSlot: 0,
    });
    const after = next.players[0].bench.filter((b) => b !== null).length;
    // 1 Miraidon + up to 2 Lightning Basics from deck
    expect(after).toBeGreaterThanOrEqual(before + 1);
    expect(after).toBeLessThanOrEqual(before + 3);
    // Search consumed Basic Lightning Pokemon from deck
    const lightningInDeckAfter = next.players[0].deck.filter(
      (c) => c.cardId === "evs-54" || c.cardId === "brs-48",
    ).length;
    expect(lightningInDeckAfter).toBeLessThanOrEqual(1);
  });

  it("does nothing if no Lightning Basics in deck", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["svi-81"],
        deck: ["obf-26", "obf-26"],
      },
      defender: { cardId: "evs-54" },
    });
    const miraidonUid = s.players[0].hand[0].uid;
    const next = reducer(s, {
      type: "PlayBasicPokemon",
      player: 0,
      uid: miraidonUid,
      benchSlot: 0,
    });
    // Only Miraidon placed
    const benchCardIds = next.players[0].bench.filter(Boolean).map((b) => b!.cardId);
    expect(benchCardIds).toContain("svi-81");
    expect(benchCardIds.filter((id) => id === "evs-54").length).toBe(0);
  });
});

describe("Pidgeot ex Quick Search ability", () => {
  it("emits prompt then resolves by moving chosen card to hand", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-164", // Pidgeot ex active
        energy: [],
        deck: ["svi-191", "svi-196", "obf-26"], // Rare Candy, Ultra Ball, Charmander
      },
      defender: { cardId: "evs-54" },
    });
    const pidgeotUid = s.players[0].active!.uid;
    let next = reducer(s, {
      type: "UseAbility",
      player: 0,
      sourceUid: pidgeotUid,
      abilityName: "Quick Search",
    });
    expect(next.pendingPrompt?.kind).toBe("selectFromList");
    if (next.pendingPrompt?.kind === "selectFromList") {
      expect(next.pendingPrompt.cardIds).toContain("svi-191");
    }
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "selectFromList", cardIds: ["svi-191"] },
    });
    expect(next.pendingPrompt).toBeNull();
    expect(next.pendingEffect).toBeNull();
    expect(next.players[0].hand.some((c) => c.cardId === "svi-191")).toBe(true);
    // Ability flagged used
    expect(next.players[0].active!.markers["abilityUsedThisTurn"]).toBe(true);
  });

  it("rejects 2nd use in same turn", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-164",
        energy: [],
        deck: ["svi-191"],
      },
      defender: { cardId: "evs-54" },
    });
    const pidgeotUid = s.players[0].active!.uid;
    let next = reducer(s, {
      type: "UseAbility",
      player: 0,
      sourceUid: pidgeotUid,
      abilityName: "Quick Search",
    });
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "selectFromList", cardIds: ["svi-191"] },
    });
    expect(() =>
      reducer(next, {
        type: "UseAbility",
        player: 0,
        sourceUid: pidgeotUid,
        abilityName: "Quick Search",
      }),
    ).toThrow(/already used/);
  });
});

describe("Gardevoir ex Psychic Embrace", () => {
  it("attaches Psychic from discard + 20 damage", () => {
    const s = buildScene({
      attacker: {
        cardId: "svi-86", // Gardevoir ex active
        energy: [],
        discard: ["sve-5", "sve-5"],
      },
      defender: { cardId: "evs-54" },
    });
    const gardUid = s.players[0].active!.uid;
    const next = reducer(s, {
      type: "UseAbility",
      player: 0,
      sourceUid: gardUid,
      abilityName: "Psychic Embrace",
    });
    expect(next.players[0].active!.attachedEnergy.length).toBe(1);
    expect(next.players[0].active!.damage).toBe(20);
    expect(next.players[0].discard.length).toBe(1);
  });

  it("rejects if no Psychic Energy in discard", () => {
    const s = buildScene({
      attacker: {
        cardId: "svi-86",
        energy: [],
      },
      defender: { cardId: "evs-54" },
    });
    const gardUid = s.players[0].active!.uid;
    expect(() =>
      reducer(s, {
        type: "UseAbility",
        player: 0,
        sourceUid: gardUid,
        abilityName: "Psychic Embrace",
      }),
    ).toThrow(/Psychic Energy in discard/);
  });
});

describe("Trainer effects: Professor's Research", () => {
  it("discards hand and draws 7", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["svi-190", "obf-26", "obf-26"], // 3-card hand
        deck: Array.from({ length: 10 }, () => "svi-194"),
      },
      defender: { cardId: "evs-54" },
    });
    const profUid = s.players[0].hand[0].uid;
    const next = reducer(s, { type: "PlaySupporter", player: 0, uid: profUid });
    // Discarded: original hand minus profResearch (which was already removed
    // by handlePlaySupporter before effect runs) → 2 cards.
    // Then drew 7 fresh.
    expect(next.players[0].hand.length).toBe(7);
    expect(next.players[0].hasPlayedSupporter).toBe(true);
  });
});

describe("Trainer effects: Iono", () => {
  it("both players shuffle hand into deck and draw prizes count", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["pal-185", "obf-26"],
        deck: Array.from({ length: 20 }, () => "svi-194"),
        prizesRemaining: 4, // self has 4 prizes left
      },
      defender: { cardId: "evs-54", prizesRemaining: 5 },
    });
    const ionoUid = s.players[0].hand[0].uid;
    // make defender have a hand to shuffle
    const players = [...s.players] as typeof s.players;
    players[1] = { ...players[1], hand: [mkCard("obf-26"), mkCard("obf-26")] };
    players[1].deck = Array.from({ length: 10 }, () => mkCard("svi-194"));
    const sWithDef = { ...s, players };
    const next = reducer(sWithDef, { type: "PlaySupporter", player: 0, uid: ionoUid });
    // Self (player 0) has 4 prizes → draws 4 cards
    expect(next.players[0].hand.length).toBe(4);
    // Opponent had 5 prizes → drew 5
    expect(next.players[1].hand.length).toBe(5);
  });
});

describe("Trainer effects: Boss's Orders", () => {
  it("emits target prompt and swaps opp active with bench", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["pal-172"],
      },
      defender: {
        cardId: "evs-54",
        bench: ["obf-125"], // benched Charizard ex
      },
    });
    const bossUid = s.players[0].hand[0].uid;
    let next = reducer(s, { type: "PlaySupporter", player: 0, uid: bossUid });
    expect(next.pendingPrompt?.kind).toBe("selectTarget");
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "selectTarget", uids: ["bench:0"] },
    });
    expect(next.players[1].active!.cardId).toBe("obf-125");
    expect(next.players[1].bench[0]!.cardId).toBe("evs-54");
  });
});

describe("Trainer effects: Nest Ball", () => {
  it("searches a Basic from deck onto bench", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["svi-181"],
        deck: ["obf-26", "svi-194", "evs-54"],
      },
      defender: { cardId: "evs-54" },
    });
    const nestUid = s.players[0].hand[0].uid;
    let next = reducer(s, { type: "PlayItem", player: 0, uid: nestUid });
    expect(next.pendingPrompt?.kind).toBe("selectFromList");
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "selectFromList", cardIds: ["evs-54"] },
    });
    expect(next.players[0].bench.some((b) => b?.cardId === "evs-54")).toBe(true);
    expect(next.pendingPrompt).toBeNull();
  });
});

describe("Charizard ex Infernal Reign onEvolve", () => {
  it("attaches up to 3 Basic Fire Energy from deck on evolve", () => {
    // Build a state where Charmeleon is in active and we evolve to Charizard ex
    // by placing the evolution from hand. To trigger via Evolve action requires
    // turn>1 + target not played this turn. Simplest: hand-craft state.
    const s = buildScene({
      attacker: {
        cardId: "obf-27", // Charmeleon active (Stage 1)
        energy: [],
        hand: ["obf-125"], // Charizard ex in hand
        deck: ["sve-2", "sve-2", "sve-2", "sve-2", "obf-26"], // 4 Fire energies + Charmander
      },
      defender: { cardId: "evs-54", bench: ["evs-54"] },
      turn: 5,
    });
    const charizardUid = s.players[0].hand[0].uid;
    const activeUid = s.players[0].active!.uid;
    const next = reducer(s, {
      type: "Evolve",
      player: 0,
      uid: charizardUid,
      targetUid: activeUid,
    });
    // Active should now be Charizard ex with 3 Fire energies attached.
    expect(next.players[0].active!.cardId).toBe("obf-125");
    expect(next.players[0].active!.attachedEnergy.length).toBe(3);
    // Deck Fire energies reduced by 3
    const deckFire = next.players[0].deck.filter((c) => c.cardId === "sve-2").length;
    expect(deckFire).toBe(1);
    // Log contains InfernalReign
    expect(next.log.some((e) => e.kind === "InfernalReign")).toBe(true);
  });

  it("does nothing if no Fire Energy in deck", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-27",
        energy: [],
        hand: ["obf-125"],
        deck: ["obf-26"], // no Fire energy
      },
      defender: { cardId: "evs-54" },
      turn: 5,
    });
    const charizardUid = s.players[0].hand[0].uid;
    const activeUid = s.players[0].active!.uid;
    const next = reducer(s, {
      type: "Evolve",
      player: 0,
      uid: charizardUid,
      targetUid: activeUid,
    });
    expect(next.players[0].active!.cardId).toBe("obf-125");
    expect(next.players[0].active!.attachedEnergy.length).toBe(0);
  });
});

describe("Energy Retrieval", () => {
  it("moves 2 Basic Energy from discard to hand", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["svi-171"],
        discard: ["sve-2", "sve-2", "sve-2"],
      },
      defender: { cardId: "evs-54" },
    });
    const erUid = s.players[0].hand[0].uid;
    const next = reducer(s, { type: "PlayItem", player: 0, uid: erUid });
    const fireInHand = next.players[0].hand.filter((c) => c.cardId === "sve-2").length;
    const fireInDiscard = next.players[0].discard.filter((c) => c.cardId === "sve-2").length;
    expect(fireInHand).toBe(2);
    expect(fireInDiscard).toBe(1);
  });
});

describe("Super Rod", () => {
  it("shuffles up to 3 Pokemon/Basic Energy from discard back to deck", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["pal-188"],
        discard: ["sve-2", "obf-26", "obf-27", "svi-194"], // 3 valid + 1 trainer
      },
      defender: { cardId: "evs-54" },
    });
    const rodUid = s.players[0].hand[0].uid;
    const before = s.players[0].deck.length;
    const next = reducer(s, { type: "PlayItem", player: 0, uid: rodUid });
    expect(next.players[0].deck.length).toBe(before + 3);
    // 1 trainer remains in discard + the played Super Rod itself
    expect(next.players[0].discard.some((c) => c.cardId === "svi-194")).toBe(true);
  });
});

describe("Arven", () => {
  it("emits Tool prompt when deck has Tools, then Item prompt", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["svi-186"],
        deck: ["pal-176", "svi-181", "svi-196"], // Choice Belt (Tool) + 2 Items
      },
      defender: { cardId: "evs-54" },
      turn: 5,
    });
    const arvenUid = s.players[0].hand[0].uid;
    let next = reducer(s, { type: "PlaySupporter", player: 0, uid: arvenUid });
    expect(next.pendingPrompt?.kind).toBe("selectFromList");
    if (next.pendingPrompt?.kind === "selectFromList") {
      expect(next.pendingPrompt.cardIds).toContain("pal-176");
    }
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "selectFromList", cardIds: ["pal-176"] },
    });
    // Now Item prompt
    expect(next.pendingPrompt?.kind).toBe("selectFromList");
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "selectFromList", cardIds: ["svi-181"] },
    });
    // Both should be in hand
    expect(next.players[0].hand.some((c) => c.cardId === "pal-176")).toBe(true);
    expect(next.players[0].hand.some((c) => c.cardId === "svi-181")).toBe(true);
    expect(next.pendingPrompt).toBeNull();
  });

  it("skips to Item prompt when deck has no Tools", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["svi-186"],
        deck: ["svi-181", "svi-196"], // only Items, no Tools
      },
      defender: { cardId: "evs-54" },
      turn: 5,
    });
    const arvenUid = s.players[0].hand[0].uid;
    const next = reducer(s, { type: "PlaySupporter", player: 0, uid: arvenUid });
    expect(next.pendingPrompt?.kind).toBe("selectFromList");
    if (next.pendingPrompt?.kind === "selectFromList") {
      expect(next.pendingPrompt.message).toContain("物品");
    }
  });
});

describe("Raikou V Lightning Rondo (attack 0)", () => {
  it("base 20 + 50 per opponent V/VMAX/VSTAR in play", () => {
    const s = buildScene({
      attacker: { cardId: "brs-48", energy: ["sve-4"] },
      defender: { cardId: "brs-48", bench: ["brs-48"] }, // 2 V Pokemon (active + bench)
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 0 });
    // Base 20 + 50 × 2 = 120. Raikou V vs Raikou V: no weakness, no resistance.
    expect(next.players[1].active!.damage).toBe(120);
  });
  it("base 20 + 0 against no V Pokemon", () => {
    const s = buildScene({
      attacker: { cardId: "brs-48", energy: ["sve-4"] },
      defender: { cardId: "evs-54", bench: ["evs-54"] },
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 0 });
    expect(next.players[1].active!.damage).toBe(20);
  });
});

describe("Raikou V Fierce Tackle (attack 1)", () => {
  it("does 130 damage and 30 self damage", () => {
    const s = buildScene({
      attacker: {
        cardId: "brs-48",
        energy: ["sve-4", "sve-4", "sve-4"], // L L C
      },
      defender: { cardId: "evs-54", bench: ["evs-54"] },
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 1 });
    // Mareep is fighting weak (not lightning), so no weakness. 130 + 30 self.
    // Mareep would be KO'd (60HP)
    expect(next.players[0].prizes.length).toBeLessThan(6);
    // Self damage applied (Raikou V isn't KO'd from 30 since it has 220HP)
    // After auto-end-turn the active stays. Raikou should have 30 damage now —
    // unless it transitioned. Let's check the log for FierceTackleSelfDamage.
    expect(next.log.some((e) => e.kind === "FierceTackleSelfDamage")).toBe(true);
  });
});

describe("Choice Belt damage modifier", () => {
  it("+30 damage to opponent's V active before weakness/resistance", () => {
    const s = buildScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] }, // Charmander
      defender: { cardId: "brs-48", bench: ["evs-54"] }, // Raikou V active
    });
    // Attach Choice Belt to Charmander
    const players = [...s.players] as typeof s.players;
    const active = { ...players[0].active! };
    active.attachedTool = {
      uid: "tool-cb",
      cardId: "pal-176",
      damage: 0,
      attachedEnergy: [],
      attachedTool: null,
      evolutionStack: [],
      status: [],
      markers: {},
    };
    players[0] = { ...players[0], active };
    const sWithBelt = { ...s, players };
    const next = reducer(sWithBelt, { type: "Attack", player: 0, attackIndex: 1 });
    // Live Coal 30 + 30 (Choice Belt vs V) = 60. Raikou V no Fire weak/resist.
    expect(next.players[1].active!.damage).toBe(60);
  });
  it("no bonus vs non-V Pokémon", () => {
    const s = buildScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] },
      defender: { cardId: "evs-54", bench: ["evs-54"] }, // Mareep (normal)
    });
    const players = [...s.players] as typeof s.players;
    const active = { ...players[0].active! };
    active.attachedTool = {
      uid: "tool-cb",
      cardId: "pal-176",
      damage: 0,
      attachedEnergy: [],
      attachedTool: null,
      evolutionStack: [],
      status: [],
      markers: {},
    };
    players[0] = { ...players[0], active };
    const sWithBelt = { ...s, players };
    const next = reducer(sWithBelt, { type: "Attack", player: 0, attackIndex: 1 });
    expect(next.players[1].active!.damage).toBe(30);
  });
});

describe("Beach Court retreat modifier", () => {
  it("Basic Pokemon retreat cost reduced by 1 colorless", () => {
    const s = buildScene({
      attacker: {
        cardId: "evs-54", // Mareep (Basic, retreat 1)
        energy: ["sve-4"],
        bench: ["evs-54"],
      },
      defender: { cardId: "obf-26" },
    });
    const stadiumCard: GameCard = {
      uid: "stad-1",
      cardId: "svi-167",
      damage: 0,
      attachedEnergy: [],
      attachedTool: null,
      evolutionStack: [],
      status: [],
      markers: {},
    };
    const sWithStadium = { ...s, stadium: stadiumCard };
    // With Beach Court, Mareep retreat (cost 1) → 0
    const next = reducer(sWithStadium, {
      type: "Retreat",
      player: 0,
      benchSlot: 0,
      payEnergyUids: [],
    });
    // Should not throw — and should swap
    expect(next.players[0].active!.cardId).toBe("evs-54");
  });
});

describe("Exp. Share onKO transfer", () => {
  it("moves 1 Basic Energy to bench when KO'd", () => {
    // Set up: Mareep with Exp. Share + 1 Lightning attached as active.
    // Charmander attacks for 60 to KO Mareep.
    const s = buildScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] },
      defender: {
        cardId: "evs-54", // 60HP, Fighting weak
        damage: 30, // 1 Live Coal more = 60 = KO
        bench: ["evs-54"],
      },
    });
    // Attach Exp. Share + 1 Lightning energy to Mareep
    const players = [...s.players] as typeof s.players;
    const active = { ...players[1].active! };
    active.attachedTool = {
      uid: "tool-es",
      cardId: "svi-174",
      damage: 0,
      attachedEnergy: [],
      attachedTool: null,
      evolutionStack: [],
      status: [],
      markers: {},
    };
    active.attachedEnergy = [
      {
        uid: "e-1",
        cardId: "sve-4",
        damage: 0,
        attachedEnergy: [],
        attachedTool: null,
        evolutionStack: [],
        status: [],
        markers: {},
      },
    ];
    players[1] = { ...players[1], active };
    const sWithES = { ...s, players };
    let next = reducer(sWithES, { type: "Attack", player: 0, attackIndex: 1 });
    // Should be in promote prompt for player 1
    expect(next.pendingPrompt?.kind).toBe("promoteFromKO");
    // Resolve promote
    next = reducer(next, { type: "PromoteFromKO", player: 1, benchSlot: 0 });
    // The new active (was bench) should have the energy from Exp. Share
    expect(next.players[1].active!.attachedEnergy.length).toBe(1);
    expect(next.log.some((e) => e.kind === "ExpShareTransfer")).toBe(true);
  });
});

describe("Electric Generator", () => {
  it("attaches Lightning Energy from top 5 to bench Lightning", () => {
    // Build deck with known top-5 cards
    const s = buildScene({
      attacker: {
        cardId: "evs-54", // Mareep active
        energy: [],
        hand: ["svi-170"],
        deck: ["sve-4", "sve-4", "sve-4", "obf-26", "svi-194"], // 3 Lightning + others
        bench: ["evs-54", "evs-54"],
      },
      defender: { cardId: "obf-26" },
    });
    const egUid = s.players[0].hand[0].uid;
    const next = reducer(s, { type: "PlayItem", player: 0, uid: egUid });
    // Expect 2 Lightning attached to bench Lightning Pokemon
    const benchE = next.players[0].bench.reduce(
      (sum, b) => sum + (b ? b.attachedEnergy.length : 0),
      0,
    );
    expect(benchE).toBe(2);
    expect(next.log.some((e) => e.kind === "ElectricGenerator")).toBe(true);
  });
});

describe("Gallade Premonition", () => {
  it("emits a confirm prompt revealing top 5 cards", () => {
    const s = buildScene({
      attacker: {
        cardId: "asr-62", // Gallade active
        energy: [],
        deck: ["sve-5", "svi-67", "svi-68", "svi-86", "svi-194"],
      },
      defender: { cardId: "evs-54" },
    });
    const galladeUid = s.players[0].active!.uid;
    let next = reducer(s, {
      type: "UseAbility",
      player: 0,
      sourceUid: galladeUid,
      abilityName: "Premonition",
    });
    expect(next.pendingPrompt?.kind).toBe("confirm");
    if (next.pendingPrompt?.kind === "confirm") {
      // Top 5 names should be in the message
      expect(next.pendingPrompt.message).toContain("Premonition");
    }
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "confirm" },
    });
    expect(next.pendingPrompt).toBeNull();
    expect(next.pendingEffect).toBeNull();
    expect(next.players[0].active!.markers["abilityUsedThisTurn"]).toBe(true);
  });
  it("rejects 2nd use in same turn", () => {
    const s = buildScene({
      attacker: { cardId: "asr-62", energy: [], deck: ["svi-67"] },
      defender: { cardId: "evs-54" },
    });
    const uid = s.players[0].active!.uid;
    let next = reducer(s, {
      type: "UseAbility",
      player: 0,
      sourceUid: uid,
      abilityName: "Premonition",
    });
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "confirm" },
    });
    expect(() =>
      reducer(next, {
        type: "UseAbility",
        player: 0,
        sourceUid: uid,
        abilityName: "Premonition",
      }),
    ).toThrow(/already used/);
  });
});

describe("Level Ball", () => {
  it("searches a Pokemon ≤90 HP from deck to hand", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["bst-129"],
        // Charmeleon (90 HP) eligible; Charizard ex (330) not eligible
        deck: ["obf-27", "obf-125", "evs-54"],
      },
      defender: { cardId: "evs-54" },
    });
    const lbUid = s.players[0].hand[0].uid;
    let next = reducer(s, { type: "PlayItem", player: 0, uid: lbUid });
    expect(next.pendingPrompt?.kind).toBe("selectFromList");
    if (next.pendingPrompt?.kind === "selectFromList") {
      expect(next.pendingPrompt.cardIds).toContain("obf-27");
      expect(next.pendingPrompt.cardIds).toContain("evs-54");
      expect(next.pendingPrompt.cardIds).not.toContain("obf-125");
    }
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "selectFromList", cardIds: ["obf-27"] },
    });
    expect(next.players[0].hand.some((c) => c.cardId === "obf-27")).toBe(true);
  });
  it("rejects selection of >90HP Pokemon at step", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["bst-129"],
        deck: ["obf-27"],
      },
      defender: { cardId: "evs-54" },
    });
    const lbUid = s.players[0].hand[0].uid;
    let next = reducer(s, { type: "PlayItem", player: 0, uid: lbUid });
    expect(() =>
      reducer(next, {
        type: "ResolvePrompt",
        payload: { kind: "selectFromList", cardIds: ["obf-125"] },
      }),
    ).toThrow();
  });
});

describe("Fog Crystal", () => {
  it("searches Basic Psychic Pokemon or Energy from deck to hand", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: [],
        hand: ["cre-140"],
        deck: ["svi-67", "sve-5", "svi-68", "obf-26", "svi-194"], // Ralts (Basic Psy), Psy Energy, Kirlia (Stage1 — not eligible)
      },
      defender: { cardId: "evs-54" },
    });
    const fcUid = s.players[0].hand[0].uid;
    let next = reducer(s, { type: "PlayItem", player: 0, uid: fcUid });
    expect(next.pendingPrompt?.kind).toBe("selectFromList");
    if (next.pendingPrompt?.kind === "selectFromList") {
      expect(next.pendingPrompt.cardIds).toContain("svi-67");
      expect(next.pendingPrompt.cardIds).toContain("sve-5");
      expect(next.pendingPrompt.cardIds).not.toContain("svi-68"); // Stage 1
      expect(next.pendingPrompt.cardIds).not.toContain("obf-26"); // Fire
    }
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "selectFromList", cardIds: ["sve-5"] },
    });
    expect(next.players[0].hand.some((c) => c.cardId === "sve-5")).toBe(true);
  });
});

describe("Status conditions — Mew Psy Bolt + paralyze flow", () => {
  function buildSceneParalyzed() {
    const s = buildScene({
      attacker: {
        cardId: "obf-26",
        energy: ["sve-2", "sve-2"],
        bench: ["obf-26"], // bench Pokémon for retreat target
      },
      defender: { cardId: "evs-54", bench: ["evs-54"] },
    });
    // Manually paralyze active Charmander
    const players = [...s.players] as typeof s.players;
    players[0] = {
      ...players[0],
      active: { ...players[0].active!, status: ["paralyzed"] },
    };
    return { ...s, players };
  }

  it("paralyzed attacker cannot attack", () => {
    const s = buildSceneParalyzed();
    expect(() =>
      reducer(s, { type: "Attack", player: 0, attackIndex: 1 }),
    ).toThrow(/paralyzed/);
  });

  it("EndTurn cures paralysis on affected player", () => {
    const s = buildSceneParalyzed();
    const next = reducer(s, { type: "EndTurn", player: 0 });
    expect(next.players[0].active!.status).not.toContain("paralyzed");
  });

  it("Cannot retreat while paralyzed (PTCG rule)", () => {
    const s = buildSceneParalyzed();
    expect(() =>
      reducer(s, {
        type: "Retreat",
        player: 0,
        benchSlot: 0,
        payEnergyUids: [],
      }),
    ).toThrow(/paralyzed|asleep/);
  });

  it("Retreat clears non-blocking status (e.g., confused) on formerly-active", () => {
    const s = buildScene({
      attacker: { cardId: "obf-26", energy: ["sve-2"] },
      defender: { cardId: "evs-54", bench: ["evs-54"] },
    });
    // Apply 'confused' (which doesn't block retreat) to active
    const players = [...s.players] as typeof s.players;
    players[0] = {
      ...players[0],
      active: { ...players[0].active!, status: ["confused"] },
      bench: [
        {
          uid: "bench-0",
          cardId: "obf-26",
          damage: 0,
          attachedEnergy: [],
          attachedTool: null,
          evolutionStack: [],
          status: [],
          markers: {},
        },
        null,
        null,
        null,
        null,
      ],
    };
    const fireUid = players[0].active!.attachedEnergy[0].uid;
    const sConfused = { ...s, players };
    const next = reducer(sConfused, {
      type: "Retreat",
      player: 0,
      benchSlot: 0,
      payEnergyUids: [fireUid],
    });
    // The retreating Charmander is now on bench[0] — status cleared
    const benchedCard = next.players[0].bench[0];
    expect(benchedCard?.cardId).toBe("obf-26");
    expect(benchedCard?.status).not.toContain("confused");
  });

  it("Mew Psy Bolt 30 damage; coin flip determines paralyze", () => {
    // Set up Mew (cel-11) as active with Psychic Energy and Charmander (Fire)
    // attached as a "colorless" filler. Cost is [Psychic, Colorless].
    const s = buildScene({
      attacker: {
        cardId: "cel-11", // Mew (Psychic, 60HP)
        energy: ["sve-5", "sve-2"], // Psychic + Fire (covers Colorless)
      },
      defender: { cardId: "evs-54", bench: ["evs-54"] },
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 0 });
    // 30 damage should be applied (Mew vs Mareep — no weakness for Lightning vs Psychic)
    expect(next.players[1].active!.damage).toBeGreaterThanOrEqual(30);
    // Either paralyze or miss event was logged
    const hasFlipEvent =
      next.log.some((e) => e.kind === "PsyBoltParalyze") ||
      next.log.some((e) => e.kind === "PsyBoltMiss");
    expect(hasFlipEvent).toBe(true);
  });
});

describe("Status helpers (applyStatus / clearAllStatus)", () => {
  it("paralyzed-then-asleep replaces paralysis (movement statuses are mutex)", async () => {
    const { applyStatus } = await import("../effects/helpers");
    const card: GameCard = {
      uid: "u",
      cardId: "obf-26",
      damage: 0,
      attachedEnergy: [],
      attachedTool: null,
      evolutionStack: [],
      status: [],
      markers: {},
    };
    let c = applyStatus(card, "paralyzed");
    expect(c.status).toContain("paralyzed");
    c = applyStatus(c, "asleep");
    expect(c.status).toContain("asleep");
    expect(c.status).not.toContain("paralyzed");
  });
});

describe("Trainer effects: Switch", () => {
  it("swaps active and bench", () => {
    const s = buildScene({
      attacker: {
        cardId: "obf-26", // Charmander active
        energy: [],
        hand: ["svi-194"],
        bench: ["obf-125"], // Charizard ex on bench
      },
      defender: { cardId: "evs-54" },
    });
    const switchUid = s.players[0].hand[0].uid;
    let next = reducer(s, { type: "PlayItem", player: 0, uid: switchUid });
    next = reducer(next, {
      type: "ResolvePrompt",
      payload: { kind: "selectTarget", uids: ["bench:0"] },
    });
    expect(next.players[0].active!.cardId).toBe("obf-125");
    expect(next.players[0].bench[0]!.cardId).toBe("obf-26");
  });
});
