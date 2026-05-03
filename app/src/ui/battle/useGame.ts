"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { createGameState, reducer } from "@/core/reducer";
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

// Wrap reducer so any thrown error becomes a state-stored toast instead of
// crashing the React tree. The original action is dropped on error.
function safeReducer(
  state: GameState & { __toast?: string | null },
  action: Action | { type: "ClearToast" },
): GameState & { __toast?: string | null } {
  if (action.type === "ClearToast") {
    return { ...state, __toast: null };
  }
  try {
    const next = reducer(state, action);
    return { ...next, __toast: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (typeof window !== "undefined") {
      console.warn("[reducer error]", msg);
    }
    return { ...state, __toast: msg };
  }
}

export function useGame(opts: UseGameOptions) {
  const [state, rawDispatch] = useReducer(
    safeReducer,
    null as unknown as GameState & { __toast?: string | null },
    () => {
      // Just kick off GameStart; the AI useEffect below auto-resolves AI prompts,
      // and PromptStack renders human prompts (selectActiveSetup, selectBenchSetup).
      const init = createGameState(opts.seed);
      return {
        ...reducer(init, {
          type: "GameStart",
          deckSlugs: [opts.selfDeck, opts.oppDeck],
          goesFirst: HUMAN_PLAYER,
        }),
        __toast: null,
      };
    },
  );

  const dispatch = useCallback((action: Action) => rawDispatch(action), [rawDispatch]);
  const clearToast = useCallback(
    () => rawDispatch({ type: "ClearToast" }),
    [rawDispatch],
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

  return {
    state,
    dispatch,
    clearToast,
    toast: state.__toast ?? null,
    thinking,
    humanPlayer: HUMAN_PLAYER,
    aiPlayer: AI_PLAYER,
  };
}

export type Dispatch = (action: Action) => void;
