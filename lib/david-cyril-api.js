'use strict';

const axios = require('axios');

// Primary + fallbacks — name.ng is often down; tech.my.id is more reliable
const DEFAULT_BASE_URLS = [
  process.env.DAVID_CYRIL_API_BASE,
  'https://apis.davidcyriltech.my.id',
  'https://apis.davidcyril.name.ng',
].filter(Boolean).map((u) => String(u).replace(/\/+$/, ''));

const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

function getBaseUrl() {
  return DEFAULT_BASE_URLS[0];
}

function getBaseUrls() {
  return [...new Set(DEFAULT_BASE_URLS)];
}

function apiError(response, fallback = 'David Cyril API request failed') {
  const message = response?.data?.message || response?.data?.error || response?.data?.result?.message;
  const error = new Error(String(message || fallback));
  error.status = response?.status;
  return error;
}

async function requestJson(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const bases = getBaseUrls();
  const errors = [];

  for (const base of bases) {
    const config = {
      method,
      url: `${base}${path.startsWith('/') ? path : `/${path}`}`,
      timeout: options.timeout || 45_000,
      headers: {
        'User-Agent': 'SUBBY-MD/3.0',
        Accept: 'application/json',
        ...(options.headers || {})
      },
      validateStatus: () => true
    };
    if (method === 'GET') config.params = options.params || {};
    else config.data = options.data || options.params || {};

    try {
      const response = await axios(config);
      const payload = response.data;
      if (response.status >= 400) {
        errors.push(`${base}: HTTP ${response.status}`);
        continue;
      }
      if (typeof payload === 'string' && payload.includes('<!DOCTYPE')) {
        errors.push(`${base}: HTML response`);
        continue;
      }
      if (payload && payload.success === false) {
        errors.push(`${base}: ${payload.message || payload.error || 'success=false'}`);
        continue;
      }
      if (payload && payload.status === false) {
        errors.push(`${base}: ${payload.message || payload.error || 'status=false'}`);
        continue;
      }
      return payload;
    } catch (error) {
      errors.push(`${base}: ${error.response?.status || error.message}`);
    }
  }
  throw new Error(errors.slice(0, 3).join(' | ') || 'David Cyril API request failed');
}

function unwrapResult(payload) {
  if (!payload) return null;
  return payload.result ?? payload.data ?? payload;
}

function collectMediaUrls(value, found = [], seen = new Set()) {
  if (value === null || value === undefined || found.length >= 20) return found;
  if (typeof value === 'string') {
    const candidate = value.trim();
    if (/^https?:\/\//i.test(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      found.push(candidate);
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMediaUrls(item, found, seen);
    return found;
  }
  if (typeof value !== 'object') return found;

  const preferredKeys = [
    'download_url', 'downloadUrl', 'audio_url', 'audioUrl', 'video_url', 'videoUrl',
    'image_url', 'imageUrl', 'media_url', 'mediaUrl', 'stream_url', 'streamUrl',
    'play_url', 'playUrl', 'url', 'link', 'audio', 'video', 'image', 'media', 'file'
  ];
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) collectMediaUrls(value[key], found, seen);
  }
  for (const [key, child] of Object.entries(value)) {
    if (!preferredKeys.includes(key) && !/^(source|thumbnail|thumb|cover|avatar)$/i.test(key)) {
      collectMediaUrls(child, found, seen);
    }
  }
  return found;
}

function firstMediaUrl(value) {
  return collectMediaUrls(value)[0] || null;
}

function findField(value, names, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return null;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findField(item, names, visited);
      if (found !== null) return found;
    }
    return null;
  }
  for (const name of names) {
    if (value[name] !== undefined && value[name] !== null && value[name] !== '') return value[name];
  }
  for (const child of Object.values(value)) {
    const found = findField(child, names, visited);
    if (found !== null) return found;
  }
  return null;
}

function isSafeRemoteUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function inferMediaType(contentType, url = '') {
  const type = String(contentType || '').toLowerCase();
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';
  if (/\.(mp3|m4a|ogg|wav|aac)(?:\?|$)/i.test(url)) return 'audio';
  if (/\.(mp4|webm|mov|mkv)(?:\?|$)/i.test(url)) return 'video';
  if (/\.(jpe?g|png|gif|webp)(?:\?|$)/i.test(url)) return 'image';
  return 'unknown';
}

async function downloadMedia(url, options = {}) {
  if (!isSafeRemoteUrl(url)) throw new Error('Provider returned an unsafe media URL');
  const maxBytes = options.maxBytes || MAX_VIDEO_BYTES;
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: options.timeout || 60_000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Vegas-MD/3.0)',
      Accept: '*/*'
    }
  });
  const buffer = Buffer.from(response.data);
  if (!buffer.length || buffer.length > maxBytes) throw new Error('Downloaded media is empty or too large');
  const contentType = String(response.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  return { buffer, contentType, type: inferMediaType(contentType, url), url };
}

