/**
 * Battle Preparation Phase
 *
 * Implements the PTCG setup procedure after initial hands are drawn:
 * 1. Mulligan resolution (no basic Pokemon → reshuffle & redraw, opponent may draw extra)
 * 2. Coin flip to determine who goes first
 * 3. Basic Pokemon placement (active slot + optional bench)
 * 4. Prize card setup (6 cards from deck)
 * 5. Transition to first turn's draw phase
 *
 * Official PTCG rules reference:
 * - Each player draws 7 cards
 * - If no basic Pokemon in hand → reveal hand, shuffle back, draw 7 again (mulligan)
 * - Opponent may draw 1 extra card per mulligan
 * - Both players place one basic Pokemon face-down as Active
 * - Both players may place basic Pokemon face-down on Bench (up to 5)
 * - Both players set 6 Prize cards face-down from deck
 * - Flip coin → winner chooses who goes first
 * - Reveal Active and Bench Pokemon, begin game
 */

import {
  GameState,
  GameCard,
  logEvent,
} from "./game-state";
import {
  shuffleZone,
  drawMultiple,
  addCards,
  hasBasicPokemon,
  getBasicPokemon,
  removeCard,
  zoneSize,
} from "./zones";

// ───────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────

export const INITIAL_HAND_SIZE = 7;
export const PRIZE_CARD_COUNT = 6;
export const MAX_BENCH_SIZE = 5;
export const MAX_MULLIGAN_ROUNDS = 20; // Safety limit to prevent infinite loops

// ───────────────────────────────────────────────
// Mulligan Resolution
// ───────────────────────────────────────────────

export interface MulliganResult {
  /** Number of mulligans player 0 took */
  player0Mulligans: number;
  /** Number of mulligans player 1 took */
  player1Mulligans: number;
  /** Whether the mulligan phase completed successfully */
  success: boolean;
  /** Error if mulligan failed (e.g. exceeded max rounds) */
  error?: string;
}

/**
 * Perform a single mulligan for a player:
 * shuffle hand back into deck, reshuffle, draw 7 new cards.
 *
 * @returns The number of cards drawn (should be INITIAL_HAND_SIZE unless deck is short)
 */
export function performSingleMulligan(
  state: GameState,
  playerIndex: 0 | 1
): number {
  const player = state.players[playerIndex];

  // Move all hand cards back into the deck
  const handCards = player.hand.cards.splice(0, player.hand.cards.length);
  addCards(player.deck, handCards);

  // Reshuffle the deck
  shuffleZone(player.deck);

  // Draw a new hand
  const drawn = drawMultiple(player.deck, INITIAL_HAND_SIZE);
  addCards(player.hand, drawn);

  logEvent(
    state,
    playerIndex,
    "mulligan",
    `${player.name} 进行了 Mulligan：将手牌洗回牌组，重新抽取 ${drawn.length} 张牌`
  );

  return drawn.length;
}

/**
 * Resolve mulligans for both players.
 *
 * Rules:
 * - If a player has no Basic Pokemon in hand, they must mulligan
 * - After all mulligans, the opponent may draw 1 extra card per mulligan
 * - If both players need mulligan, both do it simultaneously
 * - Repeat until both have at least one Basic Pokemon in hand
 */
