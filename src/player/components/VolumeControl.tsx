import React from 'react';
import { Volume2, VolumeX, Volume1 } from 'lucide-react';

interface VolumeControlProps {
  volume: number;
  muted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
}

export const VolumeControl: React.FC<VolumeControlProps> = ({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}) => {
  const displayVolume = muted ? 0 : volume;

  const Icon = muted || volume === 0
    ? VolumeX
    : volume < 0.5
    ? Volume1
    : Volume2;

  return (
    <div className="flex items-center gap-2 group">
      <button
        onClick={onToggleMute}
        className="text-dark-300 hover:text-white transition-colors p-1"
        title={muted ? 'Unmute (M)' : 'Mute (M)'}
      >
        <Icon className="w-5 h-5" />
      </button>

      <div className="w-0 overflow-hidden group-hover:w-20 transition-all duration-200">
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={displayVolume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-20 h-1 accent-brand-500 cursor-pointer"
        />
      </div>
    </div>
  );
};

