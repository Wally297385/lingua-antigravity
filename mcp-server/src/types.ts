export type QualityRuleKind = "glossary" | "text_preserve" | "pre_replacement" | "post_replacement";

export interface ItemEntry {
  item_id: number;
  src: string;
  dst: string;
  name_src: string;
  name_dst: string;
  file_path: string;
  text_type?: string;
  row_number?: number;
  status?: string;
  retry_count?: number;
}

export interface WarningEntry {
  item_id: number;
  warnings: string[];
  warning_fragments_by_code?: Record<string, string[]>;
  glossary_applications?: Array<{
    entry_id: string;
    src: string;
    dst: string;
    case_sensitive?: boolean;
    fields?: Array<{ name: string; ranges: Array<[number, number]> }>;
  }>;
}

/**
 * LinguaGacha 标准术语表格式规范 (参考 露西.json / 露西.xlsx)
 */
export interface GlossaryEntry {
  id?: string;
  src: string;
  dst: string;
  info: string;
  regex: boolean;
  case_sensitive: boolean;
}

export interface TextPreserveEntry {
  id?: string;
  src: string;
  info?: string;
  regex?: boolean;
  case_sensitive?: boolean;
}

export interface ReplacementEntry {
  id?: string;
  src: string;
  dst: string;
  regex?: boolean;
  case_sensitive?: boolean;
}

export interface ProjectMeta {
  source_language: string;
  target_language: string;
  counts: {
    files: number;
    items: number;
    items_with_warnings: number;
    glossary: number;
    text_preserve: number;
    pre_replacement: number;
    post_replacement: number;
  };
  files: Array<{
    file_path: string;
    file_type: string;
    source_text_path?: string;
    source_text_root?: string;
  }>;
}

export interface WorkspaceContract {
  limits: {
    query_page_default: number;
    query_page_max: number;
    result_bytes: number;
  };
  datasets: {
    items: { path: string };
    warnings: { path: string };
    glossary: { path: string };
    text_preserve: { path: string };
    pre_replacement: { path: string };
    post_replacement: { path: string };
    prompts: { path: string };
  };
  changes: {
    items: { updates: string };
    prompts: { updates: string };
    glossary: { creates: string; updates: string; deletes: string; moves: string };
    text_preserve: { creates: string; updates: string; deletes: string; moves: string };
    pre_replacement: { creates: string; updates: string; deletes: string; moves: string };
    post_replacement: { creates: string; updates: string; deletes: string; moves: string };
  };
  effects: {
    item_updates: string[];
  };
}

export interface TaskProgressState {
  status: "idle" | "running" | "completed" | "cancelled";
  tasks: string[];
  completed: string[];
  current_step: string | null;
}
