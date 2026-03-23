"use client";

import React from "react";
import { motion } from "framer-motion";
import { GameState, WinCondition } from "@/engine/game-state";

interface GameResultsOverlayProps {
  gameState: GameState;
  localPlayerIndex: number;
  onReturnToLobby: () => void;
  onRematch?: () => void;
}

const WIN_CONDITION_TEXT: Record<WinCondition, string> = {
  prizes_taken: "拿完了所有奖励卡",
  no_bench_pokemon: "对方场上没有宝可梦了",
  deck_out: "对方无法抽牌",
  concede: "对方认输",
};

interface PlayerStats {
  name: string;
  knockouts: number;
  prizesTaken: number;
  trainersUsed: number;
  energyAttached: number;
  totalDamageDealt: number;
}

function computeStats(gameState: GameState): [PlayerStats, PlayerStats] {
  const stats: [PlayerStats, PlayerStats] = [
    { name: gameState.players[0].name, knockouts: 0, prizesTaken: 0, trainersUsed: 0, energyAttached: 0, totalDamageDealt: 0 },
    { name: gameState.players[1].name, knockouts: 0, prizesTaken: 0, trainersUsed: 0, energyAttached: 0, totalDamageDealt: 0 },
  ];

  for (const event of gameState.log) {
    const idx = event.playerIndex;
    switch (event.type) {
      case "knockout":
        stats[idx].knockouts++;
        break;
      case "prize_taken":
        stats[idx].prizesTaken += (event.data?.count as number) || 1;
        break;
      case "use_trainer":
      case "use_supporter":
        stats[idx].trainersUsed++;
        break;
      case "attach_energy":
        stats[idx].energyAttached++;
        break;
      case "damage":
        stats[idx].totalDamageDealt += (event.data?.damage as number) || 0;
        break;
    }
  }

  // Also count prizes from zone difference (initial 6 minus remaining)
  const prizeTarget = gameState.rules?.prizeCardsPerPlayer ?? 6;
  stats[0].prizesTaken = Math.max(stats[0].prizesTaken, prizeTarget - gameState.players[0].prizes.cards.length);
  stats[1].prizesTaken = Math.max(stats[1].prizesTaken, prizeTarget - gameState.players[1].prizes.cards.length);

  return stats;
}

function StatRow({ label, v1, v2, highlight }: { label: string; v1: number; v2: number; highlight?: "higher" | "none" }) {
  const h = highlight === "higher";
  return (
    <div className="flex items-center py-1.5">
      <span className={`w-12 text-right font-mono text-sm ${h && v1 > v2 ? "text-yellow-400 font-bold" : "text-zinc-300"}`}>
        {v1}
      </span>
      <span className="mx-3 flex-1 text-center text-xs text-zinc-500">{label}</span>
      <span className={`w-12 text-left font-mono text-sm ${h && v2 > v1 ? "text-yellow-400 font-bold" : "text-zinc-300"}`}>
        {v2}
      </span>
    </div>
  );
}

export function GameResultsOverlay({
  gameState,
  localPlayerIndex,
  onReturnToLobby,
  onRematch,
}: GameResultsOverlayProps) {
  if (!gameState.winner) return null;

  const iWon = gameState.winner.playerIndex === localPlayerIndex;
  const winnerName = gameState.players[gameState.winner.playerIndex].name;
  const conditionText = WIN_CONDITION_TEXT[gameState.winner.condition] || "游戏结束";
  const stats = computeStats(gameState);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75"
    >
      <motion.div
        initial={{ scale: 0.85, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 250 }}
        className="mx-4 w-full max-w-[440px] rounded-2xl bg-zinc-900 p-6 shadow-2xl"
      >
        {/* Result Header */}
        <div className="text-center">
          <motion.h2
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
            className={`text-3xl font-bold ${iWon ? "text-yellow-400" : "text-zinc-400"}`}
          >
            {iWon ? "Victory!" : "Defeat"}
          </motion.h2>
          <p className="mt-2 text-lg text-zinc-200">{winnerName} 获胜</p>
          <p className="mt-1 text-sm text-zinc-500">{conditionText}</p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {gameState.turn} 回合
          </p>
        </div>

        {/* Stats Comparison */}
        <div className="mt-5 rounded-xl bg-zinc-800/50 px-4 py-3">
          {/* Player names header */}
          <div className="flex items-center pb-2 border-b border-zinc-700/50">
            <span className="w-12 text-right text-xs font-medium text-blue-400 truncate">
              {stats[0].name}
            </span>
            <span className="mx-3 flex-1 text-center text-[10px] text-zinc-600 uppercase tracking-wider">
              统计
            </span>
            <span className="w-12 text-left text-xs font-medium text-red-400 truncate">
              {stats[1].name}
            </span>
          </div>

          <StatRow label="击倒" v1={stats[0].knockouts} v2={stats[1].knockouts} highlight="higher" />
          <StatRow label="奖赏卡" v1={stats[0].prizesTaken} v2={stats[1].prizesTaken} highlight="higher" />
          <StatRow label="训练师" v1={stats[0].trainersUsed} v2={stats[1].trainersUsed} highlight="none" />
          <StatRow label="贴能" v1={stats[0].energyAttached} v2={stats[1].energyAttached} highlight="none" />
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex gap-3">
          {onRematch && (
            <button
              onClick={onRematch}
              className="flex-1 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:from-orange-600 hover:to-red-600"
            >
              再来一局
            </button>
          )}
          <button
            onClick={onReturnToLobby}
            className={`rounded-lg px-6 py-2.5 text-sm font-medium transition-colors ${
              onRematch
                ? "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                : "flex-1 bg-blue-600 text-white hover:bg-blue-500"
            }`}
          >
            返回大厅
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
