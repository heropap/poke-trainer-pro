"use client";

import React, { useState } from "react";
import { SelectPokemonPrompt, GameState, GameCard } from "@/engine/game-state";
import { createPortal } from "react-dom";

interface SelectPokemonModalProps {
  prompt: SelectPokemonPrompt;
  gameState: GameState;
  myIndex: 0 | 1;
  onConfirm: (selectedIds: string[]) => void;
}

function getPokemonList(
  prompt: SelectPokemonPrompt,
  gameState: GameState,
  myIndex: 0 | 1
): GameCard[] {
  const opponentIndex = (myIndex === 0 ? 1 : 0) as 0 | 1;

  switch (prompt.zone) {
    case "bench":
      return gameState.players[myIndex].bench.cards;
    case "opponent_bench":
      return gameState.players[opponentIndex].bench.cards;
    case "active":
      return gameState.players[myIndex].active ? [gameState.players[myIndex].active!] : [];
    case "opponent_active":
      return gameState.players[opponentIndex].active ? [gameState.players[opponentIndex].active!] : [];
    default:
      return [];
  }
}

export function SelectPokemonModal({ prompt, gameState, myIndex, onConfirm }: SelectPokemonModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pokemonList = getPokemonList(prompt, gameState, myIndex);
  const filtered = prompt.targets
    ? pokemonList.filter(p => prompt.targets!.includes(p.instanceId))
    : pokemonList;

  const togglePokemon = (instanceId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        if (next.size >= prompt.max) return prev;
        next.add(instanceId);
      }
      return next;
    });
  };

  const isValid = selected.size >= prompt.min && selected.size <= prompt.max;

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="w-[420px] rounded-2xl bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-center text-lg font-bold text-white">{prompt.message}</h3>
        <p className="mt-1 text-center text-xs text-zinc-400">
          选择 {prompt.min === prompt.max ? prompt.min : `${prompt.min}-${prompt.max}`} 只宝可梦
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {filtered.map((pokemon) => {
            const isSelected = selected.has(pokemon.instanceId);
            const toolBonus = pokemon.attachedTools.reduce((s, t) =>
              s + (t.card.name === "Bravery Charm" ? 50 : t.card.name === "Hero's Cape" ? 100 : 0), 0);
            const hp = (pokemon.card.hp ? parseInt(pokemon.card.hp) : 0) + toolBonus;
            const currentHp = hp - pokemon.damageCounters * 10;
            return (
              <button
                key={pokemon.instanceId}
                onClick={() => togglePokemon(pokemon.instanceId)}
                className={`rounded-lg border-2 px-3 py-3 text-left transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-900/30 text-white"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                <div className="font-medium text-sm">{pokemon.card.name}</div>
                <div className="mt-0.5 text-xs text-zinc-400">
                  HP: {currentHp}/{hp}
                </div>
                {pokemon.statusConditions.length > 0 && (
                  <div className="mt-0.5 text-xs text-yellow-400">
                    {pokemon.statusConditions.join(", ")}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="mt-4 text-center text-sm text-zinc-500">没有可选的宝可梦</p>
        )}

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
