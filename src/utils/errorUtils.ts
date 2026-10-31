/**
 * Error utilities
 */

/**
 * Convert any thrown value to a user-friendly string.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * MediaError code to text.
 */
export function mediaErrorText(code: number): string {
  const map: Record<number, string> = {
    1: 'MEDIA_ERR_ABORTED — Fetching aborted by user.',
    2: 'MEDIA_ERR_NETWORK — Network error during fetch.',
    3: 'MEDIA_ERR_DECODE — Decoding error (unsupported codec or corrupt file).',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED — Media format not supported.',
  };
  return map[code] ?? `Unknown MediaError code ${code}.`;
}

/**
 * Check if an error is a DRM-related error.
 */
export function isDRMError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return msg.includes('drm') || msg.includes('protected') || msg.includes('encryptederror') ||
    msg.includes('key') || msg.includes('license');
}

/**
 * Check if an error is a CORS error.
 */
export function isCORSError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return msg.includes('cors') || msg.includes('cross-origin') || msg.includes('network error') ||
    msg.includes('blocked');
}

