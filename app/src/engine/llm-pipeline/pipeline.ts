/**
 * ============================================================================
 * PTCG Card Effect Pipeline — End-to-End
 * ============================================================================
 *
 * 完整的三层流水线：
 *   Layer 1: LLM 语义解析 (card text → ParsedEffect JSON)
 *   Layer 2: 模式匹配+动作生成 (ParsedEffect → ActionPacket[])
 *   Layer 3: 自动化验证 (ActionPacket → pass/fail)
 *
 * 设计原则：LLM 只做理解，代码做映射和验证。
 * ============================================================================
 */

import { PATTERN_CATALOG, PatternId, type ParsedEffect, TriggerType, ConditionType } from './effect-pattern-catalog';
import { buildParseRequest, validateParseResult, type ParseResult } from './semantic-parser';
import { CARD_TEST_SUITE, assertParseResult, runTestSuite } from './card-test-suite';

// ─────────────────────────────────────────────
// 核心类型（引用自 atomic-actions.ts）
// ─────────────────────────────────────────────

interface AtomicAction {
  type: string;
  [key: string]: any;
}

interface ActionPacket {
  executionId: string;
  source: {
    sourceCardId: string;
    sourceType: 'attack' | 'ability' | 'item' | 'supporter' | 'stadium';
    sourcePlayer: string;
  };
  trigger?: string;
  cost?: any;
  actions: AtomicAction[];
  postActions?: AtomicAction[];
}


// ═══════════════════════════════════════════
// Layer 1: LLM 语义解析
// ═══════════════════════════════════════════

/**
 * 调用 LLM 将卡牌文本解析为 ParsedEffect。
 *
 * 支持两种模式：
 *   1. API 模式 — 设置 ANTHROPIC_API_KEY 环境变量，直接调用 Claude API
 *   2. CLI 模式 — 无 API Key 时，通过 `claude -p` 子进程调用本地 Claude Code
 */
async function parseCardText(
  cardName: string,
  effectSource: 'attack' | 'ability' | 'trainer_item' | 'trainer_supporter' | 'trainer_stadium' | 'special_energy',
  cardText: string,
  energyCost?: string,
): Promise<ParseResult> {
  const request = buildParseRequest(cardName, effectSource, cardText, energyCost);

  let rawText: string;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    // ── API 模式 ──
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();
    rawText = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('');
  } else {
    // ── CLI 模式 — 通过 claude -p 调用 ──
    const { execSync } = await import('child_process');

    // 构建完整 prompt：system + few-shot + user message
    const userMsg = request.messages[request.messages.length - 1].content;
    const fullPrompt = request.system + '\n\n' +
      request.messages.slice(0, -1).map((m: any) =>
        m.role === 'user' ? `[用户示例]\n${m.content}` : `[助手示例]\n${m.content}`
      ).join('\n\n') +
      '\n\n[正式请求]\n' + userMsg;

    console.log(`[Pipeline] 使用 claude CLI 模式 (无 API Key)...`);
    rawText = execSync(
      `claude -p --output-format text`,
      {
        input: fullPrompt,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        timeout: 120_000,
      },
    ).trim();
  }

  const validation = validateParseResult(rawText);

  if (!validation.valid) {
    throw new Error(
      `LLM 解析结果校验失败 [${cardName}]:\n` +
      validation.errors.map(e => `  - ${e}`).join('\n') +
      `\n\n原始输出:\n${rawText.slice(0, 500)}`
    );
  }

  return validation.result!;
}


// ═══════════════════════════════════════════
// Layer 2: 模式匹配 → ActionPacket 生成
// ═══════════════════════════════════════════

/**
 * 核心映射器：将 ParsedEffect 递归转换为 AtomicAction 序列
 *
 * 这一层是纯确定性代码，不依赖 LLM。
 * 每个 PatternId 对应一个固定的模板函数。
 */
