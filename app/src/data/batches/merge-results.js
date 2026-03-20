/**
 * 合并所有批次结果为统一的 extracted-v2-rules.json
 */

const fs = require('fs');
const path = require('path');

const BATCH_DIR = '/Users/walter/new P/new_pokemon/app/src/data/batches';
const RESULTS_DIR = path.join(BATCH_DIR, 'results');
const OUTPUT_FILE = path.join('/Users/walter/new P/new_pokemon/app/src/data', 'extracted-v2-rules.json');

const categories = ['attacks', 'abilities', 'trainers'];
const merged = { attacks: [], abilities: [], trainers: [], stats: {} };

for (const cat of categories) {
  const resultDir = path.join(RESULTS_DIR, cat);
  if (!fs.existsSync(resultDir)) continue;

  const files = fs.readdirSync(resultDir).filter(f => f.endsWith('.json')).sort();

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(resultDir, f), 'utf-8'));
    if (Array.isArray(data.results)) {
      merged[cat].push(...data.results);
    } else if (Array.isArray(data)) {
      merged[cat].push(...data);
    }
  }

  console.log(`${cat}: ${merged[cat].length} 条规则已合并`);
}

// 统计 ActionType 使用频率
const actionUsage = {};
const newActionsNeeded = [];

for (const cat of categories) {
  for (const rule of merged[cat]) {
    const steps = rule?.analysis?.steps || [];
    for (const step of steps) {
      const action = step.action || step.actionType;
      if (action) {
        actionUsage[action] = (actionUsage[action] || 0) + 1;
      }
    }
    if (rule?.analysis?.newActionNeeded) {
      newActionsNeeded.push({
        category: cat,
        pattern: rule.pattern,
        needed: rule.analysis.newActionNeeded,
      });
    }
  }
}

merged.stats = {
  totalRules: merged.attacks.length + merged.abilities.length + merged.trainers.length,
  actionUsage: Object.fromEntries(
    Object.entries(actionUsage).sort((a, b) => b[1] - a[1])
  ),
  newActionsNeeded,
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2));
console.log(`\n已合并到: ${OUTPUT_FILE}`);
console.log(`总规则数: ${merged.stats.totalRules}`);
console.log(`ActionType 使用分布: ${Object.keys(actionUsage).length} 种`);

if (newActionsNeeded.length > 0) {
  console.log(`\n⚠️ 需要新增 ActionType: ${newActionsNeeded.length} 处`);
  for (const item of newActionsNeeded.slice(0, 10)) {
    console.log(`  - [${item.category}] ${item.needed}`);
  }
}
