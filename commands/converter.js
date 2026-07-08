'use strict';
// commands/converter.js — Working media conversion commands
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const axios = require('axios');
const { downloadMediaMessage } = require('baileys');
const { spawn } = require('child_process');

// ── helpers ────────────────────────────────────────────────────────────────
function tmpFile(ext) {
  return path.join(os.tmpdir(), `olamd_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
}

// Pull contextInfo out of any Baileys v7 message type
function getCtx(message) {
  const m = message?.message;
  if (!m) return null;
  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo        ||
    m.videoMessage?.contextInfo        ||
    m.audioMessage?.contextInfo        ||
    m.stickerMessage?.contextInfo      ||
    m.documentMessage?.contextInfo     || null
  );
}

// Build the fake message Baileys needs and download the buffer
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

// Run ffmpeg. inputPath → outputPath with extraArgs inserted between -i and output.
function ffmpegRun(inputPath, outputPath, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', '-i', inputPath, ...extraArgs, outputPath]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${stderr.slice(-400)}`)));
    proc.on('error', () => reject(new Error('ffmpeg is not installed on this server.\nAsk your host to run: sudo apt install ffmpeg')));
  });
}

// Upload a buffer to catbox.moe and return the direct URL (free, no account)
async function uploadToCatbox(buffer, filename, mimetype) {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', new Blob([buffer], { type: mimetype }), filename);
  const res  = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  if (!text.startsWith('https://')) throw new Error('Upload failed: ' + text.slice(0, 100));
  return text.trim();
}

