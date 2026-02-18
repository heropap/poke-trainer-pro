"use client";

import React from "react";
import { ConfirmPrompt } from "@/engine/game-state";
import { createPortal } from "react-dom";

interface ConfirmModalProps {
  prompt: ConfirmPrompt;
  onConfirm: (yes: boolean) => void;
}

export function ConfirmModal({ prompt, onConfirm }: ConfirmModalProps) {
  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="w-[360px] rounded-2xl bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-center text-lg font-bold text-white">{prompt.message}</h3>

        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={() => onConfirm(true)}
            className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-500"
          >
            是
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="rounded-lg bg-zinc-700 px-6 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
          >
            否
          </button>
        </div>
      </div>
    </div>
  );

  return typeof window !== "undefined" ? createPortal(content, document.body) : null;
}
