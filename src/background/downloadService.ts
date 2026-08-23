import { sanitizeFilenamePart } from "@shared/utils/filename";
import { logger } from "@shared/utils/logger";

/** Downloads a PNG data URL using the required MV3 downloads permission. */
export async function downloadPng(dataUrl: string, filename: string): Promise<string | null> {
  try {
    const safeFilename = `${sanitizeFilenamePart(filename.replace(/\.png$/i, ""))}.png`;
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: safeFilename,
      saveAs: false,
    });
    return String(downloadId);
  } catch (error) {
    logger.warn("download.failed", { filename }, error);
    return null;
  }
}
