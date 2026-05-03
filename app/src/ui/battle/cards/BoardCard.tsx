"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { getCard } from "@/core/cards";
import type { GameCard } from "@/core/state";
import type { EnergyType } from "@/core/types";
import { EnergyChip } from "./EnergyChip";

interface BoardCardProps {
  card: GameCard;
  size?: "active" | "bench";
  isActive?: boolean;
}

export function BoardCard({ card, size = "bench", isActive = false }: BoardCardProps) {
  const def = getCard(card.cardId);
  const isEx =
    def.kind === "Pokemon" &&
    (def.rarity === "ex" || def.rarity === "V" || def.rarity === "VMAX" || def.rarity === "VSTAR");

  const dim =
    size === "active"
      ? "w-[112px] h-[156px]"
      : "w-[72px] h-[100px]";

  const energyTypes: EnergyType[] = card.attachedEnergy.map((e) => {
    const ed = getCard(e.cardId);
    return ed.kind === "Energy" ? ed.energyType : "Colorless";
  });

  const hp = def.kind === "Pokemon" ? def.hp : 0;
  const remainingHp = Math.max(0, hp - card.damage);
  const hpPct = hp > 0 ? (remainingHp / hp) * 100 : 0;

  return (
    <motion.div
      layout
      layoutId={`card-${card.uid}`}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6, rotate: 8 }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      className={`relative ${dim} rounded-md overflow-hidden border ${
        isActive
          ? "border-violet-400 shadow-[0_0_22px_rgba(168,85,247,0.6)]"
          : "border-zinc-700"
      } bg-zinc-900 select-none`}
    >
      {def.images.small && (
        <Image
          src={def.images.small}
          alt={def.name}
          fill
          sizes="120px"
          className="object-cover"
          unoptimized
        />
      )}

      {/* Holographic shimmer for ex / V cards */}
      {isEx && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-fuchsia-300/15 to-cyan-300/10 mix-blend-screen" />
      )}

      {/* HP bar overlay (top) */}
      {def.kind === "Pokemon" && (
        <div className="absolute top-0 inset-x-0 h-1.5 bg-zinc-800/70">
          <div
            className={`h-full ${
              hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-500" : "bg-red-500"
            }`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      )}

      {/* Damage counter (top right) */}
      {card.damage > 0 && (
        <div className="absolute top-1.5 right-1 px-1 rounded bg-red-700/90 text-white text-[10px] font-bold leading-tight">
          -{card.damage}
        </div>
      )}

      {/* Energy chips (bottom) */}
      {energyTypes.length > 0 && (
        <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5 z-10">
          {energyTypes.map((t, i) => (
            <EnergyChip key={i} type={t} />
          ))}
        </div>
      )}

      {/* Status conditions (top left) */}
      {card.status.length > 0 && (
        <div className="absolute top-1 left-1 flex flex-col gap-0.5 z-10">
          {card.status.map((s) => (
            <div
              key={s}
              className="text-[8px] px-1 rounded-sm bg-rose-700/90 text-white"
            >
              {s.slice(0, 3)}
            </div>
          ))}
        </div>
      )}

      {/* Name overlay (bottom band) — only when image hidden or fallback */}
      {!def.images.small && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-1">
          <div className="text-[9px] text-zinc-300">{def.name}</div>
        </div>
      )}
    </motion.div>
  );
}

export function EmptySlot({ size, label }: { size: "active" | "bench"; label: string }) {
  const dim =
    size === "active"
      ? "w-[112px] h-[156px]"
      : "w-[72px] h-[100px]";
  return (
    <div
      className={`${dim} rounded-md border-2 border-dashed border-zinc-700/40 flex items-center justify-center text-zinc-600 text-[10px]`}
    >
      {label}
    </div>
  );
}
