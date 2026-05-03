"use client";

import React, { useState, useMemo } from "react";
import { GameCard } from "@/engine/game-state";
import { PlacementChoice } from "@/engine/battle-prepare";
import { createPortal } from "react-dom";

interface PokemonPlacementModalProps {
  /** Basic Pokemon available in hand for placement */
  basicPokemon: GameCard[];
  /** Player name for display */
  playerName: string;
  /** Callback when placement is confirmed */
  onConfirm: (choice: PlacementChoice) => void;
}

/**
 * Modal for selecting which basic Pokemon to place as Active and on Bench
 * at the start of the game. This replaces autoPlaceBasicPokemon for human players.
 *
 * Flow:
 * 1. Player selects exactly 1 Pokemon for Active (required)
 * 2. Player optionally selects 0-5 Pokemon for Bench
 * 3. Confirm to finalize placement
 */
export function PokemonPlacementModal({
  basicPokemon,
  playerName,
  onConfirm,
}: PokemonPlacementModalProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [benchIds, setBenchIds] = useState<Set<string>>(new Set());

  // Sort by HP descending for display (like autoPlace strategy hint)
  const sorted = useMemo(
    () =>
      [...basicPokemon].sort((a, b) => {
        const hpA = parseInt(a.card.hp || "0", 10);
        const hpB = parseInt(b.card.hp || "0", 10);
        return hpB - hpA;
      }),
    [basicPokemon]
  );

  const handleCardClick = (instanceId: string) => {
    if (activeId === instanceId) {
      // Deselect active
      setActiveId(null);
      return;
    }
    if (benchIds.has(instanceId)) {
      // Remove from bench
      setBenchIds((prev) => {
        const next = new Set(prev);
        next.delete(instanceId);
        return next;
      });
      return;
    }

    // If no active yet, set as active
    if (!activeId) {
      setActiveId(instanceId);
      return;
    }

    // Active already set — add to bench (max 5)
    if (benchIds.size < 5) {
      setBenchIds((prev) => new Set(prev).add(instanceId));
    }
  };

  const getCardRole = (instanceId: string): "active" | "bench" | null => {
    if (activeId === instanceId) return "active";
    if (benchIds.has(instanceId)) return "bench";
    return null;
  };

  const isValid = activeId !== null;

  const handleConfirm = () => {
    if (!activeId) return;
    onConfirm({
      activeInstanceId: activeId,
      benchInstanceIds: Array.from(benchIds),
    });
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
      <div className="mx-4 w-full max-w-[560px] rounded-2xl bg-zinc-900 p-6 shadow-2xl">
        {/* Header */}
        <h3 className="text-center text-lg font-bold text-white">
          选择出战宝可梦
        </h3>
        <p className="mt-1 text-center text-xs text-zinc-400">
          {playerName} — 点击选择战斗区宝可梦（必选1只），再点击选择备战区（可选0-5只）
        </p>

        {/* Slot indicators */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-zinc-300">战斗区</span>
            <span className="text-zinc-500">{activeId ? "1/1" : "0/1"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-blue-500" />
            <span className="text-zinc-300">备战区</span>
            <span className="text-zinc-500">{benchIds.size}/5</span>
          </div>
        </div>

        {/* Pokemon Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sorted.map((pokemon) => {
            const role = getCardRole(pokemon.instanceId);
            const hp = parseInt(pokemon.card.hp || "0", 10);
            const types = pokemon.card.types || [];
            const imageUrl = pokemon.card.images?.small;

            return (
              <button
                key={pokemon.instanceId}
                onClick={() => handleCardClick(pokemon.instanceId)}
                className={`relative overflow-hidden rounded-xl border-2 p-2 text-left transition-all ${
                  role === "active"
                    ? "border-red-500 bg-red-900/30 shadow-lg shadow-red-500/20"
                    : role === "bench"
                    ? "border-blue-500 bg-blue-900/30 shadow-lg shadow-blue-500/20"
                    : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
                }`}
              >
                {/* Role badge */}
                {role && (
                  <div
                    className={`absolute right-1 top-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      role === "active"
                        ? "bg-red-500 text-white"
                        : "bg-blue-500 text-white"
                    }`}
                  >
                    {role === "active" ? "战斗" : "备战"}
                  </div>
                )}

                {/* Card image (small) */}
                {imageUrl && (
                  <div className="mb-1.5 flex justify-center">
                    <img
                      src={imageUrl}
                      alt={pokemon.card.name}
                      className="h-24 w-auto rounded-md object-contain"
                      loading="eager"
                    />
                  </div>
                )}

                {/* Card info */}
                <div className="font-medium text-sm text-white truncate">
                  {pokemon.card.name}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>HP {hp}</span>
                  {types.length > 0 && (
                    <span className="text-zinc-500">{types.join("/")}</span>
                  )}
                </div>

                {/* Attacks preview */}
                {pokemon.card.attacks && pokemon.card.attacks.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {pokemon.card.attacks.slice(0, 2).map((atk, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[10px] text-zinc-500"
                      >
                        <span className="truncate">{atk.name}</span>
                        {atk.damage && (
                          <span className="ml-1 font-mono text-zinc-400">
                            {atk.damage}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Help text */}
        {!activeId && (
          <p className="mt-3 text-center text-xs text-yellow-500/80">
            请先选择一只宝可梦作为战斗区主力
          </p>
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={!isValid}
          className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
            isValid
              ? "bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg hover:from-red-600 hover:to-orange-600"
              : "cursor-not-allowed bg-zinc-700 text-zinc-500"
          }`}
        >
          {isValid
            ? `确认出战 (${1 + benchIds.size} 只宝可梦)`
            : "请选择战斗区宝可梦"}
        </button>
      </div>
    </div>
  );

  return typeof window !== "undefined"
    ? createPortal(content, document.body)
    : null;
}
