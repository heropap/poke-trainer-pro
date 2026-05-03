import { getCard } from "../cards";
import { registerEffectStep, registerTrainerEffect } from "../effects";
import { discardHand, drawN, logEvent, shuffleDeck, shuffleHandIntoDeck } from "./helpers";
import type { GameState, PlayerIndex } from "../state";
import type { PromptResponse } from "../actions";

// Professor's Research (svi-190) — discard your hand, draw 7.
registerTrainerEffect("svi-190", (state, player) => {
  let next = discardHand(state, player);
  next = drawN(next, player, 7);
  return logEvent(next, "ProfessorsResearch", { player });
});

// Iono (pal-185) — both players shuffle hand into deck, draw cards equal to
// remaining prizes.
registerTrainerEffect("pal-185", (state, player) => {
  let next = state;
  for (let i: PlayerIndex = 0; i < 2; i = (i + 1) as PlayerIndex) {
    next = shuffleHandIntoDeck(next, i);
    const prizes = next.players[i].prizes.length;
    next = drawN(next, i, prizes);
    if (i === 1) break;
  }
  void player;
  return logEvent(next, "Iono", { player });
});

// Boss's Orders (pal-172) — switch one of opponent's bench Pokemon with their
// active. Multi-step: emits a selectTarget prompt, the response slot index is
// applied.
const BOSS_EFFECT = "pal-172:boss";
registerTrainerEffect("pal-172", (state, player) => {
  const opp = (1 - player) as PlayerIndex;
  const eligible: number[] = [];
  state.players[opp].bench.forEach((b, i) => {
    if (b !== null) eligible.push(i);
  });
  if (eligible.length === 0) return state; // no bench to swap
  if (!state.players[opp].active) return state;

  return {
    ...state,
    pendingPrompt: {
      kind: "selectTarget",
      player,
      message: "Boss's Orders — choose an opponent's benched Pokémon",
      eligibleUids: eligible.map((i) => `bench:${i}`),
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: BOSS_EFFECT, player, data: { opponent: opp } },
  };
});
registerEffectStep(BOSS_EFFECT, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "selectTarget") {
    throw new Error("Boss's Orders expects selectTarget");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player;
  const opp = (1 - player) as PlayerIndex;
  const target = payload.uids[0];
  if (!target?.startsWith("bench:")) throw new Error("Bad bench target");
  const slot = Number(target.split(":")[1]);

  const oppPs = state.players[opp];
  const benched = oppPs.bench[slot];
  const active = oppPs.active;
  if (!benched || !active) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const newBench = [...oppPs.bench];
  newBench[slot] = active;
  const players = [...state.players] as typeof state.players;
  players[opp] = { ...oppPs, active: benched, bench: newBench };

  let next: GameState = {
    ...state,
    players,
    pendingPrompt: null,
    pendingEffect: null,
  };
  next = logEvent(next, "BossOrders", { player, targetUid: benched.uid });
  return next;
});

// Switch (svi-194) — switch your active with one bench Pokemon.
const SWITCH_EFFECT = "svi-194:switch";
registerTrainerEffect("svi-194", (state, player) => {
  const ps = state.players[player];
  const eligible: number[] = [];
  ps.bench.forEach((b, i) => {
    if (b !== null) eligible.push(i);
  });
  if (eligible.length === 0 || !ps.active) return state;

  return {
    ...state,
    pendingPrompt: {
      kind: "selectTarget",
      player,
      message: "Switch — choose a benched Pokémon to switch in",
      eligibleUids: eligible.map((i) => `bench:${i}`),
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: SWITCH_EFFECT, player },
  };
});
registerEffectStep(SWITCH_EFFECT, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "selectTarget") {
    throw new Error("Switch expects selectTarget");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player;
  const ps = state.players[player];

  const slot = Number(payload.uids[0].split(":")[1]);
  const benched = ps.bench[slot];
  if (!benched || !ps.active) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const newBench = [...ps.bench];
  newBench[slot] = ps.active;
  const players = [...state.players] as typeof state.players;
  players[player] = { ...ps, active: benched, bench: newBench };

  let next: GameState = {
    ...state,
    players,
    pendingPrompt: null,
    pendingEffect: null,
  };
  next = logEvent(next, "Switch", { player });
  return next;
});

// Nest Ball (svi-181) — search your deck for a Basic Pokemon, put it on your
// bench, and shuffle your deck.
const NEST_EFFECT = "svi-181:nest";

function isBasicPokemonId(cardId: string): boolean {
  const def = getCard(cardId);
  return def.kind === "Pokemon" && def.stage === "Basic";
}

registerTrainerEffect("svi-181", (state, player) => {
  const ps = state.players[player];
  const eligibleCardIds = Array.from(
    new Set(ps.deck.filter((c) => isBasicPokemonId(c.cardId)).map((c) => c.cardId)),
  );
  if (eligibleCardIds.length === 0) return state;
  if (!ps.bench.includes(null)) return state;

  return {
    ...state,
    pendingPrompt: {
      kind: "selectFromList",
      player,
      message: "Nest Ball — choose a Basic Pokémon",
      cardIds: eligibleCardIds,
      minCount: 1,
      maxCount: 1,
    },
    pendingEffect: { effectId: NEST_EFFECT, player },
  };
});
registerEffectStep(NEST_EFFECT, (state: GameState, payload: PromptResponse) => {
  if (payload.kind !== "selectFromList") {
    throw new Error("Nest Ball expects selectFromList");
  }
  const eff = state.pendingEffect;
  if (!eff) throw new Error("No pending effect");
  const player = eff.player;
  const cardId = payload.cardIds[0];
  if (!isBasicPokemonId(cardId)) {
    throw new Error(`Nest Ball: ${cardId} is not a Basic Pokemon`);
  }
  const ps = state.players[player];

  const card = ps.deck.find((c) => c.cardId === cardId);
  if (!card) throw new Error(`Card ${cardId} not in deck`);

  const benchIdx = ps.bench.findIndex((b) => b === null);
  if (benchIdx < 0) {
    return { ...state, pendingPrompt: null, pendingEffect: null };
  }
  const newBench = [...ps.bench];
  newBench[benchIdx] = { ...card, markers: { ...card.markers, playedThisTurn: true } };
  const players = [...state.players] as typeof state.players;
  players[player] = {
    ...ps,
    deck: ps.deck.filter((c) => c.uid !== card.uid),
    bench: newBench,
  };

  let next: GameState = {
    ...state,
    players,
    pendingPrompt: null,
    pendingEffect: null,
  };
  next = shuffleDeck(next, player);
  next = logEvent(next, "NestBall", { player, cardId });
  return next;
});
