'use strict';
// commands/download.js — Working downloader commands
// Uses free public APIs + yt-dlp (if installed) for YouTube
const { exec } = require('child_process');
const { promisify } = require('util');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const axios = require('axios');

const execAsync = promisify(exec);
const { execFile } = require('child_process');
const execFileAsync = promisify(execFile);

function tmpFile(ext) {
  return path.join(os.tmpdir(), `olamd_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
}

// Strict YouTube URL validation — rejects shell metacharacters
function assertYouTubeUrl(url) {
  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[\w\-?=&#%.+/]+$/.test(url)) {
    throw new Error('Invalid YouTube URL');
  }
}

// ── cobalt.tools — multi-platform downloader (YouTube, Twitter, Instagram, FB) ──
async function cobaltFetch(url, downloadMode = 'auto', audioFormat = 'mp3') {
  const { data } = await axios.post(
    'https://api.cobalt.tools/',
    { url, downloadMode, audioFormat, filenameStyle: 'basic', quality: '720' },
    {
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        'User-Agent':   'OLASUBOMI-MD/3.0'
      },
      timeout: 30000
    }
  );
  // Normalise all response shapes to a single URL string
  if (data.status === 'error') throw new Error(data.error?.code || 'cobalt error');
  if (data.status === 'picker') {
    // picker is an array of items; take the first media URL
    const item = Array.isArray(data.picker) ? data.picker[0] : null;
    const picked = item?.url || item?.thumb || null;
    if (!picked) throw new Error('cobalt returned an empty picker list');
    return picked;
  }
  // 'stream', 'redirect', 'tunnel' — all have a single url field
  const resolved = typeof data.url === 'string' ? data.url
                 : Array.isArray(data.url)       ? data.url[0]
                 : null;
  if (!resolved) throw new Error('cobalt returned no usable URL');
  return resolved;
}

// ── yt-dlp helper — uses execFile (no shell) to prevent injection ──────────
async function ytDlpAvailable() {
  try { await execFileAsync('yt-dlp', ['--version']); return true; } catch { return false; }
}

async function ytDlpDownload(url, format = 'audio', quality = '720') {
  // Validate URL strictly — no shell is involved, but belt-and-braces
  assertYouTubeUrl(url);

  const outTemplate = tmpFile('');          // base path without extension
  // player_client=android,web works around YouTube's SABR streaming rollout
  // (web-only formats get skipped without a URL) — android formats need no
  // PO token for the "best" muxed/adaptive formats yt-dlp picks here.
  const clientArgs = ['--extractor-args', 'youtube:player_client=android,web'];
  const args = format === 'audio'
    ? ['-x', '--audio-format', 'mp3', '--audio-quality', '5',
       '-o', outTemplate + '.%(ext)s', url,
       '--no-playlist', '--max-filesize', '90m', ...clientArgs]
    : ['-f', `best[height<=${quality}][ext=mp4]/best[height<=${quality}]/best[ext=mp4]/best`,
       '-o', outTemplate + '.%(ext)s', url,
       '--no-playlist', '--max-filesize', '90m', ...clientArgs];

  await execFileAsync('yt-dlp', args, { timeout: 180000 });

  // yt-dlp may choose a different extension — find the actual output file
  const dir   = path.dirname(outTemplate);
  const base  = path.basename(outTemplate);
  const found = fs.readdirSync(dir).find(f => f.startsWith(base) && f !== base);
  if (!found) throw new Error('yt-dlp produced no output file');
  return path.join(dir, found);
}

// ── TikTok via tikwm.com ───────────────────────────────────────────────────
async function tikwmFetch(url) {
  const { data } = await axios.post(
    'https://www.tikwm.com/api/',
    new URLSearchParams({ url, hd: '1' }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
  );
  if (data.code !== 0) throw new Error(data.msg || 'TikTok API error');
  const d = data.data;
  // Prefer HD no-watermark → play no-watermark → play
  return {
    videoUrl: d.hdplay || d.play || d.wmplay,
    audioUrl: d.music,
    title:    d.title   || 'TikTok Video',
    author:   d.author?.nickname || 'Unknown',
    duration: d.duration,
    cover:    d.cover
  };
}

// ── MediaFire scrape ───────────────────────────────────────────────────────
async function mediaFireDl(url) {
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000
  });
  const match = html.match(/href="(https:\/\/download\d+\.mediafire\.com\/[^"]+)"/);
  if (!match) throw new Error('Could not extract MediaFire download link');
  return match[1];
}

// ── GogoAnime (gogoanime.by) — anime episode/movie scraper ─────────────────
// NOTE: This scrapes a piracy mirror site directly (no official/legal API for
// full anime episode downloads exists). It is inherently fragile — it will
// break whenever the site changes its markup or domain — and carries legal
// risk since it redistributes copyrighted content without authorization.
const GOGO_BASE = 'https://gogoanime.by';
const GOGO_UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function gogoGet(url) {
  const { data } = await axios.get(url, { headers: { 'User-Agent': GOGO_UA }, timeout: 20000 });
  return data;
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").replace(/&#038;|&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&quot;/g, '"').replace(/&#8216;/g, "'");
}

function normalizeTitle(s) {
  return decodeHtmlEntities(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ── Search helpers ──────────────────────────────────────────────────────────

// Score and rank a list of candidates against a query. Returns the best match
// or null if nothing has meaningful word overlap with the query.
function scoreCandidates(candidates, query) {
  const nq         = normalizeTitle(query);
  const queryWords = nq.split(' ').filter(Boolean);

  const scored = candidates.map(c => {
    const nt         = normalizeTitle(c.title);
    const titleWords = nt.split(' ').filter(Boolean);
    let score;

    if (nt === nq)                                             score = 0; // exact
    else if (nt.startsWith(nq + ' ') || nt.startsWith(nq))   score = 1; // starts with query
    else if (nt.includes(nq))                                 score = 2; // query is substring
    else {
      // Word-overlap: ratio of query words found in the title
      const matched = queryWords.filter(w => titleWords.includes(w));
      const ratio   = matched.length / queryWords.length;
      if      (ratio >= 0.8) score = 2.5;
      else if (ratio >= 0.5) score = 3;
      else if (ratio >  0)   score = 3.5;
      else                   score = 99;  // no overlap at all — discard
    }

    // Prefer results that live under /series/ (posts vs categories vs pages)
    if (c.preferSeries) score -= 0.1;

    return { ...c, score, len: nt.length };
  }).filter(c => c.score < 99);

  if (!scored.length) return null;
  scored.sort((a, b) => a.score - b.score || a.len - b.len);
  return scored[0];
}

// Fetch candidates from the wp-json REST search endpoint (fast, up to 50 hits).
async function gogoRestCandidates(query) {
  try {
    const { data } = await axios.get(`${GOGO_BASE}/wp-json/wp/v2/search`, {
      params: { search: query, per_page: 50 },
      headers: { 'User-Agent': GOGO_UA },
      timeout: 20000,
    });
    if (!Array.isArray(data) || !data.length) return [];
    return data.flatMap(item => {
      const url = item.url || '';
      // Accept /series/ slugs and also top-level slugs (some series live at /slug/ not /series/slug/)
      const seriesM = /\/series\/([^/?#]+)\/?$/.exec(url);
      const topM    = !seriesM && /gogoanime\.by\/([^/?#]+)\/?$/.exec(url);
      const m       = seriesM || topM;
      if (!m) return [];
      return [{ slug: decodeURIComponent(m[1]), title: decodeHtmlEntities(item.title || ''), preferSeries: Boolean(seriesM) }];
    });
  } catch (_) {
    return [];
  }
}

// Fallback: scrape the HTML search results page for /series/ links.
async function gogoHtmlCandidates(query) {
  try {
    const { data: html } = await axios.get(`${GOGO_BASE}/?s=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': GOGO_UA },
      timeout: 20000,
    });
    const candidates = [];
    // Match href="/series/slug/" with any link text nearby
    const re = /href="https?:\/\/(?:www\.)?gogoanime\.by\/series\/([^/"]+)\/?"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const slug = decodeURIComponent(m[1]);
      // Extract the nearest text node after the href as a title approximation
      const snippet = html.slice(m.index, m.index + 300);
      const titleM  = snippet.match(/title="([^"]+)"|>([^<]{3,80})<\/a/);
      const title   = decodeHtmlEntities((titleM?.[1] || titleM?.[2] || slug).trim());
      candidates.push({ slug, title, preferSeries: true });
    }
    return candidates;
  } catch (_) {
    return [];
  }
}

