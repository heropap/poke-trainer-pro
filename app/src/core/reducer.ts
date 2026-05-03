import { getCard } from "./cards";
import { getDeck } from "./decks";
import { getEffect } from "./effects";
import { makeRng, shuffle } from "./rng";
import type { Action, PromptResponse } from "./actions";
import {
  BENCH_SIZE,
  HAND_DRAW,
  PRIZE_COUNT,
  emptyGameState,
  type GameCard,
  type GameState,
  type PlayerIndex,
  type PlayerState,
  type Prompt,
} from "./state";
import type {
  CardDef,
  EnergyCardDef,
  PokemonCardDef,
  TrainerCardDef,
} from "./types";

// =====================================================================
// Utilities
// =====================================================================

function freshCard(uid: string, cardId: string): GameCard {
  return {
    uid,
    cardId,
    damage: 0,
    attachedEnergy: [],
    attachedTool: null,
    evolutionStack: [],
    status: [],
    markers: {},
  };
}

function isBasicPokemon(card: GameCard): boolean {
  const def = getCard(card.cardId);
  return def.kind === "Pokemon" && def.stage === "Basic";
}

function asPokemon(def: CardDef): PokemonCardDef | null {
  return def.kind === "Pokemon" ? def : null;
}

function asTrainer(def: CardDef): TrainerCardDef | null {
  return def.kind === "Trainer" ? def : null;
}

function asEnergy(def: CardDef): EnergyCardDef | null {
  return def.kind === "Energy" ? def : null;
}

function appendLog(
  state: GameState,
  kind: string,
  payload?: Record<string, unknown>,
): GameState {
  return { ...state, log: [...state.log, { kind, payload }] };
}

function buildPlayerDeck(deckSlug: string, playerIndex: PlayerIndex): GameCard[] {
  const def = getDeck(deckSlug);
  const cards: GameCard[] = [];
  let counter = 0;
  for (const entry of def.cards) {
    for (let i = 0; i < entry.count; i++) {
      cards.push(freshCard(`p${playerIndex}-${counter++}`, entry.cardId));
    }
  }
  return cards;
}

function drawNFromDeck(player: PlayerState, n: number): PlayerState {
  const taken = player.deck.slice(0, n);
  return {
    ...player,
    deck: player.deck.slice(n),
    hand: [...player.hand, ...taken],
  };
}

function reshuffleHandIntoDeck(player: PlayerState, rngSeed: number): PlayerState {
  const combined = [...player.deck, ...player.hand];
  const shuffled = shuffle(combined, makeRng(rngSeed));
  return { ...player, deck: shuffled, hand: [] };
}

function drawWithMulligan(player: PlayerState, rngSeed: number): PlayerState {
  let p = drawNFromDeck(player, HAND_DRAW);
  let attempts = 0;
  let seed = rngSeed;
  while (!p.hand.some(isBasicPokemon)) {
    seed = (seed + 1) >>> 0;
    p = drawNFromDeck(reshuffleHandIntoDeck(p, seed), HAND_DRAW);
    attempts++;
    if (attempts > 50) {
      throw new Error(
        "Mulligan loop exceeded 50 iterations — deck has no Basic Pokémon?",
      );
    }
  }
  return p;
}

function setPlayer(
  state: GameState,
  player: PlayerIndex,
  next: PlayerState,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[player] = next;
  return { ...state, players };
}

function findInHand(player: PlayerState, uid: string): GameCard {
  const c = player.hand.find((x) => x.uid === uid);
  if (!c) throw new Error(`Card uid ${uid} not in hand`);
  return c;
}

function findInPlay(player: PlayerState, uid: string): {
  card: GameCard;
  zone: "active" | "bench";
  benchSlot?: number;
} {
  if (player.active && player.active.uid === uid) {
    return { card: player.active, zone: "active" };
  }
  for (let i = 0; i < player.bench.length; i++) {
    const b = player.bench[i];
    if (b && b.uid === uid) {
      return { card: b, zone: "bench", benchSlot: i };
    }
  }
  throw new Error(`Pokemon uid ${uid} not in play`);
}

