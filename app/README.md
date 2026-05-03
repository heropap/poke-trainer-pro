# app

Next.js 应用根目录。所有源码在 `src/`。

```bash
npm install
npm run dev          # 开发：http://localhost:3000
npm run build        # 构建
npm run start        # 跑构建产物
npm test             # Jest
npm run lint         # ESLint
```

健康检查端点：`/api/health` → `{ status: "ok", version, timestamp }`

项目级文档见仓库根目录的 [README.md](../README.md) 与 [spec.txt](../spec.txt)。
