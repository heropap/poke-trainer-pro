import { getCard } from "./cards";
import { getDeck } from "./decks";
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

// ------------------ utilities ------------------

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

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

function appendLog(state: GameState, kind: string, payload?: Record<string, unknown>): GameState {
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

function drawWithMulligan(
  player: PlayerState,
  rngSeed: number,
): PlayerState {
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

// ------------------ action handlers ------------------

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
    if (i === 1) break; // typescript-friendly — explicit termination
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
  const card = ps.hand.find((c) => c.uid === uid);
  if (!card) throw new Error(`Card uid ${uid} not in hand`);
  if (!isBasicPokemon(card)) throw new Error(`Card ${card.cardId} is not a Basic Pokemon`);

  const newPs: PlayerState = {
    ...ps,
    hand: ps.hand.filter((c) => c.uid !== uid),
    active: card,
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[player] = newPs;

  let next: GameState = {
    ...state,
    players,
    phase: "setupBench",
    pendingPrompt: benchSetupPromptFor(newPs.hand, player),
  };
  next = appendLog(next, "PlaceActiveSetup", { player, cardId: card.cardId });
  return next;
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
    const card = ps.hand.find((c) => c.uid === uid);
    if (!card) throw new Error(`Bench setup: card uid ${uid} not in hand`);
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

  const players = [...state.players] as [PlayerState, PlayerState];
  players[player] = newPs;

  // Advance to next player or to prizes phase
  const otherPlayer = (1 - player) as PlayerIndex;
  let next: GameState;
  if (!players[otherPlayer].setupReady && players[otherPlayer].active === null) {
    // The other player still needs to do active+bench setup
    next = {
      ...state,
      players,
      phase: "setupActive",
      pendingPrompt: activeSetupPromptFor(players[otherPlayer].hand, otherPlayer),
    };
  } else {
    // Both done: place prizes
    next = placePrizesForBoth({ ...state, players });
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
    // Deck-out condition — F5 will properly handle this. For F3 we just throw.
    throw new Error(`Player ${player} cannot draw ${count} (deck has ${ps.deck.length})`);
  }
  const newPs = drawNFromDeck(ps, count);
  const players = [...state.players] as [PlayerState, PlayerState];
  players[player] = newPs;
  return appendLog({ ...state, players }, "DrawCard", { player, count });
}

function handleConcede(state: GameState, player: PlayerIndex): GameState {
  const winner = (1 - player) as PlayerIndex;
  return appendLog(
    { ...state, phase: "gameOver", winner, winReason: "concede" },
    "Concede",
    { player },
  );
}

// ------------------ public reducer ------------------

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "GameStart":
      return handleGameStart(state, action.deckSlugs, action.goesFirst);
    case "PlaceActiveSetup":
      return handlePlaceActiveSetup(state, action.player, action.uid);
    case "PlaceBenchSetup":
      return handlePlaceBenchSetup(state, action.player, action.uids);
    case "FinishSetup":
      // Manual marker; bench setup auto-transitions, so this is mostly for tests.
      return state;
    case "DrawCard":
      return handleDrawCard(state, action.player, action.count);
    case "ResolvePrompt":
      return handleResolvePrompt(state, action.payload);
    case "Concede":
      return handleConcede(state, action.player);
    default: {
      // exhaustive
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
      // pick first eligible
      const uid = prompt.eligibleUids[0];
      s = reducer(s, {
        type: "ResolvePrompt",
        payload: { kind: "selectActiveSetup", uid },
      });
    } else if (prompt.kind === "selectBenchSetup") {
      // pick all eligible up to bench size
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

// Re-exports for clones
export { clone };