// ── commands ──────────────────────────────────────────────────────────────
const converterCommands = {

  toimg: {
    category: 'converter', desc: 'Convert a sticker to an image (reply to sticker)',
    usage: '.toimg', aliases: [], permissions: 'all',
    examples: ['.toimg (reply to a sticker)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.stickerMessage) {
        return sock.sendMessage(jid, { text: `🖼️ *Sticker → Image*\n\nReply to a *sticker* with *.toimg* to convert it to an image.` });
      }
      await sock.sendMessage(jid, { text: `🖼️ Converting sticker to image...` });
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        await sock.sendMessage(jid, {
          image:    buf,
          caption:  `🖼️ *Here's your image!*`,
          mimetype: 'image/webp'
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Conversion failed: ${err.message}` });
      }
    }
  },

  tomp3: {
    category: 'converter', desc: 'Convert a video/voice to MP3 audio (reply to media)',
    usage: '.tomp3', aliases: [], permissions: 'all',
    examples: ['.tomp3 (reply to a video or audio)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      const media  = quoted?.videoMessage || quoted?.audioMessage;
      if (!media) {
        return sock.sendMessage(jid, { text: `🎵 *Video/Audio → MP3*\n\nReply to a *video* or *audio* message with *.tomp3*.` });
      }
      await sock.sendMessage(jid, { text: `🎵 Converting to MP3...` });
      const inFile  = tmpFile('.mp4');
      const outFile = tmpFile('.mp3');
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        fs.writeFileSync(inFile, buf);
        await ffmpegRun(inFile, outFile, ['-vn', '-ar', '44100', '-ac', '2', '-b:a', '128k']);
        const mp3  = fs.readFileSync(outFile);
        await sock.sendMessage(jid, {
          audio:    mp3,
          mimetype: 'audio/mpeg',
          ptt:      false
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Conversion failed: ${err.message}` });
      } finally {
        for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
      }
    }
  },

  tovn: {
    category: 'converter', desc: 'Convert audio to a WhatsApp voice note (reply to audio)',
    usage: '.tovn', aliases: [], permissions: 'all',
    examples: ['.tovn (reply to an audio file)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      const media  = quoted?.audioMessage || quoted?.videoMessage;
      if (!media) {
        return sock.sendMessage(jid, { text: `🎤 *Audio → Voice Note*\n\nReply to an *audio file* or *video* with *.tovn*.` });
      }
      await sock.sendMessage(jid, { text: `🎤 Converting to voice note...` });
      const inFile  = tmpFile('.mp4');
      const outFile = tmpFile('.ogg');
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        fs.writeFileSync(inFile, buf);
        await ffmpegRun(inFile, outFile, ['-vn', '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1']);
        const ogg  = fs.readFileSync(outFile);
        await sock.sendMessage(jid, {
          audio:    ogg,
          mimetype: 'audio/ogg; codecs=opus',
          ptt:      true
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Conversion failed: ${err.message}` });
      } finally {
        for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
      }
    }
  },

  tourl: {
    category: 'converter', desc: 'Upload media and get a direct download URL (reply to any media)',
    usage: '.tourl', aliases: [], permissions: 'all',
    examples: ['.tourl (reply to image/video/audio/document)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted) {
        return sock.sendMessage(jid, { text: `🔗 *Media → URL*\n\nReply to any media with *.tourl* to get a direct download link.` });
      }
      const mediaMsg = quoted.imageMessage || quoted.videoMessage || quoted.audioMessage ||
                       quoted.stickerMessage || quoted.documentMessage;
      if (!mediaMsg) {
        return sock.sendMessage(jid, { text: `❌ No downloadable media found in that message.` });
      }
      await sock.sendMessage(jid, { text: `🔗 Uploading media... please wait.` });
      try {
        const buf  = await dlQuoted(sock, jid, message, quoted);
        const mime = mediaMsg.mimetype || 'application/octet-stream';
        const ext  = mime.split('/')[1]?.split(';')[0] || 'bin';
        const url  = await uploadToCatbox(buf, `olamd_${Date.now()}.${ext}`, mime);
        await sock.sendMessage(jid, {
          text:
            `🔗 *Upload Complete!*\n\n` +
            `📎 *Direct URL:*\n${url}\n\n` +
            `📦 Size: ${(buf.length / 1024).toFixed(1)} KB\n` +
            `📁 Type: ${mime}\n\n` +
            `_Hosted on catbox.moe — permanent link_`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Upload failed: ${err.message}` });
      }
    }
  },

  qr: {
    category: 'converter', desc: 'Generate a QR code from text or URL',
    usage: '.qr <text or URL>', aliases: ['genqr', 'makeqr'], permissions: 'all',
    examples: ['.qr https://github.com', '.qr Hello World'],
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .qr <text or URL>' });
      await sock.sendMessage(jid, { text: `📷 Generating QR code...` });
      try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=20&data=${encodeURIComponent(text)}`;
        await sock.sendMessage(jid, {
          image:   { url: qrUrl },
          caption: `📷 *QR Code*\n\n_Content:_ ${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ QR generation failed: ${err.message}` });
      }
    }
  },

  readqr: {
    category: 'converter', desc: 'Read/decode a QR code from an image (reply to image)',
    usage: '.readqr', aliases: ['scanqr', 'decodeqr'], permissions: 'all',
    examples: ['.readqr (reply to an image with a QR code)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `📷 *QR Code Reader*\n\nReply to an *image* containing a QR code with *.readqr*.` });
      }
      await sock.sendMessage(jid, { text: `📷 Reading QR code...` });
      try {
        // Upload image to get a public URL, then decode via qrserver
        const buf  = await dlQuoted(sock, jid, message, quoted);
        const url  = await uploadToCatbox(buf, `qr_${Date.now()}.jpg`, 'image/jpeg');
        const { data } = await axios.get(
          `https://api.qrserver.com/v1/read-qr-code/?fileurl=${encodeURIComponent(url)}`,
          { timeout: 15000 }
        );
        const decoded = data?.[0]?.symbol?.[0];
        if (!decoded || decoded.error || !decoded.data) {
          return sock.sendMessage(jid, { text: `❌ Could not decode QR code. Make sure the image is clear and the QR is visible.` });
        }
        await sock.sendMessage(jid, {
          text:
            `📷 *QR Code Decoded!*\n\n` +
            `📋 *Content:*\n${decoded.data}`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ QR read failed: ${err.message}` });
      }
    }
  }
};

module.exports = converterCommands;
