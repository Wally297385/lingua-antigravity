import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AgentTaskProgress } from "../src/task-progress.js";
import { WorkspaceManager, DEFAULT_CONTRACT } from "../src/workspace-dataset.js";
import { WorkspaceRunner } from "../src/workspace-runner.js";
import { WorkspaceApplier } from "../src/workspace-apply.js";

describe("MCP Tools End-to-End Flow", () => {
  let tmpDir: string;
  let taskProgress: AgentTaskProgress;
  let manager: WorkspaceManager;
  let runner: WorkspaceRunner;
  let applier: WorkspaceApplier;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mcp-e2e-test-"));
    taskProgress = new AgentTaskProgress();
    manager = new WorkspaceManager(tmpDir);
    await manager.initializeWorkspace();
    runner = new WorkspaceRunner(manager, DEFAULT_CONTRACT);
    applier = new WorkspaceApplier(manager, DEFAULT_CONTRACT);

    // 准备初始翻译与术语数据
    const items = [
      { item_id: 1, src: "ミナが立っていた。", dst: "", name_src: "ミナ", name_dst: "", file_path: "vol1.txt" },
      { item_id: 2, src: "アストラを振る。", dst: "", name_src: "", name_dst: "", file_path: "vol1.txt" },
    ];
    await manager.writeJsonl("items/entries.jsonl", items);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("executes full translation & quality review workflow: load -> task -> script -> apply -> finish", async () => {
    // 1. workspace_load
    await manager.initializeWorkspace();
    const meta = await manager.loadProjectMeta();
    expect(meta.counts.items).toBe(2);

    // 2. task_progress: start
    const startRes = taskProgress.start(["discover:seed", "review:batch:1", "finalize:changes"]);
    expect(startRes.current_step).toBe("discover:seed");

    // 3. workspace_script: 模拟模型发现术语与翻译更新
    const script = `
      async function main(workspace) {
        // 查找未翻译项目
        const res = await workspace.queryItems({ limit: 10 });
        
        // 准备 item 更新
        const updates = res.items.map(item => ({
          item_id: item.item_id,
          dst: item.src === "ミナが立っていた。" ? "米娜站立着。" : "挥动阿斯特拉。",
          status: "translated"
        }));
        await workspace.writeJsonl(workspace.contract.changes.items.updates, updates);
        
        // 准备新建术语
        const glossaryCreates = [
          { id: "g_mina", src: "ミナ", dst: "米娜", info: "女性角色" }
        ];
        await workspace.writeJsonl(workspace.contract.changes.glossary.creates, glossaryCreates);

        return {
          items_reviewed: res.items.length,
          glossary_proposed: 1
        };
      }
    `;
    const scriptRes = await runner.runScript(script);
    expect(scriptRes.items_reviewed).toBe(2);
    expect(scriptRes.glossary_proposed).toBe(1);

    // 4. task_progress: advance
    const adv1 = taskProgress.advance();
    expect(adv1.current_step).toBe("review:batch:1");

    const adv2 = taskProgress.advance();
    expect(adv2.current_step).toBe("finalize:changes");

    // 5. workspace_apply: 写入更新
    const applyRes = await applier.apply();
    expect(applyRes.status).toBe("applied");
    expect(applyRes.updated_counts?.items).toBe(2);
    expect(applyRes.updated_counts?.glossary_creates).toBe(1);

    // 验证更新已落盘
    const readItems: any[] = [];
    for await (const item of manager.iterateJsonl("items/entries.jsonl")) {
      readItems.push(item);
    }
    expect(readItems[0].dst).toBe("米娜站立着。");
    expect(readItems[1].dst).toBe("挥动阿斯特拉。");

    const readGlossary: any[] = [];
    for await (const g of manager.iterateJsonl("glossary/entries.jsonl")) {
      readGlossary.push(g);
    }
    expect(readGlossary).toHaveLength(1);
    expect(readGlossary[0].dst).toBe("米娜");

    // 6. task_progress: advance & finish
    taskProgress.advance();
    const finishRes = taskProgress.finish();
    expect(finishRes.status).toBe("completed");
  });
});
