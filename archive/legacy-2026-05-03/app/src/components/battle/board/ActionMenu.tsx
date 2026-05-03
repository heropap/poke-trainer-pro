
import React from "react";
import { GameCard } from "@/engine/game-state";
import { hasEffect } from "@/engine/effects/effect-registry";

interface ActionMenuProps {
  card: GameCard;
  /** Position relative to the card (viewport coordinates) */
  position?: { x: number; y: number };
  onAction: (action: string) => void;
  onCancel: () => void;
  /** Mobile mode: render as bottom sheet instead of popover */
  compact?: boolean;
}

/** Determine what actions are available for a given card */
function getCardActions(card: GameCard): { label: string; action: string; warning?: string }[] {
  const supertype = card.card.supertype;
  const subtypes = card.card.subtypes || [];

  if (supertype === "Trainer") {
    if (subtypes.includes("Supporter")) {
      const effectExists = hasEffect(card.cardId, card.card.name);
      return [{
        label: "使用",
        action: "play_supporter",
        warning: effectExists ? undefined : "效果未实现"
      }];
    }
    if (subtypes.includes("Pokémon Tool")) {
      const effectExists = hasEffect(card.cardId, card.card.name);
      return [{
        label: "装备",
        action: "equip_tool",
        warning: effectExists ? undefined : "效果未实现"
      }];
    }
    if (subtypes.includes("Item")) {
      const effectExists = hasEffect(card.cardId, card.card.name);
      return [{
        label: "使用",
        action: "play_item",
        warning: effectExists ? undefined : "效果未实现"
      }];
    }
    if (subtypes.includes("Stadium")) {
      return [{
        label: "打出场地",
        action: "play_stadium",
      }];
    }
  }

  if (supertype === "Pokémon") {
    if (subtypes.includes("Basic")) {
      return [{ label: "放置", action: "play_basic" }];
    }
    if (subtypes.includes("Stage 1") || subtypes.includes("Stage 2")) {
      return [{ label: "进化", action: "evolve" }];
    }
  }

  if (supertype === "Energy") {
    return [{ label: "附加", action: "attach_energy" }];
  }

  return [];
}

export function ActionMenu({ card, onAction, onCancel, compact = false }: ActionMenuProps) {
  const actions = getCardActions(card);

  if (actions.length === 0) {
    return null;
  }

  // ─── Mobile: bottom sheet ───
  if (compact) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
        {/* Sheet */}
        <div className="relative rounded-t-2xl border-t border-zinc-700 bg-zinc-900 px-4 pb-6 pt-3 shadow-2xl">
          {/* Drag handle */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-600" />
          {/* Card name */}
          <div className="mb-3 text-center text-sm font-bold text-zinc-200">
            {card.card.name}
          </div>
          {/* Action buttons */}
          <div className="flex justify-center gap-3">
            {actions.map((act) => (
              <button
                key={act.action}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(act.action);
                }}
                className="relative rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors active:bg-blue-700 min-w-[64px]"
              >
                {act.label}
                {act.warning && (
                  <span className="absolute -top-1.5 -right-1.5 rounded-full bg-orange-500 px-1 py-0 text-[8px] font-bold text-white leading-tight">
                    !
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="rounded-xl bg-zinc-700 px-5 py-3 text-sm font-bold text-zinc-300 transition-colors active:bg-zinc-800"
            >
              取消
            </button>
          </div>
          {/* Warning */}
          {actions.some((a) => a.warning) && (
            <div className="mt-2 text-center text-xs text-orange-400/80">
              效果未实现（卡将被丢弃）
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Desktop: popover above card ───
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex flex-col items-center gap-1 rounded-xl bg-zinc-900/95 px-3 py-2 shadow-2xl backdrop-blur-md border border-zinc-700/50">
        {/* Card name header */}
        <div className="text-[10px] text-zinc-400 font-medium truncate max-w-[140px] mb-0.5">
          {card.card.name}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5">
          {actions.map((act) => (
            <button
              key={act.action}
              onClick={(e) => {
                e.stopPropagation();
                onAction(act.action);
              }}
              className="relative rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-500 active:bg-blue-700 min-w-[48px]"
            >
              {act.label}
              {act.warning && (
                <span className="absolute -top-1.5 -right-1.5 rounded-full bg-orange-500 px-1 py-0 text-[7px] font-bold text-white leading-tight">
                  !
                </span>
              )}
            </button>
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-600 active:bg-zinc-800"
          >
            取消
          </button>
        </div>

        {/* Warning text for unimplemented effects */}
        {actions.some(a => a.warning) && (
          <div className="text-[8px] text-orange-400/80 mt-0.5">
            效果未实现（卡将被丢弃）
          </div>
        )}
      </div>

      {/* Arrow pointing down */}
      <div className="flex justify-center">
        <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-zinc-900/95" />
      </div>
    </div>
  );
}
