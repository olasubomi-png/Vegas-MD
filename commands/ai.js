'use strict';
// commands/ai.js — AI commands with multi-provider support + pollinations fallback
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

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

// ── Quoted-message helpers (Baileys v7 — matches converter.js / helpers.js) ──
function getMessageContextInfo(message) {
  const m = message?.message;
  if (!m) return null;
  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo        ||
    m.videoMessage?.contextInfo        ||
    m.audioMessage?.contextInfo        ||
    m.stickerMessage?.contextInfo      ||
    m.documentMessage?.contextInfo     ||
    null
  );
}

/** Returns quotedMessage object if it contains an image, else null */
function getQuotedImageMessage(message) {
  const ctx = getMessageContextInfo(message);
  const quoted = ctx?.quotedMessage;
  if (!quoted) return null;
  if (quoted.imageMessage) return quoted;
  // view-once / ephemeral wrappers
  const inner =
    quoted.ephemeralMessage?.message ||
    quoted.viewOnceMessage?.message ||
    quoted.viewOnceMessageV2?.message ||
    quoted.viewOnceMessageV2Extension?.message ||
    null;
  if (inner?.imageMessage) return inner;
  return null;
}

/** Download quoted image buffer via Baileys (same pattern as converter.js) */
async function downloadQuotedImageBuffer(sock, jid, message, quotedMsg) {
  const { downloadMediaMessage } = require('baileys');
  const ctx = getMessageContextInfo(message);
  const fake = {
    key: {
      remoteJid:   jid,
      id:          ctx?.stanzaId || message.key?.id,
      participant: ctx?.participant || message.key?.participant,
      fromMe:      false
    },
    message: quotedMsg
  };
  return downloadMediaMessage(fake, 'buffer', { reuploadRequest: sock.updateMediaMessage });
}

