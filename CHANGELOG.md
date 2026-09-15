# 更新日志 (Changelog)

本项目的所有显著变更均记录于此文档。
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 规范。

---

## [2.1.0] - 2026-09-15

### 🚀 新增特性 (Features)
- **EPUB 专名挖掘一键流水线 (`pipeline`)**：
  - 在核心工具 `epub_glossary_toolkit.py` 中新增 `pipeline` 子命令，一键串联 `extract` ➔ `mine` ➔ `link` ➔ `verify` ➔ `report` 全流程；
  - 自动输出结构化 Markdown 审阅报告（`glossary_pipeline_report.md`），一目了然呈现书籍元信息、多维候选统计与全简称消歧建议。
- **深度日式 ACG 实体挖掘引擎升级**：
  - **中点全名启发式匹配**：支持日汉混合贵族/西方人名全称捕获（如 `[\u30A0-\u30FF\u4E00-\u9FA5]+・...`）；
  - **ACG 领域后缀扩充**：扩充地理设施（`平原|遺跡|迷宮|ダンジョン` 等）、组织商会（`教会|神殿|連盟|学院|学園|教団|軍`）、爵位家族（`辺境伯|皇子|皇女|王女|国王|皇帝`）及系统机制词（`スキル|魔法|ステータス|レベル`）；
  - **泛词黑名单防御机制**：内置 `GENERIC_STOPWORDS` 与通用修饰前缀过滤库，主动拦截 `知らない家`、`新しい村`、`自分の町` 等噪音短语。
- **全称与高频简称联动消歧建议 (`Suggested Pairs`)**：
  - 自动比对贵族中点全名与正文中独立分词的出现频次，若简称频次显著，自动生成关联候选与消歧说明模板，辅助防止机翻漏翻或语义漂移。
- **术语表产物统一收纳约束（硬红线）**：
  - 在全局规则 `AGENTS.md`、`quality-rule-create` 与 `glossary-rules` 中建立硬性约束：**所有术语表抽取文本、候选 JSON、消歧配置与导出的 JSON/XLSX 必须统一存放于工作区根目录下的 `glossary/` 文件夹**；
  - 工具脚本各命令全面适配默认路径归集（`[GLOSSARY DIRECTORY]`），杜绝文件随意散落。

### ⚡ 优化与重构 (Refactoring & Improvements)
- **全局规则 `AGENTS.md` 深度瘦身精简**：
  - 将原 168 行规则瘦身至 97 行，去除与平台系统 Prompt 重叠的技能调度冗长说教；
  - 移除常驻五字段大表，确立 `@skill(glossary-rules)` 为术语契约的单一真相源（SSOT）；
  - 润色过度抽象的企业级公文词汇，统一合并交互协议与排版决策表格，显著降低每轮对话常驻 Token 开销并提升指令遵循度。
- **文档与命令行手册同步**：
  - 更新 `SKILL.md` 与 `references/cli_manual.md`，补充 `pipeline` 参数说明与工作流操作范式。

---

## [2.0.0] - 2026-09-15

### 🚀 重大重构 (Major Architecture Refactoring)
- **原生 Antigravity 2.0 架构重构**：彻底解耦外部 Node.js/TypeScript MCP 独立服务依赖，转为纯原生 Agent 技能插件体系；
- **原生工具深度融合**：直接驱动 `view_file`、`replace_file_content`、`run_command`、`invoke_subagent` 等内置工具；
- **首创两阶段显式写入授权契约**：严格区分只读审查与落盘提交，杜绝误写与覆盖风险。
