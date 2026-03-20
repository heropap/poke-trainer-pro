/**
 * 语义提取管线 — 批次准备脚本
 *
 * 读取 unique-texts.json，按类别分批导出：
 *   batches/attacks/batch-001.json  (每批 50 个模式族)
 *   batches/abilities/batch-001.json
 *   batches/trainers/batch-001.json
 *
 * 每个批次文件包含:
 *   - 模式族列表 (text + pattern + count + sampleCardIds)
 *   - 提取指令模板
 */

const fs = require('fs');
const path = require('path');

const ANALYSIS_DIR = __dirname;
const DATA_DIR = path.join(ANALYSIS_DIR, '..');
const BATCH_DIR = path.join(DATA_DIR, 'batches');
const BATCH_SIZE = 50;

// 读取数据
const uniqueTexts = JSON.parse(fs.readFileSync(path.join(ANALYSIS_DIR, 'unique-texts.json'), 'utf-8'));

// 创建目录
['attacks', 'abilities', 'trainers'].forEach(cat => {
  const dir = path.join(BATCH_DIR, cat);
  fs.mkdirSync(dir, { recursive: true });
});

// 也创建 results 目录
['attacks', 'abilities', 'trainers'].forEach(cat => {
  const dir = path.join(BATCH_DIR, 'results', cat);
  fs.mkdirSync(dir, { recursive: true });
});

// ═══════════════════════════════════════════════════
// 按模式族去重 — 同一个 pattern 只保留一条
// ═══════════════════════════════════════════════════

function deduplicateByPattern(items) {
  const patternMap = new Map();

  for (const item of items) {
    const key = item.pattern || item.text;
    if (!patternMap.has(key)) {
      patternMap.set(key, {
        pattern: key,
        representativeText: item.text,
        totalCount: item.count,
        sampleCardIds: item.cardIds.slice(0, 5), // 只保留前 5 个样例
        variants: [item.text],
      });
    } else {
      const existing = patternMap.get(key);
      existing.totalCount += item.count;
      if (!existing.variants.includes(item.text)) {
        existing.variants.push(item.text);
      }
      // 合并 cardIds（最多 5 个）
      for (const id of item.cardIds) {
        if (existing.sampleCardIds.length < 5 && !existing.sampleCardIds.includes(id)) {
          existing.sampleCardIds.push(id);
        }
      }
    }
  }

  return Array.from(patternMap.values());
}

// ═══════════════════════════════════════════════════
// 分批
// ═══════════════════════════════════════════════════

function createBatches(items, category) {
  const batches = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batchItems = items.slice(i, i + BATCH_SIZE);
    const batchNum = String(Math.floor(i / BATCH_SIZE) + 1).padStart(3, '0');
    batches.push({
      batchId: `${category}-${batchNum}`,
      category,
      totalInCategory: items.length,
      batchIndex: Math.floor(i / BATCH_SIZE),
      batchTotal: Math.ceil(items.length / BATCH_SIZE),
      itemCount: batchItems.length,
      items: batchItems.map((item, idx) => ({
        index: i + idx,
        ...item,
      })),
    });
  }
  return batches;
}

// ═══════════════════════════════════════════════════
// V2 ActionType 参考表 (提取时用)
// ═══════════════════════════════════════════════════

const V2_ACTION_TYPES = [
  // 卡牌位移
  "draw_cards", "search_deck", "shuffle_deck", "put_on_deck_top", "put_on_deck_bottom",
  "shuffle_into_deck", "discard_cards", "recover_from_discard", "move_to_lost_zone",
  "return_to_hand", "put_in_play", "move_card",
  // 信息
  "reveal_cards", "look_at_cards", "show_hand",
  // 伤害与治疗
  "deal_damage", "place_damage_counters", "heal", "move_damage_counters",
  "spread_damage", "full_heal", "damage_self",
  // 状态
  "apply_status", "remove_status", "remove_all_status",
  // 能量
  "attach_energy", "accelerate_energy", "discard_energy", "move_energy", "energy_type_change",
  // 宝可梦控制
  "switch_pokemon", "evolve", "devolve", "copy_attack", "use_attack",
  // 标记
  "set_marker", "remove_marker", "clear_all_markers", "check_marker",
  // 场地
  "discard_stadium",
  // 随机
  "flip_coin", "flip_coins",
  // 玩家交互
  "choose_cards", "choose_pokemon", "choose_option", "choose_type", "order_cards", "confirm",
  // 流程控制
  "if", "for_each", "repeat", "repeat_until", "extra_turn", "end_turn",
  // 规则覆写
  "prevent_damage", "reduce_damage", "add_damage", "prevent_retreat", "prevent_evolution",
  "prevent_item_usage", "prevent_supporter_usage", "prevent_ability", "prevent_attack",
  "prevent_status", "prevent_energy_removal", "ignore_weakness", "ignore_resistance", "ignore_effects",
  // 日志
  "log"
];