function effectToActions(effect: ParsedEffect, context: {
  sourceCardId: string;
  sourcePlayer: string;
}): AtomicAction[] {
  switch (effect.type) {

    // ─── 单一模式 → 直接查模板 ───
    case 'pattern':
      return patternToActions(effect.patternId!, effect.slotValues || {}, context);

    // ─── 顺序组合 → 拼接 ───
    case 'sequence':
      return (effect.steps || []).flatMap(step => effectToActions(step, context));

    // ─── 条件分支 ───
    case 'conditional': {
      const actions: AtomicAction[] = [];
      const condition = effect.condition!;

      if (condition.type === 'coin_flip') {
        actions.push({
          type: 'flip_coin',
          mode: 'single',
          onHeads: effect.ifTrue ? effectToActions(effect.ifTrue, context) : [],
          onTails: effect.ifFalse ? effectToActions(effect.ifFalse, context) : [{ type: 'no_op' }],
        });
      } else {
        // game_state 条件 → 生成 conditional action
        actions.push({
          type: 'conditional',
          condition: mapCondition(condition),
          ifTrue: effect.ifTrue ? effectToActions(effect.ifTrue, context) : [],
          ifFalse: effect.ifFalse ? effectToActions(effect.ifFalse, context) : [],
        });
      }
      return actions;
    }

    // ─── 可选操作 ───
    case 'optional': {
      return [{
        type: 'player_choice',
        choiceType: 'yes_no',
        prompt: '是否执行此效果？',
        onYes: effect.optionalEffect
          ? effectToActions(effect.optionalEffect, context)
          : [],
        onNo: [{ type: 'no_op' }],
      }];
    }

    // ─── 重复/遍历 ───
    case 'repeat': {
      return [{
        type: 'for_each',
        targets: effect.repeatSource || 'unknown',
        action: effect.repeatEffect
          ? effectToActions(effect.repeatEffect, context)
          : [],
      }];
    }

    default:
      console.warn(`未知的 effect type: ${effect.type}`);
      return [{ type: 'no_op', warning: `unhandled effect type: ${effect.type}` }];
  }
}


/**
 * 模式 → 原子动作的模板映射
 *
 * 每个 PatternId 有一个专用的模板函数。
 * 这是整个系统准确性的保障——确定性代码，不会产生幻觉。
 */
