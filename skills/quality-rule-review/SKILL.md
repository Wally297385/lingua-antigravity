---
name: quality-rule-review
description: 当需要对当前工程中已有的术语表、文本保护规则进行系统审查、冲突检测、冗余合并、范围收窄或错误清理时使用；支持指定具体规则、错误线索或全量规则体检。
---

# 质量规则审查

以 `@skill(quality-rule-workflow)` 为必读工作流。

## 入口行为

1. 确定本次审查允许的种类（`glossary`, `text_preserve`）和目标已存在规则范围。
2. 调用 `quality-rule-workflow` 的共享工作流：
   - 模式设为 `mode: review`。
   - 读取工程快照，枚举现有规则生成 initial existing facts。
   - 执行结构聚类（`workspace.groupQualityRuleEntries`），识别包含冲突、同义词分歧与宽规则误命中。
   - 形成修改、保留或删除决议。
   - 获得搭档明确授权后，调用 `workspace_apply` 提交变更。
