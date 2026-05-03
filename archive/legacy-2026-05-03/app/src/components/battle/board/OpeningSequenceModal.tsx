"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export interface OpeningSequenceProps {
  /** Coin flip raw result */
  coinResult: "heads" | "tails";
  /** Which player index won the flip */
  flipWinner: 0 | 1;
  /** Player names [player0, player1] */
  playerNames: [string, string];
  /** Which player index is the local human (for showing choice UI) */
  myIndex: 0 | 1;
  /** Whether opponent is AI (AI auto-chooses first) */
  isAI: boolean;
  /** Called when the sequence finishes; firstPlayer = chosen first player index */
  onComplete: (firstPlayer: 0 | 1) => void;
}

type Phase = "flip" | "result" | "choice" | "done";

export function OpeningSequenceModal({
  coinResult,
  flipWinner,
  playerNames,
  myIndex,
  isAI,
  onComplete,
}: OpeningSequenceProps) {
  const [phase, setPhase] = useState<Phase>("flip");
  const [coinFace, setCoinFace] = useState<"heads" | "tails" | null>(null);

  // Phase 1: Coin flip animation (1.8s spin, then reveal)
  useEffect(() => {
    if (phase !== "flip") return;

    const revealTimer = setTimeout(() => {
      setCoinFace(coinResult);
      setPhase("result");
    }, 1800);

    return () => clearTimeout(revealTimer);
  }, [phase, coinResult]);

  // Phase 2: Show result for 1.5s, then transition
  useEffect(() => {
    if (phase !== "result") return;

    const timer = setTimeout(() => {
      const iWon = flipWinner === myIndex;
      if (iWon && !isAI) {
        // Human won — show choice
        setPhase("choice");
      } else if (isAI && flipWinner === 1) {
        // AI won the flip — AI always picks first
        setPhase("done");
        onComplete(1);
      } else if (!iWon) {
        // Opponent won (in local 2P or online), auto-proceed (opponent goes first)
        setPhase("done");
        onComplete(flipWinner);
      } else {
        // Human won in AI mode (flipWinner === 0) — show choice
        setPhase("choice");
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [phase, flipWinner, myIndex, isAI, onComplete]);

  const handleChoice = useCallback((goFirst: boolean) => {
    setPhase("done");
    if (goFirst) {
      onComplete(myIndex);
    } else {
      onComplete(myIndex === 0 ? 1 : 0);
    }
  }, [myIndex, onComplete]);

  if (phase === "done") return null;

  const winnerName = playerNames[flipWinner];
  const isHeads = coinResult === "heads";

  const content = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80">
      <div className="flex w-[420px] flex-col items-center rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 p-8 shadow-2xl">
        {/* Title */}
        <h2 className="mb-6 text-xl font-bold text-white">
          {phase === "flip" && "掷硬币决定先攻..."}
          {phase === "result" && `${winnerName} 赢得硬币翻转！`}
          {phase === "choice" && "选择先攻或后攻"}
        </h2>

        {/* 3D Coin */}
        <div className="perspective-[600px] mb-8 h-32 w-32">
          <div
            className={`relative h-full w-full transition-transform duration-[1.6s] ${
              phase === "flip"
                ? "animate-coin-spin"
                : ""
            }`}
            style={{
              transformStyle: "preserve-3d",
              transform:
                phase !== "flip" && coinFace
                  ? coinFace === "heads"
                    ? "rotateY(0deg)"
                    : "rotateY(180deg)"
                  : undefined,
            }}
          >
            {/* Front face (Heads / 正) */}
            <div
              className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-yellow-400 bg-gradient-to-br from-yellow-300 to-yellow-500 text-4xl font-black text-zinc-900 shadow-lg"
              style={{ backfaceVisibility: "hidden" }}
            >
              正
            </div>
            {/* Back face (Tails / 反) */}
            <div
              className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-zinc-400 bg-gradient-to-br from-zinc-400 to-zinc-600 text-4xl font-black text-zinc-100 shadow-lg"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              反
            </div>
          </div>
        </div>

        {/* Result text */}
        {phase === "result" && (
          <p className="mb-2 text-lg text-zinc-300">
            硬币结果：
            <span className={isHeads ? "font-bold text-yellow-400" : "font-bold text-zinc-300"}>
              {isHeads ? "正面" : "反面"}
            </span>
          </p>
        )}

        {/* Choice buttons */}
        {phase === "choice" && (
          <div className="flex w-full gap-4">
            <button
              onClick={() => handleChoice(true)}
              className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-4 text-lg font-bold text-white shadow-lg transition-all hover:scale-105 hover:from-blue-500 hover:to-blue-400 active:scale-95"
            >
              先攻
              <span className="mt-1 block text-xs font-normal text-blue-200">
                先抽牌，但不能攻击
              </span>
            </button>
            <button
              onClick={() => handleChoice(false)}
              className="flex-1 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 py-4 text-lg font-bold text-white shadow-lg transition-all hover:scale-105 hover:from-orange-500 hover:to-orange-400 active:scale-95"
            >
              后攻
              <span className="mt-1 block text-xs font-normal text-orange-200">
                后手行动，第一回合可攻击
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return typeof window !== "undefined" ? createPortal(content, document.body) : null;
}
