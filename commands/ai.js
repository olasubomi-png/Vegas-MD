'use strict';
// commands/ai.js — AI commands with multi-provider support + pollinations fallback
const axios = require('axios');

async function askOpenAI(query, model = 'gpt-3.5-turbo') {
  const { OpenAI } = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  const url = `https://text.pollinations.ai/${encodeURIComponent(query)}?model=${model}&seed=${Math.floor(Math.random() * 9999)}`;
  const res  = await axios.get(url, { timeout: 45000, headers: { 'User-Agent': 'OLASUBOMI-MD/3.0.0' } });
  return String(res.data).trim();
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
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
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
      answer = process.env.OPENAI_API_KEY
        ? await askOpenAI(query)
        : await askPollinations(query, 'openai');
    }

    await sock.sendMessage(jid, {
      text: `🤖 *${label}*\n\n❓ ${query}\n\n💬 ${answer}`
    });
  } catch (err) {
    const keyHint = err.message.includes('not set')
      ? `\n\n💡 Set the API key as a Replit Secret to use real ${label}.`
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
    category: 'ai', desc: 'Generate an AI image from a description',
    usage: '.imagine <description>', aliases: [], permissions: 'all',
    examples: ['.imagine a futuristic city at night', '.imagine cute cat wearing sunglasses'],
    exec: async (args, sock, jid) => {
      const prompt = args.join(' ').trim();
      if (!prompt) return sock.sendMessage(jid, { text: '❌ Usage: .imagine <description>' });
      await sock.sendMessage(jid, { text: `🎨 *Imagine AI* generating image...\n\n_"${prompt}"_` });
      try {
        const encoded = encodeURIComponent(prompt);
        const imgUrl  = `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 999999)}`;
        await sock.sendMessage(jid, {
          image:   { url: imgUrl },
          caption: `🎨 *Imagine AI*\n\n_"${prompt}"_`
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
        const imgUrl  = `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=768&height=768&nologo=true`;
        await sock.sendMessage(jid, {
          image:   { url: imgUrl },
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
