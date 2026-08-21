import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { WorkspaceManager, DEFAULT_CONTRACT } from "../src/workspace-dataset.js";

describe("WorkspaceManager", () => {
  let tmpDir: string;
  let manager: WorkspaceManager;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lingua-test-"));
    manager = new WorkspaceManager(tmpDir);
    await manager.initializeWorkspace();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("initializes directories and project meta correctly", async () => {
    const meta = await manager.loadProjectMeta();
    expect(meta.counts.items).toBe(0);
    expect(meta.counts.glossary).toBe(0);
  });

  it("writes and iterates JSONL files", async () => {
    const items = [
      { item_id: 1, src: "こんにちは", dst: "你好", name_src: "アリス", name_dst: "爱丽丝", file_path: "f1.txt" },
      { item_id: 2, src: "世界", dst: "世界", name_src: "", name_dst: "", file_path: "f1.txt" },
    ];
    await manager.writeJsonl("items/entries.jsonl", items);

    const readBack: any[] = [];
    for await (const item of manager.iterateJsonl("items/entries.jsonl")) {
      readBack.push(item);
    }
    expect(readBack).toHaveLength(2);
    expect(readBack[0].src).toBe("こんにちは");

    const meta = await manager.loadProjectMeta();
    expect(meta.counts.items).toBe(2);
  });
});
