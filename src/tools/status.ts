import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_STITCH_API_BASE_URL, getStitchConfig } from "../config/stitch.js";
import { getPackageInfo } from "../packageInfo.js";

function isConfigured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function configuredText(name: string): string {
  return isConfigured(name) ? "configured" : "missing";
}

function optionalText(name: string, fallback: string): string {
  return isConfigured(name) ? "configured" : fallback;
}

export function registerStitchStatusTool(server: McpServer) {
  server.registerTool(
    "stitch_info",
    {
      description:
        "Reports the running mcp-stitch package name and version without checking Stitch API configuration.",
      inputSchema: z.object({}),
    },
    async () => {
      const packageInfo = getPackageInfo();

      return {
        content: [
          {
            type: "text",
            text: [
              "Stitch MCP info",
              "",
              `- name: ${packageInfo.name}`,
              `- version: ${packageInfo.version}`,
              "- transport: stdio",
              "- package command: npx -y mcp-stitch",
            ].join("\n"),
          },
        ],
      };
    }
  );

  server.registerTool(
    "stitch_status",
    {
      description:
        "Checks Stitch MCP setup and reports missing required, recommended, and optional environment variables without exposing secret values.",
      inputSchema: z.object({}),
    },
    async () => {
      const config = getStitchConfig();
      const hasProjectRoot = isConfigured("PROJECT_ROOT");
      const packageInfo = getPackageInfo();

      const lines = [
        "Stitch setup status",
        "",
        "Package:",
        `- name: ${packageInfo.name}`,
        `- version: ${packageInfo.version}`,
        "",
        "Required configuration:",
        `- GOOGLE_API_KEY: ${configuredText("GOOGLE_API_KEY")}`,
        "",
        "Recommended configuration:",
        `- PROJECT_ROOT: ${hasProjectRoot ? "configured" : "missing"}`,
        ...(hasProjectRoot
          ? []
          : [
              "  Set PROJECT_ROOT to the workspace/project directory where Stitch artifacts should be exported.",
            ]),
        "",
        "Optional configuration:",
        `- STITCH_API_BASE_URL: ${isConfigured("STITCH_API_BASE_URL") ? "configured" : `using default ${DEFAULT_STITCH_API_BASE_URL}`}`,
        `- STITCH_OUTPUT_DIR: ${optionalText("STITCH_OUTPUT_DIR", `not set; defaulting to ${config.outputDir}`)}`,
        `- STITCH_TIMEOUT_MS: ${optionalText("STITCH_TIMEOUT_MS", `using default ${config.timeoutMs}`)}`,
        `- STITCH_MAX_RETRIES: ${optionalText("STITCH_MAX_RETRIES", `using default ${config.maxRetries}`)}`,
      ];

      return {
        content: [
          {
            type: "text",
            text: lines.join("\n"),
          },
        ],
      };
    }
  );
}
