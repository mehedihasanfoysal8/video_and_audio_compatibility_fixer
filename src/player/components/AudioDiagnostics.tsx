import React from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { AudioDiagnosticReport, AudioTrackStatus } from '../../types';

interface AudioDiagnosticsProps {
  report: AudioDiagnosticReport | null;
  isRunning: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

const StatusIcon: React.FC<{ ok: boolean | null; size?: number }> = ({ ok, size = 4 }) => {
  const cls = `w-${size} h-${size}`;
  if (ok === true) return <CheckCircle className={`${cls} text-green-500`} />;
  if (ok === false) return <XCircle className={`${cls} text-red-500`} />;
  return <HelpCircle className={`${cls} text-dark-400`} />;
};

function audioTrackStatusLabel(status: AudioTrackStatus): [string, React.ReactNode] {
  switch (status) {
    case 'present-active': return ['Active', <CheckCircle className="w-4 h-4 text-green-500" />];
    case 'present-disabled': return ['Present but disabled', <AlertTriangle className="w-4 h-4 text-yellow-500" />];
    case 'missing': return ['Not found', <XCircle className="w-4 h-4 text-red-500" />];
    default: return ['Unknown', <HelpCircle className="w-4 h-4 text-dark-400" />];
  }
}

function playbackMethodLabel(method: string): string {
  switch (method) {
    case 'native-html5': return 'Native HTML5';
    case 'hls-js': return 'HLS.js (remuxed)';
    case 'universal-wasm': return 'Universal Audio Engine (WASM + Web Audio)';
    case 'mse-manual': return 'MSE Manual';
    case 'ffmpeg-wasm': return 'FFmpeg Transcoding';
    default: return 'None';
  }
}

export const AudioDiagnostics: React.FC<AudioDiagnosticsProps> = ({
  report,
  isRunning,
  isOpen,
  onToggle,
}) => {
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 rounded-lg text-sm text-dark-300 hover:text-white transition-colors border border-dark-700"
      >
        <Activity className="w-4 h-4 text-brand-500" />
        <span>Audio Diagnostics</span>
        <ChevronDown className="w-4 h-4" />
      </button>
    );
  }

  const [trackLabel, trackIcon] = audioTrackStatusLabel(report?.audioTrackStatus ?? 'unknown');

  return (
    <div className="bg-dark-900 rounded-xl border border-dark-700 overflow-hidden animate-slide-up">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-500" />
          <span className="text-sm font-semibold text-white">Audio Diagnostics</span>
          {isRunning && (
            <span className="text-xs text-brand-400 animate-pulse-soft">Analyzing…</span>
          )}
        </div>
        <ChevronUp className="w-4 h-4 text-dark-400" />
      </button>

      {report && (
        <div className="px-4 pb-4 space-y-3">
          {/* Grid of stats */}
          <div className="grid grid-cols-2 gap-2">
            <DiagRow label="Video Codec" value={report.mediaInfo.videoCodec ?? '—'} />
            <DiagRow label="Audio Codec" value={report.mediaInfo.audioCodec ?? '—'} />
            <DiagRow label="Container" value={report.mediaInfo.format} />
            <DiagRow label="Playback Method" value={playbackMethodLabel(report.playbackMethod)} />
          </div>

          {/* Audio track */}
          <div className="flex items-center justify-between bg-dark-800 rounded-lg px-3 py-2">
            <span className="text-xs text-dark-400">Browser Audio Track</span>
            <div className="flex items-center gap-1.5">
              {trackIcon}
              <span className="text-xs text-dark-200">{trackLabel} ({report.audioTrackCount})</span>
            </div>
          </div>

          {/* Container Audio Tracks */}
          {report.containerTracks && report.containerTracks.length > 0 && (
            <div className="bg-dark-800 rounded-lg px-3 py-2 space-y-1.5">
              <p className="text-xs text-brand-400 font-semibold mb-1">
                Detected File Audio Tracks ({report.containerTracks.length})
              </p>
              {report.containerTracks.map((t) => (
                <div key={t.index} className="flex items-center justify-between text-xs py-0.5 border-b border-dark-700/50 last:border-0">
                  <span className="text-dark-200 font-medium">
                    {t.name}
                  </span>
                  <span className="text-[11px] text-dark-400 font-mono">
                    {t.codec.toUpperCase()} • {t.channels}ch
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Codec support */}
          {report.codecSupport && (
            <div className="bg-dark-800 rounded-lg px-3 py-2 space-y-1.5">
              <p className="text-xs text-dark-400 mb-1">Browser Codec Support</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-dark-300">Video ({report.codecSupport.videoCodec})</span>
                <StatusIcon ok={report.codecSupport.videoSupported} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-dark-300">Audio ({report.codecSupport.audioCodec})</span>
                <StatusIcon ok={report.codecSupport.audioSupported} />
              </div>
              {report.codecSupport.smooth !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-300">Smooth Playback</span>
                  <StatusIcon ok={report.codecSupport.smooth} />
                </div>
              )}
            </div>
          )}

          {/* Web Audio signal */}
          <div className="flex items-center justify-between bg-dark-800 rounded-lg px-3 py-2">
            <span className="text-xs text-dark-400">Web Audio Signal</span>
            <StatusIcon ok={report.webAudioSignalDetected} />
          </div>

          {/* Recovery status */}
          <div className="flex items-center justify-between bg-dark-800 rounded-lg px-3 py-2">
            <span className="text-xs text-dark-400">Recovery</span>
            <div className="flex items-center gap-1.5">
              <StatusIcon ok={report.recoverySuccess} />
              <span className="text-xs text-dark-300">
                {report.recoveryAttempted.join(' → ')}
              </span>
            </div>
          </div>

          {/* Errors */}
          {report.errors.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              <p className="text-xs text-red-400 font-semibold mb-1">Errors</p>
              {report.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-300">• {e}</p>
              ))}
            </div>
          )}

          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-3 py-2">
              <p className="text-xs text-yellow-400 font-semibold mb-1">Warnings</p>
              {report.warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-300">• {w}</p>
              ))}
            </div>
          )}

          {/* Recommendation */}
          <div className="bg-accent-600/10 border border-accent-600/30 rounded-lg px-3 py-2">
            <p className="text-xs text-accent-400 font-semibold mb-1">Recommendation</p>
            <p className="text-xs text-dark-200 leading-relaxed">{report.recommendation}</p>
          </div>
        </div>
      )}

      {!report && !isRunning && (
        <p className="px-4 pb-4 text-xs text-dark-500 text-center">
          Load a video to run diagnostics.
        </p>
      )}
    </div>
  );
};

const DiagRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-dark-800 rounded-lg px-3 py-2">
    <p className="text-xs text-dark-500 mb-0.5">{label}</p>
    <p className="text-xs text-dark-200 font-mono truncate">{value}</p>
  </div>
);

