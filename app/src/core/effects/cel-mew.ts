import { registerAttackEffect } from "../effects";
import { makeRng } from "../rng";
import { applyStatus, logEvent, setPlayer } from "./helpers";
import type { PlayerIndex } from "../state";

// =====================================================================
// Mew (cel-11) — Psy Bolt [Psychic, Colorless] 30
// "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed."
//
// v0 simplification: deterministic flip from rngState (no UI prompt for
// the flip; result shown in event log). Not all decks have Psychic energy
// so this often won't fire — the implementation is for completeness.
// =====================================================================

registerAttackEffect("cel-11", 0, (state, attacker, base) => {
  const seed = (state.rngState + 0xc0f1ec71) >>> 0;
  const heads = makeRng(seed)() < 0.5;
  let next = { ...state, rngState: seed };

  if (heads) {
    const opp = (1 - attacker) as PlayerIndex;
    const oppPs = next.players[opp];
    if (oppPs.active) {
      const paralyzed = applyStatus(oppPs.active, "paralyzed");
      next = setPlayer(next, opp, { ...oppPs, active: paralyzed });
      next = logEvent(next, "PsyBoltParalyze", { player: attacker, coin: "heads" });
    }
  } else {
    next = logEvent(next, "PsyBoltMiss", { player: attacker, coin: "tails" });
  }

  return { state: next, damage: base };
});
