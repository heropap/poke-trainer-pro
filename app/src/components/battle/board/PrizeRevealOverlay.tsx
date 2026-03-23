"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameCard } from "@/engine/game-state";

interface PrizeRevealOverlayProps {
  /** The prize card(s) that were just taken */
  cards: GameCard[];
  /** Player name who took the prize */
  playerName: string;
  /** Unique trigger key (e.g., prize event timestamp) */
  triggerKey: string;
  /** Duration to show overlay in ms (default: 2000) */
  duration?: number;
}

/**
 * Brief overlay that shows when prize cards are taken after a KO.
 * Displays the revealed card(s) with a flip animation, then auto-hides.
 */
export function PrizeRevealOverlay({
  cards,
  playerName,
  triggerKey,
  duration = 2000,
}: PrizeRevealOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [currentKey, setCurrentKey] = useState("");

  useEffect(() => {
    if (triggerKey && triggerKey !== currentKey && cards.length > 0) {
      setCurrentKey(triggerKey);
      setVisible(true);

      const timer = setTimeout(() => {
        setVisible(false);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [triggerKey, currentKey, cards, duration]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={triggerKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-none fixed inset-0 z-[56] flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.7, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="rounded-2xl bg-zinc-900/90 px-8 py-6 shadow-2xl backdrop-blur-md"
          >
            <p className="mb-3 text-center text-sm font-bold text-yellow-400">
              {playerName} 获得奖赏卡
            </p>
            <div className="flex gap-3 justify-center">
              {cards.map((card, i) => (
                <motion.div
                  key={card.instanceId}
                  initial={{ rotateY: 180, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: i * 0.2, duration: 0.5, type: "spring" }}
                  className="h-[100px] w-[72px] overflow-hidden rounded-lg border-2 border-yellow-500/50 shadow-lg shadow-yellow-500/20"
                  style={{ perspective: "600px" }}
                >
                  {card.card.images?.small ? (
                    <img
                      src={card.card.images.small}
                      alt={card.card.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-xs text-zinc-400">
                      {card.card.name}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
