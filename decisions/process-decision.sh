#!/bin/bash
# 决策处理脚本 - OpenClaw 调用此脚本触发 Claude Code 进行决策分析
# 用法: ./decisions/process-decision.sh [决策请求文件路径]
# 或者: ./decisions/process-decision.sh (自动处理最新的 pending 请求)

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PENDING_DIR="$PROJECT_DIR/decisions/pending"
COMPLETED_DIR="$PROJECT_DIR/decisions/completed"

# 确定要处理的请求文件
if [ -n "$1" ]; then
    REQUEST_FILE="$1"
else
    REQUEST_FILE=$(ls -t "$PENDING_DIR"/*.json 2>/dev/null | head -1)
fi

if [ -z "$REQUEST_FILE" ] || [ ! -f "$REQUEST_FILE" ]; then
    echo "ERROR: 没有找到待处理的决策请求"
    echo "目录: $PENDING_DIR"
    exit 1
fi

REQUEST_NAME=$(basename "$REQUEST_FILE")
echo "=== 处理决策请求: $REQUEST_NAME ==="
echo "请求内容:"
cat "$REQUEST_FILE"
echo ""
echo "=== 调用 Claude Code 分析 ==="

claude -p "
你收到了一个决策请求。请执行以下步骤：

1. 读取决策请求文件: $REQUEST_FILE
2. 理解决策问题和上下文
3. 搜索代码库中所有相关代码，充分了解现状
4. 基于代码库实际情况做出决策
5. 将决策结果写入: $COMPLETED_DIR/$REQUEST_NAME

决策结果必须是以下 JSON 格式:
{
  \"id\": \"与请求中的 id 相同\",
  \"decision\": \"你做出的决策\",
  \"reasoning\": \"基于代码库分析的决策理由\",
  \"action_items\": [\"具体的下一步行动\"],
  \"risks\": [\"需要注意的风险\"],
  \"code_references\": [\"相关代码文件路径\"],
  \"decided_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}

重要：你有完整的代码库访问权限。不要猜测，搜索代码后再做决策。
" --permission-mode acceptEdits --allowedTools 'Read,Grep,Glob,Write' --max-turns 20

# 检查是否生成了决策结果
if [ -f "$COMPLETED_DIR/$REQUEST_NAME" ]; then
    echo ""
    echo "=== 决策完成 ==="
    cat "$COMPLETED_DIR/$REQUEST_NAME"

    # 将已处理的请求从 pending 移走（保留在 pending 但添加 .done 后缀）
    mv "$REQUEST_FILE" "${REQUEST_FILE}.done"
    echo ""
    echo "请求已标记完成: ${REQUEST_NAME}.done"
else
    echo ""
    echo "WARNING: Claude Code 未生成决策结果文件"
    echo "请检查 $COMPLETED_DIR/"
    exit 1
fi
