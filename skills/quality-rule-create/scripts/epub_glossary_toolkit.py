#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EPUB Glossary Toolkit for LinguaGacha & Antigravity
===================================================
专为泛二次元日文轻小说/EPUB 文本设计的术语提取与 LinguaGacha 标准格式导出工具链。
纯 Python 标准库实现抽取与挖掘（导出 Excel 需 openpyxl，无依赖时降级提示）。

主要功能：
1. extract: 零外部依赖解压与解析 EPUB，读取 OPF 元数据，按自然数精准排序章节，清洗正文导出纯文本。
2. mine: 自动化多维度模式聚类挖掘（片假名复合词、专名书名符号、地理/组织/爵位后缀、人物尊称关系）。
3. export: 严格按照 LinguaGacha 五字段契约导出标准 JSON (4空格缩进) 与带样式的 Excel (工作表 rules)。
"""

import os
import sys
import io
import re
import json
import zipfile
import argparse
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

# Windows 控制台与管道 UTF-8 编码安全加固
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, io.UnsupportedOperation):
        pass

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
            # 将文件名拆解为 (0, 数字) 或 (1, 字符串) 元组，彻底避免 Python 3 中 int 与 str 跨类型比较报错
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
                
                # 剥离 HTML 标签
                clean_text = re.sub(r'<rt[^>]*>.*?</rt>', '', raw_html) # 剔除注音假名
                clean_text = re.sub(r'<[^>]+>', '', clean_text)
                # 规范化多余空行
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
    多模式日文实体聚类挖掘，支持自动抓取上下文切片。
    """
    results = {
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

    # 1. 片假名单词与中点复合词挖掘
    katakana_pat = re.compile(r'[\u30A1-\u30FA\u30FC]{2,}(?:・[\u30A1-\u30FA\u30FC]+)*')
    katakana_counts = Counter(katakana_pat.findall(text))
    results["katakana_compounds"] = [
        format_item({"word": w, "count": c}, "word")
        for w, c in katakana_counts.most_common(200) if c >= min_freq
    ]

    # 2. 专名号/书名号关键词挖掘 『...』 与 「...」
    single_brackets = Counter(re.findall(r'『([^』]{2,30})』', text))
    results["bracketed_terms"] = [
        format_item({"term": w, "count": c}, "term")
        for w, c in single_brackets.most_common(150)
        if not any(punct in w for punct in ["！", "？", "、", "。"]) and c >= 1
    ]

    # 3. 组织、地理、阶级后缀特征词识别
    suffix_categories = {
        "geo": r'([一-龥ぁ-んァ-ヶー]{2,10}(?:領|村|街|町|山|峰|森|湖|城|国|島|谷|砦|塔))',
        "org": r'([一-龥ぁ-んァ-ヶー]{2,10}(?:商会|店|ギルド|騎士団|工房|亭))',
        "house_rank": r'([一-龥ぁ-んァ-ヶー]{2,10}(?:家|伯爵|男爵|子爵|侯爵|公爵|殿下|陛下))',
        "system": r'([一-龥ぁ-んァ-ヶー]{2,10}(?:タグ|硬貨|金貨|銀貨|銅貨))'
    }
    for cat, pat in suffix_categories.items():
        found = Counter(re.findall(pat, text))
        results["named_entities_by_suffix"][cat] = [
            format_item({"word": w, "count": c}, "word")
            for w, c in found.most_common(50) if c >= min_freq
        ]

    # 4. 人名称谓识别 (前缀 + 尊称)
    honorific_pat = re.compile(
        r'([A-Za-z\u3040-\u30ff\u4e00-\u9fa5]{2,10})'
        r'(?:さん|様|さま|君|くん|ちゃん|先生|卿|親方|大旦那|姐さん|大叔父|大叔母|女将)'
    )
    char_counts = Counter(honorific_pat.findall(text))
    # 过滤明显的普通代词
    ignore_words = {"わたし", "あなた", "自分", "誰か", "彼", "彼女", "お前", "客", "商人", "領主", "お父", "お母", "お爺", "お婆"}
    results["character_candidates"] = [
        format_item({"name": w, "count": c}, "name")
        for w, c in char_counts.most_common(80) 
        if w not in ignore_words and c >= min_freq
    ]

    return results

def export_linguagacha(entries, output_json=None, output_xlsx=None, text_to_verify=None, prune_zero_hits=False):
    """
    按照 LinguaGacha 五字段标准契约校验并导出术语表。
    支持通过 prune_zero_hits 自动剔除未命中的幽灵词条。
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

    # 导出 JSON
    if output_json:
        os.makedirs(os.path.dirname(os.path.abspath(output_json)), exist_ok=True)
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(cleaned, f, ensure_ascii=False, indent=4)
        print(f"[INFO] 成功导出 LinguaGacha 标准 JSON 至: {output_json}")

    # 导出 XLSX
    if output_xlsx:
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

            os.makedirs(os.path.dirname(os.path.abspath(output_xlsx)), exist_ok=True)
            wb.save(output_xlsx)
            print(f"[INFO] 成功导出 LinguaGacha 标准 Excel (rules) 至: {output_xlsx}")
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
        os.makedirs(os.path.dirname(os.path.abspath(prune_out)), exist_ok=True)
        with open(prune_out, 'w', encoding='utf-8') as f:
            json.dump(valid_entries, f, ensure_ascii=False, indent=4)
        print(f"\n[INFO] 已将清理后的 {len(valid_entries)} 条有效术语保存至: {prune_out}")

    return {"total": total, "matched": len(matched), "missing": missing}

def main():
    parser = argparse.ArgumentParser(description="EPUB Glossary Extraction & Export Toolkit for LinguaGacha")
    subparsers = parser.add_subparsers(dest="command", help="子命令")

    # extract
    p_extract = subparsers.add_parser("extract", help="解压并提取 EPUB 纯文本")
    p_extract.add_argument("epub", help="EPUB 文件路径")
    p_extract.add_argument("-o", "--output", help="输出纯文本 TXT 路径")

    # mine
    p_mine = subparsers.add_parser("mine", help="从文本挖掘专有名词候选集")
    p_mine.add_argument("text_file", help="纯文本路径")
    p_mine.add_argument("-o", "--output", help="输出候选 JSON 路径")
    p_mine.add_argument("--min-freq", type=int, default=2, help="词频阈值 (默认: 2)")
    p_mine.add_argument("--with-snippets", action="store_true", help="为候选词提取原著上下文切片")
    p_mine.add_argument("--snippet-count", type=int, default=3, help="每个候选词提取的切片数量 (默认: 3)")

    # export
    p_export = subparsers.add_parser("export", help="导出 LinguaGacha 五字段术语表")
    p_export.add_argument("entries_json", help="术语条目 JSON 文件路径")
    p_export.add_argument("--json-out", help="导出 JSON 路径")
    p_export.add_argument("--xlsx-out", help="导出 XLSX 路径")
    p_export.add_argument("--verify-text", help="用于真实性比对的纯文本文件")
    p_export.add_argument("--prune-zero-hits", action="store_true", help="自动剔除未命中的幽灵词条")

    # verify
    p_verify = subparsers.add_parser("verify", help="快速校验术语表在原著文本中的命中率并报告幽灵词条")
    p_verify.add_argument("entries_json", help="术语条目 JSON 路径")
    p_verify.add_argument("text_file", help="原著纯文本路径")
    p_verify.add_argument("--prune-out", help="将清理幽灵词条后的有效术语保存至新 JSON 路径")

    args = parser.parse_args()

    if args.command == "extract":
        res = extract_epub(args.epub, args.output)
        print(f"[SUCCESS] 提取完成，共 {res['chapters_count']} 章节，总字数约 {len(res['full_text'])} 字。")
    elif args.command == "mine":
        with open(args.text_file, 'r', encoding='utf-8') as f:
            text = f.read()
        mined = mine_entities(text, args.min_freq, with_snippets=args.with_snippets, snippet_count=args.snippet_count)
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(mined, f, ensure_ascii=False, indent=4)
            print(f"[SUCCESS] 候选集已保存至: {args.output}")
        else:
            print(json.dumps(mined, ensure_ascii=False, indent=2))
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

