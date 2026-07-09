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

// ─── Channel promotion constants ───────────────────────────────────────────

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vb8phn8KAwEemfEwDb2Z';

// Per-user state (in-memory; resets on restart — acceptable for promotions)
const seenHelp      = new Set();   // chatIds that have seen the channel link in /help
const lastPromoTime = new Map();   // chatId → timestamp of last 24h reminder

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
    chat_id:                  chatId,
    text:                     text.slice(0, 4096),
    parse_mode:               'Markdown',
    disable_web_page_preview: true,
    ...options
  });
}

/**
 * Upload a raw image buffer to Telegram.
 * Uses form-data (usually available as a transitive dep of axios).
 * Falls back to passing the URL string if form-data is unavailable.
 */
async function sendPhotoBuffer(chatId, imgBuffer, caption = '') {
  let FormData;
  try { FormData = require('form-data'); } catch { FormData = null; }

  if (FormData) {
    const form = new FormData();
    form.append('chat_id',    String(chatId));
    form.append('caption',    caption.slice(0, 1024));
    form.append('parse_mode', 'Markdown');
    form.append('photo', imgBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
    try {
      const { data } = await axios.post(`${API}/sendPhoto`, form, {
        headers: form.getHeaders(),
        timeout: 30000
      });
      return data;
    } catch (err) {
      console.error('[Telegram] sendPhotoBuffer failed:', err.message);
      return null;
    }
  }
  return null;
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

// ─── Channel promotion helper ──────────────────────────────────────────────

/**
 * sendChannelPromotion(chatId)
 * Send the official WhatsApp channel follow reminder.
 * Used by /start, first /help, and the 24-hour per-user reminder.
 */
async function sendChannelPromotion(chatId) {
  await sendText(chatId,
    `📢 *Stay updated:*\n` +
    `Follow OLASUBOMI-MD on WhatsApp:\n` +
    `${CHANNEL_LINK}`
  );
}

// ─── Image mode detection ──────────────────────────────────────────────────
// Returns 'anime' or 'realistic' based on keywords in the prompt.

const ANIME_KEYWORDS = [
  'anime', 'manga', 'chibi', 'kawaii', 'waifu', 'otaku', 'sakura',
  // character names
  'naruto', 'goku', 'luffy', 'sasuke', 'ichigo', 'levi', 'eren', 'mikasa',
  'gojo', 'itadori', 'tanjiro', 'zenitsu', 'inosuke', 'killua', 'gon',
  'nezuko', 'todoroki', 'deku', 'bakugo', 'zoro', 'nami', 'usopp',
  // series / genre names
  'dragon ball', 'one piece', 'attack on titan', 'demon slayer',
  'jujutsu kaisen', 'my hero academia', 'sword art online', 'fairy tail',
  'bleach', 'fullmetal alchemist', 'death note', 'hunter x hunter',
  'chainsaw man', 'spy x family', 'vinland saga', 'overlord', 're:zero',
  // art style descriptors
  'cartoon', 'animated', 'illustration', 'drawing', 'sketch', 'toon',
  '2d art', 'pixel art', 'cel-shaded', 'comic', 'watercolor',
  'oil painting', 'painterly', 'stylized', 'digital art'
];

function detectImageMode(prompt) {
  const lower = prompt.toLowerCase();
  return ANIME_KEYWORDS.some(kw => lower.includes(kw)) ? 'anime' : 'realistic';
}

// ─── Static data ───────────────────────────────────────────────────────────

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

const commands = {

  // ── /start ─────────────────────────────────────────────
  start: async (chatId) => {
    // Mark promo as sent so the next command doesn't immediately fire another reminder
    markPromoSent(chatId);
    await sendText(chatId,
      `🚀 *Welcome to OLASUBOMI-MD!*\n\n` +
      `Before using the bot, please follow our official WhatsApp Channel for updates, new features, and announcements.\n\n` +
      `📢 *OLASUBOMI-MD Channel:*\n` +
      `${CHANNEL_LINK}\n\n` +
      `After joining, you can use:\n` +
      `/help\n` +
      `/ping\n` +
      `/imagine\n` +
      `/dog\n` +
      `/fox\n` +
      `/google\n` +
      `and many more commands.`
    );
  },

  // ── /help ──────────────────────────────────────────────
  help: async (chatId) => {
    const isFirstTime = !seenHelp.has(chatId);
    if (isFirstTime) {
      seenHelp.add(chatId);
      // Channel link is already in the footer — mark promo sent to avoid duplicate reminder
      markPromoSent(chatId);
    }

    const channelFooter = isFirstTime
      ? `\n\n📢 *Stay updated — follow us on WhatsApp:*\n${CHANNEL_LINK}`
      : '';

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
      `/imagine <description> — Generate image (auto anime or realistic)\n` +
      `/translate <lang> | <text> — Translate text\n\n` +
      `*🛠 Utility*\n` +
      `/ping — Check bot latency\n` +
      `/help — Show this menu` +
      channelFooter
    );
  },

  // ── /ping ──────────────────────────────────────────────
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

  // ── /joke ──────────────────────────────────────────────
  joke: async (chatId) => {
    await sendText(chatId, pick(jokes));
  },

  // ── /quote ─────────────────────────────────────────────
  quote: async (chatId) => {
    await sendText(chatId, pick(quotes));
  },

  // ── /8ball ─────────────────────────────────────────────
  '8ball': async (chatId, args) => {
    const q = args.join(' ').trim();
    if (!q) return sendText(chatId, '❌ Usage: /8ball <your question>');
    await sendText(chatId, `🎱 *Magic 8-Ball*\n\n❓ _${q}_\n\n${pick(eightBall)}`);
  },

  // ── /dog ───────────────────────────────────────────────
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

  // ── /fox ───────────────────────────────────────────────
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

  // ── /imagine ───────────────────────────────────────────
  // Auto-detects whether the prompt is anime/artistic or photorealistic.
  // Downloads the image as a buffer first to avoid Telegram's short fetch timeout.
  imagine: async (chatId, args) => {
    const prompt = args.join(' ').trim();
    if (!prompt) return sendText(chatId, '❌ Usage: /imagine <description>');

    const mode       = detectImageMode(prompt);
    const isAnime    = mode === 'anime';
    const modeLabel  = isAnime ? '🎌 Anime' : '📸 Realistic';
    const model      = isAnime ? 'flux' : 'flux-realism';
    const extraParam = isAnime ? '' : '&enhance=true';

    await sendText(chatId, `${modeLabel} *Imagine AI* generating...\n\n_"${prompt}"_`);
    await sendUploadPhoto(chatId);

    try {
      const encoded = encodeURIComponent(prompt);
      const seed    = Math.floor(Math.random() * 999999);
      const imgUrl  = `https://image.pollinations.ai/prompt/${encoded}?model=${model}&width=1024&height=1024&nologo=true${extraParam}&seed=${seed}`;

      // Download image as buffer (pollinations generates on demand, can take 20-60s)
      const { data: imgData } = await axios.get(imgUrl, {
        responseType: 'arraybuffer',
        timeout:      90000
      });
      const imgBuffer = Buffer.from(imgData);

      const caption  = `${modeLabel} *Imagine AI*\n\n_"${prompt}"_`;
      let delivered  = await sendPhotoBuffer(chatId, imgBuffer, caption);

      // Fallback: if form-data wasn't available, try URL approach
      if (!delivered) {
        delivered = await sendPhoto(chatId, imgUrl, caption);
      }

      // Both paths failed — tell the user explicitly instead of silently dropping
      if (!delivered) {
        await sendText(chatId, `❌ Image was generated but could not be delivered. Try again in a moment.`);
      }
    } catch (err) {
      await sendText(chatId, `❌ Image generation failed: ${err.message}`);
    }
  },

  // ── /google ────────────────────────────────────────────
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

  // ── /weather ───────────────────────────────────────────
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

  // ── /movie ─────────────────────────────────────────────
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

  // ── /lyrics ────────────────────────────────────────────
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
      if (!data?.lyrics) return sendText(chatId,
        `❌ Lyrics not found for *${input}*.\n\nTry: https://genius.com/search?q=${encodeURIComponent(input)}`
      );
      const snippet   = data.lyrics.slice(0, 3500);
      const truncated = data.lyrics.length > 3500;
      await sendText(chatId, `🎵 *Lyrics*\n\n${snippet}${truncated ? '\n\n_... (truncated)_' : ''}`);
    } catch (err) {
      await sendText(chatId, `❌ Lyrics search failed: ${err.message}`);
    }
  },

  // ── /github ────────────────────────────────────────────
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

  // ── /npm ───────────────────────────────────────────────
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

  // ── /translate ─────────────────────────────────────────
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