function replaceInPlay(player: PlayerState, uid: string, replacement: GameCard): PlayerState {
  if (player.active && player.active.uid === uid) {
    return { ...player, active: replacement };
  }
  const benchIdx = player.bench.findIndex((b) => b && b.uid === uid);
  if (benchIdx >= 0) {
    const newBench = [...player.bench];
    newBench[benchIdx] = replacement;
    return { ...player, bench: newBench };
  }
  throw new Error(`Pokemon uid ${uid} not in play`);
}

function removeFromHand(player: PlayerState, uid: string): PlayerState {
  return { ...player, hand: player.hand.filter((c) => c.uid !== uid) };
}

function isFirstTurn(state: GameState): boolean {
  return state.turnNumber === 1 && state.activePlayer === state.goesFirst;
}

// =====================================================================
// Setup phase (F3)
// =====================================================================

function handleGameStart(
  state: GameState,
  deckSlugs: [string, string],
  goesFirst: PlayerIndex,
): GameState {
  let next: GameState = {
    ...emptyGameState(state.rngState),
    goesFirst,
    activePlayer: goesFirst,
  };

  for (let i: PlayerIndex = 0; i < 2; i = (i + 1) as PlayerIndex) {
    const cards = buildPlayerDeck(deckSlugs[i], i);
    next.rngState = (next.rngState + 0x9e3779b1) >>> 0;
    const shuffled = shuffle(cards, makeRng(next.rngState));
    let p: PlayerState = { ...next.players[i], deck: shuffled };
    next.rngState = (next.rngState + 0xbf58476d) >>> 0;
    p = drawWithMulligan(p, next.rngState);
    next.players[i] = p;
    if (i === 1) break;
  }

  next.phase = "setupActive";
  next.pendingPrompt = activeSetupPromptFor(next.players[goesFirst].hand, goesFirst);
  next = appendLog(next, "GameStart", { goesFirst, deckSlugs });
  return next;
}

function activeSetupPromptFor(hand: GameCard[], player: PlayerIndex): Prompt {
  const eligible = hand.filter(isBasicPokemon).map((c) => c.uid);
  return { kind: "selectActiveSetup", player, eligibleUids: eligible };
}

function benchSetupPromptFor(hand: GameCard[], player: PlayerIndex): Prompt {
  const eligible = hand.filter(isBasicPokemon).map((c) => c.uid);
  return {
    kind: "selectBenchSetup",
    player,
    eligibleUids: eligible,
    maxCount: BENCH_SIZE,
  };
}

function handlePlaceActiveSetup(
  state: GameState,
  player: PlayerIndex,
  uid: string,
): GameState {
  if (state.phase !== "setupActive") {
    throw new Error(`PlaceActiveSetup is only valid during setupActive phase (got ${state.phase})`);
  }
  if (state.pendingPrompt?.kind !== "selectActiveSetup" || state.pendingPrompt.player !== player) {
    throw new Error(`No setup-active prompt for player ${player}`);
  }

  const ps = state.players[player];
  const card = findInHand(ps, uid);
  if (!isBasicPokemon(card)) throw new Error(`Card ${card.cardId} is not a Basic Pokemon`);

  const newPs: PlayerState = {
    ...removeFromHand(ps, uid),
    active: card,
  };

  let next: GameState = setPlayer(state, player, newPs);
  next = {
    ...next,
    phase: "setupBench",
    pendingPrompt: benchSetupPromptFor(newPs.hand, player),
  };
  next = appendLog(next, "PlaceActiveSetup", { player, cardId: card.cardId });
  return next;
}

