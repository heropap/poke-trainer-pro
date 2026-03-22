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
 * 6. (Optional) Execute preparation phase (mulligan, placement, prizes, coin flip)
 * 7. (Optional) Set prize cards (if not using full preparation)
 * 8. Transition to first turn's draw phase
 */

import { Card } from "@/types/card";
import {
  GameState,
  GameCard,
  GamePhase,
  createGameState,
  createGameCard,
  createZone,
  logEvent,
} from "./game-state";
import { shuffleZone, drawMultiple, addCards, hasBasicPokemon } from "./zones";
import { StoredDeck, getDeckCardIds, getAllDeckCardEntries, checkDeckIntegrity } from "@/services/deck-storage";
import { executePreparation, INITIAL_HAND_SIZE, PRIZE_CARD_COUNT } from "./battle-prepare";
import { initializeEffects } from "./effects";
import { createProxyCard, ProxyCardEntry } from "./proxy-card";

export interface SetupResult {
  success: boolean;
  gameState: GameState | null;
  errors: string[];
  warnings: string[];
  /** Coin flip result from preparation phase (null if legacy mode or failed) */
  coinFlipResult?: { winner: 0 | 1; result: "heads" | "tails" } | null;
  /** Basic Pokemon in hand for players that need manual placement (key: playerIndex) */
  pendingPlacements?: Record<number, GameCard[]>;
}

export interface DeckLoadResult {
  gameCards: GameCard[];
  missingCards: string[];
  totalLoaded: number;
  totalExpected: number;
}

export interface InitializeGameOptions {
  /**
   * Run the full preparation phase (mulligan, basic placement, coin flip).
   * When false (default), only draws hands and sets prizes (legacy behavior).
   * When true, executes the complete PTCG setup procedure.
   */
  fullPreparation?: boolean;
  /** Optional random function for coin flip (for testing) */
  randomFn?: () => number;
  /**
   * Enable proxy card generation for missing database entries.
   * When true, cards not found in the database will be replaced with
   * minimal proxy cards instead of being skipped.
   */
  enableProxyCards?: boolean;
  /** Prize cards per player (default 6, supported 6/3/1) */
  prizeCardsPerPlayer?: number;
  /**
   * Player indices that should choose their placement manually (UI modal).
   * These players will NOT auto-place; their basic Pokemon are returned
   * in SetupResult.pendingPlacements.
   */
  manualPlacementPlayers?: (0 | 1)[];
}

/**
 * Load deck cards — resolve card IDs to GameCard instances
 *
 * @param deck The stored deck to load
 * @param cardLookup Function to resolve card ID → Card data
 * @param enableProxyCards When true, generate proxy cards for missing entries
 */
