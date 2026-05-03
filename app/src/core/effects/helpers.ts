import { getCard } from "../cards";
import { makeRng, shuffle } from "../rng";
import type { GameState, PlayerState, PlayerIndex, GameCard } from "../state";

export function setPlayer(
  state: GameState,
  player: PlayerIndex,
  next: PlayerState,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[player] = next;
  return { ...state, players };
}

export function logEvent(
  state: GameState,
  kind: string,
  payload?: Record<string, unknown>,
): GameState {
  return { ...state, log: [...state.log, { kind, payload }] };
}

export function bumpRng(state: GameState): GameState {
  return { ...state, rngState: (state.rngState + 0x9e3779b1) >>> 0 };
}

export function shuffleDeck(state: GameState, player: PlayerIndex): GameState {
  const next = bumpRng(state);
  const ps = next.players[player];
  const shuffled = shuffle(ps.deck, makeRng(next.rngState));
  return setPlayer(next, player, { ...ps, deck: shuffled });
}

// Draw N cards. If deck is short, draw what's available (don't crash; deck-out
// is decided at StartTurn).
export function drawN(state: GameState, player: PlayerIndex, n: number): GameState {
  const ps = state.players[player];
  const cnt = Math.min(n, ps.deck.length);
  const taken = ps.deck.slice(0, cnt);
  return setPlayer(state, player, {
    ...ps,
    deck: ps.deck.slice(cnt),
    hand: [...ps.hand, ...taken],
  });
}

// Discard player's entire hand to discard pile.
export function discardHand(state: GameState, player: PlayerIndex): GameState {
  const ps = state.players[player];
  return setPlayer(state, player, {
    ...ps,
    hand: [],
    discard: [...ps.discard, ...ps.hand],
  });
}

// Shuffle player's hand into deck.
export function shuffleHandIntoDeck(state: GameState, player: PlayerIndex): GameState {
  const next = bumpRng(state);
  const ps = next.players[player];
  const shuffled = shuffle([...ps.deck, ...ps.hand], makeRng(next.rngState));
  return setPlayer(next, player, { ...ps, deck: shuffled, hand: [] });
}

// Move card from deck to hand by uid.
export function moveDeckToHand(
  state: GameState,
  player: PlayerIndex,
  uid: string,
): GameState {
  const ps = state.players[player];
  const card = ps.deck.find((c) => c.uid === uid);
  if (!card) throw new Error(`Card ${uid} not in deck`);
  return setPlayer(state, player, {
    ...ps,
    deck: ps.deck.filter((c) => c.uid !== uid),
    hand: [...ps.hand, card],
  });
}

// Move card from deck to bench by uid (first empty slot or specified slot).
export function moveDeckToBench(
  state: GameState,
  player: PlayerIndex,
  uid: string,
  slot?: number,
): GameState {
  const ps = state.players[player];
  const card = ps.deck.find((c) => c.uid === uid);
  if (!card) throw new Error(`Card ${uid} not in deck`);
  const benchIdx = slot ?? ps.bench.findIndex((b) => b === null);
  if (benchIdx < 0) throw new Error(`No empty bench slot`);
  if (ps.bench[benchIdx] !== null) throw new Error(`Bench slot ${benchIdx} occupied`);

  const newBench = [...ps.bench];
  newBench[benchIdx] = { ...card, markers: { ...card.markers, playedThisTurn: true } };

  return setPlayer(state, player, {
    ...ps,
    deck: ps.deck.filter((c) => c.uid !== uid),
    bench: newBench,
  });
}

// Find Basic Pokemon in deck matching a type (or any).
export function findBasicInDeck(
  state: GameState,
  player: PlayerIndex,
  type?: string,
): GameCard[] {
  return state.players[player].deck.filter((c) => {
    const def = getCard(c.cardId);
    if (def.kind !== "Pokemon") return false;
    if (def.stage !== "Basic") return false;
    if (type && !def.types.includes(type as never)) return false;
    return true;
  });
}

// Locate a Pokemon in play by uid.
export function findInPlay(
  player: PlayerState,
  uid: string,
): { card: GameCard; zone: "active" | "bench"; benchSlot?: number } | null {
  if (player.active && player.active.uid === uid) {
    return { card: player.active, zone: "active" };
  }
  for (let i = 0; i < player.bench.length; i++) {
    const b = player.bench[i];
    if (b && b.uid === uid) return { card: b, zone: "bench", benchSlot: i };
  }
  return null;
}

export function replaceInPlay(
  player: PlayerState,
  uid: string,
  replacement: GameCard,
): PlayerState {
  if (player.active && player.active.uid === uid) {
    return { ...player, active: replacement };
  }
  const benchIdx = player.bench.findIndex((b) => b && b.uid === uid);
  if (benchIdx < 0) throw new Error(`Card ${uid} not in play`);
  const newBench = [...player.bench];
  newBench[benchIdx] = replacement;
  return { ...player, bench: newBench };
}

export function setMarker(card: GameCard, key: string, value: number | boolean): GameCard {
  return { ...card, markers: { ...card.markers, [key]: value } };
}
