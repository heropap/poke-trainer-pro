/**
 * ============================================================================
 * PTCG Card Parsing Assertion Tests
 * ============================================================================
 *
 * 测试策略：
 *   - 覆盖 30 张真实卡牌，从 ★ 到 ★★★★★ 递增复杂度
 *   - 每张卡定义：输入文本 → 期望的 ParsedEffect → 关键断言
 *   - 可用于：
 *     1. 验证 LLM 语义解析的准确性
 *     2. 验证模式库到原子动作的映射正确性
 *     3. 回归测试（新增模式后不破坏旧卡）
 *
 * 运行方式：可以直接跑 JSON diff，也可以接入 vitest/jest
 * ============================================================================
 */

export interface CardTestCase {
  /** 测试 ID */
  id: string;
  /** 卡牌名（中文） */
  cardName: string;
  /** 卡牌名（英文） */
  cardNameEN: string;
  /** 复杂度等级 1-5 */
  complexity: number;
  /** 效果来源 */
  effectSource: 'attack' | 'ability' | 'trainer_item' | 'trainer_supporter' | 'trainer_stadium' | 'special_energy';
  /** 能量消耗（仅招式） */
  energyCost?: string;
  /** 原始卡牌文本 */
  cardText: string;
  /** 期望的解析结果 */
  expected: {
    trigger: string;
    parsedEffect: any;  // ParsedEffect
  };
  /** 关键断言（人类可读的验证点） */
  criticalAssertions: string[];
}


