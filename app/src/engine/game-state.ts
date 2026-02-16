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
  /** Whether this card's ability was used this turn (for once-per-turn abilities) */
  abilityUsedThisTurn: boolean;
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
  /** Whether energy has been attached this turn */
  energyAttachedThisTurn: boolean;
  /** Whether a supporter was used this turn */
  supporterUsedThisTurn: boolean;
}

// ───────────────────────────────────────────────
// Game Phases & Turn Flow
// ───────────────────────────────────────────────

export type GamePhase =
  | "not_started"     // Game not yet initialized
  | "setup"           // Initial setup (draw hand, place basics, set prizes)
  | "mulligan"        // Handling mulligan (no basic Pokemon)
  | "draw"            // Start of turn: draw a card
  | "main"            // Main phase: play cards, attach energy, etc.
  | "attack"          // Attack phase: choose and resolve attack
  | "between_turns"   // Between turns: check status conditions
  | "game_over";      // Game ended

export type WinCondition =
  | "prizes_taken"        // All 6 prizes collected
  | "no_bench_pokemon"    // Opponent has no Pokemon left
  | "deck_out"            // Opponent cannot draw
  | "concede";            // Opponent gave up

// ───────────────────────────────────────────────
// Game State: The complete state of a battle
// ───────────────────────────────────────────────

export interface GameState {
  /** Unique game ID */
  gameId: string;
  /** Two players */
  players: [Player, Player];
  /** Which player's turn (0 or 1) */
  currentPlayer: 0 | 1;
  /** Current game phase */
  phase: GamePhase;
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
  | "heal";

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
    abilityUsedThisTurn: false,
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
    energyAttachedThisTurn: false,
    supporterUsedThisTurn: false,
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
    phase: "not_started",
    turn: 0,
    isFirstTurn: true,
    winner: null,
    log: [],
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
