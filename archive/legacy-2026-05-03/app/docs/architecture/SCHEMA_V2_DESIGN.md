# PTCG Rule Schema V2 — 双维度设计

> 流程维度（大循环）× 卡牌维度（小循环）

## 设计原则

1. **声明式优先**：所有规则都可以用 JSON 描述，不依赖硬编码 TypeScript
2. **两维度正交**：流程维度定义"什么时候"，卡牌维度定义"做什么"
3. **完备性**：覆盖准备阶段到胜负判定的全部游戏状态
4. **可扩展**：新机制只需在对应维度追加枚举值，不改核心结构

---

## 一、区域模型 (Zone Model)

对应物理牌桌布局，是两个维度共同操作的"地址空间"。

```
=========================================================================
|  [discard₂] |                                            |            |
|  ----------  |              [ hand₂ ]                    | [prizes₂]  |
|  [deck₂]    |                                            |  (6张)     |
|  ----------  |              [ bench₂ ]                   |            |
|  [lost₂]    |              (最多 5 张)                   |            |
|=======================================================================|
|              |              [ active₂ ]                  |            |
|              |              (仅限 1 张)                   |            |
| [ stadium ] |------------------------------------------------| [coin/   |
| (全局共享)   |              [ active₁ ]                  |  vstar]   |
|              |              (仅限 1 张)                   |            |
|=======================================================================|
|              |              [ bench₁ ]                   | [lost₁]    |
| [prizes₁]   |              (最多 5 张)                   |  ---------- |
|  (6张)       |                                            | [deck₁]   |
|              |              [ hand₁ ]                    |  ---------- |
|              |                                            | [discard₁] |
=========================================================================
```

### ZoneType — 完整枚举

```typescript
export type ZoneType =
  // ── 玩家私有区域 ──
  | "active"            // 战斗区（仅 1 只 Pokémon）
  | "bench"             // 备战区（最多 5 只 Pokémon）
  | "hand"              // 手牌（对手不可见）
  | "deck"              // 牌库（面朝下，有序）
  | "deck_top"          // 牌库顶 N 张（用于 look/reveal）
  | "deck_bottom"       // 牌库底（用于化石等特殊放置）
  | "discard"           // 弃牌区（公开信息）
  | "prizes"            // 奖赏区（面朝下，6 张）
  | "lost_zone"         // 放逐区（永久移除，公开信息）
  // ── 附加区域（寄生在 Pokémon 上）──
  | "attached_energy"   // 附加的能量卡
  | "attached_tool"     // 附加的道具卡
  | "evolution_stack"   // 进化堆（下层卡牌）
  // ── 全局共享区域 ──
  | "stadium"           // 竞技场（全局仅 1 张）
  // ── 抽象/复合区域 ──
  | "in_play"           // = active + bench（场上所有）
  | "any";              // 任意区域（用于通配筛选）
```

### 区域属性

```typescript
interface ZoneDescriptor {
  type: ZoneType;
  visibility: "public" | "private" | "hidden";  // 公开/仅自己可见/双方不可见
  ordered: boolean;        // 是否有序（deck 有序, hand 无序）
  capacity: number | null; // null = 无限
  per_player: boolean;     // true = 每人一个, false = 全局共享
}
```

| Zone | visibility | ordered | capacity | per_player |
|------|-----------|---------|----------|------------|
| active | public | - | 1 | ✓ |
| bench | public | - | 5 | ✓ |
| hand | private | ✗ | null | ✓ |
| deck | hidden | ✓ | null | ✓ |
| discard | public | ✓ | null | ✓ |
| prizes | hidden | ✗ | 6 | ✓ |
| lost_zone | public | ✗ | null | ✓ |
| stadium | public | - | 1 | ✗ |

---

## 二、流程维度（大循环）— Game Flow

整个游戏是一个有限状态机。每个状态节点都是**规则挂载点（Hook Point）**。

### GamePhase — 完整状态机

