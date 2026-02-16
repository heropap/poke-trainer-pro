"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/types/card";
import { useDeckContext } from "@/components/deck/DeckContext";
import { StoredDeck } from "@/services/deck-storage";
import { initializeGame, SetupResult } from "@/engine/battle-setup";
import { GameState, GameCard } from "@/engine/game-state";
import { zoneSize } from "@/engine/zones";
import Link from "next/link";

export default function BattlePageClient() {
  const { validDecks, loading: decksLoading } = useDeckContext();
  const [cardIndex, setCardIndex] = useState<Map<string, Card>>(new Map());
  const [cardsLoading, setCardsLoading] = useState(true);

  const [selectedDeck1, setSelectedDeck1] = useState<string>("");
  const [selectedDeck2, setSelectedDeck2] = useState<string>("");
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

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

  const handleStartBattle = useCallback(() => {
    const deck1 = validDecks.find((d) => d.id === selectedDeck1);
    const deck2 = validDecks.find((d) => d.id === selectedDeck2);

    if (!deck1 || !deck2) return;

    console.log("[BattlePage] Starting battle...");
    console.log(`  Player 1: ${deck1.name}`);
    console.log(`  Player 2: ${deck2.name}`);

    const result = initializeGame(deck1, deck2, cardLookup, "玩家 1", "AI 对手", { fullPreparation: true });
    setSetupResult(result);

    if (result.success && result.gameState) {
      setGameState(result.gameState);
      console.log("[BattlePage] Game initialized successfully");
    } else {
      console.error("[BattlePage] Game initialization failed:", result.errors);
    }
  }, [selectedDeck1, selectedDeck2, validDecks, cardLookup]);

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
      <div className="space-y-6">
        {/* Game info bar */}
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
          <div>
            <p className="font-medium text-green-700 dark:text-green-300">
              对战进行中 — 第 {gameState.turn} 回合 — {gameState.phase === "draw" ? "抽牌阶段" : gameState.phase === "main" ? "主阶段" : gameState.phase === "attack" ? "攻击阶段" : gameState.phase}
            </p>
            <p className="text-sm text-green-600 dark:text-green-400">
              {gameState.players[0].name} vs {gameState.players[1].name}
              {" | "}
              当前回合: {gameState.players[gameState.currentPlayer].name}
            </p>
          </div>
          <button
            onClick={() => {
              setGameState(null);
              setSetupResult(null);
            }}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
          >
            结束对战
          </button>
        </div>

        {/* Battle field — both players */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {gameState.players.map((player, idx) => (
            <PlayerField
              key={player.id}
              player={player}
              isCurrentPlayer={gameState.currentPlayer === idx}
            />
          ))}
        </div>

        {/* Event log */}
        {gameState.log.length > 0 && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
            <h3 className="border-b border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
              对战日志 ({gameState.log.length} 条)
            </h3>
            <div className="max-h-64 overflow-y-auto p-3">
              {gameState.log.map((event, i) => (
                <div
                  key={i}
                  className="border-b border-zinc-100 py-1.5 text-sm last:border-0 dark:border-zinc-800"
                >
                  <span className="text-zinc-400">
                    [{event.type}]
                  </span>{" "}
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {event.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {setupResult && setupResult.warnings.length > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
            <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              警告
            </h4>
            <ul className="mt-1 space-y-1">
              {setupResult.warnings.map((w, i) => (
                <li key={i} className="text-sm text-yellow-600 dark:text-yellow-400">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Deck selection phase
  return (
    <div className="space-y-6">
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

      {/* Deck selection */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Player 1 deck */}
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            玩家 1 卡组
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

        {/* Player 2 / AI deck */}
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            对手卡组 (AI)
          </label>
          <select
            value={selectedDeck2}
            onChange={(e) => setSelectedDeck2(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">选择卡组...</option>
            {validDecks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name} ({deck.totalCards} 张)
              </option>
            ))}
          </select>
          {selectedDeck2 && (
            <DeckPreview deck={validDecks.find((d) => d.id === selectedDeck2)} />
          )}
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={handleStartBattle}
        disabled={!selectedDeck1 || !selectedDeck2}
        className="w-full rounded-lg bg-zinc-900 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        开始对战
      </button>

      {validDecks.length < 2 && (
        <p className="text-center text-sm text-zinc-500">
          提示: 至少需要两副合法卡组才能对战。
          <Link href="/deck" className="ml-1 text-blue-500 hover:text-blue-600">
            前往导入 →
          </Link>
        </p>
      )}
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
