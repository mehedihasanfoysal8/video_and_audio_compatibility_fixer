import React from 'react';
import { Download, Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { Season, Episode } from '../../types';

interface EpisodeListProps {
  seasons: Season[];
  currentSeason: number;
  currentEpisode: Episode | null;
  onSeasonChange: (season: number) => void;
  onEpisodeSelect: (episode: Episode) => void;
  onDownloadEpisode?: (episode: Episode) => void;
  autoplay: boolean;
  onAutoplayToggle: () => void;
}

const statusIcons: Record<string, React.ReactNode> = {
  playing: <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />,
  ended: <CheckCircle className="w-4 h-4 text-green-500" />,
  error: <AlertCircle className="w-4 h-4 text-red-500" />,
};

export const EpisodeList: React.FC<EpisodeListProps> = ({
  seasons,
  currentSeason,
  currentEpisode,
  onSeasonChange,
  onEpisodeSelect,
  onDownloadEpisode,
  autoplay,
  onAutoplayToggle,
}) => {
  const activeSeason = seasons.find((s) => s.number === currentSeason);

  return (
    <div className="flex flex-col h-full bg-dark-900 rounded-xl overflow-hidden">
      {/* Season tabs */}
      <div className="flex-shrink-0 border-b border-dark-700">
        <div className="flex items-center overflow-x-auto scrollbar-hide px-3 py-2 gap-1">
          {seasons.map((season) => (
            <button
              key={season.number}
              onClick={() => onSeasonChange(season.number)}
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                ${season.number === currentSeason
                  ? 'bg-brand-500 text-white'
                  : 'text-dark-300 hover:text-white hover:bg-dark-700'}
              `}
            >
              {season.label}
            </button>
          ))}
        </div>
      </div>

      {/* Autoplay toggle */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-dark-700">
        <span className="text-xs text-dark-400">
          {activeSeason?.episodes.length ?? 0} episodes
        </span>
        <button
          onClick={onAutoplayToggle}
          className={`flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors
            ${autoplay ? 'text-brand-400 bg-brand-500/10' : 'text-dark-400 hover:text-white'}`}
        >
          <div className={`w-7 h-4 rounded-full relative transition-colors
            ${autoplay ? 'bg-brand-500' : 'bg-dark-600'}`}>
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all
              ${autoplay ? 'left-3.5' : 'left-0.5'}`} />
          </div>
          Autoplay
        </button>
      </div>

      {/* Episode list */}
      <div className="flex-1 overflow-y-auto">
        {activeSeason?.episodes.map((episode, index) => {
          const isActive = currentEpisode?.id === episode.id;

          return (
            <div
              key={episode.id}
              className={`
                flex items-center gap-3 px-4 py-3 border-b border-dark-800/50 cursor-pointer
                transition-all duration-150 group
                ${isActive
                  ? 'bg-brand-500/10 border-l-2 border-l-brand-500'
                  : 'hover:bg-dark-800'}
              `}
              onClick={() => onEpisodeSelect(episode)}
            >
              {/* Episode number */}
              <div className={`
                flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                ${isActive ? 'bg-brand-500 text-white' : 'bg-dark-700 text-dark-300 group-hover:bg-dark-600'}
              `}>
                {statusIcons[episode.status] ?? index + 1}
              </div>

              {/* Episode info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate
                  ${isActive ? 'text-white' : 'text-dark-200 group-hover:text-white'}`}>
                  {episode.name}
                </p>
                <p className="text-xs text-dark-500 mt-0.5">
                  S{episode.season}E{episode.episode}
                </p>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-1.5 opacity-75 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadEpisode?.(episode);
                  }}
                  className="p-1.5 text-brand-400 hover:text-white hover:bg-brand-600/40 rounded transition-colors"
                  title="Download Episode directly"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onEpisodeSelect(episode); }}
                  className="p-1.5 text-dark-400 hover:text-brand-400 transition-colors rounded hover:bg-dark-600"
                  title="Play"
                >
                  <Play className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {!activeSeason?.episodes.length && (
          <div className="flex flex-col items-center justify-center h-32 text-dark-500 text-sm">
            No episodes found for this season.
          </div>
        )}
      </div>
    </div>
  );
};

