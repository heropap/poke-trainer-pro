# Pokemon TCG 对战模拟器 — 项目架构文档

> 技术栈: Next.js 15 + TypeScript + React 19 + Socket.IO
> 测试: Jest (53 suites, 1264 tests)
> 引擎: 自研 controller+handler 模式 + 移植 ryuu-play (keeshii/ryuu-play) store+reducer 模式

---

## 目录总览

```
app/
├── src/
│   ├── engine/          # 核心游戏引擎（状态管理、回合流程、效果系统）
│   ├── components/      # React UI 组件
│   ├── app/             # Next.js App Router 页面
│   ├── lib/             # 外部库（ryuu-play引擎、卡组解析、图片预加载）
│   ├── data/            # 卡牌 JSON 数据
│   ├── services/        # 数据服务层（卡牌加载、卡组存储）
│   ├── server/          # 服务端（在线对战房间管理）
│   ├── hooks/           # 自定义 React Hooks
│   ├── types/           # TypeScript 类型定义
│   ├── adapters/        # 引擎适配器（ryuu-play ↔ UI 类型桥接）
│   └── __tests__/       # 测试文件（51个测试文件）
├── server.ts            # Socket.IO 服务端入口（在线对战）
├── next.config.ts       # Next.js 配置
├── tsconfig.json        # TypeScript 配置（含 @ptcg/common 路径别名）
├── jest.config.ts       # Jest 测试配置
├── package.json         # 项目依赖
└── postcss.config.mjs   # PostCSS 配置
```

---

## 1. `src/engine/` — 核心游戏引擎

整个引擎的核心职责：管理 PTCG 对战的完整状态、回合流程、卡牌效果。

### 1.1 核心文件

| 文件 | 行数 | 作用 | 关键导出 |
|------|------|------|----------|
| **game-state.ts** | 394 | 所有数据结构定义 | `GameState`, `GameCard`, `Player`, `Zone`, `GamePhase`, `TurnState`, `GamePrompt`, `createGameState()`, `createGameCard()`, `logEvent()` |
| **game-controller.ts** | 616 | 游戏控制器（UI 动作路由器） | `processAction()`, `startFirstTurn()`, `GameAction`, `ActionResult` |
| **turn-actions.ts** | 928 | 回合内玩家操作 | `attachEnergy()`, `evolvePokemon()`, `evolvePokemonAsync()`, `retreat()`, `playSupporter()`, `playItem()`, `playBasicToBench()`, `endTurn()` |
| **game-actions.ts** | 1001 | 游戏级别操作（伤害、击倒、奖品） | `performAttack()`, `checkKnockout()`, `takePrizes()`, `checkWinCondition()`, `calculateDamage()` |
| **zones.ts** | 132 | 卡牌区域工具函数 | `shuffleZone()`, `drawFromTop()`, `removeCard()`, `findCard()`, `addToBottom()` |
| **battle-setup.ts** | 347 | 对战初始化 | `initializeGame()`, `loadDeckCards()`, `SetupResult` |
| **battle-prepare.ts** | 538 | 对战准备阶段（抽牌、让牌、放置、硬币） | `executePreparation()`, `INITIAL_HAND_SIZE`, `PRIZE_CARD_COUNT` |
| **ai-player.ts** | 681 | AI 玩家决策引擎 | `computeAIAction()`, `AIDecision` |
| **manual-override.ts** | 479 | 手动覆盖系统（调试/God Mode） | `executeManualOverride()`, `ManualOverrideType` |
| **proxy-card.ts** | 173 | 代理卡牌（用于无图卡牌） | `createProxyCard()`, `ProxyCardEntry` |
| **index.ts** | 46 | 引擎公共导出入口 | 重导出 turn-actions + game-actions 的非冲突函数 |

### 文件间关系

```
UI (BattlePageClient)
  │
  ▼
game-controller.ts  ←── 路由所有 GameAction
  │
  ├──→ turn-actions.ts     ←── 回合操作（附加能量、进化、撤退、使用训练师）
  │      └──→ zones.ts          ←── 区域操作（洗牌、抽卡、移动卡牌）
  │      └──→ effect-registry   ←── 查找卡牌效果
  │      └──→ effect-context    ←── 创建效果执行上下文
  │
  ├──→ game-actions.ts     ←── 攻击、伤害、击倒、奖品、胜利检测
  │      └──→ zones.ts
  │      └──→ effect-registry
  │
  ├──→ attack-system.ts    ←── 攻击处理管线（弱点/抗性/效果修改器）
  │
  └──→ battle-setup.ts     ←── 初始化游戏
         └──→ battle-prepare.ts  ←── 准备阶段
         └──→ effects/index.ts   ←── 初始化效果注册
```