const V2_ZONES = [
  "active", "bench", "hand", "deck", "deck_top", "deck_bottom",
  "discard", "prizes", "lost_zone", "attached_energy", "attached_tool",
  "evolution_stack", "stadium", "in_play", "any"
];

const V2_CONDITIONS = [
  "coin_flip", "coin_flip_count", "zone_has_cards", "zone_is_empty",
  "bench_not_full", "bench_has_pokemon", "is_in_zone", "is_active",
  "is_on_bench", "has_damage", "has_no_damage", "has_status", "has_no_status",
  "has_energy", "has_type", "hp_remaining", "is_first_turn",
  "usage_limit", "has_tag", "has_marker", "has_rule_box",
  "card_name", "card_super_type", "card_sub_type",
  "not", "and", "or"
];

// ═══════════════════════════════════════════════════
// 提取指令模板
// ═══════════════════════════════════════════════════

const EXTRACTION_PROMPT_ATTACKS = `你是 PTCG (宝可梦集换式卡牌游戏) 规则专家。请将以下攻击效果文本解析为标准化的 V2 ActionStep 序列。

## 输出格式 (每条效果)

\`\`\`json
{
  "index": <原始序号>,
  "pattern": "<模式族文本>",
  "analysis": {
    "preconditions": [<Condition 对象数组, 如果有前置条件>],
    "costs": [<Cost 对象数组, 如果攻击有额外代价(如弃能量)>],
    "steps": [<ActionStep 对象数组, 按执行顺序>],
    "modifiers": [<Modifier 对象数组, 如果有持续效果>],
    "dynamicDamage": <DynamicValue 对象, 如果伤害是动态计算的>,
    "flags": {
      "hasBranching": <boolean>,     // 是否有条件分支
      "hasPlayerChoice": <boolean>,  // 是否需要玩家选择
      "hasRNG": <boolean>,           // 是否涉及掷硬币
      "isSelfReferencing": <boolean>, // 是否引用自身状态
      "affectsOpponent": <boolean>,  // 是否影响对手
      "affectsBench": <boolean>,     // 是否影响备战区
      "hasDelayedEffect": <boolean>  // 是否有延迟效果(下回合)
    },
    "newActionNeeded": "<如果现有 ActionType 无法表达, 描述需要什么新动作>"
  }
}
\`\`\`

## 可用的 ActionType
${JSON.stringify(V2_ACTION_TYPES, null, 2)}

## 可用的 ZoneType
${JSON.stringify(V2_ZONES)}

## 可用的 Condition type
${JSON.stringify(V2_CONDITIONS)}

## 规则
1. 每个 step 必须使用上述 ActionType 枚举值
2. target 必须指定 owner ("self"/"opponent") 和 zone
3. 如果现有 ActionType 无法精确表达某个语义, 在 newActionNeeded 字段说明
4. 数字参数用实际数值; 如果是模式族(数字被 N 替换), 用 0 作占位符
5. "During your next turn, this Pokémon can't attack" = set_marker("cant_attack", expiry: end_of_next_turn)
6. 注意区分 deal_damage (走弱点/抵抗管线) 和 place_damage_counters (直接放标记)
7. "Flip a coin. If heads..." = flip_coin + if branch
8. 掷硬币造成的伤害用 DynamicValue { calc: "coin_flip", ... }`;

