'use strict';
// commands/audio.js — Audio effect commands via ffmpeg
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { downloadMediaMessage } = require('baileys');
const { spawn } = require('child_process');

function tmpFile(ext) {
  return path.join(os.tmpdir(), `olamd_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
}

function getCtx(message) {
  const m = message?.message;
  if (!m) return null;
  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo        ||
    m.audioMessage?.contextInfo        ||
    m.videoMessage?.contextInfo        ||
    m.stickerMessage?.contextInfo      || null
  );
}

async function dlQuoted(sock, jid, message, quotedMsg) {
  const ctx = getCtx(message);
  const fake = {
    key: {
      remoteJid:   jid,
      id:          ctx?.stanzaId || message.key.id,
      participant: ctx?.participant || message.key.participant,
      fromMe:      false
    },
    message: quotedMsg
  };
  return downloadMediaMessage(fake, 'buffer', { reuploadRequest: sock.updateMediaMessage });
}

function ffmpegRun(inputPath, outputPath, audioFilters = [], extraArgs = []) {
  return new Promise((resolve, reject) => {
    const filterArgs = audioFilters.length ? ['-af', audioFilters.join(',')] : [];
    const proc = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-vn',             // strip video
      ...filterArgs,
      ...extraArgs,
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-ar', '48000',
      '-ac', '1',
      outputPath
    ]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${stderr.slice(-300)}`)));
    proc.on('error', () => reject(new Error('ffmpeg not installed. Run: sudo apt install ffmpeg')));
  });
}

// Generic audio effect handler
function audioEffect(cmdName, label, emoji, audioFilters, extraArgs = []) {
  return {
    category:    'audio',
    desc:        `Apply ${label} effect to a voice note or audio`,
    usage:       `.${cmdName} (reply to audio or voice note)`,
    aliases:     [],
    permissions: 'all',
    examples:    [`.${cmdName} (reply to a voice note)`],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      const media  = quoted?.audioMessage || quoted?.videoMessage;

      if (!media) {
        return sock.sendMessage(jid, {
          text:
            `${emoji} *${label} Effect*\n\n` +
            `Reply to a *voice note* or *audio file* with *.${cmdName}*.\n\n` +
            `1️⃣ Record or find a voice note in the chat\n` +
            `2️⃣ Reply to it with *.${cmdName}*`
        });
      }

      await sock.sendMessage(jid, { text: `${emoji} Applying *${label}* effect...` });

      const inFile  = tmpFile(media.mimetype?.includes('ogg') ? '.ogg' : '.mp4');
      const outFile = tmpFile('.ogg');

      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        fs.writeFileSync(inFile, buf);
        await ffmpegRun(inFile, outFile, audioFilters, extraArgs);
        const result = fs.readFileSync(outFile);
        await sock.sendMessage(jid, {
          audio:    result,
          mimetype: 'audio/ogg; codecs=opus',
          ptt:      true
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ ${label} effect failed: ${err.message}` });
      } finally {
        for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
      }
    }
  };
}

const audioCommands = {
  // Bass boost — boost low frequencies
  bass: audioEffect('bass', 'Bass Boost', '🎵',
    ['equalizer=f=80:t=o:w=200:g=15', 'equalizer=f=140:t=o:w=200:g=10']
  ),

  // Deep voice — lower pitch
  deep: audioEffect('deep', 'Deep Voice', '🎤',
    ['asetrate=44100*0.75', 'aresample=44100', 'atempo=1.33']
  ),

  // Speed up — 1.5× faster
  fast: audioEffect('fast', 'Speed Up', '⏩',
    ['atempo=1.5']
  ),

  // Slow down — 0.7× speed
  slow: audioEffect('slow', 'Slow Down', '⏪',
    ['atempo=0.7']
  ),

  // Reverse audio
  reverse: audioEffect('reverse', 'Reverse', '🔄',
    ['areverse']
  ),

  // Robot voice — flanger/phaser effect
  robot: audioEffect('robot', 'Robot Voice', '🤖',
    ['afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75']
  ),

  // Chipmunk — raise pitch
  chipmunk: audioEffect('chipmunk', 'Chipmunk', '🐿️',
    ['asetrate=44100*1.7', 'aresample=44100', 'atempo=0.6']
  ),

  // Smooth — low-pass filter to soften audio
  smooth: audioEffect('smooth', 'Smooth', '🎶',
    ['lowpass=f=2500', 'equalizer=f=1000:t=o:w=500:g=3']
  )
};

module.exports = audioCommands;
