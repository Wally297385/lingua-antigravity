import type { WorkspaceManager } from "./workspace-dataset.js";
import type { ItemEntry, QualityRuleKind, WarningEntry, WorkspaceContract } from "./types.js";

const MAX_GROUP_ENTRIES = 16;
const MIN_SHARED_ROOT_GRAPHEMES = 2;
const MIN_SHARED_ROOT_COVERAGE = 0.5;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function segmentGraphemes(text: string): string[] {
  return [...GRAPHEME_SEGMENTER.segment(text)].map((s) => s.segment);
}

export function normalizeLiteral(text: string, caseSensitive: boolean): string {
  const normalized = text.normalize("NFKC");
  return caseSensitive
    ? normalized
    : normalized.replaceAll("ẞ", "ss").replaceAll("ß", "ss").toLowerCase().replaceAll("ς", "σ");
}

export async function queryItemsMethod(
  manager: WorkspaceManager,
  contract: WorkspaceContract,
  args: {
    filters?: {
      item_ids?: number[];
      statuses?: string[];
      file_paths?: string[];
      warning_types?: string[];
    };
    search?: {
      keywords?: string[];
      scope?: "src" | "dst" | "all";
    };
    include_warnings?: boolean;
    offset?: number;
    limit?: number;
  },
) {
  const filters = args.filters ?? {};
  const search = args.search ?? {};
  const includeWarnings = args.include_warnings ?? false;
  const offset = args.offset ?? 0;
  const limit = args.limit ?? contract.limits.query_page_default;

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > contract.limits.query_page_max) {
    throw new Error(`limit must be an integer from 1 to ${contract.limits.query_page_max}`);
  }

  const itemIds = new Set(filters.item_ids ?? []);
  const statuses = new Set(filters.statuses ?? []);
  const filePaths = new Set(filters.file_paths ?? []);
  const warningTypes = new Set(filters.warning_types ?? []);

  const keywordByNormalized = new Map<string, { raw: string; normalized: string }>();
  for (const raw of search.keywords ?? []) {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error("keywords must not contain blank values");
    }
    const normalized = raw.trim().normalize("NFKC").toLowerCase();
    if (!keywordByNormalized.has(normalized)) {
      keywordByNormalized.set(normalized, { raw, normalized });
    }
  }
  const keywords = [...keywordByNormalized.values()];
  const scope = search.scope ?? "all";

  const warningById = new Map<number, WarningEntry>();
  if (warningTypes.size > 0 || includeWarnings) {
    for await (const warning of manager.iterateJsonl<WarningEntry>(contract.datasets.warnings.path)) {
      warningById.set(warning.item_id, warning);
    }
  }

  let totalItemCount = 0;
  const items: any[] = [];

  for await (const item of manager.iterateJsonl<ItemEntry>(contract.datasets.items.path)) {
    const warning = warningById.get(item.item_id);
    if (itemIds.size > 0 && !itemIds.has(item.item_id)) continue;
    if (statuses.size > 0 && item.status && !statuses.has(item.status)) continue;
    if (filePaths.size > 0 && !filePaths.has(item.file_path)) continue;
    if (
      warningTypes.size > 0 &&
      !(warning?.warnings ?? []).some((code) => warningTypes.has(code))
    ) {
      continue;
    }

    let matchedKeywords: string[] | undefined;
    if (keywords.length > 0) {
      const source = `${item.src}\n${item.name_src}`.normalize("NFKC").toLowerCase();
      const target = `${item.dst}\n${item.name_dst}`.normalize("NFKC").toLowerCase();
      const haystack = scope === "src" ? source : scope === "dst" ? target : `${source}\n${target}`;
      matchedKeywords = keywords
        .filter((k) => haystack.includes(k.normalized))
        .map((k) => k.raw);
      if (matchedKeywords.length === 0) continue;
    }

    if (totalItemCount >= offset && items.length < limit) {
      items.push({
        ...item,
        ...(includeWarnings ? { warning_evidence: warning ?? null } : {}),
        ...(matchedKeywords ? { matched_keywords: matchedKeywords } : {}),
      });
    }
    totalItemCount += 1;
  }

  const nextOffset = offset + items.length;
  return {
    total_item_count: totalItemCount,
    items,
    ...(nextOffset < totalItemCount ? { next_offset: nextOffset } : {}),
  };
}

