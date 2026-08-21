# MCP 工具接口规范 (MCP Tools Specification)

本文档详细定义 `lingua-Antigravity` MCP Server 所暴露的 4 大核心工具协议、参数约束与返回契约。

---

## 1. 工具概览 (Tools Overview)

| 工具名称 | 模式 | 职责 |
| :--- | :--- | :--- |
| `task_progress` | 顺序执行 | 动态长任务进度状态机管理（支持分阶段工作项追加与状态查询）。 |
| `workspace_load` | 顺序执行 | 加载当前工程的只读快照、Contract、数据集摘要，并初始化 staging 目录。 |
| `workspace_script` | 顺序执行 | 在 Node.js 安全 VM 中执行模型编写的 JS 编排脚本，调用查询/聚类/匹配方法并暂存修改。 |
| `workspace_apply` | 顺序执行 | 在获得用户授权后，校验 `changes/` 下的修改并原子应用到工程数据源。 |

---

## 2. `task_progress`

### 参数定义 (Parameters Schema)
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["start", "advance", "read", "finish", "cancel"],
      "description": "执行的进度动作"
    },
    "tasks": {
      "type": "array",
      "items": { "type": "string" },
      "description": "start 时必须提供的初始工作项列表，如 ['discover:seed', 'discover:residual', 'finalize:changes']"
    },
    "add": {
      "type": "array",
      "items": { "type": "string" },
      "description": "advance 时可选追加的新派生工作项列表"
    }
  },
  "required": ["action"]
}
```

### 返回格式 (Return Schema)
```json
{
  "action": "advance",
  "status": "running",
  "current_step": "review:batch:0001",
  "pending_tasks": ["review:batch:0002", "discover:residual", "finalize:changes"],
  "completed_tasks": ["discover:seed", "review:batch:0001"],
  "total_completed": 2,
  "total_pending": 3
}
```

---

## 3. `workspace_load`

### 参数定义 (Parameters Schema)
无参数（自动绑定当前工作区上下文）。
```json
{
  "type": "object",
  "properties": {}
}
```

### 返回格式 (Return Schema)
```json
{
  "source_language": "ja",
  "target_language": "zh-CN",
  "counts": {
    "files": 12,
    "items": 1560,
    "items_with_warnings": 48,
    "glossary": 120,
    "text_preserve": 15,
    "pre_replacement": 4,
    "post_replacement": 2
  },
  "files": [
    { "file_path": "chapter_01.txt", "file_type": "plain_text" }
  ],
  "contract": {
    "limits": {
      "query_page_default": 50,
      "query_page_max": 200,
      "result_bytes": 65536
    },
    "datasets": {
      "items": { "path": "items/entries.jsonl" },
      "warnings": { "path": "items/warnings.jsonl" },
      "glossary": { "path": "glossary/entries.jsonl" },
      "text_preserve": { "path": "text_preserve/entries.jsonl" }
    },
    "changes": {
      "items": { "updates": "changes/items/updates.jsonl" },
      "glossary": {
        "creates": "changes/glossary/creates.jsonl",
        "updates": "changes/glossary/updates.jsonl",
        "deletes": "changes/glossary/deletes.jsonl"
      }
    }
  }
}
```

---

## 4. `workspace_script`

### 参数定义 (Parameters Schema)
```json
{
  "type": "object",
  "properties": {
    "script": {
      "type": "string",
      "description": "完整的 JavaScript 入口函数，格式必须为 async function main(workspace) { ... }，并返回小型 JSON 结果。"
    }
  },
  "required": ["script"]
}
```

### 沙箱 `workspace` SDK 接口规范
注入给 `main(workspace)` 的对象包含以下标准方法与属性：

#### 1. 属性
- `workspace.contract`: 当前工作区的只读完整 Contract 配置。

#### 2. 文件与数据集操作
- `workspace.readJson(relativePath: string): Promise<any>`: 读取指定只读数据集或 task/scratch 中的 JSON 文件。
- `workspace.writeJson(relativePath: string, data: any): Promise<void>`: 写入 task 或 scratch 中的 JSON 文件。
- `workspace.iterateJsonl<T>(relativePath: string): AsyncIterable<T>`: 流式异步迭代指定 JSONL 文件。
- `workspace.writeJsonl<T>(relativePath: string, rows: T[]): Promise<void>`: 写入 changes/、task/ 或 scratch/ 中的 JSONL 文件。

#### 3. 业务查询与聚类方法
- **`workspace.queryItems(options)`**:
  - `filters`: `{ item_ids?, statuses?, file_paths?, warning_types? }`
  - `search`: `{ keywords: string[], scope: "src" | "dst" | "all" }` (自动执行 NFKC 归一化)
  - `offset`, `limit`, `include_warnings`
  - 返回 `{ total_item_count, items, next_offset? }`
- **`workspace.queryItemContexts(options)`**:
  - `item_ids`: string[]
  - 返回指定条目在原文件上下文中的前后相邻条目。
- **`workspace.groupQualityRuleEntries(options)`**:
  - `kind`: `"glossary"` | `"text_preserve"`
  - `entries?`: 显式候选条目数组；省略时自动读取对应数据集。
  - `target_entry_ids?`: 限定目标条目。
  - 返回强连通组件与弱词根聚合后的结构审查组（每组最多 16 条）及跨组关系。
- **`workspace.deriveCommonLiteralRoots(options)`**:
  - `forms`: string[] (至少两个不同词形)
  - 返回最长公共词根候选列表 `{ candidates: [{ root, grapheme_length }] }`。
- **`workspace.matchLiterals(options)`**:
  - `patterns`: `{ name: string, src: string, case_sensitive?: boolean }[]`
  - 高性能扫描全量条目，返回实际命中总数、条目去重数与代表证据示例。

---

## 5. `workspace_apply`

### 参数定义 (Parameters Schema)
无参数（自动校验并提交当前 `changes/` 目录中的所有修改）。
```json
{
  "type": "object",
  "properties": {}
}
```

### 执行逻辑与返回格式 (Execution & Return)
1. 检查是否存在未提交的非空 change 文件。
2. 校验修改记录的字段合法性与引用存在性。
3. 执行前置备份生成 `.backup/<timestamp>/`。
4. 原子应用变更至各数据集文件，清理 `changes/` 与 `scratch/`。
5. 返回应用摘要：

```json
{
  "status": "applied",
  "updated_counts": {
    "items": 36,
    "glossary_creates": 5,
    "glossary_updates": 2,
    "glossary_deletes": 0
  },
  "timestamp": 1724239800000
}
```
若无任何修改，返回 `{ "status": "unchanged" }`。

---

## 6. `glossary_export`

### 职责
将当前工作区的术语表导出为与 LinguaGacha 100% 兼容的 JSON（4 空格缩进数组）或 Excel (.xlsx) 规则文件（格式完全参考 `露西.json` / `露西.xlsx` 范本）。

### 参数定义 (Parameters Schema)
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "导出目标文件路径（例如 'glossary.json' 或 'glossary.xlsx'）"
    },
    "format": {
      "type": "string",
      "enum": ["json", "xlsx", "jsonl"],
      "description": "导出格式（可选，默认根据文件扩展名自动判定）"
    }
  },
  "required": ["path"]
}
```

### 返回格式 (Return Schema)
```json
{
  "path": "./glossary.json",
  "count": 105
}
```

---

## 7. `glossary_import`

### 职责
从外部 LinguaGacha 导出的 `.json` 或 `.xlsx` 格式文件直接导入术语表到当前工作区，自动补全 5 字段标准契约（`src`, `dst`, `info`, `regex: false`, `case_sensitive: false`）。

### 参数定义 (Parameters Schema)
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "导入源文件路径（支持 .json 或 .xlsx）"
    }
  },
  "required": ["path"]
}
```

### 返回格式 (Return Schema)
```json
{
  "count": 105
}
```
