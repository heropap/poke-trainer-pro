"use client";

import { useState } from "react";
import { getCard } from "@/core/cards";
import type { GameState, PlayerIndex } from "@/core/state";
import type { Dispatch } from "./useGame";

interface PromptStackProps {
  state: GameState;
  humanPlayer: PlayerIndex;
  dispatch: Dispatch;
}

export function PromptStack({ state, humanPlayer, dispatch }: PromptStackProps) {
  const prompt = state.pendingPrompt;
  if (!prompt) return null;
  if (prompt.player !== humanPlayer) return null; // AI prompts handled in useGame

  const titleFor: Record<typeof prompt.kind, string> = {
    selectActiveSetup: "选择前场宝可梦",
    selectBenchSetup: "选择后场宝可梦（最多 5 张）",
    promoteFromKO: "晋升后场宝可梦到前场",
    selectFromList: "选择卡片",
    selectTarget: "选择目标",
    coinFlip: "抛硬币",
    confirm: "确认",
    chooseOption: "选择选项",
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-[480px] max-h-[80vh] overflow-y-auto rounded-xl bg-zinc-900 border border-amber-500/50 shadow-[0_0_30px_rgba(251,191,36,0.3)] p-5 space-y-4">
        <div>
          <div className="text-amber-300 text-xs uppercase tracking-widest mb-1">
            交互
          </div>
          <div className="text-lg font-semibold text-zinc-100">
            {titleFor[prompt.kind]}
          </div>
        </div>

        <PromptBody state={state} dispatch={dispatch} />
      </div>
    </div>
  );
}