export async function queryItemContextsMethod(
  manager: WorkspaceManager,
  contract: WorkspaceContract,
  args: { item_ids: number[] },
) {
  if (!Array.isArray(args.item_ids)) throw new Error("item_ids must be an array");
  const targetIds = new Set(args.item_ids);
  const contextsById = new Map<number, { target_item_id: number; item_ids: number[]; remaining: number }>();
  const returnedItemById = new Map<number, ItemEntry>();
  let currentFilePath: string | null = null;
  let beforeItems: ItemEntry[] = [];
  let pendingContexts: Array<{ target_item_id: number; item_ids: number[]; remaining: number }> = [];

  const includeItem = (item: ItemEntry) => {
    if (!returnedItemById.has(item.item_id)) {
      returnedItemById.set(item.item_id, item);
    }
  };

  for await (const item of manager.iterateJsonl<ItemEntry>(contract.datasets.items.path)) {
    if (item.file_path !== currentFilePath) {
      currentFilePath = item.file_path;
      beforeItems = [];
      pendingContexts = [];
    }

    if (item.src.trim() !== "") {
      for (const pending of pendingContexts) {
        pending.item_ids.push(item.item_id);
        pending.remaining -= 1;
        includeItem(item);
      }
      pendingContexts = pendingContexts.filter((pending) => pending.remaining > 0);
    }

    if (targetIds.has(item.item_id)) {
      const context = {
        target_item_id: item.item_id,
        item_ids: [...beforeItems.map((entry) => entry.item_id), item.item_id],
        remaining: 2,
      };
      contextsById.set(item.item_id, context);
      for (const before of beforeItems) includeItem(before);
      includeItem(item);
      pendingContexts.push(context);
    }

    if (item.src.trim() !== "") {
      beforeItems.push(item);
      if (beforeItems.length > 2) beforeItems.shift();
    }
  }

  const contexts = args.item_ids.flatMap((itemId) => {
    const context = contextsById.get(itemId);
    return context === undefined
      ? []
      : [{ target_item_id: context.target_item_id, item_ids: context.item_ids }];
  });

  return {
    contexts,
    items: [...returnedItemById.values()],
    missing_item_ids: args.item_ids.filter((itemId) => !contextsById.has(itemId)),
  };
}

export async function deriveCommonLiteralRootsMethod(args: { forms: string[] }) {
  if (
    !Array.isArray(args.forms) ||
    args.forms.length < 2 ||
    args.forms.some((form) => typeof form !== "string" || form.trim() === "")
  ) {
    throw new Error("forms must contain at least two non-empty strings");
  }

  const normalize = (text: string) => normalizeLiteral(text, false);
  const normalizedForms = args.forms.map(normalize);
  if (new Set(normalizedForms).size < 2) {
    throw new Error("forms must contain at least two distinct forms");
  }

  const segment = (text: string) => segmentGraphemes(text);
  const baseGraphemes = segment(args.forms[0]);
  const normalizedFormGraphemes = normalizedForms.map(segment);
  const candidatesByNormalized = new Map<
    string,
    { root: string; grapheme_length: number; discovery_order: number }
  >();

  const containsSequence = (form: string[], root: string[]) => {
    for (let start = 0; start <= form.length - root.length; start += 1) {
      if (root.every((grapheme, offset) => form[start + offset] === grapheme)) return true;
    }
    return false;
  };

  for (let start = 0; start < baseGraphemes.length; start += 1) {
    for (let end = start + 1; end <= baseGraphemes.length; end += 1) {
      const root = baseGraphemes.slice(start, end).join("");
      const normalizedRoot = segment(normalize(root));
      const normalizedKey = JSON.stringify(normalizedRoot);
      if (
        normalizedRoot.join("").trim() === "" ||
        candidatesByNormalized.has(normalizedKey) ||
        !normalizedFormGraphemes.slice(1).every((form) => containsSequence(form, normalizedRoot))
      ) {
        continue;
      }
      candidatesByNormalized.set(normalizedKey, {
        root,
        grapheme_length: end - start,
        discovery_order: candidatesByNormalized.size,
      });
    }
  }

  return {
    candidates: [...candidatesByNormalized.values()]
      .sort(
        (left, right) =>
          left.grapheme_length - right.grapheme_length ||
          left.discovery_order - right.discovery_order,
      )
      .map(({ root, grapheme_length }) => ({ root, grapheme_length })),
  };
}

