#!/usr/bin/env bash
# init.sh — v0 验证脚本：启动 dev server / 健康检查 / 跑测试 / 关闭 server
# 用法：bash init.sh

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT/app"
LOG_DIR="$ROOT/.init-logs"
mkdir -p "$LOG_DIR"

cd "$APP_DIR"

# ---- 安装依赖（首次运行才需要）-------------------------------------
if [ ! -d node_modules ]; then
  echo "[init] 首次运行，安装依赖..."
  npm install --no-audit --no-fund > "$LOG_DIR/npm-install.log" 2>&1
fi

# ---- 启动 dev server（后台）---------------------------------------
echo "[init] 启动 next dev (port 3000)..."
PORT=3000 npm run dev > "$LOG_DIR/dev-server.log" 2>&1 &
DEV_PID=$!

cleanup() {
  if kill -0 "$DEV_PID" 2>/dev/null; then
    echo "[init] 关闭 dev server (pid=$DEV_PID)"
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ---- 等待 server 就绪 ---------------------------------------------
echo "[init] 等待 /api/health 返回 200..."
HEALTH_OK=0
for i in $(seq 1 60); do
  if curl -fsS "http://localhost:3000/api/health" > "$LOG_DIR/health.json" 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" -ne 1 ]; then
  echo "[init] FAIL: dev server 未在 60s 内响应 /api/health"
  echo "[init] 最近 dev server 日志："
  tail -40 "$LOG_DIR/dev-server.log" || true
  exit 1
fi

echo "[init] 健康检查 OK：$(cat "$LOG_DIR/health.json")"

# ---- 跑测试 -------------------------------------------------------
echo "[init] 跑 jest..."
if ! npm test --silent > "$LOG_DIR/jest.log" 2>&1; then
  echo "[init] FAIL: 测试未通过"
  tail -60 "$LOG_DIR/jest.log" || true
  exit 1
fi

echo "[init] 测试通过"

# ---- 收尾 ---------------------------------------------------------
echo "[init] OK — dev server 启动 / 健康检查 / 测试 全部通过"
