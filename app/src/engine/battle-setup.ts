/**
 * Battle Setup
 *
 * Bridges the deck import system and the game engine.
 * Converts stored deck card IDs into GameCards and initializes
 * the game state for battle.
 *
 * Setup flow:
 * 1. Load deck card IDs from StoredDeck
 * 2. Resolve each ID to a Card from the card service
 * 3. Create GameCard instances for each card
 * 4. Shuffle the deck
 * 5. Draw initial hand (7 cards)
 * 6. Check for mulligan (no basic Pokemon in hand)
 * 7. Set prize cards (6 cards)
 * 8. Transition to main game phase
 */

import { Card } from "@/types/card";
import {
  GameState,
  GameCard,
  createGameState,
  createGameCard,
  createZone,
  logEvent,
} from "./game-state";
import { shuffleZone, drawMultiple, addCards, hasBasicPokemon } from "./zones";
import { StoredDeck, getDeckCardIds, checkDeckIntegrity } from "@/services/deck-storage";

const INITIAL_HAND_SIZE = 7;
const PRIZE_CARD_COUNT = 6;

export interface SetupResult {
  success: boolean;
  gameState: GameState | null;
  errors: string[];
  warnings: string[];
}

export interface DeckLoadResult {
  gameCards: GameCard[];
  missingCards: string[];
  totalLoaded: number;
  totalExpected: number;
}

/**
 * Load deck cards — resolve card IDs to GameCard instances
 *
 * @param deck The stored deck to load
 * @param cardLookup Function to resolve card ID → Card data
 */
export function loadDeckCards(
  deck: StoredDeck,
  cardLookup: (id: string) => Card | undefined
): DeckLoadResult {
  const cardIds = getDeckCardIds(deck);
  const gameCards: GameCard[] = [];
  const missingCards: string[] = [];

  console.log(
    `[BattleSetup] Loading deck "${deck.name}": ${cardIds.length} card instances from ${deck.cards.length} unique cards`
  );

  for (const cardId of cardIds) {
    const card = cardLookup(cardId);
    if (card) {
      gameCards.push(createGameCard(card));
    } else {
      missingCards.push(cardId);
      console.warn(`[BattleSetup] Card not found in database: ${cardId}`);
    }
  }

  if (missingCards.length > 0) {
    console.error(
      `[BattleSetup] ${missingCards.length} card(s) missing from database:`,
      missingCards
    );
  }

  console.log(
    `[BattleSetup] Loaded ${gameCards.length}/${cardIds.length} cards successfully`
  );

  return {
    gameCards,
    missingCards,
    totalLoaded: gameCards.length,
    totalExpected: cardIds.length,
  };
}

/**
 * Initialize a full game from two stored decks
 *
 * @param deck1 Player 1's deck
 * @param deck2 Player 2's deck
 * @param cardLookup Function to resolve card IDs
 * @param player1Name Display name for player 1
 * @param player2Name Display name for player 2
 */
