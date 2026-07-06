// AI Commands — real API integrations with pollinations.ai fallback
const axios = require('axios');

// ─── Provider implementations ─────────────────────────────

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
  const res = await axios.get(url, { timeout: 45000, headers: { 'User-Agent': 'OLASUBOMI-MD/3.0.0' } });
  return String(res.data).trim();
}

// ─── Unified AI handler ───────────────────────────────────

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
    } else {
      // auto: try real key then fall back
      if (process.env.OPENAI_API_KEY) {
        answer = await askOpenAI(query);
      } else {
        answer = await askPollinations(query, 'openai');
      }
    }

    await sock.sendMessage(jid, {
      text: `🤖 *${label}*\n\n❓ ${query}\n\n💬 ${answer}`
    });
  } catch (err) {
    const keyHint = err.message.includes('not set')
      ? `\n\n💡 Set the API key as a Replit Secret to use real ${label}.`
      : '';

    // Fallback to pollinations
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

// ─── Commands ─────────────────────────────────────────────

const aiCommands = {
  ai: {
    desc: 'Ask AI (auto-selects best available model)',
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'AI Assistant', provider: 'auto' })
  },
  gpt: {
    desc: 'Ask ChatGPT (requires OPENAI_API_KEY)',
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'ChatGPT', provider: 'openai', model: 'gpt-3.5-turbo' })
  },
  gpt4: {
    desc: 'Ask GPT-4 (requires OPENAI_API_KEY)',
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'GPT-4', provider: 'openai', model: 'gpt-4o' })
  },
  chatgpt: {
    desc: 'Alias for .gpt',
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'ChatGPT', provider: 'openai' })
  },
  claude: {
    desc: 'Ask Claude AI (requires ANTHROPIC_API_KEY)',
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'Claude', provider: 'claude' })
  },
  gemini: {
    desc: 'Ask Google Gemini (requires GOOGLE_AI_API_KEY)',
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'Gemini', provider: 'gemini' })
  },
  copilot: {
    desc: 'Ask GitHub Copilot (uses OPENAI_API_KEY)',
    exec: (args, sock, jid) => handleAI(args, sock, jid, { label: 'Copilot', provider: 'openai', model: 'gpt-4o' })
  },
  imagine: {
    desc: 'Generate an AI image description',
    exec: async (args, sock, jid) => {
      const prompt = args.join(' ').trim();
      if (!prompt) return sock.sendMessage(jid, { text: '❌ Usage: .imagine <description>' });
      await sock.sendMessage(jid, { text: `🎨 Generating for: _"${prompt}"_...` });
      try {
        const answer = await askPollinations(`Write a vivid, detailed visual description of: ${prompt}`, 'openai');
        await sock.sendMessage(jid, { text: `🎨 *AI Image Description*\n\n${answer}` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },
  translate: {
    desc: 'Translate text to any language',
    exec: async (args, sock, jid) => {
      const input = args.join(' ').trim();
      if (!input) return sock.sendMessage(jid, { text: '❌ Usage: .translate <language> | <text>\nExample: .translate Spanish | Hello world' });
      const [lang, ...rest] = input.split('|');
      const text = rest.join('|').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .translate <language> | <text>' });
      await handleAI(
        [`Translate the following to ${lang.trim()}, reply with only the translation: "${text}"`],
        sock, jid, { label: 'Translate', provider: 'auto' }
      );
    }
  },
  summarize: {
    desc: 'Summarize a long text',
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .summarize <long text>' });
      await handleAI(
        [`Summarize the following in 3-5 bullet points: ${text}`],
        sock, jid, { label: 'Summarize', provider: 'auto' }
      );
    }
  }
};

module.exports = aiCommands;
