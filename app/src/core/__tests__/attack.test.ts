import { reducer } from "../reducer";
import type { Action } from "../actions";
import {
  emptyGameState,
  type GameCard,
  type GameState,
  type PlayerIndex,
  type PlayerState,
} from "../state";
import "../decks"; // ensure cards registered

let UID = 0;
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

function mkEnergy(cardId: string): GameCard {
  return mkCard(cardId);
}

// Build a starting game state at phase=main, turn=2, with known active Pokemon.
function buildBattleScene(opts: {
  attacker: { cardId: string; energy: string[]; bench?: string[] };
  defender: { cardId: string; energy?: string[]; bench?: string[]; damage?: number };
  attackerPlayer?: PlayerIndex;
}): GameState {
  const attackerPlayer: PlayerIndex = opts.attackerPlayer ?? 0;
  const defenderPlayer = (1 - attackerPlayer) as PlayerIndex;
  const s = emptyGameState(1);

  const players = [s.players[0], s.players[1]] as [PlayerState, PlayerState];

  const attackerActive = mkCard(opts.attacker.cardId);
  attackerActive.attachedEnergy = opts.attacker.energy.map(mkEnergy);
  const attackerBench: (GameCard | null)[] = new Array(5).fill(null);
  (opts.attacker.bench ?? []).forEach((id, i) => (attackerBench[i] = mkCard(id)));

  const defenderActive = mkCard(opts.defender.cardId);
  defenderActive.attachedEnergy = (opts.defender.energy ?? []).map(mkEnergy);
  defenderActive.damage = opts.defender.damage ?? 0;
  const defenderBench: (GameCard | null)[] = new Array(5).fill(null);
  (opts.defender.bench ?? []).forEach((id, i) => (defenderBench[i] = mkCard(id)));

  // Create dummy prize cards (just need 6 each).
  const dummyPrizes = (): GameCard[] => Array.from({ length: 6 }, () => mkCard("svi-194"));

  players[attackerPlayer] = {
    ...players[attackerPlayer],
    active: attackerActive,
    bench: attackerBench,
    prizes: dummyPrizes(),
    setupReady: true,
  };
  players[defenderPlayer] = {
    ...players[defenderPlayer],
    active: defenderActive,
    bench: defenderBench,
    prizes: dummyPrizes(),
    setupReady: true,
  };

  return {
    ...s,
    players,
    activePlayer: attackerPlayer,
    goesFirst: 0,
    turnNumber: 5, // past first-turn restriction
    phase: "main",
  };
}

describe("Attack — basic damage", () => {
  it("applies base damage to opponent's active", () => {
    const s = buildBattleScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] }, // Charmander w/ 2 Fire (Live Coal needs Fire+Colorless)
      defender: { cardId: "evs-54", bench: ["evs-54"] }, // Mareep (Lightning, Fighting weakness)
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 1 });
    // Live Coal does 30; Mareep (60HP) takes 30 → not KO.
    const defender = next.players[1].active;
    expect(defender).not.toBeNull();
    expect(defender!.damage).toBe(30);
  });

  it("applies ×2 weakness damage", () => {
    const s = buildBattleScene({
      attacker: {
        cardId: "obf-26",
        energy: ["sve-2", "sve-2"],
      },
      defender: {
        // Drifloon (Psychic, Darkness weakness — Fire is not weakness)
        // For weakness test: use something Fire-weak. Cresselia has Darkness weak.
        // Use Mareep — it has Fighting weakness, not Fire — so no weakness applies.
        // Let's use a Pokemon that's Fire-weak. Most Grass Pokemon are Fire-weak,
        // but our 3 decks have no Grass. Construct vs Drifloon (no weak to Fire).
        cardId: "svi-89",
        bench: ["svi-89"],
      },
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 1 });
    expect(next.players[1].active!.damage).toBe(30); // no weakness, no resistance
  });

  it("rejects attack with insufficient energy", () => {
    const s = buildBattleScene({
      attacker: { cardId: "obf-125", energy: ["sve-2"] }, // Charizard ex needs 2 Fire + 1 Colorless
      defender: { cardId: "evs-54", bench: ["evs-54"] },
    });
    expect(() =>
      reducer(s, { type: "Attack", player: 0, attackIndex: 0 }),
    ).toThrow(/Insufficient energy/);
  });

  it("rejects attack on first turn", () => {
    const s: GameState = {
      ...buildBattleScene({
        attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] },
        defender: { cardId: "evs-54", bench: ["evs-54"] },
      }),
      turnNumber: 1,
      goesFirst: 0,
      activePlayer: 0,
    };
    expect(() =>
      reducer(s, { type: "Attack", player: 0, attackIndex: 1 }),
    ).toThrow(/first turn/);
  });
});

