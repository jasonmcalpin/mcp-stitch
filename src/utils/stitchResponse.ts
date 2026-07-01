type SummaryOptions = {
  title: string;
  data: unknown;
  itemKeys?: string[];
  idKeys?: string[];
  maxPreviewChars?: number;
};

const DEFAULT_ITEM_KEYS = ["projects", "screens", "items", "results"];
const DEFAULT_ID_KEYS = ["name", "id", "project", "projectId", "screenId", "title"];

export function safeJsonPreview(value: unknown, maxChars = 1200): string {
  const text = JSON.stringify(value, null, 2) ?? "null";

  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n... [truncated ${text.length - maxChars} chars]`;
}

function findItems(data: unknown, itemKeys: string[]): unknown[] | null {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const obj = data as Record<string, unknown>;

  for (const key of itemKeys) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function pickSampleIds(items: unknown[], idKeys: string[]): string[] {
  const ids: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const obj = item as Record<string, unknown>;

    for (const key of idKeys) {
      const value = obj[key];
      if (typeof value === "string" && value.trim().length > 0) {
        ids.push(value.trim());
        break;
      }
    }

    if (ids.length >= 5) {
      break;
    }
  }

  return ids;
}

export function formatStitchSummary(options: SummaryOptions): string {
  const itemKeys = options.itemKeys ?? DEFAULT_ITEM_KEYS;
  const idKeys = options.idKeys ?? DEFAULT_ID_KEYS;
  const maxPreviewChars = options.maxPreviewChars ?? 1200;
  const items = findItems(options.data, itemKeys);
  const ids = items ? pickSampleIds(items, idKeys) : [];

  const lines = [options.title, ""];

  if (items) {
    lines.push(`Item count: ${items.length}`);
  }

  if (ids.length > 0) {
    lines.push(`Sample ids: ${ids.join(", ")}`);
  }

  if (options.data && typeof options.data === "object" && !Array.isArray(options.data)) {
    const keys = Object.keys(options.data as Record<string, unknown>);
    lines.push(`Top-level keys: ${keys.slice(0, 10).join(", ") || "(none)"}`);
  }

  lines.push("", "Preview:", safeJsonPreview(options.data, maxPreviewChars));

  return lines.join("\n");
}
