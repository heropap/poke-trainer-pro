"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { GameState, GameEvent, GameEventType } from "@/engine/game-state";

// ─── Types ───

export interface FormattedEvent {
  icon: string;
  color: string;
  message: string;
}

export interface TurnGroup {
  turnNumber: number;
  label: string;
  events: GameEvent[];
}

type AiSpeed = "slow" | "normal" | "fast" | "instant";

interface ActionLogProps {
  gameState: GameState;
  isOpen: boolean;
  onToggle: () => void;
  aiSpeed?: AiSpeed;
  onAiSpeedChange?: (speed: AiSpeed) => void;
  battleMode?: "ai" | "local" | "online";
}

// ─── Event Formatting ───

const EVENT_FORMAT: Record<GameEventType, { icon: string; color: string }> = {
  game_start: { icon: "🎮", color: "text-green-400" },
  draw_card: { icon: "📤", color: "text-blue-300" },
  play_pokemon: { icon: "🐾", color: "text-green-300" },
  evolve_pokemon: { icon: "⬆️", color: "text-green-400" },
  attach_energy: { icon: "🔋", color: "text-yellow-300" },
  use_trainer: { icon: "📦", color: "text-purple-300" },
  use_supporter: { icon: "👤", color: "text-purple-400" },
  use_ability: { icon: "✨", color: "text-cyan-300" },
  attack: { icon: "⚔️", color: "text-red-400" },
  damage: { icon: "💥", color: "text-red-300" },
  knockout: { icon: "💀", color: "text-orange-400" },
  prize_taken: { icon: "🏆", color: "text-yellow-400" },
  retreat: { icon: "🔄", color: "text-blue-400" },
  status_effect: { icon: "⚡", color: "text-purple-500" },
  mulligan: { icon: "🔁", color: "text-zinc-400" },
  game_over: { icon: "🏁", color: "text-yellow-500" },
  coin_flip: { icon: "🪙", color: "text-zinc-300" },
  status_damage: { icon: "☠️", color: "text-red-200" },
  search_deck: { icon: "🔍", color: "text-blue-200" },
  heal: { icon: "💚", color: "text-green-300" },
  manual_override: { icon: "🔧", color: "text-yellow-500" },
};

const DEFAULT_FORMAT = { icon: "📝", color: "text-zinc-400" };

/**
 * Format a GameEvent into display-friendly icon + color.
 * The message field is used as-is (already Chinese).
 */
export function formatGameEvent(event: GameEvent): FormattedEvent {
  const fmt = EVENT_FORMAT[event.type] ?? DEFAULT_FORMAT;
  return {
    icon: fmt.icon,
    color: fmt.color,
    message: event.message,
  };
}

/**
 * Group events by turn for structured display.
 * Detects turn boundaries by looking for game_start events with turn info in the message.
 */
export function groupEventsByTurn(events: GameEvent[]): TurnGroup[] {
  if (events.length === 0) return [];

  const groups: TurnGroup[] = [];
  let currentGroup: TurnGroup = {
    turnNumber: 0,
    label: "对战开始",
    events: [],
  };
  groups.push(currentGroup);

  // Pattern: "回合 N: <playerName> 的回合" or "第 N 回合开始" — indicates new turn
  // Turn boundaries are logged as draw_card with data.turn, or game_start with "回合 N"
  // Two formats: "回合 2: ..." (number after) and "第 1 回合开始" (number before)
  const turnPatternAfter = /回合\s*(\d+)/;
  const turnPatternBefore = /第\s*(\d+)\s*回合/;

  for (const event of events) {
    // Check if this event marks a new turn
    const match = event.message.match(turnPatternAfter) || event.message.match(turnPatternBefore);
    if (match && (event.type === "draw_card" || event.type === "game_start")) {
      const turnNum = parseInt(match[1], 10);
      // Extract player name from message like "第 N 回合开始，<name> 先手"
      // or "回合 N: <name> 的回合"
      const label = event.message;
      currentGroup = {
        turnNumber: turnNum,
        label,
        events: [],
      };
      groups.push(currentGroup);
    }

    currentGroup.events.push(event);
  }

  return groups;
}

// ─── AI Speed Labels ───

const AI_SPEED_OPTIONS: { value: AiSpeed; label: string }[] = [
  { value: "slow", label: "慢" },
  { value: "normal", label: "中" },
  { value: "fast", label: "快" },
  { value: "instant", label: "瞬间" },
];

// ─── Component ───

export function ActionLog({
  gameState,
  isOpen,
  onToggle,
  aiSpeed,
  onAiSpeedChange,
  battleMode,
}: ActionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevLogLength = useRef(0);

  // Memoize grouped events
  const groups = useMemo(
    () => groupEventsByTurn(gameState.log),
    [gameState.log]
  );

  // Detect scroll position
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 50;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
  }

  // Auto-scroll when new events arrive and user is at bottom
  useEffect(() => {
    if (gameState.log.length > prevLogLength.current && isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLogLength.current = gameState.log.length;
  }, [gameState.log.length, isAtBottom]);

  if (!isOpen) return null;

  return (
    <div className="absolute left-0 top-0 z-30 flex h-full w-80 flex-col border-r border-blue-500/30 bg-zinc-900/95 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-blue-500/30 bg-blue-500/10 px-3 py-2">
        <span className="text-sm font-bold text-blue-300">📋 对战日志</span>
        <div className="flex items-center gap-2">
          {/* AI Speed Control — only shown in AI mode */}
          {battleMode === "ai" && aiSpeed && onAiSpeedChange && (
            <select
              value={aiSpeed}
              onChange={(e) => onAiSpeedChange(e.target.value as AiSpeed)}
              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 outline-none focus:ring-1 focus:ring-blue-500"
              title="AI 播放速度"
            >
              {AI_SPEED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={onToggle}
            className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white"
            title="关闭日志"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Event List */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-1"
      >
        {groups.map((group, gi) => (
          <div key={gi}>
            {/* Turn Header */}
            <div className="sticky top-0 z-10 mb-1 mt-2 flex items-center gap-2 bg-zinc-900/95 py-1 first:mt-0">
              <div className="h-px flex-1 bg-zinc-700" />
              <span className="whitespace-nowrap text-[10px] font-medium text-zinc-500">
                {group.turnNumber === 0
                  ? "对战开始"
                  : `回合 ${group.turnNumber}`}
              </span>
              <div className="h-px flex-1 bg-zinc-700" />
            </div>

            {/* Events in this turn */}
            {group.events.map((event, ei) => {
              const fmt = formatGameEvent(event);
              const isPlayer0 = event.playerIndex === 0;
              return (
                <div
                  key={`${gi}-${ei}`}
                  className={`mb-0.5 flex items-start gap-1.5 rounded px-1.5 py-0.5 text-[11px] leading-snug ${
                    isPlayer0
                      ? "bg-blue-950/20"
                      : "bg-red-950/20"
                  }`}
                >
                  <span className="mt-0.5 flex-shrink-0">{fmt.icon}</span>
                  <span className={`${fmt.color} break-all`}>
                    {fmt.message}
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {!isAtBottom && (
        <button
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            setIsAtBottom(true);
          }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-bold text-white shadow-lg hover:bg-blue-500"
        >
          ↓ 最新
        </button>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-800 px-3 py-1.5 text-[9px] text-zinc-600">
        共 {gameState.log.length} 条事件
      </div>
    </div>
  );
}
