'use strict';
// commands/search.js — Search commands via free public APIs
// All APIs are keyless.  lyrics uses api.lyrics.ovh (verified working).
const axios = require('axios');
const {
  MAX_IMAGE_BYTES,
  downloadMedia,
  requestJson,
  unwrapResult,
} = require('../lib/david-cyril-api');

async function googleSearch(query) {
  // DuckDuckGo instant answer API — no key required
  const res = await axios.get('https://api.duckduckgo.com/', {
    params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
    timeout: 10000
  });
  const d = res.data;
  if (d.AbstractText) return `🔍 *${d.Heading}*\n\n${d.AbstractText}\n\n🔗 ${d.AbstractURL || 'N/A'}`;
  if (d.Answer)       return `🔍 *Answer*\n\n${d.Answer}`;
  return `🔍 No instant result for "*${query}*".\n\nSearch online: https://google.com/search?q=${encodeURIComponent(query)}`;
}

const PINTEREST_API_URL = process.env.PINTEREST_API_URL || 'https://apis.davidcyril.name.ng/search/pinterest';
const MAX_PINTEREST_RESULTS = 6;
const MAX_PINTEREST_IMAGE_BYTES = 8 * 1024 * 1024;

function parsePinterestRequest(args) {
  const parts = [...args];
  let count = 3;
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^\d+$/.test(last)) {
    count = Math.min(MAX_PINTEREST_RESULTS, Math.max(1, Number(last)));
    parts.pop();
  }
  const query = parts.join(' ').trim().replace(/^\$+/, '').trim();
  return { query, count };
}

function isAllowedPinterestImageUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && /(^|\.)pinimg\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function cleanPinterestText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 240);
}

function normalizePinterestResults(data, count = 3) {
  if (!data || data.success !== true || !Array.isArray(data.result)) return [];
  const seen = new Set();
  return data.result
    .map(item => ({
      uploader: cleanPinterestText(item?.uploader, 'Unknown uploader'),
      fullName: cleanPinterestText(item?.fullName),
      followers: Number.isFinite(Number(item?.followers)) ? Number(item.followers) : null,
      caption: cleanPinterestText(item?.caption),
      image: String(item?.image || '').trim(),
      source: String(item?.source || '').trim(),
    }))
    .filter(item => {
      if (!isAllowedPinterestImageUrl(item.image) || seen.has(item.image)) return false;
      seen.add(item.image);
      return true;
    })
    .slice(0, Math.min(MAX_PINTEREST_RESULTS, Math.max(1, count)));
}

async function fetchPinterestResults(query, count) {
  const { data } = await axios.get(PINTEREST_API_URL, {
    params: { text: query },
    timeout: 20_000,
    headers: {
      'User-Agent': 'Vegas-MD/3.0',
      Accept: 'application/json'
    }
  });
  return normalizePinterestResults(data, count);
}

async function downloadPinterestImage(url) {
  const { data, headers } = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    maxContentLength: MAX_PINTEREST_IMAGE_BYTES,
    maxBodyLength: MAX_PINTEREST_IMAGE_BYTES,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Vegas-MD/3.0)',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    }
  });
  const contentType = String(headers['content-type'] || '').toLowerCase();
  const buffer = Buffer.from(data);
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`Pinterest returned ${contentType} instead of an image`);
  }
  if (!buffer.length || buffer.length > MAX_PINTEREST_IMAGE_BYTES) {
    throw new Error('Pinterest image is empty or too large');
  }
  return buffer;
}

function pinterestCaption(item, index, total, query) {
  const lines = [`📌 *Pinterest ${index}/${total}*`, `🔍 _${query}_`, `👤 ${item.uploader}`];
  if (item.fullName && item.fullName.toLowerCase() !== item.uploader.toLowerCase()) lines.push(`🪪 ${item.fullName}`);
  if (item.followers !== null) lines.push(`👥 ${item.followers.toLocaleString()} followers`);
  if (item.caption) lines.push(`📝 ${item.caption}`);
  if (item.source && /^https:\/\/(www\.)?pinterest\.com\//i.test(item.source)) lines.push(`🔗 ${item.source}`);
  return lines.join('\n');
}

const MAX_VISUAL_RESULTS = 4;

function parseVisualRequest(args) {
  const parts = [...args];
  let count = 3;
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^\d+$/.test(last)) {
    count = Math.min(MAX_VISUAL_RESULTS, Math.max(1, Number(last)));
    parts.pop();
  }
  return {
    query: parts.join(' ').trim().replace(/^\$+/, '').trim(),
    count,
  };
}

