# Poke-Trainer Pro — Agent Teams 设计方案

## 一、团队总览

```
┌─────────────────────────────────────────────────────────────┐
│                    🎯 Team Lead (你)                         │
│         整体协调、接口契约定义、质量审查、冲突仲裁            │
├──────────┬──────────┬──────────────┬────────────────────────┤
│ 🔧 Forge  │ 📦 Atlas  │ 🧠 Sensei    │ 🎨 Canvas             │
│ 引擎工匠  │ 数据图鉴  │ AI教练       │ 界面画师              │
│           │          │              │                       │
│ Battle    │ Card Data│ AI Strategy  │ Frontend UI           │
│ Engine    │ Pipeline │ Engine       │ React Board           │
├──────────┼──────────┼──────────────┼────────────────────────┤
│@ptcg/     │card-data/│ai-coach/     │frontend/              │
│engine/    │          │              │                       │
└──────────┴──────────┴──────────────┴────────────────────────┘
```

---

## 二、共享契约（所有Teammate必须遵守）

### 2.1 Card Schema — 卡牌数据模型（全局统一）

```typescript
// contracts/card.ts — 所有模块的公共语言

interface PokemonCard {
  id: string;                    // "sv6-001"
  name_en: string;               // "Charizard ex"
  name_zh: string;               // "喷火龙 ex"
  supertype: "Pokémon" | "Trainer" | "Energy";
  subtypes: string[];            // ["Stage 2", "ex"]
  hp: number;
  types: EnergyType[];
  evolvesFrom?: string;
  attacks: Attack[];
  abilities?: Ability[];
  weaknesses?: TypeModifier[];
  resistances?: TypeModifier[];
  retreatCost: EnergyType[];
  regulationMark: string;        // "H"
  set: string;                   // "sv6"
  prizeCards: number;            // ex=2, 普通=1
  imageUrl: string;
}

interface Attack {
  name_zh: string;
  name_en: string;
  cost: EnergyType[];
  damage: string;                // "180+" 或 "30×"
  text: string;
}

interface Ability {
  name_zh: string;
  name_en: string;
  type: "Ability";
  text: string;
}

type EnergyType = "Fire" | "Water" | "Grass" | "Lightning" 
  | "Psychic" | "Fighting" | "Darkness" | "Metal" 
  | "Dragon" | "Fairy" | "Colorless";

interface TypeModifier {
  type: EnergyType;
  value: string;                 // "×2" 或 "-30"
}
```

### 2.2 GameState Schema — 对战状态模型

```typescript
// contracts/game-state.ts — Engine产出, UI消费, AI分析

interface GameState {
  gameId: string;
  turn: number;
  phase: GamePhase;
  activePlayerId: PlayerId;
  players: Record<PlayerId, PlayerState>;
  winner: PlayerId | null;
}

type GamePhase = "setup" | "draw" | "main" | "attack" | "between_turns" | "game_over";
type PlayerId = "player1" | "player2";

interface PlayerState {
  active: PokemonInPlay | null;
  bench: (PokemonInPlay | null)[];  // 最多5
  hand: CardInHand[];
  deck: number;                      // 牌库剩余数
  discard: CardRef[];
  prizes: number;                    // 奖赏牌剩余
  lostZone: CardRef[];
}

interface PokemonInPlay {
  card: PokemonCard;
  currentHp: number;
  attachedEnergy: EnergyType[];
  attachedTools: CardRef[];
  damageCounters: number;
  specialConditions: SpecialCondition[];
  hasAttackedThisTurn: boolean;
  turnPlayed: number;               // 上场回合（进化判断用）
}

type SpecialCondition = "poisoned" | "burned" | "asleep" | "confused" | "paralyzed";
```

### 2.3 Action Schema — 行动指令模型

