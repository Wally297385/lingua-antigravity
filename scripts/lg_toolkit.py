import sqlite3
import json
import argparse
from pathlib import Path

def extract_pending_items(lg_path: str, output_json: str = None):
    """從 .lg 提取待翻譯的條目與術語表"""
    conn = sqlite3.connect(lg_path)
    c = conn.cursor()
    
    pending_items = []
    for row in c.execute("SELECT id, data FROM items"):
        item_id, data_str = row
        data = json.loads(data_str)
        # 提取未翻譯或錯誤的條目
        if data.get("status") in ["NONE", "ERROR"] or not data.get("dst"):
            pending_items.append({"id": item_id, "data": data})
            
    glossary = []
    rule_row = c.execute("SELECT data FROM rules WHERE type = 'glossary'").fetchone()
    if rule_row:
        glossary = json.loads(rule_row[0])
        
    conn.close()
    
    result = {"items": pending_items, "glossary": glossary}
    if output_json:
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"Extracted {len(pending_items)} items to {output_json}")
    
    return result

def write_translations(lg_path: str, translations_json: str):
    """
    寫回翻譯結果到 .lg 文件
    translations_json 格式應為: [{"id": 1, "dst": "翻譯結果"}, ...]
    """
    with open(translations_json, "r", encoding="utf-8") as f:
        translations = json.load(f)
        
    conn = sqlite3.connect(lg_path)
    c = conn.cursor()
    
    updated_count = 0
    for t in translations:
        item_id = t.get("id")
        dst = t.get("dst")
        if not item_id or not dst: continue
        
        row = c.execute("SELECT data FROM items WHERE id = ?", (item_id,)).fetchone()
        if not row: continue
        
        data = json.loads(row[0])
        data["dst"] = dst
        data["status"] = "PROCESSED"
        
        c.execute("UPDATE items SET data = ? WHERE id = ?", (json.dumps(data, ensure_ascii=False), item_id))
        updated_count += 1
        
    conn.commit()
    conn.close()
    print(f"Successfully updated {updated_count} items in {lg_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LinguaGacha .lg Project Toolkit")
    subparsers = parser.add_subparsers(dest="command")
    
    extract_parser = subparsers.add_parser("extract", help="Extract pending items and glossary from .lg")
    extract_parser.add_argument("lg_path", help="Path to the .lg file")
    extract_parser.add_argument("output_json", help="Path to save the extracted JSON")
    
    write_parser = subparsers.add_parser("write", help="Write translations back to .lg")
    write_parser.add_argument("lg_path", help="Path to the .lg file")
    write_parser.add_argument("translations_json", help="Path to the translations JSON file")
    
    args = parser.parse_args()
    if args.command == "extract":
        extract_pending_items(args.lg_path, args.output_json)
    elif args.command == "write":
        write_translations(args.lg_path, args.translations_json)
    else:
        parser.print_help()
