/**
 * Series Parser
 *
 * Extracts season and episode data from Circle FTP series pages and similar
 * structured pages. Uses only the real DOM — no hardcoded episode lists.
 *
 * Circle FTP page structure (observed from screenshot):
 *   - Season tabs: <a> / <button> elements whose text matches "Season N"
 *   - Episode table rows containing: Episode Name | Download button | Play button
 *
 * The parser is adaptive and uses multiple heuristic selectors.
 */

import type { Episode, Season, SeriesInfo } from '../types';

// ─── Public API ────────────────────────────────────────────────────────────────
export function parseSeriesPage(doc: Document = document, pageUrl?: string): SeriesInfo | null {
  const currentUrl = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const title = extractTitle(doc);
  const seasons = extractSeasons(doc, currentUrl);

  if (seasons.length > 0) {
    return {
      title,
      url: currentUrl,
      seasons,
    };
  }

  // Fallback: If no multi-episode seasons found, check if it's a single video / movie page
  const singleMovie = extractSingleMovieFromDoc(doc, currentUrl);
  if (singleMovie) {
    return {
      title: singleMovie.title || title,
      url: currentUrl,
      seasons: [
        {
          number: 1,
          label: 'Movie',
          episodes: [
            {
              id: 'movie-main',
              name: singleMovie.title || title,
              playUrl: singleMovie.playUrl,
              downloadUrl: singleMovie.downloadUrl,
              season: 1,
              episode: 1,
              status: 'idle',
            },
          ],
        },
      ],
    };
  }

  return null;
}

// ─── Title ─────────────────────────────────────────────────────────────────────
function extractTitle(doc: Document): string {
  // Try OG tag → <title> → H1 → H2 → fallback
  const og = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  if (og?.content) return og.content.trim();

  const h1 = doc.querySelector('h1');
  if (h1?.textContent) return h1.textContent.trim();

  const title = doc.querySelector('title');
  if (title?.textContent) return title.textContent.trim();

  return 'Unknown Series';
}

// ─── Season Discovery ──────────────────────────────────────────────────────────
function extractSeasons(doc: Document, baseUrl: string): Season[] {
  // Strategy 1: Find tab elements whose text matches "Season N"
  const seasonTabEls = findSeasonTabs(doc);
  if (seasonTabEls.length > 0) {
    return extractSeasonsFromTabs(doc, seasonTabEls, baseUrl);
  }

  // Strategy 2: Look for section headers
  return extractSeasonsFromSections(doc, baseUrl);
}

function findSeasonTabs(doc: Document): Element[] {
  // Match links, buttons, spans, divs, list items containing "Season N"
  const seasonPattern = /season\s*\d+/i;
  const candidates = Array.from(
    doc.querySelectorAll('a, button, [role="tab"], li, span, div')
  );

  const matched = candidates.filter((el) => {
    // Check direct or immediate text without deep nested tables
    const text = (el.textContent || '').trim();
    return seasonPattern.test(text) && text.length < 30 && !el.querySelector('table, tr, td');
  });

  // Deduplicate by season number so we don't have duplicates for <li> and its child <a>
  const seenSeasons = new Set<number>();
  const uniqueTabs: Element[] = [];

  for (const el of matched) {
    const num = seasonNumberFromText(el.textContent || '');
    if (num > 0 && !seenSeasons.has(num)) {
      seenSeasons.add(num);
      uniqueTabs.push(el);
    }
  }

  return uniqueTabs;
}

function extractSeasonsFromTabs(doc: Document, tabs: Element[], baseUrl: string): Season[] {
  const seasons: Season[] = [];

  // Sort tabs by season number
  const sorted = tabs.slice().sort((a, b) => {
    return seasonNumberFromText(a.textContent || '') - seasonNumberFromText(b.textContent || '');
  });

  for (const tab of sorted) {
    const num = seasonNumberFromText(tab.textContent || '');
    if (num === 0) continue;

    // Find the content area associated with this tab
    const episodes = extractEpisodesForTab(doc, tab, num, baseUrl);

    seasons.push({
      number: num,
      label: `Season ${num}`,
      episodes,
    });
  }

  return seasons;
}

