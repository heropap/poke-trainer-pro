"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface EvolutionOverlayProps {
  /** Whether the evolution animation is active */
  isActive: boolean;
  /** Name of the pokemon evolving into */
  pokemonName?: string;
}

/**
 * Full-screen overlay that shows a brief evolution flash effect.
 * Triggered when a Pokemon evolves.
 */
export function EvolutionOverlay({ isActive, pokemonName }: EvolutionOverlayProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Glow flash */}
          <motion.div
            className="absolute inset-0 bg-green-400/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0] }}
            transition={{ duration: 0.6, times: [0, 0.3, 1] }}
          />

          {/* Center text */}
          {pokemonName && (
            <motion.div
              className="rounded-full bg-green-500/90 px-6 py-2 text-lg font-bold text-white shadow-lg shadow-green-500/40"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.1, 1], opacity: [0, 1, 0] }}
              transition={{ duration: 0.6, times: [0, 0.4, 1] }}
            >
              进化! {pokemonName}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