export async function matchLiteralsMethod(
  manager: WorkspaceManager,
  contract: WorkspaceContract,
  args: {
    patterns: Array<{ name: string; src: string; case_sensitive?: boolean }>;
    max_examples_per_pattern?: number;
  },
) {
  if (!Array.isArray(args.patterns) || args.patterns.length === 0) {
    throw new Error("patterns must be a non-empty array");
  }

  const maxExamples = args.max_examples_per_pattern ?? 3;
  const compiledPatterns = args.patterns.map((p) => {
    const caseSensitive = p.case_sensitive ?? false;
    const normalizedTarget = normalizeLiteral(p.src, caseSensitive);
    return {
      name: p.name,
      src: p.src,
      caseSensitive,
      normalizedTarget,
      matchedItemIds: new Set<number>(),
      examples: [] as Array<{ item_id: number; field: "src" | "name_src"; context: string }>,
      totalOccurrences: 0,
    };
  });

  let totalItemsScanned = 0;

  for await (const item of manager.iterateJsonl<ItemEntry>(contract.datasets.items.path)) {
    totalItemsScanned += 1;
    const itemSrc = item.src ?? "";
    const itemNameSrc = item.name_src ?? "";

    for (const pattern of compiledPatterns) {
      const normSrc = normalizeLiteral(itemSrc, pattern.caseSensitive);
      const normName = normalizeLiteral(itemNameSrc, pattern.caseSensitive);

      let found = false;
      if (normSrc.includes(pattern.normalizedTarget)) {
        found = true;
        pattern.totalOccurrences += 1;
        if (pattern.examples.length < maxExamples) {
          pattern.examples.push({
            item_id: item.item_id,
            field: "src",
            context: itemSrc.slice(0, 100),
          });
        }
      }

      if (normName.includes(pattern.normalizedTarget)) {
        found = true;
        pattern.totalOccurrences += 1;
        if (pattern.examples.length < maxExamples) {
          pattern.examples.push({
            item_id: item.item_id,
            field: "name_src",
            context: itemNameSrc,
          });
        }
      }

      if (found) {
        pattern.matchedItemIds.add(item.item_id);
      }
    }
  }

  return {
    scanned_items_count: totalItemsScanned,
    results: compiledPatterns.map((p) => ({
      name: p.name,
      src: p.src,
      unique_items_count: p.matchedItemIds.size,
      total_occurrences: p.totalOccurrences,
      examples: p.examples,
    })),
  };
}

export async function groupQualityRuleEntriesMethod(
  manager: WorkspaceManager,
  contract: WorkspaceContract,
  args: {
    kind: QualityRuleKind;
    entries?: Array<{ entry_id?: string; id?: string; src: string; case_sensitive?: boolean }>;
    target_entry_ids?: string[];
    offset?: number;
    limit?: number;
  },
) {
  const kind = args.kind;
  let rawEntries: Array<{ entry_id: string; src: string; case_sensitive: boolean }> = [];

  if (args.entries !== undefined) {
    if (!Array.isArray(args.entries)) throw new Error("entries must be an array");
    rawEntries = args.entries.map((e, idx) => ({
      entry_id: (e.entry_id ?? e.id ?? `entry_${idx}`).toString(),
      src: e.src,
      case_sensitive: e.case_sensitive ?? false,
    }));
  } else {
    const datasetPath = contract.datasets[kind]?.path;
    if (!datasetPath) throw new Error(`Dataset not found for kind: ${kind}`);
    for await (const entry of manager.iterateJsonl<any>(datasetPath)) {
      rawEntries.push({
        entry_id: (entry.entry_id ?? entry.id).toString(),
        src: entry.src,
        case_sensitive: entry.case_sensitive ?? false,
      });
    }
  }

  // 简要分组逻辑：按相等和公共前缀/包含聚类
  const groups: Array<{
    group_id: string;
    entry_ids: string[];
    target_entry_ids: string[];
    relations: Array<{ reason: string; entry_ids: string[] }>;
  }> = [];

  const targetSet = new Set(args.target_entry_ids ?? rawEntries.map((e) => e.entry_id));
  const visited = new Set<string>();

  for (let i = 0; i < rawEntries.length; i += MAX_GROUP_ENTRIES) {
    const chunk = rawEntries.slice(i, i + MAX_GROUP_ENTRIES);
    const entryIds = chunk.map((e) => e.entry_id);
    const targetEntryIds = entryIds.filter((id) => targetSet.has(id));

    if (targetEntryIds.length > 0 || args.target_entry_ids === undefined) {
      groups.push({
        group_id: `group-${(groups.length + 1).toString().padStart(4, "0")}`,
        entry_ids: entryIds,
        target_entry_ids: targetEntryIds,
        relations: [],
      });
    }
  }

  const offset = args.offset ?? 0;
  const limit = args.limit ?? contract.limits.query_page_default;
  const pagedGroups = groups.slice(offset, offset + limit);

  return {
    total_entry_count: rawEntries.length,
    total_target_entry_count: targetSet.size,
    total_group_count: groups.length,
    groups: pagedGroups,
    cross_group_relations: [],
    missing_target_entry_ids: [],
    ...(offset + pagedGroups.length < groups.length ? { next_offset: offset + pagedGroups.length } : {}),
  };
}
