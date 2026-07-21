'use strict';
// plugins/zstlab.js — ZST Labs API commands
// Covers 60+ new commands across AI, Movies, Anime, Sports, Religion, Canvas,
// Tools, Fun, Search, and more — all powered by https://zstlab.cyou
const axios = require('axios');

const BASE   = 'https://zstlab.cyou';
const APIKEY = process.env.ZST_API_KEY || '';

// Fail loudly at load time if the API key is missing.
// Resolution: add ZST_API_KEY to Replit Secrets (Secrets tab → ZST_API_KEY → your key from https://zstlab.cyou).
if (!APIKEY) {
  console.error(
    '[zstlab] FATAL: ZST_API_KEY environment variable is not set.\n' +
    '         All ZST Labs commands will return 401 Unauthorized.\n' +
    '         Fix: add ZST_API_KEY to Replit Secrets with your key from https://zstlab.cyou'
  );
}

// Shared axios instance — every request carries x-api-key for authentication.
// The header is set from ZST_API_KEY at startup; restart the bot after updating the secret.
const api = axios.create({
  baseURL: BASE,
  timeout: 20000,
  headers: {
    'x-api-key':  APIKEY,
    'User-Agent': 'OLASUBOMI-MD/3.0.0'
  }
});

// Intercept 401/403 responses and replace them with a clear, actionable error.
// Without this, users see a raw "Unauthorized" message with no guidance on how to fix it.
api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      const msg = APIKEY
        ? `ZST Labs API key rejected (HTTP ${status}). Check that your ZST_API_KEY is correct at https://zstlab.cyou`
        : `ZST Labs API key is not set. Add ZST_API_KEY to Replit Secrets (get a free key at https://zstlab.cyou)`;
      return Promise.reject(new Error(msg));
    }
    return Promise.reject(error);
  }
);

// Helper: GET with params
async function zget(path, params = {}) {
  const { data } = await api.get(path, { params });
  return data;
}

// Helper: POST with body
async function zpost(path, body = {}) {
  const { data } = await api.post(path, body);
  return data;
}

// Helper: send error — surfaces the interceptor's message or the raw API error
function errMsg(sock, jid, err) {
  const msg = err?.message || err?.response?.data?.error || err?.response?.data?.message || 'Unknown error';
  return sock.sendMessage(jid, { text: `❌ ${msg}` });
}

// ─────────────────────────────────────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────────────────────────────────────

