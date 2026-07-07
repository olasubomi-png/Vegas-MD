'use strict';
// commands/search.js — Search commands via free public APIs
const axios = require('axios');

async function googleSearch(query) {
  // Uses DuckDuckGo instant answer API (no key needed)
  const res = await axios.get('https://api.duckduckgo.com/', {
    params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
    timeout: 10000
  });
  const d = res.data;
  if (d.AbstractText) return `🔍 *${d.Heading}*\n\n${d.AbstractText}\n\n🔗 ${d.AbstractURL || 'N/A'}`;
  if (d.Answer)       return `🔍 *Answer*\n\n${d.Answer}`;
  return `🔍 No instant result for "*${query}*".\n\nTry: https://google.com/search?q=${encodeURIComponent(query)}`;
}

const searchCommands = {
  google: {
    category: 'search', desc: 'Search Google / DuckDuckGo instant answers',
    usage: '.google <query>', aliases: ['search', 'ddg'], permissions: 'all',
    examples: ['.google capital of Nigeria', '.google Node.js version'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .google <query>' });
      await sock.sendMessage(jid, { text: `🔍 Searching for: _"${q}"_...` });
      try {
        const result = await googleSearch(q);
        await sock.sendMessage(jid, { text: result });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Search failed: ${err.message}` });
      }
    }
  },

  github: {
    category: 'search', desc: 'Search GitHub repositories',
    usage: '.github <repo or user/repo>', aliases: [], permissions: 'all',
    examples: ['.github baileys', '.github olasubomi-png/Vegas-MD'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .github <query or user/repo>' });
      await sock.sendMessage(jid, { text: `🐙 Searching GitHub: _"${q}"_...` });
      try {
        // If query looks like user/repo, fetch it directly
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
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Package not found: *${q}*` });
      }
    }
  },

  weather: {
    category: 'search', desc: 'Get current weather for a city',
    usage: '.weather <city>', aliases: [], permissions: 'all',
    examples: ['.weather Lagos', '.weather London', '.weather New York'],
    exec: async (args, sock, jid) => {
      const city = args.join(' ').trim();
      if (!city) return sock.sendMessage(jid, { text: '❌ Usage: .weather <city>' });
      await sock.sendMessage(jid, { text: `🌤️ Fetching weather for: _${city}_...` });
      try {
        // Open-Meteo geocoding (free, no key)
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

  lyrics: {
    category: 'search', desc: 'Find song lyrics',
    usage: '.lyrics <song name>', aliases: [], permissions: 'all',
    examples: ['.lyrics Blinding Lights', '.lyrics Shape of You by Ed Sheeran'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .lyrics <song name>' });
      await sock.sendMessage(jid, { text: `🎵 Searching lyrics for: _"${q}"_...` });
      try {
        const { data } = await axios.get(`https://lyrist.vercel.app/api/${encodeURIComponent(q)}`, { timeout: 15000 });
        if (!data?.lyrics) throw new Error('Not found');
        const snippet = data.lyrics.slice(0, 1200);
        await sock.sendMessage(jid, {
          text: `🎵 *${data.title}* — ${data.artist}\n\n${snippet}${data.lyrics.length > 1200 ? '\n\n_... (lyrics truncated)_' : ''}`
        });
      } catch {
        await sock.sendMessage(jid, {
          text: `❌ Lyrics not found for *${q}*.\n\n💡 Try: https://genius.com/search?q=${encodeURIComponent(q)}`
        });
      }
    }
  },

  movie: {
    category: 'search', desc: 'Search for movie information',
    usage: '.movie <title>', aliases: ['film'], permissions: 'all',
    examples: ['.movie Avengers Endgame', '.movie Inception'],
    exec: async (args, sock, jid) => {
      const title = args.join(' ').trim();
      if (!title) return sock.sendMessage(jid, { text: '❌ Usage: .movie <title>' });
      await sock.sendMessage(jid, { text: `🎬 Searching movie: _"${title}"_...` });
      try {
        // OMDb API — free tier without key returns limited results
        const { data: m } = await axios.get('https://www.omdbapi.com/', {
          params: { t: title, apikey: 'trilogy', type: 'movie' },
          timeout: 10000
        });
        if (m.Response === 'False') throw new Error(m.Error || 'Not found');
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
          `_Pinterest requires login to access image API. Click the link above to browse._`
      });
    }
  }
};

module.exports = searchCommands;
