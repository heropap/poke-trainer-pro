import { registerAttackEffect, registerOnEvolve } from "../effects";
import { findInPlay, logEvent, setPlayer, shuffleDeck } from "./helpers";
import type { GameCard, GameState, PlayerIndex } from "../state";

// Burning Darkness — base 180 + 30 per Prize the opponent has taken.
// "Opponent has taken X prizes" = 6 - opponent.prizes.length.
//
// attackIndex 0 is the only attack on Charizard ex.
registerAttackEffect("obf-125", 0, (state: GameState, attacker: PlayerIndex, base: number) => {
  const opponent = (1 - attacker) as PlayerIndex;
  const taken = 6 - state.players[opponent].prizes.length;
  return { state, damage: base + 30 * taken };
});

// Infernal Reign — when you play Charizard ex from hand to evolve, search your
// deck for up to 3 Basic Fire Energy and attach them to your Pokémon in any way.
//
// v0 simplification: auto-attach all 3 to the just-evolved Charizard ex.
// (Real PTCG lets you split — UI-driven distribution is post-v0.)
registerOnEvolve("obf-125", (state, player, sourceUid) => {
  let next = state;
  const ps = next.players[player];

  const fireEnergyInDeck: GameCard[] = ps.deck.filter((c) => c.cardId === "sve-2");
  const take = fireEnergyInDeck.slice(0, 3);
  if (take.length === 0) return next;

  // Remove these from deck.
  const takeUids = new Set(take.map((c) => c.uid));
  const newDeck = ps.deck.filter((c) => !takeUids.has(c.uid));

  // Locate Charizard ex in play and attach all taken energies.
  const found = findInPlay({ ...ps, deck: newDeck }, sourceUid);
  if (!found) return next;
  const updatedTarget: GameCard = {
    ...found.card,
    attachedEnergy: [...found.card.attachedEnergy, ...take],
  };

  let psUpd = { ...ps, deck: newDeck };
  if (found.zone === "active") {
    psUpd = { ...psUpd, active: updatedTarget };
  } else if (found.zone === "bench" && typeof found.benchSlot === "number") {
    const newBench = [...psUpd.bench];
    newBench[found.benchSlot] = updatedTarget;
    psUpd = { ...psUpd, bench: newBench };
  }

  next = setPlayer(next, player, psUpd);
  next = shuffleDeck(next, player);
  next = logEvent(next, "InfernalReign", {
    player,
    energiesAttached: take.length,
    targetUid: sourceUid,
  });
  return next;
});
