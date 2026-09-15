# EPUB / 小说专名挖掘工具链命令行手册 (CLI Manual v2.1)

本文档为 `@skill(quality-rule-create)` 的核心工具参考，详细说明内置脚本 `scripts/epub_glossary_toolkit.py` 的子命令、参数选项、一键流水线与 `glossary/` 产物规约。

---

## 1. 核心红线与环境安全

1. **产物存放路径硬红线**：
   - 所有生成的纯文本、挖掘候选集 JSON、全简称消歧配置与导出的 XLSX/JSON 术语表，**默认且必须存放于工程根目录的 `glossary/` 文件夹**。
   - 工具脚本已默认内置自动路径规约（`[GLOSSARY DIRECTORY]`），防止中间产物散落。
2. **环境与管道防御**：
   - 脚本内部已自动集成 Windows UTF-8 管道安全配置（`sys.stdout.reconfigure(encoding='utf-8')`），彻底杜绝控制台 GBK 引起的特殊标点或日文字符崩溃。
   - 零第三方重型依赖，仅依赖 Python 3.10+ 标准库（`zipfile`, `re`, `json`, `argparse`）与基础轻量库（`openpyxl` 仅导出 Excel 时需要）。

---

## 2. 🚀 一键式全自动化流水线 (`pipeline`)

对于长篇轻小说（如百万字 Web 版或 EPUB 文库版），推荐优先使用一键流水线子命令：

```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py pipeline <input.epub> [-o <out_dir>] [--min-freq 2]
```

### 自动化执行链
1. **全本抽取 (`extract`)**：解析 EPUB OPF 元数据，按自然数章节精准排序，清洗 HTML 标签与 Ruby 注音假名，导出纯文本至 `glossary/extracted_text.txt`；
2. **深度挖掘 (`mine`)**：执行片假名复合词、日汉混合中点全名、书名号设定词、ACG 后缀（地理/组织/爵位/系统）及人名尊称特征聚类，自动过滤泛词黑名单（如“知らない家”、“新しい村”）；
3. **联动消歧 (`link`)**：自动扫描中点贵族/西方全名与高频简称的频次关联，生成 `Suggested Pairs` 消歧候选模板；
4. **字面量校验 (`verify`)**：强制比对原著字面量出现频次，剔除 0 命中项，保存 `glossary/glossary_candidates.json`；
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
