"use client";

import type { EnergyType } from "@/core/types";

const ENERGY_COLORS: Record<EnergyType, { bg: string; ring: string; symbol: string; label: string }> = {
  Fire: { bg: "bg-orange-600", ring: "ring-orange-300", symbol: "🔥", label: "F" },
  Water: { bg: "bg-blue-500", ring: "ring-blue-300", symbol: "💧", label: "W" },
  Grass: { bg: "bg-green-600", ring: "ring-green-300", symbol: "🌿", label: "G" },
  Lightning: { bg: "bg-yellow-400", ring: "ring-yellow-200", symbol: "⚡", label: "L" },
  Psychic: { bg: "bg-violet-600", ring: "ring-violet-300", symbol: "💜", label: "P" },
  Fighting: { bg: "bg-amber-700", ring: "ring-amber-400", symbol: "✊", label: "F" },
  Darkness: { bg: "bg-zinc-800", ring: "ring-zinc-500", symbol: "🌑", label: "D" },
  Metal: { bg: "bg-slate-400", ring: "ring-slate-200", symbol: "⚙", label: "M" },
  Colorless: { bg: "bg-gray-300", ring: "ring-gray-100", symbol: "○", label: "C" },
};

interface EnergyChipProps {
  type: EnergyType;
  size?: "sm" | "md";
}

export function EnergyChip({ type, size = "sm" }: EnergyChipProps) {
  const c = ENERGY_COLORS[type];
  const dim = size === "sm" ? "w-3.5 h-3.5 text-[8px]" : "w-5 h-5 text-[10px]";
  return (
    <div
      className={`${c.bg} ${dim} rounded-full ring-1 ${c.ring} flex items-center justify-center text-white font-bold shadow-sm`}
      title={type}
    >
      {c.label}
    </div>
  );
}
