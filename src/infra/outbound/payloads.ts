import { parseReplyDirectives } from "../../auto-reply/reply/reply-directives.js";
import {
  isRenderablePayload,
  shouldSuppressReasoningPayload,
} from "../../auto-reply/reply/reply-payloads.js";
import type { ReplyPayload } from "../../auto-reply/types.js";
import { resolvePublicMediaUrl } from "../../media/public-url.js";

export type NormalizedOutboundPayload = {
  text: string;
  mediaUrls: string[];
  channelData?: Record<string, unknown>;
};

export type OutboundPayloadJson = {
  text: string;
  mediaUrl: string | null;
  mediaUrls?: string[];
  channelData?: Record<string, unknown>;
};

const LOCAL_MEDIA_TOKEN_RE = /\bMEDIA:\s*`?([^\n`]+)`?/gi;
const TOOL_RESPONSE_BLOCK_RE = /<tool_response>\s*[\s\S]*?<\/tool_response>\s*/gi;

function normalizeMediaUrlEntry(entry?: string | null): string | undefined {
  const trimmed = entry?.trim();
  if (!trimmed) {
    return undefined;
  }
  return resolvePublicMediaUrl(trimmed) ?? trimmed;
}

function rewriteVisibleMediaTokens(text: string): string {
  if (!text.includes("MEDIA:")) {
    return text;
  }
  return text.replace(LOCAL_MEDIA_TOKEN_RE, (match, rawValue: string) => {
    const candidate = rawValue
      .trim()
      .replace(/^[`"'[{(]+/, "")
      .replace(/[`"'\\})\],]+$/, "");
    const resolved = normalizeMediaUrlEntry(candidate);
    return resolved ?? match;
  });
}

function stripLiteralToolResponseBlocks(text: string): string {
  if (!text.includes("<tool_response>")) {
    return text;
  }
  return text.replace(TOOL_RESPONSE_BLOCK_RE, "").trim();
}

function mergeMediaUrls(...lists: Array<ReadonlyArray<string | undefined> | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    if (!list) {
      continue;
    }
    for (const entry of list) {
      const trimmed = entry?.trim();
      if (!trimmed) {
        continue;
      }
      const normalizedEntry = resolvePublicMediaUrl(trimmed) ?? trimmed;
      if (seen.has(normalizedEntry)) {
        continue;
      }
      seen.add(normalizedEntry);
      merged.push(normalizedEntry);
    }
  }
  return merged;
}

export function normalizeReplyPayloadsForDelivery(
  payloads: readonly ReplyPayload[],
): ReplyPayload[] {
  return payloads.flatMap((payload) => {
    if (shouldSuppressReasoningPayload(payload)) {
      return [];
    }
    const parsed = parseReplyDirectives(payload.text ?? "");
    const explicitMediaUrls = payload.mediaUrls ?? parsed.mediaUrls;
    const explicitMediaUrl = payload.mediaUrl ?? parsed.mediaUrl;
    const normalizedMediaUrl = normalizeMediaUrlEntry(explicitMediaUrl);
    const mergedMedia = mergeMediaUrls(
      explicitMediaUrls,
      normalizedMediaUrl ? [normalizedMediaUrl] : undefined,
    );
    const hasMultipleMedia = (explicitMediaUrls?.length ?? 0) > 1;
    const resolvedMediaUrl = hasMultipleMedia ? undefined : normalizedMediaUrl;
    const next: ReplyPayload = {
      ...payload,
      text: rewriteVisibleMediaTokens(stripLiteralToolResponseBlocks(parsed.text ?? "")),
      mediaUrls: mergedMedia.length ? mergedMedia : undefined,
      mediaUrl: resolvedMediaUrl,
      replyToId: payload.replyToId ?? parsed.replyToId,
      replyToTag: payload.replyToTag || parsed.replyToTag,
      replyToCurrent: payload.replyToCurrent || parsed.replyToCurrent,
      audioAsVoice: Boolean(payload.audioAsVoice || parsed.audioAsVoice),
    };
    if (parsed.isSilent && mergedMedia.length === 0) {
      return [];
    }
    if (!isRenderablePayload(next)) {
      return [];
    }
    return [next];
  });
}

export function normalizeOutboundPayloads(
  payloads: readonly ReplyPayload[],
): NormalizedOutboundPayload[] {
  return normalizeReplyPayloadsForDelivery(payloads)
    .map((payload) => {
      const channelData = payload.channelData;
      const normalized: NormalizedOutboundPayload = {
        text: payload.text ?? "",
        mediaUrls: payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []),
      };
      if (channelData && Object.keys(channelData).length > 0) {
        normalized.channelData = channelData;
      }
      return normalized;
    })
    .filter(
      (payload) =>
        payload.text ||
        payload.mediaUrls.length > 0 ||
        Boolean(payload.channelData && Object.keys(payload.channelData).length > 0),
    );
}

export function normalizeOutboundPayloadsForJson(
  payloads: readonly ReplyPayload[],
): OutboundPayloadJson[] {
  return normalizeReplyPayloadsForDelivery(payloads).map((payload) => ({
    text: payload.text ?? "",
    mediaUrl: payload.mediaUrl ?? null,
    mediaUrls: payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : undefined),
    channelData: payload.channelData,
  }));
}

export function formatOutboundPayloadLog(
  payload: Pick<NormalizedOutboundPayload, "text" | "channelData"> & {
    mediaUrls: readonly string[];
  },
): string {
  const lines: string[] = [];
  if (payload.text) {
    lines.push(payload.text.trimEnd());
  }
  for (const url of payload.mediaUrls) {
    lines.push(`MEDIA:${url}`);
  }
  return lines.join("\n");
}