function extractEpisodesForTab(doc: Document, tab: Element, seasonNum: number, baseUrl: string): Episode[] {
  // Method A: aria-controls / href target
  const targetId =
    tab.getAttribute('aria-controls') ||
    tab.getAttribute('href')?.replace('#', '') ||
    tab.getAttribute('data-target')?.replace('#', '') ||
    tab.getAttribute('data-bs-target')?.replace('#', '');

  if (targetId) {
    const container = doc.getElementById(targetId) || doc.querySelector(`[id="${targetId}"]`);
    if (container) {
      const eps = extractEpisodesFromContainer(container, seasonNum, baseUrl);
      if (eps.length > 0) return eps;
    }
  }

  // Method B: parent tab panel — find sibling panels
  const parent = tab.parentElement;
  if (parent) {
    const allTabs = Array.from(parent.querySelectorAll(tab.tagName));
    const tabIndex = allTabs.indexOf(tab as HTMLElement);
    if (tabIndex !== -1) {
      const panels = findTabPanels(doc, parent);
      if (panels[tabIndex]) {
        const eps = extractEpisodesFromContainer(panels[tabIndex], seasonNum, baseUrl);
        if (eps.length > 0) return eps;
      }
    }
  }

  // Method C: scan entire doc for tables/rows that mention this season
  const matchedEps = extractEpisodesFromPageBySeasonNum(doc, seasonNum, baseUrl);
  if (matchedEps.length > 0) return matchedEps;

  // Method D: If there is only one visible table on page (Circle FTP active tab table)
  // return its episodes for the current active/clicked tab
  const allTables = Array.from(doc.querySelectorAll('table'));
  for (const table of allTables) {
    const eps = extractEpisodesFromContainer(table, seasonNum, baseUrl);
    if (eps.length > 0) return eps;
  }

  return [];
}

function findTabPanels(doc: Document, tabContainer: Element): Element[] {
  // Circle FTP typically puts seasons in a single table that shows/hides rows
  // Or in separate div sections
  const parent = tabContainer.parentElement || doc.body;

  // Look for all tables in the parent or document
  const tables = Array.from(parent.querySelectorAll('table'));
  if (tables.length > 0) return tables;

  // Look for divs/sections with class hints
  const panels = Array.from(
    parent.querySelectorAll('[class*="tab-pane"], [class*="season"], [class*="panel"], [id*="season"]')
  );
  return panels;
}

function extractSeasonsFromSections(doc: Document, baseUrl: string): Season[] {
  // Fallback: scan headers for "Season N" patterns
  const headers = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const seasonHeaders = headers.filter((h) =>
    /season\s*\d+/i.test(h.textContent || '')
  );

  if (seasonHeaders.length > 0) {
    return seasonHeaders.map((header) => {
      const num = seasonNumberFromText(header.textContent || '');
      // Episodes follow the header until the next header
      const episodes = extractEpisodesAfterHeader(header, num, baseUrl);
      return { number: num, label: `Season ${num}`, episodes };
    });
  }

  // Last resort: treat entire page as one season
  const episodes = extractEpisodesFromContainer(doc.body, 1, baseUrl);
  if (episodes.length > 0) {
    return [{ number: 1, label: 'Season 1', episodes }];
  }

  return [];
}

