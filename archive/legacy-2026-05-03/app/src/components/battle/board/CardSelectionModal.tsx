
import React from "react";
import { GameCard, SelectCardsPrompt, GameState } from "@/engine/game-state";
import { VisualCard } from "./VisualCard";
import { createPortal } from "react-dom";

const ZONE_LABELS: Record<string, string> = {
  deck: "牌组",
  discard: "弃牌堆",
  hand: "手牌",
  prizes: "奖励牌",
  bench: "备战区",
  opponent_bench: "对手备战区",
  own_field: "我方场地",
};

interface CardSelectionModalProps {
  prompt: SelectCardsPrompt;
  gameState: GameState;
  onConfirm: (selectedIds: string[]) => void;
  onCancel?: () => void;
}

export function CardSelectionModal({
  prompt,
  gameState,
  onConfirm,
  onCancel,
}: CardSelectionModalProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [searchTerm, setSearchTerm] = React.useState("");

  const player = gameState.players[prompt.playerIndex];

  // Resolve source cards based on zone
  const sourceZone =
    prompt.zone === "deck" ? player.deck :
    prompt.zone === "discard" ? player.discard :
    prompt.zone === "hand" ? player.hand :
    prompt.zone === "prizes" ? player.prizes :
    prompt.zone === "opponent_bench" ? gameState.players[prompt.playerIndex === 0 ? 1 : 0].bench :
    prompt.zone === "own_field" ? { cards: [...(player.active ? [player.active] : []), ...player.bench.cards] } :
    player.bench;

  // Filter cards based on prompt criteria + search
  const availableCards = sourceZone.cards.filter(card => {
    if (prompt.targets && prompt.targets.length > 0) {
      if (!prompt.targets.includes(card.instanceId)) return false;
    }
    if (prompt.filter) {
      if (prompt.filter.supertype && card.card.supertype !== prompt.filter.supertype) return false;
      if (prompt.filter.subtypes && !prompt.filter.subtypes.every(s => card.card.subtypes.includes(s))) return false;
      if (prompt.filter.name && !card.card.name.includes(prompt.filter.name)) return false;
    }
    if (searchTerm && !card.card.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(p => p !== id);
      } else {
        if (prev.length >= prompt.max) return prev;
        return [...prev, id];
      }
    });
  };

  // Auto-confirm when exact count reached and min === max
  React.useEffect(() => {
    if (prompt.min === prompt.max && selectedIds.length === prompt.max && prompt.max > 0) {
      const timer = setTimeout(() => onConfirm(selectedIds), 300);
      return () => clearTimeout(timer);
    }
  }, [selectedIds, prompt.min, prompt.max, onConfirm]);

  const isValid = selectedIds.length >= prompt.min && selectedIds.length <= prompt.max;
  const canSkip = prompt.min === 0;
  const stillNeed = Math.max(0, prompt.min - selectedIds.length);
  const isExact = prompt.min === prompt.max;

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
        <div className="flex items-start justify-between border-b border-zinc-800 p-5 bg-zinc-900/50 rounded-t-xl gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{prompt.message}</h2>
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-zinc-400">
              <span>
                来源：<span className="text-blue-400 font-bold">{ZONE_LABELS[prompt.zone] ?? prompt.zone}</span>
              </span>
              <span>
                可选：<span className="text-zinc-200 font-bold">{availableCards.length}</span> 张
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    isValid ? "bg-green-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${prompt.max > 0 ? (selectedIds.length / prompt.max) * 100 : 0}%` }}
                />
              </div>
              <span className={`text-sm font-bold tabular-nums ${isValid ? "text-green-400" : "text-yellow-300"}`}>
                {selectedIds.length} / {isExact ? prompt.max : `${prompt.min}~${prompt.max}`}
              </span>
            </div>

            {/* Status hint */}
            {stillNeed > 0 && (
              <p className="mt-1 text-xs text-yellow-400">还需选择 {stillNeed} 张</p>
            )}
            {isValid && isExact && prompt.max > 0 && (
              <p className="mt-1 text-xs text-green-400 animate-pulse">已选满，即将确认…</p>
            )}
          </div>

          <div className="flex gap-3 shrink-0">
            {canSkip && (
              <button
                onClick={() => onConfirm([])}
                className="rounded-lg border border-zinc-600 px-5 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                跳过
              </button>
            )}
            <button
              onClick={() => onConfirm(selectedIds)}
              disabled={!isValid}
              className={`rounded-lg px-7 py-2 text-sm font-bold shadow-lg transition-all ${
                isValid
                  ? "bg-blue-600 text-white hover:bg-blue-500 hover:scale-105"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              }`}
            >
              确认选择
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-5 py-3 bg-zinc-900/30 border-b border-zinc-800">
          <input
            type="text"
            placeholder="搜索卡牌名称…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-sm rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Card Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {availableCards.length === 0 ? (
            <div className="flex h-full items-center justify-center text-zinc-500">
              没有符合条件的卡牌
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
              {availableCards.map(card => {
                const isSelected = selectedIds.includes(card.instanceId);
                const selectionIndex = selectedIds.indexOf(card.instanceId);
                return (
                  <div
                    key={card.instanceId}
                    className={`relative cursor-pointer transition-all duration-200 ${
                      isSelected ? "scale-105 z-10" : "hover:scale-105 hover:z-10"
                    }`}
                    onClick={() => toggleSelection(card.instanceId)}
                  >
                    <VisualCard
                      card={card}
                      scale={1.0}
                      isHoverable={false}
                      className={isSelected
                        ? "ring-4 ring-blue-500 rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                        : ""}
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg animate-in zoom-in duration-200">
                        {selectionIndex + 1}
                      </div>
                    )}
                    {/* Dimmed overlay when max reached and not selected */}
                    {!isSelected && selectedIds.length >= prompt.max && (
                      <div className="absolute inset-0 rounded-lg bg-black/50" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-zinc-800 px-5 py-2 text-center text-xs text-zinc-600">
          {isExact ? `请选择 ${prompt.max} 张` : `请选择 ${prompt.min}~${prompt.max} 张`}
          {canSkip && "（或跳过）"}
        </div>
      </div>
    </div>,
    document.body
  );
}