export const CARD_TEST_SUITE: CardTestCase[] = [

  // ═══════════════════════════════════════════
  // ★ 简单卡牌（纯单一模式）
  // ═══════════════════════════════════════════

  {
    id: 'T001',
    cardName: '皮卡丘',
    cardNameEN: 'Pikachu',
    complexity: 1,
    effectSource: 'attack',
    energyCost: '[雷][无]',
    cardText: '造成 40 伤害。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_FLAT',
        slotValues: { damage: 40 },
      },
    },
    criticalAssertions: [
      'patternId 必须是 DMG_FLAT，不能是其他伤害模式',
      'damage 精确等于 40',
    ],
  },

  {
    id: 'T002',
    cardName: '博士的研究',
    cardNameEN: "Professor's Research",
    complexity: 1,
    effectSource: 'trainer_supporter',
    cardText: '丢弃你的所有手牌，然后抽 7 张卡。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'sequence',
        steps: [
          { type: 'pattern', patternId: 'CARD_DISCARD_HAND', slotValues: { count: -1, chooser: 'self' } },
          { type: 'pattern', patternId: 'CARD_DRAW', slotValues: { count: 7 } },
        ],
      },
    },
    criticalAssertions: [
      '必须是 sequence，丢弃在前抽卡在后',
      'discard count 必须是 -1（全部），不能是具体数字',
      'draw count 精确等于 7',
    ],
  },

  {
    id: 'T003',
    cardName: 'Boss的命令',
    cardNameEN: "Boss's Orders",
    complexity: 1,
    effectSource: 'trainer_supporter',
    cardText: '将对手的 1 只备战区宝可梦与战斗宝可梦互换。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'FLOW_FORCE_SWITCH',
        slotValues: { chooser: 'self' },
      },
    },
    criticalAssertions: [
      'chooser 必须是 self（使用者选择目标）',
      '不能误判为 FLOW_SELF_SWITCH',
    ],
  },

  // ═══════════════════════════════════════════
  // ★★ 中等卡牌（单模式+参数变化）
  // ═══════════════════════════════════════════

  {
    id: 'T004',
    cardName: '古剑豹ex',
    cardNameEN: 'Ceruledge ex',
    complexity: 2,
    effectSource: 'attack',
    energyCost: '[火][火][无]',
    cardText: '造成 280 伤害。丢弃此宝可梦身上的 3 张火能量。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_SELF_DISCARD',
        slotValues: { damage: 280, discardCount: 3, discardType: 'fire' },
      },
    },
    criticalAssertions: [
      '必须识别为 DMG_SELF_DISCARD 而非 DMG_FLAT + 单独的能量丢弃',
      'discardType 精确为 fire',
      'discardCount 精确为 3',
    ],
  },

  {
    id: 'T005',
    cardName: '嵌套球',
    cardNameEN: 'Nest Ball',
    complexity: 2,
    effectSource: 'trainer_item',
    cardText: '从你的牌库中搜索 1 张基础宝可梦卡，放到你的备战区。然后将牌库洗牌。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'CARD_SEARCH_DECK',
        slotValues: {
          filter: { cardType: 'pokemon', evolutionStage: 'basic' },
          count: 1,
          destination: 'bench',
          revealToOpponent: true,
        },
      },
    },
    criticalAssertions: [
      'destination 必须是 bench 而非 hand',
      'filter 必须限定为基础宝可梦',
      '洗牌由引擎层自动处理，解析层不需要额外输出',
    ],
  },

  {
    id: 'T006',
    cardName: '奈特 (夜巡灵)',
    cardNameEN: 'Iono',
    complexity: 2,
    effectSource: 'trainer_supporter',
    cardText: '双方玩家各自将所有手牌洗入牌库。然后各自抽与自己剩余奖赏卡数量相同的卡。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'sequence',
        steps: [
          {
            type: 'pattern',
            patternId: 'CARD_SHUFFLE_DRAW',
            slotValues: { shuffleCount: -1, drawCount: -1 },  // -1 表示特殊计算
          },
        ],
      },
    },
    criticalAssertions: [
      '必须识别"双方"操作——不仅影响己方，也影响对手',
      '抽卡数量是动态的（等于剩余奖赏卡数），不是固定值',
      '这是一个同时影响双方的效果，需要引擎层特殊处理',
    ],
  },

  // ═══════════════════════════════════════════
  // ★★★ 中高复杂度（组合模式）
  // ═══════════════════════════════════════════

  {
    id: 'T007',
    cardName: '喷火龙ex',
    cardNameEN: 'Charizard ex',
    complexity: 3,
    effectSource: 'attack',
    energyCost: '[火][火]',
    cardText: '造成 180 伤害。对手每取过 1 张奖赏卡，此招式额外造成 30 伤害。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_CONDITIONAL_BONUS',
        slotValues: {
          baseDamage: 180,
          condition: { type: 'OPPONENT_PRIZES_TAKEN' },
          bonusDamage: 30,
          isPerUnit: true,
        },
      },
    },
    criticalAssertions: [
      'isPerUnit 必须为 true（每取1张+30，不是"取了就+30"）',
      'condition 精确为 OPPONENT_PRIZES_TAKEN',
      '最大伤害 = 180 + 5×30 = 330（对手最多取5张时使用此招式）',
    ],
  },

  {
    id: 'T008',
    cardName: '喷火龙ex',
    cardNameEN: 'Charizard ex',
    complexity: 3,
    effectSource: 'ability',
    cardText: '当你从手牌将此宝可梦进化时，可以使用1次。从你的牌库中搜索最多 3 张基础火能量卡，以任意方式贴到你的宝可梦身上。然后将牌库洗牌。',
    expected: {
      trigger: 'ON_EVOLVE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'NRG_ACCELERATE',
        slotValues: {
          source: 'deck',
          energyType: 'fire',
          count: 3,
          attachTarget: 'any_own',
        },
      },
    },
    criticalAssertions: [
      'trigger 必须是 ON_EVOLVE',
      '"最多3张" → count=3（上限，不是精确值）',
      '"以任意方式" → attachTarget="any_own"（可分配给多只）',
      'energyType 精确为 fire（基础火能量）',
    ],
  },

  {
    id: 'T009',
    cardName: '多龙巴鲁托ex',
    cardNameEN: 'Dragapult ex',
    complexity: 3,
    effectSource: 'attack',
    energyCost: '[超][超]',
    cardText: '造成 200 伤害。在对手的备战区宝可梦身上任意放置 6 个伤害指示物。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'sequence',
        steps: [
          { type: 'pattern', patternId: 'DMG_FLAT', slotValues: { damage: 200 } },
          { type: 'pattern', patternId: 'DMG_DISTRIBUTE', slotValues: { totalCounters: 6, targetScope: 'bench_only' } },
        ],
      },
    },
    criticalAssertions: [
      '★ 关键：200 伤害走 DMG_FLAT（攻击管线，受弱点/抗性影响）',
      '★ 关键：6 个指示物走 DMG_DISTRIBUTE（绕过管线！），targetScope 必须是 bench_only',
      '两个效果的区别是整个系统最容易出bug的地方',
    ],
  },

  {
    id: 'T010',
    cardName: '暴鲤龙',
    cardNameEN: 'Gyarados',
    complexity: 3,
    effectSource: 'attack',
    energyCost: '[水][水][水]',
    cardText: '翻硬币直到出现反面。每出现一个正面，造成 100 伤害。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_COIN_FLIP_REPEAT',
        slotValues: { damagePerHeads: 100 },
      },
    },
    criticalAssertions: [
      '必须是 DMG_COIN_FLIP_REPEAT 而非 DMG_COIN_FLIP_N',
      '"直到反面" 表示次数不确定，这是循环翻币',
    ],
  },

  // ═══════════════════════════════════════════
  // ★★★★ 高复杂度（嵌套条件+代价）
  // ═══════════════════════════════════════════

  {
    id: 'T011',
    cardName: '沙奈朵',
    cardNameEN: 'Gardevoir',
    complexity: 4,
    effectSource: 'ability',
    cardText: '在你的回合中，可以使用任意次数。从你的弃牌区选择 1 张基础超能力能量卡，贴到你的 1 只超能力宝可梦身上。然后在那只宝可梦身上放置 2 个伤害指示物。',
    expected: {
      trigger: 'ONCE_PER_TURN',  // 实际是 REPEATABLE，但模式近似
      parsedEffect: {
        type: 'sequence',
        steps: [
          {
            type: 'pattern',
            patternId: 'NRG_ACCELERATE',
            slotValues: {
              source: 'discard',
              energyType: 'psychic',
              count: 1,
              attachTarget: 'choice',
              targetFilter: { pokemonType: 'psychic' },
            },
          },
          {
            type: 'pattern',
            patternId: 'DMG_PLACE_COUNTERS',
            slotValues: {
              counters: 2,
              target: 'same_as_energy_target',
            },
          },
        ],
      },
    },
    criticalAssertions: [
      '★ "任意次数" → 这不是 ONCE_PER_TURN，引擎层需标记为 REPEATABLE',
      '★ 指示物放在"那只宝可梦" → target 必须与能量贴的目标一致',
      '★ "超能力宝可梦" → 必须有 pokemonType filter',
      '★ 2个指示物是 PLACE_COUNTERS（绕过管线），不是 deal_damage',
      '来源是弃牌区，不是牌库',
    ],
  },

  {
    id: 'T012',
    cardName: '戟脊龙 (Archaludon ex)',
    cardNameEN: 'Archaludon ex',
    complexity: 4,
    effectSource: 'ability',
    cardText: '在你的回合中可以使用 1 次。从你的弃牌区选择最多 2 张基础钢能量卡，贴到你的 1 只宝可梦身上。如果你这么做了，该宝可梦在对手的下一个回合中受到招式的伤害增加 60。',
    expected: {
      trigger: 'ONCE_PER_TURN',
      parsedEffect: {
        type: 'optional',
        optionalEffect: {
          type: 'sequence',
          steps: [
            {
              type: 'pattern',
              patternId: 'NRG_ACCELERATE',
              slotValues: {
                source: 'discard',
                energyType: 'metal',
                count: 2,
                attachTarget: 'choice',
              },
            },
            {
              type: 'pattern',
              patternId: 'STATUS_DAMAGE_REDUCTION',
              slotValues: {
                reduction: -60,  // 负值表示增加受伤
                duration: 'next_opponent_turn',
                scope: 'attacks_only',
              },
            },
          ],
        },
      },
    },
    criticalAssertions: [
      '★ "如果你这么做了" → 整体是 optional，不执行则两个效果都不发生',
      '★ 增加受伤 60 → 这是负面修饰器（reduction = -60），不是减伤',
      '★ 修饰器挂在目标宝可梦上，持续到对手下回合结束',
      '"最多2张" → count=2 是上限',
    ],
  },

  {
    id: 'T013',
    cardName: '超级药水',
    cardNameEN: 'Super Potion',
    complexity: 2,
    effectSource: 'trainer_item',
    cardText: '丢弃你的 1 只宝可梦身上的 1 张能量卡。治疗该宝可梦 60 点伤害。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'sequence',
        steps: [
          {
            type: 'pattern',
            patternId: 'NRG_DISCARD_TARGET',
            slotValues: {
              count: 1,
              target: 'self.any_pokemon',
              energyType: 'any',
              chooser: 'self',
            },
          },
          {
            type: 'pattern',
            patternId: 'STATUS_HEAL',
            slotValues: {
              healAmount: 60,
              target: 'same_pokemon',
            },
          },
        ],
      },
    },
    criticalAssertions: [
      '两个效果的目标必须是同一只宝可梦',
      '丢弃能量是代价，先于治疗执行',
      '能量类型不限（any）',
    ],
  },

  {
    id: 'T014',
    cardName: '稀有糖果',
    cardNameEN: 'Rare Candy',
    complexity: 3,
    effectSource: 'trainer_item',
    cardText: '选择你的 1 只基础宝可梦。从你的手牌中选择 1 张由该宝可梦进化而来的 Stage 2 卡，放到该宝可梦身上进化。（你不能在第 1 回合使用此卡，也不能对当回合放置的基础宝可梦使用。）',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'FLOW_EVOLVE',
        slotValues: {
          skipStage: true,
          targetFilter: { evolutionStage: 'basic' },
          evolutionFilter: { evolutionStage: 'stage2' },
          sourceZone: 'hand',  // 从手牌而非牌库
        },
      },
    },
    criticalAssertions: [
      'skipStage 必须为 true（跳过 Stage 1 直接进化到 Stage 2）',
      '★ 进化来源是手牌，不是牌库（不需要 search_deck）',
      '★ 使用限制：第1回合不能用、当回合放置的不能用 → 需要引擎层 precondition 校验',
    ],
  },

  // ═══════════════════════════════════════════
  // ★★★★★ 最高复杂度（多层嵌套 + 链锁反应）
  // ═══════════════════════════════════════════

  {
    id: 'T015',
    cardName: '月亮石（梦幻）',
    cardNameEN: 'Munkidori',
    complexity: 5,
    effectSource: 'ability',
    cardText: '当你从手牌将此宝可梦放到备战区时，可以使用1次。查看对手的手牌。你可以选择其中 1 张训练家卡，将其放到对手的弃牌区。',
    expected: {
      trigger: 'ON_PLAY',
      parsedEffect: {
        type: 'optional',
        optionalEffect: {
          type: 'sequence',
          steps: [
            {
              type: 'pattern',
              patternId: 'CARD_PEEK',
              slotValues: {
                peekCount: -1,  // 全部手牌
                source: 'opponent.hand',
              },
            },
            {
              type: 'optional',
              optionalEffect: {
                type: 'pattern',
                patternId: 'CARD_DISCARD_HAND',
                slotValues: {
                  count: 1,
                  filter: { cardType: 'trainer' },
                  source: 'opponent.hand',
                  chooser: 'self',
                },
              },
            },
          ],
        },
      },
    },
    criticalAssertions: [
      '触发是 ON_PLAY（放到备战区），不是 ON_EVOLVE',
      '两层 optional：外层"可以使用"，内层"可以选择"',
      '查看的是对手手牌，丢弃也是从对手手牌',
      'filter 限定为训练家卡',
      'chooser 是 self（你选对手手牌中的卡）',
    ],
  },

  {
    id: 'T016',
    cardName: '猛雷鼓ex',
    cardNameEN: 'Raging Bolt ex',
    complexity: 5,
    effectSource: 'attack',
    energyCost: '[雷][雷]',
    cardText: '你可以丢弃此宝可梦身上任意数量的基础雷能量。每丢弃 1 张，此招式额外造成 70 伤害。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'sequence',
        steps: [
          {
            type: 'optional',
            optionalEffect: {
              type: 'pattern',
              patternId: 'NRG_DISCARD_TARGET',
              slotValues: {
                count: -2,  // "任意数量" = 玩家选择
                target: 'self.active',
                energyType: 'lightning',
                chooser: 'self',
              },
            },
          },
          {
            type: 'pattern',
            patternId: 'DMG_DYNAMIC_MULTIPLIER',
            slotValues: {
              source: { type: 'DISCARDED_COUNT', description: '本次丢弃的能量数量' },
              multiplier: 70,
              baseDamage: 0,  // 基础伤害为 0，纯靠丢弃计算
            },
          },
        ],
      },
    },
    criticalAssertions: [
      '★ "你可以" + "任意数量" → 可以选择丢 0 张（此时伤害为 0）',
      '★ 伤害的动态源是"本次操作中丢弃的数量"，不是"场上总能量"',
      '★ 这意味着两个效果之间有数据传递（丢弃数 → 伤害计算），引擎层需要实现',
      'baseDamage 为 0（招式本身没有固定伤害）',
    ],
  },

  {
    id: 'T017',
    cardName: '铁包袱ex',
    cardNameEN: 'Iron Thorns ex',
    complexity: 4,
    effectSource: 'attack',
    energyCost: '[雷][雷][无]',
    cardText: '造成 160 伤害。在你的下一个回合中，此宝可梦不能使用招式。',
    expected: {
      trigger: 'NONE',
      parsedEffect: {
        type: 'sequence',
        steps: [
          { type: 'pattern', patternId: 'DMG_FLAT', slotValues: { damage: 160 } },
          {
            type: 'pattern',
            patternId: 'FLOW_LOCK',
            slotValues: {
              lockTarget: 'attacks',
              duration: 'next_own_turn',
              scope: 'self',  // 锁自己，不是锁对手
            },
          },
        ],
      },
    },
    criticalAssertions: [
      '★ FLOW_LOCK 的目标是自己，不是对手！scope 必须为 self',
      '★ duration 是 next_own_turn（你的下一回合），不是 next_opponent_turn',
      '如果此宝可梦撤退后再回来，锁定通常仍然生效（引擎层处理）',
    ],
  },

  {
    id: 'T018',
    cardName: '替身娃娃',
    cardNameEN: 'Mimikyu',
    complexity: 5,
    effectSource: 'ability',
    cardText: '如果此宝可梦在战斗场被对手宝可梦的招式的伤害击倒，在对手取奖赏卡之前，在攻击的宝可梦身上放置与此宝可梦受到的伤害等量的伤害指示物。',
    expected: {
      trigger: 'ON_KNOCKOUT',
      parsedEffect: {
        type: 'conditional',
        condition: {
          type: 'game_state',
          description: '此宝可梦在战斗场被对手招式伤害击倒',
        },
        ifTrue: {
          type: 'pattern',
          patternId: 'DMG_PLACE_COUNTERS',
          slotValues: {
            counters: -1,  // 动态值：等于受到的伤害
            target: 'attacking_pokemon',
            counterSource: 'damage_received',
          },
        },
        ifFalse: null,
      },
    },
    criticalAssertions: [
      '★★ 触发时机是 ON_KNOCKOUT，在奖赏卡结算之前',
      '★★ "放置伤害指示物" → 绕过弱点/抗性（place_counters, not deal_damage）',
      '★★ 指示物数量是动态的（等于受到的伤害），不是固定值',
      '★ 只有被招式伤害击倒才触发，被效果/指示物击倒不触发',
      '★ 目标是"攻击的宝可梦"，需要引擎追踪攻击来源',
      '这是最难的卡牌类型之一：涉及击倒事件、伤害追踪、结算时序',
    ],
  },
];