```typescript
// contracts/action.ts — UI发起, Engine校验执行, AI评估

type GameAction = 
  | { type: "draw_card" }
  | { type: "play_pokemon"; cardId: string; benchIndex: number }
  | { type: "evolve"; cardId: string; targetId: string }
  | { type: "attach_energy"; cardId: string; targetId: string }
  | { type: "retreat"; newActiveId: string; discardEnergy: EnergyType[] }
  | { type: "use_ability"; pokemonId: string }
  | { type: "play_trainer"; cardId: string; targets?: string[] }
  | { type: "attack"; attackIndex: number; targets?: string[] }
  | { type: "end_turn" };

interface ActionResult {
  success: boolean;
  newState: GameState;
  events: GameEvent[];              // 用于UI动画和AI解说
  error?: string;
}

interface GameEvent {
  type: string;                     // "damage_dealt" | "knockout" | "prize_taken" | ...
  data: Record<string, any>;
  timestamp: number;
}
```

### 2.4 AI Coach 接口

```typescript
// contracts/ai-coach.ts — AI Sensei 对外接口

interface CoachAnalysis {
  legalActions: ScoredAction[];
  recommendation: ScoredAction;
  explanation_zh: string;           // 给玩家看的中文教学解说
  decisionPoint?: DecisionPoint;    // 关键分歧点标记
}

interface ScoredAction {
  action: GameAction;
  score: number;                    // 0-100
  reasoning: string;                // 简短理由
}

interface DecisionPoint {
  type: "critical" | "important" | "routine";
  question_zh: string;              // "你觉得该打谁？"
  options: DecisionOption[];
}

interface DecisionOption {
  action: GameAction;
  label_zh: string;                 // "攻击多龙梅西亚（切断引擎）"
  tradeoff_zh: string;              // "伤害低但断对手展开链"
}
```

---

## 三、四个Teammate的详细设计

### Teammate A — 🔧 Forge（引擎工匠）

**角色定位：** PTCG对战规则的"物理引擎"。只关心规则正确性，不关心UI怎么画、AI怎么想。

**工作目录：** `packages/engine/`

**核心职责：**
1. Fork RyuuPlay，提取 `@ptcg/common` + `server/src/game` + `server/src/simple-bot` 核心
2. 去除所有 WebSocket/DB/Auth 依赖，重构为纯函数引擎
3. 实现 `BattleEngine` 类：
   ```typescript
   class BattleEngine {
     createGame(player1Deck: Deck, player2Deck: Deck): GameState;
     getLegalActions(state: GameState, playerId: PlayerId): GameAction[];
     applyAction(state: GameState, action: GameAction): ActionResult;
     isGameOver(state: GameState): { over: boolean; winner?: PlayerId };
   }
   ```
4. 补充 SV 时代机制：太晶（Tera）、ACE SPEC、ex 规则
5. 为 MVP 5 套卡组的核心卡实现效果（约 80 张卡）

**关键约束：**
- `applyAction` 必须是**纯函数**——相同输入永远产出相同输出
- 所有状态变更通过 `GameEvent` 记录，便于回放和AI分析
- 不引入任何 UI 或网络依赖

**交付标准：**
- [ ] `npm test` 全部通过
- [ ] 恶喷 vs 多龙 完整对局可跑通（手动输入 action 序列）
- [ ] `getLegalActions` 返回完整合法行动列表
- [ ] 伤害计算含弱点/抵抗/太晶规则

**参考代码：**
- RyuuPlay: `github.com/keeshii/ryuu-play`（MIT）
- 重点审计：`packages/common/src/store/` 和 `packages/server/src/game/`

---

### Teammate B — 📦 Atlas（数据图鉴）

**角色定位：** 卡牌数据的"百科全书"。负责从外部API获取、清洗、映射、缓存所有卡牌数据。

**工作目录：** `packages/card-data/`

**核心职责：**
1. 对接 PokemonTCG API v2，拉取 SV 系列全量英文卡牌数据
2. 对接 TCGdex API，获取简中卡名映射
3. 实现繁中→简中自动转换（处理 TCGdex 缺失的部分）
4. 构建 MVP 卡池：按 Regulation Mark 过滤当前标准环境可用卡
5. 手工校对 5 套核心卡组涉及的约 80 张卡的简中数据
6. 实现本地 JSON 缓存 + 增量更新机制

