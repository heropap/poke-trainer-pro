---
description: "决策路由技能。当你遇到需要技术决策的问题时，自动将决策请求发送给 Claude Code 处理，然后把结果告知用户。"
---

# Decision Router Skill

你是项目经理，Claude Code 是你的技术顾问。遇到以下类型的决策时，不要自己做，交给 Claude Code：

- 技术架构决策（用什么技术、怎么设计）
- 功能优先级和取舍
- 复杂 bug 的根因分析和修复方案
- 重构策略
- 代码质量评估

## 工作流程

### Step 1: 构造决策请求

根据当前问题，构造 JSON 请求文件。

```bash
bash pty:true workdir:$PROJECT_DIR command:"cat > decisions/pending/$(date +%Y%m%d-%H%M%S)-$TYPE.json << 'DECISION_EOF'
{
  \"id\": \"$(date +%Y%m%d)-$TYPE-$(printf '%03d' $((RANDOM % 1000)))\",
  \"type\": \"$TYPE\",
  \"title\": \"$TITLE\",
  \"context\": \"$CONTEXT\",
  \"options\": [$OPTIONS],
  \"constraints\": [$CONSTRAINTS],
  \"urgency\": \"$URGENCY\",
  \"created_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}
DECISION_EOF"
```

type 取值：
- `architecture` — 技术架构方向
- `priority` — 功能优先级/取舍
- `bug-analysis` — 复杂 bug 根因分析
- `tech-choice` — 技术选型
- `refactor` — 重构策略
- `general` — 其他

### Step 2: 调用 Claude Code 分析

```bash
bash pty:true workdir:$PROJECT_DIR command:"claude -p '
你收到了一个决策请求。

1. 读取 decisions/pending/ 目录中最新的 .json 文件
2. 理解决策问题
3. 搜索和分析代码库中相关的代码
4. 做出决策
5. 将决策结果以 JSON 格式写入 decisions/completed/ 目录（文件名与请求相同）

决策结果格式：
{
  \"id\": \"与请求相同\",
  \"decision\": \"你的决策\",
  \"reasoning\": \"决策理由\",
  \"action_items\": [\"具体行动步骤\"],
  \"risks\": [\"风险点\"],
  \"decided_at\": \"当前时间\"
}

注意：你有完整的代码库访问权限，充分利用它来分析和决策。
' --permission-mode acceptEdits --allowedTools 'Read,Grep,Glob,Write,Bash(ls)' --max-turns 20"
```

### Step 3: 读取决策结果

```bash
bash pty:true workdir:$PROJECT_DIR command:"cat decisions/completed/$(ls -t decisions/completed/ | head -1)"
```

### Step 4: 回复用户

将决策结果翻译成用户能理解的语言，在飞书中回复。包含：
- 决策结论（一句话）
- 理由（简洁版）
- 下一步行动

## 自主判断规则

**必须路由给 Claude Code 的：**
- 涉及代码库结构的任何决策
- 技术选型（需要检查兼容性）
- Bug 分析（需要读代码）
- 重构方案（需要评估影响面）

**可以自己决定的：**
- 纯产品层面的优先级（不涉及技术复杂度）
- 文档格式、命名等非关键事项
- 用户已经给出明确指令的执行性任务

## 紧急情况处理

如果 Claude Code 调用失败（进程挂了、超时等）：
1. 重试一次
2. 如果还失败，在飞书告知用户："Claude Code 当前不可用，我先记录了决策请求，稍后再处理"
3. 将请求保留在 decisions/pending/ 中，不要删除

## 项目路径

项目目录：根据实际部署路径设置 $PROJECT_DIR
decisions 目录：$PROJECT_DIR/decisions/
