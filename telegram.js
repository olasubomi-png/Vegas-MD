'use strict';
// telegram.js — Telegram bot integration for OLASUBOMI-MD
// Uses the Telegram Bot API via long-polling (no extra packages — just axios).
// Start: node telegram.js  OR  auto-started from main.js when TELEGRAM_BOT_TOKEN is set.

const axios  = require('axios');
require('dotenv').config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — Telegram bot will not start.');
  module.exports = { start: () => {} };
  return;
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// ─── Telegram API helpers ──────────────────────────────────────────────────

async function apiCall(method, body = {}) {
  try {
    const { data } = await axios.post(`${API}/${method}`, body, { timeout: 30000 });
    return data;
  } catch (err) {
    const msg = err.response?.data?.description || err.message;
    console.error(`[Telegram] ${method} failed: ${msg}`);
    return null;
  }
}

async function sendText(chatId, text, options = {}) {
  return apiCall('sendMessage', {
    chat_id:    chatId,
    text:       text.slice(0, 4096), // Telegram message limit
    parse_mode: 'Markdown',
    ...options
  });
}

async function sendPhoto(chatId, photoUrl, caption = '') {
  return apiCall('sendPhoto', {
    chat_id:    chatId,
    photo:      photoUrl,
    caption:    caption.slice(0, 1024),
    parse_mode: 'Markdown'
  });
}

async function sendTyping(chatId) {
  return apiCall('sendChatAction', { chat_id: chatId, action: 'typing' });
}

async function sendUploadPhoto(chatId) {
  return apiCall('sendChatAction', { chat_id: chatId, action: 'upload_photo' });
}

// ─── Command implementations ───────────────────────────────────────────────

const jokes = [
  '😂 Why did the bot go to therapy? It had too many unresolved promises!',
  '🤖 Why do bots never get lost? They always follow the right path!',
  '😆 Why did the programmer quit? He didn\'t get arrays!',
  '🎭 What\'s a programmer\'s favorite hangout? Foo Bar!',
  '😂 How many programmers to change a light bulb? None — that\'s a hardware problem.',
  '😂 A SQL query walks into a bar and asks two tables: "Can I join you?"',
  '🤖 Why was the JS dev sad? He didn\'t know how to null his feelings.',
  '😆 What do you call a sleeping dinosaur? A dino-snore!'
];

const quotes = [
  '💭 "Code is like humor. When you have to explain it, it\'s bad." — Cory House',
  '💭 "First, solve the problem. Then, write the code." — John Johnson',
  '💭 "Any fool can write code a computer understands. Good programmers write code humans understand." — Martin Fowler',
  '💭 "Simplicity is the soul of efficiency." — Austin Freeman',
  '💭 "Make it work, make it right, make it fast." — Kent Beck',
  '💭 "Talk is cheap. Show me the code." — Linus Torvalds',
  '💭 "It\'s not a bug — it\'s an undocumented feature." — Anonymous'
];