```typescript
export type GamePhase =
  // ── 准备阶段 ──
  | "SETUP_COIN_FLIP"         // 猜拳/掷硬币决定先后攻
  | "SETUP_DRAW_HAND"         // 双方抽 7 张手牌
  | "SETUP_MULLIGAN_CHECK"    // 调度检查（无基础宝可梦？）
  | "SETUP_PLACE_ACTIVE"      // 选 1 张基础宝可梦放战斗区
  | "SETUP_PLACE_BENCH"       // 可选：放基础宝可梦到备战区
  | "SETUP_MULLIGAN_RESOLVE"  // 对手决定是否因调度多抽牌
  | "SETUP_PLACE_PRIZES"      // 从牌库顶放 6 张奖赏卡
  | "SETUP_REVEAL"            // 双方翻开宝可梦，游戏正式开始
  // ── 回合阶段 ──
  | "DRAW"                    // 抽牌阶段（必须抽 1 张）
  | "MAIN"                    // 主阶段（自由操作）
  | "ATTACK_DECLARE"          // 攻击宣告
  | "ATTACK_COST_CHECK"       // 攻击能量检查
  | "ATTACK_PRE_EFFECTS"      // 攻击前效果（混乱检定等）
  | "ATTACK_DAMAGE_CALC"      // 伤害计算
  | "ATTACK_APPLY"            // 应用伤害与效果
  | "ATTACK_KO_CHECK"         // 击倒检查
  | "ATTACK_PRIZE_TAKE"       // 拿取奖赏卡
  | "ATTACK_PROMOTE"          // 被击倒方推上替补
  | "ATTACK_POST_EFFECTS"     // 攻击后效果
  // ── 回合间 ──
  | "CHECKUP"                 // 宝可梦检查（中毒/灼伤/睡眠/麻痹）
  | "TURN_END"                // 回合结束（重置标记、交替玩家）
  // ── 终局 ──
  | "GAME_OVER";
```

### 流程状态转移图

```
SETUP_COIN_FLIP → SETUP_DRAW_HAND → SETUP_MULLIGAN_CHECK
                                         ↓ 有基础宝可梦
                                    SETUP_PLACE_ACTIVE → SETUP_PLACE_BENCH
                                         ↑ 无基础宝可梦        ↓
                                    (重抽：洗回牌库, 重抽7张)  SETUP_MULLIGAN_RESOLVE
                                                              ↓
                                                         SETUP_PLACE_PRIZES → SETUP_REVEAL
                                                                               ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TURN LOOP                                         │
│                                                                                 │
│  DRAW ──→ MAIN ──→ [玩家选择结束回合] ──→ CHECKUP ──→ TURN_END ──→ DRAW ...  │
│                 ↘                                                               │
│              [玩家宣告攻击]                                                      │
│                 ↘                                                               │
│           ATTACK_DECLARE → ATTACK_COST_CHECK → ATTACK_PRE_EFFECTS              │
│                                                     ↓                           │
│           ATTACK_DAMAGE_CALC → ATTACK_APPLY → ATTACK_KO_CHECK                  │
│                                                     ↓ (有击倒)                  │
│                                              ATTACK_PRIZE_TAKE                  │
│                                                     ↓                           │
│                                    [胜负判定] ──→ GAME_OVER                     │
│                                        ↓ (未结束)                               │
│                                  ATTACK_PROMOTE → ATTACK_POST_EFFECTS          │
│                                                     ↓                           │
│                                               CHECKUP → TURN_END → DRAW ...    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                     ↓
               DRAW 阶段牌库为空 ──→ GAME_OVER (deck_out)
```

### TriggerType — 挂载点枚举

卡牌效果通过 Trigger 挂载到流程节点上：

