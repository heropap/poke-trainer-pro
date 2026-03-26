/**
 * L2.5 LLM Pipeline Integration Test
 *
 * Verifies the full chain:
 *   compiled-effects-cache.json → effect-loader → effect-registry → getEffect()
 */

import { clearRegistry, getEffect, getEffectSource, hasEffect } from '../engine/effects/effect-registry';
import { loadCompiledEffectsFromFile } from '../engine/llm-pipeline/effect-loader';

describe('L2.5 LLM Pipeline Integration', () => {
  beforeEach(() => {
    clearRegistry();
  });

  test('loadCompiledEffectsFromFile loads entries from cache', () => {
    const stats = loadCompiledEffectsFromFile();
    expect(stats.loaded).toBeGreaterThan(0);
    expect(stats.errors).toBe(0);
    expect(stats.loaded + stats.skipped).toBeGreaterThan(0);
  });

  test('loaded effects are queryable via getEffect by name', () => {
    loadCompiledEffectsFromFile();

    const charizard = getEffect('l25:Charizard ex', 'Charizard ex');
    expect(charizard).not.toBeNull();
    expect(charizard!.attacks).toBeDefined();
    expect(charizard!.attacks!.length).toBeGreaterThan(0);
  });

  test('loaded effects report L2.5 source layer', () => {
    loadCompiledEffectsFromFile();

    const source = getEffectSource('l25:Charizard ex', 'Charizard ex');
    expect(source).toBe('L2.5');
  });

  test('trainer cards are registered', () => {
    loadCompiledEffectsFromFile();

    const iono = getEffect('l25:Iono', 'Iono');
    expect(iono).not.toBeNull();
  });

  test('multi-effect cards merge attacks and abilities', () => {
    loadCompiledEffectsFromFile();

    const pidgeot = getEffect('l25:Pidgeot ex', 'Pidgeot ex');
    expect(pidgeot).not.toBeNull();
    expect(pidgeot!.attacks?.length).toBeGreaterThanOrEqual(1);
    expect(pidgeot!.abilities?.length).toBeGreaterThanOrEqual(1);
  });

  test('hasEffect returns true for loaded cards', () => {
    loadCompiledEffectsFromFile();

    expect(hasEffect('l25:Lugia VSTAR', 'Lugia VSTAR')).toBe(true);
    expect(hasEffect('nonexistent', 'Nonexistent Card')).toBe(false);
  });

  test('L1/L2 effects take priority over L2.5', () => {
    const { registerByName } = require('../engine/effects/effect-registry');
    registerByName({ cardId: 'l2:Boss\'s Orders (Ghetsis)', cardName: 'Boss\'s Orders (Ghetsis)' }, 'L2');

    const stats = loadCompiledEffectsFromFile();
    expect(stats.skipped).toBeGreaterThan(0);

    const source = getEffectSource('l2:Boss\'s Orders (Ghetsis)', 'Boss\'s Orders (Ghetsis)');
    expect(source).toBe('L2');
  });
});
