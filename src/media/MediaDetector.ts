/**
 * MediaDetector
 *
 * Determines video format, codec hints, and MIME type from a URL and
 * live media element metadata. Uses only real browser APIs.
 */

import type { MediaInfo, VideoFormat } from '../types';

const VIDEO_FORMAT_MAP: Record<string, VideoFormat> = {
  mp4: 'mp4',
  m4v: 'mp4',
  webm: 'webm',
  ogg: 'ogg',
  ogv: 'ogg',
  m3u8: 'hls',
  mpd: 'dash',
  mov: 'mov',
  mkv: 'mkv',
  avi: 'avi',
};

const MIME_MAP: Record<VideoFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  hls: 'application/x-mpegURL',
  dash: 'application/dash+xml',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  unknown: 'application/octet-stream',
};

/**
 * Detect media format from URL alone (fast, no network).
 */
export function detectFormatFromUrl(url: string): MediaInfo {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const ext = path.split('.').pop() ?? '';

    const format: VideoFormat = VIDEO_FORMAT_MAP[ext] ?? 'unknown';
    const mimeType = MIME_MAP[format];

    return {
      url,
      format,
      mimeType,
      isHLS: format === 'hls',
      isDASH: format === 'dash',
    };
  } catch {
    return {
      url,
      format: 'unknown',
      mimeType: 'application/octet-stream',
      isHLS: false,
      isDASH: false,
    };
  }
}

/**
 * Detect codec info from a loaded HTMLVideoElement or URL string.
 * Inspects filename patterns (e.g. H.264, DDP5.1, AAC, etc.)
 */
export function detectCodecsFromElement(video: HTMLVideoElement): {
  videoCodec: string | undefined;
  audioCodec: string | undefined;
  container: string | undefined;
} {
  const src = video.currentSrc || video.src || '';
  const info = detectFormatFromUrl(src);
  const srcLower = src.toLowerCase();

  let detectedAudio = 'mp4a.40.2'; // default AAC
  let detectedVideo = 'avc1.42E01E'; // default H.264

  // Detect Audio from filename
  if (srcLower.includes('ddp5.1') || srcLower.includes('ddp') || srcLower.includes('eac3') || srcLower.includes('ec-3')) {
    detectedAudio = 'ec-3';
  } else if (srcLower.includes('ac3') || srcLower.includes('ac-3') || srcLower.includes('dd5.1')) {
    detectedAudio = 'ac-3';
  } else if (srcLower.includes('aac')) {
    detectedAudio = 'mp4a.40.2';
  } else if (srcLower.includes('opus')) {
    detectedAudio = 'opus';
  }

  // Detect Video from filename
  if (srcLower.includes('h.265') || srcLower.includes('hevc') || srcLower.includes('x265')) {
    detectedVideo = 'hev1.1.6.L93.B0';
  } else if (srcLower.includes('av1')) {
    detectedVideo = 'av01.0.04M.08';
  } else if (srcLower.includes('vp9')) {
    detectedVideo = 'vp09.00.10.08';
  } else if (srcLower.includes('h.264') || srcLower.includes('x264') || srcLower.includes('avc')) {
    detectedVideo = 'avc1.42E01E';
  }

  return {
    videoCodec: detectedVideo,
    audioCodec: detectedAudio,
    container: info.format,
  };
}

/**
 * Probe a URL via HEAD request to get Content-Type.
 * Returns null if CORS or network blocks it.
 */
export async function probeContentType(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { method: 'HEAD', mode: 'cors' });
    return resp.headers.get('content-type');
  } catch {
    try {
      // Try no-cors (won't expose headers but at least won't throw)
      await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      return null; // opaque response
    } catch {
      return null;
    }
  }
}