// ─── Episode Extraction ────────────────────────────────────────────────────────
function extractEpisodesFromContainer(container: Element, seasonNum: number, baseUrl: string): Episode[] {
  const episodes: Episode[] = [];

  // Strategy 1: HTML table rows
  const rows = Array.from(container.querySelectorAll('tr'));
  for (const row of rows) {
    const ep = extractEpisodeFromRow(row, seasonNum, baseUrl);
    if (ep) episodes.push(ep);
  }
  if (episodes.length > 0) return episodes;

  // Strategy 2: Flex/grid cards
  const cards = Array.from(
    container.querySelectorAll('[class*="episode"], [class*="item"], [class*="card"]')
  );
  for (const card of cards) {
    const ep = extractEpisodeFromCard(card, seasonNum, baseUrl);
    if (ep) episodes.push(ep);
  }
  if (episodes.length > 0) return episodes;

  // Strategy 3: Any anchor with video-like href
  const links = Array.from(container.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  const videoLinks = links.filter((a) => isVideoUrl(a.href) || isPlayUrl(a.href));
  for (const link of videoLinks) {
    const ep = createEpisodeFromLink(link, seasonNum, episodes.length + 1, baseUrl);
    episodes.push(ep);
  }

  return episodes;
}

function extractEpisodesFromPageBySeasonNum(doc: Document, seasonNum: number, baseUrl: string): Episode[] {
  const pattern = new RegExp(`s0?${seasonNum}e\\d+`, 'i');
  const all = Array.from(doc.querySelectorAll('tr, [class*="episode"], [class*="item"]'));
  const matching = all.filter((el) => pattern.test(el.textContent || ''));

  const episodes: Episode[] = [];
  for (const el of matching) {
    const tagName = el.tagName.toLowerCase();
    const ep =
      tagName === 'tr'
        ? extractEpisodeFromRow(el, seasonNum, baseUrl)
        : extractEpisodeFromCard(el, seasonNum, baseUrl);
    if (ep) episodes.push(ep);
  }
  return episodes;
}

function extractEpisodesAfterHeader(header: Element, seasonNum: number, baseUrl: string): Episode[] {
  const episodes: Episode[] = [];
  let sibling = header.nextElementSibling;

  while (sibling) {
    const tag = sibling.tagName.toLowerCase();
    if (/h[1-6]/.test(tag) && /season\s*\d+/i.test(sibling.textContent || '')) break;

    const eps = extractEpisodesFromContainer(sibling, seasonNum, baseUrl);
    episodes.push(...eps);
    sibling = sibling.nextElementSibling;
  }

  return episodes;
}

// ─── Row / Card Parsers ────────────────────────────────────────────────────────
function extractEpisodeFromRow(row: Element, seasonNum: number, baseUrl: string): Episode | null {
  const cells = Array.from(row.querySelectorAll('td, th'));
  if (cells.length < 2) return null;

  const isHeader = cells.every((c) => c.tagName.toLowerCase() === 'th') ||
    /episode.?name|title|download|play/i.test(row.textContent || '');
  if (isHeader) return null;

  const name = findEpisodeName(cells);
  if (!name) return null;

  const playUrl = findPlayUrl(row, baseUrl);
  if (!playUrl) return null;

  const downloadUrl = findDownloadUrl(row, baseUrl);
  const epNum = extractEpisodeNumber(name);
  const id = `s${seasonNum}e${epNum}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    name,
    playUrl,
    downloadUrl,
    season: seasonNum,
    episode: epNum,
    status: 'idle',
  };
}

function extractEpisodeFromCard(card: Element, seasonNum: number, baseUrl: string): Episode | null {
  const name = findEpisodeName(Array.from(card.querySelectorAll('*')));
  if (!name) return null;

  const playUrl = findPlayUrl(card, baseUrl);
  if (!playUrl) return null;

  const downloadUrl = findDownloadUrl(card, baseUrl);
  const epNum = extractEpisodeNumber(name);
  const id = `s${seasonNum}e${epNum}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    name,
    playUrl,
    downloadUrl,
    season: seasonNum,
    episode: epNum,
    status: 'idle',
  };
}

