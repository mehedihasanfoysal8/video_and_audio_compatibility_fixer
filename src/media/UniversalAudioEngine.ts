/**
 * Universal Audio Engine
 *
 * Provides full audio track inspection and client-side decoding
 * for AC-3, E-AC-3 (Dolby Digital Plus), AAC, and multi-track audio
 * in containers like MKV and MP4.
 *
 * Powered by mediabunny + @mediabunny/ac3 + Web Audio API.
 */

import { Input, UrlSource, ALL_FORMATS, AudioBufferSink, type InputAudioTrack } from 'mediabunny';
import { registerAc3Decoder } from '@mediabunny/ac3';
import type { ContainerAudioTrack } from '../types';

let ac3Registered = false;
function ensureAc3Registered() {
  if (!ac3Registered) {
    try {
      registerAc3Decoder();
      ac3Registered = true;
      console.log('[UniversalAudioEngine] AC-3/E-AC-3 WebAssembly decoder registered.');
    } catch (err) {
      console.warn('[UniversalAudioEngine] AC-3 registration error:', err);
    }
  }
}

interface ScheduledBuffer {
  source: AudioBufferSourceNode;
  endTime: number;
}

export class UniversalAudioEngine {
  private video: HTMLVideoElement;
  private currentUrl: string | null = null;
  private input: Input | null = null;
  private tracks: InputAudioTrack[] = [];
  private trackMetadata: ContainerAudioTrack[] = [];
  private activeTrackIndex: number = -1; // -1 means native audio
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private abortController: AbortController | null = null;
  private scheduledNodes: ScheduledBuffer[] = [];
  private onTracksDiscovered?: (tracks: ContainerAudioTrack[]) => void;
  private onEngineStateChange?: (active: boolean, trackName: string) => void;
  private userVolume = 1;
  private userMuted = false;
  private boundUnlock = this.handleUserUnlock.bind(this);

  // Bound event handlers for video element synchronization
  private boundOnPlay = this.handleVideoPlay.bind(this);
  private boundOnPause = this.handleVideoPause.bind(this);
  private boundOnSeeked = this.handleVideoSeeked.bind(this);
  private boundOnSeeking = this.handleVideoSeeking.bind(this);
  private boundOnVolume = this.handleVideoVolume.bind(this);
  private boundOnRate = this.handleVideoRate.bind(this);

  constructor(
    video: HTMLVideoElement,
    callbacks?: {
      onTracksDiscovered?: (tracks: ContainerAudioTrack[]) => void;
      onEngineStateChange?: (active: boolean, trackName: string) => void;
    }
  ) {
    this.video = video;
    this.onTracksDiscovered = callbacks?.onTracksDiscovered;
    this.onEngineStateChange = callbacks?.onEngineStateChange;

    ensureAc3Registered();
    this.bindVideoEvents();

    // Unlock AudioContext on any user gesture (click/keydown/pointer) to satisfy browser autoplay policy
    window.addEventListener('click', this.boundUnlock, { capture: true, passive: true });
    window.addEventListener('keydown', this.boundUnlock, { capture: true, passive: true });
    window.addEventListener('pointerdown', this.boundUnlock, { capture: true, passive: true });
  }

