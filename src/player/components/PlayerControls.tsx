import React, { useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize,
  Minimize,
  PictureInPicture,
  Gauge,
  Headphones,
  Check,
} from 'lucide-react';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeControl';
import type { PlayerState } from '../../types';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface PlayerControlsProps {
  state: PlayerState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleFullscreen: () => void;
  onTogglePiP: () => void;
  onSelectAudioTrack?: (trackIndex: number) => void;
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  visible?: boolean;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  state,
  onPlay,
  onPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onPlaybackRateChange,
  onToggleFullscreen,
  onTogglePiP,
  onSelectAudioTrack,
  onPrevEpisode,
  onNextEpisode,
  hasPrev,
  hasNext,
  visible = true,
}) => {
  const [showSpeedMenu, setShowSpeedMenu] = React.useState(false);
  const [showAudioMenu, setShowAudioMenu] = React.useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const audioMenuRef = useRef<HTMLDivElement>(null);

  const tracks = state.containerAudioTracks || [];
  const activeTrack = state.selectedAudioTrackIndex;

  return (
    <div
      className={`
        absolute bottom-0 left-0 right-0 z-20
        bg-gradient-to-t from-black/90 via-black/50 to-transparent
        transition-opacity duration-300 pt-8
        ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}
    >
      {/* Seek bar */}
      <SeekBar
        currentTime={state.currentTime}
        duration={state.duration}
        buffered={state.buffered}
        onSeek={onSeek}
      />

      {/* Controls row */}
      <div className="flex items-center justify-between px-4 pb-3">
        {/* Left controls */}
        <div className="flex items-center gap-2">
          {/* Prev episode */}
          <button
            onClick={onPrevEpisode}
            disabled={!hasPrev}
            className="p-1.5 text-dark-300 hover:text-white disabled:opacity-30 transition-colors"
            title="Previous Episode (P)"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={state.isPlaying ? onPause : onPlay}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title={state.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {state.isPlaying ? (
              <Pause className="w-6 h-6 fill-white" />
            ) : (
              <Play className="w-6 h-6 fill-white" />
            )}
          </button>

          {/* Next episode */}
          <button
            onClick={onNextEpisode}
            disabled={!hasNext}
            className="p-1.5 text-dark-300 hover:text-white disabled:opacity-30 transition-colors"
            title="Next Episode (N)"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Volume */}
          <VolumeControl
            volume={state.volume}
            muted={state.muted}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Audio Track Selector */}
          {tracks.length > 0 && (
            <div className="relative" ref={audioMenuRef}>
              <button
                onClick={() => {
                  setShowAudioMenu((s) => !s);
                  setShowSpeedMenu(false);
                }}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded transition-colors font-medium ${
                  activeTrack >= 0
                    ? 'bg-brand-500/20 text-brand-400 border border-brand-500/40'
                    : 'text-dark-300 hover:text-white hover:bg-white/10'
                }`}
                title="Select Audio Track (Dolby / AAC / Dual Audio)"
              >
                <Headphones className="w-4 h-4" />
                <span>
                  {activeTrack === -1
                    ? 'Audio (Native)'
                    : `Audio: ${tracks[activeTrack]?.language?.toUpperCase() || `Track ${activeTrack + 1}`}`}
                </span>
              </button>

              {showAudioMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-dark-800 border border-dark-600 rounded-lg shadow-2xl py-1.5 min-w-[240px] z-30 animate-fade-in divide-y divide-dark-700/60">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-dark-400 uppercase tracking-wider">
                    Audio Tracks Detected ({tracks.length})
                  </div>

                  <div className="py-1">
                    {/* Native Audio option */}
                    <button
                      onClick={() => {
                        onSelectAudioTrack?.(-1);
                        setShowAudioMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-xs flex items-center justify-between text-left hover:bg-dark-700 transition-colors ${
                        activeTrack === -1 ? 'text-brand-400 font-medium bg-dark-700/50' : 'text-dark-200'
                      }`}
                    >
                      <span>Default Browser Output (Native)</span>
                      {activeTrack === -1 && <Check className="w-4 h-4 text-brand-400" />}
                    </button>

                    {/* Detected Container Tracks */}
                    {tracks.map((track) => {
                      const isSelected = activeTrack === track.index;
                      return (
                        <button
                          key={track.index}
                          onClick={() => {
                            onSelectAudioTrack?.(track.index);
                            setShowAudioMenu(false);
                          }}
                          className={`w-full px-3 py-2 text-xs flex items-center justify-between text-left hover:bg-dark-700 transition-colors ${
                            isSelected ? 'text-brand-400 font-medium bg-dark-700/50' : 'text-dark-200'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold">{track.name}</span>
                            <span className="text-[10px] text-dark-400">
                              Codec: {track.codec.toUpperCase()} • {track.channels}ch • {track.sampleRate}Hz
                            </span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-brand-400 shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Playback speed */}
          <div className="relative" ref={speedMenuRef}>
            <button
              onClick={() => {
                setShowSpeedMenu((s) => !s);
                setShowAudioMenu(false);
              }}
              className="flex items-center gap-1 text-sm text-dark-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
              title="Playback Speed"
            >
              <Gauge className="w-4 h-4" />
              <span>{state.playbackRate === 1 ? 'Speed' : `${state.playbackRate}×`}</span>
            </button>

            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-dark-800 border border-dark-600 rounded-lg shadow-xl py-1 min-w-[80px] z-30 animate-fade-in">
                {SPEED_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => { onPlaybackRateChange(rate); setShowSpeedMenu(false); }}
                    className={`w-full px-4 py-1.5 text-sm text-left hover:bg-dark-700 transition-colors
                      ${state.playbackRate === rate ? 'text-brand-400' : 'text-dark-300'}`}
                  >
                    {rate}×
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PiP */}
          {document.pictureInPictureEnabled && (
            <button
              onClick={onTogglePiP}
              className={`p-1.5 transition-colors ${state.isPiP ? 'text-brand-400' : 'text-dark-300 hover:text-white'}`}
              title="Picture in Picture"
            >
              <PictureInPicture className="w-5 h-5" />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 text-dark-300 hover:text-white transition-colors"
            title={state.isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
          >
            {state.isFullscreen ? (
              <Minimize className="w-5 h-5" />
            ) : (
              <Maximize className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