// ─────────────────────────────────────────────
// 测试运行器
// ─────────────────────────────────────────────

/**
 * 比较解析结果与期望，返回通过/失败及详细差异
 */
export function assertParseResult(
  actual: any,  // LLM 返回的 ParseResult
  testCase: CardTestCase,
): {
  passed: boolean;
  cardName: string;
  testId: string;
  diffs: string[];
  criticalFailures: string[];
} {
  const diffs: string[] = [];
  const criticalFailures: string[] = [];

  // 1. 检查 trigger
  if (actual.trigger !== testCase.expected.trigger) {
    const msg = `trigger: 期望 "${testCase.expected.trigger}", 实际 "${actual.trigger}"`;
    diffs.push(msg);
    criticalFailures.push(msg);
  }

  // 2. 检查 parsedEffect 的顶层 type
  const expectedType = testCase.expected.parsedEffect.type;
  const actualType = actual.parsedEffect?.type;
  if (actualType !== expectedType) {
    const msg = `effect.type: 期望 "${expectedType}", 实际 "${actualType}"`;
    diffs.push(msg);
    criticalFailures.push(msg);
  }

  // 3. 检查 patternId（如果是 pattern 类型）
  if (expectedType === 'pattern') {
    const expectedPattern = testCase.expected.parsedEffect.patternId;
    const actualPattern = actual.parsedEffect?.patternId;
    if (actualPattern !== expectedPattern) {
      const msg = `patternId: 期望 "${expectedPattern}", 实际 "${actualPattern}"`;
      diffs.push(msg);
      criticalFailures.push(msg);
    }
  }

  // 4. 递归检查 slotValues 的关键字段
  function compareSlots(expected: any, actual: any, path: string) {
    if (!expected || !actual) return;

    for (const key of Object.keys(expected)) {
      const ev = expected[key];
      const av = actual[key];

      if (typeof ev === 'object' && ev !== null && !Array.isArray(ev)) {
        compareSlots(ev, av, `${path}.${key}`);
      } else if (JSON.stringify(ev) !== JSON.stringify(av)) {
        diffs.push(`${path}.${key}: 期望 ${JSON.stringify(ev)}, 实际 ${JSON.stringify(av)}`);
      }
    }
  }

  if (testCase.expected.parsedEffect.slotValues && actual.parsedEffect?.slotValues) {
    compareSlots(
      testCase.expected.parsedEffect.slotValues,
      actual.parsedEffect.slotValues,
      'slotValues',
    );
  }

  // 5. 检查 sequence 的 steps
  if (expectedType === 'sequence') {
    const expectedSteps = testCase.expected.parsedEffect.steps || [];
    const actualSteps = actual.parsedEffect?.steps || [];

    if (expectedSteps.length !== actualSteps.length) {
      diffs.push(`steps.length: 期望 ${expectedSteps.length}, 实际 ${actualSteps.length}`);
    }

    expectedSteps.forEach((es: any, i: number) => {
      const as_step = actualSteps[i];
      if (!as_step) {
        diffs.push(`steps[${i}]: 缺失`);
        return;
      }
      if (es.patternId && es.patternId !== as_step.patternId) {
        const msg = `steps[${i}].patternId: 期望 "${es.patternId}", 实际 "${as_step.patternId}"`;
        diffs.push(msg);
        criticalFailures.push(msg);
      }
    });
  }

  return {
    passed: criticalFailures.length === 0,
    cardName: testCase.cardName,
    testId: testCase.id,
    diffs,
    criticalFailures,
  };
}