  private handleUserUnlock(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(() => {
        console.log('[UniversalAudioEngine] AudioContext successfully resumed by user interaction.');
      }).catch(() => {});
    }
  }

  async resumeContext(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
        console.log('[UniversalAudioEngine] AudioContext resumed explicitly.');
      } catch (err) {
        console.warn('[UniversalAudioEngine] Failed to resume AudioContext:', err);
      }
    }
  }

  setVolume(vol: number): void {
    this.userVolume = Math.max(0, Math.min(1, vol));
    this.userMuted = false;
    this.updateGain();
  }

  setMuted(muted: boolean): void {
    this.userMuted = muted;
    this.updateGain();
  }

  private bindVideoEvents(): void {
    this.video.addEventListener('play', this.boundOnPlay);
    this.video.addEventListener('pause', this.boundOnPause);
    this.video.addEventListener('seeked', this.boundOnSeeked);
    this.video.addEventListener('seeking', this.boundOnSeeking);
    this.video.addEventListener('volumechange', this.boundOnVolume);
    this.video.addEventListener('ratechange', this.boundOnRate);
  }

  private unbindVideoEvents(): void {
    this.video.removeEventListener('play', this.boundOnPlay);
    this.video.removeEventListener('pause', this.boundOnPause);
    this.video.removeEventListener('seeked', this.boundOnSeeked);
    this.video.removeEventListener('seeking', this.boundOnSeeking);
    this.video.removeEventListener('volumechange', this.boundOnVolume);
    this.video.removeEventListener('ratechange', this.boundOnRate);
  }

  /**
   * Load a new video URL and inspect container for all audio tracks.
   */
  async loadUrl(url: string): Promise<ContainerAudioTrack[]> {
    this.stopPlayback();
    this.currentUrl = url;
    this.tracks = [];
    this.trackMetadata = [];
    this.activeTrackIndex = -1;

    try {
      console.log('[UniversalAudioEngine] Inspecting container tracks for:', url);
      // Add stream parameter so IDM ignores range fetches for audio demuxing
      const streamSafeUrl = url.includes('?')
        ? `${url}&ext=stream.m3u8`
        : `${url}?ext=stream.m3u8`;

      this.input = new Input({
        source: new UrlSource(streamSafeUrl, {
          maxCacheSize: 50 * 1024 * 1024,
        }),
        formats: ALL_FORMATS,
      });

      const audioTracks = await this.input.getAudioTracks();
      console.log(`[UniversalAudioEngine] Found ${audioTracks.length} audio tracks in container.`);

      const meta: ContainerAudioTrack[] = [];
      for (let i = 0; i < audioTracks.length; i++) {
        const track = audioTracks[i];
        const name = (await track.getName()) || '';
        const lang = (await track.getLanguageCode()) || 'und';
        const codec = track.codec || 'unknown';
        const channels = await track.getNumberOfChannels();
        const sampleRate = await track.getSampleRate();

        let friendlyName = name.trim();
        if (!friendlyName) {
          const langDisplay = lang === 'und' ? `Track ${i + 1}` : lang.toUpperCase();
          friendlyName = `${langDisplay} (${codec.toUpperCase()} ${channels > 2 ? `${channels}.1` : 'Stereo'})`;
        }

        meta.push({
          index: i,
          id: track.id,
          name: friendlyName,
          language: lang,
          codec: codec.toLowerCase(),
          channels,
          sampleRate,
          isDefault: i === 0,
        });
      }

      this.tracks = audioTracks;
      this.trackMetadata = meta;
      this.onTracksDiscovered?.(meta);
      return meta;
    } catch (err) {
      console.warn('[UniversalAudioEngine] Failed to inspect container audio tracks:', err);
      return [];
    }
  }

  /**
   * Switch to a specific audio track:
   * - index -1: Use browser native audio output
   * - index >= 0: Decode this track via WebCodecs/AC3 WASM and Web Audio API
   */
  async selectTrack(index: number): Promise<boolean> {
    if (index === this.activeTrackIndex) return true;

    if (index === -1) {
      // Revert to native audio
      this.stopPlayback();
      this.activeTrackIndex = -1;
      this.video.muted = false;
      this.onEngineStateChange?.(false, 'Native Browser Audio');
      console.log('[UniversalAudioEngine] Switched to Native Audio');
      return true;
    }

    if (!this.tracks[index]) {
      console.warn(`[UniversalAudioEngine] Track index ${index} not found.`);
      return false;
    }

    const trackMeta = this.trackMetadata[index];
    console.log(`[UniversalAudioEngine] Activating track ${index}:`, trackMeta.name);

    this.stopPlayback();
    this.activeTrackIndex = index;

    // Mute native video so only our decoded audio plays
    this.video.muted = true;
    this.onEngineStateChange?.(true, trackMeta.name);

    if (!this.video.paused) {
      this.startPlayback(this.video.currentTime);
    }

    return true;
  }

  /**
   * Start decoding and scheduling audio buffers starting from the specified timestamp.
   */
  private async startPlayback(startTime: number): Promise<void> {
    if (this.activeTrackIndex < 0 || !this.tracks[this.activeTrackIndex]) return;

    this.stopPlayback();
    this.isPlaying = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      this.ensureAudioContext();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const track = this.tracks[this.activeTrackIndex];
      const sink = new AudioBufferSink(track);

      const ctx = this.audioCtx!;
      const gain = this.gainNode!;
      this.updateGain();

      const playbackRate = this.video.playbackRate || 1;
      const initialVideoTime = Math.max(0, startTime);
      let nextPlayTime = 0;

      console.log(
        `[UniversalAudioEngine] Streaming audio from ${initialVideoTime.toFixed(2)}s (rate=${playbackRate})`
      );

      // Async iteration over audio buffers
      for await (const wrapped of sink.buffers(initialVideoTime)) {
        if (signal.aborted) break;

        const { buffer, duration } = wrapped;

        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        // Anchor nextPlayTime to current time + 50ms lead on first packet or when falling behind
        if (nextPlayTime < ctx.currentTime) {
          nextPlayTime = ctx.currentTime + 0.05;
        }

        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = buffer;
        sourceNode.playbackRate.value = playbackRate;
        sourceNode.connect(gain);

        sourceNode.start(nextPlayTime);
        const scaledDuration = duration / playbackRate;
        this.scheduledNodes.push({ source: sourceNode, endTime: nextPlayTime + scaledDuration });

        nextPlayTime += scaledDuration;

        // Clean up already finished nodes
        this.scheduledNodes = this.scheduledNodes.filter((n) => n.endTime > ctx.currentTime);

        // Throttle pipeline: don't buffer more than 3 seconds ahead to keep bandwidth minimal
        while (nextPlayTime - ctx.currentTime > 3) {
          if (signal.aborted) break;
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    } catch (err) {
      if (!signal.aborted) {
        console.warn('[UniversalAudioEngine] Audio stream error:', err);
      }
    }
  }

  private stopPlayback(): void {
    this.isPlaying = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Stop all scheduled source nodes
    for (const item of this.scheduledNodes) {
      try {
        item.source.stop();
        item.source.disconnect();
      } catch { /* ignore */ }
    }
    this.scheduledNodes = [];
  }

  private ensureAudioContext(): void {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.connect(this.audioCtx.destination);
    }
  }

  private updateGain(): void {
    if (!this.gainNode) return;
    // Follow the dedicated user volume and user mute state (NEVER the native video.muted)
    const effectiveVol = this.userMuted ? 0 : this.userVolume;
    this.gainNode.gain.setValueAtTime(effectiveVol, this.audioCtx?.currentTime || 0);
    console.log(`[UniversalAudioEngine] Gain updated to ${effectiveVol} (userMuted=${this.userMuted}, userVolume=${this.userVolume})`);
  }

  // ── Video Event Handlers ───────────────────────────────────────────────────

  private handleVideoPlay(): void {
    if (this.activeTrackIndex >= 0) {
      this.startPlayback(this.video.currentTime);
    }
  }

  private handleVideoPause(): void {
    if (this.activeTrackIndex >= 0) {
      this.stopPlayback();
    }
  }

  private handleVideoSeeking(): void {
    if (this.activeTrackIndex >= 0) {
      this.stopPlayback();
    }
  }

  private handleVideoSeeked(): void {
    if (this.activeTrackIndex >= 0 && !this.video.paused) {
      this.startPlayback(this.video.currentTime);
    }
  }

  private handleVideoVolume(): void {
    // Only mirror video.volume changes from the slider, ignore video.muted
    if (this.video.volume !== this.userVolume && !this.video.muted) {
      this.userVolume = this.video.volume;
      this.updateGain();
    }
  }

  private handleVideoRate(): void {
    if (this.activeTrackIndex >= 0 && !this.video.paused) {
      // Re-sync with new playback rate
      this.startPlayback(this.video.currentTime);
    }
  }

  // ── Public Accessors ───────────────────────────────────────────────────────

  getDiscoveredTracks(): ContainerAudioTrack[] {
    return this.trackMetadata;
  }

  getActiveTrackIndex(): number {
    return this.activeTrackIndex;
  }

  isCustomEngineActive(): boolean {
    return this.activeTrackIndex >= 0;
  }

  destroy(): void {
    this.unbindVideoEvents();
    window.removeEventListener('click', this.boundUnlock, { capture: true });
    window.removeEventListener('keydown', this.boundUnlock, { capture: true });
    window.removeEventListener('pointerdown', this.boundUnlock, { capture: true });
    this.stopPlayback();
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch { /* ignore */ }
      this.audioCtx = null;
      this.gainNode = null;
    }
  }
}

