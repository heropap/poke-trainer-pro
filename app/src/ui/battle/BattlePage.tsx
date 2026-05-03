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
  const { state, dispatch, thinking, humanPlayer } = useGame({
    selfDeck,
    oppDeck,
    seed: finalSeed,
  });

  return (
    <GameCanvas
      state={state}
      humanPlayer={humanPlayer}
      dispatch={dispatch}
      thinking={thinking}
    />
  );
}
