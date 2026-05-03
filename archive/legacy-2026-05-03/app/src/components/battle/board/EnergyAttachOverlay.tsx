"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

/** Map energy type name to a CSS background color */
const ENERGY_DOT_COLORS: Record<string, string> = {
  Grass: "bg-green-500",
  Fire: "bg-red-500",
  Water: "bg-blue-500",
  Lightning: "bg-yellow-400",
  Psychic: "bg-purple-500",
  Fighting: "bg-orange-700",
  Darkness: "bg-gray-800",
  Metal: "bg-gray-400",
  Dragon: "bg-amber-600",
  Fairy: "bg-pink-400",
  Colorless: "bg-zinc-400",
};

interface EnergyAttachOverlayProps {
  /** Whether the energy fly animation is active */
  isActive: boolean;
  /** Energy type name (e.g. "Fire", "Water") */
  energyType?: string;
  /** Unique key for re-triggering the animation */
  animKey?: string;
}

/**
 * Overlay that shows a small energy dot flying from the bottom (hand area)
 * toward the center of the screen (active Pokemon).
 */
export function EnergyAttachOverlay({ isActive, energyType = "Colorless", animKey }: EnergyAttachOverlayProps) {
  const bgColor = ENERGY_DOT_COLORS[energyType] || ENERGY_DOT_COLORS.Colorless;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key={animKey || "energy-fly"}
          className="pointer-events-none fixed inset-0 z-[55]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          <motion.div
            className={`absolute h-5 w-5 rounded-full shadow-lg ${bgColor} border-2 border-white`}
            initial={{ left: "50%", bottom: "15%", x: "-50%", scale: 1.2, opacity: 1 }}
            animate={{ left: "50%", bottom: "55%", x: "-50%", scale: 0.8, opacity: 0.4 }}
            transition={{ type: "spring", stiffness: 120, damping: 15, duration: 0.4 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
