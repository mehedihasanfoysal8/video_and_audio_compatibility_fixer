/**
 * Diagnostics Engine
 *
 * Orchestrates the full audio/video compatibility analysis:
 * 1. Detect format from URL
 * 2. Check codec support via MediaCapabilities
 * 3. Inspect audio tracks via HTMLMediaElement.audioTracks
 * 4. Probe audio signal via Web Audio API
 * 5. Run recovery cascade
 * 6. Build the final diagnostic report
 */

import type { AudioDiagnosticReport, AudioTrackStatus, PlaybackMethod, ContainerAudioTrack } from '../types';
import { detectFormatFromUrl, detectCodecsFromElement } from '../media/MediaDetector';
import { checkCodecSupport } from './CodecDetector';
import { AudioAnalyzer } from '../media/AudioAnalyzer';
import {
  tryNativePlayback,
  tryHLSPlayback,
  buildRecommendation,
} from './RecoveryStrategies';

export class DiagnosticsEngine {
  private audioAnalyzer = new AudioAnalyzer();
  private video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  /**
   * Run the full diagnostic + recovery pipeline.
   */
  async analyze(url: string, containerTracks?: ContainerAudioTrack[]): Promise<AudioDiagnosticReport> {
    const timestamp = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const recoveryAttempted: PlaybackMethod[] = [];
    let recoverySuccess: boolean | null = null;
    // Use a mutable container so TypeScript doesn't narrow the type
    const pm: { value: PlaybackMethod } = { value: 'none' };

    // ── Step 1: Detect format ─────────────────────────────────────────────────
    const mediaInfo = detectFormatFromUrl(url);

    // ── Step 2: Attempt native playback first ─────────────────────────────────
    const nativeResult = await tryNativePlayback(this.video, url, mediaInfo);
    recoveryAttempted.push('native-html5');

    if (nativeResult.success) {
      pm.value = 'native-html5';
    } else {
      errors.push(nativeResult.error ?? 'Native playback failed.');
    }

    // ── Step 3: Detect codecs from loaded element ─────────────────────────────
    const codecHints = detectCodecsFromElement(this.video);
    mediaInfo.videoCodec = codecHints.videoCodec;
    mediaInfo.audioCodec = codecHints.audioCodec;

    // ── Step 4: Check codec support ───────────────────────────────────────────
    let codecSupport = null;
    if (codecHints.videoCodec && codecHints.audioCodec) {
      try {
        codecSupport = await checkCodecSupport(codecHints.videoCodec, codecHints.audioCodec);
      } catch (err) {
        warnings.push(`Codec check failed: ${err}`);
      }
    }

    // ── Step 5: Inspect audio tracks ──────────────────────────────────────────
    let { status: audioTrackStatus, count: audioTrackCount } = inspectAudioTracks(this.video);

    if (containerTracks && containerTracks.length > 0) {
      audioTrackCount = containerTracks.length;
      audioTrackStatus = 'present-active';
    }

    // Only flag missing if we are confident and have no hints
    if (audioTrackStatus === 'missing' && audioTrackCount > 0) {
      errors.push('No audio tracks enabled in the media element.');
    }

    // ── Step 6: Web Audio API signal detection (Non-blocking / Best-effort) ───────
    let webAudioSignalDetected: boolean | null = null;

    // ── Step 7: HLS.js fallback ONLY for actual HLS (.m3u8) streams ─────────────────
    const isRealHLS = mediaInfo.isHLS || url.toLowerCase().includes('.m3u8');
    const alreadyHLS = pm.value === 'hls-js';

    if (isRealHLS && !alreadyHLS) {
      const hlsResult = await tryHLSPlayback(this.video, url);
      recoveryAttempted.push('hls-js');

      if (hlsResult.success) {
        pm.value = 'hls-js';
        recoverySuccess = true;
      } else {
        errors.push(hlsResult.error ?? 'HLS.js fallback failed.');
      }
    }

    // ── Step 8: Determine overall recovery success ────────────────────────────
    if (recoverySuccess === null) {
      if (nativeResult.success && webAudioSignalDetected !== false) {
        recoverySuccess = true;
        if (webAudioSignalDetected === null) {
          warnings.push('Could not verify audio signal — CORS may block Web Audio analysis.');
        }
      } else if (!nativeResult.success) {
        recoverySuccess = false;
      }
    }

    // ── Step 9: Build recommendation ─────────────────────────────────────────
    const recommendation = buildRecommendation(
      audioTrackCount,
      codecSupport?.audioSupported ?? null,
      mediaInfo.audioCodec ?? 'unknown',
      recoverySuccess,
      pm.value,
      !!(containerTracks && containerTracks.length > 0)
    );

    return {
      url,
      timestamp,
      mediaInfo,
      codecSupport,
      audioTrackStatus,
      audioTrackCount,
      containerTracks,
      webAudioSignalDetected,
      playbackMethod: pm.value,
      recoveryAttempted,
      recoverySuccess,
      errors,
      warnings,
      recommendation,
    };
  }

  destroy(): void {
    this.audioAnalyzer.disconnect();
  }
}

// ─── Audio Track Inspector ─────────────────────────────────────────────────────
// AudioTrackList and AudioTrack are not fully typed in TypeScript DOM lib
interface MinimalAudioTrack { enabled: boolean }
interface MinimalAudioTrackList { length: number; [index: number]: MinimalAudioTrack }

function inspectAudioTracks(video: HTMLVideoElement): {
  status: AudioTrackStatus;
  count: number;
} {
  const tracks = (video as unknown as { audioTracks?: MinimalAudioTrackList }).audioTracks;

  if (tracks && tracks.length > 0) {
    let hasEnabled = false;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].enabled) { hasEnabled = true; break; }
    }
    return {
      status: hasEnabled ? 'present-active' : 'present-disabled',
      count: tracks.length,
    };
  }

  // In Chrome/Brave, audioTracks is often undefined or 0 on desktop for direct media files.
  // Instead of falsely showing "missing", detect from WebKit/HTMLMediaElement audio properties
  const hasAudioProp = (video as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
  if (hasAudioProp !== undefined && hasAudioProp > 0) {
    return { status: 'present-active', count: 1 };
  }

  // Check element readyState: if metadata loaded and element has duration, assume audio present
  if (video.readyState >= 1) {
    return { status: 'present-active', count: 1 };
  }

  return {
    status: 'unknown',
    count: 1,
  };
}
