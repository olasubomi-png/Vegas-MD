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

// Search gogoanime.by and return the best-matching series page slug + title.
//
// The site's default WordPress search (the HTML "?s=" page) only surfaces
// its first ~10 relevance-ranked hits, and for long-running series (One
// Piece, Naruto, etc.) that page is dominated by side-stories/recaps/specials
// sharing the same words — the actual main series often doesn't make that
// cut. The wp-json REST search endpoint returns up to 50 results, letting us
// score for the best title match ourselves instead of trusting WP's ranking.
async function gogoSearchSeries(query) {
  const { data } = await axios.get(`${GOGO_BASE}/wp-json/wp/v2/search`, {
    params: { search: query, per_page: 50 },
    headers: { 'User-Agent': GOGO_UA },
    timeout: 20000
  });
  if (!Array.isArray(data) || !data.length) return null;

  const candidates = data
    .map(item => {
      const m = /\/series\/([^/]+)\/?$/.exec(item.url || '');
      return m ? { slug: decodeURIComponent(m[1]), title: decodeHtmlEntities(item.title || '') } : null;
    })
    .filter(Boolean);
  if (!candidates.length) return null;

  const nq = normalizeTitle(query);
  const scored = candidates.map(c => {
    const nt = normalizeTitle(c.title);
    let score;
    if (nt === nq) score = 0;                          // exact title match
    else if (nt.startsWith(nq + ' ') || nt === nq) score = 1;
    else if (nt.startsWith(nq)) score = 2;
    else if (nt.includes(' ' + nq + ' ') || nt.includes(nq)) score = 3;
    else score = 4;
    return { ...c, score, len: nt.length };
  });
  scored.sort((a, b) => a.score - b.score || a.len - b.len);
  return scored[0];
}

// Given a series slug + episode number, find the actual episode page URL.
async function gogoFindEpisodeUrl(slug, episodeNum) {
  const html = await gogoGet(`${GOGO_BASE}/series/${slug}/`);
  const re = new RegExp(
    `href="(https:\\/\\/gogoanime\\.by\\/[a-z0-9-]*episode-${episodeNum}-[a-z-]*\\/?)"[^>]*>\\s*Episode\\s+${episodeNum}\\s*<`,
    'i'
  );
  const m = html.match(re);
  if (m) return m[1];
  // Fallback: some entries omit the trailing "-subbed/-dubbed" text in the href capture above
  const re2 = new RegExp(`href="(https:\\/\\/gogoanime\\.by\\/${slug}-episode-${episodeNum}-[a-z]+-[a-z]+)\\/?"`, 'i');
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
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
// regardless of attribute order in the markup.
function gogoParseServerBlocks(html) {
  const blocks = html.split(/<li class='player-type-link/).slice(1);
  return blocks.map(block => {
    const attr = name => {
      const m = block.match(new RegExp(`data-${name}='([^']*)'`));
      return m ? m[1] : '';
    };
    return {
      type: attr('type'),
      enc1: attr('encrypted-url1'),
      enc2: attr('encrypted-url2'),
      enc3: attr('encrypted-url3'),
      plainUrl: attr('plain-url'),
    };
  }).filter(b => b.type);
}

// Some server types (e.g. "Blogger") aren't a plain URL — the page's own
// client-side JS resolves them via an AJAX call to 9animetv.be's player.php,
// which forwards the encrypted blob and returns an iframe. That iframe
// sometimes points at a working resolver ("n-bg/player.php", which returns a
// real googlevideo.com direct link) and sometimes at "histream/play.php",
// which is broken on the provider's own server (always 500s, even on
// garbage input) — those are skipped rather than retried.
async function gogoResolveAjaxServer(server, featureImage, postId) {
  const params = {
    [server.type]: server.enc1,
    url2: server.enc2,
    url3: server.enc3,
    feature_image: featureImage,
    user_agent: GOGO_UA,
    ref: 'gogoanime.by',
    postId,
  };
  const { data: playerHtml } = await axios.get(
    'https://9animetv.be/wp-content/plugins/video-player/includes/player/player.php',
    { params, timeout: 20000, headers: { Referer: `${GOGO_BASE}/` } }
  );
  const iframeMatch = (playerHtml + '').match(/<iframe src="([^"]+)"/);
  if (!iframeMatch) return null;
  let iframeSrc = iframeMatch[1].replace(/&amp;/g, '&');
  if (iframeSrc.startsWith('/')) iframeSrc = 'https://9animetv.be' + iframeSrc; // some resolvers (e.g. gogo-stream) return a relative path
  if (iframeSrc.includes('/histream/')) return null; // known-broken resolver
  const { data: resolvedHtml } = await axios.get(iframeSrc, {
    timeout: 20000, headers: { Referer: 'https://9animetv.be/', 'User-Agent': GOGO_UA }
  });
  const html = resolvedHtml + '';
  if (/no available video source/i.test(html)) return null; // resolver has nothing for this episode
  return extractPlayableUrlFromHtml(html);
}

// Try every server listed on an episode page until one yields a real
// direct video URL. Fast path first (embed/kiwi ship a plain iframe URL
// that resolves in one hop); AJAX-based servers (e.g. Blogger) are tried
// after, since they cost an extra network round-trip per attempt.
async function gogoResolvePlayableUrl(episodePageUrl) {
  const html = await gogoGet(episodePageUrl);
  const servers = gogoParseServerBlocks(html);

  const direct = servers.filter(s => (s.type === 'embed' || s.type === 'kiwi') && s.plainUrl);
  for (const s of direct) {
    const streamUrl = await gogoExtractStreamUrl(s.plainUrl).catch(() => null);
    if (streamUrl) return streamUrl;
  }

  const featureMatch = html.match(/loadPlayer\(\s*type,\s*enc1,\s*enc2,\s*enc3,\s*"([^"]+)"/);
  const postIdMatch = html.match(/"(\d+)",\s*plainUrl\s*\)/);
  if (!featureMatch || !postIdMatch) return null;
  const featureImage = featureMatch[1];
  const postId = postIdMatch[1];

  const ajaxServers = servers.filter(s => s.type !== 'embed' && s.type !== 'kiwi' && s.enc1);
  for (const s of ajaxServers) {
    const streamUrl = await gogoResolveAjaxServer(s, featureImage, postId).catch(() => null);
    if (streamUrl) return streamUrl;
  }
  return null;
}

