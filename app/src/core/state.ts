// Game state types — introduced in F3.
//
// Design notes:
// - Game state is immutable; the reducer returns a new state per action.
// - Each card in play is a GameCard (instance), not a CardDef (definition).
//   GameCard.cardId references the CardDef in the registry.

export type GamePhase =
  | "preGame"
  | "setupHands"
  | "setupActive"
  | "setupBench"
  | "setupPrizes"
  | "draw"
  | "main"
  | "attack"
  | "between"
  | "gameOver";

export type StatusCondition =
  | "asleep"
  | "paralyzed"
  | "poisoned"
  | "burned"
  | "confused";

export type PlayerIndex = 0 | 1;

export interface GameCard {
  uid: string;
  cardId: string;
  damage: number;
  attachedEnergy: GameCard[];
  attachedTool: GameCard | null;
  evolutionStack: GameCard[];
  status: StatusCondition[];
  markers: Record<string, number | boolean>;
}

export interface PlayerState {
  deck: GameCard[];
  hand: GameCard[];
  active: GameCard | null;
  bench: (GameCard | null)[];
  prizes: GameCard[];
  discard: GameCard[];
  lostZone: GameCard[];
  hasPlayedSupporter: boolean;
  hasAttachedEnergy: boolean;
  retreatedThisTurn: boolean;
  setupReady: boolean;
}

export type Winner = PlayerIndex | "draw" | null;

export type WinReason =
  | "prizes"
  | "noBench"
  | "deckOut"
  | "concede"
  | "draw"
  | null;

export interface GameEvent {
  kind: string;
  payload?: Record<string, unknown>;
}

export interface GameState {
  players: [PlayerState, PlayerState];
  activePlayer: PlayerIndex;
  goesFirst: PlayerIndex;
  phase: GamePhase;
  turnNumber: number;
  stadium: GameCard | null;
  pendingPrompt: Prompt | null;
  log: GameEvent[];
  winner: Winner;
  winReason: WinReason;
  rngState: number;
}

export const BENCH_SIZE = 5;
export const HAND_DRAW = 7;
export const PRIZE_COUNT = 6;

export function emptyPlayer(): PlayerState {
  return {
    deck: [],
    hand: [],
    active: null,
    bench: new Array(BENCH_SIZE).fill(null),
    prizes: [],
    discard: [],
    lostZone: [],
    hasPlayedSupporter: false,
    hasAttachedEnergy: false,
    retreatedThisTurn: false,
    setupReady: false,
  };
}

export function emptyGameState(rngSeed: number): GameState {
  return {
    players: [emptyPlayer(), emptyPlayer()],
    activePlayer: 0,
    goesFirst: 0,
    phase: "preGame",
    turnNumber: 0,
    stadium: null,
    pendingPrompt: null,
    log: [],
    winner: null,
    winReason: null,
    rngState: rngSeed >>> 0,
  };
}

// Prompt types — interactive interrupt while reducer waits for response.

export type Prompt =
  | {
      kind: "selectActiveSetup";
      player: PlayerIndex;
      eligibleUids: string[];
    }
  | {
      kind: "selectBenchSetup";
      player: PlayerIndex;
      eligibleUids: string[];
      maxCount: number;
    }
  | {
      kind: "selectTarget";
      player: PlayerIndex;
      message: string;
      eligibleUids: string[];
      minCount: number;
      maxCount: number;
    }
  | {
      kind: "selectFromList";
      player: PlayerIndex;
      message: string;
      cardIds: string[];
      minCount: number;
      maxCount: number;
    }
  | {
      kind: "coinFlip";
      player: PlayerIndex;
      count: number;
    }
  | {
      kind: "confirm";
      player: PlayerIndex;
      message: string;
    }
  | {
      kind: "chooseOption";
      player: PlayerIndex;
      message: string;
      options: string[];
    };
