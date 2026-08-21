import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { AgentTaskProgress } from "./task-progress.js";
import { DEFAULT_CONTRACT, WorkspaceManager } from "./workspace-dataset.js";
import { WorkspaceRunner } from "./workspace-runner.js";
import { WorkspaceApplier } from "./workspace-apply.js";

const server = new Server(
  {
    name: "linguagacha-tools",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const taskProgress = new AgentTaskProgress();
const workspaceManager = new WorkspaceManager();
const workspaceRunner = new WorkspaceRunner(workspaceManager, DEFAULT_CONTRACT);
const workspaceApplier = new WorkspaceApplier(workspaceManager, DEFAULT_CONTRACT);

// 注册可用的工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "task_progress",
        description:
          "管理当前对话的动态工作队列（长任务进度状态机）。支持 start（初始登记）、advance（推进并可原子追加新项）、read（读取当前进度）、finish（核验并结束）、cancel（取消）。",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["start", "advance", "read", "finish", "cancel"],
              description: "执行的进度动作",
            },
            tasks: {
              type: "array",
              items: { type: "string" },
              description: "start 时必须提供的初始工作项列表",
            },
            add: {
              type: "array",
              items: { type: "string" },
              description: "advance 时可选追加的新派生工作项列表",
            },
          },
          required: ["action"],
        },
      },
      {
        name: "workspace_load",
        description:
          "加载当前工程的完整只读快照、空 change 文件与 scratch 目录，并挂载当前 Agent 对话跨快照保留的 task 目录；返回语言和数量摘要与 Contract。",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "workspace_script",
        description:
          "运行模型提供的完整 JavaScript 入口函数 async function main(workspace) { ... } 并返回 JSON 结果。脚本可调用 queryItems、matchLiterals、groupQualityRuleEntries、deriveCommonLiteralRoots 等只读查询方法，也可将修改写入 changes/ 覆盖层或自由管理 task/、scratch/ 内容。",
        inputSchema: {
          type: "object",
          properties: {
            script: {
              type: "string",
              description: "完整 JavaScript 入口函数源码，必须以 async function main(workspace) { ... } 声明并返回 JSON 结果。",
            },
          },
          required: ["script"],
        },
      },
      {
        name: "workspace_apply",
        description:
          "在当前具体差异或确定规则已经获得用户授权后，校验 changes/ 中的非空变更文件并原子应用到工程数据源；无变化不会写入，若中途失败自动秒级回滚。执行期间不可停止。",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "glossary_export",
        description:
          "将当前工作区的术语表导出为与 LinguaGacha 100% 兼容的 JSON（4空格缩进数组）或 Excel (.xlsx) 规则文件（参考 露西.json / 露西.xlsx 范本）。",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "导出目标文件路径（例如 'glossary.json' 或 'glossary.xlsx'）",
            },
            format: {
              type: "string",
              enum: ["json", "xlsx", "jsonl"],
              description: "导出格式（默认根据文件扩展名自动判定）",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "glossary_import",
        description:
          "从外部 LinguaGacha 导出的 .json 或 .xlsx 格式文件导入术语表到当前工作区。",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "导入源文件路径（支持 .json 或 .xlsx）",
            },
          },
          required: ["path"],
        },
      },
    ],
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "task_progress": {
        const action = args["action"] as string;
        let result: any;
        if (action === "start") {
          result = taskProgress.start((args["tasks"] as string[]) ?? []);
        } else if (action === "advance") {
          result = taskProgress.advance({ add: args["add"] as string[] });
        } else if (action === "read") {
          result = taskProgress.read();
        } else if (action === "finish") {
          result = taskProgress.finish();
        } else if (action === "cancel") {
          result = taskProgress.cancel();
        } else {
          throw new Error(`Unknown task_progress action: ${action}`);
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "workspace_load": {
        await workspaceManager.initializeWorkspace();
        const meta = await workspaceManager.loadProjectMeta();
        const result = {
          ...meta,
          contract: DEFAULT_CONTRACT,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "workspace_script": {
        const scriptCode = args["script"] as string;
        const result = await workspaceRunner.runScript(scriptCode);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "workspace_apply": {
        const result = await workspaceApplier.apply();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "glossary_export": {
        const targetPath = args["path"] as string;
        const format = args["format"] as "json" | "xlsx" | "jsonl" | undefined;
        if (!targetPath) {
          throw new Error("glossary_export requires 'path' parameter");
        }
        const result = await workspaceManager.exportGlossary(targetPath, { format });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "glossary_import": {
        const sourcePath = args["path"] as string;
        if (!sourcePath) {
          throw new Error("glossary_import requires 'path' parameter");
        }
        const result = await workspaceManager.importGlossary(sourcePath);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error.message || String(error) }) }],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Failed to start LinguaGacha MCP Server:", err);
  process.exit(1);
});
