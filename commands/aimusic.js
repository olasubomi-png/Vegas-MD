'use strict';

const {
  MAX_AUDIO_BYTES,
  createAiMusic,
  downloadMedia,
  extractTaskId,
  findField,
  firstMediaUrl,
  unwrapResult,
  waitForAiMusic,
} = require('../lib/david-cyril-api');

const SUPPORTED_MODELS = new Set(['v3.5', 'v4.0', 'v4.5', 'v4.5-plus', 'v5.0']);
const MAX_PROMPT_CHARS = 600;

function parseAiMusicRequest(args) {
  const promptParts = [];
  let modelId = 'v5.0';
  let title = '';
  let instrumental = false;

  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i] || '');
    if (/^--instrumental$/i.test(arg)) {
      instrumental = true;
    } else if (/^--model=/i.test(arg)) {
      const candidate = arg.slice(arg.indexOf('=') + 1).toLowerCase();
      if (SUPPORTED_MODELS.has(candidate)) modelId = candidate;
    } else if (/^--model$/i.test(arg) && args[i + 1]) {
      const candidate = String(args[++i]).toLowerCase();
      if (SUPPORTED_MODELS.has(candidate)) modelId = candidate;
    } else if (/^--title=/i.test(arg)) {
      title = arg.slice(arg.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').slice(0, 120);
    } else if (/^--title$/i.test(arg) && args[i + 1]) {
      title = String(args[++i]).replace(/^['"]|['"]$/g, '').slice(0, 120);
    } else {
      promptParts.push(arg);
    }
  }

  return {
    prompt: promptParts.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT_CHARS),
    modelId,
    title,
    instrumental,
  };
}

function directAudioUrl(payload) {
  const result = unwrapResult(payload);
  return findField(result, ['download_url', 'downloadUrl', 'audio_url', 'audioUrl', 'audio', 'song_url', 'songUrl']) || firstMediaUrl(result);
}

function formatAudioCaption(request, taskId) {
  const lines = [
    '🎼 *AI Music Generated*',
    `🎛️ Model: ${request.modelId}`,
    `🎤 Mode: ${request.instrumental ? 'Instrumental' : 'Vocals'}`,
  ];
  if (request.title) lines.push(`🏷️ Title: ${request.title}`);
  if (taskId) lines.push(`🧾 Task: ${taskId}`);
  lines.push(`📝 Prompt: ${request.prompt}`);
  return lines.join('\n');
}

async function handleAiMusic(args, sock, jid) {
  const request = parseAiMusicRequest(args);
  if (!request.prompt) {
    return sock.sendMessage(jid, {
      text:
        '🎼 *AI Music Generator*\n\n' +
        'Usage: .aimusic <prompt> [--model v5.0] [--instrumental]\n\n' +
        'Example: .aimusic Afrobeats song about Lagos at sunset --model v5.0\n' +
        'Example: .aimusic cinematic piano soundtrack --instrumental --title Sunrise'
    });
  }

  await sock.sendMessage(jid, {
    text: `🎼 Queuing AI music generation...\n\n📝 ${request.prompt}\n🎛️ ${request.modelId}${request.instrumental ? ' · instrumental' : ''}`
  });

  try {
    const created = await createAiMusic({
      prompt: request.prompt,
      modelId: request.modelId,
      ...(request.title ? { title: request.title } : {}),
      isInstrumental: request.instrumental ? 1 : 0,
    });

    const taskId = extractTaskId(created);
    let audioUrl = directAudioUrl(created);
    let completed = created;

    if (!audioUrl && !taskId) throw new Error('AI music provider returned neither an audio URL nor a task ID');
    if (!audioUrl && taskId) {
      await sock.sendMessage(jid, { text: `⏳ Music task created: ${taskId}\nI’ll wait for the audio and send it when ready.` });
      const polled = await waitForAiMusic(taskId, {
        attempts: Number(process.env.AI_MUSIC_POLL_ATTEMPTS) || 30,
        delayMs: Number(process.env.AI_MUSIC_POLL_DELAY_MS) || 10_000,
      });
      completed = polled.payload;
      audioUrl = polled.audioUrl;
    }

    const media = await downloadMedia(audioUrl, {
      maxBytes: MAX_AUDIO_BYTES,
      timeout: 90_000,
    });
    const mimetype = media.contentType.startsWith('audio/') ? media.contentType : 'audio/mpeg';
    await sock.sendMessage(jid, {
      audio: media.buffer,
      mimetype,
      ptt: false,
    });
    await sock.sendMessage(jid, { text: formatAudioCaption(request, taskId || extractTaskId(completed)) });
  } catch (error) {
    console.error('[aimusic] generation failed:', error.message);
    await sock.sendMessage(jid, {
      text:
        `❌ AI music generation failed: ${error.message}\n\n` +
        'Try a shorter prompt or run the command again later.'
    });
  }
}

const aiMusicCommands = {
  aimusic: {
    category: 'ai', reaction: '🎼', desc: 'Generate an AI song or instrumental audio',
    usage: '.aimusic <prompt> [--model v5.0] [--instrumental]',
    aliases: ['musicgen', 'musicai'], permissions: 'all',
    examples: [
      '.aimusic Afrobeats song about Lagos at sunset',
      '.aimusic cinematic piano soundtrack --instrumental --model v5.0'
    ],
    exec: handleAiMusic,
  },
};

aiMusicCommands._internals = { parseAiMusicRequest, directAudioUrl, formatAudioCaption };

module.exports = aiMusicCommands;