function PromptBody({ state, dispatch }: { state: GameState; dispatch: Dispatch }) {
  const prompt = state.pendingPrompt!;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ps = state.players[prompt.player];

  switch (prompt.kind) {
    case "selectActiveSetup":
      return (
        <div className="space-y-2">
          <div className="text-xs text-zinc-400">从手牌选择一只基础宝可梦放到前场</div>
          <div className="grid grid-cols-3 gap-2">
            {prompt.eligibleUids.map((uid) => {
              const card = ps.hand.find((c) => c.uid === uid)!;
              const def = getCard(card.cardId);
              return (
                <button
                  key={uid}
                  onClick={() =>
                    dispatch({
                      type: "ResolvePrompt",
                      payload: { kind: "selectActiveSetup", uid },
                    })
                  }
                  className="rounded-md bg-zinc-800 hover:bg-violet-700/40 border border-zinc-700 hover:border-violet-400 p-2 text-xs text-zinc-200"
                >
                  {def.name}
                </button>
              );
            })}
          </div>
        </div>
      );
    case "selectBenchSetup": {
      const toggle = (uid: string) => {
        const next = new Set(selected);
        if (next.has(uid)) next.delete(uid);
        else if (next.size < prompt.maxCount) next.add(uid);
        setSelected(next);
      };
      return (
        <div className="space-y-2">
          <div className="text-xs text-zinc-400">点击挑选放到后场（最多 {prompt.maxCount} 张）</div>
          <div className="grid grid-cols-3 gap-2">
            {prompt.eligibleUids.map((uid) => {
              const card = ps.hand.find((c) => c.uid === uid)!;
              const def = getCard(card.cardId);
              return (
                <button
                  key={uid}
                  onClick={() => toggle(uid)}
                  className={`rounded-md border p-2 text-xs ${
                    selected.has(uid)
                      ? "bg-violet-700/60 border-violet-300 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-violet-400"
                  }`}
                >
                  {def.name}
                </button>
              );
            })}
          </div>
          <button
            onClick={() =>
              dispatch({
                type: "ResolvePrompt",
                payload: { kind: "selectBenchSetup", uids: Array.from(selected) },
              })
            }
            className="mt-2 w-full px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold"
          >
            确认 ({selected.size} 张)
          </button>
        </div>
      );
    }
    case "promoteFromKO":
      return (
        <div className="space-y-2">
          <div className="text-xs text-zinc-400">前场被击倒，请选一只后场宝可梦晋升</div>
          <div className="grid grid-cols-3 gap-2">
            {prompt.eligibleBenchSlots.map((slot) => {
              const card = ps.bench[slot]!;
              const def = getCard(card.cardId);
              return (
                <button
                  key={slot}
                  onClick={() =>
                    dispatch({
                      type: "ResolvePrompt",
                      payload: { kind: "promoteFromKO", benchSlot: slot },
                    })
                  }
                  className="rounded-md bg-zinc-800 hover:bg-violet-700/40 border border-zinc-700 hover:border-violet-400 p-2 text-xs text-zinc-200"
                >
                  {def.name}
                </button>
              );
            })}
          </div>
        </div>
      );
    case "selectTarget":
      return (
        <div className="space-y-2">
          <div className="text-xs text-zinc-400">{prompt.message}</div>
          <div className="grid grid-cols-2 gap-2">
            {prompt.eligibleUids.map((uid) => {
              const label = parseTargetLabel(uid, state, prompt.player);
              return (
                <button
                  key={uid}
                  onClick={() =>
                    dispatch({
                      type: "ResolvePrompt",
                      payload: { kind: "selectTarget", uids: [uid] },
                    })
                  }
                  className="rounded-md bg-zinc-800 hover:bg-violet-700/40 border border-zinc-700 hover:border-violet-400 p-2 text-xs text-zinc-200"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      );
    case "selectFromList": {
      const multi = prompt.minCount > 1 || prompt.maxCount > 1;
      if (!multi) {
        return (
          <div className="space-y-2">
            <div className="text-xs text-zinc-400">{prompt.message}</div>
            <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
              {Array.from(new Set(prompt.cardIds)).map((cid) => {
                const def = getCard(cid);
                return (
                  <button
                    key={cid}
                    onClick={() =>
                      dispatch({
                        type: "ResolvePrompt",
                        payload: { kind: "selectFromList", cardIds: [cid] },
                      })
                    }
                    className="rounded-md bg-zinc-800 hover:bg-violet-700/40 border border-zinc-700 hover:border-violet-400 p-2 text-[10px] text-zinc-200 text-left"
                  >
                    {def.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      // Multi-select: render with index keys (so duplicates can be picked separately).
      const picked: number[] = Array.from(selected).map((s) => Number(s));
      const togglePos = (idx: number) => {
        const next = new Set(selected);
        const key = String(idx);
        if (next.has(key)) next.delete(key);
        else if (next.size < prompt.maxCount) next.add(key);
        setSelected(next);
      };
      return (
        <div className="space-y-2">
          <div className="text-xs text-zinc-400">
            {prompt.message}（{prompt.minCount === prompt.maxCount ? `选择 ${prompt.minCount} 张` : `${prompt.minCount}-${prompt.maxCount} 张`}）
          </div>
          <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
            {prompt.cardIds.map((cid, idx) => {
              const def = getCard(cid);
              const isPicked = picked.includes(idx);
              return (
                <button
                  key={`${cid}-${idx}`}
                  onClick={() => togglePos(idx)}
                  className={`rounded-md border p-2 text-[10px] text-left ${
                    isPicked
                      ? "bg-violet-700/60 border-violet-300 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-violet-400"
                  }`}
                >
                  {def.name}
                </button>
              );
            })}
          </div>
          <button
            disabled={selected.size < prompt.minCount}
            onClick={() => {
              const positions = Array.from(selected).map((s) => Number(s)).sort((a, b) => a - b);
              const cardIds = positions.map((p) => prompt.cardIds[p]);
              dispatch({
                type: "ResolvePrompt",
                payload: { kind: "selectFromList", cardIds },
              });
            }}
            className="mt-2 w-full px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold"
          >
            确认 ({selected.size}/{prompt.minCount === prompt.maxCount ? prompt.minCount : prompt.maxCount})
          </button>
        </div>
      );
    }
    case "coinFlip":
      return (
        <div className="space-y-2">
          <div className="text-xs text-zinc-400">点击抛 {prompt.count} 次硬币</div>
          <button
            onClick={() => {
              const results = Array.from({ length: prompt.count }, () => Math.random() < 0.5);
              dispatch({
                type: "ResolvePrompt",
                payload: { kind: "coinFlip", results },
              });
            }}
            className="w-full px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold"
          >
            🪙 抛硬币
          </button>
        </div>
      );
    case "confirm":
      return (
        <div className="space-y-2">
          <div className="text-xs text-zinc-400">{prompt.message}</div>
          <button
            onClick={() =>
              dispatch({
                type: "ResolvePrompt",
                payload: { kind: "confirm" },
              })
            }
            className="w-full px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold"
          >
            确认
          </button>
        </div>
      );
    case "chooseOption":
      return (
        <div className="space-y-2">
          <div className="text-xs text-zinc-400">{prompt.message}</div>
          <div className="grid grid-cols-1 gap-2">
            {prompt.options.map((opt, i) => (
              <button
                key={i}
                onClick={() =>
                  dispatch({
                    type: "ResolvePrompt",
                    payload: { kind: "chooseOption", choice: i },
                  })
                }
                className="rounded-md bg-zinc-800 hover:bg-violet-700/40 border border-zinc-700 hover:border-violet-400 p-2 text-xs text-zinc-200 text-left"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );
    default: {
      const _exhaustive: never = prompt;
      void _exhaustive;
      return null;
    }
  }
}

function parseTargetLabel(
  targetUid: string,
  state: GameState,
  promptPlayer: PlayerIndex,
): string {
  // Format: "bench:N" → look at opp side typically; default to current player
  // depends on context. The Boss's Orders effect targets opp; Switch targets self.
  // We'll display from both possible owners.
  if (targetUid.startsWith("bench:")) {
    const slot = Number(targetUid.split(":")[1]);
    // Try opp first (for Boss's Orders), then self (for Switch).
    const opp = state.players[(1 - promptPlayer) as PlayerIndex];
    const self = state.players[promptPlayer];
    const oppCard = opp.bench[slot];
    const selfCard = self.bench[slot];
    if (oppCard) return `对手 ${getCard(oppCard.cardId).name}`;
    if (selfCard) return getCard(selfCard.cardId).name;
    return `bench ${slot}`;
  }
  return targetUid;
}
