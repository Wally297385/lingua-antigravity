# 更新日志 (Changelog)

本项目的所有显著变更均记录于此文档。
版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 规范。

## [2.6.0] - 2026-09-19

### 新增功能 (Features)
- **原生支持 LinguaGacha `.lg` 工程文件**：
  - 新增 `scripts/lg_toolkit.py`，支持通過 SQLite3 直接讀取 `.lg` 文件中的待翻譯條目與術語表。
  - 完美打通 LinguaGacha GUI 閉環工作流：`GUI 導入建檔` -> `.lg` -> `Antigravity 翻譯` -> `.lg` -> `GUI 校對導出`。

## [2.5.0] - 2026-09-15

### 🛡️ 架构协议与上下文经济学升级 (Black-Box Tooling & Token Economy)
- **成熟工具黑盒调用协议 (Black-Box Tooling Protocol)**：
  - 针对 `scripts/epub_glossary_toolkit.py` 达 1300+ 行代码引起的 Agent 习惯性全量读取、上下文窗口挤占（40KB+ / 次）与记忆稀释问题，在全局规则 `rules/AGENTS.md` 中确立黑盒工具执行硬红线；
  - 明确将成熟内置脚本定性为“黑盒执行资产”：日常常规业务（抽取、挖掘、剪枝、体检、导出）**严禁使用 `view_file` 盲目读取源码**；
  - 确立读码边界：仅当用户搭档明确下达“修复工具 Bug / 升级重构工具本身”的代码维护指令时，才允许读取该工具的底层源码。
- **`quality-rule-create/SKILL.md` 指令加固与即用配方内联 (Inline CLI Recipes)**：
  - 在技能入口显著注入 `🚨【黑盒工具执行红线 · 严禁读取源码】` 警示横幅；
  - 内联常见 90% 场景的一键流水线、全要素体检与标准落盘导出等标准命令表格，开箱即用，闭眼直接执行；
  - 确立参数查询降级规约：优先利用控制台原生 `--help`（如 `python <script> <subcommand> --help`）秒级自省，彻底隔绝因查询参数而翻阅源码的诱因。

### ⚡ 工具链与手册同步 (CLI Manual & Toolkit v2.5)
- 工具链 `epub_glossary_toolkit.py` 升级至 **v2.5**；
- 更新 `references/cli_manual.md` 为 v2.5 手册，新增黑盒工具与防读码规约章节；
- 插件包版本正式升级至 `2.5.0`。

---

## [2.4.0] - 2026-09-15

### 🚀 核心特性与工作流升级 (Workflow & Tooling Enhancements)
- **基于 Levenshtein 编辑距离与假名倒置的疑似笔误智能聚类 (Typo & Inversion Clustering)**：
  - 纯 Python 零外部依赖实现轻量级 Levenshtein 编辑距离与双向词素倒置识别；
  - 自动发现全名编辑距离 $\le 1$ 且频次显著更低的疑似作者笔误异体字（如 `フォア・プレット` vs `フォア・プラット`），以及词素倒置（如 `ヴギラド・アリエ` vs `アリエ・ヴラギド`）；
  - 自动在流水线草案与审阅报告中生成重定向预填建议（`suggested_info`），大幅降低长篇轻小说机翻译名漂移风险。
- **停用词与黑名单外置 JSON 体系 (Externalized Stopwords Architecture)**：
  - 抽离 `generic_stopwords`、`generic_prefixes`、`common_katakana_stopwords` 与 `honorific_suffixes` 为独立外置 JSON 文件（`glossary/glossary_stopwords.json`）；
  - 支持工程工作区级独立覆写与 `--stopwords-config` 参数，缺失时自动平滑回退至插件内置标准底表，轻松适配现代学园、异世界西幻、古风仙侠等多题材作品。