const EXTRACTION_PROMPT_ABILITIES = `你是 PTCG 规则专家。请将以下宝可梦特性(Ability)文本解析为标准化的 V2 规则。

## 输出格式

\`\`\`json
{
  "index": <原始序号>,
  "pattern": "<模式族文本>",
  "analysis": {
    "abilitySubType": "activated" | "passive" | "triggered" | "on_enter",
    "triggers": [<TriggerType 数组>],
    "conditions": [<Condition 对象数组>],
    "steps": [<ActionStep 对象数组>],
    "modifiers": [<Modifier 对象数组, passive 特性的核心>],
    "flags": { ... },
    "newActionNeeded": "<如果需要新 ActionType>"
  }
}
\`\`\`

## 特性子类型判定规则
- activated: 文本含 "Once during your turn" / "you may" + 主动动作
- passive: 文本描述持续状态修改 (增减伤害/HP/费用, 免疫等)
- triggered: 文本含 "When/Whenever/If ... you may/do" + 事件触发
- on_enter: 文本含 "When you play this Pokémon" / "when this Pokémon enters play"

## 可用的 ActionType
${JSON.stringify(V2_ACTION_TYPES, null, 2)}

## 可用的 TriggerType
["on_game_start", "on_turn_start", "on_draw", "on_play", "on_enter_play",
 "on_activate", "on_evolve", "on_energy_attach", "on_retreat", "on_tool_attach",
 "on_attack_declare", "on_damage_calc", "on_damage_modify", "on_damage_apply",
 "on_attack_effect", "on_attack_end", "on_damage_received", "on_knockout",
 "on_knockout_opponent", "on_prize_take", "on_promote", "between_turns",
 "on_turn_end", "on_discard", "on_leave_play", "on_hand_enter",
 "while_in_play", "while_attached", "while_in_stadium"]`;

const EXTRACTION_PROMPT_TRAINERS = `你是 PTCG 规则专家。请将以下训练家卡(Trainer)效果文本解析为标准化的 V2 规则。

## 输出格式

\`\`\`json
{
  "index": <原始序号>,
  "pattern": "<模式族文本>",
  "trainerSubType": "Item" | "Supporter" | "Stadium" | "Tool" | "TechnicalMachine",
  "analysis": {
    "triggers": [<TriggerType 数组>],
    "conditions": [<Condition 对象数组>],
    "steps": [<ActionStep 对象数组>],
    "modifiers": [<Modifier 对象数组, Stadium/Tool 的持续效果>],
    "flags": { ... },
    "newActionNeeded": "<如果需要新 ActionType>"
  }
}
\`\`\`

## 注意
- Item/Supporter: triggers = ["on_play"], 执行后进弃牌区
- Stadium: triggers = ["while_in_stadium"], 全局持续效果
- Tool: triggers = ["while_attached"], 附着持续效果
- 如果文本含多段效果(如场地: 双方各有不同效果), 分别列出

## 可用的 ActionType
${JSON.stringify(V2_ACTION_TYPES, null, 2)}`;

// ═══════════════════════════════════════════════════
// 执行
// ═══════════════════════════════════════════════════

console.log("=== 准备批次文件 ===\n");

// 攻击
const attackPatterns = deduplicateByPattern(uniqueTexts.attacks);
const attackBatches = createBatches(attackPatterns, 'attacks');
console.log(`攻击: ${attackPatterns.length} 个模式族 → ${attackBatches.length} 批`);

for (const batch of attackBatches) {
  batch.extractionPrompt = EXTRACTION_PROMPT_ATTACKS;
  const filePath = path.join(BATCH_DIR, 'attacks', `batch-${String(batch.batchIndex + 1).padStart(3, '0')}.json`);
  fs.writeFileSync(filePath, JSON.stringify(batch, null, 2));
}

// 特性
const abilityPatterns = deduplicateByPattern(uniqueTexts.abilities);
const abilityBatches = createBatches(abilityPatterns, 'abilities');
console.log(`特性: ${abilityPatterns.length} 个模式族 → ${abilityBatches.length} 批`);

for (const batch of abilityBatches) {
  batch.extractionPrompt = EXTRACTION_PROMPT_ABILITIES;
  const filePath = path.join(BATCH_DIR, 'abilities', `batch-${String(batch.batchIndex + 1).padStart(3, '0')}.json`);
  fs.writeFileSync(filePath, JSON.stringify(batch, null, 2));
}

// 训练家
const trainerPatterns = deduplicateByPattern(uniqueTexts.trainers);
const trainerBatches = createBatches(trainerPatterns, 'trainers');
console.log(`训练家: ${trainerPatterns.length} 个模式族 → ${trainerBatches.length} 批`);

