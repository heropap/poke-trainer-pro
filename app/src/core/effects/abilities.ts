import { getCard } from "../cards";
import { registerAbility, registerEffectStep } from "../effects";
import {
  drawN,
  findInPlay,
  logEvent,
  replaceInPlay,
  setMarker,
  setPlayer,
} from "./helpers";
import type { GameCard, GameState, PlayerIndex } from "../state";
import type { PromptResponse } from "../actions";

// =====================================================================
// Flaaffy Dynamotor (evs-55) — once per turn, attach a Basic Lightning Energy
// from your discard to one of your Benched Pokémon.
// =====================================================================
const DYNAMOTOR_EFFECT = "evs-55:dynamotor";

registerAbility("evs-55", "Dynamotor", (state, player, sourceUid) => {
  const ps = state.players[player];
  const found = findInPlay(ps, sourceUid);
  if (!found) throw new Error(`Flaaffy ${sourceUid} not in play`);
  if (found.card.markers["abilityUsedThisTurn"] === true) {
    throw new Error("Dynamotor already used this turn");
  }
  if (!ps.discard.some((c) => c.cardId === "sve-4")) {
    throw new Error("No Lightning Energy in discard");
  }
  const benchTargets: number[] = [];
  ps.bench.forEach((b, i) => {
    if (b !== null) benchTargets.push(i);
  });
  if (benchTargets.length === 0) {
    throw new Error("No bench Pokémon");
  }
  return {
    ...state,
    pendingPrompt: {
      kind: "selectTarget",
      player,
      message: "Dynamotor — 选择后场宝可梦贴雷能量",
      eligibleUids: benchTargets.map((i) => `bench:${i}`),
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: DYNAMOTOR_EFFECT, player, sourceUid },
  };
});

registerEffectStep(DYNAMOTOR_EFFECT, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "selectTarget") {
    throw new Error("Dynamotor expects selectTarget");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error();
  const player = eff.player;
  const sourceUid = eff.sourceUid as string;
  const slot = Number(payload.uids[0].split(":")[1]);
  const ps = state.players[player];
  const target = ps.bench[slot];
  if (!target) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const energyIdx = ps.discard.findIndex((c) => c.cardId === "sve-4");
  if (energyIdx < 0) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const energyCard = ps.discard[energyIdx];
  const newDiscard = ps.discard.filter((c, i) => i !== energyIdx);
  const updatedTarget: GameCard = {
    ...target,
    attachedEnergy: [...target.attachedEnergy, energyCard],
  };
  const newBench = [...ps.bench];
  newBench[slot] = updatedTarget;

  // Mark Flaaffy ability used
  const flaaffyFound = findInPlay({ ...ps, bench: newBench }, sourceUid);
  let psUpd = { ...ps, discard: newDiscard, bench: newBench };
  if (flaaffyFound) {
    const marked = setMarker(flaaffyFound.card, "abilityUsedThisTurn", true);
    psUpd = replaceInPlay(psUpd, sourceUid, marked);
  }

  let next: GameState = setPlayer(state, player, psUpd);
  next = { ...next, pendingPrompt: null, pendingEffect: null };
  return logEvent(next, "Dynamotor", { player, targetUid: target.uid });
});

// =====================================================================
// Kirlia Refinement (svi-68) — once per turn, discard a card from hand,
// then draw 2 cards.
// =====================================================================
const REFINEMENT_EFFECT = "svi-68:refinement";

registerAbility("svi-68", "Refinement", (state, player, sourceUid) => {
  const ps = state.players[player];
  const found = findInPlay(ps, sourceUid);
  if (!found) throw new Error(`Kirlia ${sourceUid} not in play`);
  if (found.card.markers["abilityUsedThisTurn"] === true) {
    throw new Error("Refinement already used this turn");
  }
  if (ps.hand.length === 0) {
    throw new Error("Hand is empty");
  }
  return {
    ...state,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Refinement — 选择 1 张手牌弃掉",
      cardIds: ps.hand.map((c) => c.cardId),
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: REFINEMENT_EFFECT, player, sourceUid },
  };
});

registerEffectStep(REFINEMENT_EFFECT, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Refinement expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error();
  const player = eff.player;
  const sourceUid = eff.sourceUid as string;
  const cardId = payload.cardIds[0];
  const ps = state.players[player];

  const handIdx = ps.hand.findIndex((c) => c.cardId === cardId);
  if (handIdx < 0) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const discarded = ps.hand[handIdx];
  const newHand = ps.hand.filter((_, i) => i !== handIdx);
  let psUpd = {
    ...ps,
    hand: newHand,
    discard: [...ps.discard, discarded],
  };

  let next: GameState = setPlayer(state, player, psUpd);
  // Draw 2
  next = drawN(next, player, 2);
  // Mark ability used (re-find Kirlia after state changed)
  const kirliaFound = findInPlay(next.players[player], sourceUid);
  if (kirliaFound) {
    const marked = setMarker(kirliaFound.card, "abilityUsedThisTurn", true);
    const updPlayer = replaceInPlay(next.players[player], sourceUid, marked);
    next = setPlayer(next, player, updPlayer);
  }
  next = { ...next, pendingPrompt: null, pendingEffect: null };
  return logEvent(next, "Refinement", { player, discardedCardId: cardId });
});

void getCard;
