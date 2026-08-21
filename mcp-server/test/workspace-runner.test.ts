import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { WorkspaceManager, DEFAULT_CONTRACT } from "../src/workspace-dataset.js";
import { WorkspaceRunner } from "../src/workspace-runner.js";

describe("WorkspaceRunner", () => {
  let tmpDir: string;
  let manager: WorkspaceManager;
  let runner: WorkspaceRunner;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lingua-runner-test-"));
    manager = new WorkspaceManager(tmpDir);
    await manager.initializeWorkspace();
    runner = new WorkspaceRunner(manager, DEFAULT_CONTRACT);

    const sampleItems = [
      { item_id: 1, src: "こんにちは", dst: "", name_src: "", name_dst: "", file_path: "f1.txt" },
    ];
    await manager.writeJsonl("items/entries.jsonl", sampleItems);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("runs JavaScript sandbox script and writes to staging changes", async () => {
    const script = `
      async function main(workspace) {
        const queryRes = await workspace.queryItems({ limit: 10 });
        const items = queryRes.items;
        
        const updates = items.map(item => ({
          item_id: item.item_id,
          dst: "你好世界",
          status: "translated"
        }));
        
        await workspace.writeJsonl(workspace.contract.changes.items.updates, updates);
        
        return {
          processed_count: items.length,
          applied: false
        };
      }
    `;

    const result = await runner.runScript(script);
    expect(result.processed_count).toBe(1);
    expect(result.applied).toBe(false);

    // 检查 changes 目录是否有写入
    const changesPath = path.join(tmpDir, "changes", "items", "updates.jsonl");
    expect(fs.existsSync(changesPath)).toBe(true);
    const content = await fs.promises.readFile(changesPath, "utf-8");
    expect(content).toContain("你好世界");
  });

  it("denies writing to unauthorized paths outside staging/task/scratch", async () => {
    const maliciousScript = `
      async function main(workspace) {
        await workspace.writeJsonl("items/entries.jsonl", []);
        return { success: true };
      }
    `;

    await expect(runner.runScript(maliciousScript)).rejects.toThrow(/Permission denied/);
  });
});
