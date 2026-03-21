# OpenClaw ↔ Claude Code 决策协议

## 通信流程

```
OpenClaw(飞书) → 写 JSON 到 decisions/pending/ → 调用 Claude Code → Claude Code 分析代码库 → 写结果到 decisions/completed/ → OpenClaw 读取结果 → 回复飞书
```

## 目录结构

```
decisions/
├── pending/          # OpenClaw 写入的待决策请求
├── completed/        # Claude Code 写入的决策结果
├── templates/        # 请求模板
└── PROTOCOL.md       # 本文件
```

## 决策请求格式 (pending/)

文件名: `{timestamp}-{type}-{short-id}.json`

```json
{
  "id": "20260309-arch-001",
  "type": "architecture | priority | bug-analysis | tech-choice | refactor | general",
  "title": "简短标题",
  "context": "背景信息，OpenClaw 收集到的相关资料、用户需求等",
  "options": ["选项A", "选项B"],
  "constraints": ["约束条件"],
  "urgency": "high | medium | low",
  "created_at": "ISO timestamp"
}
```

## 决策响应格式 (completed/)

文件名: 与请求同名

```json
{
  "id": "20260309-arch-001",
  "decision": "选择的方案",
  "reasoning": "为什么这样选",
  "action_items": ["具体要做的事"],
  "risks": ["风险点"],
  "decided_at": "ISO timestamp"
}
```

## 决策类型说明

| type | 场景 | Claude Code 做什么 |
|------|------|-------------------|
| architecture | 技术架构方向 | 分析代码库现状，评估方案可行性 |
| priority | 功能优先级/取舍 | 结合 feature_list.json 和代码复杂度评估 |
| bug-analysis | 复杂 bug 根因 | 搜索代码，定位根因，给修复方案 |
| tech-choice | 技术选型 | 评估兼容性、性能、维护成本 |
| refactor | 重构策略 | 分析现有代码质量，给重构路径 |
| general | 其他 | 通用分析 |

## OpenClaw 调用方式

```bash
# 写入决策请求后，调用 Claude Code 处理
bash pty:true workdir:~/projects/pokemon command:"claude -p '读取 decisions/pending/ 中最新的决策请求，分析代码库后给出决策，写入 decisions/completed/' --permission-mode acceptEdits --max-turns 15"
```
