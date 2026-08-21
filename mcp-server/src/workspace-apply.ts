import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeGlossaryEntry, type WorkspaceManager } from "./workspace-dataset.js";
import type { GlossaryEntry, ItemEntry, TextPreserveEntry, WorkspaceContract } from "./types.js";

export class WorkspaceApplier {
  private manager: WorkspaceManager;
  private contract: WorkspaceContract;

  constructor(manager: WorkspaceManager, contract: WorkspaceContract) {
    this.manager = manager;
    this.contract = contract;
  }

  public async apply(): Promise<{
    status: "applied" | "unchanged";
    updated_counts?: Record<string, number>;
    timestamp?: number;
  }> {
    const root = this.manager.getRoot();
    const changesRoot = path.join(root, "changes");

    if (!fs.existsSync(changesRoot)) {
      return { status: "unchanged" };
    }

    const itemUpdatesPath = this.manager.resolvePath(this.contract.changes.items.updates);
    const glossaryCreatesPath = this.manager.resolvePath(this.contract.changes.glossary.creates);
    const glossaryUpdatesPath = this.manager.resolvePath(this.contract.changes.glossary.updates);
    const glossaryDeletesPath = this.manager.resolvePath(this.contract.changes.glossary.deletes);
    const textPreserveCreatesPath = this.manager.resolvePath(this.contract.changes.text_preserve.creates);
    const textPreserveUpdatesPath = this.manager.resolvePath(this.contract.changes.text_preserve.updates);
    const textPreserveDeletesPath = this.manager.resolvePath(this.contract.changes.text_preserve.deletes);

    const hasItemUpdates = fs.existsSync(itemUpdatesPath);
    const hasGlossaryCreates = fs.existsSync(glossaryCreatesPath);
    const hasGlossaryUpdates = fs.existsSync(glossaryUpdatesPath);
    const hasGlossaryDeletes = fs.existsSync(glossaryDeletesPath);
    const hasTextPreserveCreates = fs.existsSync(textPreserveCreatesPath);
    const hasTextPreserveUpdates = fs.existsSync(textPreserveUpdatesPath);
    const hasTextPreserveDeletes = fs.existsSync(textPreserveDeletesPath);

    if (
      !hasItemUpdates &&
      !hasGlossaryCreates &&
      !hasGlossaryUpdates &&
      !hasGlossaryDeletes &&
      !hasTextPreserveCreates &&
      !hasTextPreserveUpdates &&
      !hasTextPreserveDeletes
    ) {
      return { status: "unchanged" };
    }

    const timestamp = Date.now();
    const backupDirName = new Date(timestamp).toISOString().replace(/[:.]/g, "-");
    const backupDirPath = path.join(root, ".backup", backupDirName);

    // 1. 识别需要备份的文件
    const filesToBackup: string[] = [];
    if (hasItemUpdates) filesToBackup.push(this.contract.datasets.items.path);
    if (hasGlossaryCreates || hasGlossaryUpdates || hasGlossaryDeletes) {
      filesToBackup.push(this.contract.datasets.glossary.path);
    }
    if (hasTextPreserveCreates || hasTextPreserveUpdates || hasTextPreserveDeletes) {
      filesToBackup.push(this.contract.datasets.text_preserve.path);
    }

    // 2. 执行自动快照备份
    await fs.promises.mkdir(backupDirPath, { recursive: true });
    for (const relFile of filesToBackup) {
      const srcFile = this.manager.resolvePath(relFile);
      if (fs.existsSync(srcFile)) {
        const destFile = path.join(backupDirPath, relFile);
        await fs.promises.mkdir(path.dirname(destFile), { recursive: true });
        await fs.promises.copyFile(srcFile, destFile);
      }
    }

    const updatedCounts: Record<string, number> = {
      items: 0,
      glossary_creates: 0,
      glossary_updates: 0,
      glossary_deletes: 0,
      text_preserve_creates: 0,
      text_preserve_updates: 0,
      text_preserve_deletes: 0,
    };

    try {
      // 3. 应用 item updates
      if (hasItemUpdates) {
        const updates = new Map<number, Partial<ItemEntry>>();
        for await (const update of this.manager.iterateJsonl<any>(this.contract.changes.items.updates)) {
          if (update.item_id !== undefined) {
            updates.set(Number(update.item_id), update);
          }
        }

        if (updates.size > 0) {
          const itemsPath = this.contract.datasets.items.path;
          const currentItems: ItemEntry[] = [];
          for await (const item of this.manager.iterateJsonl<ItemEntry>(itemsPath)) {
            const update = updates.get(item.item_id);
            if (update) {
              if (update.dst !== undefined) item.dst = update.dst;
              if (update.name_dst !== undefined) item.name_dst = update.name_dst;
              if (update.status !== undefined) item.status = update.status;
              updatedCounts["items"] = (updatedCounts["items"] ?? 0) + 1;
            }
            currentItems.push(item);
          }
          await this.manager.writeJsonl(itemsPath, currentItems);
        }
      }

      // 4. 应用 glossary changes
      if (hasGlossaryCreates || hasGlossaryUpdates || hasGlossaryDeletes) {
        const glossaryPath = this.contract.datasets.glossary.path;
        const currentGlossary: GlossaryEntry[] = [];
        for await (const entry of this.manager.iterateJsonl<GlossaryEntry>(glossaryPath)) {
          currentGlossary.push(entry);
        }

        // Deletes
        if (hasGlossaryDeletes) {
          const deleteIds = new Set<string>();
          for await (const del of this.manager.iterateJsonl<any>(this.contract.changes.glossary.deletes)) {
            if (del.id || del.entry_id) deleteIds.add(String(del.id ?? del.entry_id));
          }
          const filtered = currentGlossary.filter((e) => e.id && !deleteIds.has(e.id));
          updatedCounts["glossary_deletes"] = currentGlossary.length - filtered.length;
          currentGlossary.length = 0;
          currentGlossary.push(...filtered);
        }

        // Updates
        if (hasGlossaryUpdates) {
          const updateMap = new Map<string, Partial<GlossaryEntry>>();
          for await (const up of this.manager.iterateJsonl<any>(this.contract.changes.glossary.updates)) {
            const id = String(up.id ?? up.entry_id);
            updateMap.set(id, up);
          }
          for (let i = 0; i < currentGlossary.length; i++) {
            const entry = currentGlossary[i];
            if (entry.id) {
              const up = updateMap.get(entry.id);
              if (up) {
                currentGlossary[i] = normalizeGlossaryEntry({
                  ...entry,
                  ...up,
                });
                updatedCounts["glossary_updates"] = (updatedCounts["glossary_updates"] ?? 0) + 1;
              }
            }
          }
        }

        // Creates
        if (hasGlossaryCreates) {
          for await (const create of this.manager.iterateJsonl<any>(this.contract.changes.glossary.creates)) {
            const newEntry = normalizeGlossaryEntry(create);
            currentGlossary.push(newEntry);
            updatedCounts["glossary_creates"] = (updatedCounts["glossary_creates"] ?? 0) + 1;
          }
        }

        await this.manager.writeJsonl(glossaryPath, currentGlossary);
      }

      // 5. 应用 text_preserve changes
      if (hasTextPreserveCreates || hasTextPreserveUpdates || hasTextPreserveDeletes) {
        const textPreservePath = this.contract.datasets.text_preserve.path;
        const currentPreserve: TextPreserveEntry[] = [];
        for await (const entry of this.manager.iterateJsonl<TextPreserveEntry>(textPreservePath)) {
          currentPreserve.push(entry);
        }

        if (hasTextPreserveDeletes) {
          const deleteIds = new Set<string>();
          for await (const del of this.manager.iterateJsonl<any>(this.contract.changes.text_preserve.deletes)) {
            if (del.id || del.entry_id) deleteIds.add(String(del.id ?? del.entry_id));
          }
          const filtered = currentPreserve.filter((e) => e.id && !deleteIds.has(e.id));
          updatedCounts["text_preserve_deletes"] = currentPreserve.length - filtered.length;
          currentPreserve.length = 0;
          currentPreserve.push(...filtered);
        }

        if (hasTextPreserveUpdates) {
          const updateMap = new Map<string, Partial<TextPreserveEntry>>();
          for await (const up of this.manager.iterateJsonl<any>(this.contract.changes.text_preserve.updates)) {
            const id = String(up.id ?? up.entry_id);
            updateMap.set(id, up);
          }
          for (const entry of currentPreserve) {
            if (entry.id) {
              const up = updateMap.get(entry.id);
              if (up) {
                if (up.src !== undefined) entry.src = up.src;
                if (up.info !== undefined) entry.info = up.info;
                updatedCounts["text_preserve_updates"] = (updatedCounts["text_preserve_updates"] ?? 0) + 1;
              }
            }
          }
        }

        if (hasTextPreserveCreates) {
          for await (const create of this.manager.iterateJsonl<any>(this.contract.changes.text_preserve.creates)) {
            const newEntry: TextPreserveEntry = {
              id: create.id ?? `preserve_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              src: create.src,
              info: create.info,
            };
            currentPreserve.push(newEntry);
            updatedCounts["text_preserve_creates"] = (updatedCounts["text_preserve_creates"] ?? 0) + 1;
          }
        }

        await this.manager.writeJsonl(textPreservePath, currentPreserve);
      }

      // 6. 清理 changes 与 scratch
      await this.manager.resetChanges();
      await this.manager.resetScratch();

      const totalModifications = Object.values(updatedCounts).reduce((a, b) => a + b, 0);
      if (totalModifications === 0) {
        return { status: "unchanged" };
      }

      return {
        status: "applied",
        updated_counts: updatedCounts,
        timestamp,
      };
    } catch (err: any) {
      // 7. 发生异常，自动还原备份
      for (const relFile of filesToBackup) {
        const backupFile = path.join(backupDirPath, relFile);
        const targetFile = this.manager.resolvePath(relFile);
        if (fs.existsSync(backupFile)) {
          await fs.promises.copyFile(backupFile, targetFile);
        }
      }
      throw new Error(`workspace_apply failed and was rolled back: ${err.message || String(err)}`);
    }
  }
}