```typescript
export type TriggerType =
  // ── 准备阶段 ──
  | "on_game_start"           // 游戏开始时（少数卡有此效果）
  // ── 回合开始 ──
  | "on_turn_start"           // 回合开始时（抽牌之前）
  | "on_draw"                 // 抽牌时
  // ── 主阶段 - 使用时机 ──
  | "on_play"                 // 从手牌打出时（Trainer, Basic Pokémon）
  | "on_enter_play"           // 进入场上时（含进化、从弃牌堆复活等）
  | "on_activate"             // 主动激活特性
  | "on_evolve"               // 进化时
  | "on_energy_attach"        // 能量附加时
  | "on_retreat"              // 撤退时
  | "on_tool_attach"          // 道具装备时
  // ── 攻击阶段 ──
  | "on_attack_declare"       // 宣告攻击时
  | "on_attack_cost_check"    // 攻击能量检查时
  | "on_damage_calc"          // 伤害计算时（弱点/抵抗力/修正之前）
  | "on_damage_modify"        // 伤害修正时（加减伤害）
  | "on_damage_apply"         // 伤害实际应用时
  | "on_attack_effect"        // 攻击附加效果结算时
  | "on_attack_end"           // 攻击结算完成后
  // ── 被动响应 ──
  | "on_damage_received"      // 受到伤害时
  | "on_knockout"             // 被击倒时
  | "on_knockout_opponent"    // 击倒对手时
  | "on_prize_take"           // 拿取奖赏卡时
  | "on_promote"              // 被推上战斗区时
  // ── 回合间/结束 ──
  | "between_turns"           // 回合间检查（中毒/灼伤/睡眠）
  | "on_turn_end"             // 回合结束时
  // ── 区域移动 ──
  | "on_discard"              // 进入弃牌区时
  | "on_leave_play"           // 离开场上时
  | "on_hand_enter"           // 进入手牌时
  // ── 持续 ──
  | "while_in_play"           // 在场上期间（被动特性）
  | "while_attached"          // 附着期间（道具/特殊能量）
  | "while_in_stadium";       // 场地存在期间
```

### 首回合特殊规则

```typescript
interface FirstTurnRules {
  goingFirst: {
    canAttack: false;
    canPlaySupporter: false;
    canEvolve: false;
  };
  goingSecond: {
    canAttack: true;
    canPlaySupporter: true;
    canEvolve: false;
  };
}
```

---

## 三、卡牌维度（小循环）— Card Taxonomy

### 3.1 物理大类 (SuperType)

```typescript
export type SuperType = "Pokémon" | "Trainer" | "Energy";
```

### 3.2 子类 (SubType)

```typescript
export type PokémonSubType =
  | "Basic"
  | "Stage1"
  | "Stage2"
  | "VMAX"
  | "VSTAR"
  | "V-UNION"
  | "BREAK"
  | "Mega"         // XY 时代
  | "Restored";    // 化石机制

export type TrainerSubType =
  | "Item"
  | "Supporter"
  | "Stadium"
  | "Tool"            // = Pokémon Tool
  | "TechnicalMachine"; // 技术机器

export type EnergySubType =
  | "Basic"
  | "Special";
```

### 3.3 规则箱与奖赏倍率 (Rule Box)

```typescript
export type RuleBox =
  | "none"          // 普通宝可梦, 击倒 = 1 张奖赏
  | "ex"            // 朱紫 ex, 击倒 = 2 张
  | "EX"            // XY EX, 击倒 = 2 张
  | "V"             // 剑盾 V, 击倒 = 2 张
  | "VMAX"          // 击倒 = 3 张
  | "VSTAR"         // 击倒 = 2 张, 附带 VSTAR Power
  | "V-UNION"       // 击倒 = 3 张
  | "GX"            // 日月 GX, 击倒 = 2 张, GX 技每场限 1 次
  | "TAG_TEAM"      // 击倒 = 3 张
  | "Radiant";      // 击倒 = 1 张, 构筑限 1 张

export const PRIZE_MAP: Record<RuleBox, number> = {
  none: 1, ex: 2, EX: 2, V: 2,
  VMAX: 3, VSTAR: 2, "V-UNION": 3,
  GX: 2, TAG_TEAM: 3, Radiant: 1,
};
```

### 3.4 词缀与派系标签 (Tags)

```typescript
export type CardTag =
  // ── 构筑限制 ──
  | "ACE_SPEC"       // 王牌卡, 卡组限 1 张
  | "Prism_Star"     // 棱镜星, 同名限 1, 弃牌→放逐
  | "Radiant"        // 光辉, 卡组限 1 张带此标签的卡
  // ── 朱紫时代 ──
  | "Ancient"        // 古代
  | "Future"         // 未来
  | "Tera"           // 太晶化（备战区免疫伤害）
  // ── 剑盾时代 ──
  | "Single_Strike"  // 一击
  | "Rapid_Strike"   // 连击
  | "Fusion_Strike"  // 汇流
  // ── 日月时代 ──
  | "Ultra_Beast"    // 究极异兽
  // ── 通用 ──
  | "ex" | "V" | "VMAX" | "VSTAR" | "GX";  // 用于效果检索
```

