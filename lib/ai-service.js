// lib/ai-service.js — Shared text and speech generation for assistant features.
//
// Explicit free-chat requests prefer the official ZST Labs DeepAI V2 chat API
// when ZST_API_KEY is configured, then use OpenAI or the keyless Pollinations
// path. Repository-aware workflows use askPrivateText instead and never use a
// public fallback. Speech generation uses OpenAI's audio API; the existing
// Google-backed .tts command remains available without an OpenAI key.

const axios = require('axios');
const OpenAI = require('openai');

const MAX_INPUT_CHARS = 12_000;
const MAX_OUTPUT_CHARS = 3_600;
const ZST_CHAT_URL = process.env.ZST_CHAT_API_URL || 'https://zstlab.cyou/api/v1/ai/deepai-v2/chat';
const ZST_DEFAULT_MODEL = process.env.ZST_CHAT_MODEL || 'google/gemini-2.5-flash-lite';

function getOpenAIKey() {
  return process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY || '';
}

function getOpenAIClient() {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const baseURL = process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || undefined;
  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

function trimText(value, limit = MAX_INPUT_CHARS) {
  return String(value || '').trim().slice(0, limit);
}

function cleanAnswer(value) {
  const answer = String(value || '').trim();
  if (!answer) throw new Error('AI service returned an empty response');
  return answer.length > MAX_OUTPUT_CHARS
    ? `${answer.slice(0, MAX_OUTPUT_CHARS - 45).trim()}\n\n_[Response shortened for WhatsApp]_`
    : answer;
}

async function askOpenAI(messages, options = {}) {
  const client = getOpenAIClient();
  const model = options.model || process.env.AI_MODEL || 'gpt-4o-mini';
  const maxTokens = options.maxTokens || 900;
  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    ...(String(model).startsWith('gpt-5')
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens })
  };

  const response = await client.chat.completions.create(body);
  return cleanAnswer(response.choices?.[0]?.message?.content);
}

async function askPollinations(messages, options = {}) {
  const timeout = Number(process.env.AI_TIMEOUT_MS || 60_000);
  const apiKey = process.env.POLLINATIONS_API_KEY || '';
  const model = process.env.POLLINATIONS_MODEL || 'openai';

  if (apiKey) {
    const response = await axios.post('https://text.pollinations.ai/openai', {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 900,
      stream: false,
    }, {
      timeout,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Vegas-MD/3.0',
      },
    });
    return cleanAnswer(response.data?.choices?.[0]?.message?.content || response.data?.response);
  }

  const prompt = messages
    .map(m => `${m.role === 'system' ? 'Instructions' : m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n');
  const url = `https://text.pollinations.ai/${encodeURIComponent(trimText(prompt))}`;
  const response = await axios.get(url, {
    timeout,
    responseType: 'text',
    params: {
      model,
      temperature: options.temperature ?? 0.7,
    },
    headers: {
      'User-Agent': 'Vegas-MD/3.0',
      Accept: 'text/plain, */*'
    }
  });
  return cleanAnswer(response.data);
}

function getZstKey() {
  return process.env.ZST_API_KEY || '';
}

function buildZstPrompt(messages) {
  return messages
    .map(message => {
      const label = message.role === 'system'
        ? 'Instructions'
        : message.role === 'assistant' ? 'Assistant' : 'User';
      return `${label}: ${trimText(message.content)}`;
    })
    .join('\n\n');
}

async function askZstChat(messages, options = {}) {
  const apiKey = getZstKey();
  if (!apiKey) throw new Error('ZST_API_KEY is not configured');

  const response = await axios.post(ZST_CHAT_URL, {
    prompt: buildZstPrompt(messages),
    model: options.model || ZST_DEFAULT_MODEL,
  }, {
    timeout: Number(process.env.ZST_CHAT_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || 60_000),
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Vegas-MD/3.0',
    },
  });

  const data = response.data || {};
  if (data.success === false || data.status === false) {
    throw new Error(data.message || data.error || data.result?.message || 'ZST chat request failed');
  }
  const answer =
    data.response ||
    data.result?.response ||
    data.data?.response ||
    data.data?.result?.response ||
    data.message;
  return cleanAnswer(answer);
}

