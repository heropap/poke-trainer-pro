# Poke-Trainer Pro

Pokemon TCG 对战模拟器 — 全环境覆盖的智能训练平台。基于现代规则引擎，支持 Standard 环境下所有主流卡组。

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)
![Tests](https://img.shields.io/badge/tests-1477%20passing-brightgreen)
![Cards](https://img.shields.io/badge/cards-6427-orange)
![Effects](https://img.shields.io/badge/card%20effects-200%2B-red)

## Features

### Core Game Engine
- **完整 PTCG 回合循环** — 8 阶段流转 (Setup / Mulligan / Draw / Main / Attack / Checkup / Between Turns / Game Over)
- **伤害计算系统** — 弱点 (x2) / 抵抗力 (-30) / 伤害修正器 / 工具减伤
- **击倒与奖赏卡** — 普通 1 张 / ex/V 2 张 / VMAX 3 张
- **三种胜利条件** — 奖赏卡取完 / 对方场上无宝可梦 / 对方无法抽牌 (Deck Out)
- **特殊状态** — 中毒 / 灼伤 / 睡眠 / 麻痹 / 混乱，回合间自动处理
- **先攻首回合限制** — 先攻方首回合不能攻击和使用 Supporter

### Card Effects (200+)
- **196 张卡牌效果实现** — 覆盖 Standard 环境主流卡组核心卡牌
- **VSTAR Power** — Charizard ex / Gardevoir ex / Giratina VSTAR 等，全局一次限制 + UI 指示器
- **ACE SPEC 训练师** — Prime Catcher / Hero's Cape / Master Ball 等高价值训练师
- **宝可梦特性 (Ability)** — Pidgeot ex Quick Search / Lumineon V Luminous Sign / Manaphy Wave Veil
- **特殊能量被动效果** — Double Turbo Energy (-20) / V Guard Energy (-30) / Reversal Energy
- **文本解析引擎 (Layer 3)** — 自动从卡牌文本生成攻击效果规则

### Battle UI
- **PTCG Live 风格界面** — 战斗区 / 备战区 / 手牌 / 牌组 / 弃牌堆 / 奖赏卡
- **开局宝可梦选择** — 手动选择战斗区 + 备战区宝可梦
- **KO 后替补选择** — 专用 PromotionModal 选择升级宝可梦
- **硬币翻转 3D 动画** — 先后攻选择
- **卡牌拖拽交互** — @dnd-kit 拖拽附能 / 进化 / 工具装备
- **回合切换 Banner** — 动画提示当前回合
- **对手手牌遮罩** — 隐藏对手手牌信息
- **奖赏卡翻开动画** — 击倒后取奖赏卡视觉反馈
- **游戏结算统计** — 回合数 / 击倒数 / 奖赏卡获取
- **移动端响应式** — 适配手机和平板
- **Framer Motion 动画** — 抽牌 / 打出 / 攻击 / 受击 / 击倒 / 进化

### AI Opponent
- **8 级优先级决策系统** — promote / play basic / evolve / attach energy / retreat / attack / end turn
- **可调速度** — 慢速 / 正常 / 快速 / 瞬时
- **Prompt 自动响应** — AI 自动处理选择卡牌 / 弃牌等交互

### Online Battle (Beta)
- **WebSocket 实时对战** — Socket.IO 房间管理 + 状态同步
- **断线重连** — 30 分钟 TTL + exponential backoff
- **回合计时器** — 90 秒限时 + 超时自动结束

### Deck Management
- **PTCG Live 格式导入** — 粘贴卡组代码自动解析
- **Standard 合规性验证** — 60 张检查 / 4 张限制 / 合法性标记
- **5 套预置卡组** — Charizard ex / Gardevoir ex / Lugia VSTAR / Miraidon ex / Lost Box
- **快速开始** — 无需手动导入，一键开始对战
- **LocalStorage 持久化** — 跨 session 保存

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 + React 19 |
| Language | TypeScript 5.x |
| Styling | Tailwind CSS 4 |
| Animation | Framer Motion |
| Drag & Drop | @dnd-kit |
| Testing | Jest (1477 tests, 69 suites) |
| Realtime | Socket.IO |
| Deployment | Docker + docker-compose |

## Quick Start

```bash
# Clone
git clone https://github.com/heropap/poke-trainer-pro.git
cd poke-trainer-pro

# Install
cd app && npm install

# Dev server
npm run dev
# Open http://localhost:3000

# Run tests
npx jest --passWithNoTests
```

## Project Structure

```
app/src/
  engine/               # Game engine core
    game-state.ts       # State types & factory functions
    game-controller.ts  # Action router (processAction)
    game-actions.ts     # Damage, KO, win conditions
    turn-actions.ts     # Energy, evolve, retreat, trainers
    battle-prepare.ts   # Mulligan, placement, prizes
    ai-player.ts        # AI decision system
    effects/            # Card effect framework
      cards/            # 200+ card effect implementations
  components/
    battle/board/       # Battle UI (BattleBoard, Hand, ActiveSpot, etc.)
    deck/               # Deck management (import, validation)
  data/cards/           # 6427 card database (JSON)
  lib/
    deck-parser.ts      # PTCG Live format parser
    ptcg-engine/        # ryuu-play reference engine
  services/
    deck-storage.ts     # LocalStorage persistence
  server/
    game-room.ts        # WebSocket game room
```

## Card Database

6427 cards across these sets:
- **Scarlet & Violet**: SVI, PAL, OBF, MEW, PAR, TEF, TWM, SFA, SCR, SSP, PRE, JTG
- **Sword & Shield**: SSH, RCL, DAA, VIV, BST, CRE, EVS, FST, BRS, ASR, LOR, SIT, CRZ
- **Special Sets**: CEL, SHF, CPA, PGO
- **Energy**: SVE

## Architecture

The project uses a **dual engine** architecture:

1. **Primary Engine** (`src/engine/`) — Controller + Handler pattern, powers all gameplay
2. **Reference Engine** (`src/lib/ptcg-engine/`) — Store + Reducer pattern from [ryuu-play](https://github.com/keeshii/ryuu-play), used for metadata reference
3. **Adapter** (`src/adapters/`) — Bridges the two engines' state representations

Card effects are loaded via a **dynamic registry** — only effects for cards in the current match are activated.

## Data Sources

| Source | Usage |
|--------|-------|
| [ryuu-play](https://github.com/keeshii/ryuu-play) | Rules engine reference, card set implementations |
| [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data) | Card static data, images, legality checks |

## Docker

```bash
docker-compose up --build
# http://localhost:3000
```

## License

MIT
