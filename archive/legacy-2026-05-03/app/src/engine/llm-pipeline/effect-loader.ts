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

import { registerByName, registerEffect, getEffectSource, getSourcePriority } from '../effects/effect-registry';
import { compileActionPacket } from './action-compiler';
import type { CardEffectDef } from '../effects/effect-types';

const LLM_LAYER = 'L2.5' as const;

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

  const nameToIds = new Map<string, Set<string>>();

  // Group entries by exact cardId, while keeping the base printed name.
  const grouped = new Map<string, {
    cardId: string;
    baseCardName: string;
    entries: CachedEffectEntry[];
  }>();

  for (const entry of cacheEntries) {
    // Extract base card name: "Charizard ex [Burning Darkness]" → "Charizard ex"
    const baseName = entry.cardName.replace(/\s*\[.*\]$/, '');
    if (!nameToIds.has(baseName)) {
      nameToIds.set(baseName, new Set());
    }
    nameToIds.get(baseName)!.add(entry.cardId);

    if (!grouped.has(entry.cardId)) {
      grouped.set(entry.cardId, {
        cardId: entry.cardId,
        baseCardName: baseName,
        entries: [],
      });
    }
    grouped.get(entry.cardId)!.entries.push(entry);
  }

  // Compile and register each group.
  // The registry's built-in priority guard handles same-key overwrites,
  // but we also need the cross-check: a name-based higher-priority registration
  // should block the entire card to keep hand-written L2 name-based rules authoritative.
  for (const group of grouped.values()) {
    const { cardId, baseCardName } = group;

    // Cross-check: if the card name has a higher-priority name-based registration,
    // skip this card entirely
    const existingNameSource = getEffectSource('', baseCardName);
    if (existingNameSource && existingNameSource !== LLM_LAYER &&
        getSourcePriority(existingNameSource) > getSourcePriority(LLM_LAYER)) {
      stats.skipped += group.entries.length;
      continue;
    }

    try {
      // Compile all effects for this card into a single merged CardEffectDef
      const mergedDef: CardEffectDef & { cardName: string } = {
        cardId,
        cardName: baseCardName,
      };

      for (const entry of group.entries) {
        const compiled = compileActionPacket(
          baseCardName,
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

      // Registry guards against overwriting higher-priority ID sources
      const idRegistered = registerEffect(mergedDef, LLM_LAYER);
      if (!idRegistered) {
        stats.skipped += group.entries.length;
        continue;
      }

      // Register by name only if this is the sole cardId for this name
      const idsForName = nameToIds.get(baseCardName);
      if (idsForName?.size === 1) {
        registerByName(mergedDef, LLM_LAYER);
      }
      stats.loaded++;
      if (group.entries.length > 1) stats.merged++;

    } catch (err) {
      console.warn(`[L2.5 Loader] Failed to compile ${baseCardName} (${cardId}):`, err);
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
