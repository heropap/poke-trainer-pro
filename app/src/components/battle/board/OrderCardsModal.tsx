"use client";

import React, { useState, useCallback } from "react";
import { OrderCardsPrompt, GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { createPortal } from "react-dom";

interface OrderCardsModalProps {
  prompt: OrderCardsPrompt;
  onConfirm: (orderedIds: string[]) => void;
}

export function OrderCardsModal({ prompt, onConfirm }: OrderCardsModalProps) {
  const [cards, setCards] = useState<GameCard[]>([...prompt.cards]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const moveCard = useCallback((from: number, to: number) => {
    setCards(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      moveCard(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const moveUp = (index: number) => {
    if (index > 0) moveCard(index, index - 1);
  };

  const moveDown = (index: number) => {
    if (index < cards.length - 1) moveCard(index, index + 1);
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="w-[450px] max-h-[80vh] rounded-2xl bg-zinc-900 p-6 shadow-2xl overflow-y-auto">
        <h3 className="text-center text-lg font-bold text-white">{prompt.message}</h3>
        <p className="mt-1 text-center text-xs text-zinc-400">
          拖拽或使用箭头调整顺序 (上方 = 第一张)
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {cards.map((card, index) => (
            <div
              key={card.instanceId}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 rounded-lg border-2 px-3 py-2 cursor-grab transition-all ${
                dragIndex === index
                  ? "border-blue-500 bg-blue-900/30 opacity-70"
                  : "border-zinc-700 bg-zinc-800"
              }`}
            >
              <span className="w-6 text-center text-sm font-bold text-zinc-500">{index + 1}</span>
              <div className="h-14 w-10 shrink-0">
                <VisualCard card={card} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-white">{card.card.name}</div>
                <div className="text-xs text-zinc-400">{card.card.supertype}</div>
              </div>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === cards.length - 1}
                  className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => onConfirm(cards.map(c => c.instanceId))}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          确认顺序
        </button>
      </div>
    </div>
  );

  return typeof window !== "undefined" ? createPortal(content, document.body) : null;
}