// Full pipeline: title + episode number → direct video URL + metadata.
async function gogoDownloadEpisode(title, episodeNum) {
  const series = await gogoSearchSeries(title);
  if (!series) throw new Error(`No anime found matching "${title}"`);
  const episodeUrl = await gogoFindEpisodeUrl(series.slug, episodeNum);
  if (!episodeUrl) throw new Error(`Episode ${episodeNum} not found for "${series.title}"`);
  const streamUrl = await gogoResolvePlayableUrl(episodeUrl);
  if (!streamUrl) {
    const err = new Error(`No auto-downloadable server for this episode. Watch it manually: ${episodeUrl}`);
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

function formatBytes(n) {
  if (!n) return 'unknown size';
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// Download a direct (mp4 or google-cdn) URL into a buffer with retry/backoff,
// then hand the raw bytes to Baileys — this avoids Baileys' own internal
// fetch, which lacks the Referer/User-Agent these CDNs require and is what
// caused the original "falls back to sending the raw link" bug.
// 90MB at even a slow/throttled ~150KB/s connection takes ~10 minutes, so
// this timeout is generous on purpose — it bounds total transfer time, not
// per-chunk stall time, and existing-attempt bytes are discarded on retry.
const ANIME_DOWNLOAD_TIMEOUT_MS = 8 * 60 * 1000;

async function downloadStreamBuffer(url) {
  const res = await withRetry(
    () => axios.get(url, { headers: ANIME_STREAM_HEADERS, timeout: ANIME_DOWNLOAD_TIMEOUT_MS, responseType: 'arraybuffer', maxContentLength: MAX_ANIME_VIDEO_BYTES + 1024 * 1024, maxBodyLength: MAX_ANIME_VIDEO_BYTES + 1024 * 1024 }),
    { retries: 3, baseDelayMs: 1500, label: 'download stream' }
  );
  return Buffer.from(res.data);
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

// End-to-end: classify + validate + fetch a resolved stream URL into
// something Baileys can send, or throw a precise, user-facing reason why it
// can't be. Never returns/propagates the raw temporary URL to the caller.
async function prepareAnimeVideoForSend(streamUrl, { onLargeFile } = {}) {
  const info = classifyStreamUrl(streamUrl);
  console.log(`${ANIME_LOG_PREFIX} classified stream URL as "${info.kind}"${info.isTemporary ? ' (temporary)' : ''}`);

  if (info.kind === 'invalid') throw new Error(`Resolved link is not usable (${info.reason}).`);
  if (info.kind === 'unsupported') throw new Error(`Resolved link is not a supported video format (${info.reason}).`);
  if (info.kind === 'unknown') throw new Error('Resolved link is in a format this bot cannot verify or attach safely.');

  if (info.kind === 'hls') {
    if (!(await ffmpegAvailable())) {
      throw new Error('This episode is only available as an HLS (.m3u8) stream, and no video converter is installed on the server to convert it — it cannot be attached.');
    }
    console.log(`${ANIME_LOG_PREFIX} remuxing HLS stream to mp4 via ffmpeg`);
    let filePath;
    try {
      filePath = await withRetry(() => remuxHlsToMp4(streamUrl), { retries: 2, baseDelayMs: 2000, label: 'ffmpeg HLS remux' });
      const { size } = fs.statSync(filePath);
      if (size > MAX_ANIME_VIDEO_BYTES) {
        throw new Error(`The converted video is too large to send over WhatsApp (${formatBytes(size)}, limit ${formatBytes(MAX_ANIME_VIDEO_BYTES)}).`);
      }
      const buffer = fs.readFileSync(filePath);
      return { buffer };
    } finally {
      if (filePath) { try { fs.unlinkSync(filePath); } catch {} }
    }
  }

  // mp4 / google-cdn: validate reachability + size before downloading fully.
  const probe = await probeStreamUrl(streamUrl).catch(err => {
    throw new Error(`Could not verify the video link is still live (${err.response?.status ? `HTTP ${err.response.status}` : err.message}). It may have expired — try the command again.`);
  });
  if (probe.status >= 400) {
    throw new Error(`Video link returned HTTP ${probe.status} — it has likely expired.`);
  }
  if (probe.contentType && !/^video\/|^application\/octet-stream/i.test(probe.contentType)) {
    throw new Error(`Resolved link does not point to a video (content-type: ${probe.contentType}).`);
  }
  if (probe.contentLength && probe.contentLength > MAX_ANIME_VIDEO_BYTES) {
    throw new Error(`This episode is too large to send over WhatsApp (${formatBytes(probe.contentLength)}, limit ${formatBytes(MAX_ANIME_VIDEO_BYTES)}). Try a lower-quality server or watch it directly.`);
  }

  console.log(`${ANIME_LOG_PREFIX} downloading stream buffer (${formatBytes(probe.contentLength)}, content-type: ${probe.contentType || 'unknown'})`);
  const LARGE_FILE_NOTICE_BYTES = 30 * 1024 * 1024; // 30MB
  if (onLargeFile && probe.contentLength > LARGE_FILE_NOTICE_BYTES) await onLargeFile(probe.contentLength);
  const buffer = await downloadStreamBuffer(streamUrl);
  if (buffer.length > MAX_ANIME_VIDEO_BYTES) {
    throw new Error(`Downloaded video exceeds WhatsApp's size limit (${formatBytes(buffer.length)}).`);
  }
  return { buffer };
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
    category: 'downloader', desc: 'Download TikTok video without watermark',
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
    category: 'downloader', desc: 'Download Facebook video',
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
    category: 'downloader', desc: 'Download Instagram photo or video',
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
    category: 'downloader', desc: 'Download Twitter / X video',
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
    category: 'downloader', desc: 'Download YouTube audio (MP3)',
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
    category: 'downloader', desc: 'Download YouTube video (MP4)',
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
    category: 'downloader', desc: 'Search and download a song by name',
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
    category: 'downloader', desc: 'Search YouTube and play music',
    usage: '.play <song name>', aliases: [], permissions: 'all',
    examples: ['.play Shape of You', '.play Despacito'],
    exec: async (args, sock, jid) => downloadCommands.song.exec(args, sock, jid)
  },

  // ── Video search (query → YouTube video) ─────────────────
  video: {
    category: 'downloader', desc: 'Search and download a video by name',
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
    category: 'downloader', desc: 'Get Spotify track info and download audio',
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
    category: 'downloader', desc: 'Download a full anime episode (via GogoAnime)',
    usage: '.animedl <anime title> | <episode number>', aliases: ['anime', 'animedownload'], permissions: 'all',
    examples: ['.animedl Naruto Shippuuden | 1', '.animedl One Piece | 1085'],
    exec: async (args, sock, jid) => {
      const raw = args.join(' ').trim();
      if (!raw || !raw.includes('|')) {
        return sock.sendMessage(jid, {
          text: `🎌 *Anime Downloader*\n\nUsage: *.animedl <anime title> | <episode number>*\n\nExample:\n.animedl Naruto Shippuuden | 1\n\n_Movies: use episode 1._`
        });
      }
      const [titlePart, epPart] = raw.split('|').map(s => s.trim());
      const episodeNum = parseInt(epPart, 10);
      if (!titlePart || !episodeNum || episodeNum < 1) {
        return sock.sendMessage(jid, { text: `❌ Usage: .animedl <anime title> | <episode number>` });
      }
      await sock.sendMessage(jid, { text: `🎌 Searching *${titlePart}* — Episode ${episodeNum}...` });
      try {
        const result = await gogoDownloadEpisode(titlePart, episodeNum);
        const caption = `🎌 *${result.title}*\n📺 Episode ${result.episodeNum}\n\n_Source: gogoanime mirror — unofficial._`;
        console.log(`${ANIME_LOG_PREFIX} resolved "${result.title}" ep ${result.episodeNum} -> ${result.streamUrl}`);
        await sock.sendMessage(jid, { text: `✅ Found! Preparing video...\n\n${caption}` });

        try {
          const { buffer } = await prepareAnimeVideoForSend(result.streamUrl, {
            onLargeFile: async (bytes) => {
              await sock.sendMessage(jid, { text: `⏳ This episode is ${formatBytes(bytes)} — downloading may take a few minutes, please wait...` });
            }
          });
          await withRetry(
            () => sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' }),
            { retries: 3, baseDelayMs: 1500, label: 'Baileys sendMessage(video)' }
          );
          console.log(`${ANIME_LOG_PREFIX} sent ${result.title} ep ${result.episodeNum} (${formatBytes(buffer.length)})`);
        } catch (sendErr) {
          // Log the exact Baileys/pipeline error for diagnosis, but never
          // forward the raw (often already-expired) stream URL to the user.
          console.error(`${ANIME_LOG_PREFIX} failed to attach video for "${result.title}" ep ${result.episodeNum}:`, sendErr);
          await sock.sendMessage(jid, {
            text: `⚠️ *${result.title}* — Episode ${result.episodeNum} was found, but the video could not be attached.\n\n` +
                  `Reason: ${sendErr.message}\n\n` +
                  `_This is usually a source-side issue (expired/blocked link or unsupported format), not something a retry of the same command will fix immediately. You can try again in a moment, or try a different episode._`
          });
        }
      } catch (err) {
        console.error(`${ANIME_LOG_PREFIX} lookup failed for "${titlePart}" ep ${episodeNum}:`, err);
        await sock.sendMessage(jid, { text: `❌ Anime download failed: ${err.message}` });
      }
    }
  },

  // ── MediaFire ─────────────────────────────────────────────
  mediafire: {
    category: 'downloader', desc: 'Download file from MediaFire',
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
  module.exports._internals = { gogoDownloadEpisode, classifyStreamUrl, probeStreamUrl, downloadStreamBuffer, prepareAnimeVideoForSend };
}