- **独立质量体检闭环 (`lint` Subcommand & Quality Auditing)**：
  - 新增独立子命令 `lint`，全要素审查 LinguaGacha 五字段规范与四大质量硬红线：
    - 致命错误拦截：`regex` 必须恒为 `false`（实体词严禁使用正则模式）、非空 `src` 原文字面量保障；
    - 规范红线体检：常规称谓后缀拦截（`〜君`、`〜先生` 等）、非全简称嵌套长短词修饰冗余预警；
    - 契约长度与剧透排查：严格校验 `info` 是否在 10~20 字符高价值区间，排查 `刺客`、`真名`、`幼年` 等小说大纲剧透特征词；
    - 真实命中核验：结合原著纯文本自动检测并预警零命中幽灵词条；
  - `export` 子命令全面集成 `lint` 预检逻辑，并支持 `--strict-lint` 在遇到严重违例时显式拦截。

### ⚡ 工具链与手册更新 (CLI Manual & Toolkit v2.4)
- 工具链 `epub_glossary_toolkit.py` 升级至 v2.4；
- 更新 `references/cli_manual.md`，增加 `lint` 与 `--stopwords-config` 命令行手册；
- 插件资源目录内置 `resources/glossary_stopwords.json` 模板。

---

## [2.3.0] - 2026-09-15

### 🚀 核心质量缺陷根治 (Quality Redlines & Bug Fixes)
- **算法级人名常规称谓派生抑制 (Honorific Variant Pruning)**：
  - 彻底阻断 `X君`、`X老师`、`X学长`、`X同学`（如 `日向君`、`金森先生`、`木枯先輩` 等）作为独立条目机械写入术语表；
  - 确立规则：常规称谓后缀由下游翻译 LLM 依据语境与人际关系自然处理，除非该称谓带有特殊代号/反差双关等文学设定；工具链自动识别核心人名及其姓氏前缀，阻断派生称谓进入草案与导出物。
- **算法级长短实体修饰嵌套去重 (Nested Entity Long-Short Pruning)**：
  - 新增汉字与混合词前缀修饰语识别与长词剪枝算法；
  - 彻底根治 `私立大園高校` vs `大園高校`、`理科室の濃硫酸女` vs `濃硫酸女`、`大園高校不思議調査隊` vs `大園高校` 频繁重复提取的顽疾，严格贯彻最小充分集合原则。
- **大模型已知通识词与日常外来语免录防御 (LLM Common & Transparent Words Filter)**：
  - 扩充通识社团机构黑名单（`新聞部`, `生徒会`, `演劇部` 等）、自解释复合词（`不思議調査隊`）与通识概念（`七不思議`），下游 LLM 能独立稳定翻译的名词一律免录，节省 Prompt 预算；
  - 引入现代日常通用片假名外来语黑名单（`クラス`, `ピアノ`, `ナイフ`, `スマホ`, `シャツ` 等 80+ 词），杜绝常见生活外来语污染专名候选池；
  - 书名号过滤强化：自动剔除包含口语对话句尾（`だよ`, `なよ` 等）及长句子的对白。
- **`info` 字段高价值精炼契约与零剧透红线 (Actionable & Zero-Spoiler Info Spec)**：
  - 重构 `contract_spec.md`：`info` 唯一使命是为下游翻译提供动作与语法约束（角色限“性别+核心身份”，技能/道具限“动作类型/属性”指导动词修饰搭配）；
  - 设立 10~20 字长度限制与零剧透红线，严禁生平履历、遇害解谜、门禁刷卡等小说大纲与剧情剧透杂质。

### 🛡️ 流程机制创新：任务自省与资产沉淀协议 (Task Retrospective Protocol)
- 在全局规则 `AGENTS.md` 与核心工作流 `quality-rule-workflow` 中正式确立任务自省机制；
- 每次任务交付结束时必须向搭档进行三维复盘：`🚧 踩坑与化解`（边界陷阱与应对）、`🛠️ 效率工具与沉淀`（可复用代码/正则/工具沉淀）、`📈 工作流演进建议`（工作流与规范未来优化方向）。

### ⚡ 工具链与文档手册同步 (CLI Manual v2.3)
- 更新 `scripts/epub_glossary_toolkit.py`：导出时集成 4 大质量硬红线体检与警告提示；
- 更新 `references/cli_manual.md`、`glossary-rules/SKILL.md` 与 `quality-rule-workflow/SKILL.md` 至 v2.3 规范。

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