export function resolveMulligans(state: GameState): MulliganResult {
  let p0Mulligans = 0;
  let p1Mulligans = 0;

  for (let round = 0; round < MAX_MULLIGAN_ROUNDS; round++) {
    const p0NeedsMulligan = !hasBasicPokemon(state.players[0].hand);
    const p1NeedsMulligan = !hasBasicPokemon(state.players[1].hand);

    // Both players have basics — done
    if (!p0NeedsMulligan && !p1NeedsMulligan) {
      break;
    }

    // Perform mulligans for whoever needs them
    if (p0NeedsMulligan) {
      performSingleMulligan(state, 0);
      p0Mulligans++;
    }
    if (p1NeedsMulligan) {
      performSingleMulligan(state, 1);
      p1Mulligans++;
    }

    // Safety check: if we've reached max rounds, something is wrong
    if (round === MAX_MULLIGAN_ROUNDS - 1) {
      const msg = `Mulligan 超过最大轮数 (${MAX_MULLIGAN_ROUNDS})，可能牌组中没有基础宝可梦`;
      logEvent(state, 0, "mulligan", msg);
      return {
        player0Mulligans: p0Mulligans,
        player1Mulligans: p1Mulligans,
        success: false,
        error: msg,
      };
    }
  }

  // After mulligans, opponents may draw extra cards
  if (p0Mulligans > 0 && zoneSize(state.players[1].deck) >= p0Mulligans) {
    const extra = drawMultiple(state.players[1].deck, p0Mulligans);
    addCards(state.players[1].hand, extra);
    logEvent(
      state,
      1,
      "draw_card",
      `${state.players[1].name} 因对手 Mulligan ${p0Mulligans} 次，额外抽取 ${extra.length} 张牌`
    );
  }

  if (p1Mulligans > 0 && zoneSize(state.players[0].deck) >= p1Mulligans) {
    const extra = drawMultiple(state.players[0].deck, p1Mulligans);
    addCards(state.players[0].hand, extra);
    logEvent(
      state,
      0,
      "draw_card",
      `${state.players[0].name} 因对手 Mulligan ${p1Mulligans} 次，额外抽取 ${extra.length} 张牌`
    );
  }

  if (p0Mulligans > 0 || p1Mulligans > 0) {
    logEvent(
      state,
      0,
      "mulligan",
      `Mulligan 阶段结束: ${state.players[0].name} ${p0Mulligans} 次, ${state.players[1].name} ${p1Mulligans} 次`
    );
  }

  return {
    player0Mulligans: p0Mulligans,
    player1Mulligans: p1Mulligans,
    success: true,
  };
}

// ───────────────────────────────────────────────
// Coin Flip
// ───────────────────────────────────────────────

export interface CoinFlipResult {
  /** Which player won the coin flip (0 or 1) */
  winner: 0 | 1;
  /** The raw result: "heads" or "tails" */
  result: "heads" | "tails";
}

/**
 * Flip a coin to determine who goes first.
 * Player 0 calls heads. If heads, player 0 goes first; otherwise player 1.
 *
 * @param randomFn Optional random function for testing (returns 0-1)
 */
export function flipCoin(
  state: GameState,
  randomFn: () => number = Math.random
): CoinFlipResult {
  const result = randomFn() < 0.5 ? "heads" : "tails";
  const winner: 0 | 1 = result === "heads" ? 0 : 1;

  state.currentPlayer = winner;

  logEvent(
    state,
    winner,
    "game_start",
    `掷硬币结果: ${result === "heads" ? "正面" : "反面"} — ${state.players[winner].name} 先攻`,
    { coinResult: result, firstPlayer: winner }
  );

  return { winner, result };
}

// ───────────────────────────────────────────────
// Basic Pokemon Placement
// ───────────────────────────────────────────────

export interface PlacementChoice {
  /** instanceId of the Basic Pokemon to place as Active */
  activeInstanceId: string;
  /** instanceIds of Basic Pokemon to place on Bench (0-5) */
  benchInstanceIds: string[];
}

export interface PlacementResult {
  success: boolean;
  errors: string[];
}

/**
 * Validate that a placement choice is legal.
 */
