"use client";

import { useEffect, useReducer, useState } from "react";
import { reducer, autoSetup } from "@/core/reducer";
import { chooseAction } from "@/core/ai/policy";
import "@/core/decks";
import type { Action } from "@/core/actions";
import type { GameState, PlayerIndex } from "@/core/state";

const HUMAN_PLAYER: PlayerIndex = 0;
const AI_PLAYER: PlayerIndex = 1;

export interface UseGameOptions {
  selfDeck: string;
  oppDeck: string;
  seed: number;
}

export function useGame(opts: UseGameOptions) {
  const [state, dispatch] = useReducer(reducer, null as unknown as GameState, () =>
    autoSetup(opts.seed, opts.selfDeck, opts.oppDeck, HUMAN_PLAYER),
  );
  const [thinking, setThinking] = useState(false);

  // Auto-dispatch driver — handles two cases:
  //   1. AI's turn or a prompt for the AI: pick action via policy
  //   2. Human's turn but phase=draw: auto-trigger StartTurn (PTCG auto-draws
  //      at the start of each turn; the player doesn't need to click anything).
  useEffect(() => {
    if (state.phase === "gameOver") return;
    let actor: PlayerIndex;
    if (state.pendingPrompt) {
      actor = state.pendingPrompt.player;
    } else if (state.phase === "draw" || state.phase === "main") {
      actor = state.activePlayer;
    } else {
      return;
    }

    // Human's draw phase: auto-fire StartTurn so the player lands in main.
    if (
      actor === HUMAN_PLAYER &&
      state.phase === "draw" &&
      !state.pendingPrompt
    ) {
      const t = setTimeout(() => dispatch({ type: "StartTurn" }), 250);
      return () => clearTimeout(t);
    }

    if (actor !== AI_PLAYER) return;
    const action = chooseAction(state, actor);
    if (!action) return;
    setThinking(true);
    const t = setTimeout(() => {
      dispatch(action);
      setThinking(false);
    }, 350);
    return () => {
      clearTimeout(t);
      setThinking(false);
    };
  }, [state]);

  return { state, dispatch, thinking, humanPlayer: HUMAN_PLAYER, aiPlayer: AI_PLAYER };
}

export type Dispatch = (action: Action) => void;
