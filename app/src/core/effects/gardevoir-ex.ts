import { getCard } from "../cards";
import { registerAbility, registerEffectStep } from "../effects";
import {
  findInPlay,
  logEvent,
  replaceInPlay,
  setMarker,
  setPlayer,
} from "./helpers";
import type { GameState, PlayerIndex } from "../state";
import type { PromptResponse } from "../actions";

// Psychic Embrace — as often as you like, attach a Basic Psychic Energy from
// discard to one of your Psychic Pokémon, putting 2 damage counters (20 damage)
// on it.
//
// In v0 we simplify: attach to ACTIVE if it's Psychic; otherwise to first
// Psychic on bench. Each call attaches one and applies 20 damage.

registerAbility("svi-86", "Psychic Embrace", (state, player, sourceUid) => {
  const ps = state.players[player];
  const found = findInPlay(ps, sourceUid);
  if (!found) throw new Error(`Gardevoir ex ${sourceUid} not in play`);

  const psyEnergy = ps.discard.find((c) => c.cardId === "sve-5");
  if (!psyEnergy) throw new Error(`No Basic Psychic Energy in discard`);

  const allMine = [
    ...(ps.active ? [ps.active] : []),
    ...ps.bench.filter((b): b is NonNullable<typeof b> => b !== null),
  ];
  const targets = allMine.filter((c) => {
    const d = getCard(c.cardId);
    return d.kind === "Pokemon" && d.types.includes("Psychic");
  });
  if (targets.length === 0) throw new Error("No Psychic Pokémon in play");

  const target = targets[0];
  const updated = {
    ...target,
    attachedEnergy: [...target.attachedEnergy, psyEnergy],
    damage: target.damage + 20,
  };
  const psUpd = {
    ...ps,
    discard: ps.discard.filter((c) => c.uid !== psyEnergy.uid),
  };
  const psFinal = replaceInPlay(psUpd, target.uid, updated);
  let next = setPlayer(state, player, psFinal);
  next = logEvent(next, "PsychicEmbrace", {
    player,
    targetUid: target.uid,
    energyId: psyEnergy.cardId,
  });
  return next;
});

// =====================================================================
// Gallade (asr-62) — Premonition ability
// "Once during your turn, you may look at the top 5 cards of your deck and
// put them back in any order."
//
// v0 simplification: emit a confirm prompt that reveals the top-5 cardIds.
// No actual reordering (UI for re-ordering is post-v0). Marks ability used.
// =====================================================================
const PREMONITION_EFFECT = "asr-62:premonition";

registerAbility("asr-62", "Premonition", (state, player, sourceUid) => {
  const ps = state.players[player];
  const found = findInPlay(ps, sourceUid);
  if (!found) throw new Error(`Gallade ${sourceUid} not in play`);
  if (found.card.markers["abilityUsedThisTurn"] === true) {
    throw new Error("Premonition already used this turn");
  }
  if (ps.deck.length === 0) {
    throw new Error("Deck is empty");
  }

  const top5 = ps.deck.slice(0, 5).map((c) => getCard(c.cardId).name);
  const message = `Premonition — 牌组前 ${top5.length} 张: ${top5.join(" / ")}`;
  return {
    ...state,
    pendingPrompt: { kind: "confirm", player, message },
    pendingEffect: { effectId: PREMONITION_EFFECT, player, sourceUid },
  };
});

registerEffectStep(PREMONITION_EFFECT, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "confirm") {
    throw new Error("Premonition expects confirm");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player as PlayerIndex;
  const sourceUid = eff.sourceUid as string;

  let next: GameState = { ...state, pendingPrompt: null, pendingEffect: null };
  // Mark ability used
  const ps = next.players[player];
  const found = findInPlay(ps, sourceUid);
  if (found) {
    const marked = setMarker(found.card, "abilityUsedThisTurn", true);
    const updPlayer = replaceInPlay(ps, sourceUid, marked);
    next = setPlayer(next, player, updPlayer);
  }
  return logEvent(next, "Premonition", { player });
});