const aiCmds = {

  zstai: {
    category: 'ai', desc: 'Chat with ZST AI (fast, free)',
    usage: '.zstai <message>', aliases: ['zai'], permissions: 'all',
    examples: ['.zstai What is the capital of Nigeria?'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .zstai <message>' });
      await sock.sendMessage(jid, { text: `🤖 ZST AI is thinking...` });
      try {
        const d = await zget('/api/v1/ai/zst', { message: q });
        const reply = d.reply || d.response || d.text || d.content || JSON.stringify(d);
        await sock.sendMessage(jid, { text: `🤖 *ZST AI*\n\n${reply}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  gpt4o: {
    category: 'ai', desc: 'Chat with GPT-4o via ZST Labs',
    usage: '.gpt4o <message>', aliases: ['gpt4o-mini'], permissions: 'all',
    examples: ['.gpt4o Explain black holes'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .gpt4o <message>' });
      await sock.sendMessage(jid, { text: `🧠 GPT-4o is thinking...` });
      try {
        const d = await zget('/api/v1/ai/gpt4o', { message: q });
        const reply = d.reply || d.response || d.text || d.content || JSON.stringify(d);
        await sock.sendMessage(jid, { text: `🧠 *GPT-4o*\n\n${reply}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  deepseek: {
    category: 'ai', desc: 'Chat with DeepSeek R1 via ZST Labs',
    usage: '.deepseek <message>', aliases: ['ds', 'r1'], permissions: 'all',
    examples: ['.deepseek Write a haiku about rain'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .deepseek <message>' });
      await sock.sendMessage(jid, { text: `🔍 DeepSeek R1 is thinking...` });
      try {
        const d = await zget('/api/v1/ai/deepseek', { message: q });
        const reply = d.reply || d.response || d.text || d.content || JSON.stringify(d);
        await sock.sendMessage(jid, { text: `🔍 *DeepSeek R1*\n\n${reply}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  sentiment: {
    category: 'ai', desc: 'Analyse the sentiment of a text',
    usage: '.sentiment <text>', aliases: ['feel'], permissions: 'all',
    examples: ['.sentiment I love this bot so much!'],
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .sentiment <text>' });
      try {
        const d = await zpost('/api/v1/ai/sentiment', { text });
        const s = d.sentiment || d.label || d.result || JSON.stringify(d);
        const score = d.score != null ? `\n📊 Confidence: ${(d.score * 100).toFixed(1)}%` : '';
        await sock.sendMessage(jid, { text: `🧠 *Sentiment Analysis*\n\n"${text.slice(0,80)}"\n\n📌 Result: *${s}*${score}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  summarize: {
    category: 'ai', desc: 'Summarise a long text using ZST AI',
    usage: '.summarize <text>', aliases: ['tldr', 'sum'], permissions: 'all',
    examples: ['.summarize <paste a long article>'],
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .summarize <text>' });
      await sock.sendMessage(jid, { text: '📝 Summarising...' });
      try {
        const d = await zpost('/api/v1/ai/summarize', { text });
        const summary = d.summary || d.result || d.text || JSON.stringify(d);
        await sock.sendMessage(jid, { text: `📝 *Summary*\n\n${summary}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  aimodels: {
    category: 'ai', desc: 'List all available ZST AI models',
    usage: '.aimodels', aliases: ['models'], permissions: 'all',
    examples: ['.aimodels'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/ai/models');
        const list = (d.models || d.data || d).map((m, i) => `${i + 1}. ${m.id || m.name || m}`).join('\n');
        await sock.sendMessage(jid, { text: `🤖 *Available AI Models*\n\n${list}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────────────────

const searchCmds = {

  websearch: {
    category: 'search', desc: 'Search the web via ZST Labs',
    usage: '.websearch <query>', aliases: ['wsearch', 'browse'], permissions: 'all',
    examples: ['.websearch latest AI news'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .websearch <query>' });
      await sock.sendMessage(jid, { text: `🔍 Searching: _"${q}"_...` });
      try {
        const d = await zget('/api/v1/search/web', { q });
        const results = d.results || d.data || [];
        if (!results.length) return sock.sendMessage(jid, { text: '❌ No results found.' });
        const text = results.slice(0, 5).map((r, i) =>
          `${i + 1}. *${r.title || 'No title'}*\n   ${r.snippet || r.description || ''}\n   🔗 ${r.url || r.link || ''}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `🔍 *Web Search: "${q}"*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  newssearch: {
    category: 'search', desc: 'Search the latest news',
    usage: '.newssearch <topic>', aliases: ['nsearch', 'headlines'], permissions: 'all',
    examples: ['.newssearch Nigeria economy'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .newssearch <topic>' });
      await sock.sendMessage(jid, { text: `📰 Fetching news for: _"${q}"_...` });
      try {
        const d = await zget('/api/v1/search/news', { q });
        const results = d.articles || d.results || d.data || [];
        if (!results.length) return sock.sendMessage(jid, { text: '❌ No news found.' });
        const text = results.slice(0, 5).map((r, i) =>
          `${i + 1}. *${r.title || 'No title'}*\n   📅 ${r.publishedAt || r.date || ''}\n   🔗 ${r.url || r.link || ''}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `📰 *News: "${q}"*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  country: {
    category: 'search', desc: 'Get info about any country by name or 2-letter code',
    usage: '.country <name or code>', aliases: ['countryinfo'], permissions: 'all',
    examples: ['.country Nigeria', '.country NG'],
    exec: async (args, sock, jid) => {
      const code = args.join(' ').trim();
      if (!code) return sock.sendMessage(jid, { text: '❌ Usage: .country <name or code>' });
      try {
        const d = await zget(`/api/v1/countries/${encodeURIComponent(code)}`);
        const c = d.country || d.data || d;
        const out =
          `🌍 *${c.name?.official || c.name?.common || c.name || code}*\n\n` +
          `🏳️  Common Name : ${c.name?.common || '—'}\n` +
          `🌐 Region      : ${c.region || '—'}\n` +
          `🏙️  Capital     : ${Array.isArray(c.capital) ? c.capital[0] : c.capital || '—'}\n` +
          `👥 Population  : ${c.population?.toLocaleString() || '—'}\n` +
          `💱 Currency    : ${Object.values(c.currencies || {}).map(v => v.name).join(', ') || '—'}\n` +
          `🗺️  Subregion   : ${c.subregion || '—'}\n` +
          `🌐 TLD         : ${(c.tld || []).join(', ') || '—'}`;
        await sock.sendMessage(jid, { text: out });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  define: {
    category: 'search', desc: 'Look up a word definition',
    usage: '.define <word>', aliases: ['dict', 'dictionary'], permissions: 'all',
    examples: ['.define serendipity'],
    exec: async (args, sock, jid) => {
      const word = args[0]?.toLowerCase().trim();
      if (!word) return sock.sendMessage(jid, { text: '❌ Usage: .define <word>' });
      try {
        const d = await zget(`/api/v1/dictionary/${encodeURIComponent(word)}`);
        const entry = d.data || d;
        const defs = entry.definitions || entry.meanings || [];
        const defText = defs.slice(0, 3).map((def, i) => {
          const text = def.definition || def.text || JSON.stringify(def);
          const partOfSpeech = def.partOfSpeech || def.type || '';
          return `${i + 1}. ${partOfSpeech ? `_[${partOfSpeech}]_ ` : ''}${text}`;
        }).join('\n');
        const phonetic = entry.phonetic || entry.pronunciation || '';
        await sock.sendMessage(jid, {
          text:
            `📖 *${word}*${phonetic ? `  _${phonetic}_` : ''}\n\n` +
            (defText || JSON.stringify(entry).slice(0, 300))
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  synonym: {
    category: 'search', desc: 'Get synonyms for a word',
    usage: '.synonym <word>', aliases: ['syn'], permissions: 'all',
    examples: ['.synonym happy'],
    exec: async (args, sock, jid) => {
      const word = args[0]?.toLowerCase().trim();
      if (!word) return sock.sendMessage(jid, { text: '❌ Usage: .synonym <word>' });
      try {
        const d = await zget(`/api/v1/dictionary/${encodeURIComponent(word)}/synonyms`);
        const syns = d.synonyms || d.data || [];
        const list = Array.isArray(syns) ? syns.slice(0, 20).join(', ') : JSON.stringify(syns);
        await sock.sendMessage(jid, { text: `📖 *Synonyms for "${word}"*\n\n${list || 'No synonyms found.'}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  spacenews: {
    category: 'search', desc: 'Get the latest space and astronomy news',
    usage: '.spacenews', aliases: ['space'], permissions: 'all',
    examples: ['.spacenews'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/space/news');
        const articles = d.articles || d.data || d;
        const text = articles.slice(0, 5).map((a, i) =>
          `${i + 1}. *${a.title || 'No title'}*\n   🔗 ${a.url || ''}  📅 ${a.publishedAt || a.date || ''}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `🚀 *Space News*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  planets: {
    category: 'search', desc: 'Info about the planets in our solar system',
    usage: '.planets', aliases: ['solarsystem'], permissions: 'all',
    examples: ['.planets'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/space/planets');
        const list = (d.planets || d.data || d).slice(0, 9).map((p, i) => {
          const name = p.name || p;
          const dist = p.distanceFromSun || p.distance || '';
          return `${i + 1}. *${name}*${dist ? `  (${dist})` : ''}`;
        }).join('\n');
        await sock.sendMessage(jid, { text: `🪐 *Solar System Planets*\n\n${list}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  isstrack: {
    category: 'search', desc: 'Track the real-time location of the ISS',
    usage: '.isstrack', aliases: ['iss'], permissions: 'all',
    examples: ['.isstrack'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/space/iss');
        const pos = d.iss_position || d.position || d;
        await sock.sendMessage(jid, {
          text:
            `🛸 *ISS Location*\n\n` +
            `📍 Latitude  : ${pos.latitude}\n` +
            `📍 Longitude : ${pos.longitude}\n` +
            `⏱️  Timestamp : ${d.timestamp ? new Date(d.timestamp * 1000).toUTCString() : new Date().toUTCString()}\n` +
            `🌍 Map       : https://maps.google.com/?q=${pos.latitude},${pos.longitude}`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FUN
// ─────────────────────────────────────────────────────────────────────────────

const funCmds = {

  apijoke: {
    category: 'fun', desc: 'Get a random joke from ZST Labs API',
    usage: '.apijoke [type]', aliases: ['zjoke', 'randomjoke'], permissions: 'all',
    examples: ['.apijoke', '.apijoke programming'],
    exec: async (args, sock, jid) => {
      const type = args[0] || 'all';
      try {
        const d = await zget('/api/v1/jokes/random', { type });
        const j = d.joke || d.data || d;
        const setup = j.setup || j.question || '';
        const punchline = j.punchline || j.answer || '';
        const text = setup ? `${setup}\n\n${punchline}` : (j.text || j.joke || JSON.stringify(j));
        await sock.sendMessage(jid, { text: `😂 *Joke*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  zquote: {
    category: 'fun', desc: 'Get a random inspirational quote from ZST Labs',
    usage: '.zquote [tag]', aliases: ['apiquote', 'rquote'], permissions: 'all',
    examples: ['.zquote', '.zquote motivation'],
    exec: async (args, sock, jid) => {
      const tag = args[0] || '';
      try {
        const d = await zget('/api/v1/quotes/random', tag ? { tag } : {});
        const q = d.quote || d.data || d;
        const text = q.text || q.quote || q.content || JSON.stringify(q);
        const author = q.author || q.name || 'Unknown';
        await sock.sendMessage(jid, { text: `💭 _"${text}"_\n\n— *${author}*` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  fact: {
    category: 'fun', desc: 'Get a random interesting fact',
    usage: '.fact', aliases: ['randomfact', 'rfact'], permissions: 'all',
    examples: ['.fact'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/facts/random');
        const f = d.fact || d.data || d;
        const text = f.text || f.fact || f.content || JSON.stringify(f);
        await sock.sendMessage(jid, { text: `💡 *Did You Know?*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  apitrivia: {
    category: 'fun', desc: 'Get a random trivia question from ZST Labs API',
    usage: '.apitrivia [category]', aliases: ['zstrivia', 'rndtrivia'], permissions: 'all',
    examples: ['.apitrivia', '.apitrivia science'],
    exec: async (args, sock, jid) => {
      const category = args[0] || '';
      try {
        const d = await zget('/api/v1/trivia/random', category ? { category } : {});
        const q = d.question || d.data || d;
        const qText = q.question || q.text || JSON.stringify(q);
        const options = q.options || q.choices || [];
        const answer = q.answer || q.correct || '';
        const optText = options.length ? `\n\nOptions:\n${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : '';
        await sock.sendMessage(jid, {
          text:
            `🎯 *Trivia Question*\n\n${qText}${optText}\n\n` +
            `||Answer: ${answer}||`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  affirmation: {
    category: 'fun', desc: 'Get a positive daily affirmation',
    usage: '.affirmation', aliases: ['affirm', 'dailyaffirm'], permissions: 'all',
    examples: ['.affirmation'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/affirmations/random');
        const a = d.affirmation || d.data || d;
        const text = a.text || a.affirmation || a.content || JSON.stringify(a);
        await sock.sendMessage(jid, { text: `✨ *Daily Affirmation*\n\n_"${text}"_` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  advice: {
    category: 'fun', desc: 'Get a random piece of advice',
    usage: '.advice', aliases: ['tip'], permissions: 'all',
    examples: ['.advice'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/fun/advice');
        const a = d.advice || d.data || d;
        const text = a.text || a.advice || (typeof a === 'string' ? a : JSON.stringify(a));
        await sock.sendMessage(jid, { text: `💭 *Advice*\n\n_"${text}"_` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  flirt: {
    category: 'fun', desc: 'Get a random flirt line',
    usage: '.flirt', aliases: ['pickup', 'rizz'], permissions: 'all',
    examples: ['.flirt'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/fun/flirt');
        const f = d.flirt || d.line || d.data || d;
        const text = f.text || f.line || (typeof f === 'string' ? f : JSON.stringify(f));
        await sock.sendMessage(jid, { text: `😏 *Flirt Line*\n\n_"${text}"_` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  catfact: {
    category: 'fun', desc: 'Get a random fact about cats',
    usage: '.catfact', aliases: ['catz'], permissions: 'all',
    examples: ['.catfact'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/animals/cat');
        const f = d.fact || d.data || d;
        const text = f.text || f.fact || (typeof f === 'string' ? f : JSON.stringify(f));
        await sock.sendMessage(jid, { text: `🐱 *Cat Fact*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  numberfact: {
    category: 'fun', desc: 'Get a fact about any number',
    usage: '.numberfact <number>', aliases: ['numfact'], permissions: 'all',
    examples: ['.numberfact 42', '.numberfact 100'],
    exec: async (args, sock, jid) => {
      const num = args[0];
      if (!num || isNaN(num)) return sock.sendMessage(jid, { text: '❌ Usage: .numberfact <number>' });
      try {
        const d = await zget(`/api/v1/numbers/${num}`);
        const f = d.fact || d.data || d;
        const text = f.text || f.fact || (typeof f === 'string' ? f : JSON.stringify(f));
        await sock.sendMessage(jid, { text: `🔢 *Fact about ${num}*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  dog: {
    category: 'fun', desc: 'Get a random dog image',
    usage: '.dog', aliases: ['doggo', 'puppy'], permissions: 'all',
    examples: ['.dog'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/animals/dog');
        const url = d.url || d.image || d.data?.url || (typeof d === 'string' ? d : null);
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not fetch dog image.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: '🐶 *Woof!*' });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  fox: {
    category: 'fun', desc: 'Get a random fox image',
    usage: '.fox', aliases: ['foxpic'], permissions: 'all',
    examples: ['.fox'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/animals/fox');
        const url = d.url || d.image || d.data?.url || (typeof d === 'string' ? d : null);
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not fetch fox image.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: '🦊 *A wild fox!*' });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TOOLS  (maps to 'sticker' category in the bot)
// ─────────────────────────────────────────────────────────────────────────────

const toolsCmds = {

  forecast: {
    category: 'sticker', desc: 'Get weather forecast for any city',
    usage: '.forecast <city>', aliases: ['zweather'], permissions: 'all',
    examples: ['.forecast Lagos', '.forecast London'],
    exec: async (args, sock, jid) => {
      const city = args.join(' ').trim();
      if (!city) return sock.sendMessage(jid, { text: '❌ Usage: .forecast <city>' });
      try {
        const d = await zget('/api/v1/weather', { city });
        const w = d.weather || d.data || d;
        const out =
          `🌤️ *Weather: ${w.city || city}, ${w.country || ''}*\n\n` +
          `🌡️  Temp     : ${w.temperature || w.temp || '—'}°C\n` +
          `💧 Humidity : ${w.humidity || '—'}%\n` +
          `💨 Wind     : ${w.windSpeed || w.wind_speed || '—'} km/h\n` +
          `🌥️  Condition: ${w.condition || w.description || w.weather || '—'}\n` +
          `👁️  Feels    : ${w.feelsLike || w.feels_like || '—'}°C`;
        await sock.sendMessage(jid, { text: out });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  cryptoprice: {
    category: 'sticker', desc: 'Get live cryptocurrency price',
    usage: '.cryptoprice <coin>', aliases: ['coin', 'crypto2'], permissions: 'all',
    examples: ['.cryptoprice bitcoin', '.cryptoprice ethereum'],
    exec: async (args, sock, jid) => {
      const id = args.join(' ').toLowerCase().trim();
      if (!id) return sock.sendMessage(jid, { text: '❌ Usage: .cryptoprice <coin id e.g. bitcoin>' });
      try {
        const d = await zget(`/api/v1/crypto/${encodeURIComponent(id)}`);
        const c = d.coin || d.data || d;
        const price = c.current_price || c.price || c.usd || '—';
        const change = c.price_change_percentage_24h || c.change_24h;
        const changeStr = change != null ? ` (${change > 0 ? '+' : ''}${Number(change).toFixed(2)}% 24h)` : '';
        const out =
          `💰 *${c.name || id} (${(c.symbol || '').toUpperCase()})*\n\n` +
          `💵 Price     : $${Number(price).toLocaleString()}${changeStr}\n` +
          `🏅 Rank      : #${c.market_cap_rank || '—'}\n` +
          `📊 Market Cap: $${c.market_cap ? Number(c.market_cap).toLocaleString() : '—'}\n` +
          `📈 24h High  : $${c.high_24h ? Number(c.high_24h).toLocaleString() : '—'}\n` +
          `📉 24h Low   : $${c.low_24h ? Number(c.low_24h).toLocaleString() : '—'}`;
        await sock.sendMessage(jid, { text: out });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  ipinfo: {
    category: 'sticker', desc: 'Get geolocation info for any IP address',
    usage: '.ipinfo <ip>', aliases: ['ip2', 'iplookup'], permissions: 'all',
    examples: ['.ipinfo 8.8.8.8'],
    exec: async (args, sock, jid) => {
      const ip = args[0]?.trim();
      if (!ip) return sock.sendMessage(jid, { text: '❌ Usage: .ipinfo <ip address>' });
      try {
        const d = await zget('/api/v1/ip', { ip });
        const i = d.data || d;
        const out =
          `🌐 *IP Info: ${ip}*\n\n` +
          `📍 Country : ${i.country || '—'}\n` +
          `🏙️  City    : ${i.city || '—'}\n` +
          `🗺️  Region  : ${i.region || '—'}\n` +
          `📡 ISP     : ${i.isp || i.org || '—'}\n` +
          `⏰ Timezone: ${i.timezone || '—'}\n` +
          `🔒 VPN/Proxy: ${i.proxy || i.vpn ? '⚠️ Detected' : '✅ Clean'}`;
        await sock.sendMessage(jid, { text: out });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  myip: {
    category: 'sticker', desc: 'Get info about the bot\'s current IP address (owner only)',
    usage: '.myip', aliases: ['botip'], permissions: 'owner',
    examples: ['.myip'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/ip/me');
        const i = d.data || d;
        const out =
          `🌐 *Bot IP Info*\n\n` +
          `🖥️  IP      : ${i.ip || i.query || '—'}\n` +
          `📍 Country : ${i.country || '—'}\n` +
          `🏙️  City    : ${i.city || '—'}\n` +
          `📡 ISP     : ${i.isp || i.org || '—'}`;
        await sock.sendMessage(jid, { text: out });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  qrcode: {
    category: 'sticker', desc: 'Generate a QR code from any text or URL',
    usage: '.qrcode <text or url>', aliases: ['qr2', 'makeqr'], permissions: 'all',
    examples: ['.qrcode https://google.com', '.qrcode Hello World'],
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .qrcode <text or url>' });
      try {
        const d = await zget('/api/v1/tools/qr', { text });
        const url = d.url || d.image || d.qr || d.data?.url;
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not generate QR code.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: `🔲 *QR Code*\n\n_"${text.slice(0, 60)}"_` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  urlshorten: {
    category: 'sticker', desc: 'Shorten a URL using ZST Labs',
    usage: '.urlshorten <url>', aliases: ['shorten2', 'tinyurl'], permissions: 'all',
    examples: ['.urlshorten https://google.com/very/long/url'],
    exec: async (args, sock, jid) => {
      const url = args[0]?.trim();
      if (!url) return sock.sendMessage(jid, { text: '❌ Usage: .urlshorten <url>' });
      try {
        const d = await zget('/api/v1/shortner/tinyurl', { url });
        const short = d.short || d.shortUrl || d.result || d.url || d.data;
        await sock.sendMessage(jid, { text: `🔗 *Shortened URL*\n\n📎 Original : ${url}\n✅ Short    : ${short}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  hashtext: {
    category: 'sticker', desc: 'Hash any text (MD5, SHA1, SHA256, etc.)',
    usage: '.hashtext <algorithm> <text>', aliases: ['hash2'], permissions: 'all',
    examples: ['.hashtext sha256 hello world', '.hashtext md5 password'],
    exec: async (args, sock, jid) => {
      const algo = args[0]?.toLowerCase() || 'sha256';
      const text = args.slice(1).join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .hashtext <algorithm> <text>\n\nAlgorithms: md5, sha1, sha256, sha512' });
      try {
        const d = await zget('/api/v1/tools/hash', { text, algorithm: algo });
        const hash = d.hash || d.result || d.data?.hash || JSON.stringify(d);
        await sock.sendMessage(jid, {
          text:
            `🔐 *Hash Generator*\n\n` +
            `🔑 Algorithm : ${algo.toUpperCase()}\n` +
            `📝 Input     : ${text.slice(0, 50)}\n\n` +
            `*Hash:*\n\`\`\`${hash}\`\`\``
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  whois: {
    category: 'sticker', desc: 'WHOIS lookup for any domain',
    usage: '.whois <domain>', aliases: ['domaininfo'], permissions: 'all',
    examples: ['.whois google.com'],
    exec: async (args, sock, jid) => {
      const domain = args[0]?.trim();
      if (!domain) return sock.sendMessage(jid, { text: '❌ Usage: .whois <domain>' });
      try {
        const d = await zget('/api/v1/tools/whois', { domain });
        const w = d.data || d;
        const out =
          `🌐 *WHOIS: ${domain}*\n\n` +
          `📋 Registrar   : ${w.registrar || '—'}\n` +
          `📅 Created     : ${w.createdDate || w.created || '—'}\n` +
          `📅 Expires     : ${w.expiresDate || w.expires || '—'}\n` +
          `📊 Status      : ${Array.isArray(w.status) ? w.status[0] : w.status || '—'}\n` +
          `🏢 Registrant  : ${w.registrant?.organization || w.org || '—'}`;
        await sock.sendMessage(jid, { text: out });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  calc: {
    category: 'sticker', desc: 'Evaluate a math expression',
    usage: '.calc <expression>', aliases: ['math2', 'calculate'], permissions: 'all',
    examples: ['.calc 5 * (3 + 2)', '.calc sqrt(144)'],
    exec: async (args, sock, jid) => {
      const expr = args.join(' ').trim();
      if (!expr) return sock.sendMessage(jid, { text: '❌ Usage: .calc <expression>' });
      try {
        const d = await zget('/api/v1/math/calculate', { expression: expr });
        const result = d.result ?? d.answer ?? d.data ?? JSON.stringify(d);
        await sock.sendMessage(jid, { text: `🧮 *Calculator*\n\n📝 ${expr}\n\n= *${result}*` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  fibonacci: {
    category: 'sticker', desc: 'Get the Fibonacci sequence up to N terms',
    usage: '.fibonacci <n>', aliases: ['fib'], permissions: 'all',
    examples: ['.fibonacci 10', '.fibonacci 20'],
    exec: async (args, sock, jid) => {
      const n = parseInt(args[0]);
      if (!n || n < 1 || n > 50) return sock.sendMessage(jid, { text: '❌ Usage: .fibonacci <1-50>' });
      try {
        const d = await zget('/api/v1/math/fibonacci', { n });
        const seq = d.sequence || d.result || d.data || JSON.stringify(d);
        const seqStr = Array.isArray(seq) ? seq.join(', ') : seq;
        await sock.sendMessage(jid, { text: `🔢 *Fibonacci (${n} terms)*\n\n${seqStr}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  isprime: {
    category: 'sticker', desc: 'Check if a number is prime',
    usage: '.isprime <number>', aliases: ['primecheck'], permissions: 'all',
    examples: ['.isprime 17', '.isprime 100'],
    exec: async (args, sock, jid) => {
      const n = args[0];
      if (!n || isNaN(n)) return sock.sendMessage(jid, { text: '❌ Usage: .isprime <number>' });
      try {
        const d = await zget('/api/v1/math/prime', { number: n });
        const isPrime = d.isPrime ?? d.prime ?? d.result;
        const emoji = isPrime ? '✅' : '❌';
        await sock.sendMessage(jid, { text: `🔢 *Prime Check*\n\n${n} ${emoji} ${isPrime ? 'is a prime number' : 'is NOT a prime number'}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  palindrome: {
    category: 'sticker', desc: 'Check if a word or phrase is a palindrome',
    usage: '.palindrome <text>', aliases: ['ispalindrome'], permissions: 'all',
    examples: ['.palindrome racecar', '.palindrome hello'],
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .palindrome <text>' });
      try {
        const d = await zget('/api/v1/text/palindrome', { text });
        const isPalin = d.isPalindrome ?? d.palindrome ?? d.result;
        await sock.sendMessage(jid, {
          text: `🔠 *Palindrome Check*\n\n"${text}"\n\n${isPalin ? '✅ Yes, it\'s a palindrome!' : '❌ Not a palindrome.'}`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  wordcount: {
    category: 'sticker', desc: 'Count words, characters, and sentences in a text',
    usage: '.wordcount <text>', aliases: ['wc', 'charcount'], permissions: 'all',
    examples: ['.wordcount The quick brown fox'],
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .wordcount <text>' });
      try {
        const d = await zget('/api/v1/tools/wordcount', { text });
        const w = d.data || d;
        await sock.sendMessage(jid, {
          text:
            `📊 *Word Count*\n\n` +
            `📝 Words      : ${w.words ?? w.wordCount ?? '—'}\n` +
            `🔤 Characters : ${w.characters ?? w.charCount ?? text.length}\n` +
            `📖 Sentences  : ${w.sentences ?? '—'}\n` +
            `📄 Paragraphs : ${w.paragraphs ?? '—'}`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  colorinfo: {
    category: 'sticker', desc: 'Get a random color with hex and RGB info',
    usage: '.colorinfo', aliases: ['randcolor', 'rcolor'], permissions: 'all',
    examples: ['.colorinfo'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/colors/random');
        const c = d.color || d.data || d;
        await sock.sendMessage(jid, {
          text:
            `🎨 *Random Color*\n\n` +
            `🎨 Name : ${c.name || '—'}\n` +
            `🔷 HEX  : ${c.hex || '—'}\n` +
            `🔴 RGB  : ${c.rgb ? `R:${c.rgb.r || c.rgb[0]} G:${c.rgb.g || c.rgb[1]} B:${c.rgb.b || c.rgb[2]}` : '—'}\n` +
            `🔵 HSL  : ${c.hsl ? `H:${c.hsl.h || c.hsl[0]} S:${c.hsl.s || c.hsl[1]}% L:${c.hsl.l || c.hsl[2]}%` : '—'}`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  currency: {
    category: 'sticker', desc: 'Convert between currencies',
    usage: '.currency <amount> <from> <to>', aliases: ['convert', 'fx'], permissions: 'all',
    examples: ['.currency 100 USD NGN', '.currency 50 EUR USD'],
    exec: async (args, sock, jid) => {
      const [amount, from, to] = args;
      if (!amount || !from || !to) return sock.sendMessage(jid, { text: '❌ Usage: .currency <amount> <from> <to>\nExample: .currency 100 USD NGN' });
      try {
        const d = await zget('/api/v1/currency/convert', { amount, from: from.toUpperCase(), to: to.toUpperCase() });
        const result = d.result || d.convertedAmount || d.data?.result || JSON.stringify(d);
        const rate = d.rate || d.exchangeRate || '';
        await sock.sendMessage(jid, {
          text:
            `💱 *Currency Conversion*\n\n` +
            `💵 ${amount} ${from.toUpperCase()} = *${result} ${to.toUpperCase()}*` +
            (rate ? `\n📊 Rate: 1 ${from.toUpperCase()} = ${rate} ${to.toUpperCase()}` : '')
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  fxrates: {
    category: 'sticker', desc: 'Get live FX exchange rates for a base currency',
    usage: '.fxrates [base]', aliases: ['rates', 'exchangerates'], permissions: 'all',
    examples: ['.fxrates', '.fxrates USD', '.fxrates NGN'],
    exec: async (args, sock, jid) => {
      const base = (args[0] || 'USD').toUpperCase();
      try {
        const d = await zget('/api/v1/currency/rates', { base });
        const rates = d.rates || d.data?.rates || d;
        const top = Object.entries(rates)
          .filter(([k]) => ['NGN','GBP','EUR','JPY','CAD','AUD','CHF','CNY','INR','ZAR'].includes(k))
          .map(([k, v]) => `${k}: ${v}`).join('\n');
        await sock.sendMessage(jid, { text: `💱 *FX Rates (base: ${base})*\n\n${top || JSON.stringify(rates).slice(0, 500)}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  tempmail: {
    category: 'sticker', desc: 'Generate a temporary email address',
    usage: '.tempmail', aliases: ['fakeemail', 'disposable'], permissions: 'all',
    examples: ['.tempmail'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/tempgen/generate');
        const email = d.email || d.address || d.data?.email || JSON.stringify(d);
        await sock.sendMessage(jid, {
          text:
            `📧 *Temp Email Generated*\n\n` +
            `📮 Email   : ${email}\n` +
            `📥 Inbox   : .tempinbox\n` +
            `⚠️ Warning : For testing only. Expires soon.`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  holidays: {
    category: 'sticker', desc: 'Get public holidays for a country and year',
    usage: '.holidays <country code> [year]', aliases: ['pubholidays'], permissions: 'all',
    examples: ['.holidays NG', '.holidays US 2025'],
    exec: async (args, sock, jid) => {
      const country = args[0]?.toUpperCase();
      const year = args[1] || new Date().getFullYear();
      if (!country) return sock.sendMessage(jid, { text: '❌ Usage: .holidays <country code> [year]\nExample: .holidays NG 2025' });
      try {
        const d = await zget('/api/v1/holidays', { country, year });
        const list = d.holidays || d.data || [];
        if (!list.length) return sock.sendMessage(jid, { text: `❌ No holidays found for ${country} ${year}` });
        const text = list.slice(0, 15).map(h => `📅 ${h.date} — *${h.name || h.localName}*`).join('\n');
        await sock.sendMessage(jid, { text: `🎉 *Public Holidays: ${country} ${year}*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOADER
// ─────────────────────────────────────────────────────────────────────────────

const dlCmds = {

  socialdl: {
    category: 'downloader', desc: 'Download media from any social platform (TikTok, IG, Twitter, FB)',
    usage: '.socialdl <url>', aliases: ['sdl', 'mediatdl'], permissions: 'all',
    examples: ['.socialdl https://www.tiktok.com/@user/video/...'],
    exec: async (args, sock, jid) => {
      const url = args[0]?.trim();
      if (!url) return sock.sendMessage(jid, { text: '❌ Usage: .socialdl <url>' });
      await sock.sendMessage(jid, { text: `📥 Fetching media from: ${url}...` });
      try {
        const d = await zget('/api/v1/media/social', { url });
        const mediaUrl = d.url || d.downloadUrl || d.media?.url || d.data?.url;
        if (!mediaUrl) return sock.sendMessage(jid, { text: `❌ Could not extract media.\n\nResponse: ${JSON.stringify(d).slice(0, 200)}` });
        await sock.sendMessage(jid, { text: `✅ *Download Link*\n\n${mediaUrl}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  ytinfo: {
    category: 'downloader', desc: 'Get info and download link for a YouTube video',
    usage: '.ytinfo <url or search query>', aliases: ['ytdetails'], permissions: 'all',
    examples: ['.ytinfo https://youtu.be/dQw4w9WgXcQ'],
    exec: async (args, sock, jid) => {
      const query = args.join(' ').trim();
      if (!query) return sock.sendMessage(jid, { text: '❌ Usage: .ytinfo <youtube url or search>' });
      await sock.sendMessage(jid, { text: `📺 Fetching YouTube info...` });
      try {
        const d = await zget('/api/v1/media/youtube', { url: query });
        const v = d.video || d.data || d;
        await sock.sendMessage(jid, {
          text:
            `📺 *YouTube Video Info*\n\n` +
            `🎬 Title     : ${v.title || '—'}\n` +
            `⏱️  Duration  : ${v.duration || '—'}\n` +
            `👁️  Views     : ${v.views ? Number(v.views).toLocaleString() : '—'}\n` +
            `👤 Channel   : ${v.channel || v.author || '—'}\n` +
            `📅 Published : ${v.publishedAt || v.date || '—'}\n` +
            `🔗 URL       : ${v.url || query}`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  wallpaper: {
    category: 'downloader', desc: 'Get a random or searched wallpaper',
    usage: '.wallpaper [query]', aliases: ['wallp'], permissions: 'all',
    examples: ['.wallpaper', '.wallpaper nature sunset'],
    exec: async (args, sock, jid) => {
      const query = args.join(' ').trim();
      try {
        const endpoint = query ? '/api/v1/wallpaper/search' : '/api/v1/wallpaper/random';
        const params = query ? { q: query } : {};
        const d = await zget(endpoint, params);
        const results = d.wallpapers || d.results || d.data || (d.url ? [d] : [d]);
        const item = Array.isArray(results) ? results[0] : results;
        const url = item?.url || item?.imageUrl || item?.src?.original || item?.hdurl || item;
        if (!url || typeof url !== 'string') return sock.sendMessage(jid, { text: '❌ Could not fetch wallpaper.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: `🖼️ *Wallpaper*${item?.title ? `\n${item.title}` : ''}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOVIES
// ─────────────────────────────────────────────────────────────────────────────

const moviesCmds = {

  yts: {
    category: 'movies', desc: 'Search and download movies via YTS',
    usage: '.yts <movie title>', aliases: ['moviesearch', 'ytsmovie'], permissions: 'all',
    examples: ['.yts Avengers Endgame'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .yts <movie title>' });
      await sock.sendMessage(jid, { text: `🎬 Searching YTS for: _"${q}"_...` });
      try {
        const d = await zget('/api/v1/moviebox/movies', { query: q });
        const movies = d.movies || d.data || [];
        if (!movies.length) return sock.sendMessage(jid, { text: '❌ No movies found.' });
        const text = movies.slice(0, 5).map((m, i) =>
          `${i + 1}. *${m.title}* (${m.year || ''})\n` +
          `   ⭐ ${m.rating || '—'}  📺 ${(m.genres || []).join(', ')}\n` +
          `   🔗 ${m.url || ''}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `🎬 *YTS Movies: "${q}"*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  trending: {
    category: 'movies', desc: 'Get trending movies from MovieBox/YTS',
    usage: '.trending', aliases: ['hotmovies', 'trendingmovies'], permissions: 'all',
    examples: ['.trending'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/moviebox/trending');
        const movies = d.movies || d.data || [];
        const text = movies.slice(0, 8).map((m, i) =>
          `${i + 1}. *${m.title}* (${m.year || ''})\n   ⭐ ${m.rating || '—'}  📺 ${(m.genres || []).slice(0, 2).join(', ')}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `🔥 *Trending Movies*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  tvshow: {
    category: 'movies', desc: 'Search TV shows via TVMaze',
    usage: '.tvshow <show name>', aliases: ['series', 'tvmaze'], permissions: 'all',
    examples: ['.tvshow Breaking Bad', '.tvshow Game of Thrones'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .tvshow <show name>' });
      await sock.sendMessage(jid, { text: `📺 Searching TV shows...` });
      try {
        const d = await zget('/api/v1/moviebox/tv', { query: q });
        const shows = d.shows || d.data || [];
        if (!shows.length) return sock.sendMessage(jid, { text: '❌ No TV shows found.' });
        const text = shows.slice(0, 5).map((s, i) => {
          const show = s.show || s;
          return `${i + 1}. *${show.name}*\n` +
            `   📺 ${show.type || '—'}  ⭐ ${show.rating?.average || '—'}\n` +
            `   📅 ${show.premiered || '—'}  🏁 ${show.status || '—'}\n` +
            `   🌐 ${show.url || ''}`;
        }).join('\n\n');
        await sock.sendMessage(jid, { text: `📺 *TV Shows: "${q}"*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  nkiri: {
    category: 'movies', desc: 'Search movies and series on Nkiri',
    usage: '.nkiri <title>', aliases: ['nkirisearch'], permissions: 'all',
    examples: ['.nkiri Money Heist'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .nkiri <title>' });
      await sock.sendMessage(jid, { text: `🔍 Searching Nkiri...` });
      try {
        const d = await zget('/api/nkiri/search', { q });
        const results = d.results || d.data || [];
        if (!results.length) return sock.sendMessage(jid, { text: '❌ Not found on Nkiri.' });
        const text = results.slice(0, 5).map((r, i) =>
          `${i + 1}. *${r.title || r.name}*\n   🔗 ${r.url || r.link || ''}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `🎬 *Nkiri Results: "${q}"*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  dramakey: {
    category: 'movies', desc: 'Get the latest Korean dramas from DramaKey',
    usage: '.dramakey', aliases: ['kdrama', 'kdramas'], permissions: 'all',
    examples: ['.dramakey'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/dramakey/latest');
        const dramas = d.dramas || d.data || d.results || [];
        if (!dramas.length) return sock.sendMessage(jid, { text: '❌ Could not fetch dramas.' });
        const text = dramas.slice(0, 8).map((dr, i) =>
          `${i + 1}. *${dr.title || dr.name}*\n   📅 ${dr.episode || dr.year || ''}\n   🔗 ${dr.url || dr.link || ''}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `🇰🇷 *Latest K-Dramas (DramaKey)*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  fzmovies: {
    category: 'movies', desc: 'Search for movies on FzMovies',
    usage: '.fzmovies <title>', aliases: ['fzm'], permissions: 'all',
    examples: ['.fzmovies Black Panther'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .fzmovies <title>' });
      await sock.sendMessage(jid, { text: `🔍 Searching FzMovies...` });
      try {
        const d = await zget('/api/fzmovies/search', { q });
        const results = d.results || d.data || d.movies || [];
        if (!results.length) return sock.sendMessage(jid, { text: '❌ Not found on FzMovies.' });
        const text = results.slice(0, 5).map((r, i) =>
          `${i + 1}. *${r.title || r.name}*\n   📅 ${r.year || ''}  🔗 ${r.url || r.link || ''}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `🎬 *FzMovies: "${q}"*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  fzseries: {
    category: 'movies', desc: 'Search for a TV series on FzSeries',
    usage: '.fzseries <title>', aliases: ['fzs', 'fzsearch'], permissions: 'all',
    examples: ['.fzseries Suits'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .fzseries <title>' });
      await sock.sendMessage(jid, { text: `🔍 Searching FzSeries...` });
      try {
        const d = await zget('/api/v1/fzseries/search', { q });
        const results = d.results || d.data || d.series || [];
        if (!results.length) return sock.sendMessage(jid, { text: '❌ Not found on FzSeries.' });
        const text = results.slice(0, 5).map((r, i) =>
          `${i + 1}. *${r.title || r.name}*\n   🔗 ${r.url || r.link || ''}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `📺 *FzSeries: "${q}"*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ANIME
// ─────────────────────────────────────────────────────────────────────────────

const animeCmds = {

  neko: {
    category: 'anime', desc: 'Get a random neko (cat-girl) anime image',
    usage: '.neko', aliases: ['nekopic'], permissions: 'all',
    examples: ['.neko'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/anime/neko');
        const url = d.url || d.image || d.data?.url;
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not fetch neko image.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: '🐱 *Neko!*' });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  waifu2: {
    category: 'anime', desc: 'Get a random waifu anime image',
    usage: '.waifu2', aliases: ['waifupic', 'randomwaifu'], permissions: 'all',
    examples: ['.waifu2'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/waifu/random');
        const url = d.url || d.image || d.data?.url;
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not fetch waifu image.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: '✨ *Waifu!*' });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  animequote: {
    category: 'anime', desc: 'Get a random anime quote',
    usage: '.animequote', aliases: ['aq', 'aniquote'], permissions: 'all',
    examples: ['.animequote'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/anime/quote');
        const q = d.quote || d.data || d;
        const text = q.quote || q.text || q.content || JSON.stringify(q);
        const char = q.character || q.name || '';
        const anime = q.anime || q.series || '';
        await sock.sendMessage(jid, {
          text: `💬 _"${text}"_\n\n— *${char}*${anime ? ` from _${anime}_` : ''}`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  animesearch: {
    category: 'anime', desc: 'Search for anime titles',
    usage: '.animesearch <title>', aliases: ['anisearch', 'findanime'], permissions: 'all',
    examples: ['.animesearch Naruto', '.animesearch Attack on Titan'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .animesearch <title>' });
      await sock.sendMessage(jid, { text: `🔍 Searching anime...` });
      try {
        const d = await zget('/api/v1/animation/search', { q });
        const results = d.results || d.data || d.anime || [];
        if (!results.length) return sock.sendMessage(jid, { text: '❌ No anime found.' });
        const text = results.slice(0, 5).map((a, i) => {
          const anime = a.node || a;
          return `${i + 1}. *${anime.title || anime.title_en || '—'}*\n` +
            `   ⭐ ${anime.mean || anime.score || '—'}  📺 ${anime.mediaType || anime.type || '—'}\n` +
            `   📅 Episodes: ${anime.numEpisodes || anime.episodes || '—'}`;
        }).join('\n\n');
        await sock.sendMessage(jid, { text: `🎌 *Anime Search: "${q}"*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  animetrend: {
    category: 'anime', desc: 'Get trending anime right now',
    usage: '.animetrend', aliases: ['trendanime', 'hotanime'], permissions: 'all',
    examples: ['.animetrend'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/animation/trending');
        const results = d.results || d.data || d.anime || [];
        if (!results.length) return sock.sendMessage(jid, { text: '❌ No trending anime found.' });
        const text = results.slice(0, 8).map((a, i) => {
          const anime = a.node || a;
          return `${i + 1}. *${anime.title || '—'}*\n   ⭐ ${anime.mean || anime.score || '—'}  📺 ${anime.mediaType || '—'}`;
        }).join('\n\n');
        await sock.sendMessage(jid, { text: `🔥 *Trending Anime*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  animeinfo: {
    category: 'anime', desc: 'Get detailed info about a specific anime by MAL ID',
    usage: '.animeinfo <mal-id>', aliases: ['animedetail'], permissions: 'all',
    examples: ['.animeinfo 21', '.animeinfo 5114'],
    exec: async (args, sock, jid) => {
      const id = args[0]?.trim();
      if (!id) return sock.sendMessage(jid, { text: '❌ Usage: .animeinfo <MAL anime ID>' });
      try {
        const d = await zget('/api/v1/animation/info', { id });
        const a = d.data || d.anime || d;
        const out =
          `🎌 *${a.title || a.title_en || '—'}*\n\n` +
          `📝 Synopsis  : ${(a.synopsis || a.description || '—').slice(0, 200)}...\n\n` +
          `⭐ Score     : ${a.score || a.mean || '—'}\n` +
          `📺 Type      : ${a.type || a.mediaType || '—'}\n` +
          `📅 Episodes  : ${a.numEpisodes || a.episodes || '—'}\n` +
          `📊 Status    : ${a.status || '—'}\n` +
          `🎭 Genres    : ${(a.genres || []).map(g => g.name || g).slice(0, 4).join(', ') || '—'}`;
        await sock.sendMessage(jid, { text: out });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  konachan: {
    category: 'anime', desc: 'Get a random anime wallpaper from Konachan',
    usage: '.konachan', aliases: ['aniwallpaper', 'konachanpic'], permissions: 'all',
    examples: ['.konachan'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/anime/konachan');
        const url = d.url || d.image || d.fileUrl || d.data?.url;
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not fetch wallpaper.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: '🎌 *Konachan Wallpaper*' });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SPORTS
// ─────────────────────────────────────────────────────────────────────────────

const sportsCmds = {

  epl: {
    category: 'sports', desc: 'Get the English Premier League standings',
    usage: '.epl', aliases: ['eplstanding', 'premierleague'], permissions: 'all',
    examples: ['.epl'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/sports/football/epl/standings');
        const table = d.standings || d.data || d.table || [];
        if (!table.length) return sock.sendMessage(jid, { text: '❌ Could not fetch EPL standings.' });
        const text = table.slice(0, 10).map((t, i) => {
          const team = t.team || t;
          return `${String(i + 1).padStart(2)}. *${team.name || team.teamName || '—'}*  P:${t.played || t.gamesPlayed || '—'}  Pts:*${t.points || '—'}*`;
        }).join('\n');
        await sock.sendMessage(jid, { text: `⚽ *EPL Standings (Top 10)*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  laliga: {
    category: 'sports', desc: 'Get La Liga standings',
    usage: '.laliga', aliases: ['liga', 'laligastanding'], permissions: 'all',
    examples: ['.laliga'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/sports/football/laliga/standings');
        const table = d.standings || d.data || d.table || [];
        if (!table.length) return sock.sendMessage(jid, { text: '❌ Could not fetch La Liga standings.' });
        const text = table.slice(0, 10).map((t, i) => {
          const team = t.team || t;
          return `${String(i + 1).padStart(2)}. *${team.name || team.teamName || '—'}*  P:${t.played || t.gamesPlayed || '—'}  Pts:*${t.points || '—'}*`;
        }).join('\n');
        await sock.sendMessage(jid, { text: `⚽ *La Liga Standings (Top 10)*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  ucl: {
    category: 'sports', desc: 'Get UEFA Champions League standings',
    usage: '.ucl', aliases: ['championsleague', 'uclstanding'], permissions: 'all',
    examples: ['.ucl'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/sports/football/ucl/standings');
        const table = d.standings || d.data || d.table || [];
        if (!table.length) return sock.sendMessage(jid, { text: '❌ Could not fetch UCL standings.' });
        const text = table.slice(0, 10).map((t, i) => {
          const team = t.team || t;
          return `${String(i + 1).padStart(2)}. *${team.name || team.teamName || '—'}*  P:${t.played || t.gamesPlayed || '—'}  Pts:*${t.points || '—'}*`;
        }).join('\n');
        await sock.sendMessage(jid, { text: `🏆 *Champions League Standings*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  livematch: {
    category: 'sports', desc: 'Get live football matches',
    usage: '.livematch', aliases: ['livefoot', 'fbstatus'], permissions: 'all',
    examples: ['.livematch'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/football/live');
        const matches = d.matches || d.data || d.events || [];
        if (!matches.length) return sock.sendMessage(jid, { text: '⚽ No live matches right now.' });
        const text = matches.slice(0, 10).map((m, i) =>
          `${i + 1}. *${m.homeTeam || m.home}* ${m.score || m.homeScore + '-' + m.awayScore || '?:?'} *${m.awayTeam || m.away}*\n` +
          `   🏆 ${m.competition || m.league || '—'}  ⏱️ ${m.minute || m.elapsed || m.time || '—'}'`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `⚽ *Live Matches*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  fbfixtures: {
    category: 'sports', desc: 'Get upcoming football fixtures',
    usage: '.fbfixtures', aliases: ['fixtures2', 'upcoming'], permissions: 'all',
    examples: ['.fbfixtures'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/football/fixtures');
        const matches = d.fixtures || d.data || d.matches || [];
        if (!matches.length) return sock.sendMessage(jid, { text: '❌ No upcoming fixtures.' });
        const text = matches.slice(0, 10).map((m, i) =>
          `${i + 1}. *${m.homeTeam || m.home}* vs *${m.awayTeam || m.away}*\n` +
          `   📅 ${m.date || m.startTime || '—'}  🏆 ${m.competition || m.league || '—'}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `📅 *Upcoming Football Fixtures*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  allscores: {
    category: 'sports', desc: 'Get all football match scores for today',
    usage: '.allscores', aliases: ['scores', 'todayscores'], permissions: 'all',
    examples: ['.allscores'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/football/all-scores');
        const matches = d.matches || d.data || d.scores || [];
        if (!matches.length) return sock.sendMessage(jid, { text: '❌ No scores available.' });
        const text = matches.slice(0, 15).map((m, i) =>
          `${i + 1}. *${m.homeTeam || m.home}* ${m.score || (m.homeScore + '-' + m.awayScore) || '?:?'} *${m.awayTeam || m.away}*`
        ).join('\n');
        await sock.sendMessage(jid, { text: `⚽ *Today's Scores*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  eplmatches: {
    category: 'sports', desc: 'Get recent and upcoming EPL matches',
    usage: '.eplmatches', aliases: ['plmatches'], permissions: 'all',
    examples: ['.eplmatches'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/sports/football/epl/matches');
        const matches = d.matches || d.data || d.events || [];
        if (!matches.length) return sock.sendMessage(jid, { text: '❌ No EPL matches found.' });
        const text = matches.slice(0, 10).map((m, i) =>
          `${i + 1}. *${m.homeTeam || m.home}* vs *${m.awayTeam || m.away}*\n   📅 ${m.date || m.startTime || '—'}`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `⚽ *EPL Matches*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  playerinfo: {
    category: 'sports', desc: 'Search for a football player',
    usage: '.playerinfo <name>', aliases: ['fplayer'], permissions: 'all',
    examples: ['.playerinfo Messi', '.playerinfo Ronaldo'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .playerinfo <player name>' });
      try {
        const d = await zget('/api/v1/sports/football/player/search', { q });
        const players = d.players || d.data || d.results || [];
        if (!players.length) return sock.sendMessage(jid, { text: '❌ Player not found.' });
        const p = players[0];
        await sock.sendMessage(jid, {
          text:
            `⚽ *Player Info*\n\n` +
            `👤 Name    : *${p.name || p.strPlayer || '—'}*\n` +
            `🏆 Team    : ${p.team || p.strTeam || '—'}\n` +
            `🌍 Nation  : ${p.nationality || p.strNationality || '—'}\n` +
            `📍 Position: ${p.position || p.strPosition || '—'}\n` +
            `📅 Born    : ${p.birthdate || p.dateBorn || '—'}`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RELIGION
// ─────────────────────────────────────────────────────────────────────────────

const religionCmds = {

  bibleverse: {
    category: 'religion', desc: 'Look up a specific Bible verse',
    usage: '.bibleverse <book chapter:verse>', aliases: ['bible2', 'verse'], permissions: 'all',
    examples: ['.bibleverse John 3:16', '.bibleverse Psalms 23:1'],
    exec: async (args, sock, jid) => {
      const ref = args.join(' ').trim();
      if (!ref) return sock.sendMessage(jid, { text: '❌ Usage: .bibleverse <book chapter:verse>\nExample: .bibleverse John 3:16' });
      try {
        const d = await zget('/api/v1/bible/verse', { reference: ref });
        const v = d.verse || d.data || d;
        const text = v.text || v.content || v.verse || JSON.stringify(v);
        const reference = v.reference || v.book || ref;
        await sock.sendMessage(jid, { text: `📖 *${reference}*\n\n_"${text}"_` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  randombible: {
    category: 'religion', desc: 'Get a random famous Bible verse',
    usage: '.randombible', aliases: ['dailybible', 'biblerand'], permissions: 'all',
    examples: ['.randombible'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/bible/random');
        const v = d.verse || d.data || d;
        const text = v.text || v.content || v.verse || JSON.stringify(v);
        const reference = v.reference || v.book || '—';
        await sock.sendMessage(jid, { text: `📖 *Daily Bible Verse*\n\n_"${text}"_\n\n— *${reference}*` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  biblesearch: {
    category: 'religion', desc: 'Search the Bible for a keyword',
    usage: '.biblesearch <keyword>', aliases: ['bsearch'], permissions: 'all',
    examples: ['.biblesearch love', '.biblesearch faith'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❌ Usage: .biblesearch <keyword>' });
      try {
        const d = await zget('/api/v1/bible/search', { q });
        const verses = d.verses || d.results || d.data || [];
        if (!verses.length) return sock.sendMessage(jid, { text: '❌ No results found.' });
        const text = verses.slice(0, 5).map((v, i) =>
          `${i + 1}. *${v.reference || v.book}*\n   _"${(v.text || v.content || '').slice(0, 120)}..."_`
        ).join('\n\n');
        await sock.sendMessage(jid, { text: `📖 *Bible Search: "${q}"*\n\n${text}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  quransurah: {
    category: 'religion', desc: 'Read a Quran surah by number',
    usage: '.quransurah <number>', aliases: ['surah', 'quranread'], permissions: 'all',
    examples: ['.quransurah 1', '.quransurah 112'],
    exec: async (args, sock, jid) => {
      const num = parseInt(args[0]);
      if (!num || num < 1 || num > 114) return sock.sendMessage(jid, { text: '❌ Usage: .quransurah <1-114>' });
      try {
        const d = await zget(`/api/v1/quran/surah/${num}`);
        const s = d.surah || d.data || d;
        const ayahs = (s.ayahs || s.verses || []).slice(0, 5);
        const text = ayahs.map((a, i) => `${i + 1}. ${a.text || a.arabic || a.content || ''}`).join('\n\n');
        await sock.sendMessage(jid, {
          text:
            `📿 *Surah ${num}: ${s.name || s.englishName || s.title || '—'} (${s.englishNameTranslation || s.meaning || ''})*\n\n` +
            text + (s.numberOfAyahs ? `\n\n_(${s.numberOfAyahs} verses — showing first 5)_` : '')
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  randomquran: {
    category: 'religion', desc: 'Get a random Quran ayah (verse)',
    usage: '.randomquran', aliases: ['quranrandom', 'dailyquran'], permissions: 'all',
    examples: ['.randomquran'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/quran/random');
        const v = d.ayah || d.verse || d.data || d;
        const text = v.text || v.arabic || v.content || JSON.stringify(v);
        const translation = v.translation || v.transliteration || '';
        const ref = v.reference || (v.surah && v.ayah ? `Surah ${v.surah}:${v.ayah}` : '—');
        await sock.sendMessage(jid, {
          text:
            `📿 *Daily Quran Verse*\n\n` +
            `_"${text}"_\n` +
            (translation ? `\n💬 _${translation}_\n` : '') +
            `\n— *${ref}*`
        });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  hymn: {
    category: 'religion', desc: 'Get a random hymn',
    usage: '.hymn', aliases: ['randomhymn', 'dailyhymn'], permissions: 'all',
    examples: ['.hymn'],
    exec: async (args, sock, jid) => {
      try {
        const d = await zget('/api/v1/hymns/random');
        const h = d.hymn || d.data || d;
        const title = h.title || h.name || '—';
        const lyrics = (h.lyrics || h.content || h.text || JSON.stringify(h)).slice(0, 600);
        await sock.sendMessage(jid, { text: `🎵 *${title}*\n\n${lyrics}${lyrics.length >= 600 ? '...' : ''}` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS  (generates image cards)
// ─────────────────────────────────────────────────────────────────────────────

const canvasCmds = {

  atmcard: {
    category: 'canvas', desc: 'Generate a fake ATM/credit card image',
    usage: '.atmcard <name> | <bank>', aliases: ['cardgen', 'fakeatm'], permissions: 'all',
    examples: ['.atmcard Olasubomi | First Bank'],
    exec: async (args, sock, jid) => {
      const parts = args.join(' ').split('|').map(s => s.trim());
      const name = parts[0] || 'John Doe';
      const bank = parts[1] || 'ZST Bank';
      try {
        const d = await zpost('/api/v1/canvas/atm-card', { name, bank });
        const url = d.data?.previewUrl || d.data?.frontPreviewUrl || d.data?.url || d.url || d.image;
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not generate card image.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: `💳 *ATM Card for ${name}*` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  tweetcard: {
    category: 'canvas', desc: 'Generate a fake tweet image card',
    usage: '.tweetcard <username> | <text>', aliases: ['faketweetcard', 'twimg'], permissions: 'all',
    examples: ['.tweetcard @Olasubomi | This bot is amazing! 🚀'],
    exec: async (args, sock, jid) => {
      const parts = args.join(' ').split('|').map(s => s.trim());
      const username = (parts[0] || 'User').replace(/^@/, '');
      const text = parts[1] || 'Hello World!';
      try {
        const d = await zpost('/api/v1/canvas/tweet', { username, text });
        const url = d.data?.previewUrl || d.data?.url || d.url || d.image;
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not generate tweet card.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: `🐦 *Tweet Card by @${username}*` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  ytcommentcard: {
    category: 'canvas', desc: 'Generate a fake YouTube comment card',
    usage: '.ytcommentcard <username> | <comment>', aliases: ['ytcomment', 'fakeytcomment'], permissions: 'all',
    examples: ['.ytcommentcard Olasubomi | This video is fire! 🔥'],
    exec: async (args, sock, jid) => {
      const parts = args.join(' ').split('|').map(s => s.trim());
      const username = parts[0] || 'User';
      const comment = parts[1] || 'Great video!';
      try {
        const d = await zpost('/api/v1/canvas/yt-comment', { username, comment });
        const url = d.data?.previewUrl || d.data?.url || d.url || d.image;
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not generate YouTube comment card.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: `📺 *YT Comment by ${username}*` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  wachat: {
    category: 'canvas', desc: 'Generate a fake WhatsApp chat preview card',
    usage: '.wachat <name> | <message>', aliases: ['fakechat', 'whatsappchat'], permissions: 'all',
    examples: ['.wachat Olasubomi | You\'re the best!'],
    exec: async (args, sock, jid) => {
      const parts = args.join(' ').split('|').map(s => s.trim());
      const name = parts[0] || 'Friend';
      const message = parts[1] || 'Hello!';
      try {
        const d = await zpost('/api/v1/canvas/whatsapp', { name, message });
        const url = d.data?.previewUrl || d.data?.url || d.url || d.image;
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not generate WhatsApp chat card.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: `💬 *WhatsApp Chat Preview*` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },

  bizcard: {
    category: 'canvas', desc: 'Generate a business name card',
    usage: '.bizcard <name> | <title> | <company>', aliases: ['businesscard', 'namecard'], permissions: 'all',
    examples: ['.bizcard Olasubomi | Software Engineer | OLASUBOMI-MD'],
    exec: async (args, sock, jid) => {
      const parts = args.join(' ').split('|').map(s => s.trim());
      const name = parts[0] || 'John Doe';
      const title = parts[1] || 'Engineer';
      const company = parts[2] || 'ZST Labs';
      try {
        const d = await zpost('/api/v1/canvas/business-card', { name, title, company });
        const url = d.data?.previewUrl || d.data?.url || d.url || d.image;
        if (!url) return sock.sendMessage(jid, { text: '❌ Could not generate business card.' });
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(jid, { image: Buffer.from(resp.data), caption: `💼 *Business Card for ${name}*` });
      } catch (e) { await errMsg(sock, jid, e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — merge all command groups
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  ...aiCmds,
  ...searchCmds,
  ...funCmds,
  ...toolsCmds,
  ...dlCmds,
  ...moviesCmds,
  ...animeCmds,
  ...sportsCmds,
  ...religionCmds,
  ...canvasCmds,
};