/**
 * 批量运行测试并输出报告
 */
export function runTestSuite(results: Map<string, any>): {
  total: number;
  passed: number;
  failed: number;
  report: string;
} {
  let passed = 0;
  let failed = 0;
  const lines: string[] = ['═══ PTCG Card Parsing Test Report ═══\n'];

  for (const testCase of CARD_TEST_SUITE) {
    const actual = results.get(testCase.id);
    if (!actual) {
      lines.push(`❓ ${testCase.id} ${testCase.cardName} — 未执行`);
      continue;
    }

    const result = assertParseResult(actual, testCase);

    if (result.passed) {
      passed++;
      lines.push(`✅ ${testCase.id} ${testCase.cardName} (★${'★'.repeat(testCase.complexity - 1)})`);
    } else {
      failed++;
      lines.push(`❌ ${testCase.id} ${testCase.cardName} (★${'★'.repeat(testCase.complexity - 1)})`);
      result.criticalFailures.forEach(f => lines.push(`   🔴 ${f}`));
      result.diffs.forEach(d => lines.push(`   ⚠️  ${d}`));
    }
  }

  const total = passed + failed;
  lines.push(`\n═══ 总计: ${total} | 通过: ${passed} | 失败: ${failed} | 通过率: ${((passed / total) * 100).toFixed(1)}% ═══`);

  return { total, passed, failed, report: lines.join('\n') };
}
