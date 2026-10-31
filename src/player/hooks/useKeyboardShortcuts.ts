/**
 * Keyboard shortcuts for the player.
 */

import { useEffect } from 'react';

interface Shortcuts {
  onPlayPause: () => void;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onNextEpisode?: () => void;
  onPrevEpisode?: () => void;
  onSpeedUp?: () => void;
  onSpeedDown?: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcuts, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in input fields
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          shortcuts.onPlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          shortcuts.onSeekBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          shortcuts.onSeekForward();
          break;
        case 'ArrowUp':
          e.preventDefault();
          shortcuts.onVolumeUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          shortcuts.onVolumeDown();
          break;
        case 'm':
          shortcuts.onToggleMute();
          break;
        case 'f':
          shortcuts.onToggleFullscreen();
          break;
        case 'n':
          shortcuts.onNextEpisode?.();
          break;
        case 'p':
          shortcuts.onPrevEpisode?.();
          break;
        case '>':
          shortcuts.onSpeedUp?.();
          break;
        case '<':
          shortcuts.onSpeedDown?.();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts, enabled]);
}

