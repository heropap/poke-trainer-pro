"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TurnBannerProps {
  /** Text to display (e.g., "你的回合", "对手回合") */
  text: string;
  /** Whether this is the player's turn (affects color theme) */
  isMyTurn: boolean;
  /** Unique key to trigger re-animation (e.g., turn number + player) */
  triggerKey: string;
  /** Duration to show the banner in ms (default: 1500) */
  duration?: number;
}

/**
 * Full-width banner that slides in from top when the turn changes.
 * Shows "你的回合" or "对手回合" with a slide + fade animation,
 * then auto-hides after 1.5 seconds.
 */
export function TurnBanner({
  text,
  isMyTurn,
  triggerKey,
  duration = 1500,
}: TurnBannerProps) {
  const [visible, setVisible] = useState(false);
  const [currentKey, setCurrentKey] = useState("");

  useEffect(() => {
    if (triggerKey && triggerKey !== currentKey) {
      setCurrentKey(triggerKey);
      setVisible(true);

      const timer = setTimeout(() => {
        setVisible(false);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [triggerKey, currentKey, duration]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={triggerKey}
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{
            type: "spring",
            damping: 20,
            stiffness: 300,
            exit: { duration: 0.3 },
          }}
          className="pointer-events-none fixed left-0 right-0 top-16 z-[55] flex justify-center"
        >
          <div
            className={`rounded-xl px-8 py-3 shadow-2xl backdrop-blur-md ${
              isMyTurn
                ? "bg-gradient-to-r from-blue-600/90 to-cyan-500/90 text-white"
                : "bg-gradient-to-r from-red-600/90 to-orange-500/90 text-white"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  isMyTurn ? "bg-cyan-300 animate-pulse" : "bg-orange-300 animate-pulse"
                }`}
              />
              <span className="text-lg font-bold tracking-wide">{text}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
