import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { WorkspaceManager, DEFAULT_CONTRACT } from "../src/workspace-dataset.js";
import {
  queryItemsMethod,
  deriveCommonLiteralRootsMethod,
  matchLiteralsMethod,
  queryItemContextsMethod,
} from "../src/workspace-methods.js";

describe("WorkspaceMethods", () => {
  let tmpDir: string;
  let manager: WorkspaceManager;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lingua-methods-test-"));
    manager = new WorkspaceManager(tmpDir);
    await manager.initializeWorkspace();

    const sampleItems = [
      { item_id: 1, src: "ミナは言った。", dst: "米娜说道。", name_src: "ミナ", name_dst: "米娜", file_path: "ch1.txt", status: "none" },
      { item_id: 2, src: "アストラを抜く。", dst: "拔出阿斯特拉。", name_src: "アリス", name_dst: "爱丽丝", file_path: "ch1.txt", status: "translated" },
      { item_id: 3, src: "ミナ王女が微笑む。", dst: "米娜王女微笑。", name_src: "騎士", name_dst: "骑士", file_path: "ch1.txt", status: "proofread" },
    ];
    await manager.writeJsonl("items/entries.jsonl", sampleItems);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("queries items with keyword search", async () => {
    const res = await queryItemsMethod(manager, DEFAULT_CONTRACT, {
      search: { keywords: ["ミナ"], scope: "src" },
    });
    expect(res.total_item_count).toBe(2);
    expect(res.items).toHaveLength(2);
  });

  it("matches literals across full dataset", async () => {
    const res = await matchLiteralsMethod(manager, DEFAULT_CONTRACT, {
      patterns: [{ name: "mina", src: "ミナ" }],
    });
    expect(res.scanned_items_count).toBe(3);
    expect(res.results[0].unique_items_count).toBe(2);
    expect(res.results[0].total_occurrences).toBe(3); // 2 in src, 1 in name_src
  });

  it("derives common literal roots", async () => {
    const res = await deriveCommonLiteralRootsMethod({
      forms: ["ミナ王女", "ミナ殿", "ミナ様"],
    });
    expect(res.candidates.length).toBeGreaterThan(0);
    const roots = res.candidates.map((c) => c.root);
    expect(roots).toContain("ミナ");
    expect(roots).toContain("ミ");
  });

  it("queries item contexts", async () => {
    const res = await queryItemContextsMethod(manager, DEFAULT_CONTRACT, {
      item_ids: [2],
    });
    expect(res.contexts).toHaveLength(1);
    expect(res.contexts[0].item_ids).toContain(1);
    expect(res.contexts[0].item_ids).toContain(2);
    expect(res.contexts[0].item_ids).toContain(3);
  });
});