function createEpisodeFromLink(link: HTMLAnchorElement, seasonNum: number, epNum: number, baseUrl: string): Episode {
  const name = (link.textContent || link.title || `Episode ${epNum}`).trim();
  const id = `s${seasonNum}e${epNum}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    name,
    playUrl: resolveUrlWithBase(link.getAttribute('href') || link.href, baseUrl),
    season: seasonNum,
    episode: epNum,
    status: 'idle',
  };
}

// ─── URL Helpers ───────────────────────────────────────────────────────────────
function findPlayUrl(container: Element, baseUrl: string): string | null {
  const anchors = Array.from(container.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  const buttons = Array.from(container.querySelectorAll('button, a'));

  // 1. Direct video URL on anchor
  for (const a of anchors) {
    const rawHref = a.getAttribute('href') || a.href;
    if (isVideoUrl(rawHref)) return resolveUrlWithBase(rawHref, baseUrl);
  }

  // 2. Play text anchor / button
  for (const a of anchors) {
    if (/play/i.test(a.textContent || '') || /play/i.test(a.className)) {
      const rawHref = a.getAttribute('href') || a.href;
      if (rawHref && !rawHref.startsWith('javascript:')) {
        return resolveUrlWithBase(rawHref, baseUrl);
      }
    }
  }

  // 3. Button/Element with data-src / data-url / data-play / data-href
  for (const btn of buttons) {
    const src =
      btn.getAttribute('data-src') ||
      btn.getAttribute('data-url') ||
      btn.getAttribute('data-video') ||
      btn.getAttribute('data-stream') ||
      btn.getAttribute('data-href') ||
      btn.closest('[data-src]')?.getAttribute('data-src') ||
      btn.closest('[data-url]')?.getAttribute('data-url');
    if (src) return resolveUrlWithBase(src, baseUrl);
  }

  // 4. Fallback: onclick attribute with URL
  const withOnclick = container.querySelectorAll('[onclick]');
  for (const el of withOnclick) {
    const onclick = el.getAttribute('onclick') || '';
    const match = onclick.match(/['"]([^'"]+\.(?:mp4|webm|m3u8|mkv|mov|avi)[^'"]*)['"]/i) ||
                  onclick.match(/['"](https?:\/\/[^'"]+)['"]/i) ||
                  onclick.match(/window\.open\(['"]([^'"]+)['"]/i);
    if (match) return resolveUrlWithBase(match[1], baseUrl);
  }

  // 5. If there's a download URL, use it as playback fallback if play button has no direct link
  const dl = findDownloadUrl(container, baseUrl);
  if (dl) return dl;

  return null;
}

function findDownloadUrl(container: Element, baseUrl: string): string | undefined {
  const anchors = Array.from(container.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  for (const a of anchors) {
    if (/download/i.test(a.textContent || '') ||
        /download/i.test(a.className) ||
        a.hasAttribute('download')) {
      const rawHref = a.getAttribute('href') || a.href;
      return resolveUrlWithBase(rawHref, baseUrl);
    }
  }
  return undefined;
}

function resolveUrlWithBase(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl || (typeof window !== 'undefined' ? window.location.href : '')).href;
  } catch {
    return relativeOrAbsolute;
  }
}

function findEpisodeName(elements: Element[]): string | null {
  for (const el of elements) {
    const text = (el.textContent || '').trim();
    // Must look like an episode name: has letters, reasonable length
    if (text.length > 3 && text.length < 200 && /[a-zA-Z]/.test(text) &&
        !/^\s*(download|play|watch|more|season)\s*$/i.test(text)) {
      // Skip elements that contain child elements with URLs (containers)
      const hasChildLinks = el.querySelectorAll('a[href]').length > 1;
      if (!hasChildLinks) return text;
    }
  }
  return null;
}

// ─── Utility ───────────────────────────────────────────────────────────────────
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|m3u8|mov|mkv|avi|ts|flv)(\?|$)/i.test(url);
}

function isPlayUrl(url: string): boolean {
  return /\/(play|watch|stream)\//i.test(url) || /[?&](play|src|url|video)=/i.test(url);
}

function resolveUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

function seasonNumberFromText(text: string): number {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function extractEpisodeNumber(name: string): number {
  // Match S1E3, E3, Episode 3, Ep3
  const patterns = [
    /[Ss]\d+[Ee](\d+)/,
    /[Ee]pisode\s*(\d+)/i,
    /[Ee]p\.?\s*(\d+)/i,
    /\b(\d+)\b/,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return 1;
}

// ─── Single Video / Movie Extraction ──────────────────────────────────────────
export function extractSingleMovieFromDoc(
  doc: Document,
  baseUrl: string
): { title: string; playUrl: string; downloadUrl?: string } | null {
  // 1. Look for <video> element
  const videoEl = doc.querySelector('video');
  let playUrl = videoEl?.currentSrc || videoEl?.src || '';
  if (!playUrl && videoEl) {
    const sourceEl = videoEl.querySelector('source');
    if (sourceEl) {
      playUrl = sourceEl.src || sourceEl.getAttribute('src') || '';
    }
  }

  // 2. Look for Download button or video file links
  let downloadUrl = '';
  const elements = Array.from(doc.querySelectorAll('a, button, [onclick], .btn'));

  for (const el of elements) {
    const text = (el.textContent || '').trim().toLowerCase();
    const href = el.getAttribute('href') || (el as HTMLAnchorElement).href || '';
    const dataUrl =
      el.getAttribute('data-url') ||
      el.getAttribute('data-src') ||
      el.getAttribute('data-href') ||
      el.getAttribute('data-video') ||
      '';
    const onclick = el.getAttribute('onclick') || '';

    if (text === 'download' || text.includes('download')) {
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        downloadUrl = resolveUrlInDoc(href, baseUrl);
      } else if (dataUrl) {
        downloadUrl = resolveUrlInDoc(dataUrl, baseUrl);
      } else if (onclick) {
        const m = onclick.match(/['"](https?:\/\/[^'"]+)['"]/i) || onclick.match(/['"](\/[^'"]+)['"]/i);
        if (m) downloadUrl = resolveUrlInDoc(m[1], baseUrl);
      }
    }

    const target = href || dataUrl || onclick;
    if (
      /\.(mkv|mp4|webm|avi|mov|m3u8)(\?|$)/i.test(target) ||
      /ftp\d*\.circleftp\.net/i.test(target)
    ) {
      const match = target.match(/https?:\/\/[^\s'"]+/i) || target.match(/\/ftp[^\s'"]+/i);
      const url = match ? resolveUrlInDoc(match[0], baseUrl) : (href ? resolveUrlInDoc(href, baseUrl) : '');
      if (url) {
        if (!playUrl) playUrl = url;
        if (!downloadUrl) downloadUrl = url;
      }
    }
  }

  // 3. Scan script tags for video stream links
  if (!playUrl) {
    const scripts = Array.from(doc.querySelectorAll('script'));
    for (const script of scripts) {
      const content = script.textContent || '';
      const match =
        content.match(/['"](https?:\/\/[^'"]+\.(?:mp4|mkv|webm|m3u8)[^'"]*)['"]/i) ||
        content.match(/file:\s*['"]([^'"]+)['"]/i) ||
        content.match(/src:\s*['"]([^'"]+)['"]/i);
      if (match) {
        playUrl = resolveUrlInDoc(match[1], baseUrl);
        break;
      }
    }
  }

  if (!playUrl && downloadUrl) playUrl = downloadUrl;
  if (playUrl && !downloadUrl) downloadUrl = playUrl;

  if (!playUrl) return null;

  const rawTitle = extractTitle(doc);
  const cleanTitle = rawTitle.replace(/Circle FTP.*$/i, '').replace(/\|.*$/i, '').trim() || 'Circle FTP Movie';

  return {
    title: cleanTitle,
    playUrl,
    downloadUrl,
  };
}

function resolveUrlInDoc(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

