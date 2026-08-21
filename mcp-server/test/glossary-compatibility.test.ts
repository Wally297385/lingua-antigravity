import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import ExcelJS from "exceljs";
import { WorkspaceManager, DEFAULT_CONTRACT } from "../src/workspace-dataset.js";
import { WorkspaceApplier } from "../src/workspace-apply.js";

describe("LinguaGacha Glossary Compatibility (露西.json & 露西.xlsx)", () => {
  let tmpDir: string;
  let manager: WorkspaceManager;
  let applier: WorkspaceApplier;

  const sampleEntries = [
    {
      src: "ルーシィ",
      dst: "露西",
      info: "主角的伙伴宠物（粉色粘液生物，魔法少女的吉祥物），可变身为女性魔法少女",
      regex: false,
      case_sensitive: false,
    },
    {
      src: "天神川恵梨香",
      dst: "天神川惠梨香",
      info: "女性，伊丽莎白（枪骑兵·伊丽莎白）的本名",
      regex: false,
      case_sensitive: false,
    },
    {
      src: "イア",
      dst: "咿呀",
      info: "邪神系存在的呼喊/口癖；仅在该词独立作感叹呼喊时采用本条，其他词按普通词翻译",
      regex: false,
      case_sensitive: false,
    },
  ];

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lingua-glossary-test-"));
    manager = new WorkspaceManager(tmpDir);
    await manager.initializeWorkspace();
    applier = new WorkspaceApplier(manager, DEFAULT_CONTRACT);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("exports glossary to JSON matching 露西.json format (4-space indent, 5 standard fields)", async () => {
    await manager.writeJsonl(DEFAULT_CONTRACT.datasets.glossary.path, sampleEntries);

    const exportPath = path.join(tmpDir, "exported.json");
    const res = await manager.exportGlossary(exportPath, { format: "json" });
    expect(res.count).toBe(3);

    const jsonContent = await fs.promises.readFile(exportPath, "utf-8");
    const parsed = JSON.parse(jsonContent);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({
      src: "ルーシィ",
      dst: "露西",
      info: "主角的伙伴宠物（粉色粘液生物，魔法少女的吉祥物），可变身为女性魔法少女",
      regex: false,
      case_sensitive: false,
    });
    // 验证4空格缩进
    expect(jsonContent).toContain('    {\n        "src": "ルーシィ"');
  });

  it("exports glossary to Excel (.xlsx) matching 露西.xlsx format (rules sheet, 5 columns)", async () => {
    await manager.writeJsonl(DEFAULT_CONTRACT.datasets.glossary.path, sampleEntries);

    const exportXlsx = path.join(tmpDir, "exported.xlsx");
    const res = await manager.exportGlossary(exportXlsx, { format: "xlsx" });
    expect(res.count).toBe(3);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(exportXlsx);
    const ws = wb.getWorksheet("rules");
    expect(ws).toBeDefined();

    // 验证表头
    expect(ws?.getCell(1, 1).value).toBe("src");
    expect(ws?.getCell(1, 2).value).toBe("dst");
    expect(ws?.getCell(1, 3).value).toBe("info");
    expect(ws?.getCell(1, 4).value).toBe("regex");
    expect(ws?.getCell(1, 5).value).toBe("case_sensitive");

    // 验证第一行数据
    expect(ws?.getCell(2, 1).value).toBe("ルーシィ");
    expect(ws?.getCell(2, 2).value).toBe("露西");
    expect(ws?.getCell(2, 4).value).toBe(false);
    expect(ws?.getCell(2, 5).value).toBe(false);
  });

  it("imports real or fixture 露西.json and verifies full fidelity", async () => {
    let lucyJsonPath = path.resolve(process.cwd(), "../露西.json");
    if (!fs.existsSync(lucyJsonPath)) {
      lucyJsonPath = path.join(tmpDir, "lucy_fixture.json");
      await fs.promises.writeFile(lucyJsonPath, JSON.stringify(sampleEntries, null, 4), "utf-8");
    }
    const res = await manager.importGlossary(lucyJsonPath);
    expect(res.count).toBeGreaterThanOrEqual(3);

    const items: any[] = [];
    for await (const item of manager.iterateJsonl(DEFAULT_CONTRACT.datasets.glossary.path)) {
      items.push(item);
    }
    expect(items.length).toBe(res.count);
    expect(items[0].src).toBe("ルーシィ");
    expect(items[0].dst).toBe("露西");
    expect(items[0].regex).toBe(false);
    expect(items[0].case_sensitive).toBe(false);
  });

  it("applies glossary creates with 5-field schema correctly", async () => {
    const creates = [
      {
        src: "ダークネス・ルーシィ",
        dst: "暗黑露西",
        info: "主角变身后的魔法少女名（女性形态）",
        regex: false,
        case_sensitive: false,
      },
    ];
    await manager.writeJsonl(DEFAULT_CONTRACT.changes.glossary.creates, creates);

    const applyRes = await applier.apply();
    expect(applyRes.status).toBe("applied");
    expect(applyRes.updated_counts?.glossary_creates).toBe(1);

    const items: any[] = [];
    for await (const item of manager.iterateJsonl(DEFAULT_CONTRACT.datasets.glossary.path)) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
    expect(items[0].src).toBe("ダークネス・ルーシィ");
    expect(items[0].regex).toBe(false);
    expect(items[0].case_sensitive).toBe(false);
  });
});