// Search gogoanime.by for the best-matching series using three strategies in
// order: REST API → shortened query REST → HTML search page fallback.
// Returns { slug, title } or null.
async function gogoSearchSeries(query) {
  // Strategy 1: wp-json REST (widest result set, best for exact/common titles)
  let candidates = await gogoRestCandidates(query);
  let best = scoreCandidates(candidates, query);
  if (best) return best;

  // Strategy 2: try first 3 words only (helps with long subtitles / season tags)
  const words = query.trim().split(/\s+/);
  if (words.length > 3) {
    const shortQ = words.slice(0, 3).join(' ');
    candidates = await gogoRestCandidates(shortQ);
    best = scoreCandidates(candidates, query); // still score against original query
    if (best) return best;
  }

  // Strategy 3: HTML search page (different indexing, catches some titles the
  // REST API misses, especially newer additions)
  candidates = await gogoHtmlCandidates(query);
  return scoreCandidates(candidates, query);
}

// Given a series slug + episode number, find the actual episode page URL.
// Uses a broad regex (any gogoanime.by URL containing "episode-N") then picks
// the most specific match — much more resilient than the old strict pattern.
async function gogoFindEpisodeUrl(slug, episodeNum) {
  const html = await gogoGet(`${GOGO_BASE}/series/${slug}/`);

  // Collect every gogoanime.by href that contains "episode-<N>" anywhere
  const broad = new RegExp(
    `href="(https?:\\/\\/(?:www\\.)?gogoanime\\.by\\/[^"]*episode-${episodeNum}[^"]*)"`,
    'gi'
  );
  const allMatches = [];
  let m;
  while ((m = broad.exec(html)) !== null) {
    const u = m[1];
    if (!allMatches.includes(u)) allMatches.push(u);
  }
  if (!allMatches.length) return null;

  // Rank: prefer URLs that include the series slug (most specific)
  const withSlug = allMatches.filter(u => u.includes(slug));
  return withSlug[0] || allMatches[0];
}

