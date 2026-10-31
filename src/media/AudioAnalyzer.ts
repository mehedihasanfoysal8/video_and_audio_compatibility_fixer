/**
 * AudioAnalyzer
 *
 * Uses the Web Audio API to detect whether audio signal is actually
 * present in the stream during playback. This distinguishes between
 * "audio track missing" vs "audio track present but silent by content".
 */

export class AudioAnalyzer {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private connected = false;

  /**
   * Connect to a video element's audio output.
   * Note: CORS policy on the media URL must allow cross-origin audio processing.
   * If it doesn't, this will throw a SecurityError.
   */
  connect(video: HTMLVideoElement): void {
    try {
      if (this.connected) this.disconnect();

      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaElementSource(video);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

      // Route: source → analyser → destination (speakers)
      this.source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.connected = true;
    } catch (err) {
      // CORS or security error — cannot analyze
      console.warn('[AudioAnalyzer] Cannot connect:', err);
      this.connected = false;
    }
  }

  /**
   * Sample the audio analyser to check if audio signal exists.
   * Returns true if energy above threshold detected, false if silent,
   * null if analysis not available.
   */
  async sampleAudio(durationMs = 500): Promise<boolean | null> {
    if (!this.connected || !this.analyser || !this.dataArray) return null;
    if (this.ctx?.state === 'suspended') {
      try { await this.ctx.resume(); } catch { return null; }
    }

    return new Promise((resolve) => {
      let maxEnergy = 0;
      const startTime = Date.now();

      const sample = () => {
        if (!this.analyser || !this.dataArray) { resolve(null); return; }

        this.analyser.getByteFrequencyData(this.dataArray);
        const energy = this.dataArray.reduce((sum, v) => sum + v, 0) / this.dataArray.length;
        if (energy > maxEnergy) maxEnergy = energy;

        if (Date.now() - startTime < durationMs) {
          requestAnimationFrame(sample);
        } else {
          // Threshold: anything above 1 means some audio signal present
          resolve(maxEnergy > 1);
        }
      };

      requestAnimationFrame(sample);
    });
  }

  /**
   * Check if browser AudioContext is available.
   */
  static isSupported(): boolean {
    return typeof AudioContext !== 'undefined' ||
           typeof (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext !== 'undefined';
  }

  disconnect(): void {
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      this.ctx?.close();
    } catch { /* ignore */ }
    this.source = null;
    this.analyser = null;
    this.ctx = null;
    this.dataArray = null;
    this.connected = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
