import React, { useRef, useCallback } from 'react';

interface SeekBarProps {
  currentTime: number;
  duration: number;
  buffered: number;
  onSeek: (time: number) => void;
}

export const SeekBar: React.FC<SeekBarProps> = ({
  currentTime,
  duration,
  buffered,
  onSeek,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (!track || duration === 0) return;
      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek]
  );

  const formatTime = (s: number): string => {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="w-full px-3 pb-1">
      {/* Time labels */}
      <div className="flex justify-between text-xs text-dark-300 mb-1">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-1.5 bg-dark-600 rounded-full cursor-pointer group hover:h-2.5 transition-all duration-150"
        onClick={handleClick}
      >
        {/* Buffered */}
        <div
          className="absolute left-0 top-0 h-full bg-dark-400 rounded-full"
          style={{ width: `${buffered}%` }}
        />
        {/* Progress */}
        <div
          className="absolute left-0 top-0 h-full bg-brand-500 rounded-full"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 7px)` }}
        />
      </div>
    </div>
  );
};

