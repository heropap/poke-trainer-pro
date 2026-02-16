
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

export class GameRoom {
  public id: string;
  public state: GameState;
  public player1SocketId: string;
  public player2SocketId: string;
  public cardLookup: (id: string) => Card | undefined;
  public createdAt: number;
  public lastActivityAt: number;

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
  public handleAction(socketId: string, action: any): ActionResult {
    const playerIndex = this.getPlayerIndex(socketId);
    if (playerIndex === -1) {
      return {
        success: false,
        error: "Not a player in this game",
        newState: this.state,
      };
    }

    this.lastActivityAt = Date.now();
    const result = processAction(this.state, playerIndex, action as GameAction);

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
   * The disconnected player concedes.
   */
  public handleDisconnect(socketId: string): ActionResult | null {
    const playerIndex = this.getPlayerIndex(socketId);
    if (playerIndex === -1) return null;
    if (this.isGameOver()) return null;

    // Auto-concede for the disconnected player
    const result = processAction(this.state, playerIndex, { type: "concede" });
    if (result.success) {
      this.state = result.newState;
    }
    return result;
  }
}
