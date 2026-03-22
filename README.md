# Poke-Trainer Pro

Pokemon TCG (宝可梦集换式卡牌游戏) 全功能对战模拟器，基于 ryuu-play 引擎架构，支持 Standard 环境全卡牌对战。

## 功能特性

- **完整对战系统** — 回合流转、攻击/进化/撤退/附能、特殊状态（毒/烧/睡/麻/乱）、弱点/抵抗力计算
- **胜负判定** — 奖励卡耗尽、牌库抽干、场上无宝可梦三种胜负条件
- **卡牌效果框架** — 动态效果加载，150+ 张卡牌效果实现（攻击、特性、训练师、球场）
- **Marker 系统** — 卡牌标记/计数器支持
- **卡组导入** — 支持 PTCG Live 格式一键导入，自动 Standard 合规检查
- **AI 对手** — 基于启发式评估的 SimpleBot，支持 ex 环境调优
- **实时对战** — WebSocket 通信，断线重连 + 状态恢复
- **回合计时器** — 90 秒限时，超时自动结束
- **对战 UI** — Canvas/SVG 卡牌渲染、拖拽交互、动作日志侧边栏
- **移动端适配** — 响应式布局，手机/平板可用
- **卡牌动画** — Framer Motion 驱动（抽牌/打出/攻击/受击/击倒/进化）
- **Docker 部署** — 多阶段构建，健康检查，环境变量配置

## 技术栈

| 模块 | 技术 |
|------|------|
| 框架 | Next.js 16 + TypeScript |
| UI | React 19 + Tailwind CSS 4 |
| 动画 | Framer Motion |
| 拖拽 | @dnd-kit |
| 实时通信 | Socket.IO |
| 规则引擎 | 自研引擎 (基于 ryuu-play 架构) |
| 测试 | Jest (59 suites, 1352 tests) |
| 部署 | Docker + docker-compose |

## 项目结构

```
app/src/
├── adapters/        # ryuu-play State ↔ UI GameState 桥接
├── app/             # Next.js App Router 页面
├── components/      # React UI 组件（对战界面、卡牌展示、日志等）
├── data/            # Pokemon TCG 静态数据 (JSON)
├── engine/          # 游戏引擎核心
│   ├── effects/     # 卡牌效果系统（攻击、训练师、球场、状态）
│   ├── llm/         # LLM 辅助规则生成
│   └── ...          # 状态管理、动作系统、回合流转
├── hooks/           # React Hooks
├── lib/
│   ├── ptcg-engine/ # ryuu-play 引擎移植
│   └── ptcg-sets/   # 卡牌集实现 (Base, Fossil, Jungle, EX, Standard)
├── server/          # WebSocket 服务器
├── services/        # 业务服务层
└── types/           # TypeScript 类型定义
```

## 快速开始

### 环境要求

- Node.js 20+
- npm / yarn / pnpm

### 安装与运行

```bash
cd app
npm install
npm run dev
```

开发服务器启动后访问 http://localhost:3000

### 运行测试

```bash
cd app
npm test
```

### 构建生产版本

```bash
cd app
npm run build
npm start
```

### Docker 部署

```bash
docker-compose up -d
```

## 架构说明

项目采用 **双引擎** 架构：

1. **自研引擎** (`src/engine/`) — controller + handler 模式，处理游戏逻辑和卡牌效果
2. **ryuu-play 引擎** (`src/lib/ptcg-engine/`) — store + reducer 模式，来自 keeshii/ryuu-play 开源项目
3. **适配层** (`src/adapters/`) — 桥接两套引擎的状态表示，统一为 UI 可消费的 GameState

卡牌效果通过 **动态注册表** 按需加载，仅加载对局涉及的卡牌逻辑，避免内存浪费。

## 数据来源

| 来源 | 用途 |
|------|------|
| [ryuu-play](https://github.com/keeshii/ryuu-play) | 规则引擎参考，卡牌集实现 |
| [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data) | 卡牌静态数据、图片、合规检查 |
| [tcgone-engine-contrib](https://github.com/axpendix/tcgone-engine-contrib) | 卡牌效果逻辑参考 |

## License

MIT