function handlePlaceBenchSetup(
  state: GameState,
  player: PlayerIndex,
  uids: string[],
): GameState {
  if (state.phase !== "setupBench") {
    throw new Error(`PlaceBenchSetup is only valid during setupBench phase (got ${state.phase})`);
  }
  if (state.pendingPrompt?.kind !== "selectBenchSetup" || state.pendingPrompt.player !== player) {
    throw new Error(`No setup-bench prompt for player ${player}`);
  }
  if (uids.length > BENCH_SIZE) {
    throw new Error(`Bench can hold at most ${BENCH_SIZE} Pokemon, got ${uids.length}`);
  }

  const ps = state.players[player];
  const benched: GameCard[] = [];
  for (const uid of uids) {
    const card = findInHand(ps, uid);
    if (!isBasicPokemon(card)) throw new Error(`Bench setup: card ${card.cardId} is not a Basic`);
    benched.push(card);
  }

  const newBench: (GameCard | null)[] = new Array(BENCH_SIZE).fill(null);
  benched.forEach((c, i) => {
    newBench[i] = c;
  });

  const newHand = ps.hand.filter((c) => !uids.includes(c.uid));
  const newPs: PlayerState = {
    ...ps,
    hand: newHand,
    bench: newBench,
    setupReady: true,
  };

  let next = setPlayer(state, player, newPs);

  const otherPlayer = (1 - player) as PlayerIndex;
  if (!next.players[otherPlayer].setupReady && next.players[otherPlayer].active === null) {
    next = {
      ...next,
      phase: "setupActive",
      pendingPrompt: activeSetupPromptFor(next.players[otherPlayer].hand, otherPlayer),
    };
  } else {
    next = placePrizesForBoth(next);
  }

  next = appendLog(next, "PlaceBenchSetup", { player, count: uids.length });
  return next;
}

function placePrizesForBoth(state: GameState): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  for (let i: PlayerIndex = 0; i < 2; i = (i + 1) as PlayerIndex) {
    const p = players[i];
    const prizes = p.deck.slice(0, PRIZE_COUNT);
    const remaining = p.deck.slice(PRIZE_COUNT);
    players[i] = { ...p, prizes, deck: remaining };
    if (i === 1) break;
  }
  return {
    ...state,
    players,
    phase: "draw",
    pendingPrompt: null,
    activePlayer: state.goesFirst,
    turnNumber: 1,
  };
}

// =====================================================================
// Turn flow (F4)
// =====================================================================

function handleStartTurn(state: GameState): GameState {
  if (state.phase !== "draw") {
    throw new Error(`StartTurn requires phase=draw (got ${state.phase})`);
  }

  const player = state.activePlayer;
  const ps = state.players[player];

  if (ps.deck.length === 0) {
    // Deck-out: opponent wins.
    return appendLog(
      {
        ...state,
        phase: "gameOver",
        winner: (1 - player) as PlayerIndex,
        winReason: "deckOut",
      },
      "DeckOut",
      { player },
    );
  }

  const drawn = drawNFromDeck(ps, 1);
  const reset: PlayerState = {
    ...drawn,
    hasPlayedSupporter: false,
    hasAttachedEnergy: false,
    retreatedThisTurn: false,
  };
  let next = setPlayer(state, player, reset);
  next = { ...next, phase: "main" };
  next = appendLog(next, "StartTurn", { player, turnNumber: state.turnNumber });
  return next;
}

function handleEndTurn(state: GameState, player: PlayerIndex): GameState {
  if (state.activePlayer !== player) {
    throw new Error(`Player ${player} cannot end turn (active is ${state.activePlayer})`);
  }
  if (state.phase !== "main" && state.phase !== "attack") {
    throw new Error(`EndTurn invalid in phase ${state.phase}`);
  }

  // Between-turn checkup is implemented in F5. For F4 we just advance.
  const nextPlayer = (1 - player) as PlayerIndex;
  const next: GameState = {
    ...state,
    activePlayer: nextPlayer,
    phase: "draw",
    turnNumber: state.turnNumber + 1,
  };
  return appendLog(next, "EndTurn", { player });
}

