/**
 * ============================================================================
 * PTCG Card Text Semantic Parser — System Prompt + Few-Shot Examples
 * ============================================================================
 *
 * 用途：喂给 Claude API，让它将卡牌原始文本解析为结构化的 ParsedEffect JSON。
 * 输出的 JSON 直接匹配 effect-pattern-catalog.ts 中定义的 PatternId 和 SlotValues。
 *
 * 分两个文件：
 *   1. SYSTEM_PROMPT — 完整的规则语境 + 输出格式定义
 *   2. FEW_SHOT_EXAMPLES — 从简单到复杂的 8 个标注样本
 * ============================================================================
 */

// ─────────────────────────────────────────────
// 1. System Prompt
// ─────────────────────────────────────────────

export const SEMANTIC_PARSER_SYSTEM_PROMPT = `你是一个 PTCG（宝可梦集换式卡牌游戏）卡牌效果语义解析器。

你的唯一任务是：将卡牌的文字描述解析为结构化的 JSON 中间表示。
你不需要生成任何代码。你只需要准确理解卡牌文字的含义，并映射到预定义的效果模式。

═══════════════════════════════════════════
PTCG 核心规则语境（你必须牢记）
═══════════════════════════════════════════

【伤害 vs 伤害指示物 — 最关键的区分】
- "造成 X 伤害" → 这是攻击伤害，走完整的 Damage Pipeline：基础伤害 → 加/减伤修饰 → 弱点(×2) → 抗性(-30) → 最终伤害
- "放置 N 个伤害指示物" → 这不是攻击伤害，完全绕过 Pipeline，直接扣 N×10 HP。不受弱点、抗性、减伤影响
- "对备战区宝可梦造成 X 伤害" → 虽然写的是"伤害"，但备战区伤害不受弱点/抗性影响（标记为 bench_effect）

【"可以"与"必须"】
- 含"你可以"(You may) → 可选操作 (optional)
- 不含"可以" → 强制操作 (mandatory)
- "如果你这么做了" (If you do) → 前一步是可选的，后一步仅在前一步执行后才触发

【能量消耗 vs 能量丢弃】
- 招式左侧的能量图标 → 使用招式的前置条件（必须有但不消耗）
- "丢弃此宝可梦身上的 X 张能量" → 效果中的强制丢弃（执行后能量进弃牌区）
- 撤退费 → 撤退时丢弃的能量（不是效果）

【特性 (Ability) 触发时机】
- "当你从手牌进化到此宝可梦时" → ON_EVOLVE（一次性，进化瞬间触发）
- "在你的回合中可以使用1次" → ONCE_PER_TURN（主动使用，每回合1次）
- 无触发词，描述持续效果 → PASSIVE（被动，持续生效）
- "此宝可梦在战斗场上时" → WHILE_ACTIVE

【搜索后必须洗牌】
- 任何"从牌库中搜索"操作执行后，必须洗牌库

【异常状态规则】
- 只有战斗场的宝可梦可以有异常状态
- 撤退到备战区 → 清除所有异常状态
- 进化 → 清除所有异常状态
- 睡眠/麻痹 互斥（新的替换旧的）
- 混乱 可以和 中毒/灼伤 并存

【ex/V 规则】
- ex 或 V 宝可梦被击倒 → 对手取 2 张奖赏卡（而非 1 张）
- VSTAR/VMAX 被击倒 → 对手取 2-3 张奖赏卡

【支援者卡限制】
- 每回合只能使用 1 张支援者卡
- 物品卡没有使用次数限制

═══════════════════════════════════════════
效果模式 ID 清单（你只能使用以下模式）
═══════════════════════════════════════════

--- 伤害模式 ---
DMG_FLAT: 固定伤害 — "造成 X 伤害"
DMG_SELF_DISCARD: 伤害+自我消耗 — "造成 X 伤害。丢弃 N 张能量"
DMG_CONDITIONAL_BONUS: 条件加成伤害 — "造成 X。若条件 C，额外 +Y"
DMG_COIN_FLIP_REPEAT: 翻币循环 — "翻币直到反面，每正面 X 伤害"
DMG_COIN_FLIP_N: 翻N次币 — "翻 N 次，每正面 X 伤害"
DMG_DYNAMIC_MULTIPLIER: 动态乘算 — "伤害 = 数量 × X"
DMG_BENCH_SPREAD: 备战扩散 — "对备战区各造成 X"
DMG_DISTRIBUTE: 分配伤害 — "放置 N 个指示物，任意分配"
DMG_PLACE_COUNTERS: 放置指示物 — "放 N 个伤害指示物"（绕过弱点/抗性！）
DMG_RECOIL: 反冲自伤 — "造成 X。自身受 Y"

--- 能量模式 ---
NRG_ACCELERATE: 能量加速 — "从牌库/弃牌区搜索能量贴上"
NRG_MOVE: 能量转移 — "将能量从 A 移到 B"
NRG_DISCARD_TARGET: 丢弃对手能量 — "丢弃目标能量"
NRG_RECOVER: 能量回收 — "弃牌区能量加入手牌"
NRG_SPECIAL_EFFECT: 特殊能量效果 — 贴着时持续生效

--- 卡牌移动模式 ---
CARD_SEARCH_DECK: 搜牌库 — "搜索满足条件的卡"
CARD_DRAW: 抽卡 — "抽 N 张"
CARD_DISCARD_HAND: 弃手牌 — "丢弃 N 张手牌"
CARD_SHUFFLE_DRAW: 洗手重抽 — "手牌洗入牌库，抽 N 张"
CARD_RECOVER: 回收 — "弃牌区卡加入手牌/牌库"
CARD_PEEK: 窥视 — "看牌库顶 N 张"

--- 状态模式 ---
STATUS_APPLY: 施加异常 — "目标陷入中毒/灼伤/..."
STATUS_HEAL: 治疗 — "治疗 X 点"
STATUS_DAMAGE_REDUCTION: 减伤 — "下回合受伤 -X"
STATUS_IMMUNITY: 免疫 — "下回合不受伤害/效果"

--- 流程模式 ---
FLOW_FORCE_SWITCH: 强制切换 — "替换对手战斗宝可梦"
FLOW_SELF_SWITCH: 自我切换 — "替换为备战区"
FLOW_EVOLVE: 进化加速 — "搜索进化卡直接进化"
FLOW_LOCK: 封锁 — "对手不能使用 X"
FLOW_PRIZE_MANIPULATION: 奖赏操作 — "查看/交换奖赏卡"

═══════════════════════════════════════════
输出格式
═══════════════════════════════════════════

你必须输出严格的 JSON，无任何额外文字。格式如下：

{
  "cardName": "卡牌名称",
  "effectSource": "attack" | "ability" | "trainer_item" | "trainer_supporter" | "trainer_stadium" | "special_energy",
  "trigger": "NONE" | "ON_EVOLVE" | "ONCE_PER_TURN" | "PASSIVE" | "WHILE_ACTIVE" | "ON_PLAY" | "...",
  "parsedEffect": {
    // ParsedEffect 对象（见下方结构）
  },
  "confidence": 0.0-1.0,
  "ambiguities": ["如果有不确定的地方，在此列出"]
}

ParsedEffect 结构：

1. 单一模式：
{
  "type": "pattern",
  "patternId": "DMG_FLAT",
  "slotValues": { "damage": 120 }
}

2. 顺序组合：
{
  "type": "sequence",
  "steps": [ ParsedEffect, ParsedEffect, ... ]
}

3. 条件分支：
{
  "type": "conditional",
  "condition": { "type": "coin_flip" | "game_state", "description": "..." },
  "ifTrue": ParsedEffect,
  "ifFalse": ParsedEffect  // 可选，无则为 null
}

4. 可选操作：
{
  "type": "optional",
  "optionalEffect": ParsedEffect,
  "optionalCost": ParsedEffect  // "如果你这么做了"前面的代价
}

5. 重复/遍历：
{
  "type": "repeat",
  "repeatEffect": ParsedEffect,
  "repeatSource": "opponent.bench"
}

═══════════════════════════════════════════
关键注意事项
═══════════════════════════════════════════

1. 永远区分 "伤害" 和 "伤害指示物"
2. 备战区的"伤害"用 DMG_BENCH_SPREAD，不用 DMG_FLAT
3. "你可以" → 用 optional 包裹
4. 一张卡可能有多个效果，用 sequence 组合
5. 条件加成中的"每...+X" → isPerUnit: true
6. 搜索后洗牌是引擎层处理，不需要你额外输出
7. confidence < 0.7 时，必须在 ambiguities 里说明原因
8. 如果遇到完全无法归类的效果，用最接近的模式 + 在 ambiguities 中标注
`;


