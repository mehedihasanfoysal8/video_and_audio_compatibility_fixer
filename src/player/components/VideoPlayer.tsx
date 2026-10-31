import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';

interface VideoPlayerProps {
  url: string | null;
  onVideoRef: (ref: HTMLVideoElement | null) => void;
  isLoading: boolean;
  error: string | null;
  onDoubleClick?: () => void;
  onOverlayClick?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  url,
  onVideoRef,
  isLoading,
  error,
  onDoubleClick,
  onOverlayClick,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showClickIndicator, setShowClickIndicator] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.setAttribute('referrerpolicy', 'no-referrer');
    }
    onVideoRef(videoRef.current);
  }, [onVideoRef]);

  const handleOverlayClick = useCallback(() => {
    if (videoRef.current && videoRef.current.muted) {
      videoRef.current.muted = false;
    }
    setShowClickIndicator(true);
    setTimeout(() => setShowClickIndicator(false), 300);
    onOverlayClick?.();
  }, [onOverlayClick]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      {/* The actual video element */}
      <video
        ref={videoRef}
        src={url ? (url.includes('?') ? `${url}&ext=stream.m3u8` : `${url}?ext=stream.m3u8`) : undefined}
        className="w-full h-full object-contain"
        playsInline
        controls={false}
        preload="auto"
      />

      {/* Click overlay for play/pause */}
      <div
        className="absolute inset-0 cursor-pointer z-10"
        onClick={handleOverlayClick}
        onDoubleClick={onDoubleClick}
      />

      {/* Loading spinner - only shown briefly, never blocks user */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none z-20">
          <Loader2 className="w-12 h-12 text-brand-500 animate-spin mb-2" />
          <span className="text-xs text-dark-300 font-medium">Loading stream…</span>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 z-30 pointer-events-auto">
          <div className="bg-red-950/90 rounded-xl p-6 max-w-lg text-center border border-red-700/60 shadow-2xl">
            <p className="text-red-400 font-bold text-lg mb-2">Playback Issue</p>
            <p className="text-red-300 text-sm mb-4 leading-relaxed">
              {error}
            </p>
            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.load();
                  videoRef.current.play().catch(() => {});
                }
              }}
              className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg cursor-pointer"
            >
              🔄 Retry Playback
            </button>
          </div>
        </div>
      )}

      {/* No URL state */}
      {!url && !isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-4">
              <Play className="w-10 h-10 text-dark-400" />
            </div>
            <p className="text-dark-400 text-lg">No video loaded</p>
            <p className="text-dark-500 text-sm mt-1">
              Paste a video URL or select an episode to begin
            </p>
          </div>
        </div>
      )}

      {/* Click ripple */}
      {showClickIndicator && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-white/20 animate-ping" />
        </div>
      )}
    </div>
  );
};