function handlePlayBasicPokemon(
  state: GameState,
  player: PlayerIndex,
  uid: string,
  benchSlot: number,
): GameState {
  requireMainPhase(state, player);
  if (benchSlot < 0 || benchSlot >= BENCH_SIZE) {
    throw new Error(`Invalid bench slot ${benchSlot}`);
  }

  const ps = state.players[player];
  const card = findInHand(ps, uid);
  if (!isBasicPokemon(card)) {
    throw new Error(`Card ${card.cardId} is not a Basic Pokemon`);
  }
  if (ps.bench[benchSlot] !== null) {
    throw new Error(`Bench slot ${benchSlot} is occupied`);
  }

  const newBench = [...ps.bench];
  newBench[benchSlot] = card;
  const newPs: PlayerState = {
    ...removeFromHand(ps, uid),
    bench: newBench,
  };

  return appendLog(setPlayer(state, player, newPs), "PlayBasicPokemon", {
    player,
    cardId: card.cardId,
    benchSlot,
  });
}

function handleAttachEnergy(
  state: GameState,
  player: PlayerIndex,
  uid: string,
  targetUid: string,
): GameState {
  requireMainPhase(state, player);

  const ps = state.players[player];
  if (ps.hasAttachedEnergy) {
    throw new Error(`Player ${player} already attached an Energy this turn`);
  }

  const card = findInHand(ps, uid);
  const def = asEnergy(getCard(card.cardId));
  if (!def) throw new Error(`Card ${card.cardId} is not an Energy`);

  const found = findInPlay(ps, targetUid);
  const updatedTarget: GameCard = {
    ...found.card,
    attachedEnergy: [...found.card.attachedEnergy, card],
  };

  let newPs = removeFromHand(ps, uid);
  newPs = replaceInPlay(newPs, targetUid, updatedTarget);
  newPs = { ...newPs, hasAttachedEnergy: true };

  return appendLog(setPlayer(state, player, newPs), "AttachEnergy", {
    player,
    energyId: card.cardId,
    targetUid,
  });
}

function handleRetreat(
  state: GameState,
  player: PlayerIndex,
  benchSlot: number,
  payEnergyUids: string[],
): GameState {
  requireMainPhase(state, player);

  const ps = state.players[player];
  if (ps.retreatedThisTurn) {
    throw new Error(`Player ${player} already retreated this turn`);
  }
  if (!ps.active) {
    throw new Error(`No active Pokemon to retreat`);
  }
  if (benchSlot < 0 || benchSlot >= BENCH_SIZE) {
    throw new Error(`Invalid bench slot ${benchSlot}`);
  }
  const benched = ps.bench[benchSlot];
  if (!benched) {
    throw new Error(`Bench slot ${benchSlot} is empty`);
  }
  if (ps.active.status.includes("asleep") || ps.active.status.includes("paralyzed")) {
    throw new Error(`Active Pokemon cannot retreat while ${ps.active.status.join("/")}`);
  }

  const def = asPokemon(getCard(ps.active.cardId));
  if (!def) throw new Error(`Active card is not a Pokemon`);
  const cost = def.retreatCost;

  if (payEnergyUids.length !== cost) {
    throw new Error(`Retreat cost is ${cost}, paid ${payEnergyUids.length} energy`);
  }

  // Discard the chosen energies from active.
  const remainingEnergy = ps.active.attachedEnergy.filter(
    (e) => !payEnergyUids.includes(e.uid),
  );
  if (remainingEnergy.length !== ps.active.attachedEnergy.length - payEnergyUids.length) {
    throw new Error(`One or more retreat-cost Energy uids not attached to active`);
  }
  const discardedEnergy = ps.active.attachedEnergy.filter((e) =>
    payEnergyUids.includes(e.uid),
  );

  const newActive: GameCard = { ...ps.active, attachedEnergy: remainingEnergy };
  // Swap active with bench[benchSlot].
  const newBench = [...ps.bench];
  newBench[benchSlot] = newActive;
  const newPs: PlayerState = {
    ...ps,
    active: benched,
    bench: newBench,
    discard: [...ps.discard, ...discardedEnergy],
    retreatedThisTurn: true,
  };
  return appendLog(setPlayer(state, player, newPs), "Retreat", {
    player,
    benchSlot,
    paid: discardedEnergy.length,
  });
}

