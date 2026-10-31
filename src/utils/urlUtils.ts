/**
 * URL Utilities
 */

import type { UrlType } from '../types';

/**
 * Determine if a URL is a direct video or a series/page URL.
 */
export function detectUrlType(url: string): UrlType {
  try {
    const u = new URL(url);
    const ext = u.pathname.split('.').pop()?.toLowerCase() ?? '';
    const videoExts = ['mp4', 'webm', 'ogg', 'm3u8', 'mpd', 'mov', 'mkv', 'avi', 'ts', 'flv'];
    if (videoExts.includes(ext)) return 'direct-video';
    // Series/FTP content page
    if (/\/content\//i.test(u.pathname) || /\/series\//i.test(u.pathname)) return 'series-page';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Normalize URL — ensure it has a protocol.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Resolve a possibly relative URL against a base.
 */
export function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * Extract filename from URL.
 */
export function extractFilename(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    return parts[parts.length - 1] || 'video';
  } catch {
    return 'video';
  }
}

