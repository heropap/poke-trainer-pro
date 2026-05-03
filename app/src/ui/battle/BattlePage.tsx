"use client";

import { GameCanvas } from "./GameCanvas";
import { useGame } from "./useGame";

interface BattlePageProps {
  selfDeck?: string;
  oppDeck?: string;
  seed?: number;
}

export function BattlePage({
  selfDeck = "charizard-ex",
  oppDeck = "miraidon-ex",
  seed,
}: BattlePageProps) {
  const finalSeed = seed ?? (Date.now() & 0xffffff);
  const { state, dispatch, thinking, humanPlayer, toast, clearToast } = useGame({
    selfDeck,
    oppDeck,
    seed: finalSeed,
  });

  return (
    <>
      <GameCanvas
        state={state}
        humanPlayer={humanPlayer}
        dispatch={dispatch}
        thinking={thinking}
      />
      {toast && <ToastBanner message={toast} onClose={clearToast} />}
    </>
  );
}

function ToastBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-3 rounded-lg bg-rose-900/95 border border-rose-400/60 shadow-[0_0_20px_rgba(244,63,94,0.5)] backdrop-blur text-sm text-white max-w-md flex items-center gap-3">
      <span className="text-rose-300">⚠</span>
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-2 text-rose-300 hover:text-white text-xs"
      >
        关闭
      </button>
    </div>
  );
}