function handleEvolve(
  state: GameState,
  player: PlayerIndex,
  uid: string,
  targetUid: string,
): GameState {
  requireMainPhase(state, player);

  if (isFirstTurn(state)) {
    throw new Error(`Cannot evolve on your first turn`);
  }

  const ps = state.players[player];
  const evoCard = findInHand(ps, uid);
  const evoDef = asPokemon(getCard(evoCard.cardId));
  if (!evoDef || (evoDef.stage !== "Stage1" && evoDef.stage !== "Stage2")) {
    throw new Error(`Card ${evoCard.cardId} is not an evolution`);
  }

  const found = findInPlay(ps, targetUid);
  const targetDef = asPokemon(getCard(found.card.cardId));
  if (!targetDef) throw new Error(`Target ${targetUid} is not a Pokemon`);

  // Evolution name must match (or chain through evolutionStack base).
  if (evoDef.evolvesFrom && evoDef.evolvesFrom !== targetDef.name) {
    throw new Error(
      `${evoDef.name} evolves from ${evoDef.evolvesFrom}, not ${targetDef.name}`,
    );
  }

  if (found.card.markers["playedThisTurn"] === true) {
    throw new Error(`Cannot evolve a Pokemon that was just put into play this turn`);
  }

  const evolved: GameCard = {
    ...found.card,
    cardId: evoCard.cardId,
    uid: evoCard.uid,
    damage: found.card.damage,
    attachedEnergy: found.card.attachedEnergy,
    attachedTool: found.card.attachedTool,
    evolutionStack: [...found.card.evolutionStack, found.card],
    status: [],
    markers: { evolvedThisTurn: true },
  };

  let newPs = removeFromHand(ps, uid);
  newPs = replaceInPlay(newPs, targetUid, evolved);

  return appendLog(setPlayer(state, player, newPs), "Evolve", {
    player,
    fromCardId: found.card.cardId,
    toCardId: evoCard.cardId,
    targetUid,
  });
}

function handlePlayItem(state: GameState, player: PlayerIndex, uid: string): GameState {
  requireMainPhase(state, player);
  const ps = state.players[player];
  const card = findInHand(ps, uid);
  const def = asTrainer(getCard(card.cardId));
  if (!def) throw new Error(`Card ${card.cardId} is not a Trainer`);
  if (def.trainerKind !== "Item") throw new Error(`Card ${card.cardId} is not an Item`);

  const newPs: PlayerState = {
    ...removeFromHand(ps, uid),
    discard: [...ps.discard, card],
  };
  let next: GameState = setPlayer(state, player, newPs);
  next = appendLog(next, "PlayItem", { player, cardId: card.cardId });

  // Run effect if registered (F6).
  const effect = getEffect(card.cardId);
  if (effect) next = effect(next, player);

  return next;
}

