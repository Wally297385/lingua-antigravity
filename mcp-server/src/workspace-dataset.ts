import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import ExcelJS from "exceljs";
import type { GlossaryEntry, ProjectMeta, WorkspaceContract } from "./types.js";

export const DEFAULT_CONTRACT: WorkspaceContract = {
  limits: {
    query_page_default: 50,
    query_page_max: 200,
    result_bytes: 65536,
  },
  datasets: {
    items: { path: "items/entries.jsonl" },
    warnings: { path: "items/warnings.jsonl" },
    glossary: { path: "glossary/entries.jsonl" },
    text_preserve: { path: "text_preserve/entries.jsonl" },
    pre_replacement: { path: "pre_replacement/entries.jsonl" },
    post_replacement: { path: "post_replacement/entries.jsonl" },
    prompts: { path: "prompts.json" },
  },
  changes: {
    items: { updates: "changes/items/updates.jsonl" },
    prompts: { updates: "changes/prompts/updates.jsonl" },
    glossary: {
      creates: "changes/glossary/creates.jsonl",
      updates: "changes/glossary/updates.jsonl",
      deletes: "changes/glossary/deletes.jsonl",
      moves: "changes/glossary/moves.jsonl",
    },
    text_preserve: {
      creates: "changes/text_preserve/creates.jsonl",
      updates: "changes/text_preserve/updates.jsonl",
      deletes: "changes/text_preserve/deletes.jsonl",
      moves: "changes/text_preserve/moves.jsonl",
    },
    pre_replacement: {
      creates: "changes/pre_replacement/creates.jsonl",
      updates: "changes/pre_replacement/updates.jsonl",
      deletes: "changes/pre_replacement/deletes.jsonl",
      moves: "changes/pre_replacement/moves.jsonl",
    },
    post_replacement: {
      creates: "changes/post_replacement/creates.jsonl",
      updates: "changes/post_replacement/updates.jsonl",
      deletes: "changes/post_replacement/deletes.jsonl",
      moves: "changes/post_replacement/moves.jsonl",
    },
  },
  effects: {
    item_updates: ["dst", "name_dst", "status"],
  },
};

