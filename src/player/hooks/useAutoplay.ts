import { useEffect, useRef } from 'react';
import type { Episode } from '../../types';

interface AutoplayOptions {
  enabled: boolean;
  onEpisodeEnd: (nextEpisode: Episode | null) => void;
  nextEpisode: Episode | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  countdownSeconds?: number;
}

/**
 * Auto-loads next episode when current one ends.
 * Shows a 5-second countdown before switching.
 */
export function useAutoplay({
  enabled,
  onEpisodeEnd,
  nextEpisode,
  videoRef,
  countdownSeconds = 5,
}: AutoplayOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnded = () => {
      if (!enabled || !nextEpisode) {
        onEpisodeEnd(null);
        return;
      }

      timerRef.current = setTimeout(() => {
        onEpisodeEnd(nextEpisode);
      }, countdownSeconds * 1000);
    };

    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('ended', onEnded);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, nextEpisode, onEpisodeEnd, videoRef, countdownSeconds]);

  // Cancel if autoplay toggled off mid-countdown
  useEffect(() => {
    if (!enabled && timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, [enabled]);
}

