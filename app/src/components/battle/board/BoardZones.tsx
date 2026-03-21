
import React from "react";
import { GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { CardBack } from "./CardBack";

// ─── Deck Pile ───────────────────────────────────────
interface DeckPileProps {
  count: number;
  onClick?: () => void;
  className?: string;
  label?: string;
}

export function DeckPile({ count, onClick, className = "", label = "牌组" }: DeckPileProps) {
  return (
    <div 
      className={`relative flex flex-col items-center justify-center ${className}`}
      onClick={onClick}
    >
      {count > 0 ? (
        <div className="relative">
          {/* Stack effect */}
          {count > 1 && (
            <div className="absolute left-1 top-1 h-full w-full rounded-lg bg-zinc-800 shadow-sm" />
          )}
          {count > 5 && (
            <div className="absolute left-2 top-2 h-full w-full rounded-lg bg-zinc-800 shadow-sm" />
          )}
          <CardBack width={100} height={140} className="relative z-10 shadow-lg" />
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <span className="text-2xl font-bold text-white drop-shadow-md">{count}</span>
          </div>
        </div>
      ) : (
        <div className="flex h-[140px] w-[100px] items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-800/30">
          <span className="text-xs text-zinc-600">空</span>
        </div>
      )}
      <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
    </div>
  );
}

// ─── Discard Pile ────────────────────────────────────
interface DiscardPileProps {
  cards: GameCard[];
  onClick?: () => void;
  className?: string;
  label?: string;
}

export function DiscardPile({ cards, onClick, className = "", label = "弃牌堆" }: DiscardPileProps) {
  const topCard = cards.length > 0 ? cards[cards.length - 1] : null;

  return (
    <div 
      className={`relative flex flex-col items-center justify-center ${className}`}
      onClick={onClick}
    >
      {topCard ? (
        <div className="relative transition-transform hover:scale-105">
          <VisualCard 
            card={topCard} 
            scale={0.66} // 150*0.66 ≈ 100px width
            isHoverable={false}
            className="shadow-lg"
          />
          <div className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-zinc-400 shadow-md border border-zinc-700">
            {cards.length}
          </div>
        </div>
      ) : (
        <div className="flex h-[140px] w-[100px] items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-800/30">
          <span className="text-xs text-zinc-600">弃牌堆</span>
        </div>
      )}
      <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
    </div>
  );
}

// ─── Prize Pile ──────────────────────────────────────
interface PrizePileProps {
  cards: GameCard[]; // We might not know what they are, but we need the array for count/IDs
  isOpponent?: boolean;
  onSelect?: (card: GameCard) => void;
  className?: string;
}

export function PrizePile({ cards, isOpponent = false, onSelect, className = "" }: PrizePileProps) {
  // 2 columns, 3 rows layout
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      {cards.map((card, index) => (
        <div 
          key={card.instanceId} 
          className="relative transition-transform hover:scale-105"
          onClick={() => onSelect?.(card)}
        >
          {/* If we know the card (e.g. revealed via effect), show it. Otherwise back.
              For now, standard game hides prizes. Effects might reveal them. 
              Assuming facedown unless 'isFaceUp' property exists (not yet in GameCard).
              We'll just show CardBack for now. */}
          <CardBack width={60} height={84} className="shadow-md" />
        </div>
      ))}
      {/* Placeholders for taken prizes to maintain grid structure? Or just shrink? 
          Usually prizes shrink as taken. */}
      {cards.length === 0 && (
        <div className="col-span-2 flex h-[84px] items-center justify-center text-xs text-zinc-600">
          胜利!
        </div>
      )}
    </div>
  );
}

// ─── Lost Zone ───────────────────────────────────────
interface LostZoneProps {
  cards?: GameCard[];
  count?: number;
  className?: string;
  onClick?: () => void;
}

export function LostZone({ cards, count, className = "", onClick }: LostZoneProps) {
  const displayCount = cards?.length ?? count ?? 0;
  return (
    <div
      className={`flex flex-col items-center justify-center ${displayCount > 0 ? "cursor-pointer" : ""} ${className}`}
      onClick={() => displayCount > 0 && onClick?.()}
    >
      <div className="relative flex h-[80px] w-[80px] items-center justify-center rounded-full border-2 border-purple-900/50 bg-purple-900/20 shadow-inner hover:border-purple-700/60 transition-colors">
        <div className="absolute inset-0 animate-spin-slow rounded-full border-t-2 border-purple-500 opacity-30"></div>
        <span className="text-xl font-bold text-purple-400">{displayCount}</span>
      </div>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-purple-900">失落区</span>
    </div>
  );
}

// ─── Stadium Spot ────────────────────────────────────
interface StadiumSpotProps {
  card: GameCard | null;
  className?: string;
  onClick?: () => void;
  effectText?: string;
  ownerIndex?: number;
  myIndex?: number;
}

export function StadiumSpot({ card, className = "", onClick, effectText, ownerIndex, myIndex }: StadiumSpotProps) {
  const isOwnStadium = ownerIndex !== undefined && myIndex !== undefined && ownerIndex === myIndex;
  const borderColor = card
    ? isOwnStadium ? "border-emerald-500/60" : "border-red-500/40"
    : "border-emerald-900/30";

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed ${borderColor} bg-emerald-900/10 ${card ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      style={{ minHeight: "140px", width: "110px" }}
    >
      {card ? (
        <>
          <VisualCard
            card={card}
            scale={0.60}
            className="shadow-lg"
          />
          <div className="mt-0.5 max-w-[106px] text-center">
            <div className="truncate text-[9px] font-bold text-emerald-300">{card.card.name}</div>
            {effectText && (
              <div className="mt-0.5 line-clamp-2 text-[8px] leading-tight text-zinc-500">{effectText}</div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center">
          <div className="text-2xl opacity-20">🏟️</div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/50">竞技场</span>
        </div>
      )}
    </div>
  );
}
