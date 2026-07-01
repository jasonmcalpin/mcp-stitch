import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStitchConfig } from "../config/stitch.js";
import { StitchClient } from "../services/stitchClient.js";
import { toProjectName } from "../utils/stitchIds.js";
import { formatStitchSummary } from "../utils/stitchResponse.js";
import { compactStitchResult, requireConfirmation, toErrorText } from "../utils/stitchToolHelpers.js";

export function registerStitchProjectTools(server: McpServer) {
  server.registerTool(
    "stitch_create_project",
    {
      description:
        "MUTATING: Creates a new Stitch project. Requires confirm: true. If rawInput is provided, it takes precedence over title.",
      inputSchema: {
        title: z.string().optional(),
        confirm: z.boolean().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ title, confirm, rawInput }) => {
      const refusal = requireConfirmation("stitch_create_project would create a new Stitch project", confirm);
      if (refusal) {
        return { content: [{ type: "text", text: refusal }] };
      }

      const client = new StitchClient(getStitchConfig());
      const input = rawInput ?? {
        ...(title ? { title } : {}),
      };

      const result = await client.callTool({
        toolName: "create_project",
        input,
      });

      return {
        content: [
          {
            type: "text",
            text: compactStitchResult("Stitch created project", result),
          },
        ],
      };
    }
  );

  server.registerTool(
    "stitch_list_projects",
    {
      description:
        "Lists Stitch projects available to the configured account. If rawInput is provided, it takes precedence over filter.",
      inputSchema: {
        filter: z.string().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ filter, rawInput }) => {
      const client = new StitchClient(getStitchConfig());
      const input = rawInput ?? {
        ...(filter ? { filter } : {}),
      };

      const result = await client.callTool({
        toolName: "list_projects",
        input,
      });

      if (!result.ok) {
        return {
          content: [
            {
              type: "text",
              text: toErrorText("stitch_list_projects failed.", result.error),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: formatStitchSummary({
              title: "Stitch projects",
              data: result.data,
              itemKeys: ["projects", "items", "results"],
              idKeys: ["name", "id", "title"],
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    "stitch_get_project",
    {
      description:
        "Gets a single Stitch project by project identifier. If rawInput is provided, it takes precedence over projectId.",
      inputSchema: {
        projectId: z.string().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, rawInput }) => {
      if (!projectId && !rawInput) {
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
      const input = rawInput ?? { name: toProjectName(projectId ?? "") };

      const result = await client.callTool({
        toolName: "get_project",
        input,
      });

      if (!result.ok) {
        return {
          content: [
            {
              type: "text",
              text: toErrorText("stitch_get_project failed.", result.error),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: formatStitchSummary({
              title: "Stitch project",
              data: result.data,
              itemKeys: ["screens", "items"],
              idKeys: ["name", "id", "title", "project"],
            }),
          },
        ],
      };
    }
  );
}
