import os from "node:os";
import path from "node:path";
import { resolveConfigDir } from "../utils.js";

function expandHomeDir(input: string): string {
  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function ensureTrailingSlash(input: string): string {
  return input.endsWith("/") ? input : `${input}/`;
}

export function resolvePublicMediaUrl(source: string): string | undefined {
  const baseUrl = process.env.OPENCLAW_MEDIA_PUBLIC_BASE_URL?.trim();
  if (!baseUrl) {
    return undefined;
  }

  const trimmed = source.trim();
  if (!trimmed || /^[a-z]+:\/\//i.test(trimmed)) {
    return undefined;
  }

  const mediaRoot = path.resolve(resolveConfigDir(), "media");
  const absoluteSource = path.resolve(expandHomeDir(trimmed.replace(/^file:\/\//i, "")));
  const relativePath = path.relative(mediaRoot, absoluteSource);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    relativePath === "."
  ) {
    return undefined;
  }

  const normalizedRelative = relativePath.split(path.sep).map(encodeURIComponent).join("/");
  return new URL(normalizedRelative, ensureTrailingSlash(baseUrl)).toString();
}