export function validatePlacement(
  state: GameState,
  playerIndex: 0 | 1,
  choice: PlacementChoice
): string[] {
  const errors: string[] = [];
  const player = state.players[playerIndex];
  const hand = player.hand;

  // Check active card exists in hand and is a basic Pokemon
  const activeCard = hand.cards.find(
    (c) => c.instanceId === choice.activeInstanceId
  );
  if (!activeCard) {
    errors.push(`指定的战斗宝可梦 (${choice.activeInstanceId}) 不在手牌中`);
  } else if (
    activeCard.card.supertype !== "Pokémon" ||
    !activeCard.card.subtypes.includes("Basic")
  ) {
    errors.push(`${activeCard.card.name} 不是基础宝可梦，不能放置到战斗区`);
  }

  // Check bench cards
  if (choice.benchInstanceIds.length > MAX_BENCH_SIZE) {
    errors.push(`备战区最多放置 ${MAX_BENCH_SIZE} 只宝可梦`);
  }

  // Ensure no duplicates
  const allIds = [choice.activeInstanceId, ...choice.benchInstanceIds];
  const uniqueIds = new Set(allIds);
  if (uniqueIds.size !== allIds.length) {
    errors.push("不能将同一张卡牌放置到多个位置");
  }

  for (const benchId of choice.benchInstanceIds) {
    const benchCard = hand.cards.find((c) => c.instanceId === benchId);
    if (!benchCard) {
      errors.push(`指定的备战宝可梦 (${benchId}) 不在手牌中`);
    } else if (
      benchCard.card.supertype !== "Pokémon" ||
      !benchCard.card.subtypes.includes("Basic")
    ) {
      errors.push(`${benchCard.card.name} 不是基础宝可梦，不能放置到备战区`);
    }
  }

  return errors;
}

/**
 * Place basic Pokemon from hand to active slot and bench.
 *
 * @param state The game state
 * @param playerIndex Which player (0 or 1)
 * @param choice Which cards to place where
 */
export function placeBasicPokemon(
  state: GameState,
  playerIndex: 0 | 1,
  choice: PlacementChoice
): PlacementResult {
  const errors = validatePlacement(state, playerIndex, choice);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const player = state.players[playerIndex];

  // Place active Pokemon
  const activeCard = removeCard(player.hand, choice.activeInstanceId);
  if (!activeCard) {
    return {
      success: false,
      errors: ["无法从手牌中移除指定的战斗宝可梦"],
    };
  }
  activeCard.playedThisTurn = true;
  player.active = activeCard;

  logEvent(
    state,
    playerIndex,
    "play_pokemon",
    `${player.name} 将 ${activeCard.card.name} 放置到战斗区`,
    { cardName: activeCard.card.name, instanceId: activeCard.instanceId }
  );

  // Place bench Pokemon
  for (const benchId of choice.benchInstanceIds) {
    const benchCard = removeCard(player.hand, benchId);
    if (benchCard) {
      benchCard.playedThisTurn = true;
      player.bench.cards.push(benchCard);

      logEvent(
        state,
        playerIndex,
        "play_pokemon",
        `${player.name} 将 ${benchCard.card.name} 放置到备战区`,
        { cardName: benchCard.card.name, instanceId: benchCard.instanceId }
      );
    }
  }

  return { success: true, errors: [] };
}

// ───────────────────────────────────────────────
// Auto-placement (for AI or simple mode)
// ───────────────────────────────────────────────

/**
 * Automatically choose which basic Pokemon to place.
 * Strategy: place the highest-HP basic as active, rest on bench.
 *
 * @returns A PlacementChoice or null if no basic Pokemon available
 */
export function autoPlaceBasicPokemon(
  state: GameState,
  playerIndex: 0 | 1
): PlacementChoice | null {
  const player = state.players[playerIndex];
  const basics = getBasicPokemon(player.hand);

  if (basics.length === 0) {
    return null;
  }

  // Sort by HP descending — highest HP as active
  const sorted = [...basics].sort((a, b) => {
    const hpA = parseInt(a.card.hp || "0", 10);
    const hpB = parseInt(b.card.hp || "0", 10);
    return hpB - hpA;
  });

  const active = sorted[0];
  const benchCandidates = sorted.slice(1, MAX_BENCH_SIZE + 1);

  return {
    activeInstanceId: active.instanceId,
    benchInstanceIds: benchCandidates.map((c) => c.instanceId),
  };
}

// ───────────────────────────────────────────────
// Prize Card Setup
// ───────────────────────────────────────────────

/**
 * Set prize cards for a player (draw 6 from deck, place face-down).
 */