function patternToActions(
  patternId: PatternId,
  slots: Record<string, any>,
  ctx: { sourceCardId: string; sourcePlayer: string },
): AtomicAction[] {

  switch (patternId) {

    // ─── A. 伤害模式 ───

    case PatternId.DMG_FLAT:
      return [{
        type: 'deal_damage',
        target: { player: 'opponent', zone: 'active' },
        amount: slots.damage,
        damageTag: 'attack',  // 走弱点/抗性管线
      }];

    case PatternId.DMG_SELF_DISCARD:
      return [
        {
          type: 'deal_damage',
          target: { player: 'opponent', zone: 'active' },
          amount: slots.damage,
          damageTag: 'attack',
        },
        {
          type: 'discard_energy',
          from: { player: 'self', zone: 'active' },
          energyType: slots.discardType,
          count: slots.discardCount,
        },
      ];

    case PatternId.DMG_CONDITIONAL_BONUS:
      return [{
        type: 'conditional',
        condition: mapCondition(slots.condition),
        // 动态计算：如果 isPerUnit，伤害 = base + count × bonus
        dynamicDamage: slots.isPerUnit
          ? { base: slots.baseDamage, perUnit: slots.bonusDamage, source: slots.condition }
          : null,
        ifTrue: [{
          type: 'deal_damage',
          target: { player: 'opponent', zone: 'active' },
          amount: slots.isPerUnit ? 'DYNAMIC' : slots.baseDamage + slots.bonusDamage,
          damageTag: 'attack',
        }],
        ifFalse: [{
          type: 'deal_damage',
          target: { player: 'opponent', zone: 'active' },
          amount: slots.baseDamage,
          damageTag: 'attack',
        }],
      }];

    case PatternId.DMG_COIN_FLIP_REPEAT:
      return [{
        type: 'flip_coin',
        mode: 'until_tails',
        onResult: {
          type: 'deal_damage',
          target: { player: 'opponent', zone: 'active' },
          amount: 'HEADS_COUNT * ' + slots.damagePerHeads,
          damageTag: 'attack',
        },
      }];

    case PatternId.DMG_COIN_FLIP_N:
      return [{
        type: 'flip_coin',
        mode: 'flip_n',
        count: slots.flipCount,
        onResult: {
          type: 'deal_damage',
          target: { player: 'opponent', zone: 'active' },
          amount: 'HEADS_COUNT * ' + slots.damagePerHeads,
          damageTag: 'attack',
        },
      }];

    case PatternId.DMG_DYNAMIC_MULTIPLIER:
      return [{
        type: 'dynamic_value',
        source: mapCondition(slots.source),
        multiplier: slots.multiplier,
        action: {
          type: 'deal_damage',
          target: { player: 'opponent', zone: 'active' },
          amount: 'DYNAMIC',  // 运行时计算: baseDamage + count × multiplier
          baseDamage: slots.baseDamage || 0,
          damageTag: 'attack',
        },
      }];

    case PatternId.DMG_BENCH_SPREAD: {
      const actions: AtomicAction[] = [];
      if (slots.mainDamage > 0) {
        actions.push({
          type: 'deal_damage',
          target: { player: 'opponent', zone: 'active' },
          amount: slots.mainDamage,
          damageTag: 'attack',
        });
      }
      actions.push({
        type: 'for_each',
        targets: {
          player: 'opponent',
          zone: 'bench',
          count: slots.benchTargetCount,  // -1 = all
        },
        action: {
          type: 'deal_damage',
          amount: slots.benchDamage,
          damageTag: 'bench_effect',  // ★ 不走弱点/抗性
        },
      });
      return actions;
    }

    case PatternId.DMG_DISTRIBUTE:
      return [{
        type: 'player_choice',
        choiceType: 'distribute_counters',
        totalCounters: slots.totalCounters,
        targets: { player: 'opponent', scope: slots.targetScope },
        action: {
          type: 'place_damage_counters',
          // 具体分配由玩家交互决定
        },
      }];

    case PatternId.DMG_PLACE_COUNTERS:
      return [{
        type: 'place_damage_counters',
        target: resolveTarget(slots.target),
        counters: slots.counters,
        // ★ 没有 damageTag — 这不是攻击伤害，直接放指示物
      }];

    case PatternId.DMG_RECOIL:
      return [
        {
          type: 'deal_damage',
          target: { player: 'opponent', zone: 'active' },
          amount: slots.damage,
          damageTag: 'attack',
        },
        slots.recoilType === 'counters'
          ? { type: 'place_damage_counters', target: { player: 'self', zone: 'active' }, counters: slots.recoilDamage / 10 }
          : { type: 'deal_damage', target: { player: 'self', zone: 'active' }, amount: slots.recoilDamage, damageTag: 'self_damage' },
      ];

    // ─── B. 能量模式 ───

    case PatternId.NRG_ACCELERATE:
      return [
        {
          type: slots.source === 'deck' ? 'search_deck' : 'search_discard',
          filter: { cardType: 'energy', energyType: slots.energyType },
          count: slots.count,
        },
        {
          type: 'player_choice',
          choiceType: slots.attachTarget === 'any_own' ? 'distribute_energy' : 'select_pokemon',
          targets: { player: 'self', zone: 'all_pokemon' },
          filter: slots.targetFilter || null,
        },
        {
          type: 'attach_energy',
          // 具体贴法由上一步的选择决定
        },
        ...(slots.source === 'deck' ? [{ type: 'shuffle_deck' }] : []),
      ];

    case PatternId.NRG_MOVE:
      return [
        {
          type: 'player_choice',
          choiceType: 'select_energy_and_targets',
          fromScope: slots.fromScope,
          toScope: slots.toScope,
          energyType: slots.energyType,
          count: slots.count,
        },
        {
          type: 'move_energy',
          count: slots.count,
          energyType: slots.energyType,
        },
      ];

    case PatternId.NRG_DISCARD_TARGET:
      return [
        {
          type: 'player_choice',
          player: slots.chooser,
          choiceType: 'select_energy',
          target: resolveTarget(slots.target),
          energyType: slots.energyType,
          count: slots.count,
        },
        {
          type: 'discard_energy',
          count: slots.count,
        },
      ];

    case PatternId.NRG_RECOVER:
      return [
        {
          type: 'player_choice',
          choiceType: 'select_from_discard',
          filter: { cardType: 'energy', energyType: slots.energyType },
          count: slots.count,
        },
        {
          type: 'move_card',
          to: slots.destination,
        },
      ];

    case PatternId.NRG_SPECIAL_EFFECT:
      return [{
        type: 'register_modifier',
        scope: 'while_attached',
        modifier: { type: slots.modifierType, value: slots.modifierValue },
      }];

    // ─── C. 卡牌移动模式 ───

    case PatternId.CARD_SEARCH_DECK:
      return [
        {
          type: 'search_deck',
          filter: slots.filter,
          count: slots.count,
          revealTo: slots.revealToOpponent ? 'opponent' : 'none',
        },
        {
          type: 'move_card',
          destination: slots.destination,
        },
        { type: 'shuffle_deck' },
      ];

    case PatternId.CARD_DRAW:
      return [{
        type: 'draw_card',
        count: slots.count,
        ...(slots.drawUntil ? { until: slots.drawUntil } : {}),
      }];

    case PatternId.CARD_DISCARD_HAND:
      return [
        ...(slots.count !== -1 ? [{
          type: 'player_choice',
          player: slots.chooser,
          choiceType: 'select_from_hand',
          count: slots.count,
          filter: slots.filter || null,
        }] : []),
        {
          type: 'discard_card',
          from: 'hand',
          count: slots.count,
          filter: slots.filter || null,
        },
      ];

    case PatternId.CARD_SHUFFLE_DRAW:
      return [
        {
          type: 'move_card',
          from: 'hand',
          to: 'deck',
          count: slots.shuffleCount,
          filter: slots.shuffleFilter || null,
        },
        { type: 'shuffle_deck' },
        { type: 'draw_card', count: slots.drawCount },
      ];

    case PatternId.CARD_RECOVER:
      return [
        {
          type: 'player_choice',
          choiceType: 'select_from_discard',
          count: slots.count,
          filter: slots.filter || null,
        },
        {
          type: 'move_card',
          to: slots.destination,
        },
      ];

    case PatternId.CARD_PEEK:
      return [
        { type: 'peek_cards', zone: 'deck', count: slots.peekCount },
        ...(slots.takeCount > 0 ? [
          {
            type: 'player_choice',
            choiceType: 'select_from_peeked',
            count: slots.takeCount,
          },
          { type: 'move_card', to: 'hand' },
        ] : []),
      ];

    // ─── D. 状态模式 ───

    case PatternId.STATUS_APPLY: {
      const conditions = Array.isArray(slots.conditions) ? slots.conditions : [slots.conditions];
      return conditions.map((c: string) => ({
        type: 'apply_special_condition',
        target: resolveTarget(slots.target),
        condition: c,
      }));
    }

    case PatternId.STATUS_HEAL:
      return [
        {
          type: 'heal_damage',
          target: resolveTarget(slots.target),
          amount: slots.healAmount,
        },
        ...(slots.removeConditions ? [{
          type: 'remove_special_condition',
          target: resolveTarget(slots.target),
          condition: 'all',
        }] : []),
      ];

    case PatternId.STATUS_DAMAGE_REDUCTION:
      return [{
        type: 'register_modifier',
        target: { player: 'self', zone: 'active' },
        modifier: {
          type: 'damage_reduction',
          value: slots.reduction,
          scope: slots.scope,
        },
        duration: slots.duration,
      }];

    case PatternId.STATUS_IMMUNITY:
      return [{
        type: 'register_modifier',
        target: { player: 'self', zone: 'active' },
        modifier: {
          type: 'immunity',
          immunityType: slots.immunityType,
          sourceFilter: slots.sourceFilter || null,
        },
        duration: slots.duration,
      }];

    // ─── E. 流程控制模式 ───

    case PatternId.FLOW_FORCE_SWITCH:
      return [
        {
          type: 'player_choice',
          player: slots.chooser,
          choiceType: 'select_bench_pokemon',
          target: { player: 'opponent', zone: 'bench' },
        },
        {
          type: 'switch_pokemon',
          player: 'opponent',
        },
      ];

    case PatternId.FLOW_SELF_SWITCH: {
      const actions: AtomicAction[] = [];
      if (!slots.mandatory) {
        actions.push({
          type: 'player_choice',
          choiceType: 'yes_no',
          prompt: '是否将战斗宝可梦切换到备战区？',
        });
      }
      actions.push(
        {
          type: 'player_choice',
          choiceType: 'select_bench_pokemon',
          target: { player: 'self', zone: 'bench' },
        },
        {
          type: 'switch_pokemon',
          player: 'self',
          freeRetreat: true,  // 不消耗撤退能量
        },
      );
      return actions;
    }

    case PatternId.FLOW_EVOLVE:
      return [
        {
          type: 'player_choice',
          choiceType: 'select_pokemon',
          filter: slots.targetFilter || null,
        },
        {
          type: slots.sourceZone === 'hand' ? 'select_from_hand' : 'search_deck',
          filter: {
            ...slots.evolutionFilter,
            evolvesFrom: 'SELECTED',
          },
        },
        { type: 'evolve_pokemon' },
        ...(slots.sourceZone !== 'hand' ? [{ type: 'shuffle_deck' }] : []),
      ];

    case PatternId.FLOW_LOCK:
      return [{
        type: 'register_modifier',
        scope: slots.scope || 'opponent',
        modifier: {
          type: 'action_lock',
          lockTarget: slots.lockTarget,
        },
        duration: slots.duration,
      }];

    case PatternId.FLOW_PRIZE_MANIPULATION:
      return [
        { type: 'peek_cards', zone: 'prizes' },
        {
          type: 'player_choice',
          choiceType: 'select_from_prizes',
          count: slots.count,
        },
        ...(slots.action === 'swap' ? [
          {
            type: 'player_choice',
            choiceType: 'select_from_hand',
            count: 1,
          },
          { type: 'move_card', swap: true },
        ] : []),
      ];

    default:
      console.warn(`未实现的模式映射: ${patternId}`);
      return [{ type: 'no_op', warning: `unimplemented pattern: ${patternId}` }];
  }
}