### 3.5 能量/属性类型

```typescript
export type EnergyType =
  | "Grass" | "Fire" | "Water" | "Lightning"
  | "Psychic" | "Fighting" | "Metal" | "Darkness"
  | "Dragon" | "Colorless" | "Fairy";
```

### 3.6 状态异常

```typescript
export type StatusCondition =
  | "poisoned"    // 中毒: 回合间受 10 伤害
  | "burned"      // 灼伤: 回合间掷硬币, 反面受 20 伤害
  | "asleep"      // 睡眠: 不能攻击/撤退, 回合间掷硬币, 正面苏醒
  | "confused"    // 混乱: 攻击时掷硬币, 反面自伤 30
  | "paralyzed";  // 麻痹: 不能攻击/撤退, 经过 1 回合后解除
```

---

## 四、卡牌使用管线 (Card Usage Pipeline)

每种卡牌子类都有固定的"使用管线"：

### 4.1 Pokémon 管线

```
[Basic Pokémon]
  前置: 处于主阶段, 手牌中有此卡
  条件: active 为空 → 放 active; bench 未满 → 放 bench
  效果: 标记 playedThisTurn = true
  后续: 触发 on_enter_play (如果有入场特性)

[Evolution (Stage1/Stage2/VMAX/VSTAR)]
  前置: 处于主阶段, 手牌中有此卡
  条件: 场上有对应的前置进化宝可梦
        且该宝可梦不是本回合刚上场的 (playedThisTurn = false)
        且不是游戏第一回合
  效果: 覆盖在目标上, 继承能量/道具/伤害
        清除状态异常和标记
        标记 evolvedThisTurn = true
  后续: 触发 on_evolve, on_enter_play

[V-UNION]
  前置: 4 张同名 V-UNION 碎片全部在弃牌区
  效果: 合体后放到备战区
```

### 4.2 Trainer 管线

```
[Item]
  前置: 主阶段, 手牌中有此卡
  条件: canPlay() 通过 (卡片自身的使用条件)
  效果: 执行 steps[]
  后续: 进入弃牌区 (除非是道具)

[Supporter]
  前置: 主阶段, 手牌中有此卡, 本回合未使用过支援者
        非先攻第一回合
  条件: canPlay() 通过
  效果: 执行 steps[], 标记 supporterUsedThisTurn = true
  后续: 进入弃牌区

[Stadium]
  前置: 主阶段, 手牌中有此卡, 本回合未放置过场地
        当前场地不与此卡同名
  效果: 旧场地进弃牌区 → 放置新场地
  持续: while_in_stadium 效果持续生效

[Tool]
  前置: 主阶段, 手牌中有此卡
  条件: 目标宝可梦未装备道具 (或有特殊例外)
  效果: 附着到目标宝可梦
  持续: while_attached 效果持续生效

[Technical Machine]
  前置: 主阶段, 手牌中有此卡
  效果: 附着到宝可梦, 宝可梦获得额外攻击
  后续: 使用后弃牌
```

### 4.3 Energy 管线

```
[Basic Energy]
  前置: 主阶段, 手牌中有此卡, 本回合未贴过能量
  效果: 附着到目标宝可梦, 提供 1 个对应属性能量
        标记 energyAttachedThisTurn = true

[Special Energy]
  前置: 同 Basic Energy
  效果: 附着到目标宝可梦
        触发 on_energy_attach (如有)
  持续: while_attached 效果 (如提供多属性、回血等)
  移除: 触发 on_discard (如有)
```

### 4.4 Attack 管线（最复杂的小循环）