function handlePlaySupporter(
  state: GameState,
  player: PlayerIndex,
  uid: string,
): GameState {
  requireMainPhase(state, player);
  if (isFirstTurn(state)) {
    throw new Error(`Cannot play a Supporter on the first turn`);
  }

  const ps = state.players[player];
  if (ps.hasPlayedSupporter) {
    throw new Error(`Player ${player} already played a Supporter this turn`);
  }

  const card = findInHand(ps, uid);
  const def = asTrainer(getCard(card.cardId));
  if (!def) throw new Error(`Card ${card.cardId} is not a Trainer`);
  if (def.trainerKind !== "Supporter") throw new Error(`Card ${card.cardId} is not a Supporter`);

  const newPs: PlayerState = {
    ...removeFromHand(ps, uid),
    discard: [...ps.discard, card],
    hasPlayedSupporter: true,
  };
  let next: GameState = setPlayer(state, player, newPs);
  next = appendLog(next, "PlaySupporter", { player, cardId: card.cardId });

  const effect = getEffect(card.cardId);
  if (effect) next = effect(next, player);

  return next;
}

function handlePlayStadium(
  state: GameState,
  player: PlayerIndex,
  uid: string,
): GameState {
  requireMainPhase(state, player);

  const ps = state.players[player];
  const card = findInHand(ps, uid);
  const def = asTrainer(getCard(card.cardId));
  if (!def) throw new Error(`Card ${card.cardId} is not a Trainer`);
  if (def.trainerKind !== "Stadium") throw new Error(`Card ${card.cardId} is not a Stadium`);

  let nextState = setPlayer(state, player, removeFromHand(ps, uid));

  // Discard any existing stadium.
  if (state.stadium) {
    const stadiumOwner = (state.stadium.markers["owner"] as PlayerIndex) ?? player;
    const owner = nextState.players[stadiumOwner];
    nextState = setPlayer(nextState, stadiumOwner, {
      ...owner,
      discard: [...owner.discard, state.stadium],
    });
  }

  const stadiumCard: GameCard = {
    ...card,
    markers: { owner: player },
  };

  return appendLog({ ...nextState, stadium: stadiumCard }, "PlayStadium", {
    player,
    cardId: card.cardId,
  });
}

function handleAttachTool(
  state: GameState,
  player: PlayerIndex,
  uid: string,
  targetUid: string,
): GameState {
  requireMainPhase(state, player);

  const ps = state.players[player];
  const card = findInHand(ps, uid);
  const def = asTrainer(getCard(card.cardId));
  if (!def) throw new Error(`Card ${card.cardId} is not a Trainer`);
  if (def.trainerKind !== "Tool") throw new Error(`Card ${card.cardId} is not a Tool`);

  const found = findInPlay(ps, targetUid);
  if (found.card.attachedTool) {
    throw new Error(`Pokemon ${targetUid} already has a Tool attached`);
  }

  const updatedTarget: GameCard = { ...found.card, attachedTool: card };
  let newPs = removeFromHand(ps, uid);
  newPs = replaceInPlay(newPs, targetUid, updatedTarget);

  return appendLog(setPlayer(state, player, newPs), "AttachTool", {
    player,
    toolId: card.cardId,
    targetUid,
  });
}

function requireMainPhase(state: GameState, player: PlayerIndex): void {
  if (state.activePlayer !== player) {
    throw new Error(`Player ${player} is not the active player`);
  }
  if (state.phase !== "main") {
    throw new Error(`Action requires phase=main, got ${state.phase}`);
  }
  if (state.pendingPrompt) {
    throw new Error(`Resolve pending prompt before taking other actions`);
  }
}

// =====================================================================
// Other actions
// =====================================================================

function handleResolvePrompt(state: GameState, payload: PromptResponse): GameState {
  const prompt = state.pendingPrompt;
  if (!prompt) throw new Error("No pending prompt to resolve");

  if (prompt.kind === "selectActiveSetup" && payload.kind === "selectActiveSetup") {
    return handlePlaceActiveSetup(state, prompt.player, payload.uid);
  }
  if (prompt.kind === "selectBenchSetup" && payload.kind === "selectBenchSetup") {
    return handlePlaceBenchSetup(state, prompt.player, payload.uids);
  }
  throw new Error(`Prompt kind ${prompt.kind} cannot be resolved by payload kind ${payload.kind}`);
}

