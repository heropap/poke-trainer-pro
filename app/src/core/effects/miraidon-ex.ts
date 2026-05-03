import { getCard } from "../cards";
import { registerAttackEffect, registerOnPlay, registerTrainerEffect } from "../effects";
import {
  bumpRng,
  findBasicInDeck,
  logEvent,
  moveDeckToBench,
  setPlayer,
  shuffleDeck,
} from "./helpers";
import type { GameCard, GameState, PlayerIndex } from "../state";

// Tandem Unit — when Miraidon ex is played from hand to active or bench,
// search up to 2 Basic Lightning Pokemon and put them onto your bench.
//
// In v0 we auto-search the first 2 matches and place them in the first empty
// bench slots. UI version (post-F12) will use prompts.
registerOnPlay("svi-81", (state: GameState, player: PlayerIndex, _sourceUid: string) => {
  let next = state;
  const ps = next.players[player];

  // Only fire once per game per Miraidon (track via marker on the source card).
  // For v0 we naively allow re-trigger if a NEW Miraidon is played. Acceptable.
  const eligible: GameCard[] = findBasicInDeck(next, player, "Lightning").filter(
    (c) => {
      const def = getCard(c.cardId);
      // Don't auto-pull another Miraidon ex (would re-trigger and could loop in
      // weird states). Pull non-Miraidon Lightning basics.
      return def.kind === "Pokemon" && c.cardId !== "svi-81";
    },
  );

  const targets = eligible.slice(0, 2);
  for (const t of targets) {
    const emptyIdx = next.players[player].bench.findIndex((b) => b === null);
    if (emptyIdx < 0) break;
    next = moveDeckToBench(next, player, t.uid, emptyIdx);
  }

  if (targets.length > 0) {
    next = shuffleDeck(next, player);
    next = logEvent(next, "TandemUnit", { player, count: targets.length });
  }
  void ps;
  void bumpRng;
  void setPlayer;
  return next;
});

// =====================================================================
// Raikou V (brs-48)
// =====================================================================

// Lightning Rondo — base 20 + 50 per opponent's Pokémon V in play.
// "Pokémon V" = V / VMAX / VSTAR rarity.
registerAttackEffect("brs-48", 0, (state, attacker, base) => {
  const opp = state.players[(1 - attacker) as PlayerIndex];
  const isV = (c: GameCard | null): boolean => {
    if (!c) return false;
    const d = getCard(c.cardId);
    return (
      d.kind === "Pokemon" &&
      (d.rarity === "V" || d.rarity === "VMAX" || d.rarity === "VSTAR")
    );
  };
  let count = 0;
  if (isV(opp.active)) count++;
  for (const b of opp.bench) if (isV(b)) count++;
  return { state, damage: base + 50 * count };
});

// Fierce Tackle — 130 damage; this Pokémon also does 30 damage to itself.
// Implementation: damage stays at base (130); side-effect adds 30 self-damage.
registerAttackEffect("brs-48", 1, (state, attacker, base) => {
  const ps = state.players[attacker];
  if (!ps.active) return { state, damage: base };
  const updatedActive: GameCard = {
    ...ps.active,
    damage: ps.active.damage + 30,
  };
  let next = setPlayer(state, attacker, { ...ps, active: updatedActive });
  next = logEvent(next, "FierceTackleSelfDamage", { player: attacker, amount: 30 });
  return { state: next, damage: base };
});

// =====================================================================
// Electric Generator (svi-170) — Item.
// "Look at the top 5 cards of your deck. You may attach up to 2 Basic
// Lightning Energy cards you find there to your Benched Lightning Pokémon
// in any way you like. Shuffle the other cards back into your deck."
//
// v0 simplification: auto-attach the first 2 Basic Lightning Energies found
// to the first 2 Lightning bench Pokémon (or first if only one). No prompt
// for choice. Shuffle remaining.
// =====================================================================
registerTrainerEffect("svi-170", (state, player) => {
  const ps = state.players[player];
  const top5 = ps.deck.slice(0, 5);
  const lightningE: GameCard[] = top5.filter((c) => c.cardId === "sve-4").slice(0, 2);

  const lightningBench: { card: GameCard; idx: number }[] = [];
  ps.bench.forEach((b, i) => {
    if (!b) return;
    const d = getCard(b.cardId);
    if (d.kind === "Pokemon" && d.types.includes("Lightning")) {
      lightningBench.push({ card: b, idx: i });
    }
  });

  if (lightningE.length === 0 || lightningBench.length === 0) {
    // Just shuffle deck (we didn't actually pull any cards).
    let next = shuffleDeck(state, player);
    return logEvent(next, "ElectricGeneratorEmpty", {
      player,
      foundEnergy: lightningE.length,
      benchTargets: lightningBench.length,
    });
  }

  // Attach: 1 energy each to the first N bench Lightning Pokémon (round-robin).
  const newBench = [...ps.bench];
  let attached = 0;
  for (let i = 0; i < lightningE.length; i++) {
    const target = lightningBench[i % lightningBench.length];
    const cur = newBench[target.idx];
    if (!cur) continue;
    newBench[target.idx] = {
      ...cur,
      attachedEnergy: [...cur.attachedEnergy, lightningE[i]],
    };
    attached++;
  }

  // Remove attached energies from deck, then shuffle remainder.
  const attachedUids = new Set(lightningE.slice(0, attached).map((c) => c.uid));
  const newDeck = ps.deck.filter((c) => !attachedUids.has(c.uid));
  let next = setPlayer(state, player, { ...ps, deck: newDeck, bench: newBench });
  next = shuffleDeck(next, player);
  return logEvent(next, "ElectricGenerator", { player, attached });
});