---

### 1.2 `src/engine/effects/` — 6 层效果优先级系统

这是引擎最复杂的子系统，负责所有卡牌效果的注册、查找和执行。

| 文件 | 行数 | 作用 | 关键导出 |
|------|------|------|----------|
| **index.ts** | 186 | 效果系统主入口 | `initializeEffects()` — 按 L1→L4 注册所有效果 |
| **effect-types.ts** | 180+ | 类型定义 | `EffectContext`, `AttackEffect`, `AbilityEffect`, `TrainerEffect`, `ToolEffect`, `CardEffectDef` |
| **effect-registry.ts** | 130+ | 双层注册表（ID+Name） | `registerEffect()`, `getEffect()`, `hasEffect()`, `getEffectSource()` |
| **effect-context.ts** | 1100+ | 效果执行上下文工厂 | `createEffectContext()`, `pendingPrompts`, `setPromptStateChangeCallback()` |
| **text-parser.ts** | 1967 | 文本解析器（~35种模式） | `parseCardEffects()`, `autoRegisterTextEffects()` |
| **markers.ts** | 45 | 标记常量 | `CANT_ATTACK_NEXT_TURN`, `PREVENT_RETREAT_NEXT_TURN`, `ABILITY_BLOCKED`, `VSTAR_USED` |
| **status-effects.ts** | 177 | 回合间状态处理 | `processBetweenTurns()` — 中毒/灼伤/睡眠/麻痹 |
| **coin.ts** | ~50 | 硬币翻转系统 | `flipCoin()`, `flipCoins()`, `setRandomFn()` |
| **schema-compiler.ts** | 927 | JSON Schema 编译器 | `compileSchema()` — 将 JSON 定义编译为效果函数 |
| **schema-loader.ts** | 131 | Schema 加载器 | `loadCustomEffects()`, `validateSchema()` |
| **effect-schema.ts** | ~200 | Schema 类型定义 | `EffectSchemaDefinition`, `AttackSchema`, `TrainerSchema` |
| **pattern-catalog.ts** | 1162 | 效果模式目录（UI编辑器用） | `allPatterns`, `attackPatterns`, `trainerPatterns` |
| **ryuu-metadata-extractor.ts** | 288 | ryuu-play 元数据提取 | `autoRegisterFromRyuuMeta()`, `extractRyuuAsUICards()` |
| **coverage-report.ts** | ~200 | 效果覆盖率报告 | `generateCoverageReport()`, `formatCoverageReport()` |

#### 6 层优先级链

```
Layer 1   (最高优先级): ID-based 手写效果     → cards/trainers.ts, cards/attacks.ts
Layer 1.5:              JSON Schema 编译效果   → custom-effects.json → schema-compiler
Layer 2:                Name-based 手写效果    → cards/stadiums.ts, cards/trainers-expanded.ts, cards/meta-attacks.ts
Layer 3:                ryuu-play 元数据解析    → ryuu-metadata-extractor.ts
Layer 4:                UI Card 文本解析       → text-parser.ts (从 _index.json 的攻击/特性文字)
Layer 5   (最低优先级): 无效果（静默跳过）
```

#### 效果注册初始化流程

```
battle-setup.ts: initializeGame()
  └──→ effects/index.ts: initializeEffects(allCards)
         ├── registerAll(allEffects, "L1")           // L1: ID手写
         ├── loadCustomEffects()                     // L1.5: JSON Schema
         ├── registerAllByName(trainerNameEffects)   // L2: Name手写
         ├── registerAllByName(stadiumNameEffects)    // L2
         ├── registerAllByName(metaAttackEffects)     // L2
         ├── registerAllByName(expandedTrainerEffects)// L2
         ├── autoRegisterFromRyuuMeta()              // L3: ryuu元数据
         └── autoRegisterTextEffects(cards)           // L4: UI文本解析
```

---

### 1.3 `src/engine/effects/cards/` — 手写卡牌效果实现

