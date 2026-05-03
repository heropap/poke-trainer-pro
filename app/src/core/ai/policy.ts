import { getCard } from "../cards";
import type { Action, PromptResponse } from "../actions";
import type { GameCard, GameState, PlayerIndex } from "../state";
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
    // Prefer Professor's Research if hand is small; play Boss's Orders or
    // Arven aggressively. Iono late game.
    if (supporter && (ps.hand.length <= 5 || supporter.cardId === "pal-172" || supporter.cardId === "svi-186")) {
      return { type: "PlaySupporter", player, uid: supporter.uid };
    }
  }

  // (E) Play a search Item (Nest Ball if bench has slot).
  const nest = findItemInHand(ps, ["svi-181"]);
  if (nest && findFirstEmptyBenchSlot(ps) >= 0) {
    return { type: "PlayItem", player, uid: nest.uid };
  }

  // (E.1) Level Ball — search Pokemon ≤90HP, useful when need basics or evos.
  const levelBall = findItemInHand(ps, ["bst-129"]);
  if (levelBall && ps.deck.length > 0) {
    return { type: "PlayItem", player, uid: levelBall.uid };
  }

  // (E.2) Fog Crystal — search Basic Psychic Pokemon or Psychic Energy.
  // Skip energy unless bench has Gardevoir-line.
  const fogCrystal = findItemInHand(ps, ["cre-140"]);
  if (fogCrystal && ps.deck.length > 0) {
    return { type: "PlayItem", player, uid: fogCrystal.uid };
  }

  // (E.5) Rare Candy — if any Stage 2 in hand has a chain-matched Basic in play
  // (and not played this turn), the engine prompts for selection. We try it
  // optimistically; engine no-ops if no valid pair.
  const rare = findItemInHand(ps, ["svi-191"]);
  const isFirstTurn2 = state.turnNumber === 1 && state.activePlayer === state.goesFirst;
  if (rare && !isFirstTurn2) {
    const handHasStage2 = ps.hand.some((c) => {
      const d = getCard(c.cardId);
      return d.kind === "Pokemon" && d.stage === "Stage2";
    });
    const isBasicReady = (c: GameCard | null) => {
      if (!c) return false;
      const d = getCard(c.cardId);
      return d.kind === "Pokemon" && d.stage === "Basic" && c.markers["playedThisTurn"] !== true;
    };
    const playHasBasic = isBasicReady(ps.active) || ps.bench.some(isBasicReady);
    if (handHasStage2 && playHasBasic) {
      return { type: "PlayItem", player, uid: rare.uid };
    }
  }

  // (E.6) Ultra Ball — search-deck-for-Pokemon; needs 3+ cards in hand (1 to
  // play + 2 to discard).
  const ultra = findItemInHand(ps, ["svi-196"]);
  if (ultra && ps.hand.length >= 3 && ps.deck.length > 0) {
    return { type: "PlayItem", player, uid: ultra.uid };
  }

  // (E.7) Energy Retrieval — only useful if discard has Basic Energy.
  const energyRetrieval = findItemInHand(ps, ["svi-171"]);
  if (energyRetrieval) {
    const hasBasicEnergyInDiscard = ps.discard.some((c) => {
      const d = getCard(c.cardId);
      return d.kind === "Energy" && d.energyKind === "Basic";
    });
    if (hasBasicEnergyInDiscard) {
      return { type: "PlayItem", player, uid: energyRetrieval.uid };
    }
  }

  // (E.8) Super Rod — only useful if discard has 1+ Pokemon or Basic Energy.
  const superRod = findItemInHand(ps, ["pal-188"]);
  if (superRod) {
    const recoverable = ps.discard.some((c) => {
      const d = getCard(c.cardId);
      return (
        d.kind === "Pokemon" || (d.kind === "Energy" && d.energyKind === "Basic")
      );
    });
    if (recoverable && ps.discard.length >= 3) {
      return { type: "PlayItem", player, uid: superRod.uid };
    }
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
  // Asleep / paralyzed Pokémon cannot attack.
  const blockedByStatus =
    !!ps.active &&
    (ps.active.status.includes("asleep") || ps.active.status.includes("paralyzed"));
  if (!isFirstTurn && ps.active && !blockedByStatus) {
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
