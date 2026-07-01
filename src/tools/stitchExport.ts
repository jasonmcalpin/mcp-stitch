import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getStitchConfig } from "../config/stitch.js";
import type { JsonObject } from "../models/stitch.js";
import { StitchClient } from "../services/stitchClient.js";
import {
  prepareSafeOutputPath,
  sanitizeFileName,
} from "../utils/safePath.js";
import { toScreenIdentifier } from "../utils/stitchIds.js";
import { resolveScreenInput, type ResolveScreenResult } from "../utils/stitchScreenResolver.js";

const ARTIFACT_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const ARTIFACT_FILES = [
  "raw.json",
  "screen-summary.md",
  "implementation-context.md",
  "implementation-plan.md",
  "component-map.json",
  "copy.md",
  "style-notes.md",
  "build-prompt.md",
  "acceptance-criteria.md",
  "test-plan.md",
  "questions.md",
  "manifest.json",
] as const;
const DEFAULT_ARTIFACT_ROOT = ".artifacts/stitch";

type ComponentMapSection = {
  name: string;
  provenance: "extracted" | "inferred";
  rationale: string;
  likelyComponents: Array<{
    name: string;
    provenance: "extracted" | "inferred";
    labels: string[];
    interactions: string[];
  }>;
};

type CopyFacts = {
  visibleText: string[];
  possibleUserFacingText: string[];
  generationContextText: string[];
};

function isSafeRelativePathInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (path.isAbsolute(trimmed)) return false;

  const segments = trimmed.split(/[\\/]+/);
  if (segments.length === 0) return false;

  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return false;
    if (segment.includes(":")) return false;
  }

  return true;
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function defaultArtifactName(screenId?: string): string {
  const suffix = screenId ? sanitizeFileName(screenId) : "screen";
  return `stitch-${suffix}-${nowStamp()}`;
}

function slugifyArtifactSegment(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "screen";
}

type OutputBaseRootResult =
  | { ok: true; baseRoot: string; source: "PROJECT_ROOT" | "STITCH_OUTPUT_DIR" }
  | { ok: false; error: string };

async function getBaseRoot(configOutputDir: string): Promise<OutputBaseRootResult> {
  const projectRoot = process.env.PROJECT_ROOT?.trim();
  if (projectRoot) {
    const resolved = path.resolve(projectRoot);

    try {
      const stats = await lstat(resolved);
      if (!stats.isDirectory()) {
        return {
          ok: false,
          error: `Invalid PROJECT_ROOT: path is not a directory: ${resolved}`,
        };
      }
    } catch {
      return {
        ok: false,
        error: `Invalid PROJECT_ROOT: path does not exist or is not accessible: ${resolved}`,
      };
    }

    return { ok: true, baseRoot: resolved, source: "PROJECT_ROOT" };
  }

  return { ok: true, baseRoot: path.resolve(configOutputDir), source: "STITCH_OUTPUT_DIR" };
}

function defaultArtifactPath(payload: unknown, screenId?: string): string {
  const screen = getScreen(payload);
  const title = getString(screen, "title");
  const id = getString(screen, "id") ?? getScreenIdFromName(getString(screen, "name")) ?? screenId;
  const suffix = slugifyArtifactSegment(title ?? id ?? "screen");
  return path.join(DEFAULT_ARTIFACT_ROOT, suffix);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(obj: Record<string, unknown> | null, key: string): string | undefined {
  if (!obj) return undefined;
  const value = obj[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseContentJson(payload: unknown): unknown | null {
  const obj = asRecord(payload);
  const content = obj?.content;
  if (!Array.isArray(content)) return null;

  for (const item of content) {
    const itemObj = asRecord(item);
    const text = getString(itemObj, "text");
    if (!text) continue;

    try {
      return JSON.parse(text) as unknown;
    } catch {
      continue;
    }
  }

  return null;
}

function getStructuredPayload(payload: unknown): unknown {
  const obj = asRecord(payload);
  const structuredContent = obj?.structuredContent;
  if (structuredContent && typeof structuredContent === "object") {
    return structuredContent;
  }

  return parseContentJson(payload) ?? payload;
}

function getScreen(payload: unknown): Record<string, unknown> | null {
  const structured = getStructuredPayload(payload);
  const direct = asRecord(structured);
  if (!direct) return null;

  if (getString(direct, "name")?.includes("/screens/")) {
    return direct;
  }

  const screen = asRecord(direct.screen);
  if (screen) return screen;

  const screens = direct.screens;
  if (Array.isArray(screens) && screens.length > 0) {
    return asRecord(screens[0]);
  }

  return direct;
}

function getNestedRecord(obj: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  return asRecord(obj?.[key]);
}

function getScreenIdFromName(name?: string): string | undefined {
  if (!name) return undefined;
  const marker = "/screens/";
  const index = name.indexOf(marker);
  return index >= 0 ? name.slice(index + marker.length) : undefined;
}

function getProjectIdFromName(name?: string): string | undefined {
  if (!name || !name.startsWith("projects/")) return undefined;
  const [, projectId] = name.match(/^projects\/([^/]+)/) ?? [];
  return projectId;
}

function listStringValues(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];

  const strings: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      strings.push(item.trim());
    } else {
      const obj = asRecord(item);
      const label = getString(obj, "title") ?? getString(obj, "name") ?? getString(obj, "text");
      if (label) strings.push(label);
    }

    if (strings.length >= maxItems) break;
  }

  return strings;
}