| 文件 | 行数 | 作用 |
|------|------|------|
| **trainers.ts** | 39121 | 训练师卡效果（ID+Name），含 Air Balloon, Ultra Ball, Boss's Orders 等 |
| **trainers-expanded.ts** | 18939 | 额外训练师卡效果（Nest Ball, Dark Patch, Rescue Carrier 等） |
| **meta-attacks.ts** | 23478 | 攻击效果（按攻击名注册），含 Infernal Reign, Junk Hunt 等 |
| **attacks.ts** | 7827 | 攻击效果（按卡牌ID注册） |
| **stadiums.ts** | 4851 | 场地卡效果（Beach Court, Path to the Peak 等） |

---

### 1.4 `src/engine/systems/` — 游戏子系统

| 文件 | 行数 | 作用 |
|------|------|------|
| **attack-system.ts** | ~200 | 原子攻击处理管线：弱点计算 → 抗性计算 → 效果修改器 → 伤害应用 → 击倒检测 → 奖品获取 |

### 1.5 `src/engine/middleware/` — 中间件

| 文件 | 行数 | 作用 |
|------|------|------|
| **evolution.middleware.ts** | ~200 | 进化合法性校验（阶段检查、同回合限制、名称匹配） |
| **types.ts** | ~150 | 中间件类型定义 (`ActionEvent`, `MiddlewareResult`) |

### 1.6 `src/engine/rules/` — 规则系统

| 文件 | 作用 |
|------|------|
| **base-rules.ts** | 基础规则管道 + 中间件验证 |
| **rule-schema.ts / rule-schema-zod.ts** | 规则定义的 JSON Schema |
| **rule-compiler.ts** | 编译规则定义为可执行函数 |
| **rule-executor.ts** | 执行编译后的规则 |
| **rule-loader.ts** | 加载规则定义文件 |
| **rule-validator.ts** | 规则验证器 |
| **modifier-pipeline.ts** | 修改器管道（伤害/费用修改） |
| **event-hooks.ts** | 事件钩子系统 |
| **card-rule-def.ts** | 卡牌规则定义接口 |
| **index.ts** | 规则系统入口 |

### 1.7 `src/engine/llm/` — LLM 规则生成

| 文件 | 作用 |
|------|------|
| **offline-rule-generator.ts** | 离线规则生成器 |
| **prompt-builder.ts** | LLM 提示词构建 |
| **batch-processor.ts** | 批量处理 |
| **generate-all-rules.ts** | 全量规则生成脚本 |
| **index.ts** | LLM 系统入口 |

### 1.8 `src/engine/interfaces/`

| 文件 | 作用 |
|------|------|
| **validation.ts** | 验证结果接口 (`ValidationResult`) |

### 1.9 `src/engine/tests/` — 引擎内部测试

| 文件 | 作用 |
|------|------|
| **energy-attachment.test.ts** | 能量附加规则测试 |
| **turn-rules.test.ts** | 回合规则测试 |

---

## 2. `src/components/` — React UI 组件

### 2.1 `src/components/battle/board/` — 对战棋盘（核心 UI）

| 文件 | 行数 | 作用 |
|------|------|------|
| **BattleBoard.tsx** | 1249 | 主对战棋盘组件。管理所有 UI 状态、操作路由、Prompt 弹窗分发。包含 `getEffectiveRetreatCost()` |
| **ActiveSpot.tsx** | 427 | 战斗位宝可梦展示。HP条、状态标记、撤退按钮、能量显示。包含 `getEffectiveRetreatCost()` + `canRetreatNow` 逻辑 |
| **BenchSpot.tsx** | 196 | 备战区位置展示。显示宝可梦/空位，拖放目标 |
| **Hand.tsx** | 224 | 手牌区域。卡牌扇形排列、可拖放、点击预览 |
| **VisualCard.tsx** | 362 | 单张卡牌可视化。图片加载、悬停预览、选中状态 |
| **ActionMenu.tsx** | 187 | 操作菜单（攻击选择） |
| **ActionLog.tsx** | 286 | 操作日志面板 |
| **ManualToolkit.tsx** | 369 | 手动覆盖工具箱（调试用） |
| **CardDetailModal.tsx** | 228 | 卡牌详情弹窗 |
| **CardSelectionModal.tsx** | 160 | 卡牌选择弹窗（响应 `select_cards` Prompt） |
| **EnergySelectionModal.tsx** | 149 | 能量选择弹窗（撤退时选择弃掉的能量） |
| **CoinFlipModal.tsx** | 89 | 硬币翻转动画弹窗 |
| **ConfirmModal.tsx** | 37 | 确认弹窗（响应 `confirm` Prompt） |
| **ChooseOptionModal.tsx** | 76 | 选项选择弹窗（响应 `choose_option` Prompt） |
| **OrderCardsModal.tsx** | 111 | 卡牌排序弹窗（响应 `order_cards` Prompt） |
| **EnergyAttachOverlay.tsx** | 57 | 能量附加视觉覆盖层 |
| **EvolutionOverlay.tsx** | 51 | 进化动画覆盖层 |
| **AnimationProvider.tsx** | 154 | 动画上下文提供者 |
| **CardBack.tsx** | 109 | 卡牌背面组件 |

