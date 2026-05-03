"use client";

import type { GameState } from "@/core/state";
import { Tableau } from "./Tableau";

interface GameCanvasProps {
  state: GameState;
}

export function GameCanvas({ state }: GameCanvasProps) {
  return (
    <main className="min-h-screen w-full">
      <Tableau state={state} />
      <Sidebar state={state} />
    </main>
  );
}

function Sidebar({ state }: { state: GameState }) {
  return (
    <aside className="fixed top-4 right-4 w-56 max-h-[80vh] overflow-y-auto rounded-lg bg-zinc-900/80 backdrop-blur border border-zinc-800 p-3 text-xs">
      <div className="font-semibold text-violet-300 mb-2">Battle Log</div>
      <div className="space-y-1">
        <div>
          回合 <span className="text-orange-300">{state.turnNumber}</span>{" "}
          ·{" "}
          <span className="text-violet-200">
            {state.activePlayer === 0 ? "你" : "对手"}
          </span>{" "}
          的回合
        </div>
        <div className="text-zinc-400">阶段: {state.phase}</div>
        {state.pendingPrompt && (
          <div className="text-amber-300 mt-2 text-[11px]">
            ⚠️ Prompt: {state.pendingPrompt.kind}
          </div>
        )}
        {state.winner !== null && (
          <div className="mt-3 p-2 rounded bg-green-900/40 border border-green-500/40 text-green-200">
            胜者: 玩家 {state.winner} ({state.winReason})
          </div>
        )}
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <div className="text-zinc-500 mb-1">事件 (最近 12 条)</div>
          <div className="space-y-0.5 text-[10px] text-zinc-400">
            {state.log.slice(-12).reverse().map((e, i) => (
              <div key={`${e.kind}-${i}`}>
                <span className="text-violet-400">{e.kind}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