export function setPrizeCards(
  state: GameState,
  playerIndex: 0 | 1
): number {
  const player = state.players[playerIndex];
  const prizes = drawMultiple(player.deck, PRIZE_CARD_COUNT);
  addCards(player.prizes, prizes);

  logEvent(
    state,
    playerIndex,
    "game_start",
    `${player.name} 设置了 ${prizes.length} 张奖励卡`,
    { prizeCount: prizes.length }
  );

  return prizes.length;
}

// ───────────────────────────────────────────────
// Full Preparation Flow
// ───────────────────────────────────────────────

export interface PrepareResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  mulliganResult: MulliganResult;
  coinFlipResult: CoinFlipResult | null;
}

/**
 * Execute the complete preparation phase:
 * 1. Draw initial hands (if not already drawn)
 * 2. Resolve mulligans
 * 3. Auto-place basic Pokemon for both players
 * 4. Set prize cards
 * 5. Flip coin for first player
 * 6. Transition to draw phase
 *
 * This function assumes the game state has already been initialized with
 * shuffled decks (via initializeGame from battle-setup.ts).
 *
 * @param state GameState with decks loaded and shuffled, hands drawn
 * @param randomFn Optional random function for coin flip (for testing)
 */
export function executePreparation(
  state: GameState,
  randomFn?: () => number
): PrepareResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  state.phase = "setup";

  // ─── Step 1: Resolve Mulligans ───

  state.phase = "mulligan";
  const mulliganResult = resolveMulligans(state);

  if (!mulliganResult.success) {
    errors.push(mulliganResult.error || "Mulligan 解决失败");
    return {
      success: false,
      errors,
      warnings,
      mulliganResult,
      coinFlipResult: null,
    };
  }

  if (mulliganResult.player0Mulligans > 0) {
    warnings.push(
      `${state.players[0].name} 进行了 ${mulliganResult.player0Mulligans} 次 Mulligan`
    );
  }
  if (mulliganResult.player1Mulligans > 0) {
    warnings.push(
      `${state.players[1].name} 进行了 ${mulliganResult.player1Mulligans} 次 Mulligan`
    );
  }

  // ─── Step 2: Auto-place Basic Pokemon ───

  state.phase = "setup";

  for (let p = 0; p < 2; p++) {
    const pIdx = p as 0 | 1;
    const choice = autoPlaceBasicPokemon(state, pIdx);

    if (!choice) {
      // This shouldn't happen after mulligan resolution, but handle defensively
      errors.push(`${state.players[pIdx].name} 手牌中没有基础宝可梦可放置`);
      return {
        success: false,
        errors,
        warnings,
        mulliganResult,
        coinFlipResult: null,
      };
    }

    const placementResult = placeBasicPokemon(state, pIdx, choice);
    if (!placementResult.success) {
      errors.push(...placementResult.errors);
      return {
        success: false,
        errors,
        warnings,
        mulliganResult,
        coinFlipResult: null,
      };
    }
  }

  // ─── Step 3: Set Prize Cards ───

  for (let p = 0; p < 2; p++) {
    const pIdx = p as 0 | 1;
    const prizeCount = setPrizeCards(state, pIdx);
    if (prizeCount < PRIZE_CARD_COUNT) {
      warnings.push(
        `${state.players[pIdx].name} 只设置了 ${prizeCount} 张奖励卡（牌组卡牌不足）`
      );
    }
  }

  // ─── Step 4: Coin Flip ───

  const coinFlipResult = flipCoin(state, randomFn);

  // ─── Step 5: Transition to Draw Phase ───

  state.phase = "draw";
  state.turn = 1;
  state.isFirstTurn = true;

  logEvent(
    state,
    coinFlipResult.winner,
    "game_start",
    `准备阶段完成，第 1 回合开始，${state.players[coinFlipResult.winner].name} 先攻`
  );

  return {
    success: true,
    errors,
    warnings,
    mulliganResult,
    coinFlipResult,
  };
}
