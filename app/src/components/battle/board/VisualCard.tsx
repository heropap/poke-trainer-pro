
import React from "react";
import { GameCard } from "@/engine/game-state";
import Image from "next/image";

interface VisualCardProps {
  card: GameCard;
  scale?: number; // Default 1.0
  isHoverable?: boolean;
  onClick?: () => void;
  className?: string;
  showHp?: boolean;
}

export function VisualCard({
  card,
  scale = 1.0,
  isHoverable = true,
  onClick,
  className = "",
  showHp = false,
}: VisualCardProps) {
  // Standard card ratio is 2.5 : 3.5 (e.g. 250px : 350px)
  // We'll use a base width of 150px for calculation
  const width = 150 * scale;
  const height = 210 * scale;

  const hp = card.card.hp ? parseInt(card.card.hp, 10) : 0;
  const currentHp = hp > 0 ? hp - card.damageCounters * 10 : 0;
  const hpPercentage = hp > 0 ? (currentHp / hp) * 100 : 0;

  return (
    <div
      className={`relative select-none ${className} ${
        isHoverable
          ? "cursor-pointer transition-transform hover:z-10 hover:scale-110"
          : ""
      }`}
      style={{ width: `${width}px`, height: `${height}px` }}
      onClick={onClick}
    >
      {/* Card Image */}
      <div className="h-full w-full overflow-hidden rounded-lg bg-zinc-800 shadow-md">
        {card.card.images?.small ? (
          <img
            src={card.card.images.small}
            alt={card.card.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-indigo-900 p-2 text-center text-xs text-white">
            {card.card.name}
          </div>
        )}
      </div>

      {/* HP Bar (Overlay) */}
      {showHp && hp > 0 && (
        <div className="absolute -bottom-2 left-1/2 w-10/12 -translate-x-1/2 transform rounded-full bg-zinc-900 px-1 py-0.5 shadow-sm">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                hpPercentage > 50
                  ? "bg-green-500"
                  : hpPercentage > 20
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${hpPercentage}%` }}
            />
          </div>
          <div className="mt-0.5 text-center text-[9px] font-bold leading-none text-white">
            {currentHp}/{hp}
          </div>
        </div>
      )}

      {/* Damage Counters (if any) */}
      {card.damageCounters > 0 && !showHp && (
        <div className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md">
          {card.damageCounters * 10}
        </div>
      )}
    </div>
  );
}