function handleDrawCard(state: GameState, player: PlayerIndex, count: number): GameState {
  const ps = state.players[player];
  if (ps.deck.length < count) {
    throw new Error(`Player ${player} cannot draw ${count} (deck has ${ps.deck.length})`);
  }
  const newPs = drawNFromDeck(ps, count);
  return appendLog(setPlayer(state, player, newPs), "DrawCard", { player, count });
}

function handleConcede(state: GameState, player: PlayerIndex): GameState {
  const winner = (1 - player) as PlayerIndex;
  return appendLog(
    { ...state, phase: "gameOver", winner, winReason: "concede" },
    "Concede",
    { player },
  );
}

// =====================================================================
// Public reducer
// =====================================================================

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "GameStart":
      return handleGameStart(state, action.deckSlugs, action.goesFirst);
    case "PlaceActiveSetup":
      return handlePlaceActiveSetup(state, action.player, action.uid);
    case "PlaceBenchSetup":
      return handlePlaceBenchSetup(state, action.player, action.uids);
    case "FinishSetup":
      return state;
    case "DrawCard":
      return handleDrawCard(state, action.player, action.count);
    case "StartTurn":
      return handleStartTurn(state);
    case "EndTurn":
      return handleEndTurn(state, action.player);
    case "PlayBasicPokemon":
      return handlePlayBasicPokemon(state, action.player, action.uid, action.benchSlot);
    case "AttachEnergy":
      return handleAttachEnergy(state, action.player, action.uid, action.targetUid);
    case "Retreat":
      return handleRetreat(state, action.player, action.benchSlot, action.payEnergyUids);
    case "Evolve":
      return handleEvolve(state, action.player, action.uid, action.targetUid);
    case "PlayItem":
      return handlePlayItem(state, action.player, action.uid);
    case "PlaySupporter":
      return handlePlaySupporter(state, action.player, action.uid);
    case "PlayStadium":
      return handlePlayStadium(state, action.player, action.uid);
    case "AttachTool":
      return handleAttachTool(state, action.player, action.uid, action.targetUid);
    case "ResolvePrompt":
      return handleResolvePrompt(state, action.payload);
    case "Concede":
      return handleConcede(state, action.player);
    default: {
      const _never: never = action;
      void _never;
      return state;
    }
  }
}

export function createGameState(rngSeed: number): GameState {
  return emptyGameState(rngSeed);
}

// Helper to drive setup with auto-resolved prompts (for tests and AI).
export function autoSetup(
  rngSeed: number,
  deck0Slug: string,
  deck1Slug: string,
  goesFirst: PlayerIndex = 0,
): GameState {
  let s: GameState = createGameState(rngSeed);
  s = reducer(s, { type: "GameStart", deckSlugs: [deck0Slug, deck1Slug], goesFirst });

  while (s.phase !== "draw" && s.phase !== "gameOver") {
    const prompt = s.pendingPrompt;
    if (!prompt) throw new Error(`Auto-setup stalled: no prompt in phase ${s.phase}`);
    if (prompt.kind === "selectActiveSetup") {
      const uid = prompt.eligibleUids[0];
      s = reducer(s, {
        type: "ResolvePrompt",
        payload: { kind: "selectActiveSetup", uid },
      });
    } else if (prompt.kind === "selectBenchSetup") {
      const uids = prompt.eligibleUids.slice(0, BENCH_SIZE);
      s = reducer(s, {
        type: "ResolvePrompt",
        payload: { kind: "selectBenchSetup", uids },
      });
    } else {
      throw new Error(`Auto-setup encountered unexpected prompt: ${prompt.kind}`);
    }
  }

  return s;
}

// Helpers for tests / AI
export function findCardInHandByCardId(player: PlayerState, cardId: string): GameCard | undefined {
  return player.hand.find((c) => c.cardId === cardId);
}
