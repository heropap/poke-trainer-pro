import { registerAbility, registerEffectStep } from "../effects";
import {
  findInPlay,
  logEvent,
  moveDeckToHand,
  replaceInPlay,
  setMarker,
  setPlayer,
  shuffleDeck,
} from "./helpers";
import type { GameState, PlayerIndex } from "../state";
import type { PromptResponse } from "../actions";

// Quick Search — once per turn, search deck for any card and put it in hand.
//
// Multi-step:
//   1. UseAbility → set pendingPrompt selectFromList of all deck card ids.
//      Set pendingEffect { effectId: "obf-164:quick-search", player, sourceUid }.
//   2. ResolvePrompt selectFromList → move that card to hand, shuffle, mark used.

const EFFECT_ID = "obf-164:quick-search";

registerAbility("obf-164", "Quick Search", (state, player, sourceUid) => {
  const ps = state.players[player];
  const found = findInPlay(ps, sourceUid);
  if (!found) throw new Error(`Pidgeot ex ${sourceUid} not in play`);
  if (found.card.markers["abilityUsedThisTurn"] === true) {
    throw new Error("Quick Search already used this turn");
  }
  if (ps.deck.length === 0) {
    throw new Error("Deck is empty");
  }

  // Set prompt: select 1 card from deck (we list all deck cardIds; UI shows them).
  return {
    ...state,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Quick Search — choose any card from your deck",
      cardIds: ps.deck.map((c) => c.cardId),
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: EFFECT_ID, player, sourceUid },
  };
});

registerEffectStep(EFFECT_ID, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "selectFromList") {
    throw new Error(`Quick Search expects selectFromList payload`);
  }
  const eff = state.pendingEffect;
  if (!eff || eff.effectId !== EFFECT_ID) throw new Error("Pending effect mismatch");
  const player = eff.player as PlayerIndex;
  const sourceUid = eff.sourceUid as string;
  const chosenCardId = payload.cardIds[0];
  if (!chosenCardId) throw new Error("Quick Search needs 1 cardId");

  // Find the first matching uid in deck (since duplicates exist).
  const ps = state.players[player];
  const targetCard = ps.deck.find((c) => c.cardId === chosenCardId);
  if (!targetCard) throw new Error(`Card ${chosenCardId} not in deck`);

  let next = moveDeckToHand(state, player, targetCard.uid);
  next = shuffleDeck(next, player);

  // Mark ability used this turn.
  const psUpd = next.players[player];
  const found = findInPlay(psUpd, sourceUid);
  if (found) {
    const marked = setMarker(found.card, "abilityUsedThisTurn", true);
    const updPlayer = replaceInPlay(psUpd, sourceUid, marked);
    next = setPlayer(next, player, updPlayer);
  }

  next = { ...next, pendingPrompt: null, pendingEffect: null };
  next = logEvent(next, "QuickSearch", { player, cardId: chosenCardId });
  return next;
});