// ─────────────────────────────────────────────
// 2. Few-Shot Examples (8个，从简单到复杂)
// ─────────────────────────────────────────────

export const FEW_SHOT_EXAMPLES = [

  // ═══ Example 1: 最简单 — 固定伤害 ═══
  {
    role: 'user' as const,
    content: `解析以下卡牌效果：
卡牌名：皮卡丘 (Pikachu)
效果来源：招式 - 电击 (Thunder Shock)
能量消耗：[雷][无]
文本：造成 40 伤害。`,
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
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
    }, null, 2),
  },

  // ═══ Example 2: 伤害+消耗 ═══
  {
    role: 'user' as const,
    content: `解析以下卡牌效果：
卡牌名：古剑豹ex (Ceruledge ex)
效果来源：招式 - 苦痛之剑 (Bitter Blade)
能量消耗：[火][火][无]
文本：造成 280 伤害。丢弃此宝可梦身上的 3 张火能量。`,
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      cardName: '古剑豹ex',
      effectSource: 'attack',
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_SELF_DISCARD',
        slotValues: {
          damage: 280,
          discardCount: 3,
          discardType: 'fire',
        },
      },
      confidence: 1.0,
      ambiguities: [],
    }, null, 2),
  },

  // ═══ Example 3: 条件加成（每X+Y模式）═══
  {
    role: 'user' as const,
    content: `解析以下卡牌效果：
卡牌名：喷火龙ex (Charizard ex)
效果来源：招式 - 燃烧黑暗 (Burning Dark)
能量消耗：[火][火]
文本：造成 180 伤害。对手每取过 1 张奖赏卡，此招式额外造成 30 伤害。`,
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      cardName: '喷火龙ex',
      effectSource: 'attack',
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'DMG_CONDITIONAL_BONUS',
        slotValues: {
          baseDamage: 180,
          condition: {
            type: 'OPPONENT_PRIZES_TAKEN',
            description: '对手已取奖赏卡数量',
          },
          bonusDamage: 30,
          isPerUnit: true,
        },
      },
      confidence: 1.0,
      ambiguities: [],
    }, null, 2),
  },

  // ═══ Example 4: 特性 — 能量加速 (ON_EVOLVE 触发) ═══
  {
    role: 'user' as const,
    content: `解析以下卡牌效果：
卡牌名：喷火龙ex (Charizard ex)
效果来源：特性 - 炼狱支配 (Infernal Reign)
文本：当你从手牌将此宝可梦进化时，可以使用1次。从你的牌库中搜索最多 3 张基础火能量卡，以任意方式贴到你的宝可梦身上。然后将牌库洗牌。`,
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      cardName: '喷火龙ex',
      effectSource: 'ability',
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
      confidence: 1.0,
      ambiguities: [],
    }, null, 2),
  },

  // ═══ Example 5: 支援者 — Boss命令（强制切换）═══
  {
    role: 'user' as const,
    content: `解析以下卡牌效果：
卡牌名：Boss的命令 (Boss's Orders)
效果来源：支援者卡
文本：将对手的 1 只备战区宝可梦与战斗宝可梦互换。`,
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      cardName: 'Boss的命令',
      effectSource: 'trainer_supporter',
      trigger: 'NONE',
      parsedEffect: {
        type: 'pattern',
        patternId: 'FLOW_FORCE_SWITCH',
        slotValues: {
          chooser: 'self',
        },
      },
      confidence: 1.0,
      ambiguities: [],
    }, null, 2),
  },

  // ═══ Example 6: 复合效果 — 伤害 + 扩散 + 状态 ═══
  {
    role: 'user' as const,
    content: `解析以下卡牌效果：
卡牌名：多龙巴鲁托ex (Dragapult ex)
效果来源：招式 - 幻影俯冲 (Phantom Dive)
能量消耗：[超][超]
文本：造成 200 伤害。在对手的备战区宝可梦身上任意放置 5 个伤害指示物。`,
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      cardName: '多龙巴鲁托ex',
      effectSource: 'attack',
      trigger: 'NONE',
      parsedEffect: {
        type: 'sequence',
        steps: [
          {
            type: 'pattern',
            patternId: 'DMG_FLAT',
            slotValues: { damage: 200 },
          },
          {
            type: 'pattern',
            patternId: 'DMG_DISTRIBUTE',
            slotValues: {
              totalCounters: 5,
              targetScope: 'bench_only',
            },
          },
        ],
      },
      confidence: 1.0,
      ambiguities: [],
    }, null, 2),
  },

  // ═══ Example 7: 特性 — 被动修饰器 + 代价（沙奈朵）═══
  {
    role: 'user' as const,
    content: `解析以下卡牌效果：
卡牌名：沙奈朵 (Gardevoir)
效果来源：特性 - 灵魂拥抱 (Psychic Embrace)
文本：在你的回合中，可以使用任意次数。从你的弃牌区选择 1 张基础超能力能量卡，贴到你的 1 只超能力宝可梦身上。然后在那只宝可梦身上放置 2 个伤害指示物。`,
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      cardName: '沙奈朵',
      effectSource: 'ability',
      trigger: 'ONCE_PER_TURN',
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
            },
          },
          {
            type: 'pattern',
            patternId: 'DMG_PLACE_COUNTERS',
            slotValues: {
              counters: 2,
              target: 'selected_pokemon',
            },
          },
        ],
      },
      confidence: 0.9,
      ambiguities: [
        '触发类型标注为 ONCE_PER_TURN，但文本说"可以使用任意次数"，实际这是一个可重复使用的特性。引擎层应将此特性标记为 REPEATABLE 而非严格的 ONCE_PER_TURN。',
        'attachTarget 限定为超能力宝可梦，需要 filter: { pokemonType: "psychic" }，此处简化为 "choice"，引擎层需补充过滤条件。',
      ],
    }, null, 2),
  },

  // ═══ Example 8: 复杂复合 — 可选 + 条件 + 多效果 ═══
  {
    role: 'user' as const,
    content: `解析以下卡牌效果：
卡牌名：博士的研究 — 奥博士 (Professor's Research)
效果来源：支援者卡
文本：丢弃你的所有手牌，然后抽 7 张卡。`,
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      cardName: '博士的研究',
      effectSource: 'trainer_supporter',
      trigger: 'NONE',
      parsedEffect: {
        type: 'sequence',
        steps: [
          {
            type: 'pattern',
            patternId: 'CARD_DISCARD_HAND',
            slotValues: {
              count: -1,
              chooser: 'self',
            },
          },
          {
            type: 'pattern',
            patternId: 'CARD_DRAW',
            slotValues: {
              count: 7,
            },
          },
        ],
      },
      confidence: 1.0,
      ambiguities: [],
    }, null, 2),
  },

  // ═══ Example 9: 可选丢弃 → 动态伤害（丢弃和伤害必须拆成两步）═══
  {
    role: 'user' as const,
    content: `解析以下卡牌效果：
卡牌名：猛雷鼓ex (Raging Bolt ex)
效果来源：招式
能量消耗：[雷][雷]
文本：你可以丢弃此宝可梦身上任意数量的基础雷能量。每丢弃 1 张，此招式额外造成 70 伤害。`,
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      cardName: '猛雷鼓ex',
      effectSource: 'attack',
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
                count: -2,
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
              baseDamage: 0,
            },
          },
        ],
      },
      confidence: 0.95,
      ambiguities: [
        '"你可以"+"任意数量" → 可以选择丢 0 张（此时伤害为 0）。丢弃是独立的 NRG_DISCARD_TARGET 步骤，伤害计算是独立的 DMG_DYNAMIC_MULTIPLIER 步骤，两者之间有数据传递（丢弃数→乘算伤害）。',
      ],
    }, null, 2),
  },
];