```
1. DECLARE        → 玩家选择攻击
2. COST_CHECK     → 验证附加能量 ≥ 攻击消耗
3. PRE_EFFECTS    → 混乱检定 (confused: 掷硬币, 反面自伤 30 并终止)
                  → 睡眠/麻痹检查 (不能攻击)
                  → 效果锁定检查 (markers: can't_attack_next_turn)
4. DAMAGE_CALC    → base_damage (可能为动态值: per energy/per damage counter 等)
                  → 弱点 (×2)
                  → 抵抗力 (-30)
                  → 出招方修正 (modify_damage_outgoing)
                  → 受击方修正 (modify_damage_incoming)
                  → floor(0)
5. APPLY_DAMAGE   → 放置伤害标记 (damage_counters += damage / 10)
6. ATTACK_EFFECTS → 执行攻击附加效果 steps[]
                     (状态异常、弃能量、抽牌、移动宝可梦等)
7. KO_CHECK       → HP ≤ damage_counters × 10?
                  → 多只同时击倒时逐一处理
8. PRIZE_TAKE     → 按 PRIZE_MAP[rule_box] 拿奖赏卡
                  → 检查胜负条件
9. PROMOTE        → 被击倒方选择备战区宝可梦推上战斗区
                  → 无可推 → 对手胜利
10. POST_EFFECTS  → can't_attack_next_turn 等延迟标记
                  → 额外回合等
```

### 4.5 Ability 管线

```
[Activated Ability] — 主动激活
  触发: 玩家选择激活
  条件: 在场上, 本回合未使用 (once_per_turn), 未被封锁 (ability_blocked)
  效果: 执行 steps[], 标记 abilityUsedThisTurn = true

[Passive Ability] — 持续性
  触发: 无（在场上自动生效）
  条件: 在场上, 未被封锁
  效果: 注册 Modifier (modify_damage, modify_retreat_cost, prevent_status 等)
  特例: 某些被动特性仅在特定位置生效 (active_only / bench_only)

[Triggered Ability] — 事件触发
  触发: 特定游戏事件 (on_energy_attach, on_evolve, on_knockout 等)
  条件: 事件匹配, 在场上, 未被封锁
  效果: 执行 steps[]

[On-Enter Ability] — 入场触发
  触发: on_enter_play (从手牌打出或进化时)
  条件: 入场来源匹配 (from_hand / from_evolution)
  效果: 执行 steps[]
```

---

## 五、原子动作完整集 (Action Types)

按语义分类的全部原子动作：

### 5.1 卡牌位移 (Card Movement)

在任意两个 Zone 之间移动卡牌，这是最基础的原子操作。

```typescript
// ── 通用位移 ──
| "move_card"              // 通用: 从 zone_a 移到 zone_b
                           // params: { from, to, position?: "top"|"bottom"|"shuffle" }

// ── 牌库操作 ──
| "draw_cards"             // 从牌库顶抽到手牌
| "search_deck"            // 检索牌库 (玩家看牌库选卡)
| "shuffle_deck"           // 洗牌库
| "put_on_top"             // 放到牌库顶
| "put_on_bottom"          // 放到牌库底
| "shuffle_hand_into_deck" // 手牌全部洗入牌库

// ── 弃牌操作 ──
| "discard_cards"          // 从指定区域弃牌
| "recover_from_discard"   // 从弃牌区回收 (到手牌/牌库/场上)

// ── 特殊区域 ──
| "move_to_lost_zone"      // 放逐 (移入失区, 不可回收)
| "return_to_hand"         // 从场上回手牌 (bounce)
| "put_in_play"            // 直接放到场上 (不经手牌, 如化石)
```

### 5.2 信息操作 (Information)

```typescript
| "reveal_cards"           // 展示卡牌 (给对手看)
| "look_at_cards"          // 看卡牌 (仅自己可见, 如看牌库顶 N 张)
| "show_hand"              // 展示全部手牌
```

### 5.3 伤害与治疗 (Damage & Healing)

```typescript
| "deal_damage"            // 造成伤害 (走完整伤害计算管线: 弱点/抵抗/修正)
| "place_damage_counters"  // 直接放置伤害标记 (跳过伤害计算, 不触发弱点抵抗)
| "heal"                   // 治疗 (移除伤害标记)
| "move_damage_counters"   // 在宝可梦之间移动伤害标记
| "spread_damage"          // 分配伤害到多个目标 (玩家选择分配)
| "full_heal"              // 完全治愈 (移除所有伤害标记)
```

### 5.4 状态异常 (Status)

```typescript
| "apply_status"           // 施加状态异常 (poisoned/burned/asleep/confused/paralyzed)
| "remove_status"          // 移除指定状态异常
| "remove_all_status"      // 移除全部状态异常
```