**关键产出：**
```
packages/card-data/
├── src/
│   ├── fetchers/
│   │   ├── pokemontcg-fetcher.ts    # PokemonTCG API v2 拉取
│   │   └── tcgdex-fetcher.ts        # TCGdex 简中映射
│   ├── mappers/
│   │   ├── card-mapper.ts           # 外部格式 → Card Schema
│   │   └── zhcn-mapper.ts           # 繁中→简中转换
│   ├── cache/
│   │   └── local-cache.ts           # JSON文件缓存
│   └── index.ts                     # CardDataService 统一入口
├── data/
│   ├── cards/                       # 缓存的卡牌JSON（按set分文件夹）
│   ├── decks/                       # 5套MVP预设卡组
│   │   ├── dark-tera-charizard.json # 恶太晶喷火龙 ex
│   │   ├── dragapult-ex.json        # 多龙巴鲁托 ex
│   │   ├── raging-bolt.json         # 猛雷鼓
│   │   ├── gardevoir-ex.json        # 沙奈朵 ex
│   │   └── venusaur-ex.json         # 超级妙蛙花 ex
│   └── zhcn-override.json           # 手工简中校对覆盖表
└── tests/
```

**关键约束：**
- 输出必须严格符合 `contracts/card.ts` 的 Card Schema
- 所有卡牌必须有 `name_zh`（中文名），缺失的用 `name_en` + "[待翻译]" 标记
- 5 套预设卡组的每张卡必须有完整的攻击、特性、能量消耗数据

**交付标准：**
- [ ] 5 套核心卡组 JSON 完整可用
- [ ] `CardDataService.getCard(id)` 返回完整 Card Schema
- [ ] `CardDataService.getDeck(name)` 返回完整卡组列表
- [ ] 简中覆盖率 ≥ MVP 卡池的 95%

**数据源：**
- PokemonTCG API v2: `api.pokemontcg.io/v2/cards`
- TCGdex API: `api.tcgdex.net/v2/zh-cn/`
- PTCG-database Schema 参考: `github.com/type-null/PTCG-database`

---

### Teammate C — 🧠 Sensei（AI教练）

**角色定位：** 对战中的"战术分析师+中文解说员"。评估局面、推荐行动、生成教学解说。

**工作目录：** `packages/ai-coach/`

**核心职责：**
1. 移植 RyuuPlay 的 SimpleBot 评估函数，适配新的 GameState/Action Schema
2. 实现 `StateEvaluator`：对当前局面打分（考虑场面控制、奖赏牌进度、资源量）
3. 实现 `ActionScorer`：对每个合法行动评分，生成排序推荐
4. 实现 `DecisionPointDetector`：识别关键分歧点（多个行动评分接近时触发）
5. 实现 `CoachNarrator`：将评估结果转化为中文教学解说

**关键产出：**
```
packages/ai-coach/
├── src/
│   ├── evaluator/
│   │   ├── state-evaluator.ts       # 局面评估函数
│   │   ├── scoring-weights.ts       # 评估权重配置
│   │   └── heuristics.ts            # 启发式规则（奖赏牌路径/能量效率等）
│   ├── scorer/
│   │   ├── action-scorer.ts         # 行动评分器
│   │   └── simulator.ts             # 1步前瞻模拟（applyAction + evaluate）
│   ├── detector/
│   │   └── decision-point.ts        # 关键分歧点检测
│   ├── narrator/
│   │   ├── coach-narrator.ts        # 中文解说生成器
│   │   └── templates/               # 解说模板（按场景分类）
│   │       ├── opening.ts           # 起手铺场解说
│   │       ├── attack-choice.ts     # 攻击选择解说
│   │       ├── resource-management.ts # 资源管理解说
│   │       └── endgame.ts           # 残局解说
│   └── index.ts                     # AICoachService 统一入口
└── tests/
    ├── evaluator.test.ts
    └── fixtures/                    # 预设局面快照用于测试
```

**AICoachService 核心接口：**
```typescript
class AICoachService {
  analyze(state: GameState, playerId: PlayerId): CoachAnalysis;
  
  // AI对手模式：直接返回最优行动
  getBotAction(state: GameState, playerId: PlayerId): GameAction;
  
  // 教学模式：生成决策点分析
  getDecisionPoint(state: GameState, playerId: PlayerId): DecisionPoint | null;
}
```

