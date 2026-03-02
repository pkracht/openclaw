import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

const EXTERNAL_SYSTEM_PROMPT_FILENAME = "system_prompt.xml";

function extractXmlSystemPrompt(raw: string): string {
  const cdataMatch = raw.match(
    /<systemPrompt\b[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/systemPrompt>/i,
  );
  if (cdataMatch?.[1]) {
    return cdataMatch[1].trim();
  }
  const plainMatch = raw.match(/<systemPrompt\b[^>]*>([\s\S]*?)<\/systemPrompt>/i);
  if (!plainMatch?.[1]) {
    return "";
  }
  return plainMatch[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export async function loadExternalSystemPrompt(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const promptPath = path.join(resolveStateDir(env), EXTERNAL_SYSTEM_PROMPT_FILENAME);
  try {
    const raw = await fs.readFile(promptPath, "utf8");
    const prompt = extractXmlSystemPrompt(raw);
    return prompt || undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

export async function mergeExternalSystemPrompt(
  inlinePrompt?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const parts = [inlinePrompt?.trim(), await loadExternalSystemPrompt(env)].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
