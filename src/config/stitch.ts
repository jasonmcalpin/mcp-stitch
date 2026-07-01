import path from "node:path";

export const DEFAULT_STITCH_API_BASE_URL = "https://stitch.googleapis.com/mcp";

export type StitchConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  outputDir: string;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return parsed;
}

function getProjectRoot(): string {
  return process.env.PROJECT_ROOT?.trim() || process.cwd();
}

export function getStitchConfig(): StitchConfig {
  const apiKey = process.env.GOOGLE_API_KEY?.trim() ?? "";
  const baseUrl = process.env.STITCH_API_BASE_URL?.trim() || DEFAULT_STITCH_API_BASE_URL;

  const timeoutMs = parsePositiveInt(process.env.STITCH_TIMEOUT_MS, 30000);
  const maxRetries = parsePositiveInt(process.env.STITCH_MAX_RETRIES, 2);

  const rawOutputDir = process.env.STITCH_OUTPUT_DIR?.trim();
  const outputDir = rawOutputDir
    ? path.resolve(rawOutputDir)
    : path.resolve(getProjectRoot(), "stitch-output");

  return {
    apiKey,
    baseUrl,
    timeoutMs,
    maxRetries,
    outputDir,
  };
}

export function validateStitchApiConfig(config: StitchConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push("Missing GOOGLE_API_KEY environment variable.");
  }

  return errors;
}
