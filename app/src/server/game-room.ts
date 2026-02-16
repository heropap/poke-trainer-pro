
import {
  GameState,
  Player,
  GameCard,
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

export class GameRoom {
  public id: string;
  public state: GameState;
  public player1SocketId: string;
  public player2SocketId: string;
  public cardLookup: (id: string) => Card | undefined;

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
   * Get the state masked for a specific player (hidden zones concealed)
   * TODO: Implement proper masking (hide opponent hand/deck/prizes)
   */
  public getMaskedState(playerSocketId: string): GameState {
    // For now, return full state (transparency for beta)
    // In production, we would clone and redact opponent's hand/deck
    return this.state;
  }

  /**
   * Handle a player action using the unified GameController.
   * Returns the ActionResult so the server can broadcast the updated state.
   */
  public handleAction(socketId: string, action: any): ActionResult {
    const playerIndex = (socketId === this.player1SocketId ? 0 : 1) as 0 | 1;

    const result = processAction(this.state, playerIndex, action as GameAction);

    if (result.success) {
      // processAction returns a shallow clone; update our authoritative state
      this.state = result.newState;
    }

    return result;
  }
}