### 5.5 能量操作 (Energy)

```typescript
| "attach_energy"          // 从手牌贴能量 (常规每回合 1 次)
| "accelerate_energy"      // 从牌库/弃牌堆加速贴能 (不受每回合限制)
| "discard_energy"         // 弃能量 (从宝可梦身上移除)
| "move_energy"            // 在宝可梦之间移动能量
| "energy_type_change"     // 改变能量提供的属性类型
```

### 5.6 宝可梦操作 (Pokémon Control)

```typescript
| "switch_pokemon"         // 替换宝可梦 (active ↔ bench)
| "evolve"                 // 进化
| "devolve"                // 退化 (少见, 移除顶层进化卡)
| "copy_attack"            // 复制攻击 (使用其他宝可梦的攻击)
```

### 5.7 标记与持续效果 (Markers)

```typescript
| "set_marker"             // 设置标记 (如 "can't_attack_next_turn", 带过期回合)
| "remove_marker"          // 移除指定标记
| "clear_all_markers"      // 清除所有标记
| "check_marker"           // 检查标记是否存在 (用于条件判断)
```

### 5.8 场地操作 (Stadium)

```typescript
| "discard_stadium"        // 移除当前场地
| "place_stadium"          // 放置场地 (通常由 play_card 管线处理)
```

### 5.9 随机与交互 (RNG & Interaction)

```typescript
// ── 随机 ──
| "flip_coin"              // 掷 1 枚硬币
| "flip_coins"             // 掷 N 枚硬币

// ── 玩家交互 (需要 UI 响应) ──
| "choose_cards"           // 从一组卡中选择 N 张
| "choose_pokemon"         // 选择一只宝可梦
| "choose_option"          // 从选项中选择 (如选择属性类型)
| "choose_type"            // 选择一个能量属性
| "order_cards"            // 排列卡牌顺序 (如排列牌库顶)
| "confirm"                // 是/否确认
```

### 5.10 流程控制 (Flow Control)

```typescript
| "if"                     // 条件分支
| "for_each"               // 遍历 (对每个目标执行)
| "repeat"                 // 重复 N 次 (如掷硬币直到反面)
| "extra_turn"             // 获得额外回合
| "end_turn_immediately"   // 强制结束回合
```

### 5.11 规则修改 (Rule Override)

```typescript
| "prevent_damage"         // 完全防御 (下次受到的伤害变为 0)
| "reduce_damage"          // 减伤 (减少固定值)
| "add_damage"             // 增伤 (增加固定值)
| "prevent_retreat"        // 禁止撤退
| "prevent_evolution"      // 禁止进化
| "prevent_item_usage"     // 禁止使用物品卡
| "prevent_ability"        // 封锁特性
| "prevent_attack"         // 禁止攻击
| "prevent_status"         // 免疫状态异常
| "ignore_weakness"        // 无视弱点
| "ignore_resistance"      // 无视抵抗力
```

### 5.12 日志

```typescript
| "log"                    // 写入事件日志
```

---

## 六、条件系统 (Condition System)

```typescript
export type Condition =
  // ── 随机 ──
  | { type: "coin_flip" }                    // 掷硬币正面
  | { type: "coin_flip_count"; min: number } // N 枚中至少 min 枚正面

  // ── 区域检查 ──
  | { type: "zone_has_cards"; zone: ZoneType; owner: OwnerType;
      count: number; comparison: "gte" | "lte" | "eq";
      filter?: CardFilter }
  | { type: "zone_is_empty"; zone: ZoneType; owner: OwnerType }
  | { type: "bench_not_full"; owner: OwnerType }

  // ── 宝可梦状态 ──
  | { type: "is_in_zone"; zone: ZoneType }   // 此卡在指定区域
  | { type: "has_damage"; target: TargetSelector }
  | { type: "has_status"; status: StatusCondition; target: TargetSelector }
  | { type: "has_energy"; energyType?: EnergyType; count?: number; target: TargetSelector }
  | { type: "has_type"; energyType: EnergyType; target: TargetSelector }

  // ── 回合状态 ──
  | { type: "is_first_turn" }
  | { type: "is_going_first" }
  | { type: "usage_limit"; scope: "turn" | "game"; count: number }
  | { type: "has_attached_energy_this_turn" }
  | { type: "has_played_supporter_this_turn" }
  | { type: "has_retreated_this_turn" }
  | { type: "has_attacked_this_turn" }

  // ── 标签/标记 ──
  | { type: "has_tag"; tag: CardTag; target: TargetSelector }
  | { type: "has_marker"; marker: string; target: TargetSelector }
  | { type: "has_rule_box"; ruleBox: RuleBox; target: TargetSelector }

  // ── 卡牌属性 ──
  | { type: "card_name"; name: string; target: TargetSelector }
  | { type: "card_type"; superType: SuperType; target: TargetSelector }
  | { type: "card_subtype"; subType: string; target: TargetSelector }

  // ── 逻辑组合 ──
  | { type: "not"; condition: Condition }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] };
```

