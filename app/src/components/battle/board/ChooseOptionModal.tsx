"use client";

import React, { useState } from "react";
import { ChooseOptionPrompt } from "@/engine/game-state";
import { createPortal } from "react-dom";

interface ChooseOptionModalProps {
  prompt: ChooseOptionPrompt;
  onConfirm: (selectedIds: string[]) => void;
}

export function ChooseOptionModal({ prompt, onConfirm }: ChooseOptionModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOption = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= prompt.max) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const isValid = selected.size >= prompt.min && selected.size <= prompt.max;

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="w-[400px] rounded-2xl bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-center text-lg font-bold text-white">{prompt.message}</h3>
        <p className="mt-1 text-center text-xs text-zinc-400">
          选择 {prompt.min === prompt.max ? prompt.min : `${prompt.min}-${prompt.max}`} 项
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {prompt.options.map((opt) => {
            const isSelected = selected.has(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => toggleOption(opt.id)}
                className={`rounded-lg border-2 px-4 py-3 text-left transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-900/30 text-white"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                {opt.description && (
                  <div className="mt-0.5 text-xs text-zinc-400">{opt.description}</div>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={!isValid}
          className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium ${
            isValid
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
          }`}
        >
          确认
        </button>
      </div>
    </div>
  );

  return typeof window !== "undefined" ? createPortal(content, document.body) : null;
}
