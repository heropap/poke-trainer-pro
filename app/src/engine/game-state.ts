/**
 * Game State Types & Management
 *
 * Core data structures for the Pokemon TCG battle engine.
 * Based on ryuu-play architecture with zones, actions, and turn flow.
 */

import { Card } from "@/types/card";

// ───────────────────────────────────────────────
// Zone: A collection of cards in a specific area
// ───────────────────────────────────────────────

export interface GameCard {
  /** Unique instance ID (same card can appear multiple times) */
  instanceId: string;
  /** Reference to the card data (from _index.json) */
  cardId: string;
  /** Resolved card data (name, HP, attacks, etc.) */
  card: Card;
  /** Current damage counters on this card (×10 damage each) */
  damageCounters: number;
  /** Attached energy cards */
  attachedEnergy: GameCard[];
  /** Attached tool cards */
  attachedTools: GameCard[];
  /** Status conditions (poisoned, burned, etc.) */
  statusConditions: StatusCondition[];
  /** Whether this card was played this turn (prevents same-turn evolution) */
  playedThisTurn: boolean;
  /** Whether this card was evolved this turn (prevents double evolution) */
  evolvedThisTurn: boolean;
  /** Whether this card's ability was used this turn (for once-per-turn abilities) */
  abilityUsedThisTurn: boolean;
  /** Persistent markers/counters for cross-turn effects (e.g., "can't attack next turn") */
  markers: Record<string, number>;
  /** Evolution stack: cards underneath this Pokemon (bottom = Basic, top = most recent pre-evolution) */
  evolutionStack: Array<{ cardId: string; card: Card }>;
}

export type StatusCondition =
  | "poisoned"
  | "burned"
  | "asleep"
  | "confused"
  | "paralyzed";

export interface Zone {
  cards: GameCard[];
}

// ───────────────────────────────────────────────
// Player: One side of the battle
// ───────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  /** The main deck zone (face-down pile) */
  deck: Zone;
  /** Cards in hand */
  hand: Zone;
  /** The active Pokemon in the battle zone */
  active: GameCard | null;
  /** Bench Pokemon (up to 5) */
  bench: Zone;
  /** Prize cards (6 at start) */
  prizes: Zone;
  /** Discard pile */
  discard: Zone;
  /** Lost Zone (cards removed from play) */
  lostZone: Zone;
  /** Whether energy has been attached this turn */
  energyAttachedThisTurn: boolean;
  /** Whether a supporter was used this turn */
  supporterUsedThisTurn: boolean;
  /** Number of mulligans taken during setup */
  mulliganCount: number;
}

// ───────────────────────────────────────────────
// Game Phases & Turn Flow
// ───────────────────────────────────────────────

export enum GamePhase {
  SETUP = "SETUP",
  MULLIGAN = "MULLIGAN",
  DRAW = "DRAW",
  MAIN = "MAIN",
  ATTACK = "ATTACK",
  CHECKUP = "CHECKUP",
  BETWEEN_TURNS = "BETWEEN_TURNS",
  GAME_OVER = "GAME_OVER"
}

export type WinCondition =
  | "prizes_taken"        // All 6 prizes collected
  | "no_bench_pokemon"    // Opponent has no Pokemon left
  | "deck_out"            // Opponent cannot draw
  | "concede";            // Opponent gave up

// ───────────────────────────────────────────────
// Game State: The complete state of a battle
// ───────────────────────────────────────────────

export interface TurnState {
  currentPlayerId: string;
  turnCount: number;
  currentPhase: GamePhase;
  
  // Turn-specific limits (Reset at the end of CHECKUP)
  hasAttachedEnergy: boolean;
  hasPlayedSupporter: boolean;
  hasPlayedStadium: boolean;
  hasRetreated: boolean;
  hasAttacked: boolean;
  hasUsedStadium: boolean;

  // VSTAR/GX tracking (Persists across turns)
  p1VstarUsed: boolean;
  p2VstarUsed: boolean;
}

export interface GameState {
  /** Unique game ID */
  gameId: string;
  /** Two players */
  players: [Player, Player];
  /** Which player's turn (0 or 1) */
  currentPlayer: 0 | 1;
  /** Current game phase (Legacy: synced with turnStatus.currentPhase) */
  phase: GamePhase;
  /** Turn status (FSM) */
  turnStatus: TurnState;
  /** Turn counter */
  turn: number;
  /** Whether this is the very first turn of the game */
  isFirstTurn: boolean;
  /** Game over info (null if game in progress) */
  winner: {
    playerIndex: 0 | 1;
    condition: WinCondition;
  } | null;
  /** Event log for UI display */
  log: GameEvent[];
  /** Pending user interaction */
  prompt: GamePrompt | null;
  /** Stadium card in play (shared between both players) */
  stadium: {
    card: GameCard;
    owner: 0 | 1;
  } | null;
  /** Active effect overrides (Phase 2: God Mode / Card Effects) */
  activeOverrides: {
    allowEvolutionTurn1?: boolean;
    skipEvolutionStage?: boolean;
    supporterUsedCountLimit?: number;
    godMode?: boolean; // Ultimate override
  };
  /** Rule configuration */
  rules: {
    prizeCardsPerPlayer: number;
  };
  /** Turn timer state (optional, for online games) */
  turnTimer: {
    /** Seconds remaining in the current turn */
    remaining: number;
    /** Total seconds allowed per turn */
    total: number;
    /** Whether the timer is active */
    active: boolean;
  } | null;
}

// ───────────────────────────────────────────────
// Game Events (logged actions for display)
// ───────────────────────────────────────────────