const eightBall = [
  '🎱 It is certain.', '🎱 Without a doubt.', '🎱 Yes, definitely.',
  '🎱 You may rely on it.', '🎱 As I see it, yes.', '🎱 Most likely.',
  '🎱 Outlook good.', '🎱 Signs point to yes.', '🎱 Reply hazy, try again.',
  '🎱 Ask again later.', '🎱 Better not tell you now.', '🎱 Cannot predict now.',
  '🎱 Don\'t count on it.', '🎱 My reply is no.', '🎱 Outlook not so good.',
  '🎱 Very doubtful.'
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Command table ─────────────────────────────────────────────────────────
// Each handler receives (chatId, args, msg) and should send reply(ies).

const commands = {

  start: async (chatId) => {
    await sendText(chatId,
      `🤖 *OLASUBOMI-MD — Telegram Edition*\n\n` +
      `Welcome! Use /help to see available commands.\n\n` +
      `_Powered by the same engine as the WhatsApp bot._`
    );
  },

  help: async (chatId) => {
    await sendText(chatId,
      `📋 *Available Commands*\n\n` +
      `*🎉 Fun*\n` +
      `/joke — Random joke\n` +
      `/quote — Inspirational quote\n` +
      `/8ball <question> — Magic 8-ball\n` +
      `/dog — Random dog photo 🐶\n` +
      `/fox — Random fox photo 🦊\n\n` +
      `*🔍 Search & Info*\n` +
      `/google <query> — DuckDuckGo instant answers\n` +
      `/weather <city> — Current weather\n` +
      `/movie <title> — Movie info\n` +
      `/lyrics <artist> - <song> — Song lyrics\n` +
      `/github <user/repo or query> — GitHub search\n` +
      `/npm <package> — npm package info\n\n` +
      `*🎨 AI*\n` +
      `/imagine <description> — Generate realistic image\n` +
      `/translate <lang> | <text> — Translate text\n\n` +
      `*🛠 Utility*\n` +
      `/ping — Check bot latency\n` +
      `/help — Show this menu`
    );
  },

  ping: async (chatId) => {
    const start = Date.now();
    const sent  = await sendText(chatId, '🏓 Pong!');
    if (sent?.result?.message_id) {
      const latency = Date.now() - start;
      await apiCall('editMessageText', {
        chat_id:    chatId,
        message_id: sent.result.message_id,
        text:       `🏓 *Pong!*\n⚡ Latency: ${latency}ms`
      });
    }
  },

  joke: async (chatId) => {
    await sendText(chatId, pick(jokes));
  },

  quote: async (chatId) => {
    await sendText(chatId, pick(quotes));
  },

  '8ball': async (chatId, args) => {
    const q = args.join(' ').trim();
    if (!q) return sendText(chatId, '❌ Usage: /8ball <your question>');
    await sendText(chatId, `🎱 *Magic 8-Ball*\n\n❓ _${q}_\n\n${pick(eightBall)}`);
  },

  dog: async (chatId) => {
    await sendUploadPhoto(chatId);
    try {
      const { data } = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 10000 });
      if (!data?.message) throw new Error('No image returned');
      await sendPhoto(chatId, data.message, '🐶 *Random Dog*\n_Powered by dog.ceo_');
    } catch (err) {
      await sendText(chatId, `❌ Could not fetch dog image: ${err.message}`);
    }
  },

  fox: async (chatId) => {
    await sendUploadPhoto(chatId);
    try {
      const { data } = await axios.get('https://randomfox.ca/floof/', { timeout: 10000 });
      if (!data?.image) throw new Error('No image returned');
      await sendPhoto(chatId, data.image, '🦊 *Random Fox*\n_Powered by randomfox.ca_');
    } catch (err) {
      await sendText(chatId, `❌ Could not fetch fox image: ${err.message}`);
    }
  },

  imagine: async (chatId, args) => {
    const prompt = args.join(' ').trim();
    if (!prompt) return sendText(chatId, '❌ Usage: /imagine <description>');
    await sendText(chatId, `📸 Generating realistic image...\n\n_"${prompt}"_`);
    await sendUploadPhoto(chatId);
    try {
      const encoded = encodeURIComponent(prompt);
      const seed    = Math.floor(Math.random() * 999999);
      const imgUrl  = `https://image.pollinations.ai/prompt/${encoded}?model=flux-realism&width=1024&height=1024&nologo=true&enhance=true&seed=${seed}`;
      await sendPhoto(chatId, imgUrl, `📸 *Imagine AI* (Realistic)\n\n_"${prompt}"_`);
    } catch (err) {
      await sendText(chatId, `❌ Image generation failed: ${err.message}`);
    }
  },

  google: async (chatId, args) => {
    const q = args.join(' ').trim();
    if (!q) return sendText(chatId, '❌ Usage: /google <query>');
    await sendTyping(chatId);
    try {
      const res = await axios.get('https://api.duckduckgo.com/', {
        params: { q, format: 'json', no_html: 1, skip_disambig: 1 },
        timeout: 10000
      });
      const d = res.data;
      if (d.AbstractText) {
        await sendText(chatId, `🔍 *${d.Heading}*\n\n${d.AbstractText}\n\n🔗 ${d.AbstractURL || 'N/A'}`);
      } else if (d.Answer) {
        await sendText(chatId, `🔍 *Answer*\n\n${d.Answer}`);
      } else {
        await sendText(chatId,
          `🔍 No instant result for "*${q}*".\n\n` +
          `Search online: https://google.com/search?q=${encodeURIComponent(q)}`
        );
      }
    } catch (err) {
      await sendText(chatId, `❌ Search failed: ${err.message}`);
    }
  },

  weather: async (chatId, args) => {
    const city = args.join(' ').trim();
    if (!city) return sendText(chatId, '❌ Usage: /weather <city>');
    await sendTyping(chatId);
    try {
      const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: { name: city, count: 1 }, timeout: 8000
      });
      const loc = geo.data.results?.[0];
      if (!loc) return sendText(chatId, `❌ City not found: *${city}*`);

      const wx = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: loc.latitude, longitude: loc.longitude,
          current_weather: true, hourly: 'relativehumidity_2m', forecast_days: 1
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
      await sendText(chatId,
        `🌤️ *Weather — ${loc.name}, ${loc.country}*\n\n` +
        `${wmoDesc[cw.weathercode] || `Code ${cw.weathercode}`}\n\n` +
        `🌡️  Temp      : ${cw.temperature}°C\n` +
        `💨 Wind      : ${cw.windspeed} km/h\n` +
        `💧 Humidity  : ${hum}%`
      );
    } catch (err) {
      await sendText(chatId, `❌ Weather fetch failed: ${err.message}`);
    }
  },

  movie: async (chatId, args) => {
    const title = args.join(' ').trim();
    if (!title) return sendText(chatId, '❌ Usage: /movie <title>');
    await sendTyping(chatId);
    try {
      const { data: m } = await axios.get('https://www.omdbapi.com/', {
        params: { t: title, apikey: 'trilogy', type: 'movie' }, timeout: 10000
      });
      if (m.Response === 'False') throw new Error(m.Error || 'Not found');
      await sendText(chatId,
        `🎬 *${m.Title}* (${m.Year})\n\n` +
        `📝 ${m.Plot}\n\n` +
        `⭐ Rating  : ${m.imdbRating}/10\n` +
        `🎭 Genre   : ${m.Genre}\n` +
        `🎬 Director: ${m.Director}\n` +
        `👥 Cast    : ${m.Actors?.split(',').slice(0, 3).join(', ')}\n` +
        `⏱️  Runtime : ${m.Runtime}`
      );
    } catch {
      await sendText(chatId, `❌ Movie not found: *${title}*`);
    }
  },

  lyrics: async (chatId, args) => {
    const input = args.join(' ').trim();
    if (!input) return sendText(chatId, '❌ Usage: /lyrics <artist> - <song>');
    await sendTyping(chatId);
    try {
      let artist = '', title = input;
      if (input.includes(' - ')) {
        const parts = input.split(' - ');
        artist = parts[0].trim();
        title  = parts.slice(1).join(' - ').trim();
      }
      const encA = encodeURIComponent(artist || title);
      const encT = encodeURIComponent(artist ? title : '');
      let data;
      try {
        const res = await axios.get(`https://api.lyrics.ovh/v1/${encA}/${encT}`, { timeout: 15000 });
        data = res.data;
      } catch { /* fallthrough */ }
      if (!data?.lyrics) return sendText(chatId, `❌ Lyrics not found for *${input}*.\n\nTry: https://genius.com/search?q=${encodeURIComponent(input)}`);
      const snippet   = data.lyrics.slice(0, 3500);
      const truncated = data.lyrics.length > 3500;
      await sendText(chatId, `🎵 *Lyrics*\n\n${snippet}${truncated ? '\n\n_... (truncated)_' : ''}`);
    } catch (err) {
      await sendText(chatId, `❌ Lyrics search failed: ${err.message}`);
    }
  },

  github: async (chatId, args) => {
    const q = args.join(' ').trim();
    if (!q) return sendText(chatId, '❌ Usage: /github <user/repo or query>');
    await sendTyping(chatId);
    try {
      if (/^[\w.-]+\/[\w.-]+$/.test(q)) {
        const { data: r } = await axios.get(`https://api.github.com/repos/${q}`, { timeout: 10000 });
        await sendText(chatId,
          `🐙 *${r.full_name}*\n\n` +
          `📝 ${r.description || 'No description'}\n\n` +
          `⭐ Stars    : ${r.stargazers_count.toLocaleString()}\n` +
          `🍴 Forks    : ${r.forks_count.toLocaleString()}\n` +
          `📦 Language : ${r.language || 'N/A'}\n` +
          `🔗 URL      : ${r.html_url}`
        );
      } else {
        const { data } = await axios.get('https://api.github.com/search/repositories', {
          params: { q, sort: 'stars', per_page: 3 }, timeout: 10000
        });
        if (!data.items?.length) return sendText(chatId, '❌ No repos found.');
        const lines = data.items.map(r =>
          `🔹 *${r.full_name}* ⭐${r.stargazers_count.toLocaleString()}\n   ${r.description?.slice(0, 60) || '—'}\n   ${r.html_url}`
        ).join('\n\n');
        await sendText(chatId, `🐙 *GitHub Results for "${q}"*\n\n${lines}`);
      }
    } catch (err) {
      await sendText(chatId, `❌ GitHub search failed: ${err.message}`);
    }
  },

  npm: async (chatId, args) => {
    const q = args.join(' ').trim();
    if (!q) return sendText(chatId, '❌ Usage: /npm <package>');
    await sendTyping(chatId);
    try {
      const { data: pkg } = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(q)}`, { timeout: 10000 });
      const latest  = pkg['dist-tags']?.latest || '?';
      const version = pkg.versions?.[latest];
      await sendText(chatId,
        `📦 *${pkg.name}*\n\n` +
        `📝 ${pkg.description || 'No description'}\n\n` +
        `🏷️  Version : ${latest}\n` +
        `👤 Author  : ${typeof pkg.author === 'object' ? pkg.author.name : pkg.author || 'N/A'}\n` +
        `📜 License : ${version?.license || 'N/A'}\n` +
        `🔗 npm     : https://npmjs.com/package/${pkg.name}`
      );
    } catch {
      await sendText(chatId, `❌ Package not found: *${q}*`);
    }
  },

  translate: async (chatId, args) => {
    const input = args.join(' ').trim();
    if (!input || !input.includes('|')) {
      return sendText(chatId, '❌ Usage: /translate <language> | <text>\n\nExample: /translate Spanish | Hello world');
    }
    const [langRaw, ...rest] = input.split('|');
    const lang = langRaw.trim();
    const text = rest.join('|').trim();
    if (!text) return sendText(chatId, '❌ No text provided after the |');
    await sendTyping(chatId);
    try {
      // Use pollinations text API for translation (same as WhatsApp bot)
      const prompt  = `Translate this to ${lang}, reply with only the translation: "${text}"`;
      const encoded = encodeURIComponent(prompt);
      const res     = await axios.get(
        `https://text.pollinations.ai/${encoded}?model=openai&seed=${Math.floor(Math.random() * 9999)}`,
        { timeout: 20000, responseType: 'text' }
      );
      const translated = typeof res.data === 'string' ? res.data.trim() : JSON.stringify(res.data);
      await sendText(chatId, `🌍 *Translation (${lang})*\n\n${translated}`);
    } catch (err) {
      await sendText(chatId, `❌ Translation failed: ${err.message}`);
    }
  }
};