---

## 七、Modifier 系统 (持续效果)

```typescript
export type ModifierType =
  // ── 伤害修正 ──
  | "modify_damage_outgoing"   // 出招方伤害加减
  | "modify_damage_incoming"   // 受击方伤害加减
  | "prevent_damage_incoming"  // 完全防御

  // ── 能力限制 ──
  | "prevent_attack"
  | "prevent_retreat"
  | "prevent_item_usage"
  | "prevent_supporter_usage"
  | "prevent_ability"
  | "prevent_evolution"
  | "prevent_status"

  // ── 数值修正 ──
  | "modify_retreat_cost"      // 撤退费用加减
  | "modify_hp"               // HP 加减
  | "modify_attack_cost"      // 攻击能量消耗加减

  // ── 弱点/抵抗 ──
  | "ignore_weakness"
  | "ignore_resistance"
  | "add_weakness"
  | "add_resistance"

  // ── 特殊 ──
  | "immunity_bench"           // 备战区免疫伤害 (太晶化)
  | "redirect_damage";         // 伤害重定向

export interface Modifier {
  id: string;
  type: ModifierType;
  source: TargetSelector;      // 谁产生了这个效果
  target?: TargetSelector;     // 作用于谁
  value?: number | string;
  condition?: Condition;        // 何时生效
  expiry?: {
    type: "turn_count" | "once" | "until_leave_play" | "permanent";
    turns?: number;             // turn_count 时使用
    owner?: OwnerType;          // 谁的回合计数
  };
}
```

---

## 八、目标选择器 (Target Selector V2)

```typescript
export type OwnerType = "self" | "opponent" | "both" | "any";
export type TargetKind = "pokemon" | "card" | "player" | "attack" | "ability";

export interface TargetSelector {
  targetType: TargetKind;
  owner: OwnerType;
  zone: ZoneType | ZoneType[];
  count: number | "all" | "up_to";  // "up_to" = 最多 N 张 (可选少于)
  maxCount?: number;                 // 当 count = "up_to" 时的上限

  filter?: CardFilter;

  // 位置限定（用于 Pokémon）
  position?: "active_only" | "bench_only" | "any";
}

export interface CardFilter {
  superType?: SuperType[];           // ["Pokémon", "Trainer"]
  subType?: string[];                // ["Basic", "Stage1", "Item"]
  energyType?: EnergyType[];         // 宝可梦/能量的属性
  name?: string;                     // 卡名精确匹配
  nameContains?: string;             // 卡名包含
  tag?: CardTag[];                   // 标签匹配
  ruleBox?: RuleBox[];               // 规则箱匹配
  hasAbility?: boolean;
  hasDamage?: boolean;
  hasStatus?: StatusCondition;
  maxHP?: number;
  minHP?: number;
  maxRetreatCost?: number;
  // 进化关系
  evolvesFrom?: string;              // 从指定卡名进化
  evolvesInto?: string;              // 可以进化为
  // 排除
  exclude?: CardFilter;              // 反向过滤
}
```

---

## 九、CardRuleDef V2 — 统一卡牌规则定义

