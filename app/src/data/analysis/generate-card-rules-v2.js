/**
 * 阶段 5: 生成全量 V2 CardRuleDef 映射
 *
 * 数据流:
 *   cards/*.json (5392 张原始卡牌)
 *     + extracted-v2-rules.json (1983 个模式族规则)
 *     + unique-texts.json (文本→pattern→cardIds 映射)
 *     → card-rules-v2.json (每张卡的完整 V2 规则定义)
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..');
const CARDS_DIR = path.join(DATA_DIR, 'cards');
const OUTPUT_FILE = path.join(DATA_DIR, 'card-rules-v2.json');
const STATS_FILE = path.join(__dirname, 'card-rules-v2-stats.json');

// ── 加载数据 ──
const extracted = require(path.join(__dirname, 'extracted-v2-rules.json'));
const uniqueTexts = require(path.join(__dirname, 'unique-texts.json'));

// ── 构建 pattern → analysis 索引 ──
const attackRuleMap = new Map();
const abilityRuleMap = new Map();
const trainerRuleMap = new Map();

for (const r of extracted.attacks) attackRuleMap.set(r.pattern, r.analysis);
for (const r of extracted.abilities) abilityRuleMap.set(r.pattern, r.analysis);
for (const r of extracted.trainers) trainerRuleMap.set(r.pattern, r.analysis);

// ── 构建 text → pattern 索引 (从 unique-texts) ──
const textToPattern = new Map();
for (const item of uniqueTexts.attacks) {
  textToPattern.set(item.text, item.pattern || item.text);
}
for (const item of uniqueTexts.abilities) {
  textToPattern.set(item.text, item.pattern || item.text);
}
for (const item of uniqueTexts.trainers) {
  textToPattern.set(item.text, item.pattern || item.text);
}

// ── 数字归一化 (与 prepare-batches 一致) ──
function normalizeNumbers(text) {
  return text.replace(/\b\d+\b/g, 'N');
}

// ── 查找规则的多级匹配 ──
function findAttackRule(text) {
  if (!text) return null;
  // 1. 直接匹配 pattern map
  const pattern = textToPattern.get(text);
  if (pattern && attackRuleMap.has(pattern)) return attackRuleMap.get(pattern);
  // 2. 数字归一化后匹配
  const normalized = normalizeNumbers(text);
  if (attackRuleMap.has(normalized)) return attackRuleMap.get(normalized);
  if (attackRuleMap.has(text)) return attackRuleMap.get(text);
  // 3. 尝试 N 替换变体
  const nPattern = text.replace(/\d+/g, 'N');
  if (attackRuleMap.has(nPattern)) return attackRuleMap.get(nPattern);
  return null;
}

function findAbilityRule(text) {
  if (!text) return null;
  const pattern = textToPattern.get(text);
  if (pattern && abilityRuleMap.has(pattern)) return abilityRuleMap.get(pattern);
  const normalized = normalizeNumbers(text);
  if (abilityRuleMap.has(normalized)) return abilityRuleMap.get(normalized);
  if (abilityRuleMap.has(text)) return abilityRuleMap.get(text);
  return null;
}

function findTrainerRule(text) {
  if (!text) return null;
  const pattern = textToPattern.get(text);
  if (pattern && trainerRuleMap.has(pattern)) return trainerRuleMap.get(pattern);
  const normalized = normalizeNumbers(text);
  if (trainerRuleMap.has(normalized)) return trainerRuleMap.get(normalized);
  if (trainerRuleMap.has(text)) return trainerRuleMap.get(text);
  return null;
}

// ── 提取数字参数 ──
function extractNumbers(originalText, patternText) {
  if (!originalText || !patternText) return {};
  const origNums = originalText.match(/\b\d+\b/g) || [];
  return { numbers: origNums.map(Number) };
}

// ── 确定规则箱 ──
function determineRuleBox(card) {
  const subtypes = card.subtypes || [];
  const rules = card.rules || [];
  const rulesText = rules.join(' ').toLowerCase();

  if (subtypes.includes('VMAX')) return 'VMAX';
  if (subtypes.includes('VSTAR')) return 'VSTAR';
  if (subtypes.includes('V') && !subtypes.includes('VMAX') && !subtypes.includes('VSTAR')) return 'V';
  if (rulesText.includes('tag team')) return 'TAG_TEAM';
  if (subtypes.includes('Radiant')) return 'Radiant';

  // ex (lowercase) vs EX (uppercase in name)
  if (card.name?.endsWith(' ex')) return 'ex';
  if (card.name?.includes('-EX') || card.name?.endsWith(' EX')) return 'EX';
  if (card.name?.includes('-GX') || card.name?.endsWith(' GX')) return 'GX';

  return 'none';
}

// ── 提取标签 ──
function extractTags(card) {
  const tags = [];
  const subtypes = card.subtypes || [];

  if (subtypes.includes('Ancient')) tags.push('Ancient');
  if (subtypes.includes('Future')) tags.push('Future');
  if (subtypes.includes('Tera')) tags.push('Tera');
  if (subtypes.includes('Single Strike')) tags.push('Single_Strike');
  if (subtypes.includes('Rapid Strike')) tags.push('Rapid_Strike');
  if (subtypes.includes('Fusion Strike')) tags.push('Fusion_Strike');
  if (subtypes.includes('ACE SPEC')) tags.push('ACE_SPEC');
  if (subtypes.includes('Radiant')) tags.push('Radiant');

  const ruleBox = determineRuleBox(card);
  if (ruleBox !== 'none') tags.push(ruleBox);

  return tags;
}

// ── 映射子类型 ──
function mapSubType(st) {
  const map = {
    'Basic': 'Basic', 'Stage 1': 'Stage1', 'Stage 2': 'Stage2',
    'MEGA': 'Mega', 'BREAK': 'BREAK', 'VMAX': 'VMAX', 'VSTAR': 'VSTAR',
    'V': 'Basic', 'Restored': 'Restored', 'Level-Up': 'LevelUp',
    'Item': 'Item', 'Supporter': 'Supporter', 'Stadium': 'Stadium',
    'Pokémon Tool': 'Tool', 'Technical Machine': 'TechnicalMachine',
    'Special': 'Special',
  };
  return map[st] || st;
}

// ── 主循环: 遍历全部卡牌 ──
const cardFiles = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json') && f !== '_index.json');
const allCardRules = [];
const stats = {
  totalCards: 0,
  byType: { pokemon: 0, trainer: 0, energy: 0 },
  attacksMapped: 0, attacksTotal: 0, attacksNoText: 0,
  abilitiesMapped: 0, abilitiesTotal: 0,
  trainersMapped: 0, trainersTotal: 0,
  unmappedExamples: [],
};

for (const file of cardFiles) {
  const cards = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf-8'));

  for (const card of cards) {
    stats.totalCards++;
    const superType = card.supertype;
    const ruleBox = determineRuleBox(card);
    const tags = extractTags(card);

    const cardRule = {
      cardId: card.id,
      cardName: card.name,
      superType: superType,
      subTypes: (card.subtypes || []).map(mapSubType),
      set: card.set?.id || file.replace('.json', ''),
      ruleBox,
      tags,
      rules: [],
    };

    // ── Pokémon: 攻击 + 特性 ──
    if (superType === 'Pokémon') {
      stats.byType.pokemon++;

      // 攻击
      for (const atk of (card.attacks || [])) {
        stats.attacksTotal++;
        const text = atk.text;

        if (!text || text.trim() === '') {
          stats.attacksNoText++;
          // 纯伤害攻击
          cardRule.rules.push({
            identifier: `${card.id}-attack-${atk.name.replace(/\s+/g, '-').toLowerCase()}`,
            version: 1,
            type: 'attack',
            attackName: atk.name,
            baseDamage: parseInt(atk.damage) || 0,
            cost: (atk.cost || []).map(c => ({ type: c, amount: 1 })),
            originalText: '',
            steps: [],
            mapped: true,
            confidence: 1.0,
            parseSource: 'damage_only',
          });
          stats.attacksMapped++;
          continue;
        }

        const rule = findAttackRule(text);
        if (rule) {
          const nums = extractNumbers(text, textToPattern.get(text));
          cardRule.rules.push({
            identifier: `${card.id}-attack-${atk.name.replace(/\s+/g, '-').toLowerCase()}`,
            version: 1,
            type: 'attack',
            attackName: atk.name,
            baseDamage: parseInt(atk.damage) || 0,
            cost: (atk.cost || []).map(c => ({ type: c, amount: 1 })),
            originalText: text,
            ...rule,
            instanceParams: nums,
            mapped: true,
            confidence: 0.9,
            parseSource: 'llm_extracted',
          });
          stats.attacksMapped++;
        } else {
          cardRule.rules.push({
            identifier: `${card.id}-attack-${atk.name.replace(/\s+/g, '-').toLowerCase()}`,
            version: 1,
            type: 'attack',
            attackName: atk.name,
            baseDamage: parseInt(atk.damage) || 0,
            cost: (atk.cost || []).map(c => ({ type: c, amount: 1 })),
            originalText: text,
            steps: [],
            mapped: false,
            confidence: 0,
            parseSource: 'unmapped',
          });
          if (stats.unmappedExamples.length < 30) {
            stats.unmappedExamples.push({ cardId: card.id, type: 'attack', text: text.substring(0, 100) });
          }
        }
      }

      // 特性
      for (const ab of (card.abilities || [])) {
        stats.abilitiesTotal++;
        const text = ab.text;
        const rule = findAbilityRule(text);
        if (rule) {
          cardRule.rules.push({
            identifier: `${card.id}-ability-${ab.name.replace(/\s+/g, '-').toLowerCase()}`,
            version: 1,
            type: 'ability',
            abilityName: ab.name,
            originalText: text,
            ...rule,
            mapped: true,
            confidence: 0.9,
            parseSource: 'llm_extracted',
          });
          stats.abilitiesMapped++;
        } else {
          cardRule.rules.push({
            identifier: `${card.id}-ability-${ab.name.replace(/\s+/g, '-').toLowerCase()}`,
            version: 1,
            type: 'ability',
            abilityName: ab.name,
            originalText: text,
            steps: [],
            mapped: false,
            confidence: 0,
            parseSource: 'unmapped',
          });
          if (stats.unmappedExamples.length < 30) {
            stats.unmappedExamples.push({ cardId: card.id, type: 'ability', text: text.substring(0, 100) });
          }
        }
      }
    }

    // ── Trainer ──
    else if (superType === 'Trainer') {
      stats.byType.trainer++;
      const texts = card.rules || [];
      for (const text of texts) {
        stats.trainersTotal++;
        const rule = findTrainerRule(text);
        if (rule) {
          cardRule.rules.push({
            identifier: `${card.id}-trainer-effect`,
            version: 1,
            type: 'trainer_effect',
            originalText: text,
            ...rule,
            mapped: true,
            confidence: 0.9,
            parseSource: 'llm_extracted',
          });
          stats.trainersMapped++;
        } else {
          cardRule.rules.push({
            identifier: `${card.id}-trainer-effect`,
            version: 1,
            type: 'trainer_effect',
            originalText: text,
            steps: [],
            mapped: false,
            confidence: 0,
            parseSource: 'unmapped',
          });
          if (stats.unmappedExamples.length < 30) {
            stats.unmappedExamples.push({ cardId: card.id, type: 'trainer', text: text.substring(0, 100) });
          }
        }
      }
    }

    // ── Energy ──
    else if (superType === 'Energy') {
      stats.byType.energy++;
      const isSpecial = (card.subtypes || []).includes('Special');
      if (isSpecial) {
        const texts = card.rules || [];
        for (const text of texts) {
          cardRule.rules.push({
            identifier: `${card.id}-energy-effect`,
            version: 1,
            type: 'energy_effect',
            originalText: text,
            steps: [],
            mapped: false,
            confidence: 0,
            parseSource: 'unmapped',
            note: 'Special energy effects need manual mapping',
          });
        }
      }
    }

    allCardRules.push(cardRule);
  }
}

// ── 统计 ──
stats.attackMappingRate = Math.round(stats.attacksMapped / stats.attacksTotal * 1000) / 10;
stats.abilityMappingRate = Math.round(stats.abilitiesMapped / stats.abilitiesTotal * 1000) / 10;
stats.trainerMappingRate = stats.trainersTotal > 0 ? Math.round(stats.trainersMapped / stats.trainersTotal * 1000) / 10 : 0;

// ── 写入 ──
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allCardRules, null, 2));
fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

console.log('═══════════════════════════════════════════');
console.log('  V2 CardRuleDef 生成完成');
console.log('═══════════════════════════════════════════\n');
console.log(`总卡牌: ${stats.totalCards}`);
console.log(`  Pokémon: ${stats.byType.pokemon} | Trainer: ${stats.byType.trainer} | Energy: ${stats.byType.energy}`);
console.log();
console.log(`攻击映射: ${stats.attacksMapped} / ${stats.attacksTotal} (${stats.attackMappingRate}%)`);
console.log(`  其中纯伤害(无文本): ${stats.attacksNoText}`);
console.log(`特性映射: ${stats.abilitiesMapped} / ${stats.abilitiesTotal} (${stats.abilityMappingRate}%)`);
console.log(`训练家映射: ${stats.trainersMapped} / ${stats.trainersTotal} (${stats.trainerMappingRate}%)`);
console.log();
console.log(`输出: ${OUTPUT_FILE}`);
console.log(`统计: ${STATS_FILE}`);
if (stats.unmappedExamples.length > 0) {
  console.log(`\n未映射样例 (前10):`)
  stats.unmappedExamples.slice(0, 10).forEach(e =>
    console.log(`  [${e.cardId}] ${e.type}: ${e.text}`));
}
