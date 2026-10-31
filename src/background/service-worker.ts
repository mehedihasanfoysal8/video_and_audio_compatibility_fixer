/**
 * Background Service Worker (MV3)
 *
 * Responsibilities:
 * - Route messages between popup, content scripts and player page
 * - Open the player page with serialized state
 * - Handle tab messaging
 */

import type { ExtensionMessage, PlayerPayload } from '../types';

const PLAYER_PAGE = 'player/index.html';

// ─── Message Router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    switch (message.type) {
      case 'OPEN_PLAYER':
        handleOpenPlayer(message.payload).then((tabId) => sendResponse({ tabId }));
        return true; // keep channel open for async

      case 'DOWNLOAD_FILE':
        chrome.downloads.download({
          url: message.payload.url,
          filename: message.payload.filename || 'video.mkv',
          saveAs: false,
          conflictAction: 'uniquify',
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.warn('[SW] download error:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, downloadId });
          }
        });
        return true;

      case 'PARSE_SERIES_PAGE':
        handleParseSeriesPage(message.url, sender.tab?.id).then(sendResponse);
        return true;

      default:
        break;
    }
  }
);

// ─── Open Player Tab ───────────────────────────────────────────────────────────
async function handleOpenPlayer(payload: PlayerPayload): Promise<number | null> {
  try {
    // Encode payload into query string so the player page can read it
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const url = chrome.runtime.getURL(`${PLAYER_PAGE}?payload=${encoded}`);
    const tab = await chrome.tabs.create({ url, active: true });
    return tab.id ?? null;
  } catch (err) {
    console.error('[SW] Failed to open player tab:', err);
    return null;
  }
}

// ─── Trigger Content Script Parse ─────────────────────────────────────────────
async function handleParseSeriesPage(
  url: string,
  requestingTabId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find or open tab with target URL
    const tabs = await chrome.tabs.query({ url });
    let targetTabId: number | undefined;

    if (tabs.length > 0 && tabs[0].id) {
      targetTabId = tabs[0].id;
    } else if (requestingTabId) {
      // ask content script on current active tab to navigate and parse
      targetTabId = requestingTabId;
    }

    if (!targetTabId) return { success: false, error: 'No target tab found.' };

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        // Signal to content script
        window.dispatchEvent(new CustomEvent('uvp:parse-page'));
        return true;
      },
    });

    return { success: !!result?.result };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Prevent Browser Auto-Downloads on Video Media Streams ───────────────────
function setupMediaStreamHeaders() {
  if (chrome.declarativeNetRequest?.updateDynamicRules) {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1001],
      addRules: [
        {
          id: 1001,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            responseHeaders: [
              {
                header: 'Content-Disposition',
                operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
              },
            ],
          },
          condition: {
            resourceTypes: [
              chrome.declarativeNetRequest.ResourceType.MEDIA,
              chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
            ],
          },
        },
      ],
    }).then(() => {
      console.log('[SW] DeclarativeNetRequest: Content-Disposition stripping active for video streams.');
    }).catch((err) => {
      console.warn('[SW] DNR rule setup warning:', err);
    });
  }
}

// ─── Installation Handler ──────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  setupMediaStreamHeaders();
  if (reason === 'install') {
    console.log('[UVP Extension] Installed successfully.');
  }
});

// Also run on service worker startup
setupMediaStreamHeaders();

export {};

