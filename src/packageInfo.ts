import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type PackageInfo = {
  name: string;
  version: string;
};

export function getPackageInfo(): PackageInfo {
  try {
    const pkg = require("../package.json") as {
      name?: unknown;
      version?: unknown;
    };

    return {
      name: typeof pkg.name === "string" ? pkg.name : "mcp-stitch",
      version: typeof pkg.version === "string" ? pkg.version : "unknown",
    };
  } catch {
    return {
      name: "mcp-stitch",
      version: "unknown",
    };
  }
}
