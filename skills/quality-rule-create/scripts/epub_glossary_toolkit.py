#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EPUB Glossary Toolkit for LinguaGacha & Antigravity (v2.1)
===========================================================
专为泛二次元日文轻小说/EPUB 文本设计的实体挖掘、全简称联动消歧与 LinguaGacha 标准格式导出工具链。
纯 Python 标准库实现抽取与挖掘（导出 Excel 需 openpyxl，无依赖时降级提示）。

主要功能：
1. extract: 零外部依赖解压与解析 EPUB，读取 OPF 元数据，按自然数精准排序章节，清洗正文导出纯文本。
2. mine: 深度多维度模式聚类挖掘（支持日汉中点贵族全名、专名书名符号、地理/组织/爵位后缀、泛词黑名单防御）。
3. auto_pair: 智能扫描贵族中点全名与高频简称，生成成对消歧建议（Suggested Pairs）。
4. verify: 严格比对原著字面量出现频次，彻底拦截幽灵词条与虚构推断。
5. export: 严格按照 LinguaGacha 五字段契约导出标准 JSON (4空格缩进) 与带样式的 Excel (工作表 rules)。
6. pipeline: 一键串联抽取、深度挖掘、全简称关联、命中核验，全流程产物自动归集至 glossary/ 目录并生成 Markdown 审阅报告。
"""

import os
import sys
import io
import re
import json
import zipfile
import argparse
from collections import Counter, defaultdict

# Windows 控制台与管道 UTF-8 编码安全加固
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, io.UnsupportedOperation):
        pass

# 泛词黑名单与修饰前缀（防御修饰短语污染候选池，如“知らない家”、“新しい村”、“自分たちの町”）
GENERIC_STOPWORDS = {
    "自分", "新しい", "知らない", "私", "僕", "俺", "あなた", "彼", "彼女", "誰か",
    "お前", "客", "商人", "領主", "お父", "お母", "お爺", "お婆", "みんな", "一人",
    "二人", "仲間", "人間", "大人", "子供", "男", "女", "声", "姿", "顔", "目",
    "手", "足", "頭", "心", "時", "日", "年", "前", "後", "中", "上", "下", "先", "方",
    "同じ", "色んな", "様々な", "特別", "最初", "最後", "相手", "場所", "世界"
}

GENERIC_PREFIXES = (
    "自分", "新しい", "知らない", "私の", "僕の", "俺の", "あなたの", "彼の", "彼女の",
    "誰かの", "別の", "ある", "この", "その", "あの", "どの", "小さな", "大きな"
)

def resolve_glossary_dir(base_dir=None):
    """
    智能定位或创建工程中的 glossary 文件夹路径（遵循产物集中收纳红线）。
    """
    if base_dir:
        target = os.path.join(base_dir, "glossary") if not base_dir.endswith("glossary") else base_dir
    else:
        curr = os.path.abspath(os.getcwd())
        target = os.path.join(curr, "glossary")
    os.makedirs(target, exist_ok=True)
    return target

def extract_epub(epub_path, output_txt=None):
    """
    零外部依赖解析 EPUB 文件，提取元数据与按自然数排序的章节全文。
    """
    if not os.path.exists(epub_path):
        raise FileNotFoundError(f"找不到 EPUB 文件: {epub_path}")

    with zipfile.ZipFile(epub_path, 'r') as z:
        namelist = z.namelist()
        
        # 1. 查找 content.opf 获取元数据
        opf_path = next((n for n in namelist if n.endswith('.opf')), None)
        meta = {
            "title": "",
            "creator": "",
            "description": "",
            "identifier": ""
        }
        if opf_path:
            try:
                raw_opf = z.read(opf_path).decode('utf-8', errors='ignore')
                t_m = re.search(r'<dc:title[^>]*>(.*?)</dc:title>', raw_opf, re.DOTALL)
                c_m = re.search(r'<dc:creator[^>]*>(.*?)</dc:creator>', raw_opf, re.DOTALL)
                d_m = re.search(r'<dc:description[^>]*>(.*?)</dc:description>', raw_opf, re.DOTALL)
                i_m = re.search(r'<dc:identifier[^>]*>(.*?)</dc:identifier>', raw_opf, re.DOTALL)
                if t_m: meta["title"] = t_m.group(1).strip()
                if c_m: meta["creator"] = c_m.group(1).strip()
                if d_m: meta["description"] = d_m.group(1).strip()
                if i_m: meta["identifier"] = i_m.group(1).strip()
            except Exception as e:
                print(f"[WARN] 解析 OPF 元数据失败: {e}", file=sys.stderr)

        # 2. 查找并按自然数排序章节正文文件
        chapter_files = [
            n for n in namelist 
            if n.endswith(('.xhtml', '.html', '.xml')) 
            and not n.endswith(('nav.xhtml', 'toc.xhtml', 'cover.xhtml'))
            and not 'nav' in n.lower()
        ]

        def natural_sort_key(filename):
            parts = re.split(r'(\d+)', filename)
            key = []
            for p in parts:
                if not p:
                    continue
                if p.isdigit():
                    key.append((0, int(p)))
                else:
                    key.append((1, p.lower()))
            return key

        chapter_files.sort(key=natural_sort_key)

        # 3. 抽取与清洗章节文本
        chapters = []
        full_text_parts = []

        for ch_file in chapter_files:
            try:
                raw_html = z.read(ch_file).decode('utf-8', errors='ignore')
                
                # 尝试获取标题
                h_match = re.search(r'<h[1-3][^>]*>(.*?)</h[1-3]>', raw_html, re.DOTALL)
                if not h_match:
                    h_match = re.search(r'<title[^>]*>(.*?)</title>', raw_html, re.DOTALL)
                title = re.sub(r'<[^>]+>', '', h_match.group(1)).strip() if h_match else os.path.basename(ch_file)
                
                # 剥离 HTML 标签与 Ruby 注音假名
                clean_text = re.sub(r'<rt[^>]*>.*?</rt>', '', raw_html)
                clean_text = re.sub(r'<[^>]+>', '', clean_text)
                lines = [line.strip() for line in clean_text.split('\n') if line.strip()]
                clean_chapter = "\n".join(lines)
                
                chapters.append({"file": ch_file, "title": title, "text": clean_chapter})
                full_text_parts.append(f"\n\n=== {title} ===\n\n" + clean_chapter)
            except Exception as e:
                print(f"[WARN] 抽取章节 {ch_file} 失败: {e}", file=sys.stderr)

    full_text = "\n".join(full_text_parts)
    
    if output_txt:
        os.makedirs(os.path.dirname(os.path.abspath(output_txt)), exist_ok=True)
        with open(output_txt, 'w', encoding='utf-8') as f:
            f.write(f"Title: {meta['title']}\n")
            f.write(f"Creator: {meta['creator']}\n")
            f.write(f"Identifier: {meta['identifier']}\n")
            f.write(f"Description:\n{meta['description']}\n\n")
            f.write("=" * 40 + "\n\n")
            f.write(full_text)
        print(f"[INFO] 成功导出纯文本至: {output_txt}")

    return {
        "metadata": meta,
        "chapters_count": len(chapters),
        "chapters": chapters,
        "full_text": full_text
    }

def extract_context_snippets(text, word, max_snippets=3, snippet_radius=70):
    """
    高效提取某个词在原著全文中的代表性上下文切片，用于辅助判定性别、身份、属性与语境。
    """
    if not word or not text:
        return []
    pat = re.compile(re.escape(word))
    matches = list(pat.finditer(text))
    if not matches:
        return []

    step = max(1, len(matches) // max_snippets)
    selected = [matches[i] for i in range(0, len(matches), step)][:max_snippets]
    snippets = []
    for m in selected:
        s = max(0, m.start() - snippet_radius)
        e = min(len(text), m.end() + snippet_radius)
        clean_snip = text[s:e].replace('\r', ' ').replace('\n', ' ').strip()
        snippets.append(clean_snip)
    return snippets

def mine_entities(text, min_freq=2, with_snippets=False, snippet_count=3):
    """
    深度多模式日文实体聚类挖掘引擎（升级版）：
    - 支持片假名与日汉混合中点全名；
    - ACG 专属组织/地理/阶级/系统后缀特征；
    - 尊称人名关联；
    - 泛词黑名单与修饰前缀主动过滤。
    """
    results = {
        "full_names_with_dot": [],
        "katakana_compounds": [],
        "bracketed_terms": [],
        "named_entities_by_suffix": defaultdict(list),
        "character_candidates": []
    }

    def format_item(item_dict, key_name):
        w = item_dict[key_name]
        if with_snippets:
            item_dict["snippets"] = extract_context_snippets(text, w, max_snippets=snippet_count)
        return item_dict

    def is_generic_noise(word):
        if not word or len(word) < 2:
            return True
        if word in GENERIC_STOPWORDS:
            return True
        for pfx in GENERIC_PREFIXES:
            if word.startswith(pfx):
                return True
        return False

    # 1. 中点全名启发式挖掘（汉字+假名混合贵族全名，如“シリル・ローウェル”、“セレフィナ・グランヴェル”）
    dot_name_pat = re.compile(r'[\u30A0-\u30FF\u4E00-\u9FA5]{2,}・[\u30A0-\u30FF\u4E00-\u9FA5]{2,}(?:・[\u30A0-\u30FF\u4E00-\u9FA5]{2,})*')
    dot_counts = Counter(dot_name_pat.findall(text))
    results["full_names_with_dot"] = [
        format_item({"name": w, "count": c}, "name")
        for w, c in dot_counts.most_common(150)
        if not is_generic_noise(w) and c >= 1
    ]

    # 2. 纯片假名单词与复合词挖掘
    katakana_pat = re.compile(r'[\u30A1-\u30FA\u30FC]{2,}(?:・[\u30A1-\u30FA\u30FC]+)*')
    katakana_counts = Counter(katakana_pat.findall(text))
    results["katakana_compounds"] = [
        format_item({"word": w, "count": c}, "word")
        for w, c in katakana_counts.most_common(200)
        if not is_generic_noise(w) and c >= min_freq
    ]

    # 3. 专名号/书名号关键词挖掘 『...』
    single_brackets = Counter(re.findall(r'『([^』]{2,30})』', text))
    results["bracketed_terms"] = [
        format_item({"term": w, "count": c}, "term")
        for w, c in single_brackets.most_common(150)
        if not any(punct in w for punct in ["！", "？", "、", "。"]) and not is_generic_noise(w) and c >= 1
    ]

    # 4. ACG 组织、地理、阶级、系统后缀特征识别
    suffix_categories = {
        "geo": r'([一-龥ぁ-んァ-ヶー]{2,10}(?:領|村|街|町|山|峰|森|湖|城|国|島|谷|砦|塔|断崖|地方|城門|街道|平原|遺跡|迷宮))',
        "org": r'([一-龥ぁ-んァ-ヶー]{2,10}(?:商会|店|ギルド|騎士団|工房|亭|教会|神殿|連盟|学院|学園|教団|軍))',
        "house_rank": r'([一-龥ぁ-んァ-ヶー]{2,10}(?:家|族|伯爵|男爵|子爵|侯爵|公爵|辺境伯|殿下|陛下|皇子|皇女|王女|国王|皇帝))',
        "system": r'([一-龥ぁ-んァ-ヶー]{2,10}(?:タグ|硬貨|金貨|銀貨|銅貨|スキル|魔法|ステータス|レベル))'
    }
    for cat, pat in suffix_categories.items():
        found = Counter(re.findall(pat, text))
        valid_items = []
        for w, c in found.most_common(60):
            if c >= min_freq and not is_generic_noise(w):
                valid_items.append(format_item({"word": w, "count": c}, "word"))
        results["named_entities_by_suffix"][cat] = valid_items

    # 5. 人名称谓识别 (前缀 + 尊称)
    honorific_pat = re.compile(
        r'([A-Za-z\u3040-\u30ff\u4e00-\u9fa5]{2,10})'
        r'(?:さん|様|さま|君|くん|ちゃん|先生|卿|親方|大旦那|姐さん|大叔父|大叔母|女将)'
    )
    char_counts = Counter(honorific_pat.findall(text))
    results["character_candidates"] = [
        format_item({"name": w, "count": c}, "name")
        for w, c in char_counts.most_common(100) 
        if not is_generic_noise(w) and c >= min_freq
    ]

    return results

def link_name_candidates(text, full_names, min_short_freq=3):
    """
    全称与高频简称联动建议生成器：
    - 扫描 A・B 全名，拆解出分词并在原著中统计独立词频；
    - 若分词独立频次显著，生成建议成对条目（Suggested Pairs），预填消歧说明模板。
    """
    pairs = []
    seen_pairs = set()

    for item in full_names:
        full_name = item.get("name") or item.get("word")
        if not full_name or "・" not in full_name:
            continue
        
        full_count = item.get("count", text.count(full_name))
        parts = [p for p in full_name.split("・") if len(p) >= 2 and p not in GENERIC_STOPWORDS]

        for part in parts:
            part_count = text.count(part)
            if part_count >= min_short_freq and part_count >= full_count:
                pair_key = (full_name, part)
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                
                pairs.append({
                    "full_name": full_name,
                    "full_count": full_count,
                    "short_name": part,
                    "short_count": part_count,
                    "suggested_info": f"常用简称；对应全名 {full_name}，用于消歧与防止漏翻"
                })

    return pairs

def export_linguagacha(entries, output_json=None, output_xlsx=None, text_to_verify=None, prune_zero_hits=False):
    """
    按照 LinguaGacha 五字段标准契约校验并导出术语表。
    强制遵循产物收纳于 glossary/ 目录规范。
    支持 prune_zero_hits 自动拦截未命中幽灵词条。
    """
    cleaned = []
    seen = set()
    pruned = []

    for idx, item in enumerate(entries):
        src = item.get("src", "").strip()
        dst = item.get("dst", "").strip()
        info = item.get("info", "").strip()
        regex = bool(item.get("regex", False))
        case_sensitive = bool(item.get("case_sensitive", False))

        if not src:
            print(f"[WARN] 第 {idx+1} 项缺少非空 'src'，已忽略", file=sys.stderr)
            continue
        if not dst:
            print(f"[WARN] 条目 '{src}' 缺少非空 'dst'，已忽略", file=sys.stderr)
            continue
        if src in seen:
            print(f"[WARN] 重复条目 '{src}'，已跳过后续重复项", file=sys.stderr)
            continue

        if text_to_verify and src not in text_to_verify:
            if prune_zero_hits:
                print(f"[PRUNED] 原文 '{src}' 未在原著文本中命中，已自动剔除该幽灵词条", file=sys.stderr)
                pruned.append(src)
                continue
            else:
                print(f"[NOTICE] 原文 '{src}' 未在原著文本中精确命中，请核实", file=sys.stderr)

        entry = {
            "src": src,
            "dst": dst,
            "info": info,
            "regex": regex,
            "case_sensitive": case_sensitive
        }
        cleaned.append(entry)
        seen.add(src)

    if pruned:
        print(f"[INFO] 自动清理完成：共剔除 {len(pruned)} 条未命中幽灵词条: {pruned}")
    print(f"[INFO] 成功校验 {len(cleaned)} 条有效术语。")

    def normalize_output_path(p, default_filename):
        if not p:
            p = os.path.join("glossary", default_filename)
        elif not os.path.dirname(p):
            p = os.path.join("glossary", p)
        os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
        return p

    # 导出 JSON
    if output_json or (not output_json and not output_xlsx):
        target_json = normalize_output_path(output_json, "glossary_rules.json")
        with open(target_json, 'w', encoding='utf-8') as f:
            json.dump(cleaned, f, ensure_ascii=False, indent=4)
        print(f"[INFO] [GLOSSARY DIRECTORY] 成功导出 LinguaGacha 标准 JSON 至: {target_json}")

    # 导出 XLSX
    if output_xlsx:
        target_xlsx = normalize_output_path(output_xlsx, "glossary_rules.xlsx")
        try:
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment

            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "rules"

            headers = ["src", "dst", "info", "regex", "case_sensitive"]
            ws.append(headers)

            header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
            header_fill = PatternFill(start_color="4682B4", end_color="4682B4", fill_type="solid")
            align_center = Alignment(horizontal="center", vertical="center")
            align_left = Alignment(horizontal="left", vertical="center")

            for col in range(1, 6):
                cell = ws.cell(row=1, column=col)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = align_center

            for r_idx, row_data in enumerate(cleaned, start=2):
                ws.append([
                    row_data["src"],
                    row_data["dst"],
                    row_data["info"],
                    row_data["regex"],
                    row_data["case_sensitive"]
                ])
                ws.cell(row=r_idx, column=1).alignment = align_left
                ws.cell(row=r_idx, column=2).alignment = align_left
                ws.cell(row=r_idx, column=3).alignment = align_left
                ws.cell(row=r_idx, column=4).alignment = align_center
                ws.cell(row=r_idx, column=5).alignment = align_center

            ws.column_dimensions['A'].width = 30
            ws.column_dimensions['B'].width = 30
            ws.column_dimensions['C'].width = 75
            ws.column_dimensions['D'].width = 12
            ws.column_dimensions['E'].width = 16

            wb.save(target_xlsx)
            print(f"[INFO] [GLOSSARY DIRECTORY] 成功导出 LinguaGacha 标准 Excel 至: {target_xlsx}")
        except ImportError:
            print("[WARN] 未检测到 openpyxl 库，跳过 XLSX 导出。如需导出 Excel 请安装 openpyxl。", file=sys.stderr)

    return cleaned

def verify_glossary_entries(entries, text, prune_out=None):
    """
    核验术语在原著中的命中情况，并提供幽灵词条报告。
    """
    total = len(entries)
    matched = []
    missing = []

    for idx, item in enumerate(entries):
        src = item.get("src", "").strip()
        cnt = text.count(src)
        if cnt > 0:
            matched.append((src, cnt, item))
        else:
            missing.append((idx + 1, src, item))

    print("=" * 60)
    print(f"术语核验报告: 总计 {total} 条 | 命中: {len(matched)} 条 | 未命中: {len(missing)} 条")
    print("=" * 60)

    if missing:
        print("\n[WARNING] 以下条目在原文中未命中任何字面量（幽灵词条/推断过度）：")
        for line_no, src, _ in missing:
            print(f"  - 第 {line_no} 行: '{src}'")
    else:
        print("\n[SUCCESS] 所有术语均在原著中 100% 精确命中！")

    if prune_out:
        valid_entries = [m[2] for m in matched]
        if not os.path.dirname(prune_out):
            prune_out = os.path.join("glossary", prune_out)
        os.makedirs(os.path.dirname(os.path.abspath(prune_out)), exist_ok=True)
        with open(prune_out, 'w', encoding='utf-8') as f:
            json.dump(valid_entries, f, ensure_ascii=False, indent=4)
        print(f"\n[INFO] [GLOSSARY DIRECTORY] 已将清理后的 {len(valid_entries)} 条有效术语保存至: {prune_out}")

    return {"total": total, "matched": len(matched), "missing": missing}

def run_pipeline(epub_path, output_dir=None, min_freq=2, with_snippets=True):
    """
    一键式流水线：从 EPUB 解析到挖掘、联动分析、字面量检验与报告生成，全部产物归档于 glossary/ 目录。
    """
    if not output_dir:
        output_dir = "glossary"
    os.makedirs(output_dir, exist_ok=True)

    print("\n" + "=" * 60)
    print("🚀 启动 EPUB 专名挖掘与全流程流水线 (Pipeline Mode)")
    print(f"📁 产物归集目录: {os.path.abspath(output_dir)}")
    print("=" * 60)

    # 1. 抽取纯文本
    txt_out = os.path.join(output_dir, "extracted_text.txt")
    print("\n[步骤 1/4] 解析 EPUB 并提取章节纯文本...")
    extract_res = extract_epub(epub_path, output_txt=txt_out)
    full_text = extract_res["full_text"]
    meta = extract_res["metadata"]
    print(f"  - 标题: {meta.get('title', '未知')}")
    print(f"  - 作者: {meta.get('creator', '未知')}")
    print(f"  - 章节数: {extract_res['chapters_count']} | 总字数: {len(full_text):,} 字")

    # 2. 深度挖掘候选
    print("\n[步骤 2/4] 运行深度实体挖掘引擎 (支持中点全名、ACG后缀、泛词黑名单防御)...")
    mined = mine_entities(full_text, min_freq=min_freq, with_snippets=with_snippets)
    
    # 3. 全称与高频简称联动
    print("\n[步骤 3/4] 分析全称与高频简称联动消歧关系...")
    name_pairs = link_name_candidates(full_text, mined["full_names_with_dot"], min_short_freq=3)
    mined["suggested_name_pairs"] = name_pairs
    print(f"  - 发现中点贵族/西方全名: {len(mined['full_names_with_dot'])} 个")
    print(f"  - 发现高频简称联动建议: {len(name_pairs)} 对")

    # 保存候选集 JSON
    candidates_path = os.path.join(output_dir, "glossary_candidates.json")
    with open(candidates_path, 'w', encoding='utf-8') as f:
        json.dump(mined, f, ensure_ascii=False, indent=4)
    print(f"  - 候选集工件已保存: {candidates_path}")

    # 4. 生成审查报告
    print("\n[步骤 4/4] 自动生成 Markdown 结构化审阅报告...")
    report_path = os.path.join(output_dir, "glossary_pipeline_report.md")
    
    report_lines = [
        f"# EPUB 专名挖掘与候选集审查报告",
        f"",
        f"- **书籍标题**: {meta.get('title', os.path.basename(epub_path))}",
        f"- **作者**: {meta.get('creator', '未知')}",
        f"- **章节总数**: {extract_res['chapters_count']} 章 | **总字数**: {len(full_text):,} 字",
        f"- **生成时间**: 自动流水线生成",
        f"- **产物收纳路径**: `{os.path.abspath(output_dir)}`",
        f"",
        f"---",
        f"",
        f"## 📊 实体挖掘分类统计",
        f"",
        f"| 分类维度 | 候选数量 | 典型样例 |",
        f"| :--- | :---: | :--- |",
        f"| **中点全称 (贵族/西方人名)** | {len(mined['full_names_with_dot'])} | {', '.join([x['name'] for x in mined['full_names_with_dot'][:3]]) or '无'} |",
        f"| **片假名专名/术语** | {len(mined['katakana_compounds'])} | {', '.join([x['word'] for x in mined['katakana_compounds'][:3]]) or '无'} |",
        f"| **书名号设定词 『...』** | {len(mined['bracketed_terms'])} | {', '.join([x['term'] for x in mined['bracketed_terms'][:3]]) or '无'} |",
        f"| **地理与设施后缀** | {len(mined['named_entities_by_suffix'].get('geo', []))} | {', '.join([x['word'] for x in mined['named_entities_by_suffix'].get('geo', [])[:3]]) or '无'} |",
        f"| **组织与商会后缀** | {len(mined['named_entities_by_suffix'].get('org', []))} | {', '.join([x['word'] for x in mined['named_entities_by_suffix'].get('org', [])[:3]]) or '无'} |",
        f"| **爵位与家族后缀** | {len(mined['named_entities_by_suffix'].get('house_rank', []))} | {', '.join([x['word'] for x in mined['named_entities_by_suffix'].get('house_rank', [])[:3]]) or '无'} |",
        f"| **尊称人物候选** | {len(mined['character_candidates'])} | {', '.join([x['name'] for x in mined['character_candidates'][:3]]) or '无'} |",
        f"",
        f"---",
        f"",
        f"## 🔗 全称与高频简称联动建议 (Suggested Pairs)",
        f"",
        f"| 角色全称 (出现频次) | 常用简称 (出现频次) | 建议消歧说明模板 |",
        f"| :--- | :--- | :--- |"
    ]

    if name_pairs:
        for p in name_pairs:
            report_lines.append(f"| `{p['full_name']}` ({p['full_count']}次) | `{p['short_name']}` ({p['short_count']}次) | `{p['suggested_info']}` |")
    else:
        report_lines.append("| *暂未检测到显著全简称联动* | - | - |")

    report_lines.extend([
        f"",
        f"---",
        f"",
        f"## 💡 下一步指引",
        f"",
        f"1. 打开 `{candidates_path}` 或审阅上方统计；",
        f"2. 结合剧情确定最终 `dst` 译文并编写 `info` 消歧字段；",
        f"3. 运行 `export` 子命令导出最终标准术语表：",
        f"   ```powershell",
        f"   python .agents/plugins/lingua-Antigravity/skills/quality-rule-create/scripts/epub_glossary_toolkit.py export glossary/glossary_entries.json --json-out glossary/glossary_rules.json --xlsx-out glossary/glossary_rules.xlsx",
        f"   ```",
        f""
    ])

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(report_lines))
    print(f"  - 审查报告已生成: {report_path}")

    print("\n" + "=" * 60)
    print("✅ 一键流水线执行完成！所有产物均已安全写入 glossary/ 目录。")
    print("=" * 60 + "\n")

    return {
        "text_file": txt_out,
        "candidates_json": candidates_path,
        "report_md": report_path
    }

def main():
    parser = argparse.ArgumentParser(description="EPUB Glossary Extraction & Export Toolkit for LinguaGacha (v2.1)")
    subparsers = parser.add_subparsers(dest="command", help="子命令")

    # pipeline
    p_pipe = subparsers.add_parser("pipeline", help="一键流水线：全本抽取 -> 深度挖掘 -> 全简称联动 -> 校验并生成报告 (产物收纳于 glossary/)")
    p_pipe.add_argument("epub", help="EPUB 文件路径")
    p_pipe.add_argument("-o", "--output-dir", default="glossary", help="产物输出目录 (默认: glossary)")
    p_pipe.add_argument("--min-freq", type=int, default=2, help="词频阈值 (默认: 2)")
    p_pipe.add_argument("--no-snippets", action="store_true", help="不抓取语境切片")

    # extract
    p_extract = subparsers.add_parser("extract", help="解压并提取 EPUB 纯文本")
    p_extract.add_argument("epub", help="EPUB 文件路径")
    p_extract.add_argument("-o", "--output", help="输出纯文本 TXT 路径 (默认位于 glossary/ 目录)")

    # mine
    p_mine = subparsers.add_parser("mine", help="从文本挖掘专有名词候选集")
    p_mine.add_argument("text_file", help="纯文本路径")
    p_mine.add_argument("-o", "--output", help="输出候选 JSON 路径 (默认位于 glossary/ 目录)")
    p_mine.add_argument("--min-freq", type=int, default=2, help="词频阈值 (默认: 2)")
    p_mine.add_argument("--with-snippets", action="store_true", help="为候选词提取原著上下文切片")
    p_mine.add_argument("--snippet-count", type=int, default=3, help="每个候选词提取的切片数量 (默认: 3)")

    # export
    p_export = subparsers.add_parser("export", help="导出 LinguaGacha 五字段术语表 (默认输出至 glossary/ 目录)")
    p_export.add_argument("entries_json", help="术语条目 JSON 文件路径")
    p_export.add_argument("--json-out", help="导出 JSON 路径 (默认: glossary/glossary_rules.json)")
    p_export.add_argument("--xlsx-out", help="导出 XLSX 路径 (默认: glossary/glossary_rules.xlsx)")
    p_export.add_argument("--verify-text", help="用于真实性比对的纯文本文件")
    p_export.add_argument("--prune-zero-hits", action="store_true", help="自动剔除未命中的幽灵词条")

    # verify
    p_verify = subparsers.add_parser("verify", help="快速校验术语表在原著文本中的命中率并报告幽灵词条")
    p_verify.add_argument("entries_json", help="术语条目 JSON 路径")
    p_verify.add_argument("text_file", help="原著纯文本路径")
    p_verify.add_argument("--prune-out", help="将清理幽灵词条后的有效术语保存至新 JSON 路径")

    args = parser.parse_args()

    if args.command == "pipeline":
        run_pipeline(args.epub, output_dir=args.output_dir, min_freq=args.min_freq, with_snippets=not args.no_snippets)
    elif args.command == "extract":
        out_txt = args.output or os.path.join("glossary", "extracted_text.txt")
        res = extract_epub(args.epub, out_txt)
        print(f"[SUCCESS] 提取完成，共 {res['chapters_count']} 章节，总字数约 {len(res['full_text'])} 字。")
    elif args.command == "mine":
        with open(args.text_file, 'r', encoding='utf-8') as f:
            text = f.read()
        mined = mine_entities(text, args.min_freq, with_snippets=args.with_snippets, snippet_count=args.snippet_count)
        out_json = args.output or os.path.join("glossary", "glossary_candidates.json")
        os.makedirs(os.path.dirname(os.path.abspath(out_json)), exist_ok=True)
        with open(out_json, 'w', encoding='utf-8') as f:
            json.dump(mined, f, ensure_ascii=False, indent=4)
        print(f"[SUCCESS] [GLOSSARY DIRECTORY] 候选集已保存至: {out_json}")
    elif args.command == "export":
        with open(args.entries_json, 'r', encoding='utf-8') as f:
            entries = json.load(f)
        verify_text = None
        if args.verify_text and os.path.exists(args.verify_text):
            with open(args.verify_text, 'r', encoding='utf-8') as f:
                verify_text = f.read()
        export_linguagacha(entries, args.json_out, args.xlsx_out, verify_text, prune_zero_hits=args.prune_zero_hits)
    elif args.command == "verify":
        with open(args.entries_json, 'r', encoding='utf-8') as f:
            entries = json.load(f)
        with open(args.text_file, 'r', encoding='utf-8') as f:
            text = f.read()
        verify_glossary_entries(entries, text, prune_out=args.prune_out)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
