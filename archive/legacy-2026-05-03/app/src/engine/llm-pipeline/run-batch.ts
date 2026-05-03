#!/usr/bin/env tsx
/**
 * 阶段二：MVP 卡组批量 Pipeline 运行器
 *
 * 从 5 套预置卡组提取所有唯一卡牌（Pokémon + Trainer），
 * 逐张通过 LLM Pipeline 解析，输出通过率报告。
 *
 * 使用方式：
 *   npx tsx app/src/engine/llm-pipeline/run-batch.ts
 *   npx tsx app/src/engine/llm-pipeline/run-batch.ts --dry-run    (不调用 LLM，只列出卡牌)
 *   npx tsx app/src/engine/llm-pipeline/run-batch.ts --deck "Charizard ex"
 */

import * as fs from 'fs';
import * as path from 'path';
import { PREBUILT_DECKS } from '../../data/prebuilt-decks';
import { parseDeckList, resolveSetCode } from '../../lib/deck-parser';
import { processCard } from './pipeline';
import type { Card, CardAttack, CardAbility } from '../../types/card';

// ─────────────────────────────────────────────
// Step 1: 从预置卡组提取唯一卡牌
// ─────────────────────────────────────────────

interface DeckCardEntry {
  /** 在我们数据中的 card ID (e.g. "sv3-125") */
  cardId: string;
  /** 卡牌名（英文） */
  name: string;
  /** PTCG Live 代码 (e.g. "OBF 125") */
  liveCode: string;
  /** 来源卡组 */
  fromDeck: string;
  /** pokemon / trainer / energy */
  category: string;
}

function extractUniqueCards(): DeckCardEntry[] {
  const seen = new Set<string>();
  const cards: DeckCardEntry[] = [];

  for (const deck of PREBUILT_DECKS) {
    const parsed = parseDeckList(deck.deckText);

    for (const entry of parsed.entries) {
      // 跳过基础能量（没有效果文本）
      if (entry.category === 'energy' && entry.name.includes('Basic')) continue;

      const setId = resolveSetCode(entry.setCode);
      if (!setId) continue;

      const cardId = `${setId}-${entry.number}`;
      if (seen.has(cardId)) continue;
      seen.add(cardId);

      cards.push({
        cardId,
        name: entry.name,
        liveCode: `${entry.setCode} ${entry.number}`,
        fromDeck: deck.name,
        category: entry.category,
      });
    }
  }

  return cards;
}

// ─────────────────────────────────────────────
// Step 2: 从本地 JSON 数据加载卡牌详情
// ─────────────────────────────────────────────

