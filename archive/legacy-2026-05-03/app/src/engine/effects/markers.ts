/**
 * Marker Constants
 *
 * Named constants for persistent markers on GameCards.
 * Markers track cross-turn state like "can't attack next turn".
 * Turn-based markers are decremented in processBetweenTurns().
 */

// ─── Turn-Based Markers (auto-decrement between turns) ───

/** Pokemon cannot attack next turn (e.g., Photon Blaster, Wild Impact, Blood Moon) */
export const CANT_ATTACK_NEXT_TURN = "CANT_ATTACK_NEXT_TURN";

/** Defending Pokemon cannot retreat next turn (e.g., Shadow Bind) */
export const PREVENT_RETREAT_NEXT_TURN = "PREVENT_RETREAT_NEXT_TURN";

// ─── Attack-Specific Markers ───

/** Pokemon cannot use a specific attack next turn. Value format: "CANT_USE_ATTACK:<attackName>" */
export function cantUseAttackMarker(attackName: string): string {
  return `CANT_USE_ATTACK:${attackName}`;
}

// ─── Permanent Markers (persist until removed) ───

/** VSTAR Power has been used this game (per player — set on Pokemon that used it) */
export const VSTAR_USED = "VSTAR_USED";

/** Damage boost counter (generic, for effects that add +X damage) */
export const DAMAGE_BOOST = "DAMAGE_BOOST";

/** Ability is blocked on this Pokemon */
export const ABILITY_BLOCKED = "ABILITY_BLOCKED";

/** Ability is blocked this turn only (e.g., Canceling Cologne) — auto-clears at end of turn */
export const ABILITY_BLOCKED_TEMP = "ABILITY_BLOCKED_TEMP";

/** Prevent all damage next turn (e.g., coin flip protection attacks) */
export const PREVENT_ALL_DAMAGE_NEXT_TURN = "PREVENT_ALL_DAMAGE_NEXT_TURN";

// ─── Marker Category Lists (for cleanup logic) ───

/** Markers that should be decremented at end of each turn */
export const TURN_BASED_MARKERS = [
  CANT_ATTACK_NEXT_TURN,
  PREVENT_RETREAT_NEXT_TURN,
  PREVENT_ALL_DAMAGE_NEXT_TURN,
  ABILITY_BLOCKED_TEMP,
] as const;
