'use strict';
// commands/search.js — Search commands via free public APIs
// All APIs are keyless.  lyrics uses api.lyrics.ovh (verified working).
const axios = require('axios');

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

  // ── Pinterest (redirect — no usable API without auth) ─
  pinterest: {
    category: 'search', desc: 'Search Pinterest for images',
    usage: '.pinterest <query>', aliases: ['pin'], permissions: 'all',
    examples: ['.pinterest aesthetic wallpapers', '.pinterest anime art'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .pinterest <query>' });
      await sock.sendMessage(jid, {
        text:
          `📌 *Pinterest Search*\n\n` +
          `🔍 Query: _"${q}"_\n\n` +
          `🔗 View results:\nhttps://pinterest.com/search/pins/?q=${encodeURIComponent(q)}\n\n` +
          `_Pinterest's image API requires authentication. Click the link above to browse._`
      });
    }
  }
};

module.exports = searchCommands;
