/**
 * Self-contained Content Script for Circle FTP & generic streaming sites.
 */

interface Episode {
  id: string;
  name: string;
  playUrl: string;
  downloadUrl?: string;
  season: number;
  episode: number;
  status: string;
}

interface Season {
  number: number;
  label: string;
  episodes: Episode[];
}

interface SeriesInfo {
  title: string;
  url: string;
  seasons: Season[];
}

function resolveUrl(relativeOrAbsolute: string): string {
  try {
    return new URL(relativeOrAbsolute, window.location.href).href;
  } catch {
    return relativeOrAbsolute;
  }
}

function seasonNumberFromText(text: string): number {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function extractEpisodeNumber(name: string, fallbackIdx: number): number {
  const match = name.match(/[Ss]\d+[Ee](\d+)/) ||
                name.match(/[Ee]pisode\s*(\d+)/i) ||
                name.match(/[Ee]p\.?\s*(\d+)/i) ||
                name.match(/\b(\d+)\b/);
  return match ? parseInt(match[1], 10) : fallbackIdx;
}

/**
 * Robust extraction of play/download URL from a row.
 * Handles: <a> tags, <button>, onclick, data-url, data-link, or any href.
 */
function extractRowUrls(row: Element): { playUrl: string | null; downloadUrl?: string } {
  let playUrl: string | null = null;
  let downloadUrl: string | undefined = undefined;

  const anchors = Array.from(row.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  const buttons = Array.from(row.querySelectorAll('button, [onclick], .btn, [role="button"]'));

  // 1. Check anchors for Play or Download
  for (const a of anchors) {
    const text = (a.textContent || '').trim().toLowerCase();
    const href = a.getAttribute('href') || a.href;
    const onclick = a.getAttribute('onclick') || '';
    if (!href && !onclick) continue;

    // Check if Play button has a stream popup or url in onclick
    if (text.includes('play') || a.classList.contains('play') || a.classList.contains('btn-danger')) {
      const match = onclick.match(/['"](https?:\/\/[^'"]+)['"]/i) ||
                    onclick.match(/['"](\/[^'"]+)['"]/i);
      if (match) {
        playUrl = resolveUrl(match[1]);
      } else if (href && href !== '#' && !href.startsWith('javascript:')) {
        playUrl = resolveUrl(href);
      }
    } else if (text.includes('download') || a.classList.contains('download') || a.classList.contains('btn-success')) {
      if (href && href !== '#' && !href.startsWith('javascript:')) {
        downloadUrl = resolveUrl(href);
      }
    }
  }

  // 2. Check buttons or elements with data attributes
  for (const el of [...anchors, ...buttons]) {
    const rawData =
      el.getAttribute('data-src') ||
      el.getAttribute('data-url') ||
      el.getAttribute('data-href') ||
      el.getAttribute('data-video') ||
      el.getAttribute('data-link');
    if (rawData) {
      const resolved = resolveUrl(rawData);
      if (!playUrl) playUrl = resolved;
    }

    const onclick = el.getAttribute('onclick') || '';
    if (onclick) {
      const match =
        onclick.match(/['"]([^'"]+\.(?:mp4|webm|m3u8|mkv|mov|avi)[^'"]*)['"]/i) ||
        onclick.match(/window\.open\(['"]([^'"]+)['"]/i) ||
        onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
        onclick.match(/['"](https?:\/\/[^'"]+)['"]/i);
      if (match) {
        const resolved = resolveUrl(match[1]);
        if (!playUrl) playUrl = resolved;
      }
    }
  }

  // 3. Fallbacks: If only downloadUrl found, use it as playUrl too
  if (!playUrl && downloadUrl) {
    playUrl = downloadUrl;
  }

  // 4. If any anchor exists with an actual link, use it
  if (!playUrl && anchors.length > 0) {
    for (const a of anchors) {
      const href = a.getAttribute('href') || a.href;
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        playUrl = resolveUrl(href);
        break;
      }
    }
  }

  return { playUrl, downloadUrl };
}

function parseCirclePage(): SeriesInfo | null {
  const title = (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content ||
                document.querySelector('h1')?.textContent ||
                document.title ||
                'Circle FTP Series';

  // Find all season tabs (links or buttons containing Season N)
  const seasonPattern = /season\s*\d+/i;
  const candidates = Array.from(document.querySelectorAll('a, button, [role="tab"], li, span'));
  const foundSeasons = new Map<number, Element>();

  for (const el of candidates) {
    const text = (el.textContent || '').trim();
    if (seasonPattern.test(text) && text.length < 30 && !el.querySelector('table, tr, td')) {
      const num = seasonNumberFromText(text);
      if (num > 0 && !foundSeasons.has(num)) {
        foundSeasons.set(num, el);
      }
    }
  }

  // Parse all table rows on the page
  const allRows = Array.from(document.querySelectorAll('tr'));
  const validRows = allRows.filter((row) => {
    const cells = Array.from(row.querySelectorAll('td'));
    // Row must have at least 2 cells and not be header
    return cells.length >= 2 && !/episode.?name|title/i.test(cells[0].textContent || '');
  });

  console.log('[Universal Player] Found valid rows:', validRows.length);

  // Group rows by season
  const seasonsMap = new Map<number, Episode[]>();

  validRows.forEach((row, idx) => {
    const cells = Array.from(row.querySelectorAll('td'));
    const name = (cells[0]?.textContent || `Episode ${idx + 1}`).trim();
    const { playUrl, downloadUrl } = extractRowUrls(row);

    if (!playUrl) return;

    // Detect season number from episode name (e.g. "Game of Thrones S1E2" => Season 1)
    let sNum = 1;
    const seasonMatch = name.match(/[Ss](\d+)[Ee]/i) || name.match(/Season\s*(\d+)/i);
    if (seasonMatch) {
      sNum = parseInt(seasonMatch[1], 10);
    } else {
      // Check if row is inside a tab-pane with season id
      const container = row.closest('[id*="season"], [id*="Season"], [class*="season"]');
      if (container) {
        const idMatch = (container.id || container.className).match(/season[^\d]*(\d+)/i);
        if (idMatch) sNum = parseInt(idMatch[1], 10);
      }
    }

    const epNum = extractEpisodeNumber(name, idx + 1);

    const ep: Episode = {
      id: `s${sNum}e${epNum}-${idx}`,
      name,
      playUrl,
      downloadUrl,
      season: sNum,
      episode: epNum,
      status: 'idle',
    };

    if (!seasonsMap.has(sNum)) {
      seasonsMap.set(sNum, []);
    }
    seasonsMap.get(sNum)!.push(ep);
  });

  // Build seasons array
  let seasons: Season[] = [];

  if (seasonsMap.size > 0) {
    const sortedNums = Array.from(seasonsMap.keys()).sort((a, b) => a - b);
    seasons = sortedNums.map((num) => ({
      number: num,
      label: `Season ${num}`,
      episodes: seasonsMap.get(num)!,
    }));
  } else if (foundSeasons.size > 0) {
    // If table rows had no recognizable season, assign all found rows to Season 1
    const allParsed: Episode[] = [];
    validRows.forEach((row, idx) => {
      const cells = Array.from(row.querySelectorAll('td'));
      const name = (cells[0]?.textContent || `Episode ${idx + 1}`).trim();
      const { playUrl, downloadUrl } = extractRowUrls(row);
      if (playUrl) {
        allParsed.push({
          id: `ep-${idx}`,
          name,
          playUrl,
          downloadUrl,
          season: 1,
          episode: idx + 1,
          status: 'idle',
        });
      }
    });

    if (allParsed.length > 0) {
      seasons.push({
        number: 1,
        label: 'Season 1',
        episodes: allParsed,
      });
    }
  }

  // If no series/seasons found, detect if this is a Single Movie / Video page
  if (seasons.length === 0) {
    const movie = detectSingleMovie();
    if (movie) {
      console.log('[Universal Player] Detected Single Movie on page:', movie.title, movie.playUrl);
      return {
        title: movie.title,
        url: window.location.href,
        seasons: [
          {
            number: 1,
            label: 'Movie',
            episodes: [
              {
                id: 'movie-main',
                name: movie.title,
                playUrl: movie.playUrl,
                downloadUrl: movie.downloadUrl,
                season: 1,
                episode: 1,
                status: 'idle',
              },
            ],
          },
        ],
      };
    }

    console.warn('[Universal Player] No episodes or movie extracted.');
    return null;
  }

  return {
    title: title.trim(),
    url: window.location.href,
    seasons,
  };
}

// ─── Single Video / Movie Detection ───────────────────────────────────────────
interface SingleMovieData {
  title: string;
  playUrl: string;
  downloadUrl?: string;
  videoElement?: HTMLVideoElement | null;
}

function detectSingleMovie(): SingleMovieData | null {
  // 1. Look for <video> element on the page
  const videoEl = document.querySelector('video');
  let playUrl = videoEl?.currentSrc || videoEl?.src || '';
  if (!playUrl && videoEl) {
    const sourceEl = videoEl.querySelector('source');
    if (sourceEl) {
      playUrl = sourceEl.src || sourceEl.getAttribute('src') || '';
    }
  }

  // 2. Look for Download button or video file links (.mkv, .mp4, ftp)
  let downloadUrl = '';
  const candidates = Array.from(document.querySelectorAll('a, button, [onclick], .btn'));

  for (const el of candidates) {
    const text = (el.textContent || '').trim().toLowerCase();
    const href = el.getAttribute('href') || (el as HTMLAnchorElement).href || '';
    const dataUrl =
      el.getAttribute('data-url') ||
      el.getAttribute('data-src') ||
      el.getAttribute('data-href') ||
      el.getAttribute('data-video') ||
      '';
    const onclick = el.getAttribute('onclick') || '';

    // Check for "Download" button
    if (text === 'download' || text.includes('download')) {
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        downloadUrl = resolveUrl(href);
      } else if (dataUrl) {
        downloadUrl = resolveUrl(dataUrl);
      } else if (onclick) {
        const m = onclick.match(/['"](https?:\/\/[^'"]+)['"]/i) || onclick.match(/['"](\/[^'"]+)['"]/i);
        if (m) downloadUrl = resolveUrl(m[1]);
      }
    }

    // Check for direct video / ftp stream links (must NOT be /download/ endpoint)
    const target = href || dataUrl || onclick;
    if (
      (/\.(mkv|mp4|webm|avi|mov|m3u8)(\?|$)/i.test(target) ||
      /ftp\d*\.circleftp\.net/i.test(target)) &&
      !target.includes('/download/')
    ) {
      const match = target.match(/https?:\/\/[^\s'"]+/i) || target.match(/\/ftp[^\s'"]+/i);
      const url = match ? resolveUrl(match[0]) : (href ? resolveUrl(href) : '');
      if (url && !url.includes('/download/')) {
        if (!playUrl) playUrl = url;
      }
    }
  }

  // 3. Scan script tags (Plyr, Video.js, etc.)
  if (!playUrl) {
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const content = script.textContent || '';
      const match =
        content.match(/['"](https?:\/\/[^'"]+\.(?:mp4|mkv|webm|m3u8)[^'"]*)['"]/i) ||
        content.match(/file:\s*['"]([^'"]+)['"]/i) ||
        content.match(/src:\s*['"]([^'"]+)['"]/i);
      if (match && !match[1].includes('/download/')) {
        playUrl = resolveUrl(match[1]);
        break;
      }
    }
  }

  // NEVER allow /download/ URL to be used as playUrl — it triggers browser auto-download!
  if (playUrl && playUrl.includes('/download/')) {
    playUrl = '';
  }

  if (!playUrl) return null;

  let title = (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content ||
              document.querySelector('h1')?.textContent ||
              document.querySelector('h2')?.textContent ||
              document.title ||
              'Movie';

  title = title.replace(/Circle FTP.*$/i, '').replace(/\|.*$/i, '').trim() || 'Circle FTP Movie';

  return {
    title,
    playUrl,
    downloadUrl: downloadUrl || playUrl,
    videoElement: videoEl,
  };
}

// ─── Floating Button on Series & Single Movie Pages ───────────────────────────
function injectFloatingButton() {
  const data = parseCirclePage();
  if (!data || data.seasons.length === 0 || !data.seasons[0].episodes[0]) return;

  const isMovie = data.seasons.length === 1 && data.seasons[0].label === 'Movie';
  const label = isMovie ? 'Open in Universal Player (Fix Audio)' : 'Open Series Player';

  let btn = document.getElementById('uvp-floating-trigger');
  if (!btn) {
    btn = document.createElement('div');
    btn.id = 'uvp-floating-trigger';
    btn.style.cssText = `
      position: fixed !important;
      bottom: 30px !important;
      right: 30px !important;
      z-index: 2147483647 !important;
      background: linear-gradient(135deg, #ff9800, #e65100) !important;
      color: #ffffff !important;
      padding: 14px 24px !important;
      border-radius: 50px !important;
      box-shadow: 0 8px 30px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.4) !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      transition: transform 0.2s ease, box-shadow 0.2s ease !important;
      user-select: none !important;
    `;
    btn.onmouseenter = () => { if (btn) btn.style.transform = 'scale(1.06)'; };
    btn.onmouseleave = () => { if (btn) btn.style.transform = 'scale(1)'; };
    document.body.appendChild(btn);
  }

  btn.innerHTML = `<span style="font-size:20px; line-height: 1;">▶</span> <span>${label}</span>`;
  btn.onclick = () => {
    btn!.innerHTML = `<span style="font-size:20px; line-height: 1;">⏳</span> <span>Opening Player…</span>`;
    chrome.runtime.sendMessage({
      type: 'OPEN_PLAYER',
      payload: { mode: 'series', series: data, episode: data.seasons[0].episodes[0] },
    });
    setTimeout(() => {
      if (btn) btn.innerHTML = `<span style="font-size:20px; line-height: 1;">▶</span> <span>${label}</span>`;
    }, 2500);
  };

  // If on a single movie page, also inject in-page toolbar directly near the player
  if (isMovie) {
    injectInPageMovieToolbar(data.seasons[0].episodes[0], data.title);
  }
}

// ─── In-Page Movie Toolbar (Directly under/above the video player) ──────────────
function injectInPageMovieToolbar(episode: Episode, title: string) {
  if (document.getElementById('uvp-inpage-toolbar')) return;

  const videoEl = document.querySelector('video');
  const dlBtn = Array.from(document.querySelectorAll('a, button')).find((el) => {
    const t = (el.textContent || '').trim().toLowerCase();
    return t === 'download';
  });

  const targetAnchor = dlBtn?.parentElement || videoEl?.parentElement || document.body;
  if (!targetAnchor) return;

  const toolbar = document.createElement('div');
  toolbar.id = 'uvp-inpage-toolbar';
  toolbar.style.cssText = `
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 12px !important;
    padding: 12px 20px !important;
    margin: 16px auto !important;
    max-width: 900px !important;
    background: #11141c !important;
    border: 1px solid #333a4d !important;
    border-radius: 12px !important;
    box-shadow: 0 8px 30px rgba(0,0,0,0.5) !important;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    z-index: 10000 !important;
  `;

  toolbar.innerHTML = `
    <div style="color: #ff9800; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 6px; margin-right: 4px;">
      <span>⚡ Universal Audio & Video:</span>
    </div>
    <button id="uvp-btn-play" style="
      background: #ff9800; color: #fff; font-weight: 700; font-size: 13px; padding: 9px 18px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;
    ">
      <span>▶</span> Open in Player (Fix Audio)
    </button>
    <button id="uvp-btn-vlc" style="
      background: #d97706; color: #fff; font-weight: 700; font-size: 13px; padding: 9px 18px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;
    ">
      <span>⚡</span> Stream in VLC
    </button>
    <button id="uvp-btn-dl" style="
      background: #16a34a; color: #fff; font-weight: 700; font-size: 13px; padding: 9px 18px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;
    ">
      <span>📥</span> Fast Download (Chrome)
    </button>
    <button id="uvp-btn-copy" style="
      background: #1e2433; color: #e2e8f0; font-weight: 600; font-size: 13px; padding: 9px 14px; border: 1px solid #475569; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;
    ">
      <span>📋</span> Copy Link
    </button>
  `;

  toolbar.querySelector('#uvp-btn-play')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'OPEN_PLAYER',
      payload: {
        mode: 'series',
        series: {
          title,
          url: window.location.href,
          seasons: [{ number: 1, label: 'Movie', episodes: [episode] }],
        },
        episode,
      },
    });
  });

  toolbar.querySelector('#uvp-btn-vlc')?.addEventListener('click', () => {
    // 1. Launch VLC directly via registered vlc:// protocol (Zero downloads!)
    const safeUrl = (episode.playUrl || '').replace(/ /g, '%20');
    try {
      window.location.href = `vlc://${safeUrl}`;
    } catch {
      const a = document.createElement('a');
      a.href = `vlc://${safeUrl}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    // 2. Copy link to clipboard
    navigator.clipboard.writeText(safeUrl);

    const vlcBtnEl = toolbar.querySelector('#uvp-btn-vlc') as HTMLElement;
    if (vlcBtnEl) {
      vlcBtnEl.innerText = '✔ Opening VLC…';
      setTimeout(() => { vlcBtnEl.innerHTML = '<span>⚡</span> Stream in VLC'; }, 3000);
    }
  });

  toolbar.querySelector('#uvp-btn-dl')?.addEventListener('click', () => {
    const filename = `${title.replace(/[/\\?%*:|"<>]/g, '')}.mkv`;
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_FILE',
      payload: { url: episode.downloadUrl || episode.playUrl, filename },
    });
    const dlBtnEl = toolbar.querySelector('#uvp-btn-dl') as HTMLElement;
    if (dlBtnEl) {
      dlBtnEl.innerText = '✔ Downloading…';
      setTimeout(() => { dlBtnEl.innerHTML = '<span>📥</span> Fast Download (Chrome)'; }, 3000);
    }
  });

  toolbar.querySelector('#uvp-btn-copy')?.addEventListener('click', () => {
    navigator.clipboard.writeText(episode.playUrl);
    const copyBtnEl = toolbar.querySelector('#uvp-btn-copy') as HTMLElement;
    if (copyBtnEl) {
      copyBtnEl.innerText = '✔ Copied for VLC (Ctrl+N)!';
      setTimeout(() => { copyBtnEl.innerHTML = '<span>📋</span> Copy Link'; }, 3000);
    }
  });

  if (dlBtn && dlBtn.parentElement) {
    dlBtn.parentElement.insertAdjacentElement('afterend', toolbar);
  } else if (videoEl && videoEl.parentElement) {
    videoEl.parentElement.insertAdjacentElement('afterend', toolbar);
  } else {
    document.body.appendChild(toolbar);
  }
}

// Run immediately & on events
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFloatingButton);
} else {
  injectFloatingButton();
}

window.addEventListener('load', injectFloatingButton);
setInterval(injectFloatingButton, 1500);
