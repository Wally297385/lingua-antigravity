# EPUB / 小说专名挖掘工具链命令行手册 (CLI Manual)

本文档为 `@skill(quality-rule-create)` 的核心工具参考，详细说明内置脚本 `scripts/epub_glossary_toolkit.py` 的子命令、参数选项与长篇小说批处理流水线。

---

## 1. 运行环境与安全配置

- 脚本内部已自动集成 Windows UTF-8 管道自愈配置（`sys.stdout.reconfigure(encoding='utf-8')`），直接使用 `run_command` 调用，无需额外配置环境变量。
- 零第三方重型依赖，仅依赖 Python 标准库（如 `zipfile`, `re`, `json`, `argparse`）与基础轻量库。

---

## 2. 四大子命令详解

### 2.1 全本抽取 (`extract`)
解析 EPUB 文件（或目录），提取书籍元数据，依据内部自然数章节排序清洗正文并导出纯文本。

```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py extract <input.epub> -o <out_text.txt>
```
- `<input.epub>`：目标 EPUB 电子书文件路径；
- `-o, --output`：导出的合并纯文本路径。

---

### 2.2 实体挖掘与语境画像 (`mine`)
自动扫描日文片假名复合词、专有名词引号（如 `『...』`）、地名/组织/爵位后缀及人名尊称，自动切片前 2~3 处原著语境切片。

```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py mine <text_file.txt> -o <candidates.json> --min-freq 2 --with-snippets
```
- `<text_file.txt>`：全本纯文本文件；
- `-o, --output`：生成的候选词条 JSON 文件；
- `--min-freq`：最低词频阈值（默认 2 次，过滤单次出现的偶发词）；
- `--with-snippets`：携带原著上下文切片，辅助大模型进行角色画像与消歧判断。

---

### 2.3 字面量校验与幽灵词条拦截 (`verify`)
校验拟定的条目集合在原著文本中的真实出现情况，杜绝凭空脑补的幽灵词条。

```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py verify <entries.json> <text_file.txt>
```
- `<entries.json>`：待验证的五字段条目 JSON；
- `<text_file.txt>`：原著文本；
- 输出字面量未命中的词条清单及出现频次统计。

---

### 2.4 核准与标准化导出 (`export`)
将校验消歧后的词条集，一键导出为标准的 LinguaGacha 兼容文件（带 4 空格缩进的 JSON 以及包含 `rules` 工作表的 XLSX 文件）。

```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py export <verified_entries.json> --json-out <out.json> --xlsx-out <out.xlsx> --verify-text <text_file.txt> --prune-zero-hits
```
- `<verified_entries.json>`：已核准的条目集；
- `--json-out`：标准 JSON 输出路径；
- `--xlsx-out`：带标准表头的 XLSX 规则文件输出路径；
- `--verify-text`：传入正文文本，执行最终防御性双向比对；
- `--prune-zero-hits`：自动剔除 0 命中项，确保导出物 100% 真实覆盖。
