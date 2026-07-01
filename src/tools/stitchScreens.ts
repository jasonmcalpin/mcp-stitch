import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStitchConfig } from "../config/stitch.js";
import { StitchClient } from "../services/stitchClient.js";
import { toBareProjectId, toBareScreenId, toScreenIdentifier } from "../utils/stitchIds.js";
import { resolveScreenInput } from "../utils/stitchScreenResolver.js";
import { formatStitchSummary, safeJsonPreview } from "../utils/stitchResponse.js";
import { compactStitchResult, requireConfirmation } from "../utils/stitchToolHelpers.js";

function toErrorText(prefix: string, message: string): string {
  return `${prefix}\n\n${message}`;
}

const deviceTypeSchema = z.enum([
  "DEVICE_TYPE_UNSPECIFIED",
  "MOBILE",
  "DESKTOP",
  "TABLET",
  "AGNOSTIC",
]);

const modelIdSchema = z.enum([
  "MODEL_ID_UNSPECIFIED",
  "GEMINI_3_PRO",
  "GEMINI_3_FLASH",
  "GEMINI_3_1_PRO",
]);

const variantOptionsSchema = z
  .object({
    aspects: z
      .array(
        z.enum([
          "VARIANT_ASPECT_UNSPECIFIED",
          "LAYOUT",
          "COLOR_SCHEME",
          "IMAGES",
          "TEXT_FONT",
          "TEXT_CONTENT",
        ])
      )
      .optional(),
    creativeRange: z
      .enum([
        "CREATIVE_RANGE_UNSPECIFIED",
        "REFINE",
        "EXPLORE",
        "REIMAGINE",
      ])
      .optional(),
    variantCount: z.number().int().min(1).max(5).optional(),
  })
  .passthrough();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(obj: Record<string, unknown> | null, key: string): string | undefined {
  const value = obj?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getProjectIdFromName(name?: string): string | undefined {
  if (!name || !name.startsWith("projects/")) return undefined;
  return name.split("/")[1];
}

function getScreenIdFromName(name?: string): string | undefined {
  if (!name) return undefined;
  const marker = "/screens/";
  const index = name.indexOf(marker);
  return index >= 0 ? name.slice(index + marker.length) : undefined;
}

function parseContentJson(payload: unknown): unknown | null {
  const obj = asRecord(payload);
  const content = obj?.content;
  if (!Array.isArray(content)) return null;

  for (const item of content) {
    const text = getString(asRecord(item), "text");
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

function screensFromPayload(payload: unknown): Record<string, unknown>[] {
  const structured = getStructuredPayload(payload);
  const direct = asRecord(structured);
  if (!direct) return [];

  const directScreens = direct.screens;
  if (Array.isArray(directScreens)) {
    return directScreens
      .map((screen) => asRecord(screen))
      .filter((screen): screen is Record<string, unknown> => Boolean(screen));
  }

  const outputComponents = direct.outputComponents;
  const screens: Record<string, unknown>[] = [];
  if (Array.isArray(outputComponents)) {
    for (const component of outputComponents) {
      const componentObj = asRecord(component);
      const design = asRecord(componentObj?.design);
      const designScreens = design?.screens;
      if (!Array.isArray(designScreens)) continue;

      for (const screen of designScreens) {
        const screenObj = asRecord(screen);
        if (screenObj) screens.push(screenObj);
      }
    }
  }

  const design = asRecord(direct.design);
  const designScreens = design?.screens;
  if (Array.isArray(designScreens)) {
    for (const screen of designScreens) {
      const screenObj = asRecord(screen);
      if (screenObj) screens.push(screenObj);
    }
  }

  return screens;
}

function firstScreenFromPayload(payload: unknown): Record<string, unknown> | null {
  const structured = getStructuredPayload(payload);
  const direct = asRecord(structured);
  if (!direct) return null;

  if (getString(direct, "name")?.includes("/screens/")) {
    return direct;
  }

  const screens = screensFromPayload(payload);
  if (screens.length > 0) {
    return screens[0] ?? null;
  }

  return null;
}

function collectGenerationText(payload: unknown): string[] {
  const structured = asRecord(getStructuredPayload(payload));
  const outputComponents = structured?.outputComponents;
  if (!Array.isArray(outputComponents)) return [];

  const text: string[] = [];
  for (const component of outputComponents) {
    const componentObj = asRecord(component);
    const summary = getString(componentObj, "text");
    const suggestion = getString(componentObj, "suggestion");
    if (summary) text.push(summary);
    if (suggestion) text.push(`Suggestion: ${suggestion}`);
  }

  return text;
}

function hasUrl(record: Record<string, unknown> | null): string {
  return getString(record, "downloadUrl") ? "yes" : "no";
}

function formatScreenListSummary(payload: unknown): string {
  const screens = screensFromPayload(payload);

  if (screens.length === 0) {
    return formatStitchSummary({
      title: "Stitch screens",
      data: payload,
      itemKeys: ["screens", "items", "results"],
      idKeys: ["name", "id", "screenId", "title"],
    });
  }

  const lines = ["Stitch screens", "", `Screen count: ${screens.length}`, ""];

  screens.forEach((screen, index) => {
    const name = getString(screen, "name");
    const screenId = getString(screen, "id") ?? getScreenIdFromName(name) ?? "(none)";
    const screenshot = asRecord(screen.screenshot);
    const htmlCode = asRecord(screen.htmlCode);

    lines.push(
      `${index + 1}. ${getString(screen, "title") ?? "(untitled)"}`,
      `- screenId: ${screenId}`,
      `- screenName: ${name ?? "(none)"}`,
      `- width: ${getString(screen, "width") ?? "(none)"}`,
      `- height: ${getString(screen, "height") ?? "(none)"}`,
      `- hasScreenshotUrl: ${hasUrl(screenshot)}`,
      `- hasHtmlCodeUrl: ${hasUrl(htmlCode)}`,
      `- htmlMimeType: ${getString(htmlCode, "mimeType") ?? "(none)"}`,
      ""
    );
  });

  lines.push(
    "Tip:",
    "- Pass the bare screenId to stitch_get_screen with projectId to get screenshot.downloadUrl and htmlCode.downloadUrl."
  );

  return lines.join("\n");
}

function formatScreenAssetSummary(title: string, payload: unknown): string {
  const structured = getStructuredPayload(payload);
  const structuredObj = asRecord(structured);
  const screen = firstScreenFromPayload(payload);

  if (!screen) {
    return formatStitchSummary({
      title,
      data: payload,
      itemKeys: ["screens", "nodes", "items"],
      idKeys: ["name", "id", "screenId", "title"],
    });
  }

  const screenshot = asRecord(screen.screenshot);
  const htmlCode = asRecord(screen.htmlCode);
  const metadata = asRecord(screen.screenMetadata);
  const designSystem = asRecord(screen.designSystem);
  const nestedDesignSystem = asRecord(designSystem?.designSystem);

  const screenName = getString(screen, "name");
  const screenId = getString(screen, "id") ?? getScreenIdFromName(screenName);
  const projectId = getString(structuredObj, "projectId") ?? getProjectIdFromName(screenName);
  const prompt = getString(screen, "prompt");
  const generationText = collectGenerationText(payload);

  const lines = [
    title,
    "",
    "Screen:",
    `- screenId: ${screenId ?? "(none)"}`,
    `- screenName: ${screenName ?? "(none)"}`,
    `- projectId: ${projectId ?? "(not present)"}`,
    `- title: ${getString(screen, "title") ?? "(none)"}`,
    `- sessionId: ${getString(structuredObj, "sessionId") ?? "(not present)"}`,
    `- width: ${getString(screen, "width") ?? "(none)"}`,
    `- height: ${getString(screen, "height") ?? "(none)"}`,
    `- deviceType: ${getString(screen, "deviceType") ?? "(none)"}`,
    `- generatedBy: ${getString(screen, "generatedBy") ?? "(not present)"}`,
    `- screenType: ${getString(screen, "screenType") ?? "(not present)"}`,
    `- status: ${getString(metadata, "status") ?? "(not present)"}`,
    `- agentType: ${getString(metadata, "agentType") ?? "(not present)"}`,
    "",
    "Next calls:",
    `- stitch_get_screen: { "projectId": "${projectId ?? "PROJECT_ID"}", "screenId": "${screenId ?? "SCREEN_ID"}" }`,
    "",
    "Screenshot asset:",
    `- name: ${getString(screenshot, "name") ?? "(none)"}`,
    `- downloadUrl: ${getString(screenshot, "downloadUrl") ?? "(none)"}`,
    "",
    "HTML/code asset:",
    `- name: ${getString(htmlCode, "name") ?? "(none)"}`,
    `- downloadUrl: ${getString(htmlCode, "downloadUrl") ?? "(none)"}`,
    `- mimeType: ${getString(htmlCode, "mimeType") ?? "(none)"}`,
    "",
    "Design system:",
    `- name: ${getString(designSystem, "name") ?? "(not present)"}`,
    `- displayName: ${getString(nestedDesignSystem, "displayName") ?? "(not present)"}`,
  ];

  if (prompt) {
    lines.push("", "Prompt:", safeJsonPreview(prompt, 800));
  }

  if (generationText.length > 0) {
    lines.push("", "Generation notes:", ...generationText.map((item) => `- ${item}`));
  }

  lines.push("", "Raw preview:", safeJsonPreview(structured, 2000));

  return lines.join("\n");
}

export function registerStitchScreenTools(server: McpServer) {
  server.registerTool(
    "stitch_list_screens",
    {
      description:
        "Lists screens for a Stitch project. If rawInput is provided, it takes precedence over projectId.",
      inputSchema: {
        projectId: z.string().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, rawInput }) => {
      const input =
        rawInput ?? {
          ...(projectId ? { projectId: toBareProjectId(projectId) } : {}),
        };

      if (!rawInput && !projectId) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid input: provide projectId or rawInput.",
            },
          ],
        };
      }

      const client = new StitchClient(getStitchConfig());
      const result = await client.callTool({
        toolName: "list_screens",
        input,
      });

      if (!result.ok) {
        return {
          content: [
            {
              type: "text",
              text: toErrorText("stitch_list_screens failed.", result.error),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: formatScreenListSummary(result.data),
          },
        ],
      };
    }
  );

  server.registerTool(
    "stitch_edit_screens",
    {
      description:
        "MUTATING: Edits existing Stitch screens in a project using a text prompt. Requires confirm: true. If rawInput is provided, it takes precedence over other Stitch arguments.",
      inputSchema: {
        projectId: z.string().optional(),
        selectedScreenIds: z.array(z.string()).optional(),
        prompt: z.string().min(1).optional(),
        deviceType: deviceTypeSchema.optional(),
        modelId: modelIdSchema.optional(),
        confirm: z.boolean().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, selectedScreenIds, prompt, deviceType, modelId, confirm, rawInput }) => {
      const refusal = requireConfirmation("stitch_edit_screens would edit existing Stitch screens", confirm);
      if (refusal) return { content: [{ type: "text", text: refusal }] };

      if (!rawInput && (!projectId || !selectedScreenIds?.length || !prompt)) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid input: provide projectId, selectedScreenIds, and prompt, or rawInput.",
            },
          ],
        };
      }

      const input =
        rawInput ?? {
          projectId: toBareProjectId(projectId ?? ""),
          selectedScreenIds: (selectedScreenIds ?? []).map(toBareScreenId),
          prompt,
          ...(deviceType ? { deviceType } : {}),
          ...(modelId ? { modelId } : {}),
        };

      const client = new StitchClient(getStitchConfig());
      const result = await client.callTool({
        toolName: "edit_screens",
        input,
      });

      return {
        content: [{ type: "text", text: compactStitchResult("Stitch edited screens", result) }],
      };
    }
  );

  server.registerTool(
    "stitch_generate_variants",
    {
      description:
        "MUTATING: Generates variants of existing Stitch screens in a project. Requires confirm: true. If rawInput is provided, it takes precedence over other Stitch arguments.",
      inputSchema: {
        projectId: z.string().optional(),
        selectedScreenIds: z.array(z.string()).optional(),
        prompt: z.string().min(1).optional(),
        variantOptions: variantOptionsSchema.optional(),
        deviceType: deviceTypeSchema.optional(),
        modelId: modelIdSchema.optional(),
        confirm: z.boolean().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({
      projectId,
      selectedScreenIds,
      prompt,
      variantOptions,
      deviceType,
      modelId,
      confirm,
      rawInput,
    }) => {
      const refusal = requireConfirmation("stitch_generate_variants would generate new screen variants", confirm);
      if (refusal) return { content: [{ type: "text", text: refusal }] };

      if (!rawInput && (!projectId || !selectedScreenIds?.length || !prompt || !variantOptions)) {
        return {
          content: [
            {
              type: "text",
              text:
                "Invalid input: provide projectId, selectedScreenIds, prompt, and variantOptions, or rawInput.",
            },
          ],
        };
      }

      const input =
        rawInput ?? {
          projectId: toBareProjectId(projectId ?? ""),
          selectedScreenIds: (selectedScreenIds ?? []).map(toBareScreenId),
          prompt,
          variantOptions,
          ...(deviceType ? { deviceType } : {}),
          ...(modelId ? { modelId } : {}),
        };

      const client = new StitchClient(getStitchConfig());
      const result = await client.callTool({
        toolName: "generate_variants",
        input,
      });

      return {
        content: [{ type: "text", text: compactStitchResult("Stitch generated variants", result) }],
      };
    }
  );

  server.registerTool(
    "stitch_get_screen",
    {
      description:
        "Gets a single Stitch screen by screen identifier. If rawInput is provided, it takes precedence over screenId/projectId.",
      inputSchema: {
        screenId: z.string().optional(),
        projectId: z.string().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ screenId, projectId, rawInput }) => {
      if (!screenId && !rawInput && !projectId) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid input: provide (projectId + screenId), a full screenId path, or rawInput.",
            },
          ],
        };
      }

      const client = new StitchClient(getStitchConfig());
      let input = rawInput;

      if (!input) {
        const identifier = screenId ? toScreenIdentifier(screenId) : null;
        const resolved = identifier
          ? { ok: true as const, input: identifier }
          : screenId
            ? await resolveScreenInput({
                client,
                screenIdOrName: screenId,
                projectIdOrName: projectId,
              })
            : null;

        if (!resolved) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Invalid input: provide a full screenId path, rawInput, or both projectId and bare screenId.",
              },
            ],
          };
        }

        if (!resolved.ok) {
          return {
            content: [
              {
                type: "text",
                text: resolved.error,
              },
            ],
          };
        }

        input = resolved.input;
      }

      const result = await client.callTool({
        toolName: "get_screen",
        input,
      });

      if (!result.ok) {
        return {
          content: [
            {
              type: "text",
              text: toErrorText("stitch_get_screen failed.", result.error),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: formatScreenAssetSummary("Stitch screen", result.data),
          },
        ],
      };
    }
  );

  server.registerTool(
    "stitch_generate_screen_from_text",
    {
      description:
        "Generates a Stitch screen from text. If rawInput is provided, it takes precedence over prompt/projectId. projectId may be a bare id or projects/{id}.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .max(2000)
          .optional()
          .describe("Natural language design request. Max length: 2000 characters."),
        projectId: z.string().min(1).optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ prompt, projectId, rawInput }) => {
      if (!rawInput && (!projectId || !prompt)) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid input: provide projectId and prompt, or rawInput.",
            },
          ],
        };
      }

      const client = new StitchClient(getStitchConfig());
      const input = rawInput ?? {
        prompt,
        ...(projectId ? { projectId: toBareProjectId(projectId) } : {}),
      };

      const result = await client.callTool({
        toolName: "generate_screen_from_text",
        input,
      });

      if (!result.ok) {
        return {
          content: [
            {
              type: "text",
              text: toErrorText("stitch_generate_screen_from_text failed.", result.error),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: formatScreenAssetSummary("Stitch generated screen", result.data),
          },
        ],
      };
    }
  );
}