// ─────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────

function resolveTarget(target: string | any): any {
  if (typeof target === 'object') return target;

  const mapping: Record<string, any> = {
    'opponent.active': { player: 'opponent', zone: 'active' },
    'self.active': { player: 'self', zone: 'active' },
    'self.any_pokemon': { player: 'self', zone: 'all_pokemon' },
    'selected_pokemon': { player: 'self', zone: 'selected' },
    'same_pokemon': { player: 'self', zone: 'same_as_previous' },
    'same_as_energy_target': { player: 'self', zone: 'same_as_previous' },
    'attacking_pokemon': { player: 'opponent', zone: 'active', ref: 'attacker' },
  };

  return mapping[target] || { raw: target };
}

function mapCondition(condition: any): any {
  if (typeof condition === 'string') {
    return { type: condition };
  }
  return condition;
}


// ═══════════════════════════════════════════
// Layer 3: 完整 Pipeline 入口
// ═══════════════════════════════════════════

export interface PipelineResult {
  /** 原始卡牌信息 */
  cardName: string;
  /** LLM 解析的中间表示 */
  parseResult: ParseResult;
  /** 生成的 ActionPacket */
  actionPacket: ActionPacket;
  /** 验证结果（如果有对应测试用例） */
  validation?: {
    passed: boolean;
    diffs: string[];
    criticalFailures: string[];
  };
}

