// ============================================================
// Shared types across the entire extension
// ============================================================

export interface Episode {
  id: string;
  name: string;
  playUrl: string;
  downloadUrl?: string;
  season: number;
  episode: number;
  duration?: number;
  status: EpisodeStatus;
}

export type EpisodeStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface Season {
  number: number;
  label: string;
  episodes: Episode[];
}

export interface SeriesInfo {
  title: string;
  url: string;
  seasons: Season[];
  posterUrl?: string;
}

export type UrlType = 'direct-video' | 'series-page' | 'unknown';

export type VideoFormat = 'mp4' | 'webm' | 'ogg' | 'hls' | 'dash' | 'mov' | 'mkv' | 'avi' | 'unknown';

export interface MediaInfo {
  url: string;
  format: VideoFormat;
  mimeType: string;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  isHLS: boolean;
  isDASH: boolean;
}

export interface CodecSupportResult {
  videoCodec: string;
  audioCodec: string;
  videoSupported: boolean | null;
  audioSupported: boolean | null;
  smooth?: boolean;
  powerEfficient?: boolean;
  raw?: unknown; // MediaDecodingInfo from browser API
}

export type AudioTrackStatus =
  | 'present-active'
  | 'present-disabled'
  | 'missing'
  | 'unknown'
  | 'error';

export interface ContainerAudioTrack {
  index: number;
  id: number | string;
  name: string;
  language: string;
  codec: string;
  channels: number;
  sampleRate: number;
  isDefault?: boolean;
}

export interface AudioDiagnosticReport {
  url: string;
  timestamp: number;
  mediaInfo: MediaInfo;
  codecSupport: CodecSupportResult | null;
  audioTrackStatus: AudioTrackStatus;
  audioTrackCount: number;
  containerTracks?: ContainerAudioTrack[];
  webAudioSignalDetected: boolean | null;
  playbackMethod: PlaybackMethod;
  recoveryAttempted: PlaybackMethod[];
  recoverySuccess: boolean | null;
  errors: string[];
  warnings: string[];
  recommendation: string;
}

export type PlaybackMethod =
  | 'native-html5'
  | 'hls-js'
  | 'mse-manual'
  | 'ffmpeg-wasm'
  | 'universal-wasm'
  | 'none';

export interface PlayerState {
  url: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  buffered: number;
  isFullscreen: boolean;
  isPiP: boolean;
  isLoading: boolean;
  error: string | null;
  playbackMethod: PlaybackMethod;
  diagnostics: AudioDiagnosticReport | null;
  containerAudioTracks: ContainerAudioTrack[];
  selectedAudioTrackIndex: number; // -1 for native, >= 0 for custom decoded track
}

export interface SeriesPlayerState extends PlayerState {
  series: SeriesInfo | null;
  currentSeason: number;
  currentEpisode: Episode | null;
  autoplay: boolean;
  showDiagnostics: boolean;
}

// Messages between popup/content/background
export type ExtensionMessage =
  | { type: 'PARSE_SERIES_PAGE'; url: string }
  | { type: 'SERIES_DATA'; data: SeriesInfo }
  | { type: 'OPEN_PLAYER'; payload: PlayerPayload }
  | { type: 'PAGE_PARSED'; data: SeriesInfo | null }
  | { type: 'DOWNLOAD_FILE'; payload: { url: string; filename?: string } }
  | { type: 'ERROR'; message: string };

export interface PlayerPayload {
  mode: 'direct' | 'series';
  url?: string;
  series?: SeriesInfo;
  episode?: Episode;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}
