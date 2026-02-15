# 长时间自动化开发工作流

> 基于 Anthropic《Effective Harnesses for Long-Running Agents》方法论
> 每个 session 只实现一个功能，通过文件状态在 session 间传递上下文

## 自动模式检测

当用户说「开始构建」「继续开发」「实现下一个功能」或类似指令时，按以下逻辑判断模式：

- 如果 `feature_list.json` **不存在** → 执行【初始化模式】
- 如果 `feature_list.json` **存在** → 执行【编码模式】

---

## 初始化模式

**当 feature_list.json 不存在时执行。**

### 步骤

1. **读取 `spec.txt`**
   - 解析出：项目名称、项目描述、技术栈、开发环境配置、测试命令、功能清单

2. **生成 `feature_list.json`**
   - 将 spec.txt 中的功能清单转为 JSON 数组
   - 每个功能的结构：
     ```json
     {
       "category": "functional",
       "description": "功能描述",
       "steps": ["步骤1", "步骤2", "步骤3"],
       "passes": false,
       "priority": 0
     }
     ```
   - 所有功能的 `passes` 初始为 `false`
   - `priority` 数字越小越优先

3. **创建项目骨架**
   - 根据 spec.txt 中的技术栈，初始化项目（如 `npx create-next-app`、`pip init` 等）
   - 安装核心依赖
   - 创建标准目录结构
   - 确保有一个最基础的可运行应用（能响应 HTTP 请求）

4. **生成 `init.sh`**
   - 可执行脚本，功能：
     - 在后台启动开发服务器
     - 等待服务器就绪（健康检查）
     - 运行测试套件
     - 关闭开发服务器
     - 报告结果
   - 执行 `chmod +x init.sh`

5. **创建 `claude-progress.txt`**
   - 写入首条记录：
     ```
     === Session init | <时间戳> ===
     Feature: 项目初始化
     Status: completed
     Notes: 搭建了项目骨架，生成了 feature_list.json、init.sh、claude-progress.txt
     ```

6. **Git 初始化**
   ```
   git init
   git add -A
   git commit -m "init: 项目初始化 - 骨架搭建"
   ```

7. **自动进入编码模式**，实现第一个功能（优先级最高的）

---

## 编码模式（7 步工作流）

**当 feature_list.json 存在时执行。每次 session 严格只实现一个功能。**

### Step 1: 定位 (ORIENT)
```bash
pwd
git log --oneline -10
```
读取 `claude-progress.txt` 了解之前的工作

### Step 2: 恢复上下文 (RECOVER CONTEXT)
根据 git log 和进度文件，理清：
- 哪些功能已完成
- 代码库当前状态
- 上个 session 是否留下了问题

### Step 3: 选择任务 (SELECT TASK)
读取 `feature_list.json`：
- 找到 `priority` 最小且 `passes` 为 `false` 的功能
- 这就是本 session 的**唯一任务**
- 如果所有功能都 `passes: true`，报告：所有功能已完成

### Step 4: 验证基线 (VERIFY BASELINE)
运行 `bash init.sh` 或等价操作：
- 启动开发服务器，验证能正常响应
- 运行现有测试
- **如果测试失败 → 先修复，再做新功能**
- **如果服务器启不动 → 先修复**
- 绝不在一个破损的基础上构建新东西

### Step 5: 实现 (IMPLEMENT)
- 按照 feature_list.json 中该功能的 `steps` 逐步实现
- 为新功能编写测试
- 只修改与该功能相关的代码，不碰无关部分

### Step 6: 验证 (VERIFY)
- 运行全部测试，确保新旧测试**全部通过**
- 启动开发服务器，验证功能可用
- 如果测试失败，修复后再继续

### Step 7: 产出物 (ARTIFACT)
完成后，按顺序执行以下三件事：

**a) 更新 feature_list.json**
将完成的功能的 `passes` 改为 `true`。**只改这一个字段。**

**b) Git 提交**
```bash
git add -A
git commit -m "feat: <简洁描述实现了什么>"
```

**c) 追加 claude-progress.txt**
```
=== Session <N> | <时间戳> ===
Feature: <功能描述>
Status: completed
Notes: <做了什么，有哪些关键决策>
```

---

## 硬性约束（必须遵守）

1. **每个 session 只做一个功能**
   只选择一个 priority 最高的未完成功能来实现。不要试图同时做多个。

2. **不可删除或修改已有测试**
   已有的测试代码不能删除、不能修改。只能新增测试。
   因为修改已有测试可能掩盖 bug。

3. **feature_list.json 只能改 passes 字段**
   不能修改 description、steps、priority、category。
   不能添加或删除功能条目。

4. **基线失败时先修复**
   如果 Step 4 的基线验证发现问题（测试失败、服务器启不动），
   必须先修复问题，然后再开始新功能的开发。
   在 claude-progress.txt 中记录修复了什么。

5. **功能未完成时不要标记完成**
   如果无法完成某个功能：
   - 提交已有的进度
   - 在 claude-progress.txt 中记录尝试了什么、还差什么
   - 保持 feature_list.json 中 `passes` 为 `false`

6. **保持干净状态**
   每次 session 结束时，代码库应该处于可工作状态：
   - 开发服务器能启动
   - 所有测试通过
   - 无未提交的变更

---

## 核心状态文件说明

### feature_list.json
```json
[
  {
    "category": "infrastructure",
    "description": "项目基础架构搭建",
    "steps": ["初始化项目", "安装依赖", "创建布局"],
    "passes": true,
    "priority": 0
  },
  {
    "category": "functional",
    "description": "用户认证功能",
    "steps": ["配置 Auth", "创建登录页"],
    "passes": false,
    "priority": 1
  }
]
```
- `passes: true` = 已完成
- `passes: false` = 未完成
- 按 `priority` 升序执行（0 最先）

### claude-progress.txt
```
=== Session init | 2026-02-14 10:00:00 ===
Feature: 项目初始化
Status: completed
Notes: 搭建了 Next.js + TypeScript 项目

=== Session 1 | 2026-02-14 10:30:00 ===
Feature: 用户认证功能
Status: completed
Notes: 使用 NextAuth.js 实现了登录/注册
```
- 每个 session 追加一条记录
- 新 session 启动时读取此文件恢复上下文

### init.sh
- 自动生成的可执行脚本
- 启动开发服务器 → 健康检查 → 运行测试 → 关闭服务器