export function loadDeckCards(
  deck: StoredDeck,
  cardLookup: (id: string) => Card | undefined,
  enableProxyCards = false
): DeckLoadResult {
  const gameCards: GameCard[] = [];
  const missingCards: string[] = [];

  if (enableProxyCards) {
    // Proxy mode: iterate ALL card entries (including unfound ones)
    const allEntries = getAllDeckCardEntries(deck);
    let totalExpected = 0;

    for (const entry of allEntries) {
      for (let i = 0; i < entry.quantity; i++) {
        totalExpected++;
        if (entry.found && entry.cardId) {
          const card = cardLookup(entry.cardId);
          if (card) {
            gameCards.push(createGameCard(card));
          } else {
            // Card ID exists but not in database — generate proxy
            const proxyEntry: ProxyCardEntry = {
              name: entry.name,
              setCode: entry.setCode,
              number: entry.number,
              category: entry.category,
            };
            const proxyCard = createProxyCard(proxyEntry);
            gameCards.push(createGameCard(proxyCard));
            missingCards.push(`${entry.name} (proxy: db miss)`);
            console.warn(`[BattleSetup] Created proxy card for DB miss: ${entry.name} (${entry.cardId})`);
          }
        } else {
          // Card was never resolved during import — generate proxy
          const proxyEntry: ProxyCardEntry = {
            name: entry.name,
            setCode: entry.setCode,
            number: entry.number,
            category: entry.category,
          };
          const proxyCard = createProxyCard(proxyEntry);
          gameCards.push(createGameCard(proxyCard));
          missingCards.push(`${entry.name} (proxy: not found)`);
          console.warn(`[BattleSetup] Created proxy card for unfound: ${entry.name} (${entry.setCode} ${entry.number})`);
        }
      }
    }

    console.log(
      `[BattleSetup] Loading deck "${deck.name}": ${totalExpected} card instances (proxy mode ON, ${missingCards.length} proxies created)`
    );

    return {
      gameCards,
      missingCards,
      totalLoaded: gameCards.length,
      totalExpected,
    };
  }

  // Standard mode: only load found cards
  const cardIds = getDeckCardIds(deck);

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
 * @param options Configuration options (fullPreparation, randomFn)
 */
export function initializeGame(
  deck1: StoredDeck,
  deck2: StoredDeck,
  cardLookup: (id: string) => Card | undefined,
  player1Name = "玩家 1",
  player2Name = "玩家 2",
  options: InitializeGameOptions = {}
): SetupResult {
  const {
    fullPreparation = false,
    randomFn,
    enableProxyCards = false,
    prizeCardsPerPlayer,
    manualPlacementPlayers,
  } = options;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Initialize the card effects system (idempotent - safe to call multiple times)
  // Note: initializeEffects will be called again with loaded cards below for text parsing

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

  const load1 = loadDeckCards(deck1, cardLookup, enableProxyCards);
  const load2 = loadDeckCards(deck2, cardLookup, enableProxyCards);

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

  // Initialize effect system with all loaded cards for text-based auto-registration (Layer 3)
  const allLoadedCards = [
    ...load1.gameCards.map(gc => gc.card),
    ...load2.gameCards.map(gc => gc.card),
  ];
  initializeEffects(allLoadedCards);

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
  if (typeof prizeCardsPerPlayer === "number") {
    state.rules.prizeCardsPerPlayer = prizeCardsPerPlayer;
  }
  state.phase = GamePhase.SETUP;

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

  // ─── Full preparation OR legacy setup ───

  let coinFlipResult: { winner: 0 | 1; result: "heads" | "tails" } | null = null;

  if (fullPreparation) {
    // Full PTCG setup: mulligan → placement → prizes → coin flip
    const prepResult = executePreparation(state, randomFn, manualPlacementPlayers ? { manualPlacementPlayers } : undefined);

    if (!prepResult.success) {
      errors.push(...prepResult.errors);
      return { success: false, gameState: state, errors, warnings: [...warnings, ...prepResult.warnings] };
    }

    warnings.push(...prepResult.warnings);
    coinFlipResult = prepResult.coinFlipResult;

    // Pass through pending placements if any
    if (prepResult.pendingPlacements && Object.keys(prepResult.pendingPlacements).length > 0) {
      return {
        success: true,
        gameState: state,
        errors,
        warnings,
        coinFlipResult,
        pendingPlacements: prepResult.pendingPlacements,
      };
    }
  } else {
    // Legacy behavior: check mulligan (warn only), set prizes, transition to draw
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
      }
    }

    // Set prize cards
    for (let p = 0; p < 2; p++) {
      const player = state.players[p as 0 | 1];
      const prizeTarget = state.rules?.prizeCardsPerPlayer ?? PRIZE_CARD_COUNT;
      const prizes = drawMultiple(player.deck, prizeTarget);
      addCards(player.prizes, prizes);

      logEvent(state, p as 0 | 1, "game_start", `${player.name} 设置了 ${prizes.length} 张奖励卡`);
    }

    // Transition to draw phase
    state.phase = GamePhase.DRAW;
    state.turn = 1;

    logEvent(state, 0, "game_start", `第 1 回合开始，${state.players[0].name} 先手`);
  }

  console.log(
    `[BattleSetup] Game initialized: ${player1Name} (deck: ${state.players[0].deck.cards.length}, hand: ${state.players[0].hand.cards.length}, active: ${state.players[0].active?.card.name ?? "none"}) vs ${player2Name} (deck: ${state.players[1].deck.cards.length}, hand: ${state.players[1].hand.cards.length}, active: ${state.players[1].active?.card.name ?? "none"})`
  );

  return { success: true, gameState: state, errors, warnings, coinFlipResult };
}
