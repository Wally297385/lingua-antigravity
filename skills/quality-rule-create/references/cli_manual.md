# EPUB / 小说专名挖掘工具链命令行手册 (CLI Manual v2.4)

本文档为 `@skill(quality-rule-create)` 的核心工具参考，详细说明内置脚本 `scripts/epub_glossary_toolkit.py` 的子命令、参数选项、一键流水线与 `glossary/` 产物规约。

---

## 1. 核心红线与环境安全

1. **产物存放路径硬红线**：
   - 所有生成的纯文本、挖掘候选集 JSON、初稿草案、全简称消歧配置与导出的 XLSX/JSON 术语表，**默认且必须存放于工程根目录的 `glossary/` 文件夹**。
   - 工具脚本已默认内置自动路径规约（`[GLOSSARY DIRECTORY]`），防止中间产物散落。
2. **环境与管道防御规范 (Windows 编码加固)**：
   - **推荐命令前缀**：在 Windows pwsh 下运行 Python 任务时，前置注入环境变量：
     ```powershell
     $env:PYTHONUTF8=1; python <script_path> ...
     ```
   - **管道与数据流契约**：脚本内部已集成控制台 UTF-8 管道保护。严禁使用 `replace` 掩耳盗铃静默吞损日文字符；禁止通过控制台打印大段日文，统一通过落盘的标准 JSON 文件进行数据传递。
   - **数据契约归一化 (Surface Contract)**：所有挖掘条目统一输出 `{ "surface", "count", "snippets", "category" }`，消灭下游字段取值分歧。
   - 零第三方重型依赖，仅依赖 Python 3.10+ 标准库（`zipfile`, `re`, `json`, `argparse`）与基础轻量库（`openpyxl` 仅导出 Excel 时需要）。

---

## 2. 🚀 一键式全自动化流水线 (`pipeline`)

对于长篇轻小说（如百万字 Web 版或 EPUB 文库版），推荐优先使用一键流水线子命令：

```powershell
$env:PYTHONUTF8=1; python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py pipeline <input.epub> [-o <out_dir>] [--min-freq 2] [--stopwords-config <config.json>]
```

### 自动化执行链 (v2.4)
1. **全本抽取 (`extract`)**：解析 EPUB OPF 元数据，按自然数章节精准排序，清洗 HTML 标签与 Ruby 注音假名，导出纯文本至 `glossary/extracted_text.txt`；
2. **深度挖掘与四层剪枝防御 (`mine` & `prune`)**：
   - 执行片假名复合词、日汉混合中点全名、书名号设定词、ACG 后缀及人名尊称聚类；
   - **第一层：日常外来语与通识社团免录防御**：自动拦截日常外来语，以及通识社团概念（支持工作区外置 JSON 配置覆盖）；
   - **第二层：算法级片假名子串包含抑制（Sub-string Containment Pruning）**：自动剔除包含率 $\ge 95\%$ 的机械切片（根治 `シャーベリア` 产生伪简称 `リア`）；
   - **第三层：算法级长短实体修饰嵌套去重（Nested Entity Long-Short Pruning）**：自动识别并剔除带有普通限定修饰/场所前缀的长词；
   - **第四层：人名敬称派生剥离剪枝（Honorific Variant Pruning）**：自动剥离并拦截 `日向君`、`金森先生`、`木枯先輩` 等派生敬称称呼，确保仅保留核心人名实体；
3. **基于编辑距离与倒置的疑似笔误/异体字智能聚类 (`typo_cluster`)**：
   - 纯 Python 零依赖 Levenshtein 编辑距离算法，自动发现全名编辑距离 $\le 1$ 且频次显著更低（如 $\ge 3:1$）的疑似作者偶发笔误（如 `フォア・プラット`），以及词素倒置异体字（如 `ヴギラド・アリエ` vs `アリエ・ヴラギド`）；
   - 自动生成定向重定向消歧建议；
4. **独立简称联动 (`link`)**：精准统计片假名作为独立词的频次，生成 `Suggested Pairs` 消歧候选模板；
5. **原生五字段草案直出 (`draft`)**：自动组装极简高价值的 LinguaGacha 五字段标准草案 `glossary/glossary_draft_entries.json`（融合笔误重定向，默认 info 精简规范，零剧透）；
6. **审阅报告 (`report`)**：自动生成结构化 Markdown 报告 `glossary/glossary_pipeline_report.md`，单独展示笔误预警表格，供搭档一览全局。

---

## 3. 分步子命令详解

### 3.1 全本抽取 (`extract`)
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py extract <input.epub> -o glossary/extracted_text.txt
```
- `<input.epub>`：目标 EPUB 电子书文件路径；
- `-o, --output`：导出的纯文本路径（未指定时默认存放在 `glossary/`）。

---

### 3.2 深度实体挖掘 (`mine`)
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py mine glossary/extracted_text.txt -o glossary/glossary_candidates.json --min-freq 2 --with-snippets --stopwords-config glossary/glossary_stopwords.json
```
- `-o, --output`：输出候选集 JSON 路径（默认归档于 `glossary/`）；
- `--min-freq`：最低词频阈值（默认 2 次）；
- `--with-snippets`：自动抓取原著真实语境切片；
- `--stopwords-config`：可选，指定外置停用词 JSON 配置文件路径。

---

### 3.3 术语表质量全要素体检 (`lint`)
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py lint glossary/glossary_rules.json --text glossary/extracted_text.txt [--strict]
```
- 严格对照 LinguaGacha 五字段与四大硬红线：
  - `src` 非空、`regex` 恒为 `false`（实体词违规使用正则判为致命错误）；
  - `info` 字符数 10~20 契约体检（过短/过长输出 Warning）；
  - 敏感大纲词与剧情剧透排查（刺杀/真名/幼年等输出 Notice）；
  - 嵌套长短词修饰冗余检查与常规敬称称谓拦截；
  - 正文 100% 真实命中核验（拦截幽灵词条）；
- `--strict`：若存在任何 Warning 警告，返回非零退出码阻断流水线。

---

### 3.4 字面量校验与幽灵拦截 (`verify`)
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py verify glossary/glossary_entries.json glossary/extracted_text.txt --prune-out glossary/valid_entries.json
```

---

### 3.5 核准与标准化导出 (`export`)
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py export glossary/glossary_entries.json --json-out glossary/glossary_rules.json --xlsx-out glossary/glossary_rules.xlsx --verify-text glossary/extracted_text.txt --prune-zero-hits [--strict-lint]
```
- 导出时默认自动调用 `lint` 引擎进行质量预检；
- `--strict-lint`：若存在严重错误，自动终止导出；
- 导出标准带样式的 Excel (`rules` 工作表) 与 4 空格缩进的纯净 JSON。
