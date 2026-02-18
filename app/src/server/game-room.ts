/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  GameState,
  Player,
  GameCard,
  Zone,
  createGameState,
  createGameCard,
  createZone,
  logEvent
} from "../engine/game-state";
import {
  shuffleZone,
  drawMultiple,
  addCards,
  hasBasicPokemon
} from "../engine/zones";
import {
  executePreparation,
  INITIAL_HAND_SIZE,
  PRIZE_CARD_COUNT
} from "../engine/battle-prepare";
import { processAction, startFirstTurn, GameAction, ActionResult } from "../engine/game-controller";
import { Card } from "../types/card";

// Interface for what we need from a stored deck on the server
export interface ServerDeck {
  id: string;
  name: string;
  cards: string[]; // Array of card IDs
}

/**
 * Create a face-down placeholder card.
 * The client sees a card exists but not its identity.
 */
function createHiddenCard(instanceId: string): GameCard {
  return {
    instanceId,
    cardId: "__hidden__",
    card: {
      id: "__hidden__",
      name: "???",
      supertype: "Pokémon",
      subtypes: [],
      number: "0",
      rarity: "",
      legalities: {},
      images: { small: "", large: "" },
    } as Card,
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
 * Create a zone with hidden placeholder cards (preserves count but hides identities).
 */
function createHiddenZone(zone: Zone): Zone {
  return {
    cards: zone.cards.map((c) => createHiddenCard(c.instanceId)),
  };
}

/** Grace period before auto-concede on disconnect (ms) */
export const DISCONNECT_GRACE_MS = 60_000; // 60 seconds

/** Default turn time limit in seconds */
export const TURN_TIME_LIMIT = 90;

export class GameRoom {
  public id: string;
  public state: GameState;
  public player1SocketId: string;
  public player2SocketId: string;
  /** Persistent player IDs that survive reconnections */
  public player1Id: string;
  public player2Id: string;
  public cardLookup: (id: string) => Card | undefined;
  public createdAt: number;
  public lastActivityAt: number;
  /** Tracks which players are currently disconnected */
  public disconnectedPlayers: Map<string, { playerIndex: 0 | 1; disconnectedAt: number; timer: ReturnType<typeof setTimeout> | null }> = new Map();
  /** Turn timer interval ID */
  public turnTimerInterval: ReturnType<typeof setInterval> | null = null;
  /** Callback when turn times out */
  public onTurnTimeout: ((room: GameRoom) => void) | null = null;

  constructor(
    id: string,
    p1SocketId: string,
    p1Name: string,
    p2SocketId: string,
    p2Name: string,
    cardLookup: (id: string) => Card | undefined
  ) {
    this.id = id;
    this.player1SocketId = p1SocketId;
    this.player2SocketId = p2SocketId;
    // Generate persistent player IDs (survive socket reconnections)
    this.player1Id = `pid-${p1SocketId}-${Date.now()}`;
    this.player2Id = `pid-${p2SocketId}-${Date.now()}`;
    this.cardLookup = cardLookup;
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();

    // Initialize empty game state
    this.state = createGameState(p1Name, p2Name);
    // Sync gameState.gameId with room id so the client can reference it
    this.state.gameId = id;
  }

  /**
   * Initialize the game with decks
   */
  public initialize(deck1: ServerDeck, deck2: ServerDeck): boolean {
    // Load cards
    const p1Cards = this.loadCards(deck1.cards);
    const p2Cards = this.loadCards(deck2.cards);

    if (p1Cards.length === 0 || p2Cards.length === 0) {
      console.error("Failed to load cards for one or both decks");
      return false;
    }

    // Set up initial state
    this.state.phase = "setup";
    this.state.players[0].deck = createZone(p1Cards);
    this.state.players[1].deck = createZone(p2Cards);

    // Shuffle
    shuffleZone(this.state.players[0].deck);
    shuffleZone(this.state.players[1].deck);

    // Draw initial hands
    for (let p = 0; p < 2; p++) {
      const player = this.state.players[p as 0 | 1];
      const drawn = drawMultiple(player.deck, INITIAL_HAND_SIZE);
      addCards(player.hand, drawn);

      logEvent(this.state, p as 0 | 1, "draw_card", `${player.name} 抽了 ${drawn.length} 张初始手牌`);
    }

    // Execute preparation (Mulligan, etc.)
    const prepResult = executePreparation(this.state, Math.random);

    if (!prepResult.success) {
      console.error("Preparation failed:", prepResult.errors);
      return false;
    }

    // Start the first turn (transition from setup/draw → main phase)
    this.state = startFirstTurn(this.state);
    this.lastActivityAt = Date.now();

    return true;
  }

  /**
   * Helper to load GameCards from IDs
   */
  private loadCards(cardIds: string[]): GameCard[] {
    const gameCards: GameCard[] = [];
    for (const id of cardIds) {
      const card = this.cardLookup(id);
      if (card) {
        gameCards.push(createGameCard(card));
      }
    }
    return gameCards;
  }

  /**
   * Get player index from socket ID. Returns -1 if not found.
   */
  public getPlayerIndex(socketId: string): 0 | 1 | -1 {
    if (socketId === this.player1SocketId) return 0;
    if (socketId === this.player2SocketId) return 1;
    return -1;
  }

  /**
   * Check if a socket belongs to this room.
   */
  public hasPlayer(socketId: string): boolean {
    return socketId === this.player1SocketId || socketId === this.player2SocketId;
  }

  /**
   * Get the state masked for a specific player.
   * Hides opponent's hand, deck contents, and prize card contents.
   * Public zones (active, bench, discard) remain visible.
   */
  public getMaskedState(playerSocketId: string): GameState {
    const playerIndex = this.getPlayerIndex(playerSocketId);
    if (playerIndex === -1) {
      // Unknown socket — return fully masked (spectator view)
      return this.state;
    }

    const opponentIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;

    // Deep clone the state so masking doesn't affect the authoritative copy
    const masked: GameState = JSON.parse(JSON.stringify(this.state));

    // Mask opponent's hidden zones
    const opp = masked.players[opponentIndex];

    // Hide hand card identities (opponent knows how many cards, not which ones)
    opp.hand = createHiddenZone(this.state.players[opponentIndex].hand);

    // Hide deck completely (only count matters)
    opp.deck = createHiddenZone(this.state.players[opponentIndex].deck);

    // Hide prize card identities (count visible, content hidden)
    opp.prizes = createHiddenZone(this.state.players[opponentIndex].prizes);

    // Also hide OWN deck and prizes (player shouldn't see their own deck order or prize contents)
    const me = masked.players[playerIndex];
    me.deck = createHiddenZone(this.state.players[playerIndex].deck);
    me.prizes = createHiddenZone(this.state.players[playerIndex].prizes);

    return masked;
  }

  /**
   * Handle a player action using the unified GameController.
   * Returns the ActionResult so the server can broadcast the updated state.
   */
  public async handleAction(
    socketId: string,
    action: { type: string; [key: string]: any }
  ): Promise<ActionResult> {
    const playerIndex = this.getPlayerIndex(socketId);
    if (playerIndex === -1) {
      return {
        success: false,
        error: "Not a player in this game",
        newState: this.state,
      };
    }

    this.lastActivityAt = Date.now();
    const result = await processAction(this.state, playerIndex, action as GameAction);

    if (result.success) {
      // processAction returns a shallow clone; update our authoritative state
      this.state = result.newState;
    }

    return result;
  }

  /**
   * Check if the game is over.
   */
  public isGameOver(): boolean {
    return this.state.phase === "game_over";
  }

  /**
   * Handle a player disconnecting mid-game.
   * The disconnected player concedes immediately.
   */
  public async handleDisconnect(socketId: string): Promise<ActionResult | null> {
    const playerIndex = this.getPlayerIndex(socketId);
    if (playerIndex === -1) return null;
    if (this.isGameOver()) return null;

    // Auto-concede for the disconnected player
    const result = await processAction(this.state, playerIndex, { type: "concede" });
    if (result.success) {
      this.state = result.newState;
    }
    return result;
  }

  /**
   * Mark a player as disconnected with a grace period (no immediate concede).
   * Used by the server layer to allow reconnection before conceding.
   */
  public markDisconnected(socketId: string): { playerId: string; playerIndex: 0 | 1 } | null {
    const playerIndex = this.getPlayerIndex(socketId);
    if (playerIndex === -1) return null;
    if (this.isGameOver()) return null;

    const playerId = playerIndex === 0 ? this.player1Id : this.player2Id;

    this.disconnectedPlayers.set(playerId, {
      playerIndex,
      disconnectedAt: Date.now(),
      timer: null, // Timer is set by the server layer (needs io reference)
    });

    return { playerId, playerIndex };
  }

  /**
   * Force-concede a disconnected player (called after grace period expires).
   */
  public async forceConcede(playerId: string): Promise<ActionResult | null> {
    const dc = this.disconnectedPlayers.get(playerId);
    if (!dc) return null;
    if (this.isGameOver()) return null;

    this.disconnectedPlayers.delete(playerId);

    const result = await processAction(this.state, dc.playerIndex, { type: "concede" });
    if (result.success) {
      this.state = result.newState;
    }
    return result;
  }

  /**
   * Reconnect a player by their persistent playerId.
   * Updates the socket ID so future actions route correctly.
   * Returns the player index or -1 if not found.
   */
  public reconnectPlayer(playerId: string, newSocketId: string): 0 | 1 | -1 {
    if (this.isGameOver()) return -1;

    let playerIndex: 0 | 1 | -1 = -1;
    if (playerId === this.player1Id) {
      this.player1SocketId = newSocketId;
      playerIndex = 0;
    } else if (playerId === this.player2Id) {
      this.player2SocketId = newSocketId;
      playerIndex = 1;
    }

    if (playerIndex !== -1) {
      // Cancel grace period timer
      const dc = this.disconnectedPlayers.get(playerId);
      if (dc?.timer) {
        clearTimeout(dc.timer);
      }
      this.disconnectedPlayers.delete(playerId);
      this.lastActivityAt = Date.now();
    }

    return playerIndex;
  }

  /**
   * Get player ID from socket ID
   */
  public getPlayerId(socketId: string): string | null {
    if (socketId === this.player1SocketId) return this.player1Id;
    if (socketId === this.player2SocketId) return this.player2Id;
    return null;
  }

  /**
   * Check if a player is currently disconnected
   */
  public isPlayerDisconnected(playerIndex: 0 | 1): boolean {
    const playerId = playerIndex === 0 ? this.player1Id : this.player2Id;
    return this.disconnectedPlayers.has(playerId);
  }

  /**
   * Start (or restart) the turn timer. Called at the beginning of each turn.
   */
  public startTurnTimer(): void {
    this.stopTurnTimer();

    this.state.turnTimer = {
      remaining: TURN_TIME_LIMIT,
      total: TURN_TIME_LIMIT,
      active: true,
    };

    this.turnTimerInterval = setInterval(() => {
      if (!this.state.turnTimer || !this.state.turnTimer.active) return;

      this.state.turnTimer.remaining -= 1;

      if (this.state.turnTimer.remaining <= 0) {
        this.state.turnTimer.remaining = 0;
        this.state.turnTimer.active = false;
        this.stopTurnTimer();

        // Trigger timeout callback (server handles auto end_turn)
        if (this.onTurnTimeout) {
          this.onTurnTimeout(this);
        }
      }
    }, 1000);
  }

  /**
   * Stop the turn timer.
   */
  public stopTurnTimer(): void {
    if (this.turnTimerInterval) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
  }

  /**
   * Cleanup all timers (call when game ends or room is destroyed)
   */
  public cleanup(): void {
    this.stopTurnTimer();
    for (const dc of this.disconnectedPlayers.values()) {
      if (dc.timer) clearTimeout(dc.timer);
    }
    this.disconnectedPlayers.clear();
  }
}
