/**
 * Effect Event Bus
 *
 * Provides the chain reaction execution system for the Pokemon TCG engine.
 *
 * How it works:
 * 1. Game actions (attack, play card, etc.) call emitEvent() after each significant change
 * 2. After the action completes, processAction() calls drainEffectQueue()
 * 3. drainEffectQueue() loops through queued events, checking all Pokemon in play
 *    for abilities with matching onEvent triggers
 * 4. Triggered abilities may emit new events, which are processed in the same loop
 * 5. Loop terminates when the queue is empty or MAX_CHAIN_DEPTH is reached
 */

import { GameState, GameCard, logEvent } from "../game-state";
import { GameEffectEvent } from "./game-events";
import { getEffect } from "./effect-registry";
import { createEffectContext } from "./effect-context";
import { ABILITY_BLOCKED, ABILITY_BLOCKED_TEMP } from "./markers";

/** Maximum number of events processed in a single drain cycle to prevent infinite loops */
export const MAX_CHAIN_DEPTH = 20;

/**
 * Push an event onto the game state's effect queue.
 * Safe to call even if effectQueue is not initialized (graceful no-op).
 */
export function emitEvent(state: GameState, event: GameEffectEvent): void {
  if (!state.effectQueue) {
    state.effectQueue = [];
  }
  state.effectQueue.push(event);
}

/**
 * Process all queued events, triggering matching ability handlers.
 *
 * This is the core chain reaction loop:
 * - Shifts events from the front of the queue
 * - For each event, scans all Pokemon in play (both players)
 * - Checks each Pokemon's registered abilities for onEvent triggers
 * - Calls the handler if the event type matches and filter passes
 * - Handlers may emit new events, extending the queue
 * - Stops after MAX_CHAIN_DEPTH events to prevent infinite loops
 *
 * @returns The number of events processed
 */
export async function drainEffectQueue(state: GameState): Promise<number> {
  if (!state.effectQueue || state.effectQueue.length === 0) {
    return 0;
  }

  let processed = 0;

  while (state.effectQueue.length > 0 && processed < MAX_CHAIN_DEPTH) {
    const event = state.effectQueue.shift()!;
    processed++;

    // Collect all Pokemon in play for both players
    for (let pi = 0; pi < 2; pi++) {
      const playerIndex = pi as 0 | 1;
      const player = state.players[playerIndex];
      const allPokemon: GameCard[] = [];

      if (player.active) allPokemon.push(player.active);
      allPokemon.push(...player.bench.cards);

      for (const pokemon of allPokemon) {
        // Skip ability-blocked Pokemon
        if (
          (pokemon.markers[ABILITY_BLOCKED] ?? 0) > 0 ||
          (pokemon.markers[ABILITY_BLOCKED_TEMP] ?? 0) > 0
        ) {
          continue;
        }

        const effect = getEffect(pokemon.cardId, pokemon.card.name);
        if (!effect?.abilities) continue;

        for (const ability of effect.abilities) {
          if (!ability.onEvent) continue;

          // Check if this ability listens to this event type
          if (!ability.onEvent.triggers.includes(event.type)) continue;

          // Create context for the ability owner
          const ctx = createEffectContext(state, playerIndex, pokemon);

          // Apply optional filter
          if (ability.onEvent.filter && !ability.onEvent.filter(ctx, event)) {
            continue;
          }

          // Log the triggered ability
          logEvent(state, playerIndex, "ability" as any,
            `${pokemon.card.name} 的特性 ${ability.name} 响应了 ${event.type} 事件`);

          // Execute the handler (may be async)
          const result = ability.onEvent.handler(ctx, event);
          if (result instanceof Promise) {
            await result;
          }
        }
      }
    }
  }

  // Warn if we hit the chain depth limit
  if (state.effectQueue.length > 0) {
    logEvent(state, state.currentPlayer, "ability" as any,
      `[Warning] 效果连锁达到上限 (${MAX_CHAIN_DEPTH})，剩余 ${state.effectQueue.length} 个事件被丢弃`);
    state.effectQueue.length = 0;
  }

  return processed;
}
