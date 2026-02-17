
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  /** Compact mode for mobile */
  compact?: boolean;
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
  compact = false,
}: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.instanceId,
    data: { card },
  });

  const cardScale = compact ? 0.55 : 0.8;
  const cardW = compact ? 82 : 120;
  const cardH = compact ? 116 : 168;
  const overlapClass = compact ? "-ml-8" : "-ml-12";

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className={`${overlapClass} first:ml-0 opacity-0`}
        style={{ zIndex: index, width: cardW, height: cardH }}
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
      className={`${overlapClass} first:ml-0 transition-all duration-200 ${
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
            scale={cardScale}
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
            compact={compact}
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
  /** Mobile compact mode */
  compact?: boolean;
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
  compact = false,
}: HandProps) {
  if (isOpponent) {
    // Render opponent hand (cards face down)
    const opW = compact ? "w-[50px]" : "w-[70px]";
    const opH = compact ? "h-[70px]" : "h-[100px]";
    const opOuter = compact ? "h-[80px]" : "h-[120px]";
    const opOverlap = compact ? "-ml-6" : "-ml-8";
    return (
      <div className={`flex ${opOuter} items-center justify-center`}>
        {cards.map((_, i) => (
          <div
            key={i}
            className={`relative ${opOverlap} ${opH} ${opW} first:ml-0 rounded-lg border border-zinc-600 bg-indigo-900 shadow-md transition-transform hover:-translate-y-2`}
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
  // Mobile: horizontal scroll carousel; Desktop: centered overlap
  return (
    <div
      className={`flex w-full items-end px-4 py-2 pb-4 ${
        compact
          ? "overflow-x-auto scroll-smooth touch-pan-x [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
          : "justify-center overflow-x-auto"
      }`}
    >
      <div
        className={compact ? "flex snap-x snap-mandatory gap-0 pl-2 pr-8" : "flex"}
        style={compact ? undefined : { marginLeft: "20px" }}
      >
        <AnimatePresence mode="popLayout">
          {cards.map((card, i) => (
            <motion.div
              key={card.instanceId}
              className={compact ? "snap-start" : ""}
              initial={{ y: -40, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -30, opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              layout
            >
              <DraggableCard
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
                compact={compact}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
