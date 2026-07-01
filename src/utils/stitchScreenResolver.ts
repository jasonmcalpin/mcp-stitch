import type { StitchClient } from "../services/stitchClient.js";
import type { JsonObject } from "../models/stitch.js";
import {
  toBareProjectId,
  toScreenIdentifier,
  type StitchScreenIdentifier,
} from "./stitchIds.js";

type ScreenSummary = {
  name: string;
  screenId: string;
  title?: string;
};

type ResolveScreenSuccess = {
  ok: true;
  input: JsonObject;
  resolver: {
    requested: string;
    projectId?: string;
    strategy: "full-resource-name" | "list-screens-match";
    matchedName: string;
    matchedScreenId: string;
    matchedTitle?: string;
  };
};

type ResolveScreenFailure = {
  ok: false;
  error: string;
};

export type ResolveScreenResult = ResolveScreenSuccess | ResolveScreenFailure;

function normalizeLookupText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toScreenId(name: string): string {
  const marker = "/screens/";
  const index = name.indexOf(marker);
  return index >= 0 ? name.slice(index + marker.length) : name;
}

function toScreenSummary(value: unknown): ScreenSummary | null {
  if (!value || typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;
  const name = getString(obj, "name") ?? getString(obj, "sourceScreen");
  if (!name) return null;

  const title = getString(obj, "title");

  return {
    name,
    screenId: getString(obj, "screenId") ?? getString(obj, "id") ?? toScreenId(name),
    ...(title ? { title } : {}),
  };
}

function parseContentJson(data: Record<string, unknown>): unknown {
  const content = data.content;
  if (!Array.isArray(content)) return null;

  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const text = (item as Record<string, unknown>).text;
    if (typeof text !== "string") continue;

    try {
      return JSON.parse(text) as unknown;
    } catch {
      continue;
    }
  }

  return null;
}

function extractScreens(data: unknown): ScreenSummary[] {
  if (!data || typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;
  const structuredContent = obj.structuredContent;
  const source =
    structuredContent && typeof structuredContent === "object"
      ? structuredContent
      : parseContentJson(obj);

  if (!source || typeof source !== "object") return [];

  const screens = (source as Record<string, unknown>).screens;
  if (!Array.isArray(screens)) return [];

  return screens
    .map((screen) => toScreenSummary(screen))
    .filter((screen): screen is ScreenSummary => Boolean(screen));
}

function toIdentifier(screen: ScreenSummary): StitchScreenIdentifier | null {
  return toScreenIdentifier(screen.name);
}

function formatScreen(screen: ScreenSummary): string {
  const title = screen.title ? ` title="${screen.title}"` : "";
  return `- ${screen.name} (screenId: ${screen.screenId}${title})`;
}

function ambiguityError(lookup: string, matches: ScreenSummary[]): string {
  return [
    `Ambiguous screen lookup: "${lookup}" matched ${matches.length} screens.`,
    "Use a full screen resource name or one of these screen ids:",
    ...matches.map((match) => formatScreen(match)),
  ].join("\n");
}

function notFoundError(lookup: string, projectId: string): string {
  return `No screen matched "${lookup}" in project ${projectId}. Use stitch_list_screens to inspect available screens, then retry with a full screen resource name or exact screen id.`;
}

function identifierFieldsForMatch(screen: ScreenSummary): string[] {
  return [screen.name, screen.screenId];
}

function lookupFieldsForMatch(screen: ScreenSummary): string[] {
  return [screen.name, screen.screenId, screen.title ?? ""].filter((value) => value.length > 0);
}

function findMatches(lookup: string, screens: ScreenSummary[]): ScreenSummary[] {
  const normalizedLookup = normalizeLookupText(lookup);
  const exactIdentifierMatches = screens.filter((screen) =>
    identifierFieldsForMatch(screen).some((field) => normalizeLookupText(field) === normalizedLookup)
  );

  if (exactIdentifierMatches.length > 0) {
    return exactIdentifierMatches;
  }

  return screens.filter((screen) =>
    lookupFieldsForMatch(screen).some((field) => normalizeLookupText(field).includes(normalizedLookup))
  );
}

export async function resolveScreenInput(options: {
  client: StitchClient;
  screenIdOrName: string;
  projectIdOrName?: string | undefined;
}): Promise<ResolveScreenResult> {
  const directIdentifier = toScreenIdentifier(options.screenIdOrName);
  if (directIdentifier) {
    return {
      ok: true,
      input: directIdentifier,
      resolver: {
        requested: options.screenIdOrName,
        projectId: directIdentifier.projectId,
        strategy: "full-resource-name",
        matchedName: directIdentifier.name,
        matchedScreenId: directIdentifier.screenId,
      },
    };
  }

  if (!options.projectIdOrName) {
    return {
      ok: false,
      error:
        "Invalid screen lookup: provide a full screen resource name, or provide projectId with a screen id/title fragment.",
    };
  }

  const projectId = toBareProjectId(options.projectIdOrName);
  const listResult = await options.client.callTool({
    toolName: "list_screens",
    input: { projectId },
  });

  if (!listResult.ok) {
    return {
      ok: false,
      error: `Failed to resolve screen lookup because list_screens failed.\n\n${listResult.error}`,
    };
  }

  const screens = extractScreens(listResult.data);
  const matches = findMatches(options.screenIdOrName, screens);

  if (matches.length === 0) {
    return { ok: false, error: notFoundError(options.screenIdOrName, projectId) };
  }

  if (matches.length > 1) {
    return { ok: false, error: ambiguityError(options.screenIdOrName, matches) };
  }

  const match = matches[0];
  if (!match) {
    return { ok: false, error: notFoundError(options.screenIdOrName, projectId) };
  }

  const identifier = toIdentifier(match);
  if (!identifier) {
    return {
      ok: false,
      error: `Matched screen "${match.name}" but could not build a get_screen identifier.`,
    };
  }

  return {
    ok: true,
    input: identifier,
    resolver: {
      requested: options.screenIdOrName,
      projectId,
      strategy: "list-screens-match",
      matchedName: identifier.name,
      matchedScreenId: identifier.screenId,
      ...(match.title ? { matchedTitle: match.title } : {}),
    },
  };
}
