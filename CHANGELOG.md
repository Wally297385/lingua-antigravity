# 更新日志 (Changelog)

本项目的所有显著变更均记录于此文档。
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 规范。

---

## [2.2.0] - 2026-09-15

### 🚀 新增特性 (Features)
- **原生五字段草案自动组装器 (Draft Generator)**：
  - 流水线新增原生直出 `glossary/glossary_draft_entries.json`（完全符合 LinguaGacha 五字段标准契约）；
  - 依据实体类别自动预填规范消歧说明模板（中点全称、联动简称、书名号核心设定、高频专名），彻底免除下游手动/即席编写脚本转换的繁琐步骤。
- **算法级“子串包含抑制”（Sub-string Containment Pruning）**：
  - 引入基于包含率与独立边界的伴生切片过滤算法（$\text{Contained Ratio} \ge 95\%$ 且独立语法频次 $< 2$ 强制剔除）；
  - 彻底根治高频专名内部机械切片（如 `シャーベリア` 词尾 `リア`）被误报为 365 次高频简称的假阳性缺陷。
- **OPF 原版元数据锚定与两级垂直检索规程**：
  - 在 `@skill(acg-glossary-verification)` 建立两级检索路由：第一级强制读取 EPUB `content.opf` 提取原作者与法定日文标题；第二级垂直定向检索 Kakuyomu / 小说家になろう 官方专栏，彻底杜绝中文机翻书名全网泛搜失真。

### 🛡️ Windows 编码全链路防御加固 (Encoding & Pipeline Hardening)
- **根除静默吞损漏洞**：移除原有 `errors='replace'` 隐式吞字缺陷，杜绝控制台将日文假名与特殊字符静默降级为问号 `?`；
- **环境安全注入约定**：在 CLI 手册中明确加入 `$env:PYTHONUTF8=1` 环境前置推荐，阻断 Windows 11 GBK (CP936) 默认代码页对 Python 任务的冲击；
- **日文同形平假名形态学归一**：增加对片假名中混入同形平假名（`べ`、`り`、`へ`）的自动形态修正与中点人名严格边界断言，修复因假名混用导致的断词切片。

### ⚡ 优化与契约统一 (Refactoring & Contract Unification)
- **数据契约归一化 (Surface Contract)**：
  - 挖掘结果 `glossary_candidates.json` 所有分类统一收敛为 `{ "surface", "count", "snippets", "category" }`，彻底终结 `name` / `word` / `term` 碎片化取值；
  - 全简称联动建议与下游流水线全链路对齐 Surface 契约。
- **手册文档同步**：
  - 更新 `references/cli_manual.md` 与 `references/source_matrix.md` 至 v2.2 规范。

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
