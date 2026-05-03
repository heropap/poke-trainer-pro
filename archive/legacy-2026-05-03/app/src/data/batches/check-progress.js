/**
 * 语义提取 — 批次处理器
 *
 * 用法:
 *   1. 在 Claude Code 中读取一个 batch 文件
 *   2. Claude 按照 extractionPrompt 解析每条 item
 *   3. 结果写入 results/ 对应目录
 *
 * 合并脚本: 所有批次处理完后，运行 merge-results.js
 */

const fs = require('fs');
const path = require('path');

const BATCH_DIR = '/Users/walter/new P/new_pokemon/app/src/data/batches';

// 检查进度
function checkProgress() {
  const categories = ['attacks', 'abilities', 'trainers'];
  const progress = {};

  for (const cat of categories) {
    const batchDir = path.join(BATCH_DIR, cat);
    const resultDir = path.join(BATCH_DIR, 'results', cat);

    const batchFiles = fs.readdirSync(batchDir).filter(f => f.endsWith('.json'));
    const resultFiles = fs.existsSync(resultDir)
      ? fs.readdirSync(resultDir).filter(f => f.endsWith('.json'))
      : [];

    progress[cat] = {
      total: batchFiles.length,
      completed: resultFiles.length,
      remaining: batchFiles.length - resultFiles.length,
      percent: Math.round((resultFiles.length / batchFiles.length) * 100),
    };
  }

  return progress;
}

const progress = checkProgress();
console.log("\n=== 语义提取进度 ===\n");
for (const [cat, p] of Object.entries(progress)) {
  const bar = '█'.repeat(Math.floor(p.percent / 5)) + '░'.repeat(20 - Math.floor(p.percent / 5));
  console.log(`${cat.padEnd(12)} [${bar}] ${p.percent}%  (${p.completed}/${p.total}, 剩余 ${p.remaining})`);
}

const totalDone = Object.values(progress).reduce((s, p) => s + p.completed, 0);
const totalAll = Object.values(progress).reduce((s, p) => s + p.total, 0);
console.log(`\n总计: ${totalDone}/${totalAll} (${Math.round(totalDone/totalAll*100)}%)`);

// 找到下一个待处理的批次
function nextBatch() {
  for (const cat of categories) {
    const batchDir = path.join(BATCH_DIR, cat);
    const resultDir = path.join(BATCH_DIR, 'results', cat);
    const batchFiles = fs.readdirSync(batchDir).filter(f => f.endsWith('.json')).sort();

    for (const f of batchFiles) {
      const resultFile = path.join(resultDir, f.replace('batch-', 'result-'));
      if (!fs.existsSync(resultFile)) {
        return { category: cat, file: f, path: path.join(batchDir, f) };
      }
    }
  }
  return null;
}

const next = nextBatch();
if (next) {
  console.log(`\n下一个待处理: ${next.category}/${next.file}`);
  console.log(`文件路径: ${next.path}`);
} else {
  console.log("\n✅ 所有批次已处理完毕！运行 merge-results.js 合并结果。");
}
