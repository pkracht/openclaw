import { splitMediaFromOutput } from "../../media/parse.js";
import { parseInlineDirectives } from "../../utils/directive-tags.js";
import { isSilentReplyText, SILENT_REPLY_TOKEN } from "../tokens.js";

export type ReplyDirectiveParseResult = {
  text: string;
  mediaUrls?: string[];
  mediaUrl?: string;
  replyToId?: string;
  replyToCurrent: boolean;
  replyToTag: boolean;
  audioAsVoice?: boolean;
  isSilent: boolean;
};

const TOOL_RESPONSE_BLOCK_RE = /<tool_response>\s*[\s\S]*?<\/tool_response>\s*/gi;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripFakePublicMediaUrls(text: string): string {
  const baseUrl = process.env.OPENCLAW_MEDIA_PUBLIC_BASE_URL?.trim();
  if (!baseUrl) {
    return text;
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const fakeTargetUrlRe = new RegExp(
    `${escapeRegex(normalizedBase)}(?:browser|camera|canvas|screen)/([A-Fa-f0-9]{16,64})(?=\\b|[\\s)\\]}>"'])`,
    "g",
  );
  return text
    .replace(fakeTargetUrlRe, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeVisibleReplyText(raw: string): string {
  if (!raw) {
    return raw;
  }
  const withoutToolResponses = raw.includes("<tool_response>")
    ? raw.replace(TOOL_RESPONSE_BLOCK_RE, " ")
    : raw;
  return stripFakePublicMediaUrls(withoutToolResponses);
}

export function parseReplyDirectives(
  raw: string,
  options: { currentMessageId?: string; silentToken?: string } = {},
): ReplyDirectiveParseResult {
  const split = splitMediaFromOutput(sanitizeVisibleReplyText(raw));
  let text = split.text ?? "";

  const replyParsed = parseInlineDirectives(text, {
    currentMessageId: options.currentMessageId,
    stripAudioTag: false,
    stripReplyTags: true,
  });

  if (replyParsed.hasReplyTag) {
    text = replyParsed.text;
  }

  const silentToken = options.silentToken ?? SILENT_REPLY_TOKEN;
  const isSilent = isSilentReplyText(text, silentToken);
  if (isSilent) {
    text = "";
  }

  return {
    text,
    mediaUrls: split.mediaUrls,
    mediaUrl: split.mediaUrl,
    replyToId: replyParsed.replyToId,
    replyToCurrent: replyParsed.replyToCurrent,
    replyToTag: replyParsed.hasReplyTag,
    audioAsVoice: split.audioAsVoice,
    isSilent,
  };
}
