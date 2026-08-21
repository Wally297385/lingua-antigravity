import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { WorkspaceManager, DEFAULT_CONTRACT } from "../src/workspace-dataset.js";
import { WorkspaceApplier } from "../src/workspace-apply.js";

describe("WorkspaceApplier", () => {
  let tmpDir: string;
  let manager: WorkspaceManager;
  let applier: WorkspaceApplier;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lingua-apply-test-"));
    manager = new WorkspaceManager(tmpDir);
    await manager.initializeWorkspace();
    applier = new WorkspaceApplier(manager, DEFAULT_CONTRACT);

    const sampleItems = [
      { item_id: 1, src: "こんにちは", dst: "你好", name_src: "", name_dst: "", file_path: "f1.txt" },
      { item_id: 2, src: "ありがとう", dst: "谢谢", name_src: "", name_dst: "", file_path: "f1.txt" },
    ];
    await manager.writeJsonl("items/entries.jsonl", sampleItems);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("applies item updates and creates backup snapshot", async () => {
    // 写入 staging updates
    const updates = [{ item_id: 1, dst: "你好呀！", status: "proofread" }];
    await manager.writeJsonl(DEFAULT_CONTRACT.changes.items.updates, updates);

    const result = await applier.apply();
    expect(result.status).toBe("applied");
    expect(result.updated_counts?.items).toBe(1);

    // 验证原数据集已被更新
    const items: any[] = [];
    for await (const item of manager.iterateJsonl("items/entries.jsonl")) {
      items.push(item);
    }
    expect(items[0].dst).toBe("你好呀！");
    expect(items[0].status).toBe("proofread");
    expect(items[1].dst).toBe("谢谢");

    // 验证备份目录存在
    const backupRoot = path.join(tmpDir, ".backup");
    expect(fs.existsSync(backupRoot)).toBe(true);
    const backups = await fs.promises.readdir(backupRoot);
    expect(backups.length).toBeGreaterThan(0);
  });

  it("returns unchanged when no changes exist", async () => {
    const result = await applier.apply();
    expect(result.status).toBe("unchanged");
  });
});
