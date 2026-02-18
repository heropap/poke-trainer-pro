/**
 * EnergySelectionModal
 *
 * Modal for selecting energy cards to discard during retreat.
 * Shows the active Pokemon's attached energy and lets the user
 * pick exactly `required` number of cards.
 */

import React from "react";
import { GameCard } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { createPortal } from "react-dom";

interface EnergySelectionModalProps {
  /** Energy cards attached to the active Pokemon */
  energyCards: GameCard[];
  /** How many energy the user must select */
  required: number;
  /** Name of the Pokemon retreating (for display) */
  pokemonName: string;
  /** Called with selected energy instanceIds */
  onConfirm: (selectedIds: string[]) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

export function EnergySelectionModal({
  energyCards,
  required,
  pokemonName,
  onConfirm,
  onCancel,
}: EnergySelectionModalProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((p) => p !== id);
      } else {
        if (prev.length >= required) return prev;
        return [...prev, id];
      }
    });
  };

  const isValid = selectedIds.length === required;

  // Prevent body scroll
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[80vh] w-[90vw] max-w-2xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 p-5 rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-white">
              选择弃掉的能量 — 撤退 {pokemonName}
            </h2>
            <div className="mt-1 flex gap-4 text-sm text-zinc-400">
              <span>
                已选:{" "}
                <span
                  className={`font-bold ${
                    isValid ? "text-green-400" : "text-yellow-400"
                  }`}
                >
                  {selectedIds.length}
                </span>{" "}
                / {required}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="rounded-lg border border-zinc-600 px-5 py-2 font-bold text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              onClick={() => onConfirm(selectedIds)}
              disabled={!isValid}
              className={`rounded-lg px-6 py-2 font-bold shadow-lg transition-all ${
                isValid
                  ? "bg-blue-600 text-white hover:bg-blue-500"
                  : "cursor-not-allowed bg-zinc-800 text-zinc-500"
              }`}
            >
              确认撤退
            </button>
          </div>
        </div>

        {/* Energy Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {energyCards.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-zinc-500">
              没有附加的能量
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-4">
              {energyCards.map((card) => {
                const isSelected = selectedIds.includes(card.instanceId);
                return (
                  <div
                    key={card.instanceId}
                    className={`relative cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? "scale-110 z-10"
                        : "hover:scale-105 hover:z-10"
                    }`}
                    onClick={() => toggleSelection(card.instanceId)}
                  >
                    <VisualCard
                      card={card}
                      scale={0.85}
                      isHoverable={false}
                      className={
                        isSelected
                          ? "rounded-lg ring-4 ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                          : ""
                      }
                    />
                    {isSelected && (
                      <div className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm text-white shadow-lg animate-in zoom-in duration-200">
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