```typescript
export interface CardRuleDef {
  // ── 身份标识 ──
  identifier: string;        // "sv2P-027-chien-pao-ex-ability-1"
  version: number;
  cardName: string;          // "Chien-Pao ex"

  // ── 分类 ──
  type: "attack" | "ability" | "trainer_effect" | "energy_effect" | "rule_box_effect";
  abilitySubType?: "activated" | "passive" | "triggered" | "on_enter";

  // ── 生命周期 ──
  triggers: TriggerType[];         // 什么时候触发
  conditions?: Condition[];        // 前置条件
  costs?: Cost[];                  // 支付的代价

  // ── 效果内容 ──
  steps: ActionStep[];             // 按顺序执行的动作队列
  modifiers?: Modifier[];          // 持续效果

  // ── 元数据 (给 LLM 解析用) ──
  originalText?: string;           // 卡牌原始文本
  confidence?: number;             // LLM 解析置信度 (0-1)
  parseSource?: "hand_written" | "regex" | "llm" | "schema_editor";
}

export interface ActionStep {
  action: ActionType;
  target?: TargetSelector;
  params?: Record<string, any>;

  // ── 分支 ──
  branch?: {
    condition: Condition;
    thenSteps: ActionStep[];
    elseSteps?: ActionStep[];
  };

  // ── 循环 ──
  loop?: {
    type: "for_each" | "repeat" | "repeat_until";
    target?: TargetSelector;        // for_each 的遍历目标
    count?: number | "coin_heads";  // repeat 的次数
    condition?: Condition;           // repeat_until 的终止条件
    body: ActionStep[];
  };
}
```

---

## 十、动态值系统 (Dynamic Values)

很多卡牌的伤害/数量不是固定值，而是动态计算的。

```typescript
export type DynamicValue =
  | { type: "constant"; value: number }                    // 固定值: 120
  | { type: "per_unit"; base: number; per: number;         // 每 X 一个 Y: 20 × 能量数
      countSource: TargetSelector; countProperty: string }
  | { type: "coin_flip_count"; perHeads: number;           // 掷硬币: 每正面 30
      coinCount: number | "all_heads_stop" }
  | { type: "opponent_bench_count"; per: number }          // 按对手备战区数量
  | { type: "damage_on_self"; per: number }                // 按自身伤害标记
  | { type: "energy_on_target"; per: number }              // 按目标能量数
  | { type: "hand_count"; per: number; owner: OwnerType }  // 按手牌数
  | { type: "remaining_hp"; subtract_from: number }        // 剩余HP差值
  | { type: "formula"; expression: string };               // 自定义公式(兜底)
```

---

## 十一、胜负判定 (Win Conditions)

```typescript
export type WinCondition =
  | "prizes_taken"          // 拿完所有 6 张奖赏卡
  | "no_pokemon_in_play"    // 对手场上无宝可梦可替换
  | "deck_out"              // 对手牌库抽空时无法抽牌
  | "concede"               // 对手投降
  | "special";              // 特殊卡牌效果导致的胜利

// 胜负判定时机:
// 1. ATTACK_KO_CHECK → 击倒后检查
// 2. DRAW → 牌库空检查
// 3. ATTACK_PROMOTE → 无宝可梦可推检查
// 4. 任意时刻 → 投降
```

---

## 十二、总结 — 两维度交叉点

```
              流程维度 (大循环)
              ┌──────────────────────────────────────────┐
              │  SETUP → DRAW → MAIN → ATTACK → CHECKUP │
              │    ↑                              ↓      │
              │    └──────── TURN_END ←──────────┘      │
              └──────────────────────────────────────────┘
                         ↕ 交叉点 = TriggerType
              ┌──────────────────────────────────────────┐
              │  CardRuleDef                             │
              │  ├── triggers[] → 挂载到流程节点         │
              │  ├── conditions[] → 在节点上检查         │
              │  ├── steps[] → 在节点上执行              │
              │  └── modifiers[] → 跨节点持续生效        │
              └──────────────────────────────────────────┘
              卡牌维度 (小循环)
```

**核心思想：**
- 流程维度提供**时序骨架**（何时？）
- 卡牌维度提供**行为内容**（做什么？）
- `TriggerType` 是连接两个维度的**铰链**
- `Condition` 是控制是否执行的**门控**
- `ActionStep` 是实际执行的**原子指令**
- `Modifier` 是跨时间段的**持续状态**