for (const batch of trainerBatches) {
  batch.extractionPrompt = EXTRACTION_PROMPT_TRAINERS;
  const filePath = path.join(BATCH_DIR, 'trainers', `batch-${String(batch.batchIndex + 1).padStart(3, '0')}.json`);
  fs.writeFileSync(filePath, JSON.stringify(batch, null, 2));
}

// 总结
const summary = {
  generated: new Date().toISOString(),
  batchSize: BATCH_SIZE,
  categories: {
    attacks: { patternFamilies: attackPatterns.length, batches: attackBatches.length },
    abilities: { patternFamilies: abilityPatterns.length, batches: abilityBatches.length },
    trainers: { patternFamilies: trainerPatterns.length, batches: trainerBatches.length },
  },
  totalPatternFamilies: attackPatterns.length + abilityPatterns.length + trainerPatterns.length,
  totalBatches: attackBatches.length + abilityBatches.length + trainerBatches.length,
  resultDirectory: path.join(BATCH_DIR, 'results'),
};

fs.writeFileSync(path.join(BATCH_DIR, 'batch-summary.json'), JSON.stringify(summary, null, 2));

console.log(`\n=== 总计 ===`);
console.log(`模式族: ${summary.totalPatternFamilies}`);
console.log(`批次数: ${summary.totalBatches}`);
console.log(`\n输出目录: ${BATCH_DIR}`);
console.log(`结果目录: ${summary.resultDirectory}`);

// ═══════════════════════════════════════════════════
// 生成处理脚本模板
// ═══════════════════════════════════════════════════

const processorScript = `/**
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

const BATCH_DIR = '${BATCH_DIR.replace(/'/g, "\\'")}';

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
console.log("\\n=== 语义提取进度 ===\\n");
for (const [cat, p] of Object.entries(progress)) {
  const bar = '█'.repeat(Math.floor(p.percent / 5)) + '░'.repeat(20 - Math.floor(p.percent / 5));
  console.log(\`\${cat.padEnd(12)} [\${bar}] \${p.percent}%  (\${p.completed}/\${p.total}, 剩余 \${p.remaining})\`);
}

const totalDone = Object.values(progress).reduce((s, p) => s + p.completed, 0);
const totalAll = Object.values(progress).reduce((s, p) => s + p.total, 0);
console.log(\`\\n总计: \${totalDone}/\${totalAll} (\${Math.round(totalDone/totalAll*100)}%)\`);

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
  console.log(\`\\n下一个待处理: \${next.category}/\${next.file}\`);
  console.log(\`文件路径: \${next.path}\`);
} else {
  console.log("\\n✅ 所有批次已处理完毕！运行 merge-results.js 合并结果。");
}
`;

fs.writeFileSync(path.join(BATCH_DIR, 'check-progress.js'), processorScript);

// ═══════════════════════════════════════════════════
// 合并脚本
// ═══════════════════════════════════════════════════

const mergeScript = `/**
 * 合并所有批次结果为统一的 extracted-v2-rules.json
 */

const fs = require('fs');
const path = require('path');

const BATCH_DIR = '${BATCH_DIR.replace(/'/g, "\\'")}';
const RESULTS_DIR = path.join(BATCH_DIR, 'results');
const OUTPUT_FILE = path.join('${DATA_DIR.replace(/'/g, "\\'")}', 'extracted-v2-rules.json');

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

  console.log(\`\${cat}: \${merged[cat].length} 条规则已合并\`);
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
console.log(\`\\n已合并到: \${OUTPUT_FILE}\`);
console.log(\`总规则数: \${merged.stats.totalRules}\`);
console.log(\`ActionType 使用分布: \${Object.keys(actionUsage).length} 种\`);

if (newActionsNeeded.length > 0) {
  console.log(\`\\n⚠️ 需要新增 ActionType: \${newActionsNeeded.length} 处\`);
  for (const item of newActionsNeeded.slice(0, 10)) {
    console.log(\`  - [\${item.category}] \${item.needed}\`);
  }
}
`;

fs.writeFileSync(path.join(BATCH_DIR, 'merge-results.js'), mergeScript);

console.log("\n✅ 管线脚本已生成:");
console.log("  - check-progress.js  (查看处理进度)");
console.log("  - merge-results.js   (合并结果)");
