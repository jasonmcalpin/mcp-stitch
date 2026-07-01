import type { JsonObject, StitchCallResponse } from "../models/stitch.js";
import { formatStitchSummary } from "./stitchResponse.js";

export function toErrorText(prefix: string, message: string): string {
  return `${prefix}\n\n${message}`;
}

export function requireConfirmation(action: string, confirm?: boolean): string | null {
  return confirm === true
    ? null
    : `${action} is a mutating Stitch operation. Re-run with confirm: true to proceed.`;
}

export function compactStitchResult(title: string, result: StitchCallResponse): string {
  if (!result.ok) {
    return toErrorText(`${title} failed.`, result.error);
  }

  return formatStitchSummary({
    title,
    data: result.data,
    itemKeys: ["projects", "screens", "assets", "designSystems", "items", "results", "outputComponents"],
    idKeys: ["name", "id", "projectId", "screenId", "assetId", "title", "displayName"],
    maxPreviewChars: 900,
  });
}

export function jsonObjectFromRaw(rawInput: JsonObject | undefined): JsonObject | undefined {
  return rawInput;
}