export function initializeGame(
  deck1: StoredDeck,
  deck2: StoredDeck,
  cardLookup: (id: string) => Card | undefined,
  player1Name = "玩家 1",
  player2Name = "玩家 2"
): SetupResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ─── Pre-flight checks ───

  // Check deck integrity
  const deck1Missing = checkDeckIntegrity(deck1);
  const deck2Missing = checkDeckIntegrity(deck2);

  if (deck1Missing.length > 0) {
    warnings.push(
      `${player1Name} 的卡组有 ${deck1Missing.length} 张未解析卡牌: ${deck1Missing.slice(0, 3).join(", ")}${deck1Missing.length > 3 ? "..." : ""}`
    );
  }
  if (deck2Missing.length > 0) {
    warnings.push(
      `${player2Name} 的卡组有 ${deck2Missing.length} 张未解析卡牌: ${deck2Missing.slice(0, 3).join(", ")}${deck2Missing.length > 3 ? "..." : ""}`
    );
  }

  // Check deck validity
  if (!deck1.isValid) {
    errors.push(`${player1Name} 的卡组验证失败: ${deck1.errors.join("; ")}`);
  }
  if (!deck2.isValid) {
    errors.push(`${player2Name} 的卡组验证失败: ${deck2.errors.join("; ")}`);
  }

  if (errors.length > 0) {
    return { success: false, gameState: null, errors, warnings };
  }

  // ─── Load cards ───

  const load1 = loadDeckCards(deck1, cardLookup);
  const load2 = loadDeckCards(deck2, cardLookup);

  if (load1.missingCards.length > 0) {
    warnings.push(
      `${player1Name} 有 ${load1.missingCards.length} 张卡牌在数据库中未找到`
    );
  }
  if (load2.missingCards.length > 0) {
    warnings.push(
      `${player2Name} 有 ${load2.missingCards.length} 张卡牌在数据库中未找到`
    );
  }

  // Must have at least some cards
  if (load1.totalLoaded === 0) {
    errors.push(`${player1Name} 的卡组为空（所有卡牌均未找到）`);
    return { success: false, gameState: null, errors, warnings };
  }
  if (load2.totalLoaded === 0) {
    errors.push(`${player2Name} 的卡组为空（所有卡牌均未找到）`);
    return { success: false, gameState: null, errors, warnings };
  }

  // ─── Create game state ───

  const state = createGameState(player1Name, player2Name);
  state.phase = "setup";

  logEvent(state, 0, "game_start", `对战开始: ${player1Name} vs ${player2Name}`, {
    deck1Name: deck1.name,
    deck2Name: deck2.name,
    deck1Cards: load1.totalLoaded,
    deck2Cards: load2.totalLoaded,
  });

  // Load cards into deck zones
  state.players[0].deck = createZone(load1.gameCards);
  state.players[1].deck = createZone(load2.gameCards);

  // Shuffle both decks
  shuffleZone(state.players[0].deck);
  shuffleZone(state.players[1].deck);

  logEvent(state, 0, "game_start", "双方洗牌完成");

  // ─── Draw initial hands ───

  for (let p = 0; p < 2; p++) {
    const player = state.players[p as 0 | 1];
    const drawn = drawMultiple(player.deck, INITIAL_HAND_SIZE);
    addCards(player.hand, drawn);

    logEvent(state, p as 0 | 1, "draw_card", `${player.name} 抽了 ${drawn.length} 张初始手牌`);
  }

  // ─── Check mulligan ───

  for (let p = 0; p < 2; p++) {
    const player = state.players[p as 0 | 1];
    if (!hasBasicPokemon(player.hand)) {
      logEvent(
        state,
        p as 0 | 1,
        "mulligan",
        `${player.name} 手牌中没有基础宝可梦，需要重抽 (Mulligan)`
      );
      warnings.push(`${player.name} 需要 Mulligan（手牌无基础宝可梦）`);
      // Mulligan logic will be handled in the turn flow system
      // For now, just flag it
    }
  }

  // ─── Set prize cards ───

  for (let p = 0; p < 2; p++) {
    const player = state.players[p as 0 | 1];
    const prizes = drawMultiple(player.deck, PRIZE_CARD_COUNT);
    addCards(player.prizes, prizes);

    logEvent(state, p as 0 | 1, "game_start", `${player.name} 设置了 ${prizes.length} 张奖励卡`);
  }

  // Transition to draw phase
  state.phase = "draw";
  state.turn = 1;

  logEvent(state, 0, "game_start", `第 1 回合开始，${state.players[0].name} 先手`);

  console.log(
    `[BattleSetup] Game initialized: ${player1Name} (${state.players[0].deck.cards.length} in deck, ${state.players[0].hand.cards.length} in hand) vs ${player2Name} (${state.players[1].deck.cards.length} in deck, ${state.players[1].hand.cards.length} in hand)`
  );

  return { success: true, gameState: state, errors, warnings };
}
