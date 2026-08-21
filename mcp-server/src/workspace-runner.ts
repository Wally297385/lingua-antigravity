import * as vm from "node:vm";
import * as path from "node:path";
import { DEFAULT_CONTRACT, type WorkspaceManager } from "./workspace-dataset.js";
import {
  deriveCommonLiteralRootsMethod,
  groupQualityRuleEntriesMethod,
  matchLiteralsMethod,
  queryItemContextsMethod,
  queryItemsMethod,
} from "./workspace-methods.js";
import type { WorkspaceContract } from "./types.js";

export class WorkspaceRunner {
  private manager: WorkspaceManager;
  private contract: WorkspaceContract;

  constructor(manager: WorkspaceManager, contract: WorkspaceContract = DEFAULT_CONTRACT) {
    this.manager = manager;
    this.contract = contract;
  }

  private assertWritablePath(relativePath: string): void {
    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const allowedPrefixes = ["changes/", "task/", "scratch/"];
    if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
      throw new Error(
        `Permission denied: Cannot write to path '${relativePath}'. Writable paths must start with changes/, task/, or scratch/.`,
      );
    }
  }

  public createWorkspaceFacade(): Record<string, any> {
    const manager = this.manager;
    const contract = this.contract;

    return {
      contract,
      readJson: async (relPath: string) => manager.readJson(relPath),
      writeJson: async (relPath: string, data: any) => {
        this.assertWritablePath(relPath);
        return manager.writeJson(relPath, data);
      },
      iterateJsonl: (relPath: string) => manager.iterateJsonl(relPath),
      writeJsonl: async (relPath: string, rows: any[]) => {
        this.assertWritablePath(relPath);
        return manager.writeJsonl(relPath, rows);
      },
      appendJsonl: async (relPath: string, rows: any[]) => {
        this.assertWritablePath(relPath);
        return manager.appendJsonl(relPath, rows);
      },
      queryItems: async (args: any) => queryItemsMethod(manager, contract, args),
      queryItemContexts: async (args: any) => queryItemContextsMethod(manager, contract, args),
      groupQualityRuleEntries: async (args: any) =>
        groupQualityRuleEntriesMethod(manager, contract, args),
      deriveCommonLiteralRoots: async (args: any) => deriveCommonLiteralRootsMethod(args),
      matchLiterals: async (args: any) => matchLiteralsMethod(manager, contract, args),
      exportGlossary: async (targetPath: string, options?: any) => manager.exportGlossary(targetPath, options),
      importGlossary: async (sourcePath: string) => manager.importGlossary(sourcePath),
    };
  }

  public async runScript(scriptCode: string): Promise<any> {
    if (typeof scriptCode !== "string" || scriptCode.trim() === "") {
      throw new Error("Script code must be a non-empty string");
    }

    const workspaceFacade = this.createWorkspaceFacade();

    // 构建 VM 运行上下文
    const sandbox = {
      workspace: workspaceFacade,
      console: {
        log: () => {},
        error: () => {},
        warn: () => {},
        info: () => {},
      },
      Intl,
      Math,
      Date,
      JSON,
      Set,
      Map,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Promise,
      Error,
      TypeError,
      RangeError,
      setTimeout,
      clearTimeout,
    };

    const context = vm.createContext(sandbox);

    // 封装入口脚本执行
    const wrappedScript = `
      (async function() {
        ${scriptCode}
        if (typeof main !== 'function') {
          throw new Error("Script must declare 'async function main(workspace) { ... }'");
        }
        return await main(workspace);
      })()
    `;

    let result: any;
    try {
      const compiled = new vm.Script(wrappedScript);
      result = await compiled.runInContext(context, { timeout: 30000 });
    } catch (err: any) {
      throw new Error(`Workspace script execution failed: ${err.message || String(err)}`);
    }

    if (result === undefined) {
      throw new Error("Workspace script main() must return a JSON-serializable value");
    }

    const serialized = JSON.stringify(result);
    const byteLength = Buffer.byteLength(serialized, "utf-8");
    if (byteLength > this.contract.limits.result_bytes) {
      throw new Error(
        `Workspace script result exceeded limit of ${this.contract.limits.result_bytes} bytes (got ${byteLength} bytes)`,
      );
    }

    return result;
  }
}