// ─── Update handler ────────────────────────────────────────────────────────

async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const text   = (msg.text || '').trim();

  if (!text.startsWith('/')) return; // ignore non-commands

  // Parse "/command@BotName args…" format
  const withoutSlash = text.slice(1);
  const [rawCmd, ...args] = withoutSlash.split(/\s+/);
  const command = rawCmd.split('@')[0].toLowerCase(); // strip @BotUsername suffix

  const handler = commands[command];
  if (!handler) {
    // Only reply in private chats to avoid spam in groups
    if (msg.chat.type === 'private') {
      await sendText(chatId, `❓ Unknown command: /${command}\n\nUse /help to see available commands.`);
    }
    return;
  }

  try {
    await handler(chatId, args, msg);
  } catch (err) {
    console.error(`[Telegram] /${command} error:`, err.message);
    await sendText(chatId, `❌ An error occurred: ${err.message}`);
  }
}

// ─── Long-polling loop ─────────────────────────────────────────────────────

async function poll(offset = 0) {
  try {
    const res = await axios.post(`${API}/getUpdates`, {
      offset,
      timeout:         30,
      allowed_updates: ['message', 'edited_message']
    }, { timeout: 40000 });

    const updates = res.data?.result || [];

    for (const update of updates) {
      offset = update.update_id + 1;
      // Await each handler so updates are processed in order and failures are caught
      // before the next offset advance. This avoids unbounded concurrent handlers.
      await handleUpdate(update).catch(err =>
        console.error('[Telegram] handleUpdate error:', err.message)
      );
    }
  } catch (err) {
    const msg = err.response?.data?.description || err.message;
    console.error('[Telegram] polling error:', msg);
    // Back off for 5 s on error
    await new Promise(r => setTimeout(r, 5000));
  }

  // Schedule next poll immediately (async recursion avoids stack growth)
  setImmediate(() => poll(offset));
}

// ─── Public API ────────────────────────────────────────────────────────────

function start() {
  if (!TOKEN) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping Telegram bot.');
    return;
  }
  // Remove any existing webhook so polling works
  apiCall('deleteWebhook', { drop_pending_updates: false })
    .then(() => {
      console.log('[Telegram] Webhook cleared. Starting long-poll...');
      poll(0);
    })
    .catch(err => {
      console.error('[Telegram] Could not clear webhook:', err.message);
      poll(0); // start anyway
    });
}

module.exports = { start };

// Allow running directly: node telegram.js
if (require.main === module) {
  start();
}