function loadCardData(cardId: string): Card | null {
  const parts = cardId.split('-');
  const setId = parts.slice(0, -1).join('-'); // handle "swsh12pt5-xx"
  const dataDir = path.resolve(__dirname, '../../data/cards');
  const filePath = path.join(dataDir, `${setId}.json`);

  if (!fs.existsSync(filePath)) return null;

  const data: Card[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return data.find(c => c.id === cardId) || null;
}

// ─────────────────────────────────────────────
// Step 3: 将卡牌拆为可 pipeline 的效果条目
// ─────────────────────────────────────────────

interface EffectEntry {
  cardId: string;
  cardName: string;
  effectName: string;
  effectSource: 'attack' | 'ability' | 'trainer_item' | 'trainer_supporter' | 'trainer_stadium' | 'special_energy';
  cardText: string;
  energyCost?: string;
  damage?: string;
  fromDeck: string;
}

function cardToEffectEntries(deckEntry: DeckCardEntry, card: Card): EffectEntry[] {
  const entries: EffectEntry[] = [];

  // Pokémon — 提取所有 attacks 和 abilities
  if (card.supertype === 'Pokémon') {
    if (card.attacks) {
      for (const atk of card.attacks) {
        // 跳过无文本的纯伤害招式（如 "Tackle - 20"）
        const hasEffect = atk.text && atk.text.trim().length > 0;
        const hasDamage = atk.damage && atk.damage.trim().length > 0;

        if (!hasEffect && hasDamage) {
          // 纯伤害招式，直接 DMG_FLAT，无需 LLM
          continue;
        }
        if (!hasEffect && !hasDamage) {
          // 无文本无伤害，跳过
          continue;
        }

        const energyCost = atk.cost?.map(c => `[${c}]`).join('') || '';

        entries.push({
          cardId: card.id,
          cardName: `${card.name} [${atk.name}]`,
          effectName: atk.name,
          effectSource: 'attack',
          cardText: atk.text,
          energyCost,
          damage: hasDamage ? atk.damage : undefined,
          fromDeck: deckEntry.fromDeck,
        });
      }
    }

    if (card.abilities) {
      for (const ab of card.abilities) {
        if (!ab.text || ab.text.trim().length === 0) continue;
        entries.push({
          cardId: card.id,
          cardName: `${card.name} [${ab.name}]`,
          effectName: ab.name,
          effectSource: 'ability',
          cardText: ab.text,
          fromDeck: deckEntry.fromDeck,
        });
      }
    }
  }

  // Trainer — 用 rules 或 abilities
  if (card.supertype === 'Trainer') {
    const subtypes = card.subtypes || [];
    let source: EffectEntry['effectSource'] = 'trainer_item';
    if (subtypes.includes('Supporter')) source = 'trainer_supporter';
    else if (subtypes.includes('Stadium')) source = 'trainer_stadium';

    // Trainer 卡的效果通常在 rules[0] 里
    const text = card.rules?.[0] || card.abilities?.[0]?.text || '';
    if (text.trim().length > 0) {
      entries.push({
        cardId: card.id,
        cardName: card.name,
        effectName: card.name,
        effectSource: source,
        cardText: text,
        fromDeck: deckEntry.fromDeck,
      });
    }
  }

  // Special Energy
  if (card.supertype === 'Energy' && card.subtypes?.includes('Special')) {
    const text = card.rules?.[0] || '';
    if (text.trim().length > 0) {
      entries.push({
        cardId: card.id,
        cardName: card.name,
        effectName: card.name,
        effectSource: 'special_energy',
        cardText: text,
        fromDeck: deckEntry.fromDeck,
      });
    }
  }

  return entries;
}

// ─────────────────────────────────────────────
// Step 4: 批量运行 + 报告
// ─────────────────────────────────────────────

interface BatchResult {
  entry: EffectEntry;
  status: 'pass' | 'fail' | 'error' | 'no_test';
  error?: string;
  patternIds?: string[];
  confidence?: number;
  parsedEffect?: any;
  actionPacket?: any;
}

async function runBatch(entries: EffectEntry[], dryRun: boolean): Promise<BatchResult[]> {
  const results: BatchResult[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    console.log(`\n[${i + 1}/${entries.length}] ${entry.cardName}`);
    console.log(`  来源: ${entry.fromDeck} | ${entry.effectSource}`);
    console.log(`  文本: ${entry.cardText.slice(0, 80)}${entry.cardText.length > 80 ? '...' : ''}`);

    if (dryRun) {
      results.push({ entry, status: 'no_test' });
      continue;
    }

    try {
      const result = await processCard(
        entry.cardId,
        entry.cardName,
        entry.effectSource,
        entry.cardText,
        entry.energyCost,
        undefined, // sourcePlayer
        entry.damage,
      );

      // 收集 patternIds
      const patternIds = extractPatternIds(result.parseResult.parsedEffect);

      if (result.validation) {
        results.push({
          entry,
          status: result.validation.passed ? 'pass' : 'fail',
          patternIds,
          confidence: result.parseResult.confidence,
          parsedEffect: result.parseResult.parsedEffect,
          actionPacket: result.actionPacket,
        });
      } else {
        // 没有对应的测试用例，只能看 LLM 是否成功解析
        const passed = result.parseResult.confidence >= 0.7;
        results.push({
          entry,
          status: passed ? 'pass' : 'fail',
          patternIds,
          confidence: result.parseResult.confidence,
          error: !passed ? `低置信度: ${result.parseResult.confidence}` : undefined,
          parsedEffect: passed ? result.parseResult.parsedEffect : undefined,
          actionPacket: passed ? result.actionPacket : undefined,
        });
      }
    } catch (err: any) {
      console.error(`  ❌ 处理失败: ${err.message?.slice(0, 100)}`);
      results.push({
        entry,
        status: 'error',
        error: err.message?.slice(0, 200),
      });
    }

    // 简单的速率限制：每次调用间隔 1 秒（避免 CLI 模式过载）
    if (!dryRun && i < entries.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return results;
}

function extractPatternIds(effect: any): string[] {
  if (!effect) return [];
  if (effect.type === 'pattern') return [effect.patternId];
  if (effect.type === 'sequence') {
    return (effect.steps || []).flatMap((s: any) => extractPatternIds(s));
  }
  if (effect.type === 'conditional') {
    return [
      ...extractPatternIds(effect.ifTrue),
      ...extractPatternIds(effect.ifFalse),
    ];
  }
  if (effect.type === 'optional') {
    return extractPatternIds(effect.optionalEffect);
  }
  return [];
}

function generateReport(results: BatchResult[]): string {
  const total = results.length;
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errors = results.filter(r => r.status === 'error').length;
  const noTest = results.filter(r => r.status === 'no_test').length;

  const passRate = total > 0 ? ((passed / (total - noTest)) * 100).toFixed(1) : '0';

  let report = `\n${'═'.repeat(60)}\n`;
  report += `  MVP 卡组 Pipeline 批量运行报告\n`;
  report += `${'═'.repeat(60)}\n\n`;
  report += `总计: ${total} 个效果\n`;
  report += `✅ 通过: ${passed}  ❌ 失败: ${failed}  💥 错误: ${errors}  ⏭ 跳过: ${noTest}\n`;
  report += `通过率: ${passRate}%\n\n`;

  // 按卡组分组统计
  const deckStats = new Map<string, { total: number; pass: number; fail: number; error: number }>();
  for (const r of results) {
    const deck = r.entry.fromDeck;
    if (!deckStats.has(deck)) deckStats.set(deck, { total: 0, pass: 0, fail: 0, error: 0 });
    const s = deckStats.get(deck)!;
    s.total++;
    if (r.status === 'pass') s.pass++;
    if (r.status === 'fail') s.fail++;
    if (r.status === 'error') s.error++;
  }

  report += `── 按卡组统计 ──\n`;
  for (const [deck, s] of deckStats) {
    const rate = s.total > 0 ? ((s.pass / s.total) * 100).toFixed(0) : '0';
    report += `  ${deck}: ${s.pass}/${s.total} (${rate}%)\n`;
  }

  // 失败详情
  const failures = results.filter(r => r.status === 'fail' || r.status === 'error');
  if (failures.length > 0) {
    report += `\n── 失败详情 ──\n`;
    for (const r of failures) {
      report += `  ${r.status === 'error' ? '💥' : '❌'} ${r.entry.cardName}\n`;
      report += `     来源: ${r.entry.fromDeck} | ${r.entry.effectSource}\n`;
      report += `     文本: ${r.entry.cardText.slice(0, 60)}...\n`;
      if (r.error) report += `     原因: ${r.error}\n`;
      if (r.patternIds?.length) report += `     识别: ${r.patternIds.join(' + ')}\n`;
      report += `\n`;
    }
  }

  // 模式分布统计
  const patternCounts = new Map<string, number>();
  for (const r of results) {
    if (r.patternIds) {
      for (const pid of r.patternIds) {
        patternCounts.set(pid, (patternCounts.get(pid) || 0) + 1);
      }
    }
  }

  if (patternCounts.size > 0) {
    report += `── 模式分布 ──\n`;
    const sorted = [...patternCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [pid, count] of sorted) {
      report += `  ${pid}: ${count}次\n`;
    }
  }

  return report;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const deckFilter = args.indexOf('--deck') !== -1 ? args[args.indexOf('--deck') + 1] : null;

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  阶段二：MVP 卡组批量 Pipeline 运行          ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  if (dryRun) console.log('🔍 DRY RUN 模式（不调用 LLM，只列出卡牌）\n');

  // Step 1: 提取唯一卡牌
  const deckCards = extractUniqueCards();
  console.log(`📦 从 ${PREBUILT_DECKS.length} 套卡组提取了 ${deckCards.length} 张唯一卡牌\n`);

  // Step 2: 加载卡牌数据，拆为效果条目
  const allEffects: EffectEntry[] = [];
  const missingCards: DeckCardEntry[] = [];

  for (const dc of deckCards) {
    if (deckFilter && dc.fromDeck !== deckFilter) continue;

    const card = loadCardData(dc.cardId);
    if (!card) {
      missingCards.push(dc);
      continue;
    }

    const effects = cardToEffectEntries(dc, card);
    allEffects.push(...effects);
  }

  if (missingCards.length > 0) {
    console.log(`⚠️ ${missingCards.length} 张卡牌在本地数据中未找到:`);
    for (const mc of missingCards) {
      console.log(`   ${mc.name} (${mc.liveCode}) → ${mc.cardId}`);
    }
    console.log('');
  }

  console.log(`🎯 共 ${allEffects.length} 个需要解析的效果条目\n`);

  // --resume: 跳过已在缓存中的卡牌
  const resume = args.includes('--resume');
  let existingCache: any[] = [];
  if (resume) {
    const cachePath = path.resolve(__dirname, 'compiled-effects-cache.json');
    if (fs.existsSync(cachePath)) {
      existingCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const cachedNames = new Set(existingCache.map((c: any) => c.cardName));
      const before = allEffects.length;
      const toRun = allEffects.filter(e => !cachedNames.has(e.cardName));
      const skipped = before - toRun.length;
      console.log(`🔄 RESUME 模式: 跳过 ${skipped} 已缓存, 剩余 ${toRun.length} 待处理\n`);
      allEffects.length = 0;
      allEffects.push(...toRun);
    }
  }

  // 按效果来源统计
  const bySource = new Map<string, number>();
  for (const e of allEffects) {
    bySource.set(e.effectSource, (bySource.get(e.effectSource) || 0) + 1);
  }
  for (const [src, cnt] of bySource) {
    console.log(`   ${src}: ${cnt}`);
  }
  console.log('');

  // Step 3: 批量运行
  const results = await runBatch(allEffects, dryRun);

  // Step 4: 报告
  const report = generateReport(results);
  console.log(report);

  // 保存结果到文件
  const outputPath = path.resolve(__dirname, 'batch-results.json');
  const outputData = results.map(r => ({
    cardId: r.entry.cardId,
    cardName: r.entry.cardName,
    effectSource: r.entry.effectSource,
    fromDeck: r.entry.fromDeck,
    status: r.status,
    patternIds: r.patternIds,
    confidence: r.confidence,
    error: r.error,
  }));
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`\n📄 结果已保存到: ${outputPath}`);

  // --save-cache: 保存完整 parsedEffect + actionPacket 供引擎启动时加载
  if (args.includes('--save-cache')) {
    const cachePath = path.resolve(__dirname, 'compiled-effects-cache.json');
    const newCacheData = results
      .filter(r => r.status === 'pass' && r.parsedEffect && r.actionPacket)
      .map(r => ({
        cardId: r.entry.cardId,
        cardName: r.entry.cardName,
        effectName: r.entry.effectName,
        effectSource: r.entry.effectSource,
        parsedEffect: r.parsedEffect,
        actionPacket: r.actionPacket,
      }));

    // Merge with existing cache on resume
    let mergedCache = newCacheData;
    if (resume && existingCache.length > 0) {
      const newNames = new Set(newCacheData.map(c => c.cardName));
      const kept = existingCache.filter((c: any) => !newNames.has(c.cardName));
      mergedCache = [...kept, ...newCacheData];
      console.log(`\n🔗 合并缓存: ${existingCache.length} 旧 + ${newCacheData.length} 新 = ${mergedCache.length} 总计`);
    }

    fs.writeFileSync(cachePath, JSON.stringify(mergedCache, null, 2));
    console.log(`💾 编译缓存已保存到: ${cachePath} (${mergedCache.length} 条)`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
