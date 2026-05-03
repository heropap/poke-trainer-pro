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

    const charizard = getEffect('sv3-125', 'Charizard ex');
    expect(charizard).not.toBeNull();
    expect(charizard!.attacks).toBeDefined();
    expect(charizard!.attacks!.length).toBeGreaterThan(0);
  });

  test('loaded effects report L2.5 source layer', () => {
    loadCompiledEffectsFromFile();

    const source = getEffectSource('sv3-125', 'Charizard ex');
    expect(source).toBe('L2.5');
  });

  test('trainer cards are registered', () => {
    loadCompiledEffectsFromFile();

    const iono = getEffect('sv2-185', 'Iono');
    expect(iono).not.toBeNull();
  });

  test('multi-effect cards merge attacks and abilities', () => {
    loadCompiledEffectsFromFile();

    const pidgeot = getEffect('sv3-164', 'Pidgeot ex');
    expect(pidgeot).not.toBeNull();
    expect(pidgeot!.attacks?.length).toBeGreaterThanOrEqual(1);
    expect(pidgeot!.abilities?.length).toBeGreaterThanOrEqual(1);
  });

  test('hasEffect returns true for loaded cards', () => {
    loadCompiledEffectsFromFile();

    expect(hasEffect('swsh12-139', 'Lugia VSTAR')).toBe(true);
    expect(hasEffect('nonexistent', 'Nonexistent Card')).toBe(false);
  });

  test('不同卡号但同名的缓存效果不会被错误合并', () => {
    loadCompiledEffectsFromFile();

    const scarletFlaaffy = getEffect('sv1-67', 'Flaaffy');
    const evolvingSkiesFlaaffy = getEffect('swsh7-55', 'Flaaffy');

    expect(scarletFlaaffy).not.toBeNull();
    expect(scarletFlaaffy!.attacks?.map((attack) => attack.name)).toContain('Thunder Shock');
    expect(scarletFlaaffy!.abilities ?? []).toHaveLength(0);

    expect(evolvingSkiesFlaaffy).not.toBeNull();
    expect(evolvingSkiesFlaaffy!.abilities?.map((ability) => ability.name)).toContain('Dynamotor');
    expect(evolvingSkiesFlaaffy!.attacks ?? []).toHaveLength(0);

    // Ambiguous duplicate names should not get a shared fallback registration.
    expect(getEffect('missing-id', 'Flaaffy')).toBeNull();
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