function pickVisualUrl(item) {
  for (const key of ['image', 'image_url', 'imageUrl', 'thumbnail', 'thumb', 'url', 'link']) {
    if (typeof item?.[key] === 'string' && /^https:\/\//i.test(item[key])) return item[key].trim();
  }
  return null;
}

function normalizeVisualResults(payload, count = 3) {
  const result = unwrapResult(payload);
  const list = Array.isArray(result)
    ? result
    : result?.results || result?.items || result?.images || result?.data || [];
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(item => ({
      title: String(item?.title || item?.name || 'Untitled result').replace(/\s+/g, ' ').trim().slice(0, 220),
      description: String(item?.description || item?.caption || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      type: String(item?.type || item?.status || '').trim(),
      source: String(item?.source || item?.url || '').trim(),
      image: pickVisualUrl(item),
    }))
    .filter(item => item.image && !seen.has(item.image) && seen.add(item.image))
    .slice(0, Math.min(MAX_VISUAL_RESULTS, Math.max(1, count)));
}

async function sendVisualSearchResults({ endpoint, params, query, count, title, sock, jid, kind }) {
  const payload = await requestJson(endpoint, { params, timeout: 30_000 });
  const results = normalizeVisualResults(payload, count);
  if (!results.length) {
    await sock.sendMessage(jid, { text: `😔 No ${kind} images were found for *${query}*.` });
    return 0;
  }

  let sent = 0;
  for (let index = 0; index < results.length; index++) {
    const item = results[index];
    try {
      const media = await downloadMedia(item.image, { maxBytes: MAX_IMAGE_BYTES, timeout: 30_000 });
      const captionLines = [
        `${title} ${index + 1}/${results.length}`,
        `🔍 _${query}_`,
        `📝 ${item.title}`,
      ];
      if (item.type && item.type.toLowerCase() !== 'unknown type') captionLines.push(`🏷️ ${item.type}`);
      if (item.description) captionLines.push(item.description);
      if (/^https:\/\//i.test(item.source) && !/^unknown source$/i.test(item.source)) captionLines.push(`🔗 ${item.source}`);
      await sock.sendMessage(jid, { image: media.buffer, caption: captionLines.join('\n') });
      sent++;
    } catch (error) {
      console.warn(`[${kind}] result ${index + 1} failed: ${error.message}`);
    }
  }
  if (!sent) {
    await sock.sendMessage(jid, { text: `❌ ${kind} results were returned, but none could be downloaded.` });
  } else if (sent < results.length) {
    await sock.sendMessage(jid, { text: `✅ Sent ${sent}/${results.length} ${kind} image(s).` });
  }
  return sent;
}

const searchCommands = {

  // ── Google / DuckDuckGo instant answers ─────────────
  google: {
    category: 'search', desc: 'Search Google / DuckDuckGo instant answers',
    usage: '.google <query>', aliases: ['search', 'ddg'], permissions: 'all',
    examples: ['.google capital of Nigeria', '.google Node.js version'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .google <query>' });
      await sock.sendMessage(jid, { text: `🔍 Searching: _"${q}"_...` });
      try {
        await sock.sendMessage(jid, { text: await googleSearch(q) });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Search failed: ${err.message}` });
      }
    }
  },

  // ── GitHub repository search ─────────────────────────
  github: {
    category: 'search', desc: 'Search GitHub repositories',
    usage: '.github <repo or user/repo>', aliases: [], permissions: 'all',
    examples: ['.github baileys', '.github olasubomi-png/Vegas-MD'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .github <query or user/repo>' });
      await sock.sendMessage(jid, { text: `🐙 Searching GitHub: _"${q}"_...` });
      try {
        if (/^[\w.-]+\/[\w.-]+$/.test(q)) {
          const { data: r } = await axios.get(`https://api.github.com/repos/${q}`, { timeout: 10000 });
          await sock.sendMessage(jid, {
            text:
              `🐙 *${r.full_name}*\n\n` +
              `📝 ${r.description || 'No description'}\n\n` +
              `⭐ Stars    : ${r.stargazers_count.toLocaleString()}\n` +
              `🍴 Forks    : ${r.forks_count.toLocaleString()}\n` +
              `👁️  Watchers : ${r.watchers_count.toLocaleString()}\n` +
              `📦 Language : ${r.language || 'N/A'}\n` +
              `🔗 URL      : ${r.html_url}`
          });
        } else {
          const { data } = await axios.get('https://api.github.com/search/repositories', {
            params: { q, sort: 'stars', per_page: 3 },
            timeout: 10000
          });
          if (!data.items?.length) return sock.sendMessage(jid, { text: '❌ No repos found.' });
          const lines = data.items.map(r =>
            `🔹 *${r.full_name}* ⭐${r.stargazers_count.toLocaleString()}\n   ${r.description?.slice(0, 60) || '—'}\n   ${r.html_url}`
          ).join('\n\n');
          await sock.sendMessage(jid, { text: `🐙 *GitHub Results for "${q}"*\n\n${lines}` });
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ GitHub search failed: ${err.message}` });
      }
    }
  },

  // ── npm package search ───────────────────────────────
  npm: {
    category: 'search', desc: 'Search npm packages',
    usage: '.npm <package>', aliases: [], permissions: 'all',
    examples: ['.npm axios', '.npm baileys'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .npm <package name>' });
      await sock.sendMessage(jid, { text: `📦 Searching npm: _"${q}"_...` });
      try {
        const { data: pkg } = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(q)}`, { timeout: 10000 });
        const latest  = pkg['dist-tags']?.latest || '?';
        const version = pkg.versions?.[latest];
        await sock.sendMessage(jid, {
          text:
            `📦 *${pkg.name}*\n\n` +
            `📝 ${pkg.description || 'No description'}\n\n` +
            `🏷️  Version : ${latest}\n` +
            `👤 Author  : ${typeof pkg.author === 'object' ? pkg.author.name : pkg.author || 'N/A'}\n` +
            `📜 License : ${version?.license || 'N/A'}\n` +
            `🔗 npm     : https://npmjs.com/package/${pkg.name}\n` +
            `⬇️  Install : npm i ${pkg.name}`
        });
      } catch {
        await sock.sendMessage(jid, { text: `❌ Package not found: *${q}*` });
      }
    }
  },

  // ── Weather (Open-Meteo, keyless) ───────────────────
  weather: {
    category: 'search', desc: 'Get current weather for a city',
    usage: '.weather <city>', aliases: [], permissions: 'all',
    examples: ['.weather Lagos', '.weather London', '.weather New York'],
    exec: async (args, sock, jid) => {
      const city = args.join(' ').trim();
      if (!city) return sock.sendMessage(jid, { text: '❌ Usage: .weather <city>' });
      await sock.sendMessage(jid, { text: `🌤️ Fetching weather for: _${city}_...` });
      try {
        const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
          params: { name: city, count: 1 }, timeout: 8000
        });
        const loc = geo.data.results?.[0];
        if (!loc) return sock.sendMessage(jid, { text: `❌ City not found: *${city}*` });

        const wx = await axios.get('https://api.open-meteo.com/v1/forecast', {
          params: {
            latitude: loc.latitude, longitude: loc.longitude,
            current_weather: true,
            hourly: 'relativehumidity_2m',
            forecast_days: 1
          },
          timeout: 8000
        });
        const cw  = wx.data.current_weather;
        const hum = wx.data.hourly?.relativehumidity_2m?.[0] ?? '—';

        const wmoDesc = {
          0:'☀️ Clear sky', 1:'🌤 Mainly clear', 2:'⛅ Partly cloudy', 3:'☁️ Overcast',
          45:'🌫 Foggy', 51:'🌦 Light drizzle', 61:'🌧 Slight rain',
          63:'🌧 Moderate rain', 71:'🌨 Slight snow', 80:'🌦 Rain showers',
          95:'⛈ Thunderstorm'
        };
        const desc = wmoDesc[cw.weathercode] || `Code ${cw.weathercode}`;

        await sock.sendMessage(jid, {
          text:
            `🌤️ *Weather — ${loc.name}, ${loc.country}*\n\n` +
            `${desc}\n\n` +
            `🌡️  Temp      : ${cw.temperature}°C\n` +
            `💨 Wind      : ${cw.windspeed} km/h\n` +
            `💧 Humidity  : ${hum}%\n` +
            `📍 Location  : ${loc.latitude}°N, ${loc.longitude}°E`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Weather fetch failed: ${err.message}` });
      }
    }
  },

  // ── Song lyrics (api.lyrics.ovh — verified working) ──
  // Previous implementation used lyrist.vercel.app which is blocked
  // by Vercel's security checkpoint returning HTML instead of JSON.
  lyrics: {
    category: 'search', desc: 'Find song lyrics',
    usage: '.lyrics <artist> - <song>', aliases: [], permissions: 'all',
    examples: [
      '.lyrics Eminem - Lose Yourself',
      '.lyrics The Weeknd - Blinding Lights',
      '.lyrics Ed Sheeran - Shape of You'
    ],
    exec: async (args, sock, jid) => {
      const input = args.join(' ').trim();
      if (!input) {
        return sock.sendMessage(jid, {
          text: '❌ Usage: .lyrics <artist> - <song>\n\nExample: .lyrics Eminem - Lose Yourself'
        });
      }

      // Parse "Artist - Song" or fall back to treating whole input as song name
      let artist = '', title = input;
      if (input.includes(' - ')) {
        [artist, ...rest] = input.split(' - ');
        title = rest.join(' - ').trim();
        artist = artist.trim();
      }

      await sock.sendMessage(jid, { text: `🎵 Searching lyrics for: _"${input}"_...` });

      try {
        // api.lyrics.ovh requires artist + title separately
        const encArtist = encodeURIComponent(artist || title);
        const encTitle  = encodeURIComponent(artist ? title : '');

        let data, tried = false;

        // Attempt 1: artist + title (exact)
        if (artist) {
          try {
            const res = await axios.get(
              `https://api.lyrics.ovh/v1/${encArtist}/${encTitle}`,
              { timeout: 15000 }
            );
            data = res.data;
          } catch { /* fall through */ }
        }

        // Attempt 2: search endpoint (whole query as artist field)
        if (!data?.lyrics && !tried) {
          tried = true;
          const res = await axios.get(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(input)}/${encodeURIComponent('')}`,
            { timeout: 15000 }
          ).catch(() => null);
          if (res?.data?.lyrics) data = res.data;
        }

        if (!data?.lyrics) {
          return sock.sendMessage(jid, {
            text:
              `❌ Lyrics not found for *${input}*.\n\n` +
              `💡 Try the format: *.lyrics Artist - Song Title*\n` +
              `Or search on: https://genius.com/search?q=${encodeURIComponent(input)}`
          });
        }

        const snippet = data.lyrics.slice(0, 1500);
        const truncated = data.lyrics.length > 1500;

        await sock.sendMessage(jid, {
          text:
            `🎵 *Lyrics*\n\n` +
            `${snippet}` +
            `${truncated ? '\n\n_... (lyrics truncated — too long to display in full)_' : ''}`
        });
      } catch (err) {
        await sock.sendMessage(jid, {
          text:
            `❌ Lyrics search failed: ${err.message}\n\n` +
            `💡 Try: https://genius.com/search?q=${encodeURIComponent(input)}`
        });
      }
    }
  },

  // ── Movie info (OMDb free tier) ──────────────────────
  movie: {
    category: 'search', desc: 'Search for movie information',
    usage: '.movie <title>', aliases: ['film'], permissions: 'all',
    examples: ['.movie Avengers Endgame', '.movie Inception'],
    exec: async (args, sock, jid) => {
      const title = args.join(' ').trim();
      if (!title) return sock.sendMessage(jid, { text: '❌ Usage: .movie <title>' });
      await sock.sendMessage(jid, { text: `🎬 Searching movie: _"${title}"_...` });
      try {
        // Try multiple free OMDb demo keys — fall back to next if one is rate-limited
        const OMDB_KEYS = ['b9bd48a6', 'trilogy', 'thewdb', 'fa5af6ee'];
        let m, lastErr;
        for (const apikey of OMDB_KEYS) {
          try {
            const res = await axios.get('https://www.omdbapi.com/', {
              params: { t: title, apikey, type: 'movie' },
              timeout: 10000
            });
            if (res.data?.Response !== 'False') { m = res.data; break; }
            lastErr = res.data?.Error || 'Not found';
          } catch (e) { lastErr = e.message; }
        }
        if (!m) throw new Error(lastErr || 'Not found');
        await sock.sendMessage(jid, {
          text:
            `🎬 *${m.Title}* (${m.Year})\n\n` +
            `📝 ${m.Plot}\n\n` +
            `⭐ Rating  : ${m.imdbRating}/10\n` +
            `🎭 Genre   : ${m.Genre}\n` +
            `🎬 Director: ${m.Director}\n` +
            `👥 Cast    : ${m.Actors?.split(',').slice(0, 3).join(', ')}\n` +
            `⏱️  Runtime : ${m.Runtime}\n` +
            `🗣️  Language: ${m.Language}`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Movie not found: *${title}*` });
      }
    }
  },

  // ── Random dog image (dog.ceo — free, no key) ───────────
  dog: {
    category: 'search', desc: 'Fetch a random dog photo',
    usage: '.dog', aliases: ['doggo', 'woof'], permissions: 'all',
    examples: ['.dog'],
    exec: async (args, sock, jid) => {
      try {
        const { data } = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 10000 });
        if (!data?.message) throw new Error('No image returned');
        await sock.sendMessage(jid, {
          image:   { url: data.message },
          caption: '🐶 *Random Dog*\n\n_Powered by dog.ceo_'
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Could not fetch dog image: ${err.message}` });
      }
    }
  },

  // ── Random fox image (randomfox.ca — free, no key) ───────
  fox: {
    category: 'search', desc: 'Fetch a random fox photo',
    usage: '.fox', aliases: ['foxy'], permissions: 'all',
    examples: ['.fox'],
    exec: async (args, sock, jid) => {
      try {
        const { data } = await axios.get('https://randomfox.ca/floof/', { timeout: 10000 });
        if (!data?.image) throw new Error('No image returned');
        await sock.sendMessage(jid, {
          image:   { url: data.image },
          caption: '🦊 *Random Fox*\n\n_Powered by randomfox.ca_'
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Could not fetch fox image: ${err.message}` });
      }
    }
  },

  // ── Wikimedia Commons image search (free, no key) ───
  wikimedia: {
    category: 'search', desc: 'Search images on Wikimedia Commons',
    usage: '.wikimedia <query>', aliases: ['wiki'], permissions: 'all',
    examples: ['.wikimedia lion', '.wikimedia Eiffel Tower'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .wikimedia <query>' });
      await sock.sendMessage(jid, { text: `🌐 Searching Wikimedia for _"${q}"_...` });
      try {
        const { data } = await axios.get('https://commons.wikimedia.org/w/api.php', {
          params: { action: 'query', generator: 'search', gsrsearch: q, gsrlimit: 6, prop: 'imageinfo', iiprop: 'url', format: 'json' },
          timeout: 10000
        });
        const pages = data.query?.pages;
        if (!pages) return sock.sendMessage(jid, { text: `😔 No images found for "${q}".` });
        const urls = Object.values(pages).map(p => p.imageinfo?.[0]?.url).filter(Boolean).slice(0, 3);
        if (!urls.length) return sock.sendMessage(jid, { text: `😔 No images found for "${q}".` });
        for (let i = 0; i < urls.length; i++) {
          await sock.sendMessage(jid, { image: { url: urls[i] }, caption: `🌐 Wikimedia result ${i + 1} for "${q}"` });
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Wikimedia search failed: ${err.message}` });
      }
    }
  },

  // ── Anime catalog search (David Cyril API) ───────────────
  danimesearch: {
    category: 'search', desc: 'Search anime titles and send David Cyril cover images',
    usage: '.danimesearch <query> [count]', aliases: ['animefind', 'animecovers'], permissions: 'all',
    examples: ['.animesearch naruto', '.animesearch one piece 2'],
    exec: async (args, sock, jid) => {
      const { query, count } = parseVisualRequest(args);
      if (!query) return sock.sendMessage(jid, { text: '❌ Usage: .danimesearch <query> [1-4]' });
      await sock.sendMessage(jid, { text: `🎌 Searching anime for _"${query}"_...` });
      try {
        await sendVisualSearchResults({
          endpoint: '/animeindo/search',
          params: { q: query },
          query,
          count,
          title: '🎌 *Anime*',
          sock,
          jid,
          kind: 'anime',
        });
      } catch (error) {
        console.error('[danimesearch] failed:', error.message);
        await sock.sendMessage(jid, { text: `❌ Anime search is temporarily unavailable: ${error.message}` });
      }
    },
  },

  // ── Wallpaper image search (David Cyril API) ─────────────
  dwallpaper: {
    category: 'search', desc: 'Search and send David Cyril wallpaper images',
    usage: '.dwallpaper <query> [count]', aliases: ['wallsearch', 'wpsearch'], permissions: 'all',
    examples: ['.wallpaper naruto', '.wallpaper dark phone wallpaper 4'],
    exec: async (args, sock, jid) => {
      const { query, count } = parseVisualRequest(args);
      if (!query) return sock.sendMessage(jid, { text: '❌ Usage: .dwallpaper <query> [1-4]' });
      await sock.sendMessage(jid, { text: `🖼️ Searching wallpapers for _"${query}"_...` });
      try {
        await sendVisualSearchResults({
          endpoint: '/search/wallpaper',
          params: { text: query },
          query,
          count,
          title: '🖼️ *Wallpaper*',
          sock,
          jid,
          kind: 'wallpaper',
        });
      } catch (error) {
        console.error('[dwallpaper] failed:', error.message);
        await sock.sendMessage(jid, { text: `❌ Wallpaper search is temporarily unavailable: ${error.message}` });
      }
    },
  },

  // ── Pinterest image search (David Cyril API) ─────────────
  pinterest: {
    category: 'search', desc: 'Search Pinterest and send image results',
    usage: '.pinterest <query> [count]', aliases: ['pin'], permissions: 'all',
    examples: ['.pinterest aesthetic wallpapers', '.pinterest naruto 3'],
    exec: async (args, sock, jid) => {
      const { query, count } = parsePinterestRequest(args);
      if (!query) return sock.sendMessage(jid, { text: '❌ Usage: .pinterest <query> [1-6]' });

      await sock.sendMessage(jid, {
        text: `📌 *Pinterest Search*\n\n🔍 Query: _"${query}"_\n📦 Results: ${count}\n\n⏳ Fetching images...`
      });

      try {
        const results = await fetchPinterestResults(query, count);
        if (!results.length) {
          return sock.sendMessage(jid, {
            text: `😔 No safe image results were returned for *${query}*.\n\nTry a shorter or different query.`
          });
        }

        let sent = 0;
        const failures = [];
        for (let i = 0; i < results.length; i++) {
          const item = results[i];
          try {
            const image = await downloadPinterestImage(item.image);
            await sock.sendMessage(jid, {
              image,
              caption: pinterestCaption(item, i + 1, results.length, query)
            });
            sent++;
          } catch (error) {
            failures.push(`${i + 1}: ${error.message}`);
            console.warn(`[pinterest] result ${i + 1} failed: ${error.message}`);
          }
        }

        if (!sent) {
          return sock.sendMessage(jid, {
            text: '❌ Pinterest returned results, but none could be downloaded. Please try again later.'
          });
        }
        if (failures.length) {
          await sock.sendMessage(jid, { text: `✅ Sent ${sent}/${results.length} Pinterest image(s). Some results were unavailable.` });
        }
      } catch (error) {
        console.error('[pinterest] search failed:', error.message);
        await sock.sendMessage(jid, {
          text: `❌ Pinterest search is temporarily unavailable.\n\nTry again later or browse: https://pinterest.com/search/pins/?q=${encodeURIComponent(query)}`
        });
      }
    }
  }
};

module.exports = searchCommands;
if (process.env.PINTEREST_TEST_INTERNALS || process.env.VISUAL_SEARCH_TEST_INTERNALS) {
  module.exports._internals = {
    parsePinterestRequest,
    isAllowedPinterestImageUrl,
    normalizePinterestResults,
    pinterestCaption,
    parseVisualRequest,
    normalizeVisualResults,
  };
}
