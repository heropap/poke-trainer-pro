import type { Action, PromptResponse } from "../actions";
import type { GameState, PlayerIndex } from "../state";
import {
  findBasicInHand,
  findEnergyInHand,
  findEvolutionInHand,
  findFirstEmptyBenchSlot,
  findItemInHand,
  findStrongestActiveTarget,
  findSupporterInHand,
  findUsableAbility,
  pickBestAttack,
} from "./heuristics";

// Choose the next action for `player`. Returns null if AI has nothing to do
// (e.g., it's the opponent's turn and there's no prompt for us).
export function chooseAction(state: GameState, player: PlayerIndex): Action | null {
  // 1) Pending prompt — respond if it's our prompt.
  if (state.pendingPrompt) {
    if (state.pendingPrompt.player !== player) return null;
    return respondToPrompt(state, player);
  }

  if (state.phase === "gameOver") return null;
  if (state.phase === "draw" && state.activePlayer === player) {
    return { type: "StartTurn" };
  }
  if (state.phase !== "main") return null;
  if (state.activePlayer !== player) return null;

  return chooseMainAction(state, player);
}

function respondToPrompt(state: GameState, player: PlayerIndex): Action {
  const p = state.pendingPrompt!;
  switch (p.kind) {
    case "selectActiveSetup":
      return {
        type: "ResolvePrompt",
        payload: { kind: "selectActiveSetup", uid: p.eligibleUids[0] },
      };
    case "selectBenchSetup":
      return {
        type: "ResolvePrompt",
        payload: {
          kind: "selectBenchSetup",
          uids: p.eligibleUids.slice(0, p.maxCount),
        },
      };
    case "promoteFromKO":
      return {
        type: "ResolvePrompt",
        payload: {
          kind: "promoteFromKO",
          benchSlot: p.eligibleBenchSlots[0],
        },
      };
    case "selectFromList":
      return {
        type: "ResolvePrompt",
        payload: {
          kind: "selectFromList",
          cardIds: p.cardIds.slice(0, p.minCount),
        },
      };
    case "selectTarget":
      return {
        type: "ResolvePrompt",
        payload: {
          kind: "selectTarget",
          uids: p.eligibleUids.slice(0, p.minCount),
        },
      };
    case "coinFlip":
      return {
        type: "ResolvePrompt",
        payload: {
          kind: "coinFlip",
          results: new Array(p.count).fill(true),
        },
      };
    case "confirm":
      return { type: "ResolvePrompt", payload: { kind: "confirm" } };
    case "chooseOption":
      return {
        type: "ResolvePrompt",
        payload: { kind: "chooseOption", choice: 0 },
      };
    default: {
      const _exhaustive: never = p;
      void _exhaustive;
      return { type: "Concede", player };
    }
  }
}

function chooseMainAction(state: GameState, player: PlayerIndex): Action {
  const ps = state.players[player];

  // (A) Use an ability if available (Pidgeot Quick Search, Gardevoir Psychic Embrace).
  const ability = findUsableAbility(ps);
  if (ability) {
    return {
      type: "UseAbility",
      player,
      sourceUid: ability.card.uid,
      abilityName: ability.abilityName,
    };
  }

  // (B) Evolve if a matching evolution is in hand and target wasn't just played.
  const evo = findEvolutionInHand(ps);
  if (evo && state.turnNumber > 1) {
    return { type: "Evolve", player, uid: evo.evo.uid, targetUid: evo.targetUid };
  }

  // (C) Play a Basic to the bench if there's an empty slot.
  const slot = findFirstEmptyBenchSlot(ps);
  if (slot >= 0) {
    const basic = findBasicInHand(ps);
    if (basic) {
      return { type: "PlayBasicPokemon", player, uid: basic.uid, benchSlot: slot };
    }
  }

  // (D) Play a Supporter if we haven't yet (and not first turn).
  const isFirstTurn = state.turnNumber === 1 && state.activePlayer === state.goesFirst;
  if (!ps.hasPlayedSupporter && !isFirstTurn) {
    const supporter = findSupporterInHand(ps);
    // Prefer Professor's Research if hand is small.
    if (supporter && (ps.hand.length <= 5 || supporter.cardId === "pal-172")) {
      return { type: "PlaySupporter", player, uid: supporter.uid };
    }
  }

  // (E) Play a search Item (Nest Ball if bench has slot).
  const nest = findItemInHand(ps, ["svi-181"]);
  if (nest && findFirstEmptyBenchSlot(ps) >= 0) {
    return { type: "PlayItem", player, uid: nest.uid };
  }

  // (F) Switch — only if active is hurt and a healthy bencher exists.
  // Skipped for v0 simplicity.

  // (G) Attach energy to active.
  if (!ps.hasAttachedEnergy && ps.active) {
    const energy = findEnergyInHand(ps);
    if (energy) {
      return {
        type: "AttachEnergy",
        player,
        uid: energy.uid,
        targetUid: ps.active.uid,
      };
    }
  }

  // (H) Attack with highest available damage (if not first turn).
  if (!isFirstTurn && ps.active) {
    const best = pickBestAttack(ps.active);
    if (best) {
      // Validate opponent has an active target
      if (findStrongestActiveTarget(state, player)) {
        return { type: "Attack", player, attackIndex: best.index };
      }
    }
  }

  // (I) Nothing else — end turn.
  return { type: "EndTurn", player };
}

// =========================================================================
// Simulator
// =========================================================================

import { reducer, autoSetup } from "../reducer";

export interface SimResult {
  state: GameState;
  iterations: number;
  reason: "gameOver" | "stalled" | "maxIter";
}

export function simulateGame(
  seed: number,
  deck0Slug: string,
  deck1Slug: string,
  options: { maxIterations?: number; goesFirst?: PlayerIndex } = {},
): SimResult {
  const maxIter = options.maxIterations ?? 2000;
  let s: GameState = autoSetup(seed, deck0Slug, deck1Slug, options.goesFirst ?? 0);

  let iter = 0;
  while (s.phase !== "gameOver" && iter < maxIter) {
    // Decide whose turn it is.
    let actor: PlayerIndex;
    if (s.pendingPrompt) {
      actor = s.pendingPrompt.player;
    } else {
      actor = s.activePlayer;
    }
    const action = chooseAction(s, actor);
    if (!action) {
      return { state: s, iterations: iter, reason: "stalled" };
    }
    s = reducer(s, action);
    iter++;
  }
  return {
    state: s,
    iterations: iter,
    reason: s.phase === "gameOver" ? "gameOver" : "maxIter",
  };
}
