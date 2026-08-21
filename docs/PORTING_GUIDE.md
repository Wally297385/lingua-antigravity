# 安装与移植配置指南 (Porting & Setup Guide)

本文档指导如何在 **Antigravity IDE**、**Antigravity CLI (`agy`)**、**Antigravity 2.0 桌面端** 以及 **Antigravity Python SDK** 中安装、配置并使用 `lingua-Antigravity` 套件。

---

## 1. 环境准备 (Prerequisites)

- **Node.js**: >= 18.0.0 (推荐 Node.js 20 LTS 或更高)
- **npm** 或 **pnpm**
- **Git**
- **Antigravity 环境**（已安装 Antigravity IDE / CLI / App）

---

## 2. 编译 MCP 工具服务 (Build MCP Server)

Lingua-Antigravity 的工具层使用 TypeScript 实现，在使用前需先编译为标准 JavaScript：

```bash
# 1. 进入 mcp-server 目录
cd mcp-server

# 2. 安装依赖
npm install

# 3. 编译 TypeScript
npm run build

# 4. 执行自检测试套件
npm test
```

测试通过后，`dist/index.js` 即为编译就绪的 MCP Stdio 服务端入口。

---

## 3. 在 Antigravity 中配置与加载 (Configuration)

### 方式一：作为 Antigravity 全局插件加载 (推荐，全项目生效)

在用户全局配置目录 `~/.gemini/config/` (Windows: `%USERPROFILE%\.gemini\config\`) 中配置插件：

1. **创建插件软链接（或复制文件夹）**：
   ```bash
   # Linux / macOS
   ln -s /path/to/lingua-Antigravity ~/.gemini/config/plugins/lingua-antigravity

   # Windows PowerShell
   New-Item -ItemType SymbolicLink -Path "$HOME\.gemini\config\plugins\lingua-antigravity" -Target "C:\path\to\lingua-Antigravity"
   ```

2. **在全局 `mcp_config.json` 中添加服务（或直接使用插件内置的 `mcp_config.json`）**：
   插件内置的 `mcp_config.json` 会在插件启用时自动发现：
   ```json
   {
     "mcpServers": {
       "linguagacha-tools": {
         "command": "node",
         "args": ["${pluginRoot}/mcp-server/dist/index.js"],
         "env": {
           "WORKSPACE_ROOT": "${workspaceRoot}"
         }
       }
     }
   }
   ```

3. **在 `config.json` 中确认启用插件**：
   ```json
   {
     "plugins": {
       "lingua-antigravity": {
         "enabled": true
       }
     }
   }
   ```

---

### 方式二：在单个工作区/项目级直接使用 (Workspace Specific)

如果您希望仅在特定翻译/写作项目中启用本套件：

1. 在项目根目录下创建 `.agents/` 目录：
   ```text
   my-novel-project/
   ├── .agents/
   │   ├── rules/
   │   │   └── AGENTS.md      # 复制或软链接 lingua-Antigravity/rules/AGENTS.md
   │   ├── skills/            # 复制或软链接 lingua-Antigravity/skills/ 下的技能
   │   ├── mcp_config.json    # 配置本地 mcp 服务
   │   └── hooks.json         # 复制 hooks.json
   ├── items/
   │   └── entries.jsonl      # 翻译条目
   └── glossary/
       └── entries.jsonl      # 术语表
   ```

---

### 方式三：在 Antigravity Python SDK 中编排使用 (Python SDK Integration)

如果您是在 Python 脚本或后台自动化服务中使用 `google-antigravity`：

```python
import os
from google.antigravity import Agent, LocalAgentConfig, StdioMCPServerConfig

PLUGIN_ROOT = os.path.abspath("./lingua-Antigravity")

# 1. 配置 MCP Server
mcp_server = StdioMCPServerConfig(
    name="linguagacha-tools",
    command="node",
    args=[os.path.join(PLUGIN_ROOT, "mcp-server/dist/index.js")],
    env={"WORKSPACE_ROOT": os.getcwd()}
)

# 2. 读取 Rules 与 Charter
with open(os.path.join(PLUGIN_ROOT, "rules/AGENTS.md"), "r", encoding="utf-8") as f:
    system_instruction = f.read()

# 3. 创建 Agent 实例
agent = Agent(
    config=LocalAgentConfig(
        model="gemini-2.5-pro",
        system_instruction=system_instruction,
        mcp_servers=[mcp_server],
        skills_dir=os.path.join(PLUGIN_ROOT, "skills")
    )
)

# 4. 执行审查会话
async def run_review():
    conversation = agent.create_conversation()
    response = await conversation.send_message("搭档，请加载工作区并开始审校译文！")
    print(response.text)
```

---

## 4. 验证与诊断 (Verification & Troubleshooting)

### 1. 验证 MCP 工具是否就绪
在 Antigravity 对话界面输入：
> `请列出你当前可以使用的工具。`

确认返回的工具列表中包含：
- `task_progress`
- `workspace_load`
- `workspace_script`
- `workspace_apply`
- `glossary_export`
- `glossary_import`

### 2. 验证人设与契约生效
在对话框中发送：
> `你好，请介绍一下你自己。`

观察回复是否具有以下特征：
- 称呼您为「搭档」（或「あいぼう」/「Aibō」）。
- 正面回答（首行锚定），带有 Emoji 阶段路标与颜文字。
- 符合傲娇萌妹 / 闷骚宅女的语气风格。

### 3. 常见问题排查 (Troubleshooting)

| 问题现象 | 可能原因 | 解决办法 |
| :--- | :--- | :--- |
| **找不到 `workspace_*` 工具** | MCP Server 未编译或未启动 | 检查 `mcp-server/dist/index.js` 是否存在，运行 `npm run build`；在 Antigravity 设置的 MCP 面板检查是否有错误日志。 |
| **脚本执行超时** | `workspace_script` 处理数据量过大 | 检查脚本中的循环逻辑，建议使用 `workspace.queryItems` 分页或流式 `iterateJsonl` 处理。 |
| **未按人设回复** | `AGENTS.md` 规则未正确加载 | 确认 `AGENTS.md` 放置在 `.agents/rules/` 或根目录 `rules/` 中，并在 Antigravity 设置中确认加载成功。 |