// ─── 24-hour promotion reminder ────────────────────────────────────────────

const PROMO_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function shouldSendPromo(chatId) {
  const last = lastPromoTime.get(chatId);
  return !last || (Date.now() - last) >= PROMO_INTERVAL_MS;
}

function markPromoSent(chatId) {
  lastPromoTime.set(chatId, Date.now());
}

// ─── Update handler ────────────────────────────────────────────────────────

async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const text   = (msg.text || '').trim();

  if (!text.startsWith('/')) return; // ignore non-commands

  // Parse "/command@BotName args…" format
  const withoutSlash  = text.slice(1);
  const [rawCmd, ...args] = withoutSlash.split(/\s+/);
  const command = rawCmd.split('@')[0].toLowerCase();

  const handler = commands[command];
  if (!handler) {
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

  // 24-hour channel promotion — fire after any command except /start (which already shows it)
  if (command !== 'start' && shouldSendPromo(chatId)) {
    markPromoSent(chatId);
    // Small delay so it appears after the command response
    setTimeout(() => sendChannelPromotion(chatId).catch(() => {}), 1500);
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
      await handleUpdate(update).catch(err =>
        console.error('[Telegram] handleUpdate error:', err.message)
      );
    }
  } catch (err) {
    const msg = err.response?.data?.description || err.message;
    console.error('[Telegram] polling error:', msg);
    await new Promise(r => setTimeout(r, 5000));
  }

  setImmediate(() => poll(offset));
}

// ─── Public API ────────────────────────────────────────────────────────────

function start() {
  if (!TOKEN) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping Telegram bot.');
    return;
  }
  apiCall('deleteWebhook', { drop_pending_updates: false })
    .then(() => {
      console.log('[Telegram] Webhook cleared. Starting long-poll...');
      poll(0);
    })
    .catch(err => {
      console.error('[Telegram] Could not clear webhook:', err.message);
      poll(0);
    });
}

module.exports = { start, sendChannelPromotion, detectImageMode };

// Allow running directly: node telegram.js
if (require.main === module) {
  start();
}
