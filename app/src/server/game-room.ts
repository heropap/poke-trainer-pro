
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
import { 
  playActive,
  playBench,
  attachEnergy,
  performAttack
} from "../engine/game-actions";
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
   * Handle a player action
   */
  public handleAction(socketId: string, action: any): boolean {
    const playerIndex = socketId === this.player1SocketId ? 0 : 1;
    
    // Basic validation: is it this player's turn?
    if (this.state.currentPlayer !== playerIndex) {
      console.warn(`Player ${playerIndex} tried to act out of turn`);
      return false;
    }

    switch (action.type) {
      case "end_turn":
        this.endTurn();
        break;
      case "play_card":
        // Handle playing a card (Active, Bench, or Attach)
        if (action.targetZone === "active") {
          playActive(this.state, playerIndex, action.cardId);
        } else if (action.targetZone === "bench") {
          playBench(this.state, playerIndex, action.cardId);
        } else if (action.targetZone === "attach" && action.targetId) {
          attachEnergy(this.state, playerIndex, action.cardId, action.targetId);
        }
        break;
      case "attack":
        const result = performAttack(this.state, playerIndex, action.attackName);
        if (result.success) {
          if (!result.gameEnded) {
            this.endTurn();
          }
        } else {
          console.warn(`Attack failed: ${result.error}`);
          return false;
        }
        break;
      default:
        console.warn(`Unknown action type: ${action.type}`);
        return false;
    }
    
    return true;
  }

  private endTurn(): void {
    // Basic turn switching logic
    this.state.currentPlayer = this.state.currentPlayer === 0 ? 1 : 0;
    this.state.turn++;
    
    const currentPlayer = this.state.players[this.state.currentPlayer];
    currentPlayer.energyAttachedThisTurn = false;
    currentPlayer.supporterUsedThisTurn = false;
    
    // Draw a card for the new turn player
    const drawn = drawMultiple(currentPlayer.deck, 1);
    if (drawn.length > 0) {
      addCards(currentPlayer.hand, drawn);
      logEvent(this.state, this.state.currentPlayer, "draw_card", `${currentPlayer.name} 抽了一张牌`);
    } else {
      logEvent(this.state, this.state.currentPlayer, "game_over", `${currentPlayer.name} 牌组耗尽，无法抽牌！`);
    }
    
    this.state.phase = "main"; // Simplified phase transition
    
    logEvent(this.state, this.state.currentPlayer, "game_start", `第 ${this.state.turn} 回合开始，轮到 ${currentPlayer.name}`);
  }
}
