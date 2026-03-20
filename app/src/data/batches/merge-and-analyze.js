/**
 * 合并全部语义提取结果 + ActionType 完备性分析
 */
const fs = require('fs');
const path = require('path');

const BATCH_DIR = path.join(__dirname);
const RESULTS_DIR = path.join(BATCH_DIR, 'results');
const OUTPUT_DIR = path.join(__dirname, '..', 'analysis');

const categories = ['attacks', 'abilities', 'trainers'];
const merged = { attacks: [], abilities: [], trainers: [] };

// ── 合并 ──
for (const cat of categories) {
  const resultDir = path.join(RESULTS_DIR, cat);
  const files = fs.readdirSync(resultDir).filter(f => f.endsWith('.json')).sort();
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(resultDir, f), 'utf-8'));
      if (data.results) merged[cat].push(...data.results);
      else if (Array.isArray(data)) merged[cat].push(...data);
    } catch (e) {
      console.error(`Error parsing ${cat}/${f}: ${e.message}`);
    }
  }
  console.log(`${cat}: ${merged[cat].length} 条规则已合并`);
}

// ── ActionType 使用统计 ──
const actionUsage = {};
const dynamicCalcUsage = {};
const triggerUsage = {};
const modifierTypeUsage = {};
const conditionTypeUsage = {};
const newActionsNeeded = [];
const abilitySubTypes = {};
const trainerSubTypes = {};

function walkSteps(steps) {
  for (const s of (steps || [])) {
    if (s.action) actionUsage[s.action] = (actionUsage[s.action] || 0) + 1;
    if (s.branch) {
      walkSteps(s.branch.thenSteps);
      walkSteps(s.branch.elseSteps);
      if (s.branch.condition) countCondition(s.branch.condition);
    }
    if (s.loop) walkSteps(s.loop.body);
  }
}

function countCondition(c) {
  if (!c) return;
  conditionTypeUsage[c.type] = (conditionTypeUsage[c.type] || 0) + 1;
  if (c.type === 'and' || c.type === 'or') (c.conditions || []).forEach(countCondition);
  if (c.type === 'not') countCondition(c.condition);
}

for (const cat of categories) {
  for (const rule of merged[cat]) {
    const a = rule.analysis || rule;

    walkSteps(a.steps);

    if (a.dynamicDamage) {
      dynamicCalcUsage[a.dynamicDamage.calc] = (dynamicCalcUsage[a.dynamicDamage.calc] || 0) + 1;
    }

    for (const t of (a.triggers || [])) {
      triggerUsage[t] = (triggerUsage[t] || 0) + 1;
    }

    for (const m of (a.modifiers || [])) {
      if (m.type) modifierTypeUsage[m.type] = (modifierTypeUsage[m.type] || 0) + 1;
    }

    for (const c of (a.preconditions || a.conditions || [])) {
      countCondition(c);
    }

    if (a.newActionNeeded) {
      newActionsNeeded.push({ category: cat, pattern: rule.pattern, needed: a.newActionNeeded });
    }

    if (a.abilitySubType) abilitySubTypes[a.abilitySubType] = (abilitySubTypes[a.abilitySubType] || 0) + 1;
    if (a.trainerSubType) trainerSubTypes[a.trainerSubType] = (trainerSubTypes[a.trainerSubType] || 0) + 1;
  }
}

// ── V2 Schema 枚举完整列表 ──
const V2_ACTIONS = [
  "draw_cards", "search_deck", "shuffle_deck", "put_on_deck_top", "put_on_deck_bottom",
  "shuffle_into_deck", "discard_cards", "recover_from_discard", "move_to_lost_zone",
  "return_to_hand", "put_in_play", "move_card", "reveal_cards", "look_at_cards", "show_hand",
  "deal_damage", "place_damage_counters", "heal", "move_damage_counters", "spread_damage",
  "full_heal", "damage_self", "apply_status", "remove_status", "remove_all_status",
  "attach_energy", "accelerate_energy", "discard_energy", "move_energy", "energy_type_change",
  "switch_pokemon", "evolve", "devolve", "copy_attack", "use_attack",
  "set_marker", "remove_marker", "clear_all_markers", "check_marker",
  "discard_stadium", "flip_coin", "flip_coins",
  "choose_cards", "choose_pokemon", "choose_option", "choose_type", "order_cards", "confirm",
  "if", "for_each", "repeat", "repeat_until", "extra_turn", "end_turn",
  "prevent_damage", "reduce_damage", "add_damage", "prevent_retreat", "prevent_evolution",
  "prevent_item_usage", "prevent_supporter_usage", "prevent_ability", "prevent_attack",
  "prevent_status", "prevent_energy_removal", "ignore_weakness", "ignore_resistance", "ignore_effects",
  "log"
];

