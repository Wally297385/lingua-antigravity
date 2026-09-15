# EPUB / 小说专名挖掘工具链命令行手册 (CLI Manual v2.2)

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
$env:PYTHONUTF8=1; python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py pipeline <input.epub> [-o <out_dir>] [--min-freq 2]
```

### 自动化执行链 (v2.2)
1. **全本抽取 (`extract`)**：解析 EPUB OPF 元数据，按自然数章节精准排序，清洗 HTML 标签与 Ruby 注音假名，导出纯文本至 `glossary/extracted_text.txt`；
2. **深度挖掘与子串抑制 (`mine` & `prune`)**：执行片假名复合词、日汉混合中点全名、书名号设定词、ACG 后缀及人名尊称聚类；内置**算法级子串包含抑制（Sub-string Containment Pruning）**，自动剔除包含率 $\ge 95\%$ 的词尾机械切片（彻底杜绝类似 `シャーベリア` 产生假简称 `リア` 的问题）；
3. **独立简称联动 (`link`)**：精准统计片假名作为独立词的频次，生成 `Suggested Pairs` 消歧候选模板；
4. **原生五字段草案直出 (`draft`)**：自动组装开箱即用的 LinguaGacha 五字段标准草案 `glossary/glossary_draft_entries.json`，用户与 Agent 无需手写临时脚本转换；
5. **审阅报告 (`report`)**：自动生成结构化 Markdown 报告 `glossary/glossary_pipeline_report.md`，供搭档一览全局。

---

## 3. 分步子命令详解

若需要对流水线中的特定环节进行单步排查或定制，可按需调用以下子命令：

### 3.1 全本抽取 (`extract`)
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py extract <input.epub> -o glossary/extracted_text.txt
```
- `<input.epub>`：目标 EPUB 电子书文件路径；
- `-o, --output`：导出的纯文本路径（未指定时默认存放在 `glossary/`）。

---

### 3.2 深度实体挖掘 (`mine`)
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py mine glossary/extracted_text.txt -o glossary/glossary_candidates.json --min-freq 2 --with-snippets
```
- `-o, --output`：输出候选集 JSON 路径（默认归档于 `glossary/`）；
- `--min-freq`：最低词频阈值（默认 2 次，过滤单次出现的生僻词）；
- `--with-snippets`：自动抓取 2~3 处原著真实语境切片，辅助判定性别、身份与词义；
- `--snippet-count`：每个候选词提取的切片数量（默认 3 条）。

---

### 3.3 字面量校验与幽灵拦截 (`verify`)
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py verify glossary/glossary_entries.json glossary/extracted_text.txt --prune-out glossary/valid_entries.json
```
- 严格核验条目集合在原著文本中的真实出现情况，输出未命中清单并可选将清理后的有效条目另存为新文件。

---

### 3.4 核准与标准化导出 (`export`)
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py export glossary/glossary_entries.json --json-out glossary/glossary_rules.json --xlsx-out glossary/glossary_rules.xlsx --verify-text glossary/extracted_text.txt --prune-zero-hits
```
- `--json-out`：标准 JSON 输出路径（默认 `glossary/glossary_rules.json`）；
- `--xlsx-out`：带标准表头的 XLSX 规则文件输出路径（默认 `glossary/glossary_rules.xlsx`）；
- `--verify-text`：传入正文执行终审双向比对；
- `--prune-zero-hits`：自动拦截并剔除 0 命中项，确保导出物 100% 真实覆盖。
