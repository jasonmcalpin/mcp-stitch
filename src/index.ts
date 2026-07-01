#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import "dotenv/config";

import { registerStitchStatusTool } from "./tools/status.js";
import { registerStitchProjectTools } from "./tools/stitchProjects.js";
import { registerStitchScreenTools } from "./tools/stitchScreens.js";
import { registerStitchDesignSystemTools } from "./tools/stitchDesignSystems.js";
import { registerStitchExportTool } from "./tools/stitchExport.js";
import { getPackageInfo } from "./packageInfo.js";

const packageInfo = getPackageInfo();

const server = new McpServer({
  name: packageInfo.name,
  version: packageInfo.version,
});

registerStitchStatusTool(server);
registerStitchProjectTools(server);
registerStitchScreenTools(server);
registerStitchDesignSystemTools(server);
registerStitchExportTool(server);



const transport = new StdioServerTransport();
await server.connect(transport);