const usedActions = new Set(Object.keys(actionUsage));
const unusedActions = V2_ACTIONS.filter(a => !usedActions.has(a));
const extraActions = [...usedActions].filter(a => !V2_ACTIONS.includes(a));

// ── Flags 统计 ──
const flagTotals = {};
for (const cat of categories) {
  for (const rule of merged[cat]) {
    const flags = (rule.analysis || rule).flags || {};
    for (const [k, v] of Object.entries(flags)) {
      if (v) flagTotals[k] = (flagTotals[k] || 0) + 1;
    }
  }
}

// ── 输出报告 ──
const report = {
  summary: {
    totalRules: merged.attacks.length + merged.abilities.length + merged.trainers.length,
    attacks: merged.attacks.length,
    abilities: merged.abilities.length,
    trainers: merged.trainers.length,
  },
  actionTypeAnalysis: {
    v2Defined: V2_ACTIONS.length,
    actuallyUsed: usedActions.size,
    unusedInV2: unusedActions,
    extraNotInV2: extraActions,
    usage: Object.fromEntries(Object.entries(actionUsage).sort((a, b) => b[1] - a[1])),
  },
  dynamicValueAnalysis: {
    usage: Object.fromEntries(Object.entries(dynamicCalcUsage).sort((a, b) => b[1] - a[1])),
  },
  triggerAnalysis: {
    usage: Object.fromEntries(Object.entries(triggerUsage).sort((a, b) => b[1] - a[1])),
  },
  modifierAnalysis: {
    usage: Object.fromEntries(Object.entries(modifierTypeUsage).sort((a, b) => b[1] - a[1])),
  },
  conditionAnalysis: {
    usage: Object.fromEntries(Object.entries(conditionTypeUsage).sort((a, b) => b[1] - a[1])),
  },
  abilitySubTypes,
  trainerSubTypes,
  flagTotals,
  newActionsNeeded: newActionsNeeded.length,
  newActionsDetails: newActionsNeeded.slice(0, 20),
};

// 写入
fs.writeFileSync(path.join(OUTPUT_DIR, 'extracted-v2-rules.json'), JSON.stringify(merged, null, 2));
fs.writeFileSync(path.join(OUTPUT_DIR, 'completeness-report.json'), JSON.stringify(report, null, 2));

// 打印
console.log('\n═══════════════════════════════════════════');
console.log('  V2 Schema 完备性分析报告');
console.log('═══════════════════════════════════════════\n');

console.log(`总规则数: ${report.summary.totalRules}`);
console.log(`  攻击: ${report.summary.attacks}`);
console.log(`  特性: ${report.summary.abilities}`);
console.log(`  训练家: ${report.summary.trainers}`);

console.log(`\nActionType:`);
console.log(`  V2 定义: ${report.actionTypeAnalysis.v2Defined}`);
console.log(`  实际使用: ${report.actionTypeAnalysis.actuallyUsed}`);
console.log(`  未使用: ${unusedActions.join(', ')}`);
if (extraActions.length) console.log(`  ⚠️ 额外(V2未定义): ${extraActions.join(', ')}`);

console.log(`\nActionType TOP 20:`);
Object.entries(actionUsage).sort((a,b) => b[1]-a[1]).slice(0,20).forEach(([k,v]) =>
  console.log(`  ${k.padEnd(28)} ${v}`));

console.log(`\nDynamicValue calc 分布:`);
Object.entries(dynamicCalcUsage).sort((a,b) => b[1]-a[1]).forEach(([k,v]) =>
  console.log(`  ${k.padEnd(28)} ${v}`));

console.log(`\nTriggerType 分布:`);
Object.entries(triggerUsage).sort((a,b) => b[1]-a[1]).forEach(([k,v]) =>
  console.log(`  ${k.padEnd(28)} ${v}`));

console.log(`\nModifierType 分布:`);
Object.entries(modifierTypeUsage).sort((a,b) => b[1]-a[1]).forEach(([k,v]) =>
  console.log(`  ${k.padEnd(28)} ${v}`));

console.log(`\nCondition 分布:`);
Object.entries(conditionTypeUsage).sort((a,b) => b[1]-a[1]).forEach(([k,v]) =>
  console.log(`  ${k.padEnd(28)} ${v}`));

console.log(`\n特性子类分布:`, abilitySubTypes);
console.log(`训练家子类分布:`, trainerSubTypes);
console.log(`\nFlags 总计:`, flagTotals);
console.log(`\n需要新增 ActionType: ${newActionsNeeded.length}`);