#### BattleBoard 组件关系

```
BattleBoard.tsx (主组件)
  ├── ActiveSpot.tsx      ×2 (我方 + 对手战斗位)
  ├── BenchSpot.tsx       ×10 (我方5 + 对手5 备战区)
  ├── Hand.tsx            ×1 (我方手牌)
  │   └── VisualCard.tsx  ×N (每张手牌)
  ├── ActionMenu.tsx      ×1 (攻击选择菜单)
  ├── ActionLog.tsx       ×1 (操作日志)
  ├── ManualToolkit.tsx   ×1 (调试工具)
  │
  └── [弹窗层 - 响应 state.prompt]
      ├── CardSelectionModal   ← select_cards prompt
      ├── EnergySelectionModal ← 撤退时能量选择
      ├── CoinFlipModal        ← coin_flip prompt
      ├── ConfirmModal         ← confirm prompt
      ├── ChooseOptionModal    ← choose_option prompt
      └── OrderCardsModal      ← order_cards prompt
```

### 2.2 `src/components/card/` — 卡牌浏览

| 文件 | 作用 |
|------|------|
| **CardDetail.tsx** | 单张卡牌详细信息展示 |
| **CardGrid.tsx** | 卡牌网格布局 |
| **CardImage.tsx** | 优化的卡牌图片组件 |
| **CardSearch.tsx** | 卡牌搜索/过滤 |
| **index.ts** | 入口导出 |

### 2.3 `src/components/deck/` — 卡组管理

| 文件 | 作用 |
|------|------|
| **DeckContext.tsx** | 卡组全局上下文（React Context） — 管理已保存卡组列表 |
| **DeckImport.tsx** | 卡组导入组件（粘贴 PTCG Live 格式） |

### 2.4 `src/components/socket/` — 在线对战

| 文件 | 作用 |
|------|------|
| **SocketContext.tsx** | Socket.IO 全局上下文（React Context） — 管理连接状态、匹配、重连 |

### 2.5 `src/components/tools/` — 效果编辑器工具

| 文件 | 作用 |
|------|------|
| **CardEffectStatus.tsx** | 卡牌效果覆盖状态展示 |
| **AttackEffectBuilder.tsx** | 攻击效果可视化构建器 |
| **AbilityEffectBuilder.tsx** | 特性效果可视化构建器 |
| **TrainerEffectBuilder.tsx** | 训练师效果可视化构建器 |

### 2.6 `src/components/ui/` — 通用 UI 组件

通用的 UI 原子组件。

---

## 3. `src/app/` — Next.js App Router 页面

| 路径 | 文件 | 作用 |
|------|------|------|
| `/` | **page.tsx** | 首页 — 功能导航 |
| `/battle` | **page.tsx** + **BattlePageClient.tsx** | 对战页面 — AI/本地/在线对战入口 |
| `/cards` | **page.tsx** + **CardBrowser.tsx** | 卡牌浏览器 |
| `/deck` | **page.tsx** + **DeckPageClient.tsx** | 卡组管理 |
| `/stats` | **page.tsx** + **StatsPageClient.tsx** | 效果覆盖率统计 |
| `/tools/effect-editor` | **page.tsx** + **EffectEditorClient.tsx** | 效果编辑器 |
| `/api/health` | **route.ts** | 健康检查 API |
| — | **layout.tsx** | 根布局 |
| — | **providers.tsx** | 全局 Provider 包装 (DeckContext + SocketContext) |
| — | **globals.css** | 全局样式 |

### BattlePageClient.tsx 详解

