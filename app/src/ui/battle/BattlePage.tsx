"use client";

import { useEffect } from "react";
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
  const { state, dispatch, thinking, humanPlayer } = useGame({
    selfDeck,
    oppDeck,
    seed: finalSeed,
  });

  // Listen for trigger-start-turn event from the sidebar.
  useEffect(() => {
    const handler = () => dispatch({ type: "StartTurn" });
    window.addEventListener("trigger-start-turn", handler);
    return () => window.removeEventListener("trigger-start-turn", handler);
  }, [dispatch]);

  return (
    <GameCanvas
      state={state}
      humanPlayer={humanPlayer}
      dispatch={dispatch}
      thinking={thinking}
    />
  );
}
