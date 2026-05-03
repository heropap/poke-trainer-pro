import { autoSetup, findCardInHandByCardId, reducer } from "../reducer";
import type { GameState } from "../state";

const SEED = 7;

function setupAndStartTurn(): GameState {
  let s = autoSetup(SEED, "charizard-ex", "miraidon-ex", 0);
  // First turn: just start it (draw + main phase ready)
  s = reducer(s, { type: "StartTurn" });
  return s;
}

function endTurnAndStartOpponent(s: GameState): GameState {
  let next = reducer(s, { type: "EndTurn", player: s.activePlayer });
  next = reducer(next, { type: "StartTurn" });
  return next;
}

describe("StartTurn / EndTurn", () => {
  it("StartTurn draws 1 card and moves to main phase", () => {
    let s = autoSetup(SEED, "charizard-ex", "miraidon-ex");
    const before = s.players[0].hand.length;
    const beforeDeck = s.players[0].deck.length;
    s = reducer(s, { type: "StartTurn" });
    expect(s.phase).toBe("main");
    expect(s.players[0].hand.length).toBe(before + 1);
    expect(s.players[0].deck.length).toBe(beforeDeck - 1);
  });

  it("EndTurn switches active player and increments turn number", () => {
    let s = setupAndStartTurn();
    expect(s.activePlayer).toBe(0);
    expect(s.turnNumber).toBe(1);
    s = reducer(s, { type: "EndTurn", player: 0 });
    expect(s.activePlayer).toBe(1);
    expect(s.turnNumber).toBe(2);
    expect(s.phase).toBe("draw");
  });

  it("Player can't end turn from inactive position", () => {
    const s = setupAndStartTurn();
    expect(() => reducer(s, { type: "EndTurn", player: 1 })).toThrow();
  });
});

describe("PlayBasicPokemon", () => {
  it("places a Basic from hand onto an empty bench slot", () => {
    let s = setupAndStartTurn();
    // Find a Basic Pokemon in hand
    const ps = s.players[0];
    const basic = ps.hand.find((c) => {
      // Pidgey or Mew (basics in Charizard deck)
      return c.cardId === "obf-162" || c.cardId === "cel-11" || c.cardId === "obf-26";
    });

    if (!basic) {
      // skip: occasionally hand has no extra basic
      return;
    }

    const emptySlot = ps.bench.findIndex((b) => b === null);
    if (emptySlot < 0) return;

    s = reducer(s, {
      type: "PlayBasicPokemon",
      player: 0,
      uid: basic.uid,
      benchSlot: emptySlot,
    });

    expect(s.players[0].bench[emptySlot]).not.toBeNull();
    expect(s.players[0].bench[emptySlot]?.cardId).toBe(basic.cardId);
    expect(s.players[0].hand.find((c) => c.uid === basic.uid)).toBeUndefined();
  });

  it("rejects non-basic into bench", () => {
    let s = setupAndStartTurn();
    // Find a Stage 1 in hand if present
    const charmeleon = findCardInHandByCardId(s.players[0], "obf-27");
    if (!charmeleon) return;
    expect(() =>
      reducer(s, {
        type: "PlayBasicPokemon",
        player: 0,
        uid: charmeleon.uid,
        benchSlot: 0,
      }),
    ).toThrow(/not a Basic/);
  });
});

describe("AttachEnergy", () => {
  it("attaches a Basic Energy from hand to active and sets the per-turn lock", () => {
    let s = setupAndStartTurn();
    const fireEnergy = findCardInHandByCardId(s.players[0], "sve-2");
    if (!fireEnergy) return;
    const active = s.players[0].active!;
    s = reducer(s, {
      type: "AttachEnergy",
      player: 0,
      uid: fireEnergy.uid,
      targetUid: active.uid,
    });
    expect(s.players[0].active!.attachedEnergy.length).toBe(1);
    expect(s.players[0].hasAttachedEnergy).toBe(true);

    // Second attach should fail
    const energy2 = findCardInHandByCardId(s.players[0], "sve-2");
    if (energy2) {
      expect(() =>
        reducer(s, {
          type: "AttachEnergy",
          player: 0,
          uid: energy2.uid,
          targetUid: active.uid,
        }),
      ).toThrow(/already attached/);
    }
  });
});

describe("Evolve", () => {
  it("forbids evolution on first turn", () => {
    let s = setupAndStartTurn();
    const charmeleon = findCardInHandByCardId(s.players[0], "obf-27");
    if (!charmeleon) return;
    const benchedBasic = s.players[0].active;
    if (!benchedBasic) return;
    expect(() =>
      reducer(s, {
        type: "Evolve",
        player: 0,
        uid: charmeleon.uid,
        targetUid: benchedBasic.uid,
      }),
    ).toThrow(/first turn/);
  });
});

describe("PlaySupporter / PlayItem", () => {
  it("forbids supporter on first turn", () => {
    let s = setupAndStartTurn();
    const profResearch = findCardInHandByCardId(s.players[0], "svi-190");
    if (!profResearch) return;
    expect(() =>
      reducer(s, {
        type: "PlaySupporter",
        player: 0,
        uid: profResearch.uid,
      }),
    ).toThrow(/first turn/);
  });

  it("plays an Item without supporter restriction", () => {
    let s = setupAndStartTurn();
    const ultraBall = findCardInHandByCardId(s.players[0], "svi-196");
    if (!ultraBall) return;
    s = reducer(s, { type: "PlayItem", player: 0, uid: ultraBall.uid });
    expect(s.players[0].hand.find((c) => c.uid === ultraBall.uid)).toBeUndefined();
    expect(s.players[0].discard.find((c) => c.uid === ultraBall.uid)).toBeDefined();
  });

  it("Iono on player 1's turn still works (after turn 1)", () => {
    let s = setupAndStartTurn();
    s = endTurnAndStartOpponent(s);
    // Now player 1 (miraidon) is active, turn 2
    expect(s.activePlayer).toBe(1);
    expect(s.turnNumber).toBe(2);
    const iono = findCardInHandByCardId(s.players[1], "pal-185");
    if (!iono) return;
    s = reducer(s, { type: "PlaySupporter", player: 1, uid: iono.uid });
    expect(s.players[1].hasPlayedSupporter).toBe(true);
  });
});

describe("Retreat", () => {
  it("requires correct retreat cost", () => {
    let s = setupAndStartTurn();
    // Active is some Basic with retreat cost. Try retreating without paying — must fail.
    const benchIdx = s.players[0].bench.findIndex((b) => b !== null);
    if (benchIdx < 0) return;
    expect(() =>
      reducer(s, {
        type: "Retreat",
        player: 0,
        benchSlot: benchIdx,
        payEnergyUids: [],
      }),
    ).toThrow(/cost/);
  });
});

describe("Effect dispatch infrastructure", () => {
  it("Items without registered effects are still consumed", () => {
    let s = setupAndStartTurn();
    const nestBall = findCardInHandByCardId(s.players[0], "svi-181");
    if (!nestBall) return;
    s = reducer(s, { type: "PlayItem", player: 0, uid: nestBall.uid });
    expect(s.players[0].discard.some((c) => c.cardId === "svi-181")).toBe(true);
  });
});
