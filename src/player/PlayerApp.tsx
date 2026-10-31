import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
} from 'react';
import { VideoPlayer } from './components/VideoPlayer';
import { PlayerControls } from './components/PlayerControls';
import { EpisodeList } from './components/EpisodeList';
import { SeriesHeader } from './components/SeriesHeader';
import { AudioDiagnostics } from './components/AudioDiagnostics';
import { Notifications } from './components/Notifications';
import { useVideoPlayer } from './hooks/useVideoPlayer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoplay } from './hooks/useAutoplay';
import { DiagnosticsEngine } from '../audio-diagnostics/DiagnosticsEngine';
import { UniversalAudioEngine } from '../media/UniversalAudioEngine';
import type {
  SeriesInfo,
  Episode,
  SeriesPlayerState,
  PlayerPayload,
  Notification,
  ContainerAudioTrack,
} from '../types';

// ── Load player payload from URL query string ──────────────────────────────────
function loadPayload(): PlayerPayload | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('payload');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw)) as PlayerPayload;
  } catch {
    return null;
  }
}

// ── PlayerApp ─────────────────────────────────────────────────────────────────
export const PlayerApp: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const { state, updateState, controls } = useVideoPlayer(videoRef as React.RefObject<HTMLVideoElement | null>);

  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [autoplay, setAutoplay] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [directUrl, setDirectUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');

  const diagnosticsEngineRef = useRef<DiagnosticsEngine | null>(null);
  const universalAudioEngineRef = useRef<UniversalAudioEngine | null>(null);
  const audioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup engines on unmount
  useEffect(() => {
    return () => {
      if (audioTimerRef.current) clearTimeout(audioTimerRef.current);
      diagnosticsEngineRef.current?.destroy();
      universalAudioEngineRef.current?.destroy();
    };
  }, []);

  // Notification helpers
  const notify = useCallback((
    type: Notification['type'],
    message: string,
    duration = 4000
  ) => {
    const id = `${Date.now()}-${Math.random()}`;
    setNotifications((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // ── Initialize from URL payload ────────────────────────────────────────────
  useEffect(() => {
    const payload = loadPayload();
    if (!payload) return;

    if (payload.mode === 'direct' && payload.url) {
      setUrlInput(payload.url);
      
      // If user passed a web page / series URL in direct mode, redirect to series handler
      const isSeriesPage = /\/content\//i.test(payload.url) || /\/series\//i.test(payload.url);
      if (isSeriesPage) {
        handleSeriesLoad(payload.url);
      } else {
        setDirectUrl(payload.url);
      }
    } else if (payload.mode === 'series' && payload.series) {
      setSeries(payload.series);
      if (payload.series.seasons[0]) {
        setCurrentSeason(payload.series.seasons[0].number);
      }
      if (payload.episode) {
        selectEpisode(payload.episode);
      } else if (payload.series.seasons[0]?.episodes[0]) {
        selectEpisode(payload.series.seasons[0].episodes[0]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load URL when active stream URL or videoEl changes ────────────────────
  const activeStreamUrl = currentEpisode?.playUrl || directUrl;

  useEffect(() => {
    if (activeStreamUrl && videoEl) {
      runDiagnosticsAndLoad(activeStreamUrl);
    }
  }, [activeStreamUrl, videoEl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video element ref callback ─────────────────────────────────────────────
  const onVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  }, []);

  // ── Episode selection ──────────────────────────────────────────────────────
  const selectEpisode = useCallback((episode: Episode) => {
    setCurrentEpisode(episode);
    setCurrentSeason(episode.season);

    // Update episode status in series
    setSeries((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        seasons: prev.seasons.map((s) => ({
          ...s,
          episodes: s.episodes.map((e) =>
            e.id === episode.id ? { ...e, status: 'loading' } : e
          ),
        })),
      };
    });

    runDiagnosticsAndLoad(episode.playUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Diagnostics + load pipeline ───────────────────────────────────────────
  const runDiagnosticsAndLoad = useCallback(async (url: string) => {
    updateState({ isLoading: true, error: null, diagnostics: null, url });

    const targetEl = videoEl || videoRef.current;
    if (!targetEl) return;

    // Cleanup previous engine
    diagnosticsEngineRef.current?.destroy();
    diagnosticsEngineRef.current = null;

    // Check if format is HLS (m3u8)
    const isHls = url.toLowerCase().includes('.m3u8');
    if (isHls) {
      import('../media/HLSAdapter').then(async ({ HLSAdapter }) => {
        try {
          const adapter = new HLSAdapter();
          await adapter.attach(targetEl, url);
          targetEl.play().catch(() => {});
          updateState({ isLoading: false, isPlaying: true, isPaused: false, playbackMethod: 'hls-js' });
        } catch (err) {
          console.warn('HLS.js load error:', err);
        }
      });
      return;
    }

    // Set video src directly and play unmuted
    // Append &ext=stream.m3u8 so IDM does NOT hijack the stream as an auto-download!
    const streamSafeUrl = url.includes('?')
      ? `${url}&ext=stream.m3u8`
      : `${url}?ext=stream.m3u8`;

    targetEl.muted = false;
    targetEl.volume = 1;
    targetEl.src = streamSafeUrl;
    targetEl.load();

    const playPromise = targetEl.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        updateState({ isLoading: false, isPlaying: true, isPaused: false });
      }).catch((err: unknown) => {
        console.warn('Autoplay error / waiting user action:', err);
        const errName = (err as Error)?.name || '';
        if (errName === 'NotAllowedError') {
          // Browser requires user click before playing unmuted audio
          targetEl.muted = true;
          targetEl.play().then(() => {
            notify('info', '🔊 Click anywhere on video to unmute (Browser policy).');
          }).catch(() => {});
        }
        updateState({ isLoading: false });
      });
    }

    // Safety timeout: never leave user stuck in infinite buffering spinner
    setTimeout(() => {
      updateState({ isLoading: false });
    }, 1200);

    // Clean up previous custom audio engine
    if (audioTimerRef.current) {
      clearTimeout(audioTimerRef.current);
      audioTimerRef.current = null;
    }
    universalAudioEngineRef.current?.destroy();
    universalAudioEngineRef.current = null;
    updateState({ containerAudioTracks: [], selectedAudioTrackIndex: -1 });

    // Inspect audio tracks safely after video buffering is established
    // Delay avoids overwhelming Circle FTP's 1-connection limit on initial load
    audioTimerRef.current = setTimeout(async () => {
      try {
        const uae = new UniversalAudioEngine(targetEl, {
          onTracksDiscovered: (tracks) => {
            updateState({ containerAudioTracks: tracks });
          },
        });
        universalAudioEngineRef.current = uae;
        const tracks = await uae.loadUrl(url);
        updateState({ containerAudioTracks: tracks });

        if (tracks.length > 0) {
          const firstTrack = tracks[0];
          const isDolbyOrMulti =
            firstTrack.codec.includes('ac3') ||
            firstTrack.codec.includes('eac3') ||
            firstTrack.codec.includes('dts') ||
            tracks.length > 1;

          if (isDolbyOrMulti) {
            console.log('[PlayerApp] Auto-activating Universal Audio Engine for:', firstTrack.name);
            await uae.selectTrack(0);
            updateState({ selectedAudioTrackIndex: 0, playbackMethod: 'universal-wasm' });
            notify('success', `🔊 Audio: ${firstTrack.name} (Decoded by Universal Engine)`, 4000);
          }
        }
      } catch (err) {
        console.warn('Background audio discovery:', err);
      }
    }, 1800);

    // Run diagnostics in background
    (async () => {
      try {
        const engine = new DiagnosticsEngine(targetEl);
        diagnosticsEngineRef.current = engine;
        const report = await engine.analyze(url);
        updateState({ diagnostics: report, playbackMethod: report.playbackMethod });
      } catch (err) {
        console.warn('Diagnostics background info:', err);
      }
    })();
  }, [videoEl, updateState, notify]);

  const handleSelectAudioTrack = useCallback(async (trackIndex: number) => {
    updateState({ selectedAudioTrackIndex: trackIndex });
    const targetEl = videoEl || videoRef.current;
    if (!targetEl) return;

    if (trackIndex === -1) {
      universalAudioEngineRef.current?.destroy();
      universalAudioEngineRef.current = null;
      targetEl.muted = false;
      notify('info', '🔊 Switched to Default Native Audio.');
      updateState({ playbackMethod: 'native-html5' });
      return;
    }

    try {
      if (!universalAudioEngineRef.current) {
        const engine = new UniversalAudioEngine(targetEl);
        universalAudioEngineRef.current = engine;
        await engine.loadUrl(state.url || '');
      }
      await universalAudioEngineRef.current.selectTrack(trackIndex);
      const track = state.containerAudioTracks[trackIndex];
      notify('info', `🔊 Audio: ${track?.name || `Track ${trackIndex + 1}`}`);
      updateState({ playbackMethod: 'universal-wasm' });
    } catch (err) {
      console.warn('Select audio track error:', err);
      targetEl.muted = false;
    }
  }, [updateState, state.url, state.containerAudioTracks, videoEl, notify]);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const getAdjacentEpisode = useCallback((direction: 1 | -1): Episode | null => {
    if (!series || !currentEpisode) return null;
    const allEpisodes = series.seasons.flatMap((s) => s.episodes);
    const idx = allEpisodes.findIndex((e) => e.id === currentEpisode.id);
    if (idx === -1) return null;
    return allEpisodes[idx + direction] ?? null;
  }, [series, currentEpisode]);

  const nextEpisode = getAdjacentEpisode(1);
  const prevEpisode = getAdjacentEpisode(-1);

  const goToNext = useCallback(() => {
    if (nextEpisode) selectEpisode(nextEpisode);
  }, [nextEpisode, selectEpisode]);

  const goToPrev = useCallback(() => {
    if (prevEpisode) selectEpisode(prevEpisode);
  }, [prevEpisode, selectEpisode]);

  // ── Autoplay ──────────────────────────────────────────────────────────────
  useAutoplay({
    enabled: autoplay,
    nextEpisode,
    videoRef: videoRef as React.RefObject<HTMLVideoElement | null>,
    onEpisodeEnd: (ep) => {
      if (ep) {
        notify('info', `Autoplaying: ${ep.name}`);
        selectEpisode(ep);
      }
    },
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts({
    onPlayPause: () => (state.isPlaying ? controls.pause() : controls.play()),
    onSeekBack: () => controls.seek(state.currentTime - 10),
    onSeekForward: () => controls.seek(state.currentTime + 10),
    onVolumeUp: () => controls.setVolume(Math.min(1, state.volume + 0.1)),
    onVolumeDown: () => controls.setVolume(Math.max(0, state.volume - 0.1)),
    onToggleMute: () => controls.toggleMute(),
    onToggleFullscreen: () => controls.toggleFullscreen(containerRef),
    onNextEpisode: goToNext,
    onPrevEpisode: goToPrev,
    onSpeedUp: () => controls.setPlaybackRate(Math.min(2, state.playbackRate + 0.25)),
    onSpeedDown: () => controls.setPlaybackRate(Math.max(0.25, state.playbackRate - 0.25)),
  });

  // ── Controls mouse-hide logic ─────────────────────────────────────────────
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (state.isPlaying) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, [state.isPlaying]);

  // ── Helper to load and parse a series page ──────────────────────────────
  const handleSeriesLoad = useCallback(async (targetUrl: string) => {
    notify('info', 'Series page detected. Fetching episodes…');
    updateState({ isLoading: true });

    try {
      // 1. Try to ask background or content script if page is open in tab
      let parsedData: SeriesInfo | null = null;
      try {
        const tabs = await chrome.tabs.query({ url: targetUrl });
        if (tabs.length > 0 && tabs[0].id) {
          const resp = await chrome.tabs.sendMessage<{ type: string; url: string }, { data: SeriesInfo | null }>(
            tabs[0].id,
            { type: 'PARSE_SERIES_PAGE', url: targetUrl }
          );
          if (resp?.data && resp.data.seasons.length > 0) {
            parsedData = resp.data;
          }
        }
      } catch {
        // Tab messaging failed, continue to direct fetch
      }

      // 2. Direct fetch fallback
      if (!parsedData) {
        const resp = await fetch(targetUrl);
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const { parseSeriesPage } = await import('../series-parser/SeriesParser');
        parsedData = parseSeriesPage(doc, targetUrl);
      }

      if (parsedData && parsedData.seasons.length > 0) {
        setSeries(parsedData);
        setCurrentSeason(parsedData.seasons[0].number);
        const firstEp = parsedData.seasons[0].episodes[0];
        if (firstEp) {
          selectEpisode(firstEp);
        }
        const isMovie = parsedData.seasons[0].label === 'Movie';
        if (isMovie) {
          notify('success', `🎬 Playing movie: ${parsedData.title}`);
        } else {
          notify('success', `Found ${parsedData.seasons.length} seasons! Playing Episode 1…`);
        }
        updateState({ isLoading: false });
        return;
      } else {
        notify('error', 'Could not parse episodes from this series page.');
        updateState({ isLoading: false, error: 'Could not extract episodes from series page.' });
      }
    } catch (err) {
      console.error('Series fetch failed:', err);
      notify('error', `Failed to load series page: ${err}`);
      updateState({ isLoading: false, error: `Failed to load series page: ${err}` });
    }
  }, [notify, updateState, selectEpisode]);

  // ── URL input handler ──────────────────────────────────────────────────────
  const handleUrlLoad = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) {
      notify('error', 'Please enter a valid URL.');
      return;
    }
    try {
      new URL(url);
    } catch {
      notify('error', 'Invalid URL format.');
      return;
    }

    // Check if it's a web series page or FTP content page
    const isSeriesPage = /\/content\//i.test(url) || /\/series\//i.test(url) || !/\.(mp4|webm|m3u8|mkv|mov|avi)(\?|$)/i.test(url);

    if (isSeriesPage) {
      await handleSeriesLoad(url);
      return;
    }

    // Otherwise load as direct video
    setDirectUrl(url);
    setSeries(null);
    setCurrentEpisode(null);
  }, [urlInput, notify, handleSeriesLoad]);

  // ── Smart VLC Stream launcher ──────────────────────────────────────────────
  const handleVlcStream = useCallback((streamUrl: string, _title?: string) => {
    if (!streamUrl) return;

    const safeUrl = streamUrl.replace(/ /g, '%20');

    // 1. Launch VLC directly via registered vlc:// protocol (No file download!)
    try {
      window.location.href = `vlc://${safeUrl}`;
    } catch {
      const a = document.createElement('a');
      a.href = `vlc://${safeUrl}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    // 2. Copy link to clipboard as a backup
    navigator.clipboard.writeText(safeUrl);
    notify('success', '⚡ Opening VLC Player directly! (Stream link also copied)', 5000);
  }, [notify]);

  // ── Native Chrome download trigger ─────────────────────────────────────────
  const handleDownload = useCallback((url: string, filename?: string) => {
    if (!url) {
      notify('error', 'No download URL available for this episode.');
      return;
    }
    const cleanName = filename || url.split('/').pop()?.split('?')[0] || 'video.mkv';
    notify('info', `📥 Starting download: ${cleanName}...`);

    const triggerFallbackDownload = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = cleanName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('success', `📥 Download started: ${cleanName}`);
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { type: 'DOWNLOAD_FILE', payload: { url, filename: cleanName } },
        (res) => {
          if (chrome.runtime.lastError || !res?.success) {
            console.warn('Background download error, falling back:', chrome.runtime.lastError?.message || res?.error);
            if (chrome.downloads?.download) {
              chrome.downloads.download({ url, filename: cleanName, saveAs: false }, (id) => {
                if (chrome.runtime.lastError || !id) {
                  triggerFallbackDownload();
                } else {
                  notify('success', `📥 Download started: ${cleanName}`);
                }
              });
            } else {
              triggerFallbackDownload();
            }
          } else {
            notify('success', `📥 Download started via Chrome Manager: ${cleanName}`);
          }
        }
      );
    } else {
      triggerFallbackDownload();
    }
  }, [notify]);

  return (
    <div className="min-h-screen bg-dark-950 text-white flex flex-col">
      <Notifications notifications={notifications} onDismiss={dismissNotification} />

      {/* Top bar with URL input */}
      <div className="flex-shrink-0 bg-dark-900 border-b border-dark-700 px-4 py-2">
        <div className="max-w-screen-xl mx-auto flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-brand-500 font-bold text-lg">▶</span>
              <span className="text-white font-semibold hidden sm:block">Universal Player</span>
            </div>
            <div className="flex-1 flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlLoad()}
                placeholder="Paste video URL or series page URL…"
                className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500 transition-colors"
              />
              <button
                onClick={handleUrlLoad}
                className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Load
              </button>
            </div>
          </div>
          {(currentEpisode?.playUrl || state.url) && (
            <div className="text-xs text-dark-400 flex items-center justify-between gap-2 overflow-hidden pt-1">
              <div className="flex items-center gap-2 overflow-hidden truncate">
                <span className="text-brand-400 font-medium shrink-0">Stream URL:</span>
                <span className="text-dark-300 truncate font-mono text-[11px]">
                  {currentEpisode?.playUrl || state.url}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const dlUrl = currentEpisode?.downloadUrl || currentEpisode?.playUrl || state.url || '';
                    const name = currentEpisode?.name ? `${currentEpisode.name}.mkv` : undefined;
                    handleDownload(dlUrl, name);
                  }}
                  className="px-2.5 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow"
                  title="Direct Download using Browser Download Manager"
                >
                  <span>📥</span> Download File
                </button>
                <button
                  onClick={() => {
                    const streamUrl = currentEpisode?.playUrl || state.url || '';
                    const title = currentEpisode?.name || series?.title || 'stream';
                    handleVlcStream(streamUrl, title);
                  }}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow"
                  title="Stream directly in VLC without downloading video file"
                >
                  <span>⚡</span> Stream in VLC
                </button>
                <button
                  onClick={() => {
                    const streamUrl = currentEpisode?.playUrl || state.url || '';
                    navigator.clipboard.writeText(streamUrl);
                    notify('success', '📋 Stream link copied! In VLC: press Ctrl+N and Enter to stream instantly with full Dolby/Dual Audio!');
                  }}
                  className="px-2.5 py-1 bg-dark-700 hover:bg-dark-600 text-dark-200 hover:text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                  title="Copy link for VLC (Ctrl+N)"
                >
                  📋 Copy Link
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden max-w-screen-xl mx-auto w-full">
        {/* Left: Series panel (when series is loaded and has multiple episodes) */}
        {series && !(series.seasons.length === 1 && series.seasons[0].label === 'Movie') && (
          <div className="flex-shrink-0 w-72 flex flex-col border-r border-dark-700 overflow-hidden">
            <SeriesHeader series={series} currentEpisode={currentEpisode} />
            <div className="flex-1 overflow-hidden">
              <EpisodeList
                seasons={series.seasons}
                currentSeason={currentSeason}
                currentEpisode={currentEpisode}
                onSeasonChange={setCurrentSeason}
                onEpisodeSelect={selectEpisode}
                onDownloadEpisode={(ep) =>
                  handleDownload(ep.downloadUrl || ep.playUrl, `${ep.name}.mkv`)
                }
                autoplay={autoplay}
                onAutoplayToggle={() => setAutoplay((a) => !a)}
              />
            </div>
          </div>
        )}

        {/* Center: Player */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Video container */}
          <div
            ref={containerRef}
            className="relative flex-1 bg-black"
            onMouseMove={showControls}
            onMouseLeave={() => state.isPlaying && setControlsVisible(false)}
          >
            <VideoPlayer
              url={state.url}
              onVideoRef={onVideoRef}
              isLoading={state.isLoading}
              error={state.error}
              onOverlayClick={() => {
                universalAudioEngineRef.current?.resumeContext();
                state.isPlaying ? controls.pause() : controls.play();
              }}
              onDoubleClick={() => controls.toggleFullscreen(containerRef)}
            />

            <PlayerControls
              state={state}
              containerRef={containerRef as React.RefObject<HTMLDivElement | null>}
              onPlay={() => {
                universalAudioEngineRef.current?.resumeContext();
                controls.play();
              }}
              onPause={controls.pause}
              onSeek={controls.seek}
              onVolumeChange={(vol) => {
                controls.setVolume(vol);
                universalAudioEngineRef.current?.setVolume(vol);
              }}
              onToggleMute={() => {
                const nextMuted = !state.muted;
                controls.toggleMute();
                universalAudioEngineRef.current?.setMuted(nextMuted);
              }}
              onPlaybackRateChange={controls.setPlaybackRate}
              onToggleFullscreen={() => controls.toggleFullscreen(containerRef)}
              onTogglePiP={controls.togglePiP}
              onSelectAudioTrack={handleSelectAudioTrack}
              onPrevEpisode={prevEpisode ? goToPrev : undefined}
              onNextEpisode={nextEpisode ? goToNext : undefined}
              hasPrev={!!prevEpisode}
              hasNext={!!nextEpisode}
              visible={controlsVisible || !state.isPlaying}
            />
          </div>

          {/* Below player: Diagnostics */}
          <div className="flex-shrink-0 p-3 border-t border-dark-700 bg-dark-950">
            <AudioDiagnostics
              report={state.diagnostics}
              isRunning={diagnosticsRunning}
              isOpen={showDiagnostics}
              onToggle={() => setShowDiagnostics((s) => !s)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

