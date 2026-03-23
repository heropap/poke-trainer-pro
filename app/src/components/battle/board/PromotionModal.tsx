"use client";

import React, { useState } from "react";
import { GameCard } from "@/engine/game-state";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface PromotionModalProps {
  /** Bench Pokemon available for promotion */
  benchPokemon: GameCard[];
  /** Player name for display */
  playerName: string;
  /** Callback when a Pokemon is selected for promotion */
  onSelect: (instanceId: string) => void;
}

/**
 * Modal shown when a player's active Pokemon is knocked out
 * and they need to choose a replacement from their bench.
 *
 * Replaces the previous "click bench directly" interaction with
 * a dedicated modal showing full card details for an informed choice.
 */
export function PromotionModal({
  benchPokemon,
  playerName,
  onSelect,
}: PromotionModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId);
    }
  };

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="mx-4 w-full max-w-[520px] rounded-2xl bg-zinc-900 p-6 shadow-2xl border border-red-500/30"
        >
          {/* Header with KO indicator */}
          <div className="text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-red-600/20 px-4 py-1 text-sm font-bold text-red-400">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
              宝可梦被击倒
            </div>
            <h3 className="text-lg font-bold text-white">
              选择替补宝可梦
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              {playerName} — 从备战区选择一只宝可梦上场战斗
            </p>
          </div>

          {/* Pokemon Grid */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {benchPokemon.map((pokemon) => {
              const isSelected = selectedId === pokemon.instanceId;
              const hp = parseInt(pokemon.card.hp || "0", 10);
              const toolBonus = pokemon.attachedTools.reduce((s, t) =>
                s + (t.card.name === "Bravery Charm" ? 50 : t.card.name === "Hero's Cape" ? 100 : 0), 0);
              const maxHp = hp + toolBonus;
              const currentHp = maxHp - pokemon.damageCounters * 10;
              const hpPct = maxHp > 0 ? currentHp / maxHp : 1;
              const types = pokemon.card.types || [];
              const imageUrl = pokemon.card.images?.small;
              const energyCount = pokemon.attachedEnergy.length;

              return (
                <motion.button
                  key={pokemon.instanceId}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedId(pokemon.instanceId)}
                  className={`relative overflow-hidden rounded-xl border-2 p-3 text-left transition-all ${
                    isSelected
                      ? "border-yellow-400 bg-yellow-900/20 shadow-lg shadow-yellow-500/20"
                      : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
                  }`}
                >
                  {/* Selected indicator */}
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-zinc-900"
                    >
                      ✓
                    </motion.div>
                  )}

                  {/* Card image */}
                  {imageUrl && (
                    <div className="mb-2 flex justify-center">
                      <img
                        src={imageUrl}
                        alt={pokemon.card.name}
                        className={`h-20 w-auto rounded-md object-contain transition-all ${
                          isSelected ? "brightness-110" : ""
                        }`}
                        loading="eager"
                      />
                    </div>
                  )}

                  {/* Name */}
                  <div className="font-medium text-sm text-white truncate">
                    {pokemon.card.name}
                  </div>

                  {/* HP bar */}
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-700">
                      <div
                        className={`h-full rounded-full transition-all ${
                          hpPct > 0.5 ? "bg-green-500" : hpPct > 0.25 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${hpPct * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400 tabular-nums">
                      {currentHp}/{maxHp}
                    </span>
                  </div>

                  {/* Type + Energy info */}
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                    {types.length > 0 && <span>{types.join("/")}</span>}
                    {energyCount > 0 && (
                      <span className="rounded bg-zinc-700 px-1 py-0.5">
                        ⚡{energyCount}
                      </span>
                    )}
                    {pokemon.statusConditions.length > 0 && (
                      <span className="rounded bg-yellow-900/50 px-1 py-0.5 text-yellow-400">
                        {pokemon.statusConditions.join(",")}
                      </span>
                    )}
                  </div>

                  {/* Attacks preview */}
                  {pokemon.card.attacks && pokemon.card.attacks.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
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
                </motion.button>
              );
            })}
          </div>

          {/* Confirm button */}
          <motion.button
            onClick={handleConfirm}
            disabled={!selectedId}
            whileHover={selectedId ? { scale: 1.02 } : {}}
            whileTap={selectedId ? { scale: 0.98 } : {}}
            className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
              selectedId
                ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg hover:from-yellow-600 hover:to-orange-600"
                : "cursor-not-allowed bg-zinc-700 text-zinc-500"
            }`}
          >
            {selectedId
              ? `上场 ${benchPokemon.find(p => p.instanceId === selectedId)?.card.name ?? "宝可梦"}`
              : "请选择替补宝可梦"}
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return typeof window !== "undefined"
    ? createPortal(content, document.body)
    : null;
}
