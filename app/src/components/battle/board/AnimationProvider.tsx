"use client";

import React, { createContext, useContext, useCallback, useRef, useState } from "react";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

export interface AnimationEvent {
  id: string;
  type: "draw" | "play" | "attack" | "hit" | "knockout" | "evolve" | "energy_attach";
  data: Record<string, unknown>;
}

export interface AnimationContextValue {
  /** Push an animation event; resolves when animation completes */
  animate: (event: AnimationEvent) => Promise<void>;
  /** Currently playing animation (null = idle) */
  current: AnimationEvent | null;
  /** Skip all pending animations */
  skipAll: () => void;
  /** Duration multiplier based on AI speed (1.0 = normal) */
  speedMultiplier: number;
}

// Speed multipliers: slow animations for slow AI, fast for fast AI
const SPEED_MULTIPLIERS: Record<string, number> = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.5,
  instant: 0.05,
};

// ────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────

const AnimationContext = createContext<AnimationContextValue>({
  animate: () => Promise.resolve(),
  current: null,
  skipAll: () => {},
  speedMultiplier: 1.0,
});

export function useAnimation() {
  return useContext(AnimationContext);
}

// ────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────

interface AnimationProviderProps {
  children: React.ReactNode;
  aiSpeed?: "slow" | "normal" | "fast" | "instant";
}

interface QueueEntry {
  event: AnimationEvent;
  resolve: () => void;
}

export function AnimationProvider({ children, aiSpeed = "normal" }: AnimationProviderProps) {
  const [current, setCurrent] = useState<AnimationEvent | null>(null);
  const queueRef = useRef<QueueEntry[]>([]);
  const processingRef = useRef(false);

  const speedMultiplier = SPEED_MULTIPLIERS[aiSpeed] ?? 1.0;

  const processNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      processingRef.current = false;
      setCurrent(null);
      return;
    }

    processingRef.current = true;
    const entry = queueRef.current.shift()!;
    setCurrent(entry.event);

    // Auto-complete after a duration based on animation type + speed
    const baseDuration = getAnimationDuration(entry.event.type);
    const duration = baseDuration * speedMultiplier;

    setTimeout(() => {
      entry.resolve();
      processNext();
    }, duration);
  }, [speedMultiplier]);

  const animate = useCallback(
    (event: AnimationEvent): Promise<void> => {
      return new Promise<void>((resolve) => {
        queueRef.current.push({ event, resolve });
        if (!processingRef.current) {
          processNext();
        }
      });
    },
    [processNext]
  );

  const skipAll = useCallback(() => {
    // Resolve all pending entries immediately
    const pending = queueRef.current.splice(0);
    for (const entry of pending) {
      entry.resolve();
    }
    setCurrent(null);
    processingRef.current = false;
  }, []);

  const value: AnimationContextValue = {
    animate,
    current,
    skipAll,
    speedMultiplier,
  };

  return (
    <AnimationContext.Provider value={value}>
      {children}
    </AnimationContext.Provider>
  );
}

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

/** Base duration in ms for each animation type */
function getAnimationDuration(type: AnimationEvent["type"]): number {
  switch (type) {
    case "draw":
      return 300;
    case "play":
      return 400;
    case "attack":
      return 500;
    case "hit":
      return 400;
    case "knockout":
      return 600;
    case "evolve":
      return 600;
    case "energy_attach":
      return 400;
    default:
      return 300;
  }
}

// Export for testing
export { SPEED_MULTIPLIERS, getAnimationDuration };
