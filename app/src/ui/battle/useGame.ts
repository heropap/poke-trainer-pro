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

  // AI driver — when it's the AI's turn or a prompt for the AI is pending,
  // pick an action and dispatch (with a small delay so the UI has time to
  // animate / render).
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