// ─────────────────────────────────────────────
// 3. 构建完整的 API 调用消息
// ─────────────────────────────────────────────

/**
 * 调用 Claude API 解析一张卡牌文本
 *
 * @param cardName 卡牌名称
 * @param effectSource 效果来源（招式/特性/训练家/特殊能量）
 * @param cardText 卡牌的效果文本描述
 * @param energyCost 招式的能量消耗（如有）
 */
export function buildParseRequest(
  cardName: string,
  effectSource: 'attack' | 'ability' | 'trainer_item' | 'trainer_supporter' | 'trainer_stadium' | 'special_energy',
  cardText: string,
  energyCost?: string,
) {
  const userMessage = [
    `解析以下卡牌效果：`,
    `卡牌名：${cardName}`,
    `效果来源：${effectSource === 'attack' ? '招式' : effectSource === 'ability' ? '特性' : effectSource}`,
    energyCost ? `能量消耗：${energyCost}` : null,
    `文本：${cardText}`,
  ].filter(Boolean).join('\n');

  return {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SEMANTIC_PARSER_SYSTEM_PROMPT,
    messages: [
      ...FEW_SHOT_EXAMPLES,
      { role: 'user' as const, content: userMessage },
    ],
  };
}


// ─────────────────────────────────────────────
// 4. 响应解析与验证
// ─────────────────────────────────────────────

