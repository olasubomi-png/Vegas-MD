'use strict';
// commands/ai.js — AI commands with multi-provider support + pollinations fallback
const axios = require('axios');

async function askOpenAI(query, model = 'gpt-3.5-turbo') {
  const { OpenAI } = require('openai');
  // Accept both OPENAI_API_KEY and the common typo OPEN_API_KEY
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: query }],
    max_tokens: 1024
  });
  return res.choices[0].message.content.trim();
}

async function askClaude(query) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1024,
    messages: [{ role: 'user', content: query }]
  });
  return res.content[0].text.trim();
}

async function askGemini(query) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(query);
  return result.response.text().trim();
}

async function askPollinations(query, model = 'openai') {
  const seed = Math.floor(Math.random() * 99999);
  const url  = `https://text.pollinations.ai/${encodeURIComponent(query)}?model=${model}&seed=${seed}`;
  const res  = await axios.get(url, {
    timeout: 60000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':     'text/plain, */*'
    }
  });
  const text = typeof res.data === 'string' ? res.data.trim() : String(res.data || '').trim();
  if (!text) throw new Error('Empty response from AI service');
  return text;
}

async function handleAI(args, sock, jid, opts = {}) {
  const { label = 'AI', provider = 'auto', model } = opts;
  const query = args.join(' ').trim();

  if (!query) {
    return sock.sendMessage(jid, {
      text: `❌ Please include a question.\n\n*Usage:* .${label.toLowerCase()} <question>`
    });
  }

  await sock.sendMessage(jid, { text: `🤖 *${label}* is thinking...\n\n_"${query}"_` });

  try {
    let answer;
    if (provider === 'openai') {
      if (!process.env.OPENAI_API_KEY && !process.env.OPEN_API_KEY) throw new Error('OPENAI_API_KEY not set');
      answer = await askOpenAI(query, model);
    } else if (provider === 'claude') {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
      answer = await askClaude(query);
    } else if (provider === 'gemini') {
      if (!process.env.GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY not set');
      answer = await askGemini(query);
    } else if (provider === 'deepseek') {
      answer = await askPollinations(query, 'deepseek');
    } else {
      answer = (process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY)
        ? await askOpenAI(query)
        : await askPollinations(query, 'openai');
    }

    await sock.sendMessage(jid, {
      text: `🤖 *${label}*\n\n❓ ${query}\n\n💬 ${answer}`
    });
  } catch (err) {
    const keyHint = err.message.includes('not set')
      ? `\n\n💡 Add OPENAI_API_KEY=your_key to your .env file to use real ${label}.`
      : '';
    try {
      const fallback = await askPollinations(query, 'openai');
      await sock.sendMessage(jid, {
        text: `🤖 *${label}* _(free tier)_\n\n❓ ${query}\n\n💬 ${fallback}${keyHint}`
      });
    } catch {
      await sock.sendMessage(jid, {
        text: `❌ *${label} failed:* ${err.message}${keyHint}`
      });
    }
  }
}

const aiCommands = {
  ai: {
    category: 'ai', desc: 'Ask AI (auto-selects best model)',
    usage: '.ai <question>', aliases: [], permissions: 'all',
    examples: ['.ai What is Node.js?'],
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'AI Assistant', provider: 'auto' })
  },
  gpt: {
    category: 'ai', desc: 'Ask ChatGPT (GPT-3.5)',
    usage: '.gpt <question>', aliases: [], permissions: 'all',
    examples: ['.gpt Explain async/await'],
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'ChatGPT', provider: 'openai', model: 'gpt-3.5-turbo' })
  },
  gpt4: {
    category: 'ai', desc: 'Ask GPT-4o (most capable)',
    usage: '.gpt4 <question>', aliases: [], permissions: 'all',
    examples: ['.gpt4 Write a poem about rain'],
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'GPT-4', provider: 'openai', model: 'gpt-4o' })
  },
  chatgpt: {
    category: 'ai', desc: 'ChatGPT alias',
    usage: '.chatgpt <question>', aliases: ['gpt'], permissions: 'all',
    examples: ['.chatgpt Translate hello to French'],
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'ChatGPT', provider: 'openai' })
  },
  claude: {
    category: 'ai', desc: 'Ask Anthropic Claude',
    usage: '.claude <question>', aliases: [], permissions: 'all',
    examples: ['.claude Summarize the French Revolution'],
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'Claude', provider: 'claude' })
  },
  gemini: {
    category: 'ai', desc: 'Ask Google Gemini',
    usage: '.gemini <question>', aliases: [], permissions: 'all',
    examples: ['.gemini What is quantum computing?'],
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'Gemini', provider: 'gemini' })
  },
  copilot: {
    category: 'ai', desc: 'Ask GitHub Copilot (GPT-4o)',
    usage: '.copilot <question>', aliases: [], permissions: 'all',
    examples: ['.copilot Write a bubble sort in Python'],
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'Copilot', provider: 'openai', model: 'gpt-4o' })
  },
  deepseek: {
    category: 'ai', desc: 'Ask DeepSeek AI (free, no key needed)',
    usage: '.deepseek <question>', aliases: [], permissions: 'all',
    examples: ['.deepseek Explain machine learning'],
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'DeepSeek', provider: 'deepseek' })
  },
  explain: {
    category: 'ai', desc: 'Get a simple explanation of any topic',
    usage: '.explain <topic>', aliases: [], permissions: 'all',
    examples: ['.explain blockchain', '.explain photosynthesis'],
    exec: async (args, sock, jid) => {
      const topic = args.join(' ').trim();
      if (!topic) return sock.sendMessage(jid, { text: '❌ Usage: .explain <topic>' });
      await handleAI(
        [`Explain "${topic}" in simple, easy-to-understand terms with an example. Be concise.`],
        sock, jid, { label: 'Explain', provider: 'auto' }
      );
    }
  },
  imagine: {
    category: 'ai', desc: 'Generate an AI image — auto-detects anime vs photorealistic style',
    usage: '.imagine <description>', aliases: [], permissions: 'all',
    examples: [
      '.imagine a futuristic city at night',
      '.imagine naruto in hokage robes',
      '.imagine ronaldo lifting the world cup trophy'
    ],
    exec: async (args, sock, jid) => {
      const prompt = args.join(' ').trim();
      if (!prompt) return sock.sendMessage(jid, { text: '❌ Usage: .imagine <description>' });

      // ── Detect whether the prompt calls for anime or photorealistic output ──
      const ANIME_KEYWORDS = [
        'anime', 'manga', 'chibi', 'kawaii', 'waifu', 'otaku', 'sakura',
        'naruto', 'goku', 'luffy', 'sasuke', 'ichigo', 'levi', 'eren', 'mikasa',
        'gojo', 'itadori', 'tanjiro', 'zenitsu', 'inosuke', 'killua', 'gon',
        'nezuko', 'todoroki', 'deku', 'bakugo', 'zoro', 'nami',
        'dragon ball', 'one piece', 'attack on titan', 'demon slayer',
        'jujutsu kaisen', 'my hero academia', 'sword art online', 'fairy tail',
        'bleach', 'fullmetal alchemist', 'death note', 'hunter x hunter',
        'chainsaw man', 'spy x family', 'vinland saga', 'overlord', 're:zero',
        'cartoon', 'animated', 'illustration', 'drawing', 'sketch', 'toon',
        '2d art', 'pixel art', 'cel-shaded', 'comic', 'watercolor',
        'oil painting', 'painterly', 'stylized', 'digital art'
      ];
      const isAnime    = ANIME_KEYWORDS.some(kw => prompt.toLowerCase().includes(kw));
      const modeLabel  = isAnime ? '🎌 Anime' : '📸 Realistic';
      const model      = isAnime ? 'flux' : 'flux-realism';
      const extraParam = isAnime ? '' : '&enhance=true';

      await sock.sendMessage(jid, { text: `${modeLabel} *Imagine AI* generating...\n\n_"${prompt}"_` });
      try {
        const encoded = encodeURIComponent(prompt);
        const seed    = Math.floor(Math.random() * 999999);
        // Use 512×512 — faster than 1024×1024, well within Baileys' image limit,
        // and still high quality for WhatsApp display.
        const imgUrl  = `https://image.pollinations.ai/prompt/${encoded}?model=${model}&width=512&height=512&nologo=true&seed=${seed}`;

        // Download buffer server-side with browser headers.
        // Passing { url } directly to Baileys fails because Baileys' internal
        // fetch is blocked by Cloudflare on some server IPs.
        const resp = await axios.get(imgUrl, {
          responseType: 'arraybuffer',
          timeout:      60000,
          headers: {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer':         'https://pollinations.ai/',
            'Accept':          'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });

        // Guard: if pollinations returned an HTML error page instead of an image,
        // the content-type will be text/* — catch it early with a clear message.
        const ct = resp.headers['content-type'] || '';
        if (!ct.startsWith('image/')) {
          throw new Error(`Image service returned non-image response (${ct || 'unknown type'}). Try again.`);
        }

        await sock.sendMessage(jid, {
          image:   Buffer.from(resp.data),
          caption: `${modeLabel} *Imagine AI*\n\n_"${prompt}"_`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Image generation failed: ${err.message}` });
      }
    }
  },
  flux: {
    category: 'ai', desc: 'Generate an image with Flux AI (via pollinations)',
    usage: '.flux <description>', aliases: [], permissions: 'all',
    examples: ['.flux sunset over the ocean in anime style'],
    exec: async (args, sock, jid) => {
      const prompt = args.join(' ').trim();
      if (!prompt) return sock.sendMessage(jid, { text: '❌ Usage: .flux <image description>' });
      await sock.sendMessage(jid, { text: `🖼️ *Flux AI* generating...\n\n_"${prompt}"_` });
      try {
        const encoded = encodeURIComponent(prompt);
        const seed    = Math.floor(Math.random() * 999999);
        const imgUrl  = `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=512&height=512&nologo=true&seed=${seed}`;
        // Download server-side — passing { url } directly to Baileys is blocked on some IPs
        const resp = await axios.get(imgUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://pollinations.ai/',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
          }
        });
        const ct = resp.headers['content-type'] || '';
        if (!ct.startsWith('image/')) throw new Error(`Service returned non-image response. Try again.`);
        await sock.sendMessage(jid, {
          image:   Buffer.from(resp.data),
          caption: `🖼️ *Flux AI*\n\n_"${prompt}"_`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Image generation failed: ${err.message}` });
      }
    }
  },
  translate: {
    category: 'ai', desc: 'Translate text to any language',
    usage: '.translate <language> | <text>', aliases: [], permissions: 'all',
    examples: ['.translate Spanish | Hello world', '.translate French | Good morning'],
    exec: async (args, sock, jid) => {
      const input = args.join(' ').trim();
      if (!input) return sock.sendMessage(jid, { text: '❌ Usage: .translate <language> | <text>' });
      const [lang, ...rest] = input.split('|');
      const text = rest.join('|').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .translate <language> | <text>' });
      await handleAI(
        [`Translate this to ${lang.trim()}, reply with only the translation: "${text}"`],
        sock, jid, { label: 'Translate', provider: 'auto' }
      );
    }
  },
  summarize: {
    category: 'ai', desc: 'Summarize a long piece of text',
    usage: '.summarize <text>', aliases: [], permissions: 'all',
    examples: ['.summarize <paste long article here>'],
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .summarize <long text>' });
      await handleAI(
        [`Summarize the following in 3-5 bullet points:\n\n${text}`],
        sock, jid, { label: 'Summarize', provider: 'auto' }
      );
    }
  }
};

module.exports = aiCommands;
