"use client";

import { useEffect, useState } from "react";
import { Tableau, type CardClickHandler } from "./Tableau";
import { CardActionMenu } from "./CardActionMenu";
import { PromptStack } from "./PromptStack";
import { DamageFlash } from "./fx/DamageFlash";
import type { Dispatch } from "./useGame";
import type { GameCard, GameState, PlayerIndex } from "@/core/state";

interface GameCanvasProps {
  state: GameState;
  humanPlayer: PlayerIndex;
  dispatch: Dispatch;
  thinking?: boolean;
}

export function GameCanvas({ state, humanPlayer, dispatch, thinking }: GameCanvasProps) {
  const [selected, setSelected] = useState<{
    card: GameCard;
    zone: "hand" | "active" | "bench";
    benchSlot?: number;
  } | null>(null);

  // Close action menu on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-close menu when state changes (action was dispatched)
  useEffect(() => {
    setSelected(null);
  }, [state.log.length]);

  const onCardClick: CardClickHandler = (card, zone, benchSlot) => {
    setSelected({ card, zone, benchSlot });
  };

  const myTurn = state.activePlayer === humanPlayer && state.phase === "main";
  const canEndTurn =
    myTurn &&
    !state.pendingPrompt &&
    !state.pendingEffect &&
    state.phase === "main";

  return (
    <main className="min-h-screen w-full">
      <Tableau state={state} humanPlayer={humanPlayer} onCardClick={onCardClick} />

      {selected && (
        <CardActionMenu
          card={selected.card}
          zone={selected.zone}
          benchSlot={selected.benchSlot}
          state={state}
          player={humanPlayer}
          dispatch={dispatch}
          onClose={() => setSelected(null)}
        />
      )}

      <PromptStack
        state={state}
        humanPlayer={humanPlayer}
        dispatch={dispatch}
      />

      <DamageFlash state={state} />

      <Sidebar
        state={state}
        humanPlayer={humanPlayer}
        thinking={thinking}
        canEndTurn={canEndTurn}
        onEndTurn={() => dispatch({ type: "EndTurn", player: humanPlayer })}
      />

      {state.phase === "gameOver" && (
        <GameOverOverlay state={state} humanPlayer={humanPlayer} />
      )}
    </main>
  );
}

interface SidebarProps {
  state: GameState;
  humanPlayer: PlayerIndex;
  thinking?: boolean;
  canEndTurn: boolean;
  onEndTurn: () => void;
}

function Sidebar({ state, humanPlayer, thinking, canEndTurn, onEndTurn }: SidebarProps) {
  return (
    <aside className="fixed top-4 right-4 w-60 max-h-[80vh] overflow-y-auto rounded-lg bg-zinc-900/85 backdrop-blur border border-zinc-800 p-3 text-xs space-y-2">
      <div className="font-semibold text-violet-300">Battle Log</div>
      <div className="text-zinc-300">
        回合 <span className="text-orange-300 font-bold">{state.turnNumber}</span> ·{" "}
        <span
          className={
            state.activePlayer === humanPlayer ? "text-violet-200" : "text-rose-300"
          }
        >
          {state.activePlayer === humanPlayer ? "你的回合" : "对手回合"}
        </span>
      </div>
      <div className="text-zinc-400">阶段: {state.phase}</div>
      {thinking && (
        <div className="text-amber-300 animate-pulse">⏳ AI 思考中…</div>
      )}
      {state.pendingPrompt && (
        <div className="text-amber-300 text-[11px]">
          ⚠️ Prompt: {state.pendingPrompt.kind} (player {state.pendingPrompt.player})
        </div>
      )}
      <button
        onClick={onEndTurn}
        disabled={!canEndTurn}
        className={`w-full px-3 py-2 rounded font-semibold ${
          canEndTurn
            ? "bg-orange-600 hover:bg-orange-500 text-white"
            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
        }`}
      >
        结束回合
      </button>

      <div className="border-t border-zinc-800 pt-2">
        <div className="text-zinc-500 mb-1">事件 (最近 10 条)</div>
        <div className="space-y-0.5 text-[10px] text-zinc-400 max-h-[150px] overflow-y-auto">
          {state.log
            .slice(-10)
            .reverse()
            .map((e, i) => (
              <div key={`${e.kind}-${i}`}>
                <span className="text-violet-400">{e.kind}</span>
                {e.payload?.cardId ? (
                  <span className="text-zinc-300"> · {String(e.payload.cardId)}</span>
                ) : null}
              </div>
            ))}
        </div>
      </div>
    </aside>
  );
}

function GameOverOverlay({
  state,
  humanPlayer,
}: {
  state: GameState;
  humanPlayer: PlayerIndex;
}) {
  const won = state.winner === humanPlayer;
  const reason = state.winReason ?? "unknown";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="rounded-xl bg-zinc-900 border border-violet-500/60 shadow-[0_0_50px_rgba(168,85,247,0.5)] p-8 text-center w-[400px]">
        <div className="text-2xl font-bold mb-2">
          {won ? "🏆 胜利！" : "💔 失败"}
        </div>
        <div className="text-sm text-zinc-400 mb-6">原因: {reason}</div>
        <a
          href="/"
          className="inline-block px-6 py-2 rounded bg-violet-600 hover:bg-violet-500 text-white font-semibold"
        >
          返回首页
        </a>
      </div>
    </div>
  );
}