function bulletList(items: string[], fallback: string): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function collectTextContent(screen: Record<string, unknown> | null): string[] {
  const values = [
    getString(screen, "title"),
    getString(screen, "prompt"),
    getString(getNestedRecord(screen, "screenMetadata"), "summary"),
    getString(getNestedRecord(screen, "screenMetadata"), "statusMessage"),
  ];

  return values.filter((value): value is string => Boolean(value));
}

function collectCopyFacts(screen: Record<string, unknown> | null): CopyFacts {
  const metadata = getNestedRecord(screen, "screenMetadata");
  const title = getString(screen, "title");
  const prompt = getString(screen, "prompt");
  const summary = getString(metadata, "summary");
  const statusMessage = getString(metadata, "statusMessage");
  const suggestions = listStringValues(metadata?.suggestions);

  return {
    visibleText: uniqueStrings([...(title ? [title] : [])]),
    possibleUserFacingText: uniqueStrings([
      ...(statusMessage ? [statusMessage] : []),
      ...suggestions,
    ]),
    generationContextText: uniqueStrings([
      ...(prompt ? [prompt] : []),
      ...(summary ? [summary] : []),
    ]),
  };
}

function describeTokenRecord(record: Record<string, unknown> | null, maxItems = 16): string[] {
  if (!record) return [];

  return Object.entries(record)
    .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .slice(0, maxItems)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function getTheme(screen: Record<string, unknown> | null): Record<string, unknown> | null {
  const directTheme = getNestedRecord(screen, "theme");
  if (directTheme) return directTheme;

  const designSystem = getNestedRecord(screen, "designSystem");
  const designSystemBody = getNestedRecord(designSystem, "designSystem");
  return getNestedRecord(designSystemBody, "theme");
}

function buildScreenSummary(payload: unknown): string {
  const screen = getScreen(payload);
  const name = getString(screen, "name");
  const metadata = getNestedRecord(screen, "screenMetadata");
  const title = getString(screen, "title") ?? "(untitled)";
  const prompt = getString(screen, "prompt");
  const status = getString(metadata, "status") ?? "(unknown)";
  const deviceType = getString(screen, "deviceType") ?? "(unknown)";
  const screenType = getString(screen, "screenType") ?? "(unknown)";
  const generatedBy = getString(screen, "generatedBy") ?? "(unknown)";
  const summary = getString(metadata, "summary");
  const suggestions = listStringValues(metadata?.suggestions);

  return [
    `# ${title}`,
    "",
    "## IDs",
    `- Screen name: ${name ?? "(unknown)"}`,
    `- Project ID: ${getProjectIdFromName(name) ?? "(unknown)"}`,
    `- Screen ID: ${getString(screen, "id") ?? getScreenIdFromName(name) ?? "(unknown)"}`,
    "",
    "## Purpose",
    prompt ?? summary ?? "No purpose or prompt was included in the Stitch response.",
    "",
    "## Screen Metadata",
    `- Status: ${status}`,
    `- Device type: ${deviceType}`,
    `- Screen type: ${screenType}`,
    `- Generated by: ${generatedBy}`,
    `- Width: ${getString(screen, "width") ?? "(unknown)"}`,
    `- Height: ${getString(screen, "height") ?? "(unknown)"}`,
    "",
    "## Notable UI Sections",
    bulletList(suggestions, "No explicit section/suggestion list was included in the Stitch response. Inspect implementation-context.md and raw.json for rendered assets and code references."),
  ].join("\n");
}

function buildImplementationContext(payload: unknown): string {
  const screen = getScreen(payload);
  const metadata = getNestedRecord(screen, "screenMetadata");
  const theme = getTheme(screen);
  const namedColors = getNestedRecord(theme, "namedColors");
  const designSystem = getNestedRecord(screen, "designSystem");
  const designSystemBody = getNestedRecord(designSystem, "designSystem");
  const htmlCode = getNestedRecord(screen, "htmlCode");
  const screenshot = getNestedRecord(screen, "screenshot");
  const figmaExport = getNestedRecord(screen, "figmaExport");
  const textContent = collectTextContent(screen);
  const colorTokens = describeTokenRecord(namedColors);
  const themeTokens = describeTokenRecord(theme, 20);

  return [
    `# Implementation Context: ${getString(screen, "title") ?? "Stitch Screen"}`,
    "",
    "## Source",
    `- Screen name: ${getString(screen, "name") ?? "(unknown)"}`,
    `- HTML artifact: ${getString(htmlCode, "name") ?? "(none)"}`,
    `- HTML download URL: ${getString(htmlCode, "downloadUrl") ?? "(none)"}`,
    `- Screenshot artifact: ${getString(screenshot, "name") ?? "(none)"}`,
    `- Screenshot download URL: ${getString(screenshot, "downloadUrl") ?? "(none)"}`,
    `- Figma artifact: ${getString(figmaExport, "name") ?? "(none)"}`,
    "",
    "## Layout",
    `- Device type: ${getString(screen, "deviceType") ?? "(unknown)"}`,
    `- Canvas size: ${getString(screen, "width") ?? "unknown"} x ${getString(screen, "height") ?? "unknown"}`,
    `- Display mode: ${getString(metadata, "displayMode") ?? "(unknown)"}`,
    "",
    "## Components And Content",
    bulletList(textContent, "No structured text content was included in the Stitch response."),
    "",
    "## Interactions",
    bulletList(listStringValues(metadata?.suggestions), "No explicit interactions were included. Infer behavior from the screen purpose, linked HTML artifact, and raw.json."),
    "",
    "## Design Tokens",
    `- Design system: ${getString(designSystem, "name") ?? getString(designSystemBody, "displayName") ?? "(unknown)"}`,
    "",
    "### Theme",
    bulletList(themeTokens, "No theme tokens were included."),
    "",
    "### Named Colors",
    bulletList(colorTokens, "No named color tokens were included."),
    "",
    "## Unknowns",
    "- Assets referenced by download URLs are not fetched by this export.",
    "- Fine-grained DOM/component hierarchy may require inspecting the linked HTML artifact or raw.json.",
  ].join("\n");
}

function getScreenFacts(payload: unknown) {
  const screen = getScreen(payload);
  const metadata = getNestedRecord(screen, "screenMetadata");
  const theme = getTheme(screen);
  const namedColors = getNestedRecord(theme, "namedColors");
  const htmlCode = getNestedRecord(screen, "htmlCode");
  const screenshot = getNestedRecord(screen, "screenshot");
  const figmaExport = getNestedRecord(screen, "figmaExport");
  const title = getString(screen, "title");
  const prompt = getString(screen, "prompt");
  const summary = getString(metadata, "summary");
  const statusMessage = getString(metadata, "statusMessage");
  const suggestions = listStringValues(metadata?.suggestions);
  const copyFacts = collectCopyFacts(screen);

  return {
    screen,
    metadata,
    theme,
    namedColors,
    htmlCode,
    screenshot,
    figmaExport,
    title,
    prompt,
    summary,
    statusMessage,
    suggestions,
    copyFacts,
  };
}

function buildImplementationPlan(payload: unknown): string {
  const facts = getScreenFacts(payload);
  const screenName = getString(facts.screen, "name");
  const deviceType = getString(facts.screen, "deviceType");
  const width = getString(facts.screen, "width");
  const height = getString(facts.screen, "height");
  const hasHtml = Boolean(getString(facts.htmlCode, "downloadUrl"));
  const hasScreenshot = Boolean(getString(facts.screenshot, "downloadUrl"));
  const hasTokens = Boolean(facts.theme || facts.namedColors);

  return [
    `# Implementation Plan: ${facts.title ?? "Stitch Screen"}`,
    "",
    "## Source Basis",
    `- Extracted screen name: ${screenName ?? "(missing)"}`,
    `- Extracted device/canvas: ${deviceType ?? "unknown"} ${width ?? "unknown"} x ${height ?? "unknown"}`,
    `- Extracted HTML artifact present: ${hasHtml ? "yes" : "no"}`,
    `- Extracted screenshot artifact present: ${hasScreenshot ? "yes" : "no"}`,
    `- Extracted design tokens present: ${hasTokens ? "yes" : "no"}`,
    "",
    "## Likely Page / Component Structure",
    "- Inferred: create a page-level screen container that matches the extracted canvas/device type.",
    "- Inferred: add a header/title region if the visible title appears in copy.md.",
    "- Inferred: group related controls/content into semantic sections after inspecting the screenshot or HTML artifact.",
    "- Inferred: keep data, navigation actions, and form controls isolated in small reusable components where the UI repeats.",
    "",
    "## Suggested Build Order",
    "1. Read `screen-summary.md`, `copy.md`, and `style-notes.md`.",
    "2. Inspect the screenshot and/or linked HTML artifact from `implementation-context.md`.",
    "3. Scaffold the route/page and set responsive canvas constraints.",
    "4. Implement layout sections from largest containers to smallest controls.",
    "5. Apply extracted tokens from `style-notes.md`; use existing app tokens when Stitch tokens are absent.",
    "6. Add interactions and states that are explicit in `component-map.json`; mark any inferred behavior in code review notes.",
    "7. Check keyboard navigation, labels, focus states, and responsive behavior.",
    "",
    "## Unknowns / Assumptions",
    bulletList(
      [
        !hasHtml ? "HTML artifact was not present in the Stitch payload." : "",
        !hasScreenshot ? "Screenshot artifact was not present in the Stitch payload." : "",
        !hasTokens ? "Design tokens were not present; style values must be inferred from visual assets or existing app tokens." : "",
        facts.copyFacts.visibleText.length === 0 ? "No confident visible UI text was extractable from structured screen fields." : "",
        "Inferred structure should be validated against the screenshot/HTML before implementation is considered complete.",
      ].filter(Boolean),
      "No major unknowns were detected from structured payload fields."
    ),
    "",
    "## Accessibility Notes",
    "- Inferred: use semantic landmarks for page/header/main/footer regions where applicable.",
    "- Inferred: ensure every icon-only control has an accessible name.",
    "- Inferred: preserve visible text from `copy.md` as real text, not baked into images.",
    "- Inferred: verify color contrast after applying tokens or app theme colors.",
    "- Inferred: support keyboard focus order matching visual order.",
    "",
    "## Responsive / Layout Notes",
    `- Extracted device type: ${deviceType ?? "(unknown)"}.`,
    `- Extracted canvas: ${width ?? "unknown"} x ${height ?? "unknown"}.`,
    "- Inferred: treat extracted canvas dimensions as a reference, not a fixed viewport unless the product requires it.",
    "- Inferred: define behavior for narrow, standard, and wide breakpoints before final polish.",
  ].join("\n");
}

function buildComponentMap(payload: unknown): JsonObject {
  const facts = getScreenFacts(payload);
  const screenName = getString(facts.screen, "name");
  const source = {
    screenName,
    title: facts.title,
    deviceType: getString(facts.screen, "deviceType"),
    width: getString(facts.screen, "width"),
    height: getString(facts.screen, "height"),
    htmlArtifact: getString(facts.htmlCode, "name"),
    screenshotArtifact: getString(facts.screenshot, "name"),
  };
  const sections: ComponentMapSection[] = [
    {
      name: facts.title ? `${facts.title} screen container` : "Screen container",
      provenance: "inferred",
      rationale: "Stitch payload did not include a detailed component tree in structured fields.",
      likelyComponents: [
        {
          name: "PageShell",
          provenance: "inferred",
          labels: facts.copyFacts.visibleText,
          interactions: [],
        },
      ],
    },
  ];

  if (facts.suggestions.length > 0) {
    sections.push({
      name: "Suggested follow-up actions",
      provenance: "inferred",
      rationale: "Derived from screenMetadata.suggestions; not clearly marked as rendered screen nodes.",
      likelyComponents: facts.suggestions.map((suggestion) => ({
        name: "Action",
        provenance: "inferred",
        labels: [suggestion],
        interactions: ["Uncertain suggested next action"],
      })),
    });
  }

  return {
    source,
    sections,
    textContent: facts.copyFacts.visibleText.map((text) => ({
      text,
      provenance: "extracted:screen.title",
    })),
    interactions: facts.suggestions.map((suggestion) => ({
      label: suggestion,
      provenance: "uncertain:screenMetadata.suggestions",
    })),
    notes: [
      "Fields marked inferred should be validated against the screenshot or linked HTML artifact.",
      "No precise component hierarchy is invented when the Stitch payload does not include one.",
    ],
  };
}

function buildCopyMarkdown(payload: unknown): string {
  const facts = getScreenFacts(payload);

  return [
    `# Copy: ${facts.title ?? "Stitch Screen"}`,
    "",
    "## Visible / UI Text",
    bulletList(facts.copyFacts.visibleText, "No confident visible UI text was extractable from structured screen fields."),
    "",
    "## Possible User-Facing Text From Metadata",
    bulletList(
      facts.copyFacts.possibleUserFacingText,
      "No possible user-facing metadata text was present."
    ),
    "",
    "These items may be displayed in some Stitch/client surfaces, but the payload did not clearly mark them as rendered screen nodes.",
    "",
    "## Generation / Context Text (Not UI Copy)",
    bulletList(
      facts.copyFacts.generationContextText,
      "No generation/context text was present."
    ),
    "",
    "## Provenance",
    "- Visible/UI text is limited to structured screen fields that are reasonably likely to be rendered, currently `title`.",
    "- Metadata text comes from fields such as `screenMetadata.statusMessage` and `screenMetadata.suggestions`; it is uncertain unless raw.json clearly marks it as rendered.",
    "- Generation/context text comes from fields such as `prompt` and `screenMetadata.summary`; it should not be implemented as visible UI copy without separate confirmation.",
    "- This file does not OCR screenshots or fetch linked HTML assets.",
  ].join("\n");
}

function buildStyleNotes(payload: unknown): string {
  const facts = getScreenFacts(payload);
  const themeTokens = describeTokenRecord(facts.theme, 30);
  const colorTokens = describeTokenRecord(facts.namedColors, 40);

  return [
    `# Style Notes: ${facts.title ?? "Stitch Screen"}`,
    "",
    "## Extracted Layout Values",
    `- Device type: ${getString(facts.screen, "deviceType") ?? "(not present)"}`,
    `- Width: ${getString(facts.screen, "width") ?? "(not present)"}`,
    `- Height: ${getString(facts.screen, "height") ?? "(not present)"}`,
    "",
    "## Extracted Theme Tokens",
    bulletList(themeTokens, "No theme token object was present in the structured Stitch payload."),
    "",
    "## Extracted Color Tokens",
    bulletList(colorTokens, "No named color token object was present in the structured Stitch payload."),
    "",
    "## Typography / Spacing",
    bulletList(
      [
        getString(facts.theme, "font") ? `font: ${getString(facts.theme, "font")}` : "",
        getString(facts.theme, "headlineFont") ? `headlineFont: ${getString(facts.theme, "headlineFont")}` : "",
        getString(facts.theme, "bodyFont") ? `bodyFont: ${getString(facts.theme, "bodyFont")}` : "",
        getString(facts.theme, "labelFont") ? `labelFont: ${getString(facts.theme, "labelFont")}` : "",
        getString(facts.theme, "spacingScale") ? `spacingScale: ${getString(facts.theme, "spacingScale")}` : "",
        getString(facts.theme, "roundness") ? `roundness: ${getString(facts.theme, "roundness")}` : "",
      ].filter(Boolean),
      "No typography, spacing, or roundness tokens were present in the structured Stitch payload."
    ),
    "",
    "## Inferred Style Guidance",
    "- Inferred: if tokens are absent, map visual styling to the host app's existing design system rather than inventing exact values.",
    "- Inferred: validate spacing, typography, and colors against the screenshot or linked HTML artifact before final implementation.",
  ].join("\n");
}

function buildBuildPrompt(payload: unknown): string {
  const facts = getScreenFacts(payload);
  const screenName = getString(facts.screen, "name") ?? "(unknown)";
  const title = facts.title ?? "Stitch Screen";
  const hasTokens = Boolean(facts.theme || facts.namedColors);
  const htmlUrl = getString(facts.htmlCode, "downloadUrl");
  const screenshotUrl = getString(facts.screenshot, "downloadUrl");

  return [
    `# Build Prompt: ${title}`,
    "",
    "You are implementing a screen from a Stitch artifact bundle. Use the files in this directory as source material. Do not invent exact design values that are not present in the artifacts; when values are missing, use the host app's existing design system and mark assumptions in your implementation notes.",
    "",
    "## Source Files To Read First",
    "1. `screen-summary.md`",
    "2. `implementation-context.md`",
    "3. `implementation-plan.md`",
    "4. `component-map.json`",
    "5. `copy.md`",
    "6. `style-notes.md`",
    "7. `raw.json` only when structured details are missing from the markdown/json summaries",
    "",
    "## Screen To Implement",
    `- Extracted title: ${title}`,
    `- Extracted screen name: ${screenName}`,
    `- Extracted device/canvas: ${getString(facts.screen, "deviceType") ?? "unknown"} ${getString(facts.screen, "width") ?? "unknown"} x ${getString(facts.screen, "height") ?? "unknown"}`,
    `- Extracted HTML URL: ${htmlUrl ?? "(not present)"}`,
    `- Extracted screenshot URL: ${screenshotUrl ?? "(not present)"}`,
    `- Extracted design tokens present: ${hasTokens ? "yes" : "no"}`,
    "",
    "## Implementation Instructions",
    "- Build the screen in the current app's existing framework and design conventions.",
    "- Preserve confident visible UI text from `copy.md`.",
    "- Treat metadata and generation/context text in `copy.md` as non-UI unless confirmed elsewhere.",
    "- Use `component-map.json` for extracted facts and inferred component organization; validate inferred items against available visual/source artifacts.",
    "- Use `style-notes.md` for extracted tokens. If tokens are absent, map to existing app tokens rather than inventing precise colors, spacing, or typography.",
    "- Implement responsive behavior appropriate for the extracted device/canvas, but do not hard-code the canvas as the only supported viewport unless the product requires it.",
    "- Add or update tests using `test-plan.md`.",
    "",
    "## Important Constraints",
    "- Do not generate unrelated pages or features.",
    "- Do not treat inferred structure as guaranteed design truth.",
    "- Do not implement prompt, summary, status, or suggestions as visible UI copy unless the payload clearly marks them as rendered.",
  ].join("\n");
}

function buildAcceptanceCriteria(payload: unknown): string {
  const facts = getScreenFacts(payload);
  const title = facts.title ?? "Stitch Screen";
  const hasTokens = Boolean(facts.theme || facts.namedColors);

  return [
    `# Acceptance Criteria: ${title}`,
    "",
    "- The implemented screen corresponds to the extracted Stitch screen id/name in `manifest.json`.",
    "- Confident visible UI text from `copy.md` is present in the implementation.",
    "- Metadata/context text from `copy.md` is not rendered as UI unless confirmed by `raw.json`, screenshot, linked HTML, or product direction.",
    "- Layout follows the extracted device/canvas as a reference and remains responsive for relevant app breakpoints.",
    "- Inferred sections/components from `component-map.json` are validated against available source artifacts before being treated as final.",
    hasTokens
      ? "- Extracted design tokens from `style-notes.md` are applied or mapped to equivalent app tokens."
      : "- Because no design tokens were extracted, styling uses the app's existing design system without inventing exact Stitch values.",
    "- Accessibility basics are covered: semantic structure, keyboard navigation, focus visibility, accessible names, and text contrast.",
    "- Implementation avoids unrelated feature work and keeps changes scoped to the requested screen.",
    "- Tests from `test-plan.md` are implemented where appropriate for the app's test stack.",
    "- Open questions in `questions.md` are resolved or explicitly documented as assumptions.",
  ].join("\n");
}

function buildTestPlan(payload: unknown): string {
  const facts = getScreenFacts(payload);
  const title = facts.title ?? "Stitch Screen";
  const visibleText = facts.copyFacts.visibleText;

  return [
    `# Test Plan: ${title}`,
    "",
    "## Unit / Utility Tests",
    "- Test any data formatting, routing helpers, or state helpers introduced for this screen.",
    "- Test conditional rendering for empty/loading/error states if those states are part of the implementation.",
    "",
    "## Component Tests",
    ...(
      visibleText.length > 0
        ? visibleText.map((text) => `- Assert visible UI text is rendered: ${JSON.stringify(text)}.`)
        : ["- No confident visible UI text was extracted; test stable semantic landmarks, roles, or labels from the implemented design."]
    ),
    "- Assert primary sections/components render without crashing.",
    "- Assert interactive controls have accessible names and expected enabled/disabled states.",
    "- Assert metadata/context text from `copy.md` is not accidentally rendered as visible UI copy unless explicitly confirmed.",
    "",
    "## Responsive / Visual Checks",
    `- Check layout at the extracted reference size: ${getString(facts.screen, "width") ?? "unknown"} x ${getString(facts.screen, "height") ?? "unknown"}.`,
    "- Check at the app's common small, medium, and large breakpoints.",
    "- Verify text does not overlap, clip, or escape containers.",
    "",
    "## E2E / Flow Tests",
    "- Add navigation smoke coverage for reaching this screen if it is route-accessible.",
    "- Exercise primary interactions if they are confirmed by product requirements or source artifacts.",
    "- Include an accessibility smoke pass if the project has an automated a11y tool.",
  ].join("\n");
}

function buildQuestions(payload: unknown): string {
  const facts = getScreenFacts(payload);
  const title = facts.title ?? "Stitch Screen";
  const questions = [
    facts.copyFacts.visibleText.length === 0
      ? "No confident visible UI text was extracted. Should copy be taken from screenshot/HTML, product specs, or existing app content?"
      : "",
    facts.copyFacts.possibleUserFacingText.length > 0
      ? "Should any possible user-facing metadata in `copy.md` be rendered in the app, or is it only Stitch/client metadata?"
      : "",
    facts.copyFacts.generationContextText.length > 0
      ? "Should any generation/context text in `copy.md` influence UI content, or remain implementation context only?"
      : "",
    !(facts.theme || facts.namedColors)
      ? "No design tokens were present. Which app theme/tokens should be used for final color, typography, spacing, and radius?"
      : "",
    !getString(facts.htmlCode, "downloadUrl")
      ? "No linked HTML artifact was present. Is screenshot/raw payload enough to implement the component hierarchy?"
      : "",
    !getString(facts.screenshot, "downloadUrl")
      ? "No screenshot artifact was present. What visual reference should be used for layout validation?"
      : "",
    "What route, navigation entry point, and surrounding app shell should host this screen?",
    "Which interactions are required versus decorative or suggested by Stitch metadata?",
    "Are there loading, empty, error, or permission states that should be implemented for this screen?",
  ].filter(Boolean);

  return [
    `# Questions: ${title}`,
    "",
    "These questions should be answered before or during implementation. Some are inferred from missing artifact data.",
    "",
    ...questions.map((question) => `- ${question}`),
  ].join("\n");
}

function createManifest(options: {
  payload: unknown;
  input: Record<string, unknown>;
  resolver?: unknown;
  generatedAt: string;
  paths: Record<string, string>;
  artifactPath: string;
  resolvedOutputDir: string;
  baseRoot: string;
  baseRootSource: "PROJECT_ROOT" | "STITCH_OUTPUT_DIR";
  outputMode: "artifactPath" | "artifactName" | "default";
}): JsonObject {
  const screen = getScreen(options.payload);
  const name = getString(screen, "name");

  return {
    generatedAt: options.generatedAt,
    source: {
      screenName: name,
      projectId: getProjectIdFromName(name),
      screenId: getString(screen, "id") ?? getScreenIdFromName(name),
      title: getString(screen, "title"),
    },
    input: options.input,
    resolver: options.resolver,
    output: {
      artifactPath: options.artifactPath,
      resolvedOutputDir: options.resolvedOutputDir,
      baseRoot: options.baseRoot,
      baseRootSource: options.baseRootSource,
      mode: options.outputMode,
    },
    paths: options.paths,
  };
}

export function registerStitchExportTool(server: McpServer) {
  server.registerTool(
    "stitch_export_screen_artifact",
    {
      description:
        "Exports Stitch screen data as an artifact bundle. artifactPath is the preferred workspace-relative output directory. PROJECT_ROOT is preferred as the base root; STITCH_OUTPUT_DIR is fallback/testing only when PROJECT_ROOT is unset. artifactName and relativePath are legacy fallback inputs. If screenData is provided, it is exported directly. Otherwise rawGetScreenInput takes precedence over screenId when fetching via get_screen.",
      inputSchema: {
        screenId: z.string().optional(),
        projectId: z.string().optional(),
        artifactPath: z
          .string()
          .trim()
          .min(1)
          .max(240)
          .refine((value) => isSafeRelativePathInput(value), {
            message:
              "artifactPath must be non-empty, relative, and must not include traversal or suspicious segments.",
          })
          .optional()
          .describe("Workspace-relative artifact bundle directory, for example .artifacts/features/settings/design."),
        artifactName: z
          .string()
          .min(1)
          .max(80)
          .regex(ARTIFACT_NAME_PATTERN, "artifactName may include only letters, numbers, ., _, and -")
          .optional(),
        relativePath: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .refine((value) => isSafeRelativePathInput(value), {
            message:
              "relativePath must be non-empty, relative, and must not include traversal or suspicious segments.",
          })
          .optional()
          .describe("Legacy workspace-relative artifact bundle directory, for example exports/my-screen."),
        rawGetScreenInput: z.record(z.string(), z.unknown()).optional(),
        screenData: z.unknown().optional(),
      },
    },
    async ({ screenId, projectId, artifactPath, artifactName, relativePath, rawGetScreenInput, screenData }) => {
      if (!screenData && !screenId && !rawGetScreenInput) {
        return {
          content: [
            {
              type: "text",
              text:
                "Invalid input: provide screenData directly, or provide screenId/rawGetScreenInput to fetch from Stitch.",
            },
          ],
        };
      }

      const config = getStitchConfig();
      let payload: unknown = screenData;
      let fetchInput: JsonObject | undefined;
      let resolverInfo: unknown;

      if (!payload) {
        const client = new StitchClient(config);
        const screenIdentifier = screenId ? toScreenIdentifier(screenId) : null;
        const resolved = screenIdentifier
          ? {
              ok: true as const,
              input: screenIdentifier,
              resolver: {
                requested: screenId,
                projectId: screenIdentifier.projectId,
                strategy: "full-resource-name",
                matchedName: screenIdentifier.name,
                matchedScreenId: screenIdentifier.screenId,
              },
            }
          : screenId
            ? await resolveScreenInput({
                client,
                screenIdOrName: screenId,
                projectIdOrName: projectId,
              })
            : null;

        if (!rawGetScreenInput && !resolved) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Invalid input: provide a full screenId path, rawGetScreenInput, screenData directly, or projectId with a screen id/title fragment.",
              },
            ],
          };
        }

        if (resolved && !resolved.ok) {
          return {
            content: [
              {
                type: "text",
                text: resolved.error,
              },
            ],
          };
        }

        const getScreenInput = rawGetScreenInput ?? resolved?.input;
        if (!getScreenInput) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Invalid input: provide a full screenId path, rawGetScreenInput, screenData directly, or projectId with a screen id/title fragment.",
              },
            ],
          };
        }
        fetchInput = getScreenInput;
        resolverInfo = resolved?.ok ? resolved.resolver : undefined;

        const fetchResult = await client.callTool({
          toolName: "get_screen",
          input: getScreenInput,
        });

        if (!fetchResult.ok) {
          return {
            content: [
              {
                type: "text",
                text: `stitch_export_screen_artifact failed while fetching screen.\n\n${fetchResult.error}`,
              },
            ],
          };
        }

        payload = fetchResult.data;
      }

      const baseRootInfo = await getBaseRoot(config.outputDir);
      if (!baseRootInfo.ok) {
        return {
          content: [
            {
              type: "text",
              text: baseRootInfo.error,
            },
          ],
        };
      }

      const outputMode: "artifactPath" | "artifactName" | "default" =
        artifactPath || relativePath ? "artifactPath" : artifactName ? "artifactName" : "default";
      const relativeDir =
        artifactPath ??
        relativePath ??
        (artifactName
          ? path.join("exports", sanitizeFileName(artifactName))
          : defaultArtifactPath(payload, screenId));
      const outputPaths: Record<(typeof ARTIFACT_FILES)[number], string> = {
        "raw.json": "",
        "screen-summary.md": "",
        "implementation-context.md": "",
        "implementation-plan.md": "",
        "component-map.json": "",
        "copy.md": "",
        "style-notes.md": "",
        "build-prompt.md": "",
        "acceptance-criteria.md": "",
        "test-plan.md": "",
        "questions.md": "",
        "manifest.json": "",
      };

      try {
        for (const fileName of ARTIFACT_FILES) {
          outputPaths[fileName] = await prepareSafeOutputPath(
            baseRootInfo.baseRoot,
            path.join(relativeDir, fileName)
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Invalid output path.\n\n${message}`,
            },
          ],
        };
      }

      try {
        const generatedAt = new Date().toISOString();
        const rawJson = toPrettyJson(payload);
        const screenSummary = buildScreenSummary(payload);
        const implementationContext = buildImplementationContext(payload);
        const implementationPlan = buildImplementationPlan(payload);
        const componentMap = buildComponentMap(payload);
        const copy = buildCopyMarkdown(payload);
        const styleNotes = buildStyleNotes(payload);
        const buildPrompt = buildBuildPrompt(payload);
        const acceptanceCriteria = buildAcceptanceCriteria(payload);
        const testPlan = buildTestPlan(payload);
        const questions = buildQuestions(payload);
        const manifest = createManifest({
          payload,
          input: {
            ...(screenId ? { screenId } : {}),
            ...(projectId ? { projectId } : {}),
            ...(artifactPath ? { artifactPath } : {}),
            ...(artifactName ? { artifactName } : {}),
            ...(relativePath ? { relativePath } : {}),
            ...(rawGetScreenInput ? { rawGetScreenInput } : {}),
            ...(screenData ? { screenDataProvided: true } : {}),
            ...(fetchInput ? { fetchInput } : {}),
          },
          resolver: resolverInfo,
          generatedAt,
          paths: outputPaths,
          artifactPath: relativeDir,
          resolvedOutputDir: path.dirname(outputPaths["manifest.json"]),
          baseRoot: baseRootInfo.baseRoot,
          baseRootSource: baseRootInfo.source,
          outputMode,
        });

        await writeFile(outputPaths["raw.json"], `${rawJson}\n`, "utf8");
        await writeFile(outputPaths["screen-summary.md"], `${screenSummary}\n`, "utf8");
        await writeFile(outputPaths["implementation-context.md"], `${implementationContext}\n`, "utf8");
        await writeFile(outputPaths["implementation-plan.md"], `${implementationPlan}\n`, "utf8");
        await writeFile(outputPaths["component-map.json"], `${toPrettyJson(componentMap)}\n`, "utf8");
        await writeFile(outputPaths["copy.md"], `${copy}\n`, "utf8");
        await writeFile(outputPaths["style-notes.md"], `${styleNotes}\n`, "utf8");
        await writeFile(outputPaths["build-prompt.md"], `${buildPrompt}\n`, "utf8");
        await writeFile(outputPaths["acceptance-criteria.md"], `${acceptanceCriteria}\n`, "utf8");
        await writeFile(outputPaths["test-plan.md"], `${testPlan}\n`, "utf8");
        await writeFile(outputPaths["questions.md"], `${questions}\n`, "utf8");
        await writeFile(outputPaths["manifest.json"], `${toPrettyJson(manifest)}\n`, "utf8");

        const screen = getScreen(payload);
        const title = getString(screen, "title") ?? "(untitled)";
        const screenName = getString(screen, "name") ?? "(unknown)";

        return {
          content: [
            {
              type: "text",
              text:
                "Stitch screen artifact bundle exported successfully.\n\n" +
                `Title: ${title}\n` +
                `Screen: ${screenName}\n` +
                `Artifact path: ${relativeDir}\n` +
                `Base root: ${baseRootInfo.baseRoot} (${baseRootInfo.source})\n` +
                `Output directory: ${path.dirname(outputPaths["manifest.json"])}\n\n` +
                "Files:\n" +
                ARTIFACT_FILES.map((fileName) => `- ${fileName}: ${outputPaths[fileName]}`).join("\n"),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to write artifact.\n\n${message}`,
            },
          ],
        };
      }
    }
  );
}
