// commands/assistant.js — Coding helper, speech generation, and opt-in free chat.

const db = require('../lib/database');
const { resolveIsOwner } = require('../lib/helpers');
const { isBotGenerated } = require('../lib/bot-messages');
const {
  askText,
  generateSpeech,
  getOpenAIKey,
  getFreeChatSystemPrompt,
  getCodingSystemPrompt,
  trimText,
} = require('../lib/ai-service');

const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CHARS = 18_000;
const MAX_SPEECH_CHARS = 1_500;
const freeChatHistory = new Map();

function getConversationKey(ownerJid, jid) {
  return `${ownerJid || 'default'}|${jid || 'unknown'}`;
}

function getHistory(key) {
  return freeChatHistory.get(key) || [];
}

function setHistory(key, history) {
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  let total = trimmed.reduce((sum, item) => sum + String(item.content || '').length, 0);
  while (total > MAX_HISTORY_CHARS && trimmed.length > 2) {
    const removed = trimmed.shift();
    total -= String(removed.content || '').length;
  }
  freeChatHistory.set(key, trimmed);
}

function clearHistoryFor(ownerJid, jid) {
  freeChatHistory.delete(getConversationKey(ownerJid, jid));
}

function extractQuotedText(message) {
  const context =
    message?.message?.extendedTextMessage?.contextInfo ||
    message?.message?.imageMessage?.contextInfo ||
    message?.message?.videoMessage?.contextInfo ||
    null;
  const quoted = context?.quotedMessage;
  return String(
    quoted?.conversation ||
    quoted?.extendedTextMessage?.text ||
    quoted?.imageMessage?.caption ||
    quoted?.videoMessage?.caption ||
    ''
  ).trim();
}

function parseSpeechRequest(args, message) {
  let text = args.join(' ').trim() || extractQuotedText(message);
  let voice = process.env.OPENAI_TTS_VOICE || 'alloy';

  const voiceMatch = text.match(/^--voice(?:=|\s+)(alloy|ash|ballad|coral|echo|fable|nova|onyx|sage|shimmer|verse)\s+(.+)$/i);
  if (voiceMatch) {
    voice = voiceMatch[1].toLowerCase();
    text = voiceMatch[2].trim();
  }
  return { text, voice };
}

async function sendSpeech(text, voice, sock, jid) {
  const mp3 = await generateSpeech(text, { voice });
  await sock.sendMessage(jid, {
    audio: mp3,
    mimetype: 'audio/mpeg',
    ptt: false,
  });
  await sock.sendMessage(jid, {
    text: `🔊 Generated audio (${voice} voice)\n_${text.slice(0, 300)}${text.length > 300 ? '…' : ''}_`
  });
}

