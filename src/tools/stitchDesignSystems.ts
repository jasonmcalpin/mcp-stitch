import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStitchConfig } from "../config/stitch.js";
import { StitchClient } from "../services/stitchClient.js";
import {
  toAssetName,
  toBareAssetId,
  toBareProjectId,
  toScreenIdentifier,
} from "../utils/stitchIds.js";
import { compactStitchResult, requireConfirmation } from "../utils/stitchToolHelpers.js";

const deviceTypeSchema = z.enum([
  "DEVICE_TYPE_UNSPECIFIED",
  "MOBILE",
  "DESKTOP",
  "TABLET",
  "AGNOSTIC",
]);

const typographySchema = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.string().optional(),
    fontWeight: z.string().optional(),
    letterSpacing: z.string().optional(),
    lineHeight: z.string().optional(),
  })
  .passthrough();

const colorModeSchema = z.enum(["COLOR_MODE_UNSPECIFIED", "LIGHT", "DARK"]);

const colorVariantSchema = z.enum([
  "COLOR_VARIANT_UNSPECIFIED",
  "MONOCHROME",
  "NEUTRAL",
  "TONAL_SPOT",
  "VIBRANT",
  "EXPRESSIVE",
  "FIDELITY",
  "CONTENT",
  "RAINBOW",
  "FRUIT_SALAD",
]);

const roundnessSchema = z.enum([
  "ROUNDNESS_UNSPECIFIED",
  "ROUND_TWO",
  "ROUND_FOUR",
  "ROUND_EIGHT",
  "ROUND_TWELVE",
  "ROUND_FULL",
]);

const fontSchema = z.enum([
  "FONT_UNSPECIFIED",
  "BE_VIETNAM_PRO",
  "EPILOGUE",
  "INTER",
  "LEXEND",
  "MANROPE",
  "NEWSREADER",
  "NOTO_SERIF",
  "PLUS_JAKARTA_SANS",
  "PUBLIC_SANS",
  "SPACE_GROTESK",
  "SPLINE_SANS",
  "WORK_SANS",
  "DOMINE",
  "LIBRE_CASLON_TEXT",
  "EB_GARAMOND",
  "LITERATA",
  "SOURCE_SERIF_4",
  "SOURCE_SERIF_FOUR",
  "MONTSERRAT",
  "METROPHOBIC",
  "METROPOLIS",
  "SOURCE_SANS_3",
  "SOURCE_SANS_THREE",
  "NUNITO_SANS",
  "ARIMO",
  "HANKEN_GROTESK",
  "RUBIK",
  "GEIST",
  "DM_SANS",
  "IBM_PLEX_SANS",
  "SORA",
  "ANYBODY",
  "ANTON",
  "ARCHIVO_NARROW",
  "ATKINSON_HYPERLEGIBLE_NEXT",
  "BARLOW_CONDENSED",
  "BEBAS_NEUE",
  "BODONI_MODA",
  "BRICOLAGE_GROTESQUE",
  "CHIVO",
  "CLIMATE_CRISIS",
  "COMFORTAA",
  "COURIER_PRIME",
  "FIRA_SANS",
  "GOOGLE_SANS",
  "GOOGLE_SANS_CODE",
  "GOOGLE_SANS_FLEX",
  "GOOGLE_SANS_MONO",
  "GOOGLE_SANS_TEXT",
  "IBM_PLEX_SERIF",
  "JETBRAINS_MONO",
  "KARLA",
  "LIBRE_FRANKLIN",
  "MERRIWEATHER",
  "NOTO_SANS",
  "OPEN_SANS",
  "OSWALD",
  "OUTFIT",
  "PLAYFAIR_DISPLAY",
  "POIRET_ONE",
  "QUESTRIAL",
  "QUICKSAND",
  "RALEWAY",
  "ROBOTO_FLEX",
  "SPACE_MONO",
  "SYNE",
  "VOLLKORN",
]);