**关键约束：**
- 依赖 Engine 的 `getLegalActions` 和 `applyAction`，但通过接口调用，不直接引用引擎内部代码
- 中文解说面向 8-14 岁玩家，用词简洁、有趣
- 解说模板先用规则模板，后续可接入 LLM 提升自然度

**交付标准：**
- [ ] 给定任意合法 GameState，`analyze()` 返回有效的 CoachAnalysis
- [ ] 恶喷 vs 多龙 对局中至少识别出 3 个关键分歧点
- [ ] 中文解说可读性良好，非技术用户（孩子）能理解
- [ ] Bot 模式能完整走完一局（不会选出非法行动）

**参考：**
- RyuuPlay SimpleBot: `packages/server/src/simple-bot/`
- 评估维度参考：场面控制分、奖赏牌进度分、手牌资源分、能量效率分、威胁评估分

---

### Teammate D — 🎨 Canvas（界面画师）

**角色定位：** 面向玩家的"画面"。让对战状态变成可交互的视觉体验。

**工作目录：** `packages/frontend/`

**核心职责：**
1. React + Tailwind 构建 PTCG 对战棋盘 UI
2. 实现 `GameStateAdapter`：将 Engine 的 GameState 转为 UI 可渲染的格式
3. 实现对战场面渲染：战斗场、备战区（5格）、手牌区、牌库/弃牌堆计数、奖赏牌
4. 实现交互层：点击选择目标、拖拽贴能量、行动菜单
5. 集成 AI 教练面板：显示推荐行动和解说文字

**关键产出：**
```
packages/frontend/
├── src/
│   ├── adapters/
│   │   └── game-state-adapter.ts    # Engine State → UI State
│   ├── components/
│   │   ├── Board/
│   │   │   ├── BattleBoard.tsx      # 主棋盘（双方场面）
│   │   │   ├── ActiveZone.tsx       # 战斗场（当前宝可梦）
│   │   │   ├── BenchZone.tsx        # 备战区（5格）
│   │   │   ├── HandZone.tsx         # 手牌区
│   │   │   └── InfoPanel.tsx        # 牌库/弃牌/奖赏牌计数
│   │   ├── Card/
│   │   │   ├── PokemonCard.tsx      # 宝可梦卡渲染（含HP条/能量/状态）
│   │   │   ├── TrainerCard.tsx      # 训练师卡渲染
│   │   │   └── EnergyCard.tsx       # 能量卡渲染
│   │   ├── Coach/
│   │   │   ├── CoachPanel.tsx       # AI教练建议面板
│   │   │   ├── DecisionModal.tsx    # 关键分歧点弹窗
│   │   │   └── ActionHint.tsx       # 行动提示高亮
│   │   └── Common/
│   │       ├── HpBar.tsx            # HP条组件
│   │       ├── EnergyBadge.tsx      # 能量标记
│   │       └── StatusIcon.tsx       # 特殊状态图标
│   ├── hooks/
│   │   ├── useGameEngine.ts         # 引擎交互Hook
│   │   └── useCoach.ts              # AI教练交互Hook
│   ├── pages/
│   │   ├── BattlePage.tsx           # 对战主页
│   │   ├── DeckSelectPage.tsx       # 卡组选择页
│   │   └── HomePage.tsx             # 首页
│   └── App.tsx
├── public/
│   └── assets/                      # 卡图占位（实际用API URL）
└── tests/
```

