/**
 * LLM Pipeline Tests — 验证模式目录、解析校验、模式映射的纯逻辑
 *
 * 不调用 LLM API，只验证确定性代码路径。
 */
import {
  PatternId,
  TriggerType,
  ConditionType,
  PATTERN_CATALOG,
} from '../engine/llm-pipeline/effect-pattern-catalog';

import {
  validateParseResult,
  SEMANTIC_PARSER_SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,
  buildParseRequest,
} from '../engine/llm-pipeline/semantic-parser';

import {
  CARD_TEST_SUITE,
  assertParseResult,
  runTestSuite,
} from '../engine/llm-pipeline/card-test-suite';

// ═══════════════════════════════════════════
// Pattern Catalog Tests
// ═══════════════════════════════════════════

describe('Effect Pattern Catalog', () => {
  test('PatternId enum has 30 patterns', () => {
    const ids = Object.values(PatternId);
    expect(ids.length).toBe(30);
  });

  test('every PatternId has a corresponding catalog entry', () => {
    for (const id of Object.values(PatternId)) {
      expect(PATTERN_CATALOG[id]).toBeDefined();
      expect(PATTERN_CATALOG[id].id).toBe(id);
    }
  });

  test('every catalog entry has required fields', () => {
    for (const [id, entry] of Object.entries(PATTERN_CATALOG)) {
      expect(entry.category).toMatch(/^(damage|energy|card_movement|status|flow)$/);
      expect(entry.nameCN).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.textExamples.length).toBeGreaterThan(0);
      expect(entry.slots.length).toBeGreaterThan(0);
      expect(entry.templateNote).toBeTruthy();
    }
  });

  test('damage patterns have correct categories', () => {
    const damagePatterns = [
      PatternId.DMG_FLAT, PatternId.DMG_SELF_DISCARD, PatternId.DMG_CONDITIONAL_BONUS,
      PatternId.DMG_COIN_FLIP_REPEAT, PatternId.DMG_COIN_FLIP_N, PatternId.DMG_DYNAMIC_MULTIPLIER,
      PatternId.DMG_BENCH_SPREAD, PatternId.DMG_DISTRIBUTE, PatternId.DMG_PLACE_COUNTERS,
      PatternId.DMG_RECOIL,
    ];
    for (const id of damagePatterns) {
      expect(PATTERN_CATALOG[id].category).toBe('damage');
    }
  });

  test('TriggerType enum covers all trigger types', () => {
    const triggers = Object.values(TriggerType);
    expect(triggers).toContain('ON_EVOLVE');
    expect(triggers).toContain('ON_PLAY');
    expect(triggers).toContain('ONCE_PER_TURN');
    expect(triggers).toContain('PASSIVE');
    expect(triggers).toContain('ON_KNOCKOUT');
  });

  test('ConditionType enum covers common conditions', () => {
    const conditions = Object.values(ConditionType);
    expect(conditions).toContain('OPPONENT_PRIZES_TAKEN');
    expect(conditions).toContain('SELF_ENERGY_COUNT');
    expect(conditions).toContain('EVOLVED_THIS_TURN');
  });
});


// ═══════════════════════════════════════════
// Semantic Parser Validation Tests
// ═══════════════════════════════════════════

