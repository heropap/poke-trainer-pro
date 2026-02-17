
import React from "react";
import { GameCard, GamePrompt, GameState } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { createPortal } from "react-dom";
import { zoneSize } from "@/engine/zones";

interface CardSelectionModalProps {
  prompt: GamePrompt;
  gameState: GameState;
  onConfirm: (selectedIds: string[]) => void;
  onCancel?: () => void; // Only if prompt allows cancel (min=0?)
}

export function CardSelectionModal({ 
  prompt, 
  gameState, 
  onConfirm, 
  onCancel 
}: CardSelectionModalProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [searchTerm, setSearchTerm] = React.useState("");

  const player = gameState.players[prompt.playerIndex];
  
  // Resolve source cards based on zone
  const sourceZone = 
    prompt.zone === "deck" ? player.deck :
    prompt.zone === "discard" ? player.discard :
    prompt.zone === "hand" ? player.hand :
    player.bench;

  // Filter cards based on prompt criteria
  const availableCards = sourceZone.cards.filter(card => {
    if (prompt.filter) {
      if (prompt.filter.supertype && card.card.supertype !== prompt.filter.supertype) return false;
      if (prompt.filter.subtypes && !prompt.filter.subtypes.every(s => card.card.subtypes.includes(s))) return false;
      if (prompt.filter.name && !card.card.name.includes(prompt.filter.name)) return false;
    }
    // Also filter by search term (local UI filter)
    if (searchTerm && !card.card.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(p => p !== id);
      } else {
        if (prev.length >= prompt.max) return prev; // Max reached
        return [...prev, id];
      }
    });
  };

  const isValid = selectedIds.length >= prompt.min && selectedIds.length <= prompt.max;

  // Prevent body scroll
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex h-[90vh] w-[90vw] max-w-6xl flex-col rounded-xl bg-zinc-900 shadow-2xl border border-zinc-700">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 p-6 bg-zinc-900/50 rounded-t-xl">
          <div>
            <h2 className="text-2xl font-bold text-white">{prompt.message}</h2>
            <div className="flex gap-4 mt-2 text-sm text-zinc-400">
              <span>Source: <span className="text-blue-400 uppercase font-bold">{prompt.zone}</span></span>
              <span>Selected: <span className={`font-bold ${isValid ? "text-green-400" : "text-yellow-400"}`}>{selectedIds.length}</span> / {prompt.max} (Min: {prompt.min})</span>
            </div>
          </div>
          
          <div className="flex gap-4">
            {prompt.min === 0 && (
              <button
                onClick={() => onConfirm([])}
                className="rounded-lg border border-zinc-600 px-6 py-2 font-bold text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Skip / Cancel
              </button>
            )}
            <button
              onClick={() => onConfirm(selectedIds)}
              disabled={!isValid}
              className={`rounded-lg px-8 py-2 font-bold shadow-lg transition-all ${
                isValid 
                  ? "bg-blue-600 text-white hover:bg-blue-500 hover:scale-105" 
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              }`}
            >
              Confirm Selection
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-zinc-900/30 border-b border-zinc-800">
           <input 
             type="text" 
             placeholder="Search cards..." 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="w-full max-w-md rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
           />
        </div>

        {/* Card Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {availableCards.length === 0 ? (
            <div className="flex h-full items-center justify-center text-zinc-500">
              No matching cards found.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {availableCards.map(card => {
                const isSelected = selectedIds.includes(card.instanceId);
                return (
                  <div 
                    key={card.instanceId} 
                    className={`relative transition-all duration-200 ${isSelected ? "scale-105 z-10" : "hover:scale-105 hover:z-10"}`}
                    onClick={() => toggleSelection(card.instanceId)}
                  >
                    <VisualCard 
                      card={card} 
                      scale={1.0} 
                      isHoverable={false}
                      className={isSelected ? "ring-4 ring-blue-500 rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.5)]" : ""}
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg animate-in zoom-in duration-200">
                        ✓
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