const designThemeSchema = z
  .object({
    colorMode: colorModeSchema,
    headlineFont: fontSchema,
    bodyFont: fontSchema,
    roundness: roundnessSchema,
    customColor: z.string().min(1),
    colorVariant: colorVariantSchema.optional(),
    designMd: z.string().optional(),
    labelFont: fontSchema.optional(),
    overrideNeutralColor: z.string().optional(),
    overridePrimaryColor: z.string().optional(),
    overrideSecondaryColor: z.string().optional(),
    overrideTertiaryColor: z.string().optional(),
    spacing: z.record(z.string(), z.string()).optional(),
    typography: z.record(z.string(), typographySchema).optional(),
  })
  .passthrough();

const designSystemSchema = z
  .object({
    displayName: z.string().min(1),
    theme: designThemeSchema,
  })
  .passthrough();

const selectedScreenInstanceSchema = z
  .object({
    id: z.string().min(1),
    sourceScreen: z.string().min(1),
  })
  .passthrough();

function normalizeSelectedScreenInstance(
  instance: z.infer<typeof selectedScreenInstanceSchema>,
  projectId?: string
) {
  const identifier = toScreenIdentifier(instance.sourceScreen, projectId);
  return {
    ...instance,
    sourceScreen: identifier?.name ?? instance.sourceScreen,
  };
}