export interface GameEvent {
  timestamp: string;
  playerIndex: 0 | 1;
  type: GameEventType;
  message: string;
  data?: Record<string, unknown>;
}

export type GameEventType =
  | "game_start"
  | "draw_card"
  | "play_pokemon"
  | "evolve_pokemon"
  | "attach_energy"
  | "use_trainer"
  | "use_supporter"
  | "use_ability"
  | "attack"
  | "damage"
  | "knockout"
  | "prize_taken"
  | "retreat"
  | "status_effect"
  | "mulligan"
  | "game_over"
  | "coin_flip"
  | "status_damage"
  | "search_deck"
  | "heal"
  | "play_stadium"
  | "remove_stadium"
  | "manual_override"
  | "ability";

// ───────────────────────────────────────────────
// Game Prompt (for manual selection)
// ───────────────────────────────────────────────

/** Base prompt fields shared by all prompt types */
interface PromptBase {
  id: string;
  playerIndex: 0 | 1;
  message: string;
}

/** Select one or more cards from a zone */
export interface SelectCardsPrompt extends PromptBase {
  type: "select_cards";
  zone: "deck" | "discard" | "hand" | "bench" | "opponent_bench" | "own_field" | "prizes";
  min: number;
  max: number;
  filter?: {
    supertype?: string;
    subtypes?: string[];
    name?: string;
  };
  /** Explicit list of allowed card IDs (overrides zone/filter if present) */
  targets?: string[];
}

/** Coin flip prompt (visual + result) */
export interface CoinFlipPrompt extends PromptBase {
  type: "coin_flip";
  /** Number of coins to flip */
  count: number;
  /** Pre-determined results (server-authoritative). true = heads, false = tails */
  results?: boolean[];
}

/** Select a Pokemon from a specific zone */
export interface SelectPokemonPrompt extends PromptBase {
  type: "select_pokemon";
  zone: "bench" | "opponent_bench" | "active" | "opponent_active";
  /** Allowed instanceIds (if restricted) */
  targets?: string[];
  min: number;
  max: number;
}

/** Order/sort a list of cards (e.g. arrange prizes, reorder deck top) */
export interface OrderCardsPrompt extends PromptBase {
  type: "order_cards";
  /** Card instanceIds to order */
  cardIds: string[];
  /** The cards themselves (for display) */
  cards: GameCard[];
}

/** Choose from multiple options (e.g. choose an attack effect, choose a type) */
export interface ChooseOptionPrompt extends PromptBase {
  type: "choose_option";
  options: { id: string; label: string; description?: string }[];
  min: number;
  max: number;
}

/** Confirm or deny a yes/no question */
export interface ConfirmPrompt extends PromptBase {
  type: "confirm";
}

/** All 6 prompt types as a discriminated union */
export type GamePrompt =
  | SelectCardsPrompt
  | CoinFlipPrompt
  | SelectPokemonPrompt
  | OrderCardsPrompt
  | ChooseOptionPrompt
  | ConfirmPrompt;

// ───────────────────────────────────────────────
// Factory Functions
// ───────────────────────────────────────────────

let instanceCounter = 0;

/**
 * Create a GameCard from a Card data object
 */
export function createGameCard(card: Card): GameCard {
  instanceCounter++;
  return {
    instanceId: `gc-${instanceCounter}-${card.id}`,
    cardId: card.id,
    card,
    damageCounters: 0,
    attachedEnergy: [],
    attachedTools: [],
    statusConditions: [],
    playedThisTurn: false,
    evolvedThisTurn: false,
    abilityUsedThisTurn: false,
    markers: {},
    evolutionStack: [],
  };
}

/**
 * Create an empty Zone
 */
export function createZone(cards: GameCard[] = []): Zone {
  return { cards: [...cards] };
}

/**
 * Create a new Player with empty zones
 */
export function createPlayer(id: string, name: string): Player {
  return {
    id,
    name,
    deck: createZone(),
    hand: createZone(),
    active: null,
    bench: createZone(),
    prizes: createZone(),
    discard: createZone(),
    lostZone: createZone(),
    energyAttachedThisTurn: false,
    supporterUsedThisTurn: false,
    mulliganCount: 0,
  };
}

/**
 * Create the initial game state (before setup)
 */
export function createGameState(
  player1Name: string,
  player2Name: string
): GameState {
  return {
    gameId: `game-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    players: [
      createPlayer("p1", player1Name),
      createPlayer("p2", player2Name),
    ],
    currentPlayer: 0,
    phase: GamePhase.SETUP,
    turnStatus: {
      currentPlayerId: "p1",
      turnCount: 0,
      currentPhase: GamePhase.SETUP,
      hasAttachedEnergy: false,
      hasPlayedSupporter: false,
      hasPlayedStadium: false,
      hasRetreated: false,
      hasAttacked: false,
      hasUsedStadium: false,
      p1VstarUsed: false,
      p2VstarUsed: false,
    },
    turn: 0,
    isFirstTurn: true,
    winner: null,
    log: [],
    prompt: null,
    stadium: null,
    activeOverrides: {},
    rules: {
      prizeCardsPerPlayer: 6,
    },
    turnTimer: null,
  };
}

/**
 * Reset the instance counter (for testing)
 */
export function resetInstanceCounter(): void {
  instanceCounter = 0;
}

/**
 * Log a game event
 */
export function logEvent(
  state: GameState,
  playerIndex: 0 | 1,
  type: GameEventType,
  message: string,
  data?: Record<string, unknown>
): void {
  state.log.push({
    timestamp: new Date().toISOString(),
    playerIndex,
    type,
    message,
    data,
  });
}
