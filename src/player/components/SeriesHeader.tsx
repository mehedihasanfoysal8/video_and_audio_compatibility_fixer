import React from 'react';
import type { SeriesInfo, Episode } from '../../types';

interface SeriesHeaderProps {
  series: SeriesInfo;
  currentEpisode: Episode | null;
}

export const SeriesHeader: React.FC<SeriesHeaderProps> = ({ series, currentEpisode }) => {
  return (
    <div className="flex items-start gap-4 px-4 py-3 bg-dark-900/80 border-b border-dark-700">
      {/* Poster placeholder */}
      <div className="flex-shrink-0 w-14 h-20 bg-dark-700 rounded-lg flex items-center justify-center overflow-hidden">
        {series.posterUrl ? (
          <img src={series.posterUrl} alt={series.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-dark-500 text-xl">🎬</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold text-white truncate">{series.title}</h1>
        {currentEpisode && (
          <p className="text-sm text-brand-400 mt-0.5 truncate">
            S{currentEpisode.season}E{currentEpisode.episode} — {currentEpisode.name}
          </p>
        )}
        <p className="text-xs text-dark-400 mt-1">
          {series.seasons.length} season{series.seasons.length !== 1 ? 's' : ''} ·{' '}
          {series.seasons.reduce((sum, s) => sum + s.episodes.length, 0)} episodes
        </p>
      </div>
    </div>
  );
};

