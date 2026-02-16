"use client";

import { BattleBoard } from "@/components/battle/board/BattleBoard";
import { useEffect, useState, useCallback, useRef } from "react";
import { Card } from "@/types/card";
import { useDeckContext } from "@/components/deck/DeckContext";
import { useSocket } from "@/components/socket/SocketContext";
import { StoredDeck } from "@/services/deck-storage";
import { initializeGame, SetupResult } from "@/engine/battle-setup";
import { GameState, GameCard } from "@/engine/game-state";
import { zoneSize } from "@/engine/zones";
import { processAction, startFirstTurn, GameAction } from "@/engine/game-controller";
import Link from "next/link";

export default function BattlePageClient() {
  const { validDecks, loading: decksLoading } = useDeckContext();
  const { socket, isConnected } = useSocket();
  const [cardIndex, setCardIndex] = useState<Map<string, Card>>(new Map());
  const [cardsLoading, setCardsLoading] = useState(true);

  const [selectedDeck1, setSelectedDeck1] = useState<string>("");
  const [selectedDeck2, setSelectedDeck2] = useState<string>("");
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [matchFound, setMatchFound] = useState(false);

  // Load card data
  useEffect(() => {
    async function loadData() {
      const data = await import("@/data/cards/_index.json");
      const cards = data.default as Card[];
      const index = new Map<string, Card>();
      cards.forEach((c) => index.set(c.id, c));
      setCardIndex(index);
      setCardsLoading(false);
    }
    loadData();
  }, []);

  const cardLookup = useCallback(
    (id: string) => cardIndex.get(id),
    [cardIndex]
  );

  // Auto-select decks if only one or two available
  useEffect(() => {
    if (validDecks.length >= 1 && !selectedDeck1) {
      setSelectedDeck1(validDecks[0].id);
    }
    if (validDecks.length >= 2 && !selectedDeck2) {
      setSelectedDeck2(validDecks[1].id);
    }
  }, [validDecks, selectedDeck1, selectedDeck2]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    function onMatchFound(data: any) {
      console.log("Match found!", data);
      setIsMatchmaking(false);
      setMatchFound(true);
      // Wait for game_start event
    }

    function onGameStart(data: any) {
      console.log("Game started!", data);
      if (data.gameState) {
        setGameState(data.gameState);
      }
      if (typeof data.yourPlayerId === "number") {
        console.log("Assigned Player ID:", data.yourPlayerId);
        setMyPlayerId(data.yourPlayerId);
      }
    }

    function onStateUpdate(data: any) {
      console.log("State update received", data);
      if (data.gameState) {
        setGameState(data.gameState);
      }
    }

    socket.on("matchmaking:found", onMatchFound);
    socket.on("game:start", onGameStart);
    socket.on("game:state_update", onStateUpdate);

    return () => {
      socket.off("matchmaking:found", onMatchFound);
      socket.off("game:start", onGameStart);
      socket.off("game:state_update", onStateUpdate);
    };
  }, [socket]);

  // Track whether we're in local mode or online mode
  const isLocalGame = useRef(false);

  const handleEndTurn = useCallback(() => {
    if (!gameState) return;

    if (isLocalGame.current) {
      // Local game: use GameController
      const result = processAction(gameState, gameState.currentPlayer, { type: "end_turn" });
      setGameState(result.newState);
    } else if (socket) {
      // Online game: emit via socket
      socket.emit("game:action", {
        gameId: gameState.gameId,
        action: { type: "end_turn" }
      });
    }
  }, [socket, gameState]);

  /**
   * Handle all game actions from BattleBoard for local play.
   */
  const handleLocalAction = useCallback((action: GameAction) => {
    if (!gameState || !isLocalGame.current) return;

    const playerIndex = gameState.currentPlayer;
    const result = processAction(gameState, playerIndex, action);

    if (result.success) {
      setGameState(result.newState);
    } else {
      console.warn(`[LocalGame] Action failed: ${result.error}`);
    }
  }, [gameState]);

  /**
   * Start a local battle.
   * Accepts an optional overrideDeck2Id so that the caller can pass
   * a deck ID directly without waiting for React state to update.
   */
  const handleStartBattle = useCallback((overrideDeck2Id?: string) => {
    const deck1 = validDecks.find((d) => d.id === selectedDeck1);
    const deck2Id = overrideDeck2Id || selectedDeck2;
    const deck2 = validDecks.find((d) => d.id === deck2Id);

    if (!deck1 || !deck2) {
      console.warn("[BattlePage] Missing deck:", { deck1: !!deck1, deck2: !!deck2, selectedDeck1, deck2Id });
      return;
    }

    console.log("[BattlePage] Starting local battle...");
    console.log(`  Player 1: ${deck1.name}`);
    console.log(`  Player 2: ${deck2.name}`);

    const result = initializeGame(deck1, deck2, cardLookup, "玩家 1", "AI 对手", { fullPreparation: true });
    setSetupResult(result);

    if (result.success && result.gameState) {
      // Mark as local game
      isLocalGame.current = true;
      setMyPlayerId(0); // Player 1 = index 0

      // Start the first turn (draw phase → main phase)
      const readyState = startFirstTurn(result.gameState);
      setGameState(readyState);
      console.log("[BattlePage] Local game started successfully");
    } else {
      console.error("[BattlePage] Game initialization failed:", result.errors);
    }
  }, [selectedDeck1, selectedDeck2, validDecks, cardLookup]);

  const handleStartMatchmaking = useCallback(() => {
    if (!socket || !selectedDeck1) return;
    
    // Get the full deck object to send card IDs
    const deck = validDecks.find(d => d.id === selectedDeck1);
    if (!deck) return;

    // Convert to simple card ID list for server
    const cardIds: string[] = [];
    deck.cards.forEach(c => {
      if (c.found && c.cardId) {
        for (let i = 0; i < c.quantity; i++) {
          cardIds.push(c.cardId);
        }
      }
    });

    setIsMatchmaking(true);
    socket.emit("matchmaking:join", { 
      deckId: selectedDeck1,
      deckName: deck.name,
      cards: cardIds
    });
  }, [socket, selectedDeck1, validDecks]);

  const handleCancelMatchmaking = useCallback(() => {
    if (!socket) return;
    setIsMatchmaking(false);
    socket.emit("matchmaking:cancel");
  }, [socket]);

  const isLoading = decksLoading || cardsLoading;

  if (isLoading) {
    return (
      <div className="py-8 text-center text-zinc-500">加载中...</div>
    );
  }

  // No decks available
  if (validDecks.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
          尚未导入卡组
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          请先在卡组页面导入至少两副合法卡组，才能开始对战。
        </p>
        <Link
          href="/deck"
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          前往导入卡组 →
        </Link>
      </div>
    );
  }



  // Game in progress — show game state
  if (gameState) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950">
        <BattleBoard
          gameState={gameState}
          currentPlayerId={
            isLocalGame.current
              ? (gameState.currentPlayer === 0 ? "p1" : "p2") // Local: show from current player's perspective
              : (myPlayerId === 1 ? "p2" : "p1") // Online: fixed perspective
          }
          onAction={(action: any) => {
            if (isLocalGame.current) {
              // Route all actions through the local GameController
              handleLocalAction(action as GameAction);
            } else {
              // Online mode: send via socket
              if (socket && action.type) {
                socket.emit("game:action", {
                  gameId: gameState.gameId,
                  action
                });
              }
            }
          }}
        />
        {/* Game Over Overlay */}
        {gameState.phase === "game_over" && gameState.winner && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
            <div className="rounded-2xl bg-zinc-900 p-8 text-center shadow-2xl">
              <h2 className="text-3xl font-bold text-yellow-400">
                🏆 游戏结束
              </h2>
              <p className="mt-4 text-xl text-zinc-100">
                {gameState.players[gameState.winner.playerIndex].name} 获胜！
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                {gameState.winner.condition === "prizes_taken" && "拿完了所有奖励卡"}
                {gameState.winner.condition === "no_bench_pokemon" && "对方场上没有宝可梦了"}
                {gameState.winner.condition === "deck_out" && "对方无法抽牌"}
                {gameState.winner.condition === "concede" && "对方认输"}
              </p>
              <button
                onClick={() => {
                  setGameState(null);
                  setSetupResult(null);
                  isLocalGame.current = false;
                }}
                className="mt-6 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
              >
                返回大厅
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Matchmaking Searching View
  if (isMatchmaking) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">正在寻找对手...</h3>
        <p className="mt-2 text-zinc-500">预计等待时间: 3 秒</p>
        <button
          onClick={handleCancelMatchmaking}
          className="mt-8 rounded-full border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          取消匹配
        </button>
      </div>
    );
  }

  // Deck selection phase
  return (
    <div className="space-y-6">
      {/* Socket Status */}
      <div className={`flex items-center gap-2 text-sm ${isConnected ? 'text-green-600' : 'text-amber-600'}`}>
        <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-amber-500'}`}></div>
        {isConnected ? '已连接服务器' : '未连接服务器 (请使用 npm run dev:socket 启动)'}
      </div>

      {/* Setup errors */}
      {setupResult && !setupResult.success && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <h4 className="font-medium text-red-700 dark:text-red-300">
            对战初始化失败
          </h4>
          <ul className="mt-2 space-y-1">
            {setupResult.errors.map((e, i) => (
              <li key={i} className="text-sm text-red-600 dark:text-red-400">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mode Selection Tabs (Visual only for now) */}
      <div className="border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex gap-6">
          <button className="border-b-2 border-transparent px-1 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
            本地/AI 对战
          </button>
          <button className="border-b-2 border-blue-500 px-1 py-2 text-sm font-medium text-blue-600 dark:text-blue-400">
            在线匹配 (Beta)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Player 1 deck */}
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            选择你的卡组
          </label>
          <select
            value={selectedDeck1}
            onChange={(e) => setSelectedDeck1(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">选择卡组...</option>
            {validDecks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name} ({deck.totalCards} 张)
              </option>
            ))}
          </select>
          {selectedDeck1 && (
            <DeckPreview deck={validDecks.find((d) => d.id === selectedDeck1)} />
          )}
        </div>

        {/* Local AI Setup (Optional) */}
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
           <h4 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">在线匹配说明</h4>
           <p className="text-sm text-zinc-500">
             点击下方按钮开始寻找对手。匹配成功后将自动进入对战。
             <br/>
             <span className="text-xs opacity-75">目前仅支持模拟匹配 (3秒后自动成功)</span>
           </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          onClick={handleStartMatchmaking}
          disabled={!selectedDeck1 || !isConnected}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isConnected ? '开始在线匹配' : '服务器未连接'}
        </button>
        
        <button
          onClick={() => {
              // Determine deck2 immediately (don't rely on async state)
              let deck2Id = selectedDeck2;
              if (!deck2Id && validDecks.length >= 2) {
                deck2Id = validDecks[1].id;
                setSelectedDeck2(deck2Id); // also update state for display
              } else if (!deck2Id && validDecks.length === 1) {
                // Only 1 deck: use the same deck for both sides (mirror match)
                deck2Id = validDecks[0].id;
                setSelectedDeck2(deck2Id);
              }
              // Pass deck2Id directly to avoid React state race condition
              handleStartBattle(deck2Id);
          }}
          disabled={!selectedDeck1}
          className="w-full rounded-lg border border-zinc-300 bg-white px-6 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          本地测试对战
        </button>
      </div>

    </div>
  );
}

