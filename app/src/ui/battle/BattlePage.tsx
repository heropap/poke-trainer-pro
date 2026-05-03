"use client";

import { useMemo } from "react";
import { autoSetup } from "@/core/reducer";
import "@/core/decks"; // ensure decks + effects registered
import { GameCanvas } from "./GameCanvas";

interface BattlePageProps {
  selfDeck?: string;
  oppDeck?: string;
  seed?: number;
}

export function BattlePage({
  selfDeck = "charizard-ex",
  oppDeck = "miraidon-ex",
  seed = Date.now() & 0xffffff,
}: BattlePageProps) {
  // Build a fresh setup state once per mount.
  const state = useMemo(() => {
    return autoSetup(seed, selfDeck, oppDeck, 0);
  }, [seed, selfDeck, oppDeck]);

  return <GameCanvas state={state} />;
}
