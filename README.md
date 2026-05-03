# Pokemon TCG · v0

> 桌面浏览器版 Pokemon TCG 单人 PvE 体验。从中国区域官方发布的三套大师卡组开始，
> UI 视觉与交互参考 PTCG Live。

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![Status](https://img.shields.io/badge/v0-tabula%20rasa-orange)

## 当前状态

**v0 开发中**。项目刚完成完全重置（tabula rasa）。详见 [spec.txt](./spec.txt) 与
[feature_list.json](./feature_list.json)。

上一轮（40 个 session）的全部产出在 [`archive/legacy-2026-05-03/`](./archive/)
目录下，仅作参考资料，不导入也不构建。

## 三套首发卡组

1. 喷火龙 ex 大师卡组（Stage 2 进化 + 火属性 ramp）
2. 密勒顿 ex 大师卡组（基础 ex swarm + 雷能量加速）
3. 沙奈朵 ex 大师卡组（Stage 2 进化 + 弃牌区超能量回挂）

## Quick Start

```bash
# 安装
cd app && npm install

# 起 dev server
npm run dev
# 访问 http://localhost:3000

# 跑测试
npm test

# 完整端到端验证（启动 / 健康检查 / 测试 / 关闭）
cd .. && bash init.sh
```

## 技术栈

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| State (game) | useReducer (pure reducer) |
| State (UI) | Zustand |
| Drag & Drop | @dnd-kit/core |
| Animation | framer-motion |
| Testing | Jest + RTL |
| Deploy | Vercel / Docker |

## 项目结构（v0 目标）

```
app/src/
  app/                    Next.js routes
  core/                   引擎纯 TS 层
    types.ts / cards.ts / decks.ts
    reducer.ts / actions.ts / phases.ts / prompts.ts
    effects/charizard-ex/ | miraidon-ex/ | gardevoir-ex/
    ai/policy.ts
  ui/
    battle/{GameCanvas, Tableau, zones, cards, prompts, fx, overlay}
    home/{DeckPicker, HeroBanner}
  store/battleUi.ts       Zustand
  styles/globals.css
public/card-art/          v0 三套卡组的本地卡图
```

完整结构与开发命令见 [spec.txt](./spec.txt)。

## 开发工作流

每个 session 严格只完成一个 feature（priority 最小且 `passes: false` 的那条）。
工作流细节在 [CLAUDE.md](./CLAUDE.md)。

## License

MIT
