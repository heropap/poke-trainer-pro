
import React from "react";
import { GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";

interface ZoneBrowserModalProps {
  title: string;
  cards: GameCard[];
  onClose: () => void;
}

export function ZoneBrowserModal({ title, cards, onClose }: ZoneBrowserModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative max-h-[80vh] w-[90vw] max-w-[600px] overflow-hidden rounded-xl bg-zinc-800 shadow-2xl border border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-200">{title}</h3>
            <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">
              {cards.length} 张
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Card Grid */}
        <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(80vh - 60px)" }}>
          {cards.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-zinc-500">
              空
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {cards.map((card, index) => (
                <div key={card.instanceId || index} className="flex flex-col items-center">
                  <VisualCard
                    card={card}
                    scale={0.55}
                    isHoverable={true}
                    className="shadow-md"
                  />
                  <span className="mt-0.5 truncate text-[8px] text-zinc-500 max-w-[80px]">
                    {card.card.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
