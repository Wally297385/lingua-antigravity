---
name: quality-rule-create
description: 当需要通过扫描当前工程发现新术语、专有名词、重复格式、控制结构或样式模式，并为它们建立术语表或文本保护规则时使用；提取的术语表严格遵循 LinguaGacha 5 字段规范。
---

# 质量规则创建 (@skill(quality-rule-create))

以 `@skill(quality-rule-workflow)` 为核心工作流引擎，以 `@skill(glossary-rules)` 为五字段数据契约，以 `@skill(acg-glossary-verification)` 为外部权威仲裁。

---

## 1. 入口行为与两阶段流程（安全红线）

1. **范围确定**：确定本次创建允许的种类（`glossary`, `text_preserve`）和目标文本范围。
2. **术语契约**：严格遵循 LinguaGacha 标准五字段格式（`src`, `dst`, `info`, `regex: false`, `case_sensitive: false`）。
3. **分析与呈现（写入确认阶段）**：
   - 提取并校准候选专名与保护规则；
   - 强制核验正文字面量命中情况，剔除幽灵词条；
   - 向搭档呈现拟新增词条清单、分类统计与重点范例，请求写入授权。
4. **显式授权后导出**：获得搭档明确确认后，调用原生工具或导出工具链写入目标规则文件。

---

## 2. EPUB / 小说专名挖掘工具链（黑盒执行资产）

> 🚨 **【黑盒工具执行红线 · 严禁读取源码】**
> 内置脚本 `scripts/epub_glossary_toolkit.py` 是经过充分验证与严密封装的生产级黑盒 CLI 工具（1300+ 行）。
> **在日常执行挖掘、清洗、体检、校验与导出任务时，严禁使用 `view_file` 读取该脚本源码！**
> 违规读码将导致上万 Token 上下文泄漏与严重记忆稀释。参数疑问统一通过控制台 `--help` 查看。
> **仅当搭档明确提出“修复工具 Bug / 升级重构工具本身”时，才允许读取其代码。**

### 2.1 即用命令速查（CLI Recipes - 闭眼照抄直接执行）

在 Windows pwsh 环境下，通过 `run_command` 直接调用以下经过编码加固的标准命令（将 `<input.epub>` 替换为实际电子书路径）：

| 场景 | 标准执行命令 | 自动化效果 |
| :--- | :--- | :--- |
| **一键流水线 (首选)** | `$env:PYTHONUTF8=1; python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py pipeline "<input.epub>"` | 自动全本抽取 ➔ 深度挖掘与四层剪枝 ➔ 笔误编辑距离聚类 ➔ 全简称联动 ➔ 生成五字段草案 (`glossary/glossary_draft_entries.json`) 与审查简报 (`glossary/glossary_pipeline_report.md`) |
| **质量全要素体检** | `$env:PYTHONUTF8=1; python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py lint glossary/glossary_entries.json --text glossary/extracted_text.txt` | 全要素审查五字段规范、10~20字契约、零剧透特征、称谓与嵌套长短词冲突及正文真实命中 |
| **标准落盘导出** | `$env:PYTHONUTF8=1; python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py export glossary/glossary_entries.json --json-out glossary/glossary_rules.json --xlsx-out glossary/glossary_rules.xlsx --verify-text glossary/extracted_text.txt --prune-zero-hits` | 联动体检校验，导出带 `rules` 工作表的标准 Excel 与 4 空格缩进的纯净 JSON |
| **参数快速查询** | `$env:PYTHONUTF8=1; python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py --help`<br>`$env:PYTHONUTF8=1; python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py <subcommand> --help` | 秒级获取子命令与参数定义，绝对无需读取源码 |

- 分步子命令（`extract`, `mine`, `verify`）与外置停用词扩展参见：**[工具链命令行手册](./references/cli_manual.md)**。

---

## 3. 核心规约与硬红线

### 3.1 产物路径收纳约束（硬红线）
- **所有术语表候选文件、消歧配置与导出的 JSON/XLSX 必须统一存放于工作区根目录的 `glossary/` 文件夹中**。
- 严禁随意散落在根目录或临时无序路径下，工具脚本默认自动定位并输出至 `glossary/`。

### 3.2 全称与简称联动机制
- **核心全称**（如 `ノエル・フィン・デンペロン`）：承载完整的背景设定、性别、身份归属、能力与关系链。
- **高频简称**（如 `ノエル`）：承载明确的消歧指令与指向关系（如“男性，主角诺艾尔的常用简称”），防止长篇机翻时简称漏翻或语义漂移。

### 3.3 100% 真实字面命中覆盖
- 严禁凭主观经验推导原著未明确出现的高阶组合词（如原文仅有“伯爵”与“伯爵领”，严禁推导出未使用的“伯爵家”）。
- 所有拟定词条的 `src` 必须通过 `verify` 命令或 `--verify-text` 校验，未命中项一律剔除。