import { PatternId } from './effect-pattern-catalog';

const VALID_PATTERN_IDS = new Set(Object.values(PatternId));

export interface ParseResult {
  cardName: string;
  effectSource: string;
  trigger: string;
  parsedEffect: any;  // ParsedEffect
  confidence: number;
  ambiguities: string[];
}

/**
 * 解析 Claude API 返回的 JSON，进行基础校验
 */
export function validateParseResult(raw: string): {
  valid: boolean;
  result?: ParseResult;
  errors: string[];
} {
  const errors: string[] = [];

  let parsed: any;
  try {
    // 清理可能的 markdown 包裹
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { valid: false, errors: [`JSON 解析失败: ${e}`] };
  }

  // 必填字段检查
  if (!parsed.cardName) errors.push('缺少 cardName');
  if (!parsed.effectSource) errors.push('缺少 effectSource');
  if (!parsed.parsedEffect) errors.push('缺少 parsedEffect');
  if (typeof parsed.confidence !== 'number') errors.push('缺少 confidence');

  // 递归验证 ParsedEffect 中的 patternId
  function validateEffect(effect: any, path: string) {
    if (!effect || !effect.type) {
      errors.push(`${path}: 缺少 type 字段`);
      return;
    }

    switch (effect.type) {
      case 'pattern':
        if (!effect.patternId) {
          errors.push(`${path}: pattern 类型缺少 patternId`);
        } else if (!VALID_PATTERN_IDS.has(effect.patternId)) {
          errors.push(`${path}: 未知的 patternId "${effect.patternId}"`);
        }
        if (!effect.slotValues || typeof effect.slotValues !== 'object') {
          errors.push(`${path}: pattern 类型缺少 slotValues`);
        }
        break;

      case 'sequence':
        if (!Array.isArray(effect.steps) || effect.steps.length === 0) {
          errors.push(`${path}: sequence 类型缺少 steps 数组`);
        } else {
          effect.steps.forEach((step: any, i: number) =>
            validateEffect(step, `${path}.steps[${i}]`)
          );
        }
        break;

      case 'conditional':
        if (!effect.condition) errors.push(`${path}: conditional 缺少 condition`);
        if (effect.ifTrue) validateEffect(effect.ifTrue, `${path}.ifTrue`);
        if (effect.ifFalse) validateEffect(effect.ifFalse, `${path}.ifFalse`);
        break;

      case 'optional':
        if (effect.optionalEffect) {
          validateEffect(effect.optionalEffect, `${path}.optionalEffect`);
        }
        break;

      case 'repeat':
        if (effect.repeatEffect) {
          validateEffect(effect.repeatEffect, `${path}.repeatEffect`);
        }
        if (!effect.repeatSource) {
          errors.push(`${path}: repeat 缺少 repeatSource`);
        }
        break;

      default:
        errors.push(`${path}: 未知的 effect type "${effect.type}"`);
    }
  }

  if (parsed.parsedEffect) {
    validateEffect(parsed.parsedEffect, 'parsedEffect');
  }

  return {
    valid: errors.length === 0,
    result: errors.length === 0 ? parsed as ParseResult : undefined,
    errors,
  };
}