这是最复杂的页面组件（~600行），负责：
- 对战模式选择 (AI / 本地 / 在线 / Mock Engine)
- 卡组选择 + 对战初始化
- 调用 `initializeGame()` + `startFirstTurn()`
- 将 `GameAction` 传给 `processAction()`
- AI 回合自动执行 (`computeAIAction()`)
- 在线对战的 Socket.IO 事件处理
- Prompt 状态变更回调 (`setPromptStateChangeCallback`)

---

## 4. `src/lib/` — 外部库和工具

### 4.1 `src/lib/ptcg-engine/` — 移植的 ryuu-play 引擎

> 来源: keeshii/ryuu-play (@ptcg/common 包)
> 路径别名: `@ptcg/common` → `src/lib/ptcg-engine/index.ts`

| 子目录 | 作用 |
|--------|------|
| **store/state/** | 游戏状态类 (State, Player, PokemonSlot, CardList) |
| **store/card/** | 卡牌类 (Card, PokemonCard, EnergyCard, TrainerCard, CardTypes枚举) |
| **store/effects/** | 效果抽象 (Effect, AbstractEffect) |
| **store/actions/** | 动作定义 |
| **store/reducers/** | 状态规约器 |
| **store/effect-reducers/** | 效果规约器 |
| **store/prompts/** | 提示定义 |
| **serializer/** | 状态序列化/反序列化（JSON Patch, State Serializer） |
| **game/** | 游戏管理 (Simulator, Replay, CardManager, BotArbiter) |
| **game/cards/** | 卡牌管理器 + 格式接口 |
| **interfaces/** | 接口定义（登录、排名、重播等） |
| **utils/** | 工具函数 |

> 注意: ryuu-play 使用 class 实例（State, Player, PokemonSlot），而我们的 UI 使用 plain interface（GameState, GameCard）。两者通过 adapter 桥接。

### 4.2 `src/lib/ptcg-sets/` — ryuu-play 卡牌集实现

| 子目录 | 包含卡牌集 |
|--------|------------|
| **base-sets/** | set-base, set-fossil, set-jungle |
| **ex-sets/** | set-ruby-and-sapphire, set-sandstorm |
| **standard/** | set-black-and-white (1-4), set-diamond-and-pearl, set-hgss, set-op9, set-sword-and-shield |
| **common/** | 共享代码（attacks/, markers/, trainers/） |

### 4.3 `src/lib/ryuu-adapter/` — ryuu-play 适配器

| 文件 | 作用 |
|------|------|
| **adapter.ts** | `adaptGameState()` — 将 ryuu State → UI GameState |
| **mock-engine.ts** | Mock 引擎（用于测试 ryuu-play 集成） |
| **mock-data.ts** | 测试用 Mock 数据 |
| **external-types.ts** | 外部类型定义 |

### 4.4 其他 lib 文件

| 文件 | 作用 |
|------|------|
| **deck-parser.ts** | PTCG Live 卡组文本解析器（`parseDeckText()`, `validateDeck()`, `resolveDeckCardIds()`） |
| **image-preloader.ts** | 卡牌图片预加载（`preloadDeckImages()`, `addPreloadLinks()`） |

---

## 5. `src/data/` — 卡牌数据

### 5.1 `src/data/cards/`

| 文件 | 作用 |
|------|------|
| **_index.json** | 合并的全卡牌索引（~4.7MB, 包含所有系列的所有卡牌） |
| **sv1.json ~ sv10.json** | SV 系列各集卡牌数据 |
| **swsh9.json ~ swsh12.json** | SWSH 系列各集卡牌数据 |
| **sve.json** | SV 能量卡数据 |
| **svp.json** | SV 宣传卡数据 |
| **me1.json ~ me2pt5.json** | ME 系列卡牌数据 |

### 5.2 `src/data/card-rules/`

| 文件 | 作用 |
|------|------|
| **generated-rules.json** | LLM 生成的卡牌规则 |
| **index.json** | 规则索引 |
| **stats.json** | 统计数据 |

### 5.3 其他数据文件

| 文件 | 作用 |
|------|------|
| **custom-effects.json** | 用户自定义效果（JSON Schema 格式，Layer 1.5） |

---

## 6. `src/services/` — 数据服务层

| 文件 | 作用 | 关键导出 |
|------|------|----------|
| **card-service.ts** | 卡牌数据加载服务（缓存 + 按 ID/Name 索引） | `loadAllCards()`, `getCardById()`, `getCardsByName()` |
| **deck-storage.ts** | 卡组 localStorage 持久化 | `saveDeck()`, `loadDecks()`, `getDeckCardIds()`, `StoredDeck` |

---

## 7. `src/server/` — 服务端

| 文件 | 作用 |
|------|------|
| **game-room.ts** | 在线对战房间管理。`GameRoom` 类管理: 状态同步、视野遮蔽（隐藏对手手牌/牌组）、断线重连、回合计时、自动让步 |

### 根目录 `server.ts`

Socket.IO 服务端入口：
- 创建 HTTP + Next.js + Socket.IO 服务器
- 匹配队列（1v1）
- 将 GameRoom 事件广播给两个玩家
- 视野遮蔽（`getMaskedState`）— 每个玩家只看到自己的手牌
- 断线检测 + 60秒重连窗口
- 回合计时（90秒/回合）

---

## 8. `src/hooks/` — 自定义 Hooks

| 文件 | 作用 |
|------|------|
| **useIsMobile.ts** | 响应式断点检测（默认 768px） |

---

## 9. `src/types/` — TypeScript 类型

| 文件 | 作用 |
|------|------|
| **card.ts** | UI 层卡牌类型定义：`Card`, `CardAttack`, `CardAbility`, `CardWeakness`, `CardResistance`, `CardImages` |

---

## 10. `src/adapters/` — 引擎适配器

| 文件 | 作用 |
|------|------|
| **engine-adapter.ts** | ryuu-play State ↔ UI GameState 双向转换。处理: CardType枚举→字符串, Stage→subtype, SpecialCondition→StatusCondition, GamePhase映射 |

---

## 11. `src/__tests__/` — 测试文件（51个）

按功能分类：

| 类别 | 测试文件 |
|------|----------|
| **引擎核心** | `game-engine.test.ts`, `game-controller.test.ts`, `turn-actions.test.ts`, `damage-knockout.test.ts` |
| **效果系统** | `card-effects.test.ts`, `text-parser.test.ts`, `text-parser-enhanced.test.ts`, `effect-layer-tracking.test.ts`, `effect-schema.test.ts`, `ability-system.test.ts`, `ability-text-parser.test.ts` |
| **卡牌数据** | `card-data-integrity.test.ts`, `card-import-integrity.test.ts`, `card-service.test.ts`, `card-components.test.tsx` |
| **卡组** | `deck-parser.test.ts`, `deck-storage.test.ts`, `deck-import-compatibility.test.ts` |
| **对战流程** | `battle-prepare.test.ts`, `card-play-integration.test.ts`, `status-attack-checks.test.ts`, `cta-rule-system.test.ts` |
| **高级功能** | `advanced-prompts.test.ts`, `interactive-selection.test.ts`, `prompt-state-change.test.ts`, `manual-override.test.ts` |
| **规则修复** | `rule-fixes-15b.test.ts`, `rule-fixes-15c.test.ts`, `rule-corrections-25.test.ts` |
| **AI** | `ai-player.test.ts` |
| **在线对战** | `websocket-game-room.test.ts`, `reconnection.test.ts`, `turn-timer.test.ts` |
| **UI/动画** | `animation-system.test.ts`, `responsive-layout.test.ts`, `action-log.test.ts` |
| **其他** | `smoke.test.ts`, `health-api.test.ts`, `image-optimization.test.ts`, `coverage-report.test.ts` |
| **Schema/规则** | `schema-loader.test.ts`, `pattern-catalog.test.ts`, `offline-rule-generator.test.ts`, `marker-system.test.ts` |
| **元数据** | `ryuu-metadata-extractor.test.ts`, `meta-effects-integration.test.ts`, `proxy-card.test.ts` |
| **进化** | `evolution-middleware.test.ts`, `rare-candy.test.ts`, `stadium-system.test.ts` |

`src/engine/tests/` 还包含 2 个引擎内部测试文件。

---

## 核心数据流

### 用户操作 → 状态更新 → UI 渲染

```
用户点击 (BattleBoard UI)
  │
  ▼
BattlePageClient.handleAction(action: GameAction)
  │
  ▼
processAction(gameState, playerIndex, action)    // game-controller.ts
  │
  ├─ "play_card" ──→ handlePlayCard()
  │   ├─ Basic Pokemon? ──→ playBasicToBench()      // turn-actions.ts
  │   ├─ Energy?        ──→ attachEnergy()           // turn-actions.ts
  │   ├─ Evolution?     ──→ evolvePokemonAsync()     // turn-actions.ts (async)
  │   ├─ Supporter?     ──→ playSupporter()          // turn-actions.ts
  │   ├─ Item?          ──→ playItem()               // turn-actions.ts
  │   ├─ Stadium?       ──→ playStadium()            // turn-actions.ts
  │   └─ Tool?          ──→ 附加到目标宝可梦
  │
  ├─ "attack"   ──→ resolveAttack()                  // attack-system.ts
  │   ├─ 查找攻击效果 ──→ getEffect() → effect.execute(ctx)
  │   ├─ 计算伤害 ──→ 弱点 → 抗性 → 修改器
  │   ├─ 应用伤害 ──→ damageCounters += damage/10
  │   ├─ 击倒检测 ──→ checkKnockout()
  │   └─ 奖品获取 ──→ takePrizes() → checkWinCondition()
  │
  ├─ "retreat"  ──→ handleRetreat()
  │   ├─ 检查: 本回合已撤退? → 拒绝
  │   ├─ 弃掉选中的能量
  │   └─ 交换战斗位 ↔ 备战区
  │
  ├─ "evolve"   ──→ handleEvolve() (async)
  │   ├─ 验证进化合法性
  │   ├─ 执行进化
  │   └─ 触发 on_enter 特性 (可异步)
  │
  ├─ "end_turn" ──→ handleEndTurn()
  │   ├─ processBetweenTurns() — 中毒/灼伤伤害
  │   ├─ 清除回合标记
  │   └─ 切换当前玩家 + 自动抽卡
  │
  ├─ "use_ability" ──→ handleUseAbility()
  │   └─ 查找并执行特性效果
  │
  └─ "concede"  ──→ concede()
  │
  ▼
返回 ActionResult { success, error, newState }
  │
  ▼
setGameState(newState)  // React setState → 触发重渲染
  │
  ▼
BattleBoard 重新渲染（基于 newState）
```

### Prompt 交互流程

```
效果执行中需要用户选择 (例: Boss's Orders 选择对手备战区宝可梦)
  │
  ▼
effect-context.ts: promptUser({type, message, zone, min, max})
  │
  ├─ 设置 state.prompt = {...}
  ├─ 调用 onPromptStateChange(state)  →→→  BattlePageClient 收到中间状态
  │                                          │
  │                                          ▼
  │                                    BattleBoard 渲染对应 Modal
  │                                    (CardSelectionModal / CoinFlipModal / ...)
  │                                          │
  │                                          ▼
  │                                    用户做出选择
  │                                          │
  │                                          ▼
  │                                    processAction("select_cards_response", {selectedIds})
  │                                          │
  ├─ pendingPrompts.get(promptId).resolve(selectedIds)  ←←←
  │
  ▼
效果继续执行（使用用户选择的结果）
```

---

## 配置文件

| 文件 | 关键配置 |
|------|----------|
| **tsconfig.json** | `@/` → `src/`, `@ptcg/common` → `src/lib/ptcg-engine/index.ts` |
| **jest.config.ts** | moduleNameMapper 同 tsconfig, 排除 ryuu-play `.spec.ts` |
| **next.config.ts** | 图片域名白名单 (images.pokemontcg.io) |
| **package.json** | 核心依赖: next, react, socket.io, zod, pako-esm |

---

## 类型差异对照 (ryuu-play vs UI)

| 概念 | ryuu-play (class) | 我们的 UI (interface) |
|------|-------------------|----------------------|
| 游戏状态 | `State` (class) | `GameState` (interface) |
| 玩家 | `Player` (class) | `Player` (interface) |
| 卡牌 | `Card` subclasses (PokemonCard, EnergyCard, TrainerCard) | `GameCard` + `Card` (plain objects) |
| 卡牌集合 | `CardList` (class) | `Zone` (interface: `{ cards: GameCard[] }`) |
| 战斗位 | `PokemonSlot` (class) | `active: GameCard \| null` |
| 能量类型 | `CardType` (enum) | `string` |
| 进化阶段 | `Stage` (enum) | `subtypes: string[]` |
| 状态异常 | `SpecialCondition` (enum) | `StatusCondition` (union type) |
| 游戏阶段 | `GamePhase` (enum) | `GamePhase` (string union) |

转换通过 `src/adapters/engine-adapter.ts` 的 `adaptGameState()` 完成。
