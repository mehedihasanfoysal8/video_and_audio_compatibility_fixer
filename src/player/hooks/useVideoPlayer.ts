/**
 * useVideoPlayer hook
 *
 * Manages all HTMLVideoElement state and exposes a clean API to the player UI.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { PlayerState, PlaybackMethod } from '../../types';

const DEFAULT_STATE: Omit<PlayerState, 'url' | 'diagnostics'> = {
  isPlaying: false,
  isPaused: true,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  playbackRate: 1,
  buffered: 0,
  isFullscreen: false,
  isPiP: false,
  isLoading: false,
  error: null,
  playbackMethod: 'none' as PlaybackMethod,
  containerAudioTracks: [],
  selectedAudioTrackIndex: -1,
};

export function useVideoPlayer(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<PlayerState>({
    ...DEFAULT_STATE,
    url: null,
    diagnostics: null,
  });

  const updateState = useCallback((partial: Partial<PlayerState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Bind video events ──────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => updateState({ isPlaying: true, isPaused: false, error: null, isLoading: false });
    const onPause = () => updateState({ isPlaying: false, isPaused: true });
    const onEnded = () => updateState({ isPlaying: false, isPaused: true, isLoading: false });
    const onWaiting = () => {
      // Don't show persistent blocking spinner on waiting
      console.log('Video buffering/waiting...');
    };
    const onPlaying = () => updateState({ isLoading: false, isPlaying: true, isPaused: false });
    const onLoadedData = () => updateState({ isLoading: false });
    const onCanPlay = () => updateState({ isLoading: false });
    const onError = () => {
      const err = video.error;
      const msg = err ? (err.message || mediaErrorText(err.code)) : '';
      console.warn('Video error occurred:', err?.code, msg);

      // If it's a transient read/network interruption from the server, auto-recover
      if (msg.includes('PIPELINE_ERROR_READ') || msg.includes('data source error') || err?.code === 2) {
        console.log('Attempting automatic stream reconnection...');
        setTimeout(() => {
          if (video && video.src) {
            video.load();
            video.play().catch(() => {});
          }
        }, 600);
        return;
      }

      updateState({
        isLoading: false,
        error: err
          ? `Playback error (code ${err.code}): ${msg}`
          : 'Unknown playback error',
      });
    };
    const onTimeUpdate = () =>
      updateState({ currentTime: video.currentTime });
    const onDurationChange = () =>
      updateState({ duration: video.duration || 0 });
    const onVolumeChange = () =>
      updateState({ volume: video.volume, muted: video.muted });
    const onProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        updateState({
          buffered: (video.buffered.end(video.buffered.length - 1) / video.duration) * 100,
        });
      }
    };
    const onRateChange = () => updateState({ playbackRate: video.playbackRate });

    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('progress', onProgress);
    video.addEventListener('ratechange', onRateChange);

    // Fullscreen events
    const onFSChange = () =>
      updateState({ isFullscreen: !!document.fullscreenElement });
    document.addEventListener('fullscreenchange', onFSChange);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('ratechange', onRateChange);
      document.removeEventListener('fullscreenchange', onFSChange);
    };
  }, [videoRef, updateState]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const play = useCallback(async () => {
    try {
      await videoRef.current?.play();
      updateState({ error: null });
    } catch (err: unknown) {
      const errorMsg = String(err);
      // Ignore normal play interruptions (abort error)
      if (!errorMsg.includes('AbortError')) {
        updateState({ error: `Play failed: ${errorMsg}` });
      }
    }
  }, [videoRef, updateState]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video && isFinite(time)) {
      video.currentTime = Math.max(0, Math.min(time, video.duration || 0));
    }
  }, [videoRef]);

  const setVolume = useCallback((vol: number) => {
    const video = videoRef.current;
    if (video) {
      video.volume = Math.max(0, Math.min(1, vol));
      video.muted = false;
    }
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, [videoRef]);

  const setPlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  }, [videoRef]);

  const toggleFullscreen = useCallback(async (containerRef: React.RefObject<HTMLElement | null>) => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      await container.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        updateState({ isPiP: false });
      } else {
        await video.requestPictureInPicture();
        updateState({ isPiP: true });
      }
    } catch (err) {
      updateState({ error: `PiP failed: ${err}` });
    }
  }, [videoRef, updateState]);

  const loadUrl = useCallback((url: string) => {
    const video = videoRef.current;
    if (!video) return;
    updateState({ url, isLoading: true, error: null, currentTime: 0, duration: 0, buffered: 0 });
    video.src = url;
    video.load();
  }, [videoRef, updateState]);

  return {
    state,
    updateState,
    controls: { play, pause, seek, setVolume, toggleMute, setPlaybackRate, toggleFullscreen, togglePiP, loadUrl },
  };
}

function mediaErrorText(code: number): string {
  switch (code) {
    case 1: return 'Fetching process aborted';
    case 2: return 'Network error';
    case 3: return 'Decoding error — possibly unsupported codec';
    case 4: return 'Media format not supported';
    default: return 'Unknown error';
  }
}

