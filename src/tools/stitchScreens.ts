import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStitchConfig } from "../config/stitch.js";
import { StitchClient } from "../services/stitchClient.js";
import { toBareProjectId, toBareScreenId, toScreenIdentifier } from "../utils/stitchIds.js";
import { resolveScreenInput } from "../utils/stitchScreenResolver.js";
import { formatStitchSummary } from "../utils/stitchResponse.js";
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
            text: formatStitchSummary({
              title: "Stitch screens",
              data: result.data,
              itemKeys: ["screens", "items", "results"],
              idKeys: ["name", "id", "screenId", "title"],
            }),
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
            text: formatStitchSummary({
              title: "Stitch screen",
              data: result.data,
              itemKeys: ["nodes", "components", "screens"],
              idKeys: ["name", "id", "screenId", "title"],
            }),
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
            text: formatStitchSummary({
              title: "Stitch generated screen",
              data: result.data,
              itemKeys: ["screens", "nodes", "items"],
              idKeys: ["name", "id", "screenId", "title"],
            }),
          },
        ],
      };
    }
  );
}
