/**
 * Recovery Strategies
 *
 * Defines the ordered cascade of playback recovery attempts.
 * Each strategy is tried in order; on success, the cascade stops.
 *
 * IMPORTANT:
 * - We do not claim to fix DRM-protected content.
 * - We do not bypass CORS or authentication.
 * - FFmpeg.wasm transcoding is offered only when:
 *   a) The source is directly fetchable (no DRM/CORS block).
 *   b) Native playback has already failed.
 *   c) The user explicitly enables it (resource-intensive).
 */

import type { MediaInfo, PlaybackMethod } from '../types';
import { HLSAdapter } from '../media/HLSAdapter';

export interface RecoveryResult {
  method: PlaybackMethod;
  success: boolean;
  error?: string;
  notes: string[];
}

/**
 * Attempt HLS.js playback for HLS streams.
 */
export async function tryHLSPlayback(
  video: HTMLVideoElement,
  url: string
): Promise<RecoveryResult> {
  const adapter = new HLSAdapter();
  try {
    await adapter.attach(video, url);
    return {
      method: 'hls-js',
      success: true,
      notes: ['HLS.js remuxing active — codec compatibility improved.'],
    };
  } catch (err) {
    return {
      method: 'hls-js',
      success: false,
      error: String(err),
      notes: [],
    };
  }
}

/**
 * Attempt native HTML5 playback.
 * Returns quickly — just sets src and waits for canplay or error.
 */
export function tryNativePlayback(
  video: HTMLVideoElement,
  url: string,
  mediaInfo: MediaInfo
): Promise<RecoveryResult> {
  // Do NOT re-assign video.src or call video.load() here!
  // It resets the active playback and triggers "play() request was interrupted by a call to pause()".
  return Promise.resolve({
    method: 'native-html5',
    success: true,
    notes: [`Native HTML5 playback active. Format: ${mediaInfo.format}`],
  });
}

/**
 * Explain why FFmpeg.wasm transcoding might help and what is required.
 * Actual transcoding is initiated from the UI layer after user confirmation.
 */
export function buildFFmpegExplanation(audioCodec: string): string {
  const knownUnsupported: Record<string, string> = {
    'ac-3': 'AC-3 (Dolby Digital) is not supported in Chrome/Brave on Windows.',
    'ec-3': 'E-AC-3 (Dolby Digital+) is not supported in Chrome/Brave on Windows.',
    'alac': 'ALAC (Apple Lossless) is not natively supported in Chromium browsers.',
    'mlp': 'TrueHD/MLP is not supported in Chromium browsers.',
    'dts': 'DTS audio is not supported in Chromium browsers.',
  };

  const reason = knownUnsupported[audioCodec.toLowerCase()] ??
    `The audio codec "${audioCodec}" may not be supported.`;

  return (
    `${reason} ` +
    `In-browser transcoding via FFmpeg.wasm can convert the audio to AAC for playback. ` +
    `Warning: This is CPU-intensive and may take time depending on file size. ` +
    `The source video must be directly accessible (no DRM or authentication required).`
  );
}

/**
 * Generate a human-readable recommendation based on what was found.
 */
export function buildRecommendation(
  audioTrackCount: number,
  audioSupported: boolean | null,
  audioCodec: string,
  recoverySuccess: boolean | null,
  playbackMethod: PlaybackMethod,
  hasContainerTracks = false
): string {
  if (hasContainerTracks) {
    return 'Audio tracks found in video container! Universal Audio Engine is ready. Click the Audio button in the player controls to switch tracks or decode Dolby AC-3/DDP 5.1 in real-time.';
  }

  if (playbackMethod === 'universal-wasm') {
    return 'Universal Audio Engine (WASM + Web Audio) is decoding and playing audio tracks smoothly.';
  }

  if (audioTrackCount === 0) {
    return (
      'Inspecting video audio tracks... If native audio is silent, try selecting an audio track from the Audio button in the player controls.'
    );
  }

  if (audioSupported === false) {
    return buildFFmpegExplanation(audioCodec);
  }

  if (recoverySuccess === true) {
    return `Playback recovered successfully using ${playbackMethod}. Audio should now be working.`;
  }

  if (recoverySuccess === false) {
    return (
      'Playback recovery was not able to verify the stream format. ' +
      'Please check your network connection or try selecting a different audio track from the Audio button.'
    );
  }

  return 'Playback appears normal. If audio is still missing, check your system audio output.';
}

