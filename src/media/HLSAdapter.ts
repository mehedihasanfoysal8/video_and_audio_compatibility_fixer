/**
 * HLS Adapter
 *
 * Wraps HLS.js for adaptive bitrate HLS stream playback.
 * HLS.js remuxes TS segments into fragmented MP4, which handles
 * many codec compatibility issues that native HLS playback does not.
 */

import type Hls from 'hls.js';

export class HLSAdapter {
  private hls: Hls | null = null;
  private static HlsClass: typeof Hls | null = null;

  /** Lazy-load HLS.js from the bundle */
  static async load(): Promise<typeof Hls | null> {
    if (HLSAdapter.HlsClass) return HLSAdapter.HlsClass;
    try {
      const mod = await import('hls.js');
      HLSAdapter.HlsClass = mod.default;
      return HLSAdapter.HlsClass;
    } catch {
      return null;
    }
  }

  static isNativeHLSSupported(video: HTMLVideoElement): boolean {
    return video.canPlayType('application/vnd.apple.mpegurl') === 'probably' ||
           video.canPlayType('application/vnd.apple.mpegurl') === 'maybe';
  }

  async attach(video: HTMLVideoElement, url: string): Promise<void> {
    const HlsClass = await HLSAdapter.load();

    if (!HlsClass) {
      throw new Error('HLS.js could not be loaded.');
    }

    if (!HlsClass.isSupported()) {
      // Try native HLS (Safari, some mobile)
      if (HLSAdapter.isNativeHLSSupported(video)) {
        video.src = url;
        return;
      }
      throw new Error('HLS is not supported in this browser and HLS.js MSE is unavailable.');
    }

    this.destroy();

    this.hls = new HlsClass({
      enableWorker: true,
      lowLatencyMode: false,
      // Audio-specific: force AAC remux to help with unsupported audio tracks
      forceKeyFrameOnDiscontinuity: true,
    });

    this.hls.loadSource(url);
    this.hls.attachMedia(video);

    await new Promise<void>((resolve, reject) => {
      this.hls!.on(HlsClass!.Events.MANIFEST_PARSED, () => resolve());
      this.hls!.on(HlsClass!.Events.ERROR, (_event, data) => {
        if (data.fatal) reject(new Error(`HLS fatal error: ${data.type} / ${data.details}`));
      });
    });
  }

  getAudioTracks(): Array<{ id: number; name: string; lang?: string }> {
    return (this.hls?.audioTracks || []).map((t) => ({
      id: t.id,
      name: t.name || `Track ${t.id}`,
      lang: t.lang,
    }));
  }

  setAudioTrack(id: number): void {
    if (this.hls) this.hls.audioTrack = id;
  }

  destroy(): void {
    this.hls?.destroy();
    this.hls = null;
  }
}

