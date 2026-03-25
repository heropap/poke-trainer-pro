#!/usr/bin/env tsx
/**
 * 冒烟测试 CLI — 3 张必杀测试卡
 *
 * 使用方式：
 *   ANTHROPIC_API_KEY=sk-xxx npx tsx app/src/engine/llm-pipeline/run-smoke.ts
 *
 * 或者单独测试某张卡：
 *   npx tsx app/src/engine/llm-pipeline/run-smoke.ts --card dragapult
 *   npx tsx app/src/engine/llm-pipeline/run-smoke.ts --card gardevoir
 *   npx tsx app/src/engine/llm-pipeline/run-smoke.ts --card raging-bolt
 *   npx tsx app/src/engine/llm-pipeline/run-smoke.ts --all   (跑全部 18 张测试卡)
 */

import { debugSingleCard, runFullPipeline } from './pipeline';

// ─────────────────────────────────────────────
// 3 张必杀测试卡定义
// ─────────────────────────────────────────────

const SMOKE_CARDS = {
  dragapult: {
    name: '多龙巴鲁托ex',
    source: 'attack' as const,
    text: '造成 200 伤害。在对手的备战区宝可梦身上任意放置 5 个伤害指示物。',
    energy: '[超][超]',
    验证点: '200 伤害走 DMG_FLAT(攻击管线) + 5 指示物走 DMG_DISTRIBUTE(绕过弱点/抗性)',
  },
  gardevoir: {
    name: '沙奈朵',
    source: 'ability' as const,
    text: '在你的回合中，可以使用任意次数。从你的弃牌区选择 1 张基础超能力能量卡，贴到你的 1 只超能力宝可梦身上。然后在那只宝可梦身上放置 2 个伤害指示物。',
    energy: undefined,
    验证点: '可重复特性(REPEATABLE) + NRG_ACCELERATE(discard→psychic) + DMG_PLACE_COUNTERS(2, same target)',
  },
  'raging-bolt': {
    name: '猛雷鼓ex',
    source: 'attack' as const,
    text: '你可以丢弃此宝可梦身上任意数量的基础雷能量。每丢弃 1 张，此招式额外造成 70 伤害。',
    energy: '[雷][雷]',
    验证点: 'optional NRG_DISCARD_TARGET(任意数量) → DMG_DYNAMIC_MULTIPLIER(丢弃数×70)',
  },
};

// ─────────────────────────────────────────────
// CLI 入口
// ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ 缺少 ANTHROPIC_API_KEY 环境变量');
    console.error('   用法: ANTHROPIC_API_KEY=sk-xxx npx tsx app/src/engine/llm-pipeline/run-smoke.ts');
    process.exit(1);
  }

  // --all: 跑全部 18 张测试卡
  if (args.includes('--all')) {
    console.log('🚀 运行完整测试集（18 张卡）...\n');
    await runFullPipeline();
    return;
  }

  // --card <name>: 跑指定的卡
  const cardIdx = args.indexOf('--card');
  if (cardIdx !== -1 && args[cardIdx + 1]) {
    const cardKey = args[cardIdx + 1] as keyof typeof SMOKE_CARDS;
    const card = SMOKE_CARDS[cardKey];
    if (!card) {
      console.error(`❌ 未知的卡牌: ${cardKey}`);
      console.error(`   可选: ${Object.keys(SMOKE_CARDS).join(', ')}`);
      process.exit(1);
    }
    console.log(`🎯 验证点: ${card.验证点}\n`);
    await debugSingleCard(card.name, card.source, card.text, card.energy);
    return;
  }

  // 默认：跑 3 张必杀卡
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  PTCG LLM Pipeline — 冒烟测试 (3 张必杀卡)  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  for (const [key, card] of Object.entries(SMOKE_CARDS)) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🎯 [${key}] 验证点: ${card.验证点}`);
    console.log(`${'─'.repeat(50)}`);
    try {
      await debugSingleCard(card.name, card.source, card.text, card.energy);
    } catch (err) {
      console.error(`❌ ${card.name} 处理失败:`, err);
    }
    console.log('');
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  冒烟测试完成。请将上方输出贴给人工审核。');
  console.log('═══════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