export function registerStitchDesignSystemTools(server: McpServer) {
  server.registerTool(
    "stitch_upload_design_md",
    {
      description:
        "MUTATING: Uploads DESIGN.md content to a Stitch project. Requires confirm: true. If rawInput is provided, it takes precedence over projectId/designMdBase64.",
      inputSchema: {
        projectId: z.string().optional(),
        designMdBase64: z.string().optional(),
        confirm: z.boolean().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, designMdBase64, confirm, rawInput }) => {
      const refusal = requireConfirmation("stitch_upload_design_md would upload DESIGN.md to Stitch", confirm);
      if (refusal) return { content: [{ type: "text", text: refusal }] };

      if (!rawInput && (!projectId || !designMdBase64)) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid input: provide projectId and designMdBase64, or rawInput.",
            },
          ],
        };
      }

      const input = rawInput ?? {
        projectId: toBareProjectId(projectId ?? ""),
        designMdBase64,
      };

      const client = new StitchClient(getStitchConfig());
      const result = await client.callTool({ toolName: "upload_design_md", input });
      return {
        content: [{ type: "text", text: compactStitchResult("Stitch uploaded DESIGN.md", result) }],
      };
    }
  );

  server.registerTool(
    "stitch_create_design_system",
    {
      description:
        "MUTATING: Creates a Stitch design system, optionally scoped to a project. Requires confirm: true. If rawInput is provided, it takes precedence over projectId/designSystem.",
      inputSchema: {
        projectId: z.string().optional(),
        designSystem: designSystemSchema.optional(),
        confirm: z.boolean().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, designSystem, confirm, rawInput }) => {
      const refusal = requireConfirmation("stitch_create_design_system would create a Stitch design system", confirm);
      if (refusal) return { content: [{ type: "text", text: refusal }] };

      if (!rawInput && !designSystem) {
        return {
          content: [{ type: "text", text: "Invalid input: provide designSystem, or rawInput." }],
        };
      }

      const input = rawInput ?? {
        designSystem,
        ...(projectId ? { projectId: toBareProjectId(projectId) } : {}),
      };

      const client = new StitchClient(getStitchConfig());
      const result = await client.callTool({ toolName: "create_design_system", input });
      return {
        content: [{ type: "text", text: compactStitchResult("Stitch created design system", result) }],
      };
    }
  );

  server.registerTool(
    "stitch_create_design_system_from_design_md",
    {
      description:
        "MUTATING: Creates a design system from an uploaded DESIGN.md screen instance. Requires confirm: true. If rawInput is provided, it takes precedence over other Stitch arguments.",
      inputSchema: {
        projectId: z.string().optional(),
        selectedScreenInstance: selectedScreenInstanceSchema.optional(),
        deviceType: deviceTypeSchema.optional(),
        confirm: z.boolean().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, selectedScreenInstance, deviceType, confirm, rawInput }) => {
      const refusal = requireConfirmation(
        "stitch_create_design_system_from_design_md would create a design system from uploaded DESIGN.md",
        confirm
      );
      if (refusal) return { content: [{ type: "text", text: refusal }] };

      if (!rawInput && (!projectId || !selectedScreenInstance)) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid input: provide projectId and selectedScreenInstance, or rawInput.",
            },
          ],
        };
      }

      const bareProjectId = projectId ? toBareProjectId(projectId) : undefined;
      const input = rawInput ?? {
        projectId: bareProjectId,
        selectedScreenInstance: normalizeSelectedScreenInstance(selectedScreenInstance!, bareProjectId),
        ...(deviceType ? { deviceType } : {}),
      };

      const client = new StitchClient(getStitchConfig());
      const result = await client.callTool({
        toolName: "create_design_system_from_design_md",
        input,
      });
      return {
        content: [
          {
            type: "text",
            text: compactStitchResult("Stitch created design system from DESIGN.md", result),
          },
        ],
      };
    }
  );

  server.registerTool(
    "stitch_update_design_system",
    {
      description:
        "MUTATING: Updates a Stitch design system for a project. Requires confirm: true. If rawInput is provided, it takes precedence over name/projectId/designSystem.",
      inputSchema: {
        name: z.string().optional(),
        projectId: z.string().optional(),
        designSystem: designSystemSchema.optional(),
        confirm: z.boolean().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ name, projectId, designSystem, confirm, rawInput }) => {
      const refusal = requireConfirmation("stitch_update_design_system would update a Stitch design system", confirm);
      if (refusal) return { content: [{ type: "text", text: refusal }] };

      if (!rawInput && (!name || !projectId || !designSystem)) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid input: provide name, projectId, and designSystem, or rawInput.",
            },
          ],
        };
      }

      const input = rawInput ?? {
        name: toAssetName(name ?? ""),
        projectId: toBareProjectId(projectId ?? ""),
        designSystem,
      };

      const client = new StitchClient(getStitchConfig());
      const result = await client.callTool({ toolName: "update_design_system", input });
      return {
        content: [{ type: "text", text: compactStitchResult("Stitch updated design system", result) }],
      };
    }
  );

  server.registerTool(
    "stitch_list_design_systems",
    {
      description:
        "Lists Stitch design systems. If projectId is provided it is normalized to a bare project id. If rawInput is provided, it takes precedence over projectId.",
      inputSchema: {
        projectId: z.string().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, rawInput }) => {
      const input = rawInput ?? {
        ...(projectId ? { projectId: toBareProjectId(projectId) } : {}),
      };

      const client = new StitchClient(getStitchConfig());
      const result = await client.callTool({ toolName: "list_design_systems", input });
      return {
        content: [{ type: "text", text: compactStitchResult("Stitch design systems", result) }],
      };
    }
  );

  server.registerTool(
    "stitch_apply_design_system",
    {
      description:
        "MUTATING: Applies a Stitch design system to selected screen instances. Requires confirm: true. If rawInput is provided, it takes precedence over other Stitch arguments.",
      inputSchema: {
        projectId: z.string().optional(),
        assetId: z.string().optional(),
        selectedScreenInstances: z.array(selectedScreenInstanceSchema).optional(),
        confirm: z.boolean().optional(),
        rawInput: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ projectId, assetId, selectedScreenInstances, confirm, rawInput }) => {
      const refusal = requireConfirmation("stitch_apply_design_system would modify selected Stitch screen instances", confirm);
      if (refusal) return { content: [{ type: "text", text: refusal }] };

      if (!rawInput && (!projectId || !assetId || !selectedScreenInstances?.length)) {
        return {
          content: [
            {
              type: "text",
              text:
                "Invalid input: provide projectId, assetId, and selectedScreenInstances, or rawInput.",
            },
          ],
        };
      }

      const bareProjectId = projectId ? toBareProjectId(projectId) : undefined;
      const input = rawInput ?? {
        projectId: bareProjectId,
        assetId: toBareAssetId(assetId ?? ""),
        selectedScreenInstances: (selectedScreenInstances ?? []).map((instance) =>
          normalizeSelectedScreenInstance(instance, bareProjectId)
        ),
      };

      const client = new StitchClient(getStitchConfig());
      const result = await client.callTool({ toolName: "apply_design_system", input });
      return {
        content: [{ type: "text", text: compactStitchResult("Stitch applied design system", result) }],
      };
    }
  );
}