/**
 * 完整的端到端流水线
 *
 * 卡牌文本 → [LLM语义解析] → ParsedEffect → [模式映射] → ActionPacket → [验证]
 */
export async function processCard(
  cardId: string,
  cardName: string,
  effectSource: 'attack' | 'ability' | 'trainer_item' | 'trainer_supporter' | 'trainer_stadium' | 'special_energy',
  cardText: string,
  energyCost?: string,
  sourcePlayer?: string,
): Promise<PipelineResult> {

  // Layer 1: LLM 语义解析
  console.log(`[Pipeline] 解析 ${cardName}...`);
  const parseResult = await parseCardText(cardName, effectSource, cardText, energyCost);
  console.log(`[Pipeline] 解析完成, confidence: ${parseResult.confidence}`);

  if (parseResult.confidence < 0.7) {
    console.warn(`[Pipeline] ⚠️ 低置信度 (${parseResult.confidence}), 需要人工审核`);
    console.warn(`[Pipeline] 歧义: ${parseResult.ambiguities.join('; ')}`);
  }

  // Layer 2: 模式匹配 → ActionPacket
  const context = {
    sourceCardId: cardId,
    sourcePlayer: sourcePlayer || 'player1',
  };

  const actions = effectToActions(parseResult.parsedEffect, context);

  const sourceTypeMapping: Record<string, ActionPacket['source']['sourceType']> = {
    'attack': 'attack',
    'ability': 'ability',
    'trainer_item': 'item',
    'trainer_supporter': 'supporter',
    'trainer_stadium': 'stadium',
    'special_energy': 'item',
  };

  const actionPacket: ActionPacket = {
    executionId: `exec_${cardId}_${Date.now()}`,
    source: {
      sourceCardId: cardId,
      sourceType: sourceTypeMapping[effectSource] || 'item',
      sourcePlayer: sourcePlayer || 'player1',
    },
    trigger: parseResult.trigger !== 'NONE' ? parseResult.trigger : undefined,
    actions,
  };

  console.log(`[Pipeline] 生成 ${actions.length} 个原子动作`);

  // Layer 3: 验证（如果有对应测试用例）
  const testCase = CARD_TEST_SUITE.find(t => t.cardName === cardName && t.effectSource === effectSource);
  let validation;

  if (testCase) {
    validation = assertParseResult(parseResult, testCase);
    console.log(`[Pipeline] 测试 ${testCase.id}: ${validation.passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!validation.passed) {
      validation.criticalFailures.forEach(f => console.error(`  🔴 ${f}`));
    }
  }

  return { cardName, parseResult, actionPacket, validation };
}


/**
 * 批量处理：对测试集中的所有卡牌运行完整 Pipeline
 */
export async function runFullPipeline(): Promise<void> {
  console.log('═══════════════════════════════════════════');
  console.log('  PTCG Card Effect Pipeline — Full Run');
  console.log('═══════════════════════════════════════════\n');

  const results = new Map<string, any>();

  for (const testCase of CARD_TEST_SUITE) {
    try {
      const result = await processCard(
        `test_${testCase.id}`,
        testCase.cardName,
        testCase.effectSource,
        testCase.cardText,
        testCase.energyCost,
      );
      results.set(testCase.id, result.parseResult);
      console.log('');
    } catch (err) {
      console.error(`[Pipeline] ❌ ${testCase.id} ${testCase.cardName} 处理失败:`, err);
      console.log('');
    }
  }

  // 生成汇总报告
  const report = runTestSuite(results);
  console.log('\n' + report.report);
}


// ═══════════════════════════════════════════
// 单卡调试入口（开发用）
// ═══════════════════════════════════════════

/**
 * 快速调试：解析一张卡，打印完整的 ActionPacket
 *
 * 使用示例：
 *   debugSingleCard('喷火龙ex', 'attack',
 *     '造成 180 伤害。对手每取过 1 张奖赏卡，此招式额外造成 30 伤害。',
 *     '[火][火]');
 */
export async function debugSingleCard(
  cardName: string,
  effectSource: 'attack' | 'ability' | 'trainer_item' | 'trainer_supporter' | 'trainer_stadium' | 'special_energy',
  cardText: string,
  energyCost?: string,
): Promise<void> {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  调试: ${cardName}`);
  console.log(`╚══════════════════════════════════════╝\n`);
  console.log(`文本: ${cardText}\n`);

  const result = await processCard('debug_001', cardName, effectSource, cardText, energyCost);

  console.log('\n── LLM 解析结果 ──');
  console.log(JSON.stringify(result.parseResult.parsedEffect, null, 2));

  console.log('\n── 生成的 ActionPacket ──');
  console.log(JSON.stringify(result.actionPacket.actions, null, 2));

  if (result.parseResult.ambiguities.length > 0) {
    console.log('\n── 歧义标注 ──');
    result.parseResult.ambiguities.forEach(a => console.log(`  ⚠️ ${a}`));
  }

  if (result.validation) {
    console.log('\n── 测试验证 ──');
    console.log(result.validation.passed ? '✅ 全部通过' : '❌ 存在失败');
    result.validation.diffs.forEach(d => console.log(`  ${d}`));
  }
}