describe('Semantic Parser — Validation', () => {
  test('validates correct simple pattern', () => {
    const json = JSON.stringify({
      cardName: '皮卡丘',
      effectSource: 'attack',
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_FLAT',
        slotValues: { damage: 40 },
      },
      confidence: 1.0,
      ambiguities: [],
    });

    const result = validateParseResult(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.result!.parsedEffect.patternId).toBe('DMG_FLAT');
  });

  test('validates sequence pattern', () => {
    const json = JSON.stringify({
      cardName: '博士的研究',
      effectSource: 'trainer_supporter',
      trigger: 'NONE',
      parsedEffect: {
        type: 'sequence',
        steps: [
          { type: 'pattern', patternId: 'CARD_DISCARD_HAND', slotValues: { count: -1 } },
          { type: 'pattern', patternId: 'CARD_DRAW', slotValues: { count: 7 } },
        ],
      },
      confidence: 1.0,
      ambiguities: [],
    });

    const result = validateParseResult(json);
    expect(result.valid).toBe(true);
  });

  test('rejects invalid patternId', () => {
    const json = JSON.stringify({
      cardName: 'test',
      effectSource: 'attack',
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'INVALID_PATTERN',
        slotValues: {},
      },
      confidence: 0.5,
      ambiguities: [],
    });

    const result = validateParseResult(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('INVALID_PATTERN'))).toBe(true);
  });

  test('rejects malformed JSON', () => {
    const result = validateParseResult('not json at all');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/JSON 解析失败/);
  });

  test('rejects missing required fields', () => {
    const result = validateParseResult(JSON.stringify({ foo: 'bar' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('cardName'))).toBe(true);
  });

  test('handles markdown-wrapped JSON', () => {
    const json = '```json\n' + JSON.stringify({
      cardName: 'test',
      effectSource: 'attack',
      trigger: 'NONE',
      parsedEffect: { type: 'pattern', patternId: 'DMG_FLAT', slotValues: { damage: 50 } },
      confidence: 1.0,
      ambiguities: [],
    }) + '\n```';

    const result = validateParseResult(json);
    expect(result.valid).toBe(true);
  });

  test('validates conditional type', () => {
    const json = JSON.stringify({
      cardName: 'test',
      effectSource: 'attack',
      trigger: 'NONE',
      parsedEffect: {
        type: 'conditional',
        condition: { type: 'coin_flip', description: '翻硬币' },
        ifTrue: { type: 'pattern', patternId: 'DMG_FLAT', slotValues: { damage: 100 } },
        ifFalse: null,
      },
      confidence: 0.9,
      ambiguities: [],
    });

    const result = validateParseResult(json);
    expect(result.valid).toBe(true);
  });

  test('validates nested optional + sequence', () => {
    const json = JSON.stringify({
      cardName: 'test',
      effectSource: 'ability',
      trigger: 'ONCE_PER_TURN',
      parsedEffect: {
        type: 'optional',
        optionalEffect: {
          type: 'sequence',
          steps: [
            { type: 'pattern', patternId: 'NRG_ACCELERATE', slotValues: { source: 'deck' } },
            { type: 'pattern', patternId: 'DMG_PLACE_COUNTERS', slotValues: { counters: 2 } },
          ],
        },
      },
      confidence: 0.8,
      ambiguities: [],
    });

    const result = validateParseResult(json);
    expect(result.valid).toBe(true);
  });
});


// ═══════════════════════════════════════════
// Prompt Builder Tests
// ═══════════════════════════════════════════

describe('Semantic Parser — Prompt Builder', () => {
  test('system prompt contains all PatternId values', () => {
    for (const id of Object.values(PatternId)) {
      expect(SEMANTIC_PARSER_SYSTEM_PROMPT).toContain(id);
    }
  });

  test('few-shot examples have 24 messages (12 pairs)', () => {
    expect(FEW_SHOT_EXAMPLES).toHaveLength(24);
    // Every odd index is assistant response
    for (let i = 1; i < FEW_SHOT_EXAMPLES.length; i += 2) {
      expect(FEW_SHOT_EXAMPLES[i].role).toBe('assistant');
    }
  });

  test('few-shot assistant responses are valid JSON', () => {
    for (let i = 1; i < FEW_SHOT_EXAMPLES.length; i += 2) {
      const parsed = JSON.parse(FEW_SHOT_EXAMPLES[i].content);
      expect(parsed.cardName).toBeTruthy();
      expect(parsed.parsedEffect).toBeDefined();
    }
  });

  test('buildParseRequest produces correct API payload', () => {
    const req = buildParseRequest('皮卡丘', 'attack', '造成 40 伤害。', '[雷][无]');
    expect(req.model).toBeDefined();
    expect(req.max_tokens).toBeGreaterThan(0);
    expect(req.system).toBe(SEMANTIC_PARSER_SYSTEM_PROMPT);
    // 12 few-shot pairs + 1 user message = 25
    expect(req.messages).toHaveLength(25);
    expect(req.messages[req.messages.length - 1].role).toBe('user');
    expect(req.messages[req.messages.length - 1].content).toContain('皮卡丘');
    expect(req.messages[req.messages.length - 1].content).toContain('[雷][无]');
  });

  test('buildParseRequest omits energy for non-attack', () => {
    const req = buildParseRequest('Boss的命令', 'trainer_supporter', '将对手的 1 只备战区宝可梦与战斗宝可梦互换。');
    const lastMsg = req.messages[req.messages.length - 1].content;
    expect(lastMsg).not.toContain('能量消耗');
    expect(lastMsg).toContain('Boss的命令');
  });
});


