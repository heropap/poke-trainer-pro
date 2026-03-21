#!/bin/bash
# 提交决策请求 - OpenClaw 用此脚本快速创建决策请求并触发处理
# 用法: ./decisions/submit-decision.sh <type> <title> <context> [urgency]
# 示例: ./decisions/submit-decision.sh architecture "是否引入Redis缓存" "当前游戏状态存内存，多人时会有问题" high

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PENDING_DIR="$PROJECT_DIR/decisions/pending"

TYPE="${1:-general}"
TITLE="${2:-未命名决策}"
CONTEXT="${3:-无额外上下文}"
URGENCY="${4:-medium}"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ID="$(date +%Y%m%d)-${TYPE}-$(printf '%03d' $((RANDOM % 1000)))"
FILENAME="${TIMESTAMP}-${TYPE}.json"

cat > "$PENDING_DIR/$FILENAME" << EOF
{
  "id": "$ID",
  "type": "$TYPE",
  "title": "$TITLE",
  "context": "$CONTEXT",
  "urgency": "$URGENCY",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "决策请求已创建: $PENDING_DIR/$FILENAME"
echo ""

# 自动调用处理脚本
exec "$PROJECT_DIR/decisions/process-decision.sh" "$PENDING_DIR/$FILENAME"