export function normalizeGlossaryEntry(entry: any): GlossaryEntry {
  return {
    id: entry.id ?? `glossary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    src: String(entry.src ?? "").trim(),
    dst: String(entry.dst ?? "").trim(),
    info: String(entry.info ?? "").trim(),
    regex: Boolean(entry.regex ?? false),
    case_sensitive: Boolean(entry.case_sensitive ?? false),
  };
}

export class WorkspaceManager {
  private workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot ?? process.env["WORKSPACE_ROOT"] ?? process.cwd();
  }

  public getRoot(): string {
    return this.workspaceRoot;
  }

  public setRoot(newRoot: string): void {
    this.workspaceRoot = newRoot;
  }

  public resolvePath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(this.workspaceRoot, normalized);
  }

  public async initializeWorkspace(): Promise<void> {
    const root = this.workspaceRoot;
    const dirsToEnsure = [
      path.join(root, "items"),
      path.join(root, "glossary"),
      path.join(root, "text_preserve"),
      path.join(root, "pre_replacement"),
      path.join(root, "post_replacement"),
      path.join(root, "task"),
      path.join(root, "scratch"),
      path.join(root, "changes", "items"),
      path.join(root, "changes", "glossary"),
      path.join(root, "changes", "text_preserve"),
      path.join(root, "changes", "pre_replacement"),
      path.join(root, "changes", "post_replacement"),
      path.join(root, "changes", "prompts"),
    ];

    for (const dir of dirsToEnsure) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    await this.resetChanges();
    await this.resetScratch();
  }

  public async resetChanges(): Promise<void> {
    const changesRoot = path.join(this.workspaceRoot, "changes");
    if (fs.existsSync(changesRoot)) {
      await fs.promises.rm(changesRoot, { recursive: true, force: true });
    }
    await fs.promises.mkdir(changesRoot, { recursive: true });
  }

  public async resetScratch(): Promise<void> {
    const scratchRoot = path.join(this.workspaceRoot, "scratch");
    if (fs.existsSync(scratchRoot)) {
      await fs.promises.rm(scratchRoot, { recursive: true, force: true });
    }
    await fs.promises.mkdir(scratchRoot, { recursive: true });
  }

  public async countJsonl(relativePath: string): Promise<number> {
    const fullPath = this.resolvePath(relativePath);
    if (!fs.existsSync(fullPath)) return 0;
    let count = 0;
    const stream = fs.createReadStream(fullPath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.trim() !== "") count += 1;
    }
    return count;
  }

  public async loadProjectMeta(): Promise<ProjectMeta> {
    const metaPath = this.resolvePath("project_meta.json");
    let baseMeta: Partial<ProjectMeta> = {};
    if (fs.existsSync(metaPath)) {
      try {
        baseMeta = JSON.parse(await fs.promises.readFile(metaPath, "utf-8"));
      } catch {
        // ignore parse error, fallback
      }
    }

    const itemsCount = await this.countJsonl("items/entries.jsonl");
    const warningsCount = await this.countJsonl("items/warnings.jsonl");
    const glossaryCount = await this.countJsonl("glossary/entries.jsonl");
    const textPreserveCount = await this.countJsonl("text_preserve/entries.jsonl");
    const preReplacementCount = await this.countJsonl("pre_replacement/entries.jsonl");
    const postReplacementCount = await this.countJsonl("post_replacement/entries.jsonl");

    return {
      source_language: baseMeta.source_language ?? "ja",
      target_language: baseMeta.target_language ?? "zh-CN",
      counts: {
        files: baseMeta.files?.length ?? (itemsCount > 0 ? 1 : 0),
        items: itemsCount,
        items_with_warnings: warningsCount,
        glossary: glossaryCount,
        text_preserve: textPreserveCount,
        pre_replacement: preReplacementCount,
        post_replacement: postReplacementCount,
      },
      files: baseMeta.files ?? [
        {
          file_path: "main.txt",
          file_type: "plain_text",
        },
      ],
    };
  }

  public async readJson<T>(relativePath: string): Promise<T> {
    const fullPath = this.resolvePath(relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    const content = await fs.promises.readFile(fullPath, "utf-8");
    return JSON.parse(content) as T;
  }

  public async writeJson<T>(relativePath: string, data: T): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, JSON.stringify(data, null, 2), "utf-8");
  }

  public async *iterateJsonl<T>(relativePath: string): AsyncIterable<T> {
    const fullPath = this.resolvePath(relativePath);
    if (!fs.existsSync(fullPath)) return;
    const stream = fs.createReadStream(fullPath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed !== "") {
        yield JSON.parse(trimmed) as T;
      }
    }
  }

  public async writeJsonl<T>(relativePath: string, rows: T[]): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    const lines = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
    await fs.promises.writeFile(fullPath, lines, "utf-8");
  }

  public async appendJsonl<T>(relativePath: string, rows: T[]): Promise<void> {
    if (rows.length === 0) return;
    const fullPath = this.resolvePath(relativePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    const lines = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
    await fs.promises.appendFile(fullPath, lines, "utf-8");
  }

  /**
   * 导出当前工作区的术语表为与 LinguaGacha 100% 兼容的 JSON 或 Excel (.xlsx) 格式 (参考 露西.json / 露西.xlsx)
   */
  public async exportGlossary(
    targetPath: string,
    options?: { format?: "json" | "xlsx" | "jsonl" },
  ): Promise<{ path: string; count: number }> {
    const fullPath = this.resolvePath(targetPath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

    const entries: GlossaryEntry[] = [];
    for await (const raw of this.iterateJsonl<any>(DEFAULT_CONTRACT.datasets.glossary.path)) {
      entries.push(normalizeGlossaryEntry(raw));
    }

    const lowerPath = targetPath.toLowerCase();
    const format = options?.format ?? (lowerPath.endsWith(".xlsx") ? "xlsx" : lowerPath.endsWith(".jsonl") ? "jsonl" : "json");

    if (format === "xlsx" || lowerPath.endsWith(".xlsx")) {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("rules");
      worksheet.columns = [
        { width: 24 },
        { width: 24 },
        { width: 24 },
        { width: 24 },
        { width: 24 },
      ];

      // 表头: src, dst, info, regex, case_sensitive
      const headers = ["src", "dst", "info", "regex", "case_sensitive"];
      headers.forEach((h, idx) => {
        const cell = worksheet.getCell(1, idx + 1);
        cell.value = h;
        cell.font = { size: 10, bold: true };
      });

      entries.forEach((entry, idx) => {
        const row = idx + 2;
        worksheet.getCell(row, 1).value = entry.src;
        worksheet.getCell(row, 2).value = entry.dst;
        worksheet.getCell(row, 3).value = entry.info;
        worksheet.getCell(row, 4).value = entry.regex;
        worksheet.getCell(row, 5).value = entry.case_sensitive;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      await fs.promises.writeFile(fullPath, Buffer.from(buffer));
    } else if (format === "jsonl") {
      await this.writeJsonl(targetPath, entries);
    } else {
      // JSON 数组格式（4 空格缩进，与 露西.json 完全一致）
      const exportJson = entries.map((e) => ({
        src: e.src,
        dst: e.dst,
        info: e.info,
        regex: e.regex,
        case_sensitive: e.case_sensitive,
      }));
      await fs.promises.writeFile(fullPath, JSON.stringify(exportJson, null, 4), "utf-8");
    }

    return { path: fullPath, count: entries.length };
  }

  /**
   * 从外部 LinguaGacha 导出的 .json 或 .xlsx 格式文件导入术语表到工作区
   */
  public async importGlossary(sourcePath: string): Promise<{ count: number }> {
    const fullPath = this.resolvePath(sourcePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Glossary file not found: ${sourcePath}`);
    }

    const lowerPath = sourcePath.toLowerCase();
    const importedEntries: GlossaryEntry[] = [];

    if (lowerPath.endsWith(".xlsx")) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(fullPath);
      const worksheet = workbook.worksheets[0];
      if (worksheet) {
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // 跳过表头
          const src = String(row.getCell(1).value ?? "").trim();
          const dst = String(row.getCell(2).value ?? "").trim();
          if (src === "" || (src === "src" && dst === "dst")) return;
          const info = String(row.getCell(3).value ?? "").trim();
          const regexVal = row.getCell(4).value;
          const caseVal = row.getCell(5).value;
          importedEntries.push(
            normalizeGlossaryEntry({
              src,
              dst,
              info,
              regex: regexVal === true || String(regexVal).toLowerCase() === "true",
              case_sensitive: caseVal === true || String(caseVal).toLowerCase() === "true",
            }),
          );
        });
      }
    } else {
      const content = await fs.promises.readFile(fullPath, "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && typeof item === "object" && "src" in item) {
            importedEntries.push(normalizeGlossaryEntry(item));
          }
        }
      } else if (typeof data === "object" && data !== null) {
        for (const [src, dst] of Object.entries(data)) {
          importedEntries.push(
            normalizeGlossaryEntry({
              src,
              dst: String(dst ?? ""),
              info: "",
              regex: false,
              case_sensitive: false,
            }),
          );
        }
      }
    }

    if (importedEntries.length > 0) {
      await this.writeJsonl(DEFAULT_CONTRACT.datasets.glossary.path, importedEntries);
    }

    return { count: importedEntries.length };
  }
}
