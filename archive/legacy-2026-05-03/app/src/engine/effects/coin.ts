/**
 * Coin Flip System
 *
 * Provides coin flip functionality used by many card effects.
 * Supports injection of a custom random function for testing.
 */

/** The random function used for coin flips. Can be overridden for testing. */
let randomFn: () => number = Math.random;

/**
 * Set a custom random function (for testing deterministic outcomes).
 * Call with no args to reset to Math.random.
 */
export function setRandomFn(fn?: () => number): void {
  randomFn = fn ?? Math.random;
}

/**
 * Flip a single coin.
 * @returns true for heads, false for tails
 */
export function flipCoin(): boolean {
  return randomFn() >= 0.5;
}

/**
 * Flip multiple coins.
 * @param count Number of coins to flip
 * @returns Object with heads and tails counts
 */
export function flipCoins(count: number): { heads: number; tails: number } {
  let heads = 0;
  let tails = 0;
  for (let i = 0; i < count; i++) {
    if (flipCoin()) {
      heads++;
    } else {
      tails++;
    }
  }
  return { heads, tails };
}
