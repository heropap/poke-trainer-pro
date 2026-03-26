/**
 * ============================================================================
 * L2.5 Effect Loader — 从缓存加载编译后的效果并注册到引擎
 * ============================================================================
 *
 * 两种加载模式：
 *   1. 从 compiled-effects-cache.json 加载（离线编译的缓存）
 *   2. 运行时调用 LLM 即时编译（fallback）
 *
 * 优先级保证：
 *   L1 (手写 by ID) > L1.5 (JSON schema) > L2 (手写 by name)
 *   > L2.5 (本模块) > L3 (ryuu-play) > L4 (text-parser)
 *
 * L2.5 只在 L1/L1.5/L2 没有覆盖时生效，不会与手写效果冲突。
 * ============================================================================
 */

import { registerByName, hasEffect } from '../effects/effect-registry';
import { compileActionPacket } from './action-compiler';
import type { CardEffectDef } from '../effects/effect-types';

// ─────────────────────────────────────────────
// Cache entry type
// ─────────────────────────────────────────────

interface CachedEffectEntry {
  cardId: string;
  cardName: string;       // "Charizard ex [Burning Darkness]"
  effectName: string;     // "Burning Darkness"
  effectSource: string;   // "attack" | "ability" | ...
  parsedEffect: any;      // ParsedEffect JSON
  actionPacket: any;      // Full ActionPacket
}

// ─────────────────────────────────────────────
// Main loader
// ─────────────────────────────────────────────

/**
 * Load compiled effects from cache and register at L2.5.
 *
 * Skips cards that already have L1/L2 effects registered
 * (higher priority layers take precedence).
 *
 * @returns Stats on what was loaded
 */
export function loadCompiledEffects(cacheEntries: CachedEffectEntry[]): {
  loaded: number;
  skipped: number;
  merged: number;
  errors: number;
} {
  const stats = { loaded: 0, skipped: 0, merged: 0, errors: 0 };

  // Group entries by base card name (strip [attack/ability name])
  const grouped = new Map<string, {
    baseCardName: string;
    cardId: string;
    entries: CachedEffectEntry[];
  }>();

  for (const entry of cacheEntries) {
    // Extract base card name: "Charizard ex [Burning Darkness]" → "Charizard ex"
    const baseName = entry.cardName.replace(/\s*\[.*\]$/, '');

    if (!grouped.has(baseName)) {
      grouped.set(baseName, {
        baseCardName: baseName,
        cardId: entry.cardId,
        entries: [],
      });
    }
    grouped.get(baseName)!.entries.push(entry);
  }

  // Compile and register each group
  for (const [baseName, group] of grouped) {
    // Skip if L1/L2 already covers this card
    if (hasEffect(group.cardId, baseName)) {
      stats.skipped += group.entries.length;
      continue;
    }

    try {
      // Compile all effects for this card into a single merged CardEffectDef
      const mergedDef: CardEffectDef & { cardName: string } = {
        cardId: `l25:${baseName}`,
        cardName: baseName,
      };

      for (const entry of group.entries) {
        const compiled = compileActionPacket(
          baseName,
          entry.effectName,
          entry.actionPacket,
        );

        // Merge attacks
        if (compiled.attacks) {
          mergedDef.attacks = [...(mergedDef.attacks || []), ...compiled.attacks];
        }
        // Merge abilities
        if (compiled.abilities) {
          mergedDef.abilities = [...(mergedDef.abilities || []), ...compiled.abilities];
        }
        // Trainer (only first one)
        if (compiled.trainer && !mergedDef.trainer) {
          mergedDef.trainer = compiled.trainer;
        }
      }

      registerByName(mergedDef, 'L2.5');
      stats.loaded++;
      if (group.entries.length > 1) stats.merged++;

    } catch (err) {
      console.warn(`[L2.5 Loader] Failed to compile ${baseName}:`, err);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Load from compiled-effects-cache.json via static import.
 * Works in both Node.js and browser (no fs dependency).
 * Safe to call even if the cache is empty.
 */
export function loadCompiledEffectsFromFile(): ReturnType<typeof loadCompiledEffects> {
  try {
    // Static import — bundled at build time, no fs needed
    const data: CachedEffectEntry[] = require('./compiled-effects-cache.json');
    if (!Array.isArray(data) || data.length === 0) {
      return { loaded: 0, skipped: 0, merged: 0, errors: 0 };
    }
    console.log(`[L2.5 Loader] Loading ${data.length} entries from cache...`);
    const stats = loadCompiledEffects(data);
    console.log(`[L2.5 Loader] Done: ${stats.loaded} loaded, ${stats.skipped} skipped (L1/L2 covered), ${stats.merged} merged, ${stats.errors} errors`);
    return stats;
  } catch (err) {
    console.warn('[L2.5 Loader] Failed to load cache:', err);
    return { loaded: 0, skipped: 0, merged: 0, errors: 0 };
  }
}
