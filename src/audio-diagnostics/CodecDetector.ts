/**
 * CodecDetector
 *
 * Uses the MediaCapabilities API (and fallback canPlayType) to check
 * whether the current browser can decode a given codec combination.
 */

import type { CodecSupportResult } from '../types';

/** Known codec combinations to test */
const CODEC_PROFILES: Array<{ video: string; audio: string; label: string }> = [
  { video: 'avc1.42E01E', audio: 'mp4a.40.2', label: 'H.264 + AAC' },
  { video: 'avc1.640028', audio: 'mp4a.40.2', label: 'H.264 High + AAC' },
  { video: 'hev1.1.6.L93.B0', audio: 'mp4a.40.2', label: 'H.265/HEVC + AAC' },
  { video: 'vp8', audio: 'vorbis', label: 'VP8 + Vorbis' },
  { video: 'vp09.00.10.08', audio: 'opus', label: 'VP9 + Opus' },
  { video: 'av01.0.04M.08', audio: 'opus', label: 'AV1 + Opus' },
  { video: 'avc1.42E01E', audio: 'ac-3', label: 'H.264 + AC-3 (Dolby Digital)' },
  { video: 'avc1.42E01E', audio: 'ec-3', label: 'H.264 + E-AC-3 (Dolby Digital+)' },
  { video: 'avc1.42E01E', audio: 'flac', label: 'H.264 + FLAC' },
  { video: 'avc1.42E01E', audio: 'alac', label: 'H.264 + ALAC' },
];

/**
 * Check browser support for a specific video+audio codec pair.
 */
export async function checkCodecSupport(
  videoCodec: string,
  audioCodec: string
): Promise<CodecSupportResult> {
  const result: CodecSupportResult = {
    videoCodec,
    audioCodec,
    videoSupported: null,
    audioSupported: null,
  };

  // ── MediaCapabilities API (preferred, most accurate) ──────────────────────
  if ('mediaCapabilities' in navigator) {
    try {
      const videoConfig: VideoConfiguration = {
        contentType: `video/mp4; codecs="${videoCodec}"`,
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 30,
      };

      const audioConfig: AudioConfiguration = {
        contentType: `audio/mp4; codecs="${audioCodec}"`,
        bitrate: 192_000,
        samplerate: 48_000,
      };

      const [videoInfo, audioInfo] = await Promise.allSettled([
        navigator.mediaCapabilities.decodingInfo({
          type: 'file',
          video: videoConfig,
        }),
        navigator.mediaCapabilities.decodingInfo({
          type: 'file',
          audio: audioConfig,
        }),
      ]);

      if (videoInfo.status === 'fulfilled') {
        result.videoSupported = videoInfo.value.supported;
        result.smooth = videoInfo.value.smooth;
        result.powerEfficient = videoInfo.value.powerEfficient;
        result.raw = videoInfo.value;
      }

      if (audioInfo.status === 'fulfilled') {
        result.audioSupported = audioInfo.value.supported;
      }

      return result;
    } catch {
      // Fall through to canPlayType
    }
  }

  // ── Fallback: canPlayType ──────────────────────────────────────────────────
  const testEl = document.createElement('video');
  const videoMime = `video/mp4; codecs="${videoCodec}"`;
  const audioMime = `audio/mp4; codecs="${audioCodec}"`;

  const vr = testEl.canPlayType(videoMime);
  const ar = testEl.canPlayType(audioMime);

  result.videoSupported = vr === 'probably' || vr === 'maybe';
  result.audioSupported = ar === 'probably' || ar === 'maybe';

  return result;
}

/**
 * Run all known codec profiles and return a support matrix.
 * Useful for the diagnostics panel.
 */
export async function getBrowserCodecMatrix(): Promise<
  Array<CodecSupportResult & { label: string }>
> {
  const results = await Promise.all(
    CODEC_PROFILES.map(async ({ video, audio, label }) => {
      const res = await checkCodecSupport(video, audio);
      return { ...res, label };
    })
  );
  return results;
}

/**
 * Quick check: does this browser support AC-3/E-AC-3?
 * Chrome and Brave typically do NOT support AC-3 natively on Windows.
 */
export async function isAC3Supported(): Promise<boolean> {
  const [ac3, eac3] = await Promise.all([
    checkCodecSupport('avc1.42E01E', 'ac-3'),
    checkCodecSupport('avc1.42E01E', 'ec-3'),
  ]);
  return (ac3.audioSupported === true) || (eac3.audioSupported === true);
}