// Resolve an embed page (e.g. megaplay.su/embed.php?sid=...) down to the
// actual direct .mp4 (or .m3u8) source URL that the JW/HLS player loads.
function extractPlayableUrlFromHtml(html) {
  // Try every pattern real-world embed hosts use, from most to least common.
  // Direct Google-hosted sources (e.g. Blogger/n-bg resolvers returning a
  // googlevideo.com "videoplayback" link) have no .m3u8/.mp4 file extension
  // at all — they're dynamic URLs identified only by an "itag"/"mime" query
  // param — so extension-specific patterns are tried first (safest/most
  // specific), then a fallback set that accepts any http(s) URL in the same
  // JS/JSON shapes.
  const patterns = [
    /file:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,     // JWPlayer: file: "..."
    /"file"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i,        // JSON: "file":"..."
    /sources\s*:\s*\[\s*\{\s*(?:file|src)\s*:\s*["']([^"']+)["']/i, // sources: [{file: "..."}]
    /<source[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,        // <source src="...">
    /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i,          // bare .m3u8 URL anywhere
    /(?:var\s+fileUrl|file)\s*=?\s*[:=]?\s*["'](https?:\/\/[^"']+)["']/i, // JWPlayer var fileUrl = "..." (no extension, e.g. googlevideo.com)
    /"file"\s*:\s*"(https?:\/\/[^"]+)"/i,                // JSON "file":"..." with no extension
    /sources\s*:\s*\[\s*\{\s*(?:file|src)\s*:\s*["'](https?:\/\/[^"']+)["']/i, // sources: [{file: "https://..."}] no extension
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].replace(/\\\//g, '/');
  }
  return null;
}

async function gogoExtractStreamUrl(embedUrl) {
  const html = await gogoGet(embedUrl);
  const found = extractPlayableUrlFromHtml(html);
  if (found) return found;
  // Some embed hosts bounce through a client-side redirect
  // (window.location.replace('...')) before rendering the real player —
  // follow it once and retry.
  const redirect = html.match(/window\.location\.replace\(\s*['"]([^'"]+)['"]/);
  if (redirect) {
    const html2 = await gogoGet(redirect[1]).catch(() => null);
    if (html2) return extractPlayableUrlFromHtml(html2);
  }
  return null;
}

// Parse every server option ("player-type-link") listed on an episode page,
// regardless of attribute order in the markup. Also captures the `key` and
// `subtitle` attributes added in the 2025 page redesign.
function gogoParseServerBlocks(html) {
  const blocks = html.split(/<li class='player-type-link/).slice(1);
  return blocks.map(block => {
    const attr = name => {
      const m = block.match(new RegExp(`data-${name}='([^']*)'`));
      return m ? m[1] : '';
    };
    return {
      type:     attr('type'),
      enc1:     attr('encrypted-url1'),
      enc2:     attr('encrypted-url2'),
      enc3:     attr('encrypted-url3'),
      plainUrl: attr('plain-url'),
      key:      attr('key'),
      subtitle: attr('subtitle'),
    };
  }).filter(b => b.type);
}

// Resolve one AJAX-based server (Blogger, hianime, etc.) via 9animetv.be's
// player.php. Returns a playable URL or null.
//
// Known dead paths (skipped immediately to save round-trips):
//   /histream/play.php — returns HTTP 500 unconditionally on the provider's
//   own server; not fixable client-side (confirmed repeatedly as of 2025-07).
async function gogoResolveAjaxServer(server, featureImage, postId) {
  const params = {
    [server.type]: server.enc1,
    url2:          server.enc2,
    url3:          server.enc3,
    feature_image: featureImage,
    user_agent:    GOGO_UA,
    ref:           'gogoanime.by',
    postId,
  };
  // Pass key + subtitle when present — the PHP may use them to choose a
  // different resolver branch (added to the page JS in 2025).
  if (server.key)      params.key      = server.key;
  if (server.subtitle) params.subtitle = server.subtitle;

  const { data: playerHtml } = await axios.get(
    'https://9animetv.be/wp-content/plugins/video-player/includes/player/player.php',
    { params, timeout: 20000, headers: { Referer: `${GOGO_BASE}/` } }
  );
  const iframeMatch = (playerHtml + '').match(/<iframe src="([^"]+)"/);
  if (!iframeMatch) return null;
  let iframeSrc = iframeMatch[1].replace(/&amp;/g, '&');
  if (iframeSrc.startsWith('/')) iframeSrc = 'https://9animetv.be' + iframeSrc;
  if (iframeSrc.includes('/histream/')) return null; // known HTTP-500 dead end
  const { data: resolvedHtml } = await axios.get(iframeSrc, {
    timeout: 20000, headers: { Referer: 'https://9animetv.be/', 'User-Agent': GOGO_UA }
  });
  const html = resolvedHtml + '';
  if (/no available video source/i.test(html)) return null;
  return extractPlayableUrlFromHtml(html);
}

// Try every server listed on an episode page until one yields a real
// direct video URL.
//
// Fast path: embed/kiwi servers carry a plain iframe URL — resolve in one hop.
// AJAX path: Blogger/hianime etc. go through 9animetv.be player.php.
//
// Page-metadata extraction (featureImage, postId, key, subtitle) uses the
// `const default*` JS constants introduced in the 2025 page redesign. The old
// regex looked for inline loadPlayer("...", ...) which no longer appears.
async function gogoResolvePlayableUrl(episodePageUrl) {
  const html    = await gogoGet(episodePageUrl);
  const servers = gogoParseServerBlocks(html);

  // ── Fast path: direct iframe (embed / kiwi) ──────────────────────────────
  const direct = servers.filter(s => (s.type === 'embed' || s.type === 'kiwi') && s.plainUrl);
  for (const s of direct) {
    const streamUrl = await gogoExtractStreamUrl(s.plainUrl).catch(() => null);
    if (streamUrl) return streamUrl;
  }

  // ── AJAX path: extract page-level metadata from const default* variables ──
  // The 2025 page redesign stores these as JS constants rather than inline
  // arguments, so the old loadPlayer("...", enc1, enc2...) regex no longer works.
  const featureImage = (html.match(/const\s+defaultFeatureImage\s*=\s*"([^"]*)"/) || [])[1] || '';
  const postId       = (html.match(/const\s+defaultPostId\s*=\s*"(\d+)"/)         || [])[1] || '';
  const pageKey      = (html.match(/const\s+defaultKey\s*=\s*"([^"]*)"/)          || [])[1] || '';
  const subtitleUrl  = (html.match(/const\s+defaultSubtitleUrl\s*=\s*"([^"]*)"/)  || [])[1] || '';

  if (!postId) {
    // Fallback: old-style postId pattern in case the page hasn't been updated
    const old = (html.match(/"(\d+)",\s*plainUrl\s*\)/) || [])[1];
    if (!old) return null; // can't construct the AJAX params
  }

  const ajaxServers = servers.filter(s => s.type !== 'embed' && s.type !== 'kiwi' && s.enc1);
  for (const s of ajaxServers) {
    // Merge page-level key/subtitle into the per-server block (server block
    // values take precedence if present, otherwise fall back to page defaults)
    const merged = {
      ...s,
      key:      s.key      || pageKey,
      subtitle: s.subtitle || subtitleUrl,
    };
    const streamUrl = await gogoResolveAjaxServer(merged, featureImage, postId).catch(() => null);
    if (streamUrl) return streamUrl;
  }
  return null;
}

// Last-resort: try yt-dlp on the episode page. yt-dlp's generic extractor
// won't always succeed on JS-rendered anime pages, but it costs nothing to
// try after all scraping paths have failed.
async function gogoYtDlpFallback(episodePageUrl) {
  if (!(await ytDlpAvailable())) return null;
  const outBase = tmpFile('');
  try {
    await execFileAsync('yt-dlp', [
      '-f', 'best[height<=720][ext=mp4]/best[height<=720]/best[ext=mp4]/best',
      '-o', `${outBase}.%(ext)s`,
      '--no-playlist',
      '--max-filesize', '90m',
      episodePageUrl,
    ], { timeout: 60000 });
    const dir   = path.dirname(outBase);
    const base  = path.basename(outBase);
    const found = fs.readdirSync(dir).find(f => f.startsWith(base) && f !== base);
    return found ? path.join(dir, found) : null;
  } catch {
    return null;
  }
}

// Full pipeline: title + episode number → direct video URL + metadata.
//
// Returns { title, episodeNum, episodeUrl, streamUrl } on the happy path.
// When the scraper path finds no working server (e.g. every server on the
// page routes through histream which is dead), we try yt-dlp on the episode
// page as a last resort. On yt-dlp success the result has streamUrl: null
// and localFile: <tempFilePath>; the caller must delete localFile.
async function gogoDownloadEpisode(title, episodeNum) {
  const series = await gogoSearchSeries(title);
  if (!series) throw new Error(`No anime found matching "${title}"`);
  const episodeUrl = await gogoFindEpisodeUrl(series.slug, episodeNum);
  if (!episodeUrl) throw new Error(`Episode ${episodeNum} not found for "${series.title}"`);
  const streamUrl = await gogoResolvePlayableUrl(episodeUrl);
  if (!streamUrl) {
    // All scraper paths failed (most commonly: episode only has hianime
    // servers and histream.php is dead). Try yt-dlp as a last resort.
    console.log(`${ANIME_LOG_PREFIX} scraper found no stream for "${series.title}" ep${episodeNum} — trying yt-dlp fallback`);
    const localFile = await gogoYtDlpFallback(episodeUrl);
    if (localFile) {
      return { title: series.title, episodeNum, episodeUrl, streamUrl: null, localFile };
    }
    const err = new Error(
      `No download server is currently available for this episode.\n` +
      `Watch it online instead: ${episodeUrl}`
    );
    err.episodeUrl = episodeUrl;
    throw err;
  }
  return { title: series.title, episodeNum, episodeUrl, streamUrl };
}

// ── Stream URL classification & delivery (used by .animedl) ────────────────
//
// gogoResolvePlayableUrl() can hand back several fundamentally different
// kinds of URL depending on which server the episode used, and each needs a
// different delivery strategy:
//   - "mp4"        a real file URL ending in .mp4 — safe to download & send.
//   - "hls"        an .m3u8 playlist (segmented video) — WhatsApp/Baileys
//                  cannot attach this directly; it must be remuxed to a
//                  single .mp4 file first (ffmpeg), or rejected with a clear
//                  reason if that's not possible.
//   - "google-cdn" a googlevideo.com "videoplayback" URL — no file
//                  extension, format lives in a "mime="/"itag=" query param,
//                  and the link is short-lived (has an "expire=" timestamp).
//                  These are ordinary MP4/WebM bytes once fetched, but must
//                  never be handed to the user as a raw link since they will
//                  be expired by the time they click it.
//   - "unknown"    anything else — refuse rather than guess.
const ANIME_LOG_PREFIX = '[animedl]';

function classifyStreamUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return { kind: 'invalid', reason: 'not a valid URL' }; }
  if (!/^https?:$/.test(parsed.protocol)) return { kind: 'invalid', reason: `unsupported protocol "${parsed.protocol}"` };

  const isTemporary = /(^|\.)googlevideo\.com$/i.test(parsed.hostname) || parsed.searchParams.has('expire');
  if (/\.m3u8(\?|$)/i.test(parsed.pathname) || parsed.searchParams.get('m') === 'm3u8') {
    return { kind: 'hls', isTemporary };
  }
  if (/\.mp4(\?|$)/i.test(parsed.pathname)) {
    return { kind: 'mp4', isTemporary };
  }
  if (/(^|\.)googlevideo\.com$/i.test(parsed.hostname)) {
    // "mime=video%2Fmp4" (or similar) query param identifies the real
    // format on these extension-less CDN links.
    const mime = parsed.searchParams.get('mime') || '';
    if (/^video\//i.test(mime) || mime === '') {
      return { kind: 'google-cdn', isTemporary: true, mime: mime || 'video/mp4' };
    }
    return { kind: 'unsupported', isTemporary: true, reason: `googlevideo link advertises non-video mime "${mime}"` };
  }
  return { kind: 'unknown', isTemporary };
}

// Generic retry wrapper with exponential backoff for transient network
// failures (timeouts, connection resets, 5xx). 4xx errors (bad URL, 403,
// 404 — expired links) are not retried since retrying can't fix them.
async function withRetry(fn, { retries = 3, baseDelayMs = 1000, label = 'operation' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const retryable = !status || status >= 500 || ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'].includes(err.code);
      console.error(`${ANIME_LOG_PREFIX} ${label} attempt ${attempt}/${retries} failed: ${err.code || status || ''} ${err.message}`);
      if (!retryable || attempt === retries) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

const ANIME_STREAM_HEADERS = {
  'User-Agent': GOGO_UA,
  'Referer': 'https://9animetv.be/',
};

// HEAD-probe a stream URL (falling back to a ranged GET, since some CDNs
// reject HEAD) to confirm it is actually reachable and get its real
// content-type/content-length before we commit to downloading it.
async function probeStreamUrl(url) {
  return withRetry(async () => {
    try {
      const res = await axios.head(url, { headers: ANIME_STREAM_HEADERS, timeout: 15000, maxRedirects: 5 });
      return { status: res.status, contentType: res.headers['content-type'] || '', contentLength: Number(res.headers['content-length']) || null };
    } catch (err) {
      if (err.response) throw err; // real HTTP error — surface it, not retryable-network
      // Some CDNs (megacloud/googlevideo variants) reject HEAD outright — retry with a tiny ranged GET.
      const res = await axios.get(url, { headers: { ...ANIME_STREAM_HEADERS, Range: 'bytes=0-0' }, timeout: 15000, maxRedirects: 5, responseType: 'arraybuffer' });
      const total = res.headers['content-range'] ? Number(res.headers['content-range'].split('/')[1]) : (Number(res.headers['content-length']) || null);
      return { status: res.status, contentType: res.headers['content-type'] || '', contentLength: total };
    }
  }, { label: 'probe stream URL' });
}

// WhatsApp reliably rejects large inline video attachments; keep this in
// line with the cap already used for yt-dlp downloads elsewhere in this file.
const MAX_ANIME_VIDEO_BYTES = 90 * 1024 * 1024; // 90MB

// Configurable total-transfer timeout for anime downloads (not connection timeout).
// 90MB at a slow/throttled ~150KB/s takes ~10 min, so be generous.
const ANIME_DOWNLOAD_TIMEOUT_MS = parseInt(process.env.ANIME_DOWNLOAD_TIMEOUT_MS || '') || 10 * 60 * 1000;

function formatBytes(n) {
  if (!n) return 'unknown size';
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// Stream a remote video URL to a local temp file, self-resuming on connection
// drops using HTTP Range requests (bytes=N-) so an 80%-complete download picks
// up from byte 80% rather than restarting from zero.
//
// Behaviour:
//  - Up to 4 attempts; each retry checks existing file size and sends Range
//  - Server that ignores Range gets a clean restart (flag: 'w' not 'a')
//  - Content-Type verified on first response; Content-Length verified at end
//    with 2% tolerance (some CDNs round-trip slightly different values)
//  - Progress callback fired every 10% (non-blocking, fire-and-forget)
//  - Hard size cap enforced while streaming
//  - Per-attempt stall timeout; resets across retry attempts
//
// Returns { downloaded, contentType, contentLength } on success.
// Throws with a user-facing reason on every failure path.
async function downloadStreamToFile(url, destPath, {
  onProgress,
  timeoutMs  = ANIME_DOWNLOAD_TIMEOUT_MS,
  maxBytes   = MAX_ANIME_VIDEO_BYTES,
  label      = 'download',
} = {}) {
  const MAX_ATTEMPTS = 4;
  let totalOnDisk  = 0;  // bytes successfully on disk so far (grows across retries)
  let contentLength = null;
  let contentType   = '';
  let lastStep      = -1; // last 10%-step sent to onProgress (persists across retries)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // ── Determine resume offset ──────────────────────────────────────────────
    let resumeFrom = 0;
    if (attempt > 1 && fs.existsSync(destPath)) {
      try { resumeFrom = fs.statSync(destPath).size; } catch (_) {}
    }
    totalOnDisk = resumeFrom;

    const reqHeaders = { ...ANIME_STREAM_HEADERS };
    if (resumeFrom > 0) {
      reqHeaders['Range'] = `bytes=${resumeFrom}-`;
      console.log(`${ANIME_LOG_PREFIX} [${label}] resume from ${formatBytes(resumeFrom)} (attempt ${attempt}/${MAX_ATTEMPTS})`);
    } else if (attempt > 1) {
      console.log(`${ANIME_LOG_PREFIX} [${label}] retry from scratch (attempt ${attempt}/${MAX_ATTEMPTS})`);
    }

    // ── Open HTTP connection ─────────────────────────────────────────────────
    let response;
    try {
      response = await axios({
        method: 'GET',
        url,
        headers: reqHeaders,
        responseType: 'stream',
        maxRedirects: 10,
        timeout: 30000, // connection/headers only; transfer guarded by stall timer
      });
    } catch (err) {
      const status = err.response?.status;
      if (status >= 400 && status < 500) {
        throw new Error(`HTTP ${status} — video link expired or unavailable`);
      }
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Could not connect after ${MAX_ATTEMPTS} attempts: ${err.message}`);
      }
      console.warn(`${ANIME_LOG_PREFIX} [${label}] connect error (attempt ${attempt}): ${err.message}`);
      await new Promise(r => setTimeout(r, 3000 * attempt));
      continue;
    }

    // Log redirect
    const finalUrl = response.request?.res?.responseUrl || url;
    if (finalUrl !== url) console.log(`${ANIME_LOG_PREFIX} [${label}] redirect → ${finalUrl}`);

    const isPartial = response.status === 206;

    // ── Capture metadata from first successful response ──────────────────────
    if (contentLength === null) {
      contentType = response.headers['content-type'] || '';
      if (contentType && !/^video\/|^application\/octet-stream/i.test(contentType)) {
        response.data.destroy();
        throw new Error(`Server returned unexpected content-type: "${contentType}" — not a video`);
      }
      if (isPartial) {
        const cr = response.headers['content-range'] || '';
        contentLength = Number(cr.split('/')[1]) || null;
      } else {
        contentLength = Number(response.headers['content-length']) || null;
      }
      if (contentLength && contentLength > maxBytes) {
        response.data.destroy();
        throw new Error(`File too large: ${formatBytes(contentLength)} exceeds ${formatBytes(maxBytes)} limit`);
      }
      console.log(`${ANIME_LOG_PREFIX} [${label}] download started — ${formatBytes(contentLength)}, type: ${contentType || 'unknown'}`);
    }

    // Server ignored Range header — restart from 0
    if (resumeFrom > 0 && !isPartial) {
      console.warn(`${ANIME_LOG_PREFIX} [${label}] server rejected Range — restarting from byte 0`);
      resumeFrom   = 0;
      totalOnDisk  = 0;
    }

    // ── Stream to file ───────────────────────────────────────────────────────
    const writeStream = fs.createWriteStream(destPath, { flags: resumeFrom > 0 ? 'a' : 'w' });

    const { ok, chunkBytes, failErr } = await new Promise(resolve => {
      let chunkBytes = 0;
      let settled    = false;

      function done(ok, failErr) {
        if (settled) return;
        settled = true;
        clearTimeout(stall);
        if (!ok) {
          try { response.data.destroy(); } catch (_) {}
          try { writeStream.destroy(); }  catch (_) {}
        }
        resolve({ ok, chunkBytes, failErr });
      }

      // Stall timer: kill this attempt if no progress for the full timeout.
      // It's reset-able but a simple one-shot is enough — if the connection
      // is truly stalled for 10 minutes we want to abort and retry anyway.
      const stall = setTimeout(() => {
        done(false, new Error(
          `Transfer stalled — received ${formatBytes(totalOnDisk + chunkBytes)} ` +
          `of ${formatBytes(contentLength)} after ${Math.round(timeoutMs / 1000)}s`
        ));
      }, timeoutMs);

      response.data.on('data', chunk => {
        chunkBytes += chunk.length;
        const allBytes = totalOnDisk + chunkBytes;
        if (allBytes > maxBytes) {
          done(false, new Error(`Exceeded ${formatBytes(maxBytes)} size limit`));
          return;
        }
        if (onProgress && contentLength) {
          const pct  = Math.floor((allBytes / contentLength) * 100);
          const step = Math.floor(pct / 10) * 10;
          if (step > lastStep && step <= 100) {
            lastStep = step;
            // Fire-and-forget — never block the stream on a WhatsApp send
            Promise.resolve(onProgress(step, allBytes, contentLength)).catch(() => {});
          }
        }
      });

      response.data.on('error', err => done(false, Object.assign(new Error(`Stream error: ${err.message}`), { retryable: true })));
      writeStream.on('error',   err => done(false, Object.assign(new Error(`Write error: ${err.message}`),  { retryable: false })));

      writeStream.on('finish', () => {
        console.log(`${ANIME_LOG_PREFIX} [${label}] chunk done — wrote ${formatBytes(chunkBytes)} (total on disk: ${formatBytes(totalOnDisk + chunkBytes)})`);
        done(true);
      });

      response.data.pipe(writeStream);
    });

    totalOnDisk += chunkBytes;

    if (ok) {
      // Verify final size — allow 2% tolerance (CDNs sometimes round Content-Length)
      const tolerance = contentLength
        ? Math.max(Math.ceil(contentLength * 0.02), 64 * 1024)
        : Infinity;
      if (contentLength && Math.abs(totalOnDisk - contentLength) > tolerance) {
        if (attempt < MAX_ATTEMPTS) {
          console.warn(`${ANIME_LOG_PREFIX} [${label}] size mismatch — got ${formatBytes(totalOnDisk)}, expected ${formatBytes(contentLength)}; will resume`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw new Error(`Download incomplete: received ${formatBytes(totalOnDisk)}, expected ${formatBytes(contentLength)}`);
      }
      console.log(`${ANIME_LOG_PREFIX} [${label}] download completed — ${formatBytes(totalOnDisk)}`);
      return { downloaded: totalOnDisk, contentType, contentLength: contentLength || totalOnDisk };
    }

    // ── Attempt failed ───────────────────────────────────────────────────────
    if (attempt === MAX_ATTEMPTS || failErr?.retryable === false) {
      throw new Error(failErr?.message || 'Download failed');
    }
    const delay = 3000 * attempt;
    console.warn(`${ANIME_LOG_PREFIX} [${label}] attempt ${attempt} failed: ${failErr?.message} — retrying in ${delay / 1000}s (will resume from ${formatBytes(totalOnDisk)})`);
    await new Promise(r => setTimeout(r, delay));
  }

  throw new Error('Download failed after all attempts');
}

// Remux an HLS (.m3u8) stream into a single playable .mp4 file via ffmpeg.
// "-c copy" avoids re-encoding (fast, no quality loss) — it only works if
// the segments are already H.264/AAC, which is true for effectively every
// anime-mirror HLS stream; if the copy remux fails we do not attempt a slow
// full re-encode, since that would be too slow for a chat command.
async function ffmpegAvailable() {
  try { await execFileAsync('ffmpeg', ['-version']); return true; } catch { return false; }
}

async function remuxHlsToMp4(m3u8Url) {
  const outPath = tmpFile('.mp4');
  const headerArg = `Referer: ${ANIME_STREAM_HEADERS.Referer}\r\nUser-Agent: ${ANIME_STREAM_HEADERS['User-Agent']}\r\n`;
  await execFileAsync('ffmpeg', [
    '-headers', headerArg,
    '-i', m3u8Url,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', '+faststart',
    '-y', outPath,
  ], { timeout: 180000, maxBuffer: 20 * 1024 * 1024 });
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error('ffmpeg produced an empty file');
  }
  return outPath;
}

// End-to-end: classify + validate + download a resolved stream URL to a local
// temp file, or throw a precise, user-facing reason why it can't be done.
// Returns the temp file path on success — caller is responsible for deleting it.
// Never propagates the raw (often already-expired) stream URL to the caller.
//
// `onProgress(pct, downloaded, total)` — async callback fired every 10%
async function prepareAnimeVideoFile(streamUrl, { onProgress, label = 'anime' } = {}) {
  const info = classifyStreamUrl(streamUrl);
  console.log(
    `${ANIME_LOG_PREFIX} [${label}] stream classified as "${info.kind}"` +
    (info.isTemporary ? ' (temporary CDN URL — must not be forwarded to users)' : '')
  );

  if (info.kind === 'invalid')     throw new Error(`Resolved link is not usable (${info.reason}).`);
  if (info.kind === 'unsupported') throw new Error(`Resolved link is not a supported video format (${info.reason}).`);
  if (info.kind === 'unknown')     throw new Error('Resolved link is in an unrecognized format and cannot be attached safely.');

  // ── HLS (.m3u8) ── download + merge all segments into one mp4 via ffmpeg ──
  if (info.kind === 'hls') {
    if (!(await ffmpegAvailable())) {
      throw new Error('This episode is only available as HLS (.m3u8) and no ffmpeg is installed on the server to convert it.');
    }
    console.log(`${ANIME_LOG_PREFIX} [${label}] HLS detected — merging segments with ffmpeg (no re-encode)`);
    const filePath = await withRetry(
      () => remuxHlsToMp4(streamUrl),
      { retries: 2, baseDelayMs: 2000, label: 'ffmpeg HLS remux' }
    );
    const { size } = fs.statSync(filePath);
    console.log(`${ANIME_LOG_PREFIX} [${label}] ffmpeg merge complete — ${formatBytes(size)}`);
    if (size > MAX_ANIME_VIDEO_BYTES) {
      try { fs.unlinkSync(filePath); } catch (_) {}
      throw new Error(`The converted video is too large for WhatsApp (${formatBytes(size)}, limit ${formatBytes(MAX_ANIME_VIDEO_BYTES)}).`);
    }
    return filePath; // caller must delete
  }

  // ── mp4 / google-cdn ── probe → stream-download to temp file ──────────────
  const probe = await probeStreamUrl(streamUrl).catch(err => {
    throw new Error(
      `Could not verify the video link is still live ` +
      `(${err.response?.status ? `HTTP ${err.response.status}` : err.message}). ` +
      `It may have expired — try the command again.`
    );
  });
  if (probe.status >= 400) {
    throw new Error(`Video link returned HTTP ${probe.status} — it has likely expired.`);
  }
  if (probe.contentType && !/^video\/|^application\/octet-stream/i.test(probe.contentType)) {
    throw new Error(`Resolved link is not a video (content-type: ${probe.contentType}).`);
  }
  if (probe.contentLength && probe.contentLength > MAX_ANIME_VIDEO_BYTES) {
    throw new Error(
      `This episode is too large for WhatsApp ` +
      `(${formatBytes(probe.contentLength)}, limit ${formatBytes(MAX_ANIME_VIDEO_BYTES)}).`
    );
  }

  const tempPath = tmpFile('.mp4');
  console.log(
    `${ANIME_LOG_PREFIX} [${label}] download started → ${tempPath}` +
    ` (${formatBytes(probe.contentLength)}, type: ${probe.contentType || 'unknown'})`
  );

  // downloadStreamToFile handles its own retries + Range-resume internally;
  // no outer withRetry needed here.
  await downloadStreamToFile(streamUrl, tempPath, { onProgress, label });

  const { size } = fs.statSync(tempPath);
  if (size > MAX_ANIME_VIDEO_BYTES) {
    try { fs.unlinkSync(tempPath); } catch (_) {}
    throw new Error(`Downloaded video exceeds WhatsApp's size limit (${formatBytes(size)}).`);
  }

  return tempPath; // caller must delete
}

// ── Spotify oEmbed info ────────────────────────────────────────────────────
async function spotifyInfo(url) {
  const { data } = await axios.get(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
    { timeout: 10000 }
  );
  return { title: data.title, thumbnail: data.thumbnail_url };
}

// ── Generic send helpers ───────────────────────────────────────────────────

// Download video to a buffer first, then send — avoids Baileys' internal
// fetch failing on CDN URLs that have expiring signatures (e.g. TikTok).
async function sendVideoFromUrl(sock, jid, videoUrl, caption) {
  let buf;
  try {
    const { data } = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://www.tiktok.com/'
      }
    });
    buf = Buffer.from(data);
  } catch (_) {
    // Fall back to letting Baileys download if our fetch fails
    return sock.sendMessage(jid, { video: { url: videoUrl }, caption, mimetype: 'video/mp4' });
  }
  await sock.sendMessage(jid, { video: buf, caption, mimetype: 'video/mp4' });
}

async function sendAudioFromUrl(sock, jid, audioUrl, caption) {
  await sock.sendMessage(jid, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false });
  if (caption) await sock.sendMessage(jid, { text: caption });
}