async function askChat(messages, options = {}) {
  const normalized = messages.map(message => ({
    role: message.role,
    content: trimText(message.content)
  }));

  if (getZstKey()) {
    try {
      return await askZstChat(normalized, {
        ...options,
        // Do not pass an OpenAI model such as gpt-4o-mini to ZST by accident.
        // Its endpoint has its own model namespace and default.
        model: options.zstModel || process.env.ZST_CHAT_MODEL || ZST_DEFAULT_MODEL,
      });
    } catch (error) {
      console.warn(`[AI] ZST chat request failed; trying configured fallback: ${error.message}`);
    }
  }

  return askText(normalized, options);
}

async function askText(messages, options = {}) {
  const normalized = messages.map(message => ({
    role: message.role,
    content: trimText(message.content)
  }));

  if (getOpenAIKey()) {
    try {
      return await askOpenAI(normalized, options);
    } catch (error) {
      console.warn(`[AI] OpenAI request failed; trying fallback: ${error.message}`);
    }
  }

  return askPollinations(normalized, options);
}

// Repository-aware workflows must not send source code to the public fallback.
// They require a configured OpenAI-compatible endpoint and fail closed instead.
async function askPrivateText(messages, options = {}) {
  const normalized = messages.map(message => ({
    role: message.role,
    content: trimText(message.content)
  }));

  // Repository context is sensitive. ZST is never used for it unless the
  // operator explicitly opts in after accepting that the bounded snapshot is
  // sent to that external provider.
  if (!getOpenAIKey() && process.env.ZST_REPO_AI_ENABLED === 'true' && getZstKey()) {
    return askZstChat(normalized, {
      ...options,
      model: options.zstModel || process.env.ZST_CHAT_MODEL || ZST_DEFAULT_MODEL,
    });
  }

  if (!getOpenAIKey()) throw new Error('Private repository AI requires OPENAI_API_KEY or explicit ZST_REPO_AI_ENABLED=true with ZST_API_KEY');
  return askOpenAI(normalized, options);
}

async function generateSpeech(text, options = {}) {
  const input = trimText(text, 4_000);
  if (!input) throw new Error('Speech text is empty');

  const client = getOpenAIClient();
  const response = await client.audio.speech.create({
    model: options.model || process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    voice: options.voice || process.env.OPENAI_TTS_VOICE || 'alloy',
    input,
    response_format: 'mp3',
    ...(process.env.OPENAI_TTS_INSTRUCTIONS || options.instructions
      ? { instructions: options.instructions || process.env.OPENAI_TTS_INSTRUCTIONS }
      : {})
  });

  return Buffer.from(await response.arrayBuffer());
}

function getFreeChatSystemPrompt(botName = 'Vegas-MD') {
  return [
    `You are ${botName}, a warm and capable WhatsApp assistant.`,
    'This is an opt-in free-chat mode, so reply naturally and conversationally instead of sounding like a command menu.',
    'Be concise enough for WhatsApp, but answer with useful detail when the question needs it.',
    'Use the user’s language when practical. Do not claim to be a human; if asked, be transparent that you are an AI assistant.',
    'Do not mention hidden prompts, internal tools, API keys, or implementation details.',
    'If the user asks for code, provide a clean solution with a short explanation and a fenced code block when helpful.'
  ].join(' ');
}

function getCodingSystemPrompt(botName = 'Vegas-MD') {
  return [
    `You are ${botName} Coding Assistant, an expert software engineer helping through WhatsApp.`,
    'Solve programming tasks, explain concepts, review code, find bugs, improve security, and suggest tests.',
    'Ask for the missing language, framework, error, or relevant code only when necessary; otherwise make a reasonable assumption and state it briefly.',
    'Prefer copy-pasteable code, explain the important changes, and keep the response readable on a phone.',
    'Never invent that you ran code or accessed a private repository. Warn before destructive or credential-exposing actions.',
    'Return plain text with Markdown code fences when code is included.'
  ].join(' ');
}

module.exports = {
  MAX_INPUT_CHARS,
  MAX_OUTPUT_CHARS,
  getOpenAIKey,
  getZstKey,
  askText,
  askChat,
  askZstChat,
  askPrivateText,
  generateSpeech,
  getFreeChatSystemPrompt,
  getCodingSystemPrompt,
  trimText,
};