**GameStateAdapter 核心逻辑：**
```typescript
class GameStateAdapter {
  static toUI(engineState: GameState, myId: PlayerId): UIBoardState {
    const me = engineState.players[myId];
    const opp = engineState.players[otherPlayer(myId)];
    return {
      myBoard: {
        active: me.active ? toPokemonUI(me.active) : null,
        bench: me.bench.map(p => p ? toPokemonUI(p) : null),
        hand: me.hand.map(toCardUI),
        prizes: me.prizes,
        deckCount: me.deck,
        discardCount: me.discard.length,
      },
      oppBoard: {
        active: opp.active ? toPokemonUI(opp.active) : null,
        bench: opp.bench.map(p => p ? toPokemonUI(p) : null),
        handCount: opp.hand.length,  // 对方只显示数量
        prizes: opp.prizes,
        deckCount: opp.deck,
        discardCount: opp.discard.length,
      },
      turnInfo: {
        turn: engineState.turn,
        isMyTurn: engineState.activePlayerId === myId,
        phase: engineState.phase,
      },
    };
  }
}
```

**关键约束：**
- 不直接依赖引擎内部代码，只通过 contracts 和 Adapter 交互
- 卡图使用 PokemonTCG API 的 imageUrl，不本地存储
- 移动端友好（先Web再考虑React Native）
- 面向儿童：色彩鲜明、交互直觉、文字大号

**交付标准：**
- [ ] 双方场面完整渲染（战斗场+5备战区+手牌+计数器）
- [ ] 点击手牌可查看详情
- [ ] 行动菜单正确显示当前合法行动
- [ ] AI教练面板显示推荐行动和解说文字
- [ ] 响应式布局（桌面 + 平板）

---

## 四、依赖关系与执行波次

```
                    Wave 0（并行启动）
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
    🔧 Forge         📦 Atlas      🎨 Canvas
    fork RyuuPlay    拉取API数据    搭建React脚手架
    审计+清理引擎    建映射管线     实现静态棋盘UI
        │               │               │
        ▼               ▼               │
    Wave 1：引擎核心    卡牌数据就绪     │
    BattleEngine类      5套卡组JSON      │
    getLegalActions      CardDataService  │
        │               │               │
        ├───────┬───────┘               │
        ▼       ▼                       │
    Wave 2：🧠 Sensei 启动              │
    接入Engine+CardData                  │
    实现StateEvaluator                   │
    实现ActionScorer                     │
        │                               │
        ├───────────────────────────────┘
        ▼
    Wave 3：全线集成
    Canvas 接入 Engine + Coach
    实现 GameStateAdapter
    跑通第一局完整对战
        │
        ▼
    Wave 4：打磨 & 测试
    恶喷 vs 多龙 完整对局测试
    中文解说质量调优
    UI交互打磨
```

**关键路径：** Forge → Sensei → Canvas集成。Atlas 与 Forge 完全并行。

---

## 五、Claude Code 启动提示词

在 Claude Code 中使用以下 prompt 启动团队：

```
Create an agent team for building Poke-Trainer Pro, a PTCG battle simulator 
for teaching kids competitive Pokemon TCG strategy.

Project uses TypeScript monorepo (packages/). All teammates share type 
contracts in packages/contracts/.

Spawn 4 teammates:

1. "Forge" (Battle Engine) — Fork keeshii/ryuu-play from GitHub. Extract 
   @ptcg/common and server/src/game into packages/engine/. Strip all 
   WebSocket/DB/Auth dependencies. Rebuild as pure-function BattleEngine 
   class with: createGame(), getLegalActions(), applyAction(), isGameOver(). 
   applyAction MUST be a pure function. Add SV-era rules: Tera ex, ACE SPEC.
   Working dir: packages/engine/

2. "Atlas" (Card Data Pipeline) — Build packages/card-data/. Fetch SV-series 
   cards from PokemonTCG API v2 (api.pokemontcg.io/v2/cards). Map Chinese 
   names via TCGdex API (api.tcgdex.net/v2/zh-cn/). Create 5 preset deck 
   JSON files: Dark Tera Charizard ex, Dragapult ex, Raging Bolt, 
   Gardevoir ex, Venusaur ex. All output must match Card Schema in 
   packages/contracts/card.ts.
   Working dir: packages/card-data/

3. "Sensei" (AI Coach) — Build packages/ai-coach/. Port SimpleBot from 
   RyuuPlay's server/src/simple-bot/. Implement StateEvaluator (board 
   control, prize progress, resource, energy efficiency, threat scores), 
   ActionScorer (1-step lookahead), DecisionPointDetector (trigger when 
   top-2 actions within 10 points). Add CoachNarrator generating Chinese 
   teaching explanations for 8-14 year old kids. 
   Depends on: Engine's getLegalActions + applyAction interfaces.
   Working dir: packages/ai-coach/

4. "Canvas" (Frontend UI) — Build packages/frontend/ with React + Tailwind.
   Implement PTCG battle board: ActiveZone, BenchZone (5 slots), HandZone,
   InfoPanel (deck/discard/prizes). Build GameStateAdapter converting 
   engine GameState to UI-friendly format. Add CoachPanel showing AI 
   recommendations and Chinese explanations. Card images from PokemonTCG 
   API URLs. Child-friendly: bright colors, large text, intuitive drag.
   Working dir: packages/frontend/

Coordination rules:
- Forge and Atlas start immediately in parallel (Wave 0)
- Sensei starts building scaffolding immediately but waits for Forge's 
  BattleEngine interface before integration
- Canvas starts React scaffold immediately but integrates after Wave 2
- All teammates: read packages/contracts/ before writing any code
- All teammates: write tests alongside implementation
- Target: run a complete Dark Tera Charizard vs Dragapult game with 
  AI coaching and UI rendering
```