async function sendAudioFromFile(sock, jid, filePath, caption) {
  const buf = fs.readFileSync(filePath);
  await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: false });
  if (caption) await sock.sendMessage(jid, { text: caption });
}

async function sendVideoFromFile(sock, jid, filePath, caption) {
  const buf = fs.readFileSync(filePath);
  await sock.sendMessage(jid, { video: buf, caption, mimetype: 'video/mp4' });
}

// ── Commands ───────────────────────────────────────────────────────────────
const downloadCommands = {

  // ── TikTok ──────────────────────────────────────────────
  tiktok: {
    category: 'downloader', reaction: '🎵', desc: 'Download TikTok video without watermark',
    usage: '.tiktok <url>', aliases: ['tt'], permissions: 'all',
    examples: ['.tiktok https://vm.tiktok.com/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !url.includes('tiktok')) {
        return sock.sendMessage(jid, { text: `⬇️ *TikTok Downloader*\n\nUsage: *.tiktok <url>*\n\nExample:\n.tiktok https://vm.tiktok.com/xxx` });
      }
      await sock.sendMessage(jid, { text: `⏳ Fetching TikTok video...` });
      try {
        const info = await tikwmFetch(url);
        await sock.sendMessage(jid, {
          image:   { url: info.cover },
          caption: `🎵 *${info.title}*\n👤 ${info.author}\n⏱️ ${info.duration}s\n\n📥 Downloading video...`
        });
        await sendVideoFromUrl(sock, jid, info.videoUrl, `🎵 *${info.title}*\n👤 ${info.author}`);
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ TikTok download failed: ${err.message}` });
      }
    }
  },

  // ── Facebook ────────────────────────────────────────────
  facebook: {
    category: 'downloader', reaction: '📘', desc: 'Download Facebook video',
    usage: '.facebook <url>', aliases: ['fb'], permissions: 'all',
    examples: ['.facebook https://fb.com/video/...'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/facebook\.com|fb\.com|fb\.watch/.test(url)) {
        return sock.sendMessage(jid, { text: `⬇️ *Facebook Downloader*\n\nUsage: *.facebook <url>*` });
      }
      await sock.sendMessage(jid, { text: `⏳ Fetching Facebook video...` });
      try {
        const dlUrl = await cobaltFetch(url, 'auto');
        if (!dlUrl) throw new Error('No download link returned');
        await sendVideoFromUrl(sock, jid, dlUrl, `📘 *Facebook Video*`);
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Facebook download failed: ${err.message}\n\n_Try a direct video URL (right-click → copy video URL)._` });
      }
    }
  },

  fb: {
    category: 'downloader', desc: 'Download Facebook video (alias)',
    usage: '.fb <url>', aliases: ['facebook'], permissions: 'all',
    examples: ['.fb https://fb.com/video/...'],
    exec: async (args, sock, jid) => {
      // Reuse facebook exec
      return downloadCommands.facebook.exec(args, sock, jid);
    }
  },

  // ── Instagram ────────────────────────────────────────────
  instagram: {
    category: 'downloader', reaction: '📸', desc: 'Download Instagram photo or video',
    usage: '.instagram <url>', aliases: ['ig', 'igdl'], permissions: 'all',
    examples: ['.instagram https://www.instagram.com/p/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/instagram\.com|instagr\.am/.test(url)) {
        return sock.sendMessage(jid, { text: `⬇️ *Instagram Downloader*\n\nUsage: *.instagram <url>*\n\nWorks with posts, reels, and stories.` });
      }
      await sock.sendMessage(jid, { text: `⏳ Fetching Instagram media...` });
      try {
        const dlUrl = await cobaltFetch(url, 'auto');
        if (!dlUrl) throw new Error('No download link returned');
        // Try as video first, fall back to image
        try {
          await sendVideoFromUrl(sock, jid, dlUrl, `📸 *Instagram Media*`);
        } catch {
          await sock.sendMessage(jid, { image: { url: dlUrl }, caption: `📸 *Instagram Photo*` });
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Instagram download failed: ${err.message}` });
      }
    }
  },

  igdl: {
    category: 'downloader', desc: 'Download Instagram (alias)',
    usage: '.igdl <url>', aliases: ['instagram'], permissions: 'all',
    examples: ['.igdl https://www.instagram.com/p/xxx'],
    exec: async (args, sock, jid) => downloadCommands.instagram.exec(args, sock, jid)
  },

  // ── Twitter / X ──────────────────────────────────────────
  twitter: {
    category: 'downloader', reaction: '🐦', desc: 'Download Twitter / X video',
    usage: '.twitter <url>', aliases: ['x', 'xvideo'], permissions: 'all',
    examples: ['.twitter https://twitter.com/user/status/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/twitter\.com|x\.com|t\.co/.test(url)) {
        return sock.sendMessage(jid, { text: `⬇️ *Twitter/X Downloader*\n\nUsage: *.twitter <url>*` });
      }
      await sock.sendMessage(jid, { text: `⏳ Fetching Twitter/X video...` });
      try {
        const dlUrl = await cobaltFetch(url, 'auto');
        if (!dlUrl) throw new Error('No download link returned');
        await sendVideoFromUrl(sock, jid, dlUrl, `🐦 *Twitter/X Video*`);
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Twitter download failed: ${err.message}` });
      }
    }
  },

  // ── YouTube MP3 ──────────────────────────────────────────
  ytmp3: {
    category: 'downloader', reaction: '🎵', desc: 'Download YouTube audio (MP3)',
    usage: '.ytmp3 <url>', aliases: [], permissions: 'all',
    examples: ['.ytmp3 https://youtu.be/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/youtube\.com|youtu\.be/.test(url)) {
        return sock.sendMessage(jid, { text: `🎵 *YouTube MP3 Downloader*\n\nUsage: *.ytmp3 <url>*` });
      }
      await sock.sendMessage(jid, { text: `⏳ Downloading YouTube audio...` });
      try {
        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(url, 'audio');
            await sendAudioFromFile(sock, jid, filePath, `🎵 *YouTube Audio*\n🔗 ${url}`);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          // Fallback: cobalt audio
          const dlUrl = await cobaltFetch(url, 'audio', 'mp3');
          if (!dlUrl) throw new Error('No audio link returned');
          await sendAudioFromUrl(sock, jid, dlUrl, `🎵 *YouTube Audio*\n🔗 ${url}`);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Audio download failed: ${err.message}\n\n💡 Install yt-dlp on your server for best results:\n\`sudo pip install yt-dlp\`` });
      }
    }
  },

  // ── YouTube MP4 ──────────────────────────────────────────
  ytmp4: {
    category: 'downloader', reaction: '🎬', desc: 'Download YouTube video (MP4)',
    usage: '.ytmp4 <url>', aliases: [], permissions: 'all',
    examples: ['.ytmp4 https://youtu.be/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/youtube\.com|youtu\.be/.test(url)) {
        return sock.sendMessage(jid, { text: `🎬 *YouTube MP4 Downloader*\n\nUsage: *.ytmp4 <url>*` });
      }
      await sock.sendMessage(jid, { text: `⏳ Downloading YouTube video (up to 720p)...` });
      try {
        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(url, 'video', '720');
            await sendVideoFromFile(sock, jid, filePath, `🎬 *YouTube Video*\n🔗 ${url}`);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          const dlUrl = await cobaltFetch(url, 'auto');
          if (!dlUrl) throw new Error('No video link returned');
          await sendVideoFromUrl(sock, jid, dlUrl, `🎬 *YouTube Video*\n🔗 ${url}`);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Video download failed: ${err.message}\n\n💡 Install yt-dlp on your server:\n\`sudo pip install yt-dlp\`` });
      }
    }
  },

  yt: {
    category: 'downloader', desc: 'Download YouTube video',
    usage: '.yt <url>', aliases: [], permissions: 'all',
    examples: ['.yt https://youtu.be/xxx'],
    exec: async (args, sock, jid) => downloadCommands.ytmp4.exec(args, sock, jid)
  },

  // ── Song search (query → YouTube audio) ─────────────────
  song: {
    category: 'downloader', reaction: '🎵', desc: 'Search and download a song by name',
    usage: '.song <song name>', aliases: [], permissions: 'all',
    examples: ['.song Blinding Lights', '.song Bohemian Rhapsody'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: `❌ Usage: .song <song name>` });
      await sock.sendMessage(jid, { text: `🎵 Searching: _"${q}"_...` });
      try {
        // Get first YouTube result via Invidious (open-source YouTube frontend)
        const { data } = await axios.get(
          `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title,author,lengthSeconds`,
          { timeout: 15000 }
        );
        if (!data?.length) throw new Error('No results found');
        const video   = data[0];
        const ytUrl   = `https://youtu.be/${video.videoId}`;
        const caption = `🎵 *${video.title}*\n👤 ${video.author}\n⏱️ ${Math.floor(video.lengthSeconds / 60)}:${String(video.lengthSeconds % 60).padStart(2, '0')}`;
        await sock.sendMessage(jid, { text: `${caption}\n\n⏳ Downloading...` });

        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(ytUrl, 'audio');
            await sendAudioFromFile(sock, jid, filePath, caption);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          const dlUrl = await cobaltFetch(ytUrl, 'audio', 'mp3');
          await sendAudioFromUrl(sock, jid, dlUrl, caption);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Song download failed: ${err.message}` });
      }
    }
  },

  play: {
    category: 'downloader', reaction: '🎵', desc: 'Search YouTube and play music',
    usage: '.play <song name>', aliases: [], permissions: 'all',
    examples: ['.play Shape of You', '.play Despacito'],
    exec: async (args, sock, jid) => downloadCommands.song.exec(args, sock, jid)
  },

  // ── Video search (query → YouTube video) ─────────────────
  video: {
    category: 'downloader', reaction: '🎬', desc: 'Search and download a video by name',
    usage: '.video <title>', aliases: [], permissions: 'all',
    examples: ['.video funny cats compilation'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: `❌ Usage: .video <title>` });
      await sock.sendMessage(jid, { text: `🎬 Searching: _"${q}"_...` });
      try {
        const { data } = await axios.get(
          `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title,author,lengthSeconds`,
          { timeout: 15000 }
        );
        if (!data?.length) throw new Error('No results found');
        const video   = data[0];
        const ytUrl   = `https://youtu.be/${video.videoId}`;
        const caption = `🎬 *${video.title}*\n👤 ${video.author}`;
        await sock.sendMessage(jid, { text: `${caption}\n\n⏳ Downloading...` });

        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(ytUrl, 'video', '480');
            await sendVideoFromFile(sock, jid, filePath, caption);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          const dlUrl = await cobaltFetch(ytUrl, 'auto');
          await sendVideoFromUrl(sock, jid, dlUrl, caption);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Video download failed: ${err.message}` });
      }
    }
  },

  // ── Spotify ────────────────────────────────────────────────
  spotify: {
    category: 'downloader', reaction: '🎧', desc: 'Get Spotify track info and download audio',
    usage: '.spotify <url or song name>', aliases: [], permissions: 'all',
    examples: ['.spotify https://open.spotify.com/track/xxx', '.spotify Blinding Lights The Weeknd'],
    exec: async (args, sock, jid) => {
      const input = args.join(' ').trim();
      if (!input) return sock.sendMessage(jid, { text: `❌ Usage: .spotify <url or song name>` });
      await sock.sendMessage(jid, { text: `🎧 Processing Spotify request...` });
      try {
        let title, thumbnail;
        if (input.includes('spotify.com')) {
          const info = await spotifyInfo(input);
          title     = info.title;
          thumbnail = info.thumbnail;
        } else {
          title = input;
        }
        await sock.sendMessage(jid, { text: `🎧 Found: *${title}*\n\n⏳ Downloading via YouTube...` });
        // Search YouTube for the track and download
        const { data } = await axios.get(
          `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(title)}&type=video&fields=videoId,title,author`,
          { timeout: 15000 }
        );
        if (!data?.length) throw new Error('Track not found on YouTube');
        const ytUrl = `https://youtu.be/${data[0].videoId}`;
        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(ytUrl, 'audio');
            await sendAudioFromFile(sock, jid, filePath, `🎧 *${title}*`);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          const dlUrl = await cobaltFetch(ytUrl, 'audio', 'mp3');
          await sendAudioFromUrl(sock, jid, dlUrl, `🎧 *${title}*`);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Spotify download failed: ${err.message}` });
      }
    }
  },

  // ── Anime (GogoAnime mirror) ──────────────────────────────
  // ⚠️ Scrapes a piracy mirror (gogoanime.by) — no legal/official API exists
  // for full anime episode downloads. Expect this to break if the site changes.
  animedl: {
    category: 'downloader', reaction: '🎌', desc: 'Download a full anime episode (via GogoAnime)',
    usage: '.animedl <anime title> | <episode number>', aliases: ['anime', 'animedownload'], permissions: 'all',
    examples: ['.animedl Demon Slayer | 1', '.animedl Naruto Shippuuden | 1'],
    exec: async (args, sock, jid) => {
      const raw = args.join(' ').trim();
      if (!raw || !raw.includes('|')) {
        return sock.sendMessage(jid, {
          text: `🎌 *Anime Downloader*\n\nUsage: *.animedl <anime title> | <episode number>*\n\nExample:\n.animedl Demon Slayer | 1\n\n_Movies: use episode 1._`
        });
      }
      const [titlePart, epPart] = raw.split('|').map(s => s.trim());
      const episodeNum = parseInt(epPart, 10);
      if (!titlePart || !episodeNum || episodeNum < 1) {
        return sock.sendMessage(jid, { text: `❌ Usage: .animedl <anime title> | <episode number>` });
      }

      await sock.sendMessage(jid, { text: `🎌 Searching *${titlePart}* — Episode ${episodeNum}...` });

      // tempFile must be cleaned up in finally regardless of success or failure
      let tempFile = null;
      try {
        // ── Step 1: resolve series → episode page → stream URL ──────────────
        const result = await gogoDownloadEpisode(titlePart, episodeNum);
        const episodeLabel = `${result.title} ep${result.episodeNum}`;
        const caption = `🎌 *${result.title}*\n📺 Episode ${result.episodeNum}\n\n_Source: gogoanime mirror — unofficial._`;

        console.log(`${ANIME_LOG_PREFIX} resolved "${episodeLabel}"`);
        await sock.sendMessage(jid, {
          text: `✅ Found! *${result.title}* — Episode ${result.episodeNum}\n\n⏳ Starting download...`
        });

        // ── Step 2: download to local temp file with progress ────────────────
        if (result.localFile) {
          // yt-dlp fallback already saved the file — use it directly
          tempFile = result.localFile;
          console.log(`${ANIME_LOG_PREFIX} [${episodeLabel}] using yt-dlp fallback file: ${tempFile}`);
        } else {
          let lastReportedStep = -1;
          tempFile = await prepareAnimeVideoFile(result.streamUrl, {
            label: episodeLabel,
            onProgress: async (pct, downloaded, total) => {
              if (pct <= lastReportedStep) return;
              lastReportedStep = pct;
              console.log(
                `${ANIME_LOG_PREFIX} [${episodeLabel}] download progress` +
                ` ${pct}% (${formatBytes(downloaded)} / ${formatBytes(total)})`
              );
              await sock.sendMessage(jid, {
                text: `⏬ Downloading... ${pct}% — ${formatBytes(downloaded)} / ${formatBytes(total)}`
              });
            },
          });
        }

        // ── Step 3: upload to WhatsApp via ReadStream (not buffer) ───────────
        const { size } = fs.statSync(tempFile);
        console.log(`${ANIME_LOG_PREFIX} [${episodeLabel}] upload started — ${formatBytes(size)}`);
        await sock.sendMessage(jid, {
          text: `📤 Uploading to WhatsApp (${formatBytes(size)})...`
        });

        await withRetry(
          () => sock.sendMessage(jid, {
            video: fs.createReadStream(tempFile),
            caption,
            mimetype: 'video/mp4',
          }),
          { retries: 3, baseDelayMs: 2000, label: `Baileys upload ${episodeLabel}` }
        );

        console.log(`${ANIME_LOG_PREFIX} [${episodeLabel}] upload completed`);

      } catch (err) {
        console.error(`${ANIME_LOG_PREFIX} failed for "${titlePart}" ep${episodeNum}:`, err.message);
        await sock.sendMessage(jid, {
          text: `❌ Anime download failed: ${err.message}`
        });
      } finally {
        // ── Step 4: delete temp file unconditionally ─────────────────────────
        if (tempFile) {
          try {
            fs.unlinkSync(tempFile);
            console.log(`${ANIME_LOG_PREFIX} cleanup completed — ${tempFile}`);
          } catch (cleanErr) {
            console.warn(`${ANIME_LOG_PREFIX} cleanup failed for ${tempFile}: ${cleanErr.message}`);
          }
        }
      }
    }
  },

  // ── MediaFire ─────────────────────────────────────────────
  mediafire: {
    category: 'downloader', reaction: '📁', desc: 'Download file from MediaFire',
    usage: '.mediafire <url>', aliases: ['mf'], permissions: 'all',
    examples: ['.mediafire https://www.mediafire.com/file/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !url.includes('mediafire.com')) {
        return sock.sendMessage(jid, { text: `📁 *MediaFire Downloader*\n\nUsage: *.mediafire <url>*` });
      }
      await sock.sendMessage(jid, { text: `📁 Extracting MediaFire download link...` });
      try {
        const dlUrl = await mediaFireDl(url);
        const filename = decodeURIComponent(dlUrl.split('/').pop().split('?')[0]);
        await sock.sendMessage(jid, {
          text:
            `📁 *MediaFire Download Ready*\n\n` +
            `📎 *File:* ${filename}\n\n` +
            `🔗 *Direct Link:*\n${dlUrl}\n\n` +
            `_Click the link to download directly._`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ MediaFire failed: ${err.message}` });
      }
    }
  }
};

module.exports = downloadCommands;
if (process.env.ANIMEDL_TEST_INTERNALS) {
  module.exports._internals = { gogoDownloadEpisode, classifyStreamUrl, probeStreamUrl, downloadStreamToFile, prepareAnimeVideoFile };
}