async function fetchMusic(query, endpoint = 'play') {
  const payload = await requestJson(endpoint === 'song' ? '/song' : '/play', {
    params: { query },
    timeout: 60_000
  });
  const result = unwrapResult(payload);
  const downloadUrl = firstMediaUrl(result);
  if (!downloadUrl) throw new Error('Music provider returned no audio URL');
  return {
    title: String(result?.title || result?.name || query),
    artist: String(result?.artist || result?.author || result?.uploader || '').trim(),
    duration: String(result?.duration || '').trim(),
    thumbnail: firstMediaUrl({ image: result?.thumbnail || result?.thumb || result?.cover }),
    videoUrl: String(result?.video_url || result?.videoUrl || '').trim(),
    downloadUrl
  };
}

/** YouTube URL → MP3 via Cyril download endpoint */
async function fetchYoutubeMp3(ytUrl) {
  const payload = await requestJson('/download/ytmp3', {
    params: { url: ytUrl },
    timeout: 90_000
  });
  const result = unwrapResult(payload);
  const downloadUrl = firstMediaUrl(result);
  if (!downloadUrl) throw new Error('YouTube MP3 provider returned no audio URL');
  return {
    title: String(result?.title || 'YouTube Audio'),
    thumbnail: firstMediaUrl({ image: result?.thumbnail || result?.thumb }),
    quality: String(result?.quality || result?.format || 'mp3'),
    downloadUrl
  };
}

/** YouTube URL → MP4 via Cyril download endpoint */
async function fetchYoutubeMp4(ytUrl) {
  const payload = await requestJson('/download/ytmp4', {
    params: { url: ytUrl },
    timeout: 120_000
  });
  const result = unwrapResult(payload);
  const downloadUrl = firstMediaUrl(result);
  if (!downloadUrl) throw new Error('YouTube MP4 provider returned no video URL');
  return {
    title: String(result?.title || 'YouTube Video'),
    thumbnail: firstMediaUrl({ image: result?.thumbnail || result?.thumb }),
    quality: String(result?.quality || result?.format || 'mp4'),
    downloadUrl
  };
}

async function fetchPinterestDownload(pinUrl) {
  const payload = await requestJson('/download/pinterest', {
    params: { url: pinUrl },
    timeout: 60_000
  });
  const result = unwrapResult(payload);
  const mediaUrl = firstMediaUrl(result);
  if (!mediaUrl) throw new Error('Pinterest downloader returned no media URL');
  return { result, mediaUrl };
}

function extractTaskId(payload) {
  const value = findField(payload, ['task_id', 'taskId', 'job_id', 'jobId', 'song_id', 'songId', 'id']);
  return value === null ? null : String(value);
}

function isFailedStatus(payload) {
  const status = String(findField(payload, ['status', 'state']) || '').toLowerCase();
  return ['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status);
}

function isReadyStatus(payload) {
  const status = String(findField(payload, ['status', 'state']) || '').toLowerCase();
  return ['completed', 'complete', 'success', 'succeeded', 'ready', 'done', 'finished'].includes(status);
}

async function createAiMusic(payload) {
  try {
    return await requestJson('/ai/music/generate', { method: 'POST', data: payload, timeout: 60_000 });
  } catch (error) {
    if (![404, 405].includes(error.status)) throw error;
    return requestJson('/ai/music/generate', { method: 'GET', params: payload, timeout: 60_000 });
  }
}

async function getAiMusicStatus(taskId) {
  return requestJson('/ai/music/status', { params: { task_id: taskId }, timeout: 45_000 });
}

async function waitForAiMusic(taskId, options = {}) {
  const attempts = options.attempts || 30;
  const delayMs = options.delayMs || 10_000;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const payload = await getAiMusicStatus(taskId);
    const audioUrl = firstMediaUrl(unwrapResult(payload));
    if (audioUrl && (isReadyStatus(payload) || attempt > 0)) return { payload, audioUrl };
    if (isFailedStatus(payload)) throw new Error(String(findField(payload, ['message', 'error']) || 'AI music generation failed'));
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error('AI music generation timed out before an audio URL was returned');
}

module.exports = {
  fetchYoutubeMp3,
  fetchYoutubeMp4,
  DEFAULT_BASE_URL: DEFAULT_BASE_URLS[0],
  DEFAULT_BASE_URLS,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  getBaseUrl,
  getBaseUrls,
  requestJson,
  unwrapResult,
  collectMediaUrls,
  firstMediaUrl,
  findField,
  isSafeRemoteUrl,
  inferMediaType,
  downloadMedia,
  fetchMusic,
  fetchPinterestDownload,
  extractTaskId,
  isFailedStatus,
  isReadyStatus,
  createAiMusic,
  getAiMusicStatus,
  waitForAiMusic,
};
