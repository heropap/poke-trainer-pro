
import React from "react";
import { GameState, Player, GameCard } from "@/engine/game-state";
import { ActiveSpot } from "./ActiveSpot";
import { BenchSpot } from "./BenchSpot";
import { Hand } from "./Hand";
import { zoneSize } from "@/engine/zones";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { VisualCard } from "./VisualCard";

interface BattleBoardProps {
  gameState: GameState;
  currentPlayerId: string; // "p1" or "p2" (from context/server) or index 0/1
  onAction?: (action: any) => void;
}

export function BattleBoard({ gameState, currentPlayerId, onAction }: BattleBoardProps) {
  // Identify "Me" vs "Opponent" based on currentPlayerId
  // currentPlayerId is passed as "p1" (index 0) or "p2" (index 1)
  
  const myIndex = currentPlayerId === "p1" ? 0 : 1;
  const opponentIndex = currentPlayerId === "p1" ? 1 : 0;

  const me = gameState.players[myIndex];
  const opponent = gameState.players[opponentIndex];
  
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeCard, setActiveCard] = React.useState<GameCard | null>(null);

  // Debug log to verify correct assignment
  // console.log(`[BattleBoard] Rendering from perspective of Player ${myIndex} (${me.name})`);

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const cardId = active.id as string;
    
    // Find the card being dragged
    const card = me.hand.cards.find(c => c.instanceId === cardId);
    if (card) {
      setActiveId(cardId);
      setActiveCard(card);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (over && activeId) {
      const targetZone = over.id;
      
      if (targetZone === "active-spot") {
        onAction?.({
          type: "play_card",
          cardId: activeId,
          targetZone: "active"
        });
      } else if (String(targetZone).startsWith("bench-spot-")) {
        // Just play to bench (server handles next available slot or validation)
        // Or if we want specific slot logic later, we can use the index
        onAction?.({
          type: "play_card",
          cardId: activeId,
          targetZone: "bench"
        });
      } else if (targetZone === "active-pokemon" || String(targetZone).startsWith("bench-pokemon-")) {
        // Attaching energy/tools to an existing pokemon
        // over.data.current holds { instanceId: string } set by ActiveSpot/BenchSpot
        const targetInstanceId = (over.data.current as any)?.instanceId;

        if (targetInstanceId) {
          onAction?.({
            type: "play_card",
            cardId: activeId,
            targetZone: "attach",
            targetId: targetInstanceId
          });
        }
      }
    }
    
    setActiveId(null);
    setActiveCard(null);
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-zinc-900 text-zinc-100">
      
        {/* ─────────────────────────────────────────────────────────────
            OPPONENT ZONE (Top)
        ───────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col items-center justify-start border-b border-zinc-800 bg-zinc-900/50 p-4 pt-8">
          
          {/* Opponent Info Bar */}
          <div className="absolute left-4 top-4 flex items-center gap-4 rounded-full bg-zinc-800 px-4 py-2 shadow-lg">
            <div className="h-8 w-8 rounded-full bg-red-500"></div>
            <div className="text-sm font-bold">{opponent.name}</div>
            <div className="flex gap-2 text-xs text-zinc-400">
              <span>手牌: {zoneSize(opponent.hand)}</span>
              <span>牌库: {zoneSize(opponent.deck)}</span>
              <span>奖励卡: {zoneSize(opponent.prizes)}</span>
            </div>
          </div>

          {/* Opponent Hand (Hidden/Face down) */}
          <div className="absolute top-[-60px] opacity-75 hover:top-[-20px] hover:opacity-100 transition-all">
             <Hand cards={opponent.hand.cards} isOpponent />
          </div>

          {/* Opponent Bench */}
          <div className="mb-4 mt-8 flex gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <BenchSpot 
                key={i} 
                index={i} 
                card={opponent.bench.cards[i] || null} 
              />
            ))}
          </div>

          {/* Opponent Active */}
          <ActiveSpot card={opponent.active} isOpponent isFirstTurn={false} />
        </div>

        {/* ─────────────────────────────────────────────────────────────
            MIDDLE ZONE (Arena / Status)
        ───────────────────────────────────────────────────────────── */}
        <div className="relative flex h-12 w-full items-center justify-center bg-zinc-950 shadow-inner">
          <div className="flex items-center gap-8">
            <div className="text-zinc-500 text-xs uppercase tracking-widest">
              Turn {gameState.turn}
            </div>
            <div className="rounded-full bg-blue-600 px-6 py-1 text-sm font-bold text-white shadow-lg shadow-blue-900/20">
              {gameState.players[gameState.currentPlayer].name} 的回合
            </div>
            <div className="text-zinc-500 text-xs uppercase tracking-widest">
              {gameState.phase} Phase
            </div>
          </div>
          
          {/* Action Buttons (End Turn) */}
          <div className="absolute right-8 flex gap-2">
             <button 
               className="rounded bg-red-600 px-3 py-1 text-xs font-bold hover:bg-red-500"
               onClick={() => onAction?.({ type: "end_turn" })}
             >
               结束回合
             </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            PLAYER ZONE (Bottom)
        ───────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col items-center justify-end bg-zinc-800/30 p-4 pb-0">
          
          {/* Player Active */}
          <div className="mb-4">
            <ActiveSpot
              card={me.active}
              canAttack={gameState.currentPlayer === myIndex && gameState.phase === "main"}
              isFirstTurn={gameState.turn === 1 && gameState.isFirstTurn}
              onAttack={(attackName) => onAction?.({ type: "attack", attackName })}
            />
          </div>

          {/* Player Bench */}
          <div className="mb-6 flex gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <BenchSpot 
                key={i} 
                index={i} 
                card={me.bench.cards[i] || null} 
              />
            ))}
          </div>

          {/* Player Hand & Controls */}
          <div className="relative w-full">
            <Hand
              cards={me.hand.cards}
              isMyTurn={gameState.currentPlayer === myIndex && gameState.phase === "main"}
              onCardClick={(card) => {
                // Click-to-play for trainer cards (Items and Supporters)
                if (card.card.supertype === "Trainer") {
                  if (card.card.subtypes.includes("Supporter") ||
                      (card.card.subtypes.includes("Item") && !card.card.subtypes.includes("Pokémon Tool"))) {
                    onAction?.({
                      type: "play_card",
                      cardId: card.instanceId,
                    });
                    return;
                  }
                }
                console.log("Clicked card", card.card.name);
              }}
            />
            
            {/* Player Info (Bottom Right) */}
            <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1 rounded-lg bg-zinc-900/80 p-3 text-right shadow-xl backdrop-blur-md">
               <div className="text-lg font-bold text-blue-400">{me.name}</div>
               <div className="text-xs text-zinc-400">
                 Deck: {zoneSize(me.deck)} | Discard: {zoneSize(me.discard)} | Prizes: {zoneSize(me.prizes)}
               </div>
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeCard ? <VisualCard card={activeCard} scale={0.8} /> : null}
        </DragOverlay>

      </div>
    </DndContext>
  );
}
