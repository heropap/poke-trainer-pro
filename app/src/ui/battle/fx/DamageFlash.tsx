"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { GameState } from "@/core/state";

// Watches the game log for "Attack" events with damage and shows a brief
// damage burst at the center of the board.
export function DamageFlash({ state }: { state: GameState }) {
  const [recent, setRecent] = useState<{ id: number; damage: number } | null>(null);

  useEffect(() => {
    const last = state.log[state.log.length - 1];
    if (!last) return;
    if (last.kind === "Attack" && typeof last.payload?.damage === "number") {
      setRecent({ id: state.log.length, damage: last.payload.damage as number });
      const t = setTimeout(() => setRecent(null), 1200);
      return () => clearTimeout(t);
    }
  }, [state.log.length, state.log]);

  return (
    <AnimatePresence>
      {recent && recent.damage > 0 && (
        <motion.div
          key={recent.id}
          initial={{ opacity: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: 1, y: -60, scale: 1.4 }}
          exit={{ opacity: 0, y: -120, scale: 1.6 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 text-5xl font-black text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.7)]"
        >
          -{recent.damage}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
