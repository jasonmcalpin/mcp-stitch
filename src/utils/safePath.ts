import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";

function normalizeForCompare(input: string): string {
  return process.platform === "win32" ? input.toLowerCase() : input;
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.length > 0 ? cleaned : "artifact";
}

function isPathInside(baseDir: string, targetPath: string): boolean {
  const baseCmp = normalizeForCompare(path.resolve(baseDir) + path.sep);
  const targetCmp = normalizeForCompare(path.resolve(targetPath));

  return targetCmp.startsWith(baseCmp) || targetCmp === normalizeForCompare(path.resolve(baseDir));
}

function validateRelativePath(relativeFilePath: string): void {
  if (!relativeFilePath || relativeFilePath.trim().length === 0) {
    throw new Error("Invalid output path: relative path cannot be empty.");
  }

  if (path.isAbsolute(relativeFilePath)) {
    throw new Error("Invalid output path: absolute paths are not allowed.");
  }

  const segments = relativeFilePath.split(/[\\/]+/);

  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error("Invalid output path: path traversal segments are not allowed.");
    }

    if (segment.includes(":")) {
      throw new Error("Invalid output path: suspicious path segment detected.");
    }
  }
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await lstat(pathname);
    return true;
  } catch {
    return false;
  }
}

async function assertNoSymlinkSegments(baseDir: string, relativeFilePath: string): Promise<void> {
  const base = path.resolve(baseDir);
  const parts = relativeFilePath.split(/[\\/]+/);
  const parentParts = parts.slice(0, -1);

  let current = base;
  for (const part of parentParts) {
    current = path.join(current, part);

    if (!(await pathExists(current))) {
      continue;
    }

    const stats = await lstat(current);
    if (stats.isSymbolicLink()) {
      throw new Error("Invalid output path: symlink directories are not allowed in output path.");
    }
  }
}

export async function prepareSafeOutputPath(baseDir: string, relativeFilePath: string): Promise<string> {
  validateRelativePath(relativeFilePath);

  const base = path.resolve(baseDir);
  await mkdir(base, { recursive: true });

  const baseReal = await realpath(base);
  const fullPath = path.resolve(baseReal, relativeFilePath);

  if (!isPathInside(baseReal, fullPath)) {
    throw new Error("Invalid output path: file must stay within the output directory.");
  }

  await assertNoSymlinkSegments(baseReal, relativeFilePath);

  const parent = path.dirname(fullPath);
  await mkdir(parent, { recursive: true });

  const parentReal = await realpath(parent);
  if (!isPathInside(baseReal, parentReal)) {
    throw new Error("Invalid output path: resolved parent path escapes output directory.");
  }

  if (await pathExists(fullPath)) {
    const fileStats = await lstat(fullPath);
    if (fileStats.isSymbolicLink()) {
      throw new Error("Invalid output path: target file cannot be a symlink.");
    }
  }

  return fullPath;
}
