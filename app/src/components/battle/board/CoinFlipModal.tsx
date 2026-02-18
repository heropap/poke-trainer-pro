"use client";

import React, { useState, useEffect } from "react";
import { CoinFlipPrompt } from "@/engine/game-state";
import { createPortal } from "react-dom";

interface CoinFlipModalProps {
  prompt: CoinFlipPrompt;
  onDone: () => void;
}

export function CoinFlipModal({ prompt, onDone }: CoinFlipModalProps) {
  const [flipping, setFlipping] = useState(true);
  const [currentFlip, setCurrentFlip] = useState(0);
  const [revealed, setRevealed] = useState<boolean[]>([]);

  const results = prompt.results ?? Array.from({ length: prompt.count }, () => Math.random() > 0.5);

  useEffect(() => {
    if (currentFlip >= results.length) {
      // All coins flipped
      setFlipping(false);
      return;
    }

    // Animate each coin flip with a stagger delay
    const timer = setTimeout(() => {
      setRevealed(prev => [...prev, results[currentFlip]]);
      setCurrentFlip(prev => prev + 1);
    }, 800);

    return () => clearTimeout(timer);
  }, [currentFlip, results.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const headsCount = revealed.filter(r => r).length;
  const tailsCount = revealed.filter(r => !r).length;

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="w-[400px] rounded-2xl bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-center text-lg font-bold text-white">{prompt.message}</h3>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {Array.from({ length: prompt.count }).map((_, i) => {
            const isRevealed = i < revealed.length;
            const isHeads = isRevealed ? revealed[i] : null;
            const isAnimating = i === currentFlip && flipping;

            return (
              <div
                key={i}
                className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold transition-all duration-500 ${
                  isAnimating
                    ? "animate-spin bg-yellow-500/50"
                    : isRevealed
                      ? isHeads
                        ? "bg-yellow-500 text-zinc-900 scale-110"
                        : "bg-zinc-600 text-zinc-300 scale-110"
                      : "bg-zinc-700 text-zinc-500"
                }`}
              >
                {isRevealed ? (isHeads ? "正" : "反") : "?"}
              </div>
            );
          })}
        </div>

        {/* Results summary */}
        {!flipping && revealed.length === prompt.count && (
          <div className="mt-6 text-center">
            <p className="text-sm text-zinc-400">
              正面 <span className="font-bold text-yellow-400">{headsCount}</span> 次
              {" · "}
              反面 <span className="font-bold text-zinc-300">{tailsCount}</span> 次
            </p>
            <button
              onClick={onDone}
              className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              确认
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return typeof window !== "undefined" ? createPortal(content, document.body) : null;
}