// ─── Sub-components ───

function PlayerField({
  player,
  isCurrentPlayer,
}: {
  player: GameState["players"][0];
  isCurrentPlayer: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        isCurrentPlayer
          ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950"
          : "border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {player.name}
        {isCurrentPlayer && (
          <span className="ml-2 text-sm text-blue-500">(当前回合)</span>
        )}
      </h3>

      {/* Active Pokemon */}
      <div className="mt-3 rounded-lg border border-zinc-300 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          战斗区
        </p>
        {player.active ? (
          <GameCardMini card={player.active} />
        ) : (
          <p className="mt-1 text-sm text-zinc-400">空</p>
        )}
      </div>

      {/* Bench */}
      <div className="mt-2 rounded-lg border border-zinc-300 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          备战区 ({zoneSize(player.bench)}/5)
        </p>
        {zoneSize(player.bench) > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {player.bench.cards.map((gc) => (
              <GameCardMini key={gc.instanceId} card={gc} compact />
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-400">空</p>
        )}
      </div>

      {/* Stats row */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
        <div>
          <p className="text-xs text-zinc-400">牌组</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{zoneSize(player.deck)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">手牌</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{zoneSize(player.hand)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">奖励卡</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{zoneSize(player.prizes)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">弃牌堆</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{zoneSize(player.discard)}</p>
        </div>
      </div>
    </div>
  );
}

function GameCardMini({ card, compact }: { card: GameCard; compact?: boolean }) {
  const hp = card.card.hp ? parseInt(card.card.hp, 10) : 0;
  const currentHp = hp > 0 ? hp - card.damageCounters * 10 : 0;

  if (compact) {
    return (
      <div className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-600">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          {card.card.name}
        </span>
        {hp > 0 && (
          <span className="ml-1 text-zinc-400">
            {currentHp}/{hp}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-3">
      <div>
        <p className="font-medium text-zinc-800 dark:text-zinc-200">
          {card.card.name}
        </p>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {hp > 0 && (
            <span>
              HP: {currentHp}/{hp}
            </span>
          )}
          {card.card.types && card.card.types.length > 0 && (
            <span>
              {card.card.types.join("/")}
            </span>
          )}
          {card.statusConditions.length > 0 && (
            <span className="text-red-500">
              {card.statusConditions.join(", ")}
            </span>
          )}
        </div>
        {card.card.attacks && card.card.attacks.length > 0 && (
          <div className="mt-1 text-xs text-zinc-500">
            {card.card.attacks.map((a, i) => (
              <span key={i}>
                {a.name}
                {a.damage ? ` (${a.damage})` : ""}
                {i < card.card.attacks!.length - 1 ? " | " : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeckPreview({ deck }: { deck?: StoredDeck }) {
  if (!deck) return null;

  const pokemon = deck.cards.filter((c) => c.category === "pokemon");
  const trainers = deck.cards.filter((c) => c.category === "trainer");
  const energy = deck.cards.filter((c) => c.category === "energy");

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-zinc-400">宝可梦</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            {pokemon.reduce((s, c) => s + c.quantity, 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">训练家</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            {trainers.reduce((s, c) => s + c.quantity, 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">能量</p>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            {energy.reduce((s, c) => s + c.quantity, 0)}
          </p>
        </div>
      </div>
      {deck.warnings.length > 0 && (
        <p className="mt-2 text-xs text-yellow-500">
          {deck.warnings.length} 个警告
        </p>
      )}
    </div>
  );
}