async function handleCoding(args, sock, jid, _isGroup, _sender, message, botConfig) {
  const query = trimText(args.join(' ').trim() || extractQuotedText(message));
  if (!query) {
    return sock.sendMessage(jid, {
      text: '💻 *Coding Assistant*\n\nUsage: .code <question, bug, or code>\nExample: .code Fix this JavaScript error: ...'
    });
  }

  await sock.sendMessage(jid, { text: '💻 *Coding Assistant* is reviewing your request…' });
  try {
    const answer = await askText([
      { role: 'system', content: getCodingSystemPrompt(botConfig?.name || 'Vegas-MD') },
      { role: 'user', content: query },
    ], { model: process.env.CODING_AI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini', maxTokens: 1_200 });
    await sock.sendMessage(jid, { text: `💻 *Coding Assistant*\n\n${answer}` });
  } catch (error) {
    console.error('[assistant] coding request failed:', error.message);
    await sock.sendMessage(jid, {
      text: '❌ I could not reach the coding assistant right now. Check OPENAI_API_KEY or try again later.'
    });
  }
}

async function handleSpeak(args, sock, jid, _isGroup, _sender, message) {
  const { text, voice } = parseSpeechRequest(args, message);
  if (!text) {
    return sock.sendMessage(jid, {
      text: '🎙️ *Voice Generator*\n\nUsage: .speak <text>\nOptional: .speak --voice nova <text>\nYou can also reply to a message with .speak.'
    });
  }
  if (text.length > MAX_SPEECH_CHARS) {
    return sock.sendMessage(jid, { text: `❌ Keep voice text under ${MAX_SPEECH_CHARS} characters.` });
  }
  if (!getOpenAIKey()) {
    return sock.sendMessage(jid, {
      text: '❌ Voice generation needs OPENAI_API_KEY. The existing free Google-backed command is still available as .tts.'
    });
  }

  await sock.sendMessage(jid, { text: `🎙️ Generating audio with the *${voice}* voice…` });
  try {
    await sendSpeech(text, voice, sock, jid);
  } catch (error) {
    console.error('[assistant] speech generation failed:', error.message);
    await sock.sendMessage(jid, {
      text: '❌ Audio generation failed. Check your OpenAI key, billing, and TTS access, then try again.'
    });
  }
}

async function handleClearChat(args, sock, jid, _isGroup, _sender, message, botConfig) {
  clearHistoryFor(botConfig?.ownerJid, jid);
  await sock.sendMessage(jid, { text: '🧹 Free-chat memory cleared for this conversation.' });
}

async function handleFreeChat({ text, sock, jid, sender, botConfig, isGroup, message }) {
  const ownerJid = botConfig?.ownerJid || botConfig?.ownerNumber || '';
  const enabled = db.getOwnerSetting(ownerJid, 'freeChat', false) === true;
  if (!enabled || !text) return false;
  if (message?.key?.fromMe === true && isBotGenerated(message.key.id)) return false;

  const isOwner = resolveIsOwner(message, sender, botConfig);
  if (botConfig?.mode === 'private' && !isOwner) return false;

  const allowGroups = db.getOwnerSetting(ownerJid, 'freeChatGroups', false) === true;
  if (isGroup && !allowGroups) return false;

  const key = getConversationKey(ownerJid, jid);
  const history = getHistory(key);
  const userText = trimText(text);
  if (!userText) return false;
  const nextHistory = [...history, { role: 'user', content: userText }];

  try {
    await sock.sendPresenceUpdate('composing', jid).catch(() => {});
    const answer = await askText([
      { role: 'system', content: getFreeChatSystemPrompt(botConfig?.name || 'Vegas-MD') },
      ...nextHistory,
    ], { model: process.env.FREE_CHAT_AI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini', maxTokens: 900 });

    setHistory(key, [...nextHistory, { role: 'assistant', content: answer }]);
    await sock.sendMessage(jid, { text: answer });
  } catch (error) {
    console.error(`[free-chat] failed for ${sender || jid}:`, error.message);
    // Keep the failed user turn out of history so a temporary outage does not
    // pollute the next successful conversation.
    await sock.sendMessage(jid, {
      text: 'I’m having trouble reaching my chat service right now. Please try again in a moment, or use a command such as .help.'
    }).catch(() => {});
  } finally {
    await sock.sendPresenceUpdate('paused', jid).catch(() => {});
  }
  return true;
}

async function handleChat(args, sock, jid, _isGroup, _sender, message, botConfig) {
  const query = trimText(args.join(' ').trim() || extractQuotedText(message));
  if (!query) {
    return sock.sendMessage(jid, {
      text: '💬 *AI Chat*\n\nUsage: .chat <message>\nExample: .chat Explain how WhatsApp bots work.'
    });
  }

  const key = getConversationKey(botConfig?.ownerJid || botConfig?.ownerNumber, jid);
  const history = getHistory(key);
  const nextHistory = [...history, { role: 'user', content: query }];
  await sock.sendPresenceUpdate('composing', jid).catch(() => {});
  try {
    const answer = await askText([
      { role: 'system', content: getFreeChatSystemPrompt(botConfig?.name || 'Vegas-MD') },
      ...nextHistory,
    ], { model: process.env.FREE_CHAT_AI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini', maxTokens: 900 });
    setHistory(key, [...nextHistory, { role: 'assistant', content: answer }]);
    await sock.sendMessage(jid, { text: answer });
  } catch (error) {
    console.error('[assistant] chat request failed:', error.message);
    await sock.sendMessage(jid, {
      text: '❌ I could not reach the AI chat service right now. Please try again later.'
    });
  } finally {
    await sock.sendPresenceUpdate('paused', jid).catch(() => {});
  }
}

const assistantCommands = {
  chat: {
    category: 'ai', reaction: '💬', desc: 'Have a conversational AI chat with bounded memory',
    usage: '.chat <message>', aliases: ['aichat', 'talkai'], permissions: 'all',
    examples: ['.chat Explain how APIs work', '.chat Help me plan a study schedule'],
    exec: handleChat,
  },
  code: {
    category: 'ai', reaction: '💻', desc: 'Get coding help, code reviews, bug fixes, and implementation ideas',
    usage: '.code <question or code>', aliases: ['coding', 'debug'], permissions: 'all',
    examples: ['.code Explain promises in JavaScript', '.code Fix this Python error: ...'],
    exec: handleCoding,
  },
  speak: {
    category: 'ai', reaction: '🎙️', desc: 'Generate spoken audio from text using an AI voice',
    usage: '.speak <text>', aliases: ['generateaudio', 'voiceai'], permissions: 'all',
    examples: ['.speak Welcome to Vegas-MD', '.speak --voice nova Read this message'],
    exec: handleSpeak,
  },
  clearchat: {
    category: 'ai', reaction: '🧹', desc: 'Clear free-chat memory for the current conversation',
    usage: '.clearchat', aliases: ['resetchat'], permissions: 'all',
    examples: ['.clearchat'],
    exec: handleClearChat,
  },
};

assistantCommands.handleFreeChat = handleFreeChat;
assistantCommands._internals = { getHistory, setHistory, clearHistoryFor, parseSpeechRequest };

module.exports = assistantCommands;
