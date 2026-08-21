---
name: quality-rule-create
description: 当需要通过扫描当前工程发现新术语、专有名词、重复格式、控制结构或样式模式，并为它们建立术语表或文本保护规则时使用；提取的术语表严格遵循 LinguaGacha 5 字段规范（参考露西.json/露西.xlsx）。
---

# 质量规则创建

以 `@skill(quality-rule-workflow)` 为必读工作流。

## 入口行为与格式契约

1. 确定本次创建允许的种类（`glossary`, `text_preserve`）和目标范围。
2. 提取或创建术语规则时，必须遵循 LinguaGacha 标准五字段格式（参考 `露西.json` / `露西.xlsx` 范本）：
   - `src`: 原文
   - `dst`: 译文
   - `info`: 注释说明（包含角色性别/实体类型/所属/消歧条件，不可缺失）
   - `regex`: 固定为 `false`
   - `case_sensitive`: 默认为 `false`
3. 调用 `quality-rule-workflow` 的共享工作流：
   - 模式设为 `mode: create`。
   - 读取工程快照，根据初始目标或全工程抽样生成 seed probes。
   - 逐组核验候选对象并收集派生事实。
   - 经历收敛判定后生成拟创建条目的 JSONL changes（写入 `changes/glossary/creates.jsonl`）。
   - 获得搭档明确授权后，调用 `workspace_apply` 提交新建规则。
   - 可通过 `workspace.exportGlossary(...)` 或 `glossary_export` 工具直接导出为可供 LinguaGacha 直接导入的 `.json` 或 `.xlsx` 文件。