/** Detect mime from buffer magic bytes (fallback jpeg) */
function detectImageMime(buf) {
  if (!buf || buf.length < 4) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Image-to-image edit using Pollinations kontext (reference image URL required).
 * Uploads buffer to a short-lived public host so Pollinations can fetch it.
 */
async function editImageWithPollinations(imageBuffer, prompt) {
  const mime = detectImageMime(imageBuffer);
  const ext  = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  // Temporary public upload (no API key) — 0x0.st style hosts used by many bots
  let publicUrl = null;
  try {
    const FormData = global.FormData || require('form-data');
    const form = new FormData();
    if (typeof Blob !== 'undefined') {
      form.append('file', new Blob([imageBuffer], { type: mime }), `input.${ext}`);
    } else {
      form.append('file', imageBuffer, { filename: `input.${ext}`, contentType: mime });
    }
    const up = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', form, {
      params: { time: '1h' },
      headers: typeof form.getHeaders === 'function' ? form.getHeaders() : {},
      timeout: 60000,
      maxContentLength: 20 * 1024 * 1024
    });
    if (typeof up.data === 'string' && up.data.startsWith('http')) publicUrl = up.data.trim();
  } catch (e) {
    console.error('[Imagine] temp upload failed:', e.message);
  }

  if (!publicUrl) {
    // Fallback: try 0x0.st
    try {
      const FormData = global.FormData || require('form-data');
      const form = new FormData();
      if (typeof Blob !== 'undefined') {
        form.append('file', new Blob([imageBuffer], { type: mime }), `input.${ext}`);
      } else {
        form.append('file', imageBuffer, { filename: `input.${ext}`, contentType: mime });
      }
      const up = await axios.post('https://0x0.st', form, {
        headers: typeof form.getHeaders === 'function' ? form.getHeaders() : {},
        timeout: 60000
      });
      if (typeof up.data === 'string' && up.data.startsWith('http')) publicUrl = up.data.trim();
    } catch (e2) {
      console.error('[Imagine] 0x0.st upload failed:', e2.message);
    }
  }

  if (!publicUrl) throw new Error('Could not host reference image for editing');

  const encoded = encodeURIComponent(prompt);
  const seed    = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encoded}?model=kontext&image=${encodeURIComponent(publicUrl)}&width=512&height=512&nologo=true&seed=${seed}`;
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://pollinations.ai/',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
    }
  });
  const ct = resp.headers['content-type'] || '';
  if (!ct.startsWith('image/')) throw new Error('non-image response from image editor');
  return Buffer.from(resp.data);
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
    category: 'ai',
    desc: 'Generate or edit an AI image — reply to an image to edit it, or text-only to generate',
    usage: '.imagine <description>',
    aliases: [],
    permissions: 'all',
    examples: [
      '.imagine a futuristic city at night',
      '.imagine naruto in hokage robes',
      '.imagine ronaldo lifting the world cup trophy',
      '(reply to image) .imagine turn this into anime'
    ],
    exec: async (args, sock, jid, _isGroup, _sender, message) => {
      const prompt = args.join(' ').trim();
      if (!prompt) {
        return sock.sendMessage(jid, {
          text: '❌ Please provide a description.\n\nUsage:\n.imagine <description>'
        });
      }

      // ── Image-to-image path: user replied to an image ──────────────────
      const quotedImage = message ? getQuotedImageMessage(message) : null;
      if (quotedImage) {
        await sock.sendMessage(jid, {
          text: `🎨 *Imagine AI*\n\nEditing your image...\n\n_"${prompt}"_`
        });
        let tmpIn = null;
        try {
          console.log('[Imagine] Downloading quoted image for edit');
          const imgBuf = await downloadQuotedImageBuffer(sock, jid, message, quotedImage);
          if (!imgBuf || !imgBuf.length) {
            return sock.sendMessage(jid, {
              text: "❌ I couldn't read the image you replied to. Please try again."
            });
          }
          tmpIn = path.join(os.tmpdir(), `imagine_input_${Date.now()}.jpg`);
          fs.writeFileSync(tmpIn, imgBuf);

          const edited = await editImageWithPollinations(imgBuf, prompt);
          await sock.sendMessage(jid, {
            image: edited,
            caption: `🎨 *Imagine AI*\n\n_"${prompt}"_`
          });
          console.log('[Imagine] Edited image sent');
        } catch (err) {
          const safe = String(err.message || err).slice(0, 180);
          console.error('[Imagine] Image edit failed:', safe);
          await sock.sendMessage(jid, {
            text: `❌ Image editing failed. ${safe.includes('read the image') ? safe : 'Please try again.'}`
          });
        } finally {
          if (tmpIn) {
            try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch (_) {}
          }
        }
        return;
      }

      // ── Text-only path (existing Pollinations generation — unchanged) ──

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
        if (!ct.startsWith('image/')) throw new Error('non-image response from primary');

        await sock.sendMessage(jid, {
          image:   Buffer.from(resp.data),
          caption: `${modeLabel} *Imagine AI*\n\n_"${prompt}"_`
        });
      } catch (_primaryErr) {
        // ── Fallback: flux-schnell (faster, more reliable model) ─────
        try {
          const encoded2 = encodeURIComponent(prompt);
          const seed2    = Math.floor(Math.random() * 999999);
          const fallbackUrl = `https://image.pollinations.ai/prompt/${encoded2}?model=flux-schnell&width=512&height=512&nologo=true&seed=${seed2}`;
          const resp2 = await axios.get(fallbackUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://pollinations.ai/',
              'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
            }
          });
          const ct2 = resp2.headers['content-type'] || '';
          if (!ct2.startsWith('image/')) throw new Error('non-image response from fallback');
          await sock.sendMessage(jid, {
            image:   Buffer.from(resp2.data),
            caption: `${modeLabel} *Imagine AI*\n\n_"${prompt}"_`
          });
        } catch (_fallbackErr) {
          // ── Last resort: turbo model ──────────────────────────────
          try {
            const encoded3 = encodeURIComponent(prompt);
            const seed3    = Math.floor(Math.random() * 999999);
            const lastUrl  = `https://image.pollinations.ai/prompt/${encoded3}?model=turbo&width=512&height=512&nologo=true&seed=${seed3}`;
            const resp3 = await axios.get(lastUrl, {
              responseType: 'arraybuffer',
              timeout: 60000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://pollinations.ai/',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
              }
            });
            const ct3 = resp3.headers['content-type'] || '';
            if (!ct3.startsWith('image/')) throw new Error('non-image response from last resort');
            await sock.sendMessage(jid, {
              image:   Buffer.from(resp3.data),
              caption: `${modeLabel} *Imagine AI*\n\n_"${prompt}"_`
            });
          } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Image generation failed after 3 attempts: ${err.message}` });
          }
        }
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
  },
  imaginevid: {
    category: 'ai',
    desc: 'Generate an AI video from text, or animate a replied image with Runway',
    usage: '.imaginevid <description>',
    aliases: [],
    permissions: 'all',
    examples: [
      '.imaginevid a dragon flying over a futuristic city',
      '(reply to image) .imaginevid make the character slowly walk toward the camera'
    ],
    exec: async (args, sock, jid, _isGroup, _sender, message) => {
      const prompt = args.join(' ').trim();
      if (!prompt) {
        return sock.sendMessage(jid, {
          text: '❌ Please provide a description.\n\nUsage:\n.imaginevid <description>'
        });
      }

      const apiKey = process.env.RUNWAY_API_KEY;
      if (!apiKey) {
        return sock.sendMessage(jid, {
          text: '❌ Runway API key is not configured.'
        });
      }

      const quotedImage = message ? getQuotedImageMessage(message) : null;
      const isImageToVideo = !!quotedImage;

      if (isImageToVideo) {
        await sock.sendMessage(jid, {
          text: `🎬 *Imagine Video AI*\n\nUsing your image as the starting frame...\n\n_"${prompt}"_`
        });
      } else {
        await sock.sendMessage(jid, {
          text: `🎬 *Imagine Video AI*\n\nGenerating your video...\n\nPrompt:\n_"${prompt}"_`
        });
      }

      let tmpIn = null;
      let tmpOut = null;
      try {
        console.log(`[ImagineVideo] Starting generation (mode=${isImageToVideo ? 'image-to-video' : 'text-to-video'})`);

        const enhancedPrompt = `${prompt}, cinematic motion, natural movement, coherent subject motion, detailed lighting, high-quality composition`;

        const RunwayML = require('@runwayml/sdk').default || require('@runwayml/sdk');
        const client = new RunwayML({ apiKey });

        const MAX_WAIT_MS = 5 * 60 * 1000;
        let createPromise;

        if (isImageToVideo) {
          console.log('[ImagineVideo] Downloading quoted image');
          let imgBuf;
          try {
            imgBuf = await downloadQuotedImageBuffer(sock, jid, message, quotedImage);
          } catch (dlErr) {
            console.error('[ImagineVideo] Quoted image download failed:', dlErr.message);
            return sock.sendMessage(jid, {
              text: "❌ I couldn't read the image you replied to. Please try again."
            });
          }
          if (!imgBuf || !imgBuf.length) {
            return sock.sendMessage(jid, {
              text: "❌ I couldn't read the image you replied to. Please try again."
            });
          }

          // Keep under Runway data-URI limit (~5MB encoded ≈ ~3.3MB raw)
          if (imgBuf.length > 3.2 * 1024 * 1024) {
            console.log('[ImagineVideo] Image large; still attempting data URI');
          }

          tmpIn = path.join(os.tmpdir(), `imaginevid_input_${Date.now()}.jpg`);
          fs.writeFileSync(tmpIn, imgBuf);

          const mime = detectImageMime(imgBuf);
          const dataUri = `data:${mime};base64,${imgBuf.toString('base64')}`;
          console.log('[ImagineVideo] Creating image-to-video task');

          createPromise = client.imageToVideo
            .create({
              model: 'gen4.5',
              promptImage: dataUri,
              promptText: enhancedPrompt,
              ratio: '1280:720',
              duration: 5
            })
            .waitForTaskOutput();
        } else {
          // Existing text-to-video path
          createPromise = client.textToVideo
            .create({
              model: 'gen4.5',
              promptText: enhancedPrompt,
              ratio: '1280:720',
              duration: 5
            })
            .waitForTaskOutput();
        }

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT')), MAX_WAIT_MS);
        });

        const task = await Promise.race([createPromise, timeoutPromise]);
        console.log(`[ImagineVideo] Task completed: ${task && task.id ? task.id : 'unknown'}`);

        if (!task || !task.output || !task.output.length) {
          throw new Error('No video output returned from Runway');
        }

        const videoUrl = task.output[0];
        console.log('[ImagineVideo] Generation completed');
        console.log('[ImagineVideo] Downloading video');

        const resp = await axios.get(videoUrl, {
          responseType: 'arraybuffer',
          timeout: 120000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const buffer = Buffer.from(resp.data);
        tmpOut = path.join(os.tmpdir(), `imaginevid_${Date.now()}.mp4`);
        fs.writeFileSync(tmpOut, buffer);

        console.log('[ImagineVideo] Sending video');
        await sock.sendMessage(jid, {
          video: buffer,
          mimetype: 'video/mp4',
          caption: `🎬 *Imagine Video AI*\n\n_"${prompt}"_`
        });
        console.log('[ImagineVideo] Video sent');
      } catch (err) {
        const msg = (err && err.message) ? String(err.message) : 'Unknown error';
        if (msg === 'TIMEOUT' || /timeout/i.test(msg)) {
          await sock.sendMessage(jid, {
            text: '⏱️ Video generation timed out. Please try again with a shorter or simpler prompt.'
          });
        } else if (/send|whatsapp|baileys/i.test(msg)) {
          await sock.sendMessage(jid, {
            text: '❌ The video was generated, but I couldn\'t send it to WhatsApp.'
          });
        } else {
          const safe = msg
            .replace(/key_[a-f0-9]+/gi, '[REDACTED]')
            .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
            .slice(0, 200);
          console.error('[ImagineVideo] Generation failed:', safe);
          await sock.sendMessage(jid, {
            text: '❌ Video generation failed.\nTry again with another prompt.'
          });
        }
      } finally {
        for (const f of [tmpIn, tmpOut]) {
          if (!f) continue;
          try {
            if (fs.existsSync(f)) fs.unlinkSync(f);
          } catch (_) { /* ignore */ }
        }
        console.log('[ImagineVideo] Temporary files cleaned');
      }
    }
  }
};

module.exports = aiCommands;
