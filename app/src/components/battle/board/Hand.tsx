
import React from "react";
import { GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { ActionMenu } from "./ActionMenu";
import { useDraggable } from "@dnd-kit/core";

interface DraggableCardProps {
  card: GameCard;
  index: number;
  onCardClick?: (card: GameCard) => void;
  isMyTurn?: boolean;
  isSelected?: boolean;
  isPlayable?: boolean;
  isTargeting?: boolean; // When true, hand is dimmed (target selection mode)
  /** Render ActionMenu on this card */
  showMenu?: boolean;
  onMenuAction?: (action: string) => void;
  onMenuCancel?: () => void;
  onContextMenu?: (card: GameCard) => void;
}

function DraggableCard({
  card,
  index,
  onCardClick,
  isMyTurn,
  isSelected,
  isPlayable,
  isTargeting,
  showMenu,
  onMenuAction,
  onMenuCancel,
  onContextMenu,
}: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.instanceId,
    data: { card },
  });

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className="-ml-12 first:ml-0 opacity-0"
        style={{ zIndex: index, width: 120, height: 168 }}
      />
    );
  }

  // Determine visual state
  const canInteract = isMyTurn && !isTargeting;
  const dimmed = isMyTurn && !isPlayable && !isTargeting;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`-ml-12 first:ml-0 transition-all duration-200 ${
        // Selected card: large lift + blue ring
        isSelected
          ? "z-30 -translate-y-10 scale-110"
          : // Playable + hoverable
          canInteract && isPlayable
          ? "hover:z-20 hover:-translate-y-6 hover:scale-110 cursor-grab active:cursor-grabbing"
          : // Dimmed (unplayable during my turn, not targeting)
          dimmed
          ? "opacity-50 saturate-50 cursor-not-allowed"
          : // Default (opponent turn or targeting mode)
          isTargeting
          ? "opacity-40 saturate-50 pointer-events-none"
          : ""
      }`}
      style={{ zIndex: isSelected ? 30 : index }}
    >
      <div className="relative">
        {/* Selection ring */}
        <div
          className={`rounded-lg transition-shadow duration-200 ${
            isSelected
              ? "ring-2 ring-blue-400 shadow-lg shadow-blue-500/30"
              : canInteract && isPlayable
              ? "ring-1 ring-yellow-400/40"
              : ""
          }`}
        >
          <VisualCard
            card={card}
            scale={0.8}
            isHoverable={false}
            onClick={() => onCardClick?.(card)}
            onContextMenu={(e) => {
              if (onContextMenu) {
                e.preventDefault();
                e.stopPropagation();
                onContextMenu(card);
              }
            }}
          />
        </div>

        {/* Action Menu (shown when this card is selected) */}
        {showMenu && onMenuAction && onMenuCancel && (
          <ActionMenu
            card={card}
            onAction={onMenuAction}
            onCancel={onMenuCancel}
          />
        )}
      </div>
    </div>
  );
}

interface HandProps {
  cards: GameCard[];
  isOpponent?: boolean;
  onCardClick?: (card: GameCard) => void;
  isMyTurn?: boolean;
  selectedCardId?: string | null;
  selectedCard?: GameCard | null;
  playableCardIds?: Set<string>;
  isTargeting?: boolean;
  onMenuAction?: (action: string) => void;
  onMenuCancel?: () => void;
  onCardContextMenu?: (card: GameCard) => void;
}

export function Hand({
  cards,
  isOpponent = false,
  onCardClick,
  isMyTurn = false,
  selectedCardId = null,
  selectedCard = null,
  playableCardIds,
  isTargeting = false,
  onMenuAction,
  onMenuCancel,
  onCardContextMenu,
}: HandProps) {
  if (isOpponent) {
    // Render opponent hand (cards face down)
    return (
      <div className="flex h-[120px] items-center justify-center gap-[-40px]">
        {cards.map((_, i) => (
          <div
            key={i}
            className="relative -ml-8 h-[100px] w-[70px] first:ml-0 rounded-lg border border-zinc-600 bg-indigo-900 shadow-md transition-transform hover:-translate-y-2"
            style={{ zIndex: i }}
          >
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-[url('/card-back.png')] bg-cover bg-center">
              <div className="h-4 w-4 rounded-full bg-blue-500 opacity-50"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Render player hand with drag support + selection
  return (
    <div className="flex w-full items-end justify-center overflow-x-auto px-4 py-2 pb-4">
      <div className="flex gap-[-20px]" style={{ marginLeft: "20px" }}>
        {cards.map((card, i) => (
          <DraggableCard
            key={card.instanceId}
            card={card}
            index={i}
            onCardClick={onCardClick}
            isMyTurn={isMyTurn}
            isSelected={selectedCardId === card.instanceId}
            isPlayable={playableCardIds ? playableCardIds.has(card.instanceId) : true}
            isTargeting={isTargeting}
            showMenu={selectedCardId === card.instanceId && !isTargeting}
            onMenuAction={onMenuAction}
            onMenuCancel={onMenuCancel}
            onContextMenu={onCardContextMenu}
          />
        ))}
      </div>
    </div>
  );
}
