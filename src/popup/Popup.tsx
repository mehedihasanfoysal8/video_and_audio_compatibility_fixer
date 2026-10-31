import React, { useState, useCallback } from 'react';
import { Play, Globe, Loader2, AlertCircle, ExternalLink, Tv } from 'lucide-react';
import type { ExtensionMessage, PlayerPayload, SeriesInfo } from '../types';

type Mode = 'direct' | 'series';

export const Popup: React.FC = () => {
  const [mode, setMode] = useState<Mode>('direct');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPlayer = useCallback(async (payload: PlayerPayload) => {
    const msg: ExtensionMessage = { type: 'OPEN_PLAYER', payload };
    await chrome.runtime.sendMessage(msg);
    window.close();
  }, []);

  const handleDirectPlay = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) { setError('Please enter a URL.'); return; }
    try {
      new URL(trimmed);
    } catch {
      setError('Invalid URL format.');
      return;
    }
    setError(null);
    openPlayer({ mode: 'direct', url: trimmed });
  }, [url, openPlayer]);

  const handleSeriesParse = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      // Use active tab
      setIsLoading(true);
      setError(null);
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab found.');

        // Inject and parse directly on active tab
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Import / parse logic executed in tab
            window.dispatchEvent(new CustomEvent('uvp:parse-page'));
            return true;
          },
        });

        // Also query via message
        const response = await chrome.tabs.sendMessage<ExtensionMessage, { type: string; data: SeriesInfo | null }>(
          tab.id,
          { type: 'PARSE_SERIES_PAGE', url: tab.url || '' }
        );

        if (response?.data && response.data.seasons.length > 0) {
          openPlayer({ mode: 'series', series: response.data });
        } else {
          setError('No series data found on this active tab. Make sure you are on the series/episode page.');
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // URL was provided
    try {
      new URL(trimmed);
    } catch {
      setError('Invalid URL format.');
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      // Fetch HTML and parse directly in extension context
      const resp = await fetch(trimmed);
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const { parseSeriesPage } = await import('../series-parser/SeriesParser');
      const seriesData = parseSeriesPage(doc, trimmed);

      if (seriesData && seriesData.seasons.length > 0) {
        openPlayer({ mode: 'series', series: seriesData });
      } else {
        // Fallback: open tab and let content script parse
        setError('Opening series page in new tab to parse structure…');
        const newTab = await chrome.tabs.create({ url: trimmed, active: true });
        setTimeout(async () => {
          if (newTab.id) {
            try {
              const r = await chrome.tabs.sendMessage<ExtensionMessage, { type: string; data: SeriesInfo | null }>(
                newTab.id,
                { type: 'PARSE_SERIES_PAGE', url: trimmed }
              );
              if (r?.data) openPlayer({ mode: 'series', series: r.data });
            } catch { /* ignore */ }
          }
        }, 2000);
      }
    } catch (err) {
      setError(`Failed to fetch series: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [url, openPlayer]);

  return (
    <div className="min-h-0 p-4 flex flex-col gap-4 bg-dark-950">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
          <Play className="w-4 h-4 fill-white text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">Universal Video Player</p>
          <p className="text-xs text-dark-400 mt-0.5">Audio Compatibility Fixer</p>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex bg-dark-800 rounded-lg p-0.5 gap-0.5">
        {(['direct', 'series'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all
              ${mode === m ? 'bg-dark-600 text-white' : 'text-dark-400 hover:text-white'}`}
          >
            {m === 'direct' ? <Globe className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
            {m === 'direct' ? 'Direct Video' : 'Series Page'}
          </button>
        ))}
      </div>

      {/* URL input */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-dark-400">
          {mode === 'direct'
            ? 'Video URL (MP4, WebM, M3U8…)'
            : 'Series page URL (or leave blank for current tab)'}
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (mode === 'direct' ? handleDirectPlay() : handleSeriesParse())}
          placeholder={mode === 'direct'
            ? 'https://example.com/video.mp4'
            : 'https://new.circleftp.net/content/…'}
          className="bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white
                     placeholder-dark-500 focus:outline-none focus:border-brand-500 transition-colors"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Actions */}
      {mode === 'direct' ? (
        <button
          onClick={handleDirectPlay}
          className="flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-600
                     text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Play className="w-4 h-4 fill-white" />
          Open in Player
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSeriesParse}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-600
                       disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Tv className="w-4 h-4" />
            )}
            {url ? 'Parse Series URL' : 'Parse Current Tab'}
          </button>
        </div>
      )}

      {/* Help text */}
      <div className="text-xs text-dark-500 space-y-1">
        {mode === 'direct' && (
          <p>Supports MP4, WebM, OGG, HLS (M3U8), and other direct video links.</p>
        )}
        {mode === 'series' && (
          <p>Opens the series page, extracts seasons & episodes dynamically, and launches the player.</p>
        )}
        <p className="text-dark-600">
          Keyboard shortcuts active in player: Space=Play/Pause, F=Fullscreen, M=Mute, N/P=Next/Prev.
        </p>
      </div>
    </div>
  );
};