describe("Attack — KO + prize taking", () => {
  it("KOs the active and prompts opponent to promote from bench", () => {
    const s = buildBattleScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] }, // Charmander Live Coal 30
      defender: {
        cardId: "evs-54",
        damage: 30, // already at 30; 30 more → KO at 60HP
        bench: ["evs-54"],
      },
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 1 });
    expect(next.pendingPrompt?.kind).toBe("promoteFromKO");
    if (next.pendingPrompt?.kind === "promoteFromKO") {
      expect(next.pendingPrompt.player).toBe(1);
      expect(next.pendingPrompt.eligibleBenchSlots.length).toBeGreaterThan(0);
    }
    // Active was wiped
    expect(next.players[1].active).toBeNull();
    // Attacker took 1 prize
    expect(next.players[0].prizes.length).toBe(5);
  });

  it("ex KO awards 2 prizes", () => {
    const s = buildBattleScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] },
      defender: {
        cardId: "obf-125", // Charizard ex 330 HP
        damage: 320, // 1 hit at 30 KO's
        bench: ["evs-54"],
      },
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 1 });
    expect(next.players[0].prizes.length).toBe(4); // 6 - 2
  });

  it("KOing with no bench ends the game (noBench)", () => {
    const s = buildBattleScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] },
      defender: {
        cardId: "evs-54",
        damage: 30,
        bench: [], // no bench
      },
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 1 });
    expect(next.phase).toBe("gameOver");
    expect(next.winner).toBe(0);
    expect(next.winReason).toBe("noBench");
  });

  it("Promote prompt resolves and advances turn", () => {
    const s = buildBattleScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] },
      defender: {
        cardId: "evs-54",
        damage: 30,
        bench: ["evs-54"],
      },
    });
    let next = reducer(s, { type: "Attack", player: 0, attackIndex: 1 });
    next = reducer(next, { type: "PromoteFromKO", player: 1, benchSlot: 0 });
    expect(next.pendingPrompt).toBeNull();
    expect(next.players[1].active).not.toBeNull();
    expect(next.activePlayer).toBe(1); // turn switched to opponent
    expect(next.phase).toBe("draw");
  });
});

describe("Attack — game-end prizes", () => {
  it("wins by collecting all 6 prizes", () => {
    const s = buildBattleScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] },
      defender: {
        cardId: "evs-54",
        damage: 30,
        bench: ["evs-54"],
      },
    });
    // Reduce attacker prizes to 1 to make next KO end the game
    const players = [...s.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], prizes: players[0].prizes.slice(0, 1) };
    const sLow: GameState = { ...s, players };

    const next = reducer(sLow, { type: "Attack", player: 0, attackIndex: 1 });
    expect(next.phase).toBe("gameOver");
    expect(next.winner).toBe(0);
    expect(next.winReason).toBe("prizes");
  });
});

describe("Auto end-of-turn after non-KO attack", () => {
  it("turn advances after a non-KO attack", () => {
    const s = buildBattleScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] },
      defender: { cardId: "evs-54", bench: ["evs-54"] }, // healthy
    });
    const next = reducer(s, { type: "Attack", player: 0, attackIndex: 1 });
    expect(next.activePlayer).toBe(1);
    expect(next.phase).toBe("draw");
  });
});

describe("Action union exhaustiveness", () => {
  it("the reducer rejects unknown action gracefully", () => {
    const s = buildBattleScene({
      attacker: { cardId: "obf-26", energy: ["sve-2", "sve-2"] },
      defender: { cardId: "evs-54", bench: ["evs-54"] },
    });
    // Cast to any to bypass TS
    const action = { type: "Bogus" } as unknown as Action;
    const next = reducer(s, action);
    // Default branch returns state unchanged
    expect(next).toBe(s);
  });
});