---

## 六、CLAUDE.md 团队补充配置

将以下内容添加到项目根目录的 `CLAUDE.md`：

```markdown
# Poke-Trainer Pro — Team Guidelines

## Philosophy
"Build a physics engine, not card-specific code." — 引擎处理规则，卡牌效果是数据。

## Architecture
TypeScript monorepo: packages/{contracts, engine, card-data, ai-coach, frontend}

## Shared Contracts
ALL cross-package communication goes through packages/contracts/.
NEVER import directly from another package's internal modules.

## Language
- Code: English (variable names, comments, commit messages)
- User-facing text: Simplified Chinese (简体中文)
- Target audience: 8-14 year old competitive PTCG players

## Key Technical Decisions
- BattleEngine.applyAction() is a PURE FUNCTION — no side effects
- GameState is immutable — always return new state, never mutate
- Card effects are data-driven — don't hardcode card logic in engine
- UI consumes GameState only through GameStateAdapter

## MVP Scope (5 Decks)
1. 恶太晶喷火龙 ex (Dark Tera Charizard ex)
2. 多龙巴鲁托 ex (Dragapult ex)  
3. 猛雷鼓 (Raging Bolt)
4. 沙奈朵 ex (Gardevoir ex)
5. 超级妙蛙花 ex (Venusaur ex)

## Testing
Every module must have tests. Engine tests use deterministic seed for RNG.
AI Coach tests use pre-built GameState fixtures.

## Git
Feature branches per teammate: forge/*, atlas/*, sensei/*, canvas/*
Merge to main only after team lead review.
```

---

## 七、Token 预算估算

| Teammate | 预估工作量 | Token 消耗 |
|----------|-----------|-----------|
| Forge（引擎） | 最重，fork+重构+补SV规则 | ~40% |
| Atlas（数据） | 中等，API对接+映射 | ~15% |
| Sensei（AI） | 较重，评估函数+解说 | ~25% |
| Canvas（UI） | 中等，组件+适配器 | ~20% |

建议在 Max 计划下运行，单次 Agent Teams 预估消耗 $8-15。

---

## 八、风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| RyuuPlay 引擎逻辑与网络层高度耦合 | 中 | Forge 第一步做审计，如耦合严重则只参考逻辑自行重写核心 |
| TCGdex 简中数据覆盖率不足 | 高 | Atlas 准备 zhcn-override.json 手工补充，MVP 只保证 80 张核心卡 |
| Sensei 依赖 Engine 接口，可能等待 | 中 | Sensei 先用 mock GameState 开发评估逻辑，Wave 2 再集成 |
| 4个Agent同时修改 contracts/ 冲突 | 低 | Team Lead 先定义好 contracts，冻结后各 Teammate 只读不改 |
| 卡牌效果实现工作量爆炸 | 高 | MVP 严格限定 80 张卡，复杂效果用简化版实现 |