// ═══════════════════════════════════════════
// Card Test Suite Tests
// ═══════════════════════════════════════════

describe('Card Test Suite', () => {
  test('has 18 test cases', () => {
    expect(CARD_TEST_SUITE).toHaveLength(18);
  });

  test('all test IDs are unique', () => {
    const ids = CARD_TEST_SUITE.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('covers complexity levels 1-5', () => {
    const levels = new Set(CARD_TEST_SUITE.map(t => t.complexity));
    expect(levels.has(1)).toBe(true);
    expect(levels.has(2)).toBe(true);
    expect(levels.has(3)).toBe(true);
    expect(levels.has(4)).toBe(true);
    expect(levels.has(5)).toBe(true);
  });

  test('includes the 3 smoke test cards', () => {
    const names = CARD_TEST_SUITE.map(t => t.cardNameEN);
    expect(names).toContain('Dragapult ex');
    expect(names).toContain('Gardevoir');
    expect(names).toContain('Raging Bolt ex');
  });

  test('assertParseResult detects matching result', () => {
    const testCase = CARD_TEST_SUITE[0]; // T001: 皮卡丘
    const actual = {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_FLAT',
        slotValues: { damage: 40 },
      },
    };

    const result = assertParseResult(actual, testCase);
    expect(result.passed).toBe(true);
    expect(result.criticalFailures).toHaveLength(0);
  });

  test('assertParseResult detects wrong patternId', () => {
    const testCase = CARD_TEST_SUITE[0]; // T001: 皮卡丘
    const actual = {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_SELF_DISCARD',  // wrong!
        slotValues: { damage: 40 },
      },
    };

    const result = assertParseResult(actual, testCase);
    expect(result.passed).toBe(false);
    expect(result.criticalFailures.length).toBeGreaterThan(0);
  });

  test('assertParseResult detects wrong trigger', () => {
    const testCase = CARD_TEST_SUITE[0]; // T001
    const actual = {
      trigger: 'ON_EVOLVE',  // wrong!
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_FLAT',
        slotValues: { damage: 40 },
      },
    };

    const result = assertParseResult(actual, testCase);
    expect(result.passed).toBe(false);
  });

  test('runTestSuite produces report', () => {
    const results = new Map<string, any>();
    // Feed T001 with correct result
    results.set('T001', {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_FLAT',
        slotValues: { damage: 40 },
      },
    });

    const report = runTestSuite(results);
    expect(report.passed).toBe(1);
    expect(report.total).toBe(1);
    expect(report.report).toContain('T001');
    expect(report.report).toContain('皮卡丘');
  });

  test('3 smoke test cards expected values are valid', () => {
    // T009: 多龙巴鲁托ex
    const dragapult = CARD_TEST_SUITE.find(t => t.id === 'T009')!;
    expect(dragapult.expected.parsedEffect.type).toBe('sequence');
    expect(dragapult.expected.parsedEffect.steps[0].patternId).toBe('DMG_FLAT');
    expect(dragapult.expected.parsedEffect.steps[1].patternId).toBe('DMG_DISTRIBUTE');

    // T011: 沙奈朵
    const gardevoir = CARD_TEST_SUITE.find(t => t.id === 'T011')!;
    expect(gardevoir.expected.trigger).toBe('ONCE_PER_TURN');
    expect(gardevoir.expected.parsedEffect.steps[0].patternId).toBe('NRG_ACCELERATE');
    expect(gardevoir.expected.parsedEffect.steps[1].patternId).toBe('DMG_PLACE_COUNTERS');

    // T016: 猛雷鼓ex
    const ragingBolt = CARD_TEST_SUITE.find(t => t.id === 'T016')!;
    expect(ragingBolt.expected.parsedEffect.steps[0].type).toBe('optional');
    expect(ragingBolt.expected.parsedEffect.steps[1].patternId).toBe('DMG_DYNAMIC_MULTIPLIER');
  });
});
