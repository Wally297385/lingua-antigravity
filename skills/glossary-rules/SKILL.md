---
name: glossary-rules
description: 质量规则创建与审查使用的术语发现、收录、字段、证据和最小充分集合判据；定义与 LinguaGacha 完全兼容的标准五字段术语表格式（参考露西.json/露西.xlsx）。
---

# 术语领域判据 (@skill(glossary-rules))

glossary 承载普通翻译无法稳定推出的专有译法、身份、消歧和世界观事实。运行时按 `src` 连续字面命中激活条目，把 `src -> dst #info` 注入模型。

---

## 1. 收录资格与边界判定

先独立判断对象是否需要 glossary，再判断怎样表达：

- **应收录**：专有实体、人名、别名、地名、组织、特定物品、技能、世界观专有概念；缺少 glossary 会导致破坏一致性的语义漂移或分歧。
- **不应收录**：普通日常称谓、通用职业、修饰词或泛用短语；普通翻译能稳定得到目标结果。
- **尚不能判断**：语境不足时，优先缩小边界或按输入上下文处理，确无策略时方列为需要补充信息。

---

## 2. 核心架构规约

### 2.1 全称与简称联动机制
- **全称条目**：承载完整身份、性别、能力与背景设定（如 `ノエル・フィン・デンペロン`）。
- **常用简称**：承载明确消歧指向与基本定位（如 `ノエル` -> “男性，主角诺艾尔·芬·登佩隆的常用简称”），防止长篇机翻时简称漏翻或指代漂移。

### 2.2 100% 真实字面命中红线
- 严禁凭主观推测加入原文未出现过的幽灵词条（例如原著仅出现“伯爵领”，严禁脑补“伯爵家”）。
- 导出前必须强制核验字面量出现频次，0 命中项一律剔除。

### 2.3 最小充分集合 (Minimal Sufficient Set)
- 优先保留语义独立完整的专有实体；
- 衍生词若可通过核心词根稳定覆盖且无歧义，优先保留核心词，杜绝无节制膨胀。

---

## 3. 标准数据契约与范本

所有导出的规则文件必须符合 LinguaGacha 下游管线硬约束：
- 完整规范与 `info` 指令语法：**[LinguaGacha 五字段契约规范](./references/contract_spec.md)**
- 官方标杆范例：**[标准术语表范本 (露西.json)](./examples/lucy_sample.json)**

---

## 4. 自动化工具链支持

推荐复用 `@skill(quality-rule-create)` 内置工具链进行验证与导出：
```powershell
python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py export <entries.json> --json-out <out.json> --xlsx-out <out.xlsx> --verify-text <full_text.txt>
```
Python 脚本已内置 Windows UTF-8 管道安全自愈，直接调用即可。
