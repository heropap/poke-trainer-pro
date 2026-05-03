import { getCard } from "../cards";
import { registerAbility } from "../effects";
import {
  findInPlay,
  logEvent,
  replaceInPlay,
  setPlayer,
} from "./helpers";

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
