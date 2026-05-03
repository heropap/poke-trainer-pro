"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { getCard } from "@/core/cards";
import type { GameCard } from "@/core/state";

interface HandCardProps {
  card: GameCard;
  index: number;
  hidden?: boolean;
}

export function HandCard({ card, index, hidden = false }: HandCardProps) {
  const def = getCard(card.cardId);

  if (hidden) {
    return (
      <div
        className="w-[68px] h-[96px] flex-shrink-0 rounded-md bg-gradient-to-br from-violet-700 to-indigo-900 border border-violet-500/40 shadow-md"
        style={{ marginLeft: index === 0 ? 0 : -16 }}
      />
    );
  }

  const isEx =
    def.kind === "Pokemon" &&
    (def.rarity === "ex" || def.rarity === "V" || def.rarity === "VMAX" || def.rarity === "VSTAR");

  return (
    <motion.div
      layout
      layoutId={`hand-${card.uid}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      whileHover={{ y: -8, scale: 1.1, zIndex: 20 }}
      className="relative w-[68px] h-[96px] flex-shrink-0 rounded-md overflow-hidden border border-zinc-700 bg-zinc-900 hover:border-violet-400 hover:shadow-[0_0_18px_rgba(168,85,247,0.5)] cursor-pointer"
      style={{ marginLeft: index === 0 ? 0 : -16 }}
      title={def.name}
    >
      {def.images.small && (
        <Image
          src={def.images.small}
          alt={def.name}
          fill
          sizes="80px"
          className="object-cover"
          unoptimized
        />
      )}
      {isEx && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-fuchsia-300/15 to-cyan-300/10 mix-blend-screen" />
      )}
      {!def.images.small && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-1">
          <div className="text-[8px] text-zinc-300">{def.name}</div>
        </div>
      )}
    </motion.div>
  );
}
