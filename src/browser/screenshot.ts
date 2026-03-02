import { getImageMetadata, IMAGE_REDUCE_QUALITY_STEPS, resizeToJpeg } from "../media/image-ops.js";

export const DEFAULT_BROWSER_SCREENSHOT_MAX_WIDTH = 1600;
export const DEFAULT_BROWSER_SCREENSHOT_MAX_HEIGHT = 5000;
export const DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

export async function normalizeBrowserScreenshot(
  buffer: Buffer,
  opts?: {
    maxWidth?: number;
    maxHeight?: number;
    maxBytes?: number;
  },
): Promise<{ buffer: Buffer; contentType?: "image/jpeg" }> {
  const maxWidth = Math.max(1, Math.round(opts?.maxWidth ?? DEFAULT_BROWSER_SCREENSHOT_MAX_WIDTH));
  const maxHeight = Math.max(
    1,
    Math.round(opts?.maxHeight ?? DEFAULT_BROWSER_SCREENSHOT_MAX_HEIGHT),
  );
  const maxBytes = Math.max(1, Math.round(opts?.maxBytes ?? DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES));

  const meta = await getImageMetadata(buffer);
  const width = Number(meta?.width ?? 0);
  const height = Number(meta?.height ?? 0);

  if (
    buffer.byteLength <= maxBytes &&
    (width === 0 || (width <= maxWidth && height <= maxHeight))
  ) {
    return { buffer };
  }

  const sizeGrid = [
    { maxWidth, maxHeight },
    { maxWidth: Math.min(maxWidth, 1280), maxHeight },
    { maxWidth: Math.min(maxWidth, 1080), maxHeight },
    { maxWidth: Math.min(maxWidth, 1080), maxHeight: Math.min(maxHeight, 4000) },
    { maxWidth: Math.min(maxWidth, 900), maxHeight: Math.min(maxHeight, 3500) },
    { maxWidth: Math.min(maxWidth, 800), maxHeight: Math.min(maxHeight, 3000) },
    { maxWidth: Math.min(maxWidth, 720), maxHeight: Math.min(maxHeight, 2400) },
  ].filter(
    (candidate, index, all) =>
      candidate.maxWidth > 0 &&
      candidate.maxHeight > 0 &&
      all.findIndex(
        (other) => other.maxWidth === candidate.maxWidth && other.maxHeight === candidate.maxHeight,
      ) === index,
  );

  let smallest: { buffer: Buffer; size: number } | null = null;

  for (const size of sizeGrid) {
    for (const quality of IMAGE_REDUCE_QUALITY_STEPS) {
      const out = await resizeToJpeg({
        buffer,
        maxWidth: width > 0 ? Math.min(size.maxWidth, width) : size.maxWidth,
        maxHeight: height > 0 ? Math.min(size.maxHeight, height) : size.maxHeight,
        quality,
        withoutEnlargement: true,
      });

      if (!smallest || out.byteLength < smallest.size) {
        smallest = { buffer: out, size: out.byteLength };
      }

      if (out.byteLength <= maxBytes) {
        return { buffer: out, contentType: "image/jpeg" };
      }
    }
  }

  const best = smallest?.buffer ?? buffer;
  throw new Error(
    `Browser screenshot could not be reduced below ${(maxBytes / (1024 * 1024)).toFixed(0)}MB (got ${(best.byteLength / (1024 * 1024)).toFixed(2)}MB)`,
  );
}
