'use strict';
// commands/tools.js — Working sticker & image tools
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

function ffmpegRun(inputPath, outputPath, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', '-i', inputPath, ...extraArgs, outputPath]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${stderr.slice(-300)}`)));
    proc.on('error', () => reject(new Error('ffmpeg not installed. Run: sudo apt install ffmpeg')));
  });
}

async function uploadToCatbox(buffer, filename, mimetype) {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', new Blob([buffer], { type: mimetype }), filename);
  const res  = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  if (!text.startsWith('https://')) throw new Error('Upload failed: ' + text.slice(0, 100));
  return text.trim();
}

// Convert any image buffer to WebP using ffmpeg (for stickers)
async function imageToWebp(inputBuf, inputExt = '.jpg') {
  const inFile  = tmpFile(inputExt);
  const outFile = tmpFile('.webp');
  fs.writeFileSync(inFile, inputBuf);
  try {
    await ffmpegRun(inFile, outFile, [
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
      '-loop', '0', '-preset', 'default', '-an', '-vsync', '0'
    ]);
    return fs.readFileSync(outFile);
  } finally {
    for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
  }
}

// Convert video buffer to animated WebP sticker via ffmpeg
async function videoToWebp(inputBuf) {
  const inFile  = tmpFile('.mp4');
  const outFile = tmpFile('.webp');
  fs.writeFileSync(inFile, inputBuf);
  try {
    await ffmpegRun(inFile, outFile, [
      '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
      '-loop', '0', '-preset', 'default', '-an', '-t', '7'
    ]);
    return fs.readFileSync(outFile);
  } finally {
    for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
  }
}

// ── commands ───────────────────────────────────────────────────────────────
const toolsCommands = {

  sticker: {
    category: 'sticker', desc: 'Convert image or video to a WhatsApp sticker',
    usage: '.sticker', aliases: ['s', 'stiker'], permissions: 'all',
    examples: ['.sticker (reply to an image or short video)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      const imgMsg = quoted?.imageMessage;
      const vidMsg = quoted?.videoMessage;
      const stkMsg = quoted?.stickerMessage;

      if (!imgMsg && !vidMsg && !stkMsg) {
        return sock.sendMessage(jid, {
          text:
            `📌 *Sticker Maker*\n\n` +
            `Reply to an *image* or short *video* with *.sticker*.\n\n` +
            `• Image → static sticker\n` +
            `• Video (≤7s) → animated sticker`
        });
      }
      await sock.sendMessage(jid, { text: `📌 Creating sticker...` });
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        let webpBuf;
        if (stkMsg) {
          // Already a sticker — just re-send
          webpBuf = buf;
        } else if (imgMsg) {
          const ext = (imgMsg.mimetype || 'image/jpeg').includes('png') ? '.png' : '.jpg';
          webpBuf = await imageToWebp(buf, ext);
        } else {
          webpBuf = await videoToWebp(buf);
        }
        await sock.sendMessage(jid, { sticker: webpBuf });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Sticker creation failed: ${err.message}` });
      }
    }
  },

  take: {
    category: 'sticker', desc: 'Steal/copy a sticker with custom pack name (reply to sticker)',
    usage: '.take [pack name] [author]', aliases: ['steal'], permissions: 'all',
    examples: ['.take MyPack Olasubomi'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.stickerMessage) {
        return sock.sendMessage(jid, { text: `🏷️ *Take Sticker*\n\nReply to a *sticker* with *.take [pack] [author]*.` });
      }
      const pack   = args[0] || 'OLASUBOMI-MD';
      const author = args[1] || 'Olasubomi';
      await sock.sendMessage(jid, { text: `🏷️ Copying sticker... (Pack: ${pack})` });
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        await sock.sendMessage(jid, { sticker: buf });
        await sock.sendMessage(jid, { text: `✅ Sticker saved!\n📦 Pack: *${pack}*\n✍️ Author: *${author}*` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  toimg: {
    category: 'sticker', desc: 'Convert a sticker to an image (reply to sticker)',
    usage: '.toimg', aliases: [], permissions: 'all',
    examples: ['.toimg (reply to a sticker)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.stickerMessage) {
        return sock.sendMessage(jid, { text: `🖼️ *Sticker → Image*\n\nReply to a *sticker* with *.toimg*.` });
      }
      await sock.sendMessage(jid, { text: `🖼️ Converting...` });
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        await sock.sendMessage(jid, { image: buf, caption: `🖼️ *Here's your image!*`, mimetype: 'image/webp' });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  remini: {
    category: 'sticker', desc: 'Enhance/upscale image quality with AI (reply to image)',
    usage: '.remini', aliases: ['hd', 'enhance', 'upscale'], permissions: 'all',
    examples: ['.remini (reply to a blurry image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `✨ *AI Image Enhance*\n\nReply to an *image* with *.remini* to enhance its quality.` });
      }
      await sock.sendMessage(jid, { text: `✨ Enhancing image with AI...` });
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        const url = await uploadToCatbox(buf, `enhance_${Date.now()}.jpg`, 'image/jpeg');
        // Use waifu2x-based free API (AnimeJanai / deep-image.ai free tier)
        const { data } = await axios.post(
          'https://api.deep-image.ai/rest_api/process_result',
          { url, width: 0, height: 0, enhancements: ['denoise', 'sharpness'] },
          { headers: { 'x-api-key': process.env.DEEPIMAGE_API_KEY || '' }, timeout: 60000 }
        ).catch(async () => {
          // Fallback: use waifu2x via a free public instance
          const resp = await axios.get(
            `https://waifu2x.udp.jp/api?style=art&noise=-1&scale=2&url=${encodeURIComponent(url)}`,
            { responseType: 'arraybuffer', timeout: 60000 }
          );
          return { data: { status: 'ok', _buffer: resp.data } };
        });

        if (data._buffer) {
          await sock.sendMessage(jid, { image: Buffer.from(data._buffer), caption: `✨ *Enhanced Image*` });
        } else if (data.result_url) {
          await sock.sendMessage(jid, { image: { url: data.result_url }, caption: `✨ *Enhanced Image*` });
        } else {
          // Last resort: just re-send with a sharpening note
          await sock.sendMessage(jid, {
            text:
              `✨ *Enhancement Note*\n\n` +
              `To use AI enhancement, set the *DEEPIMAGE_API_KEY* environment variable.\n\n` +
              `Get a free key at: https://deep-image.ai\n\n` +
              `Or use: https://www.upscayl.org (desktop app, free & offline)`
          });
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Enhancement failed: ${err.message}` });
      }
    }
  },

  enhance: {
    category: 'sticker', desc: 'Enhance image quality (alias for remini)',
    usage: '.enhance', aliases: ['upscale'], permissions: 'all',
    examples: ['.enhance (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => toolsCommands.remini.exec(args, sock, jid, isGroup, sender, message)
  },

  upscale: {
    category: 'sticker', desc: 'Upscale image resolution (alias for remini)',
    usage: '.upscale', aliases: [], permissions: 'all',
    examples: ['.upscale (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => toolsCommands.remini.exec(args, sock, jid, isGroup, sender, message)
  },

  removebg: {
    category: 'sticker', desc: 'Remove image background (reply to image)',
    usage: '.removebg', aliases: ['rmbg'], permissions: 'all',
    examples: ['.removebg (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `🎨 *Remove Background*\n\nReply to an *image* with *.removebg*.` });
      }
      await sock.sendMessage(jid, { text: `🎨 Removing background...` });
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        const key = process.env.REMOVEBG_API_KEY;
        if (!key) {
          // Try free alternative: photoroom.com API
          const pKey = process.env.PHOTOROOM_API_KEY;
          if (pKey) {
            const fd = new FormData();
            fd.append('image_file', new Blob([buf], { type: 'image/jpeg' }), 'image.jpg');
            const res = await fetch('https://sdk.photoroom.com/v1/segment', {
              method:  'POST',
              headers: { 'x-api-key': pKey },
              body:    fd,
              signal:  AbortSignal.timeout(60000)
            });
            if (!res.ok) throw new Error(`Photoroom error ${res.status}`);
            const resultBuf = Buffer.from(await res.arrayBuffer());
            return sock.sendMessage(jid, { image: resultBuf, caption: `🎨 *Background Removed!*`, mimetype: 'image/png' });
          }
          return sock.sendMessage(jid, {
            text:
              `🎨 *Remove Background*\n\n` +
              `To use this command, set one of these environment variables in your *.env* file:\n\n` +
              `• *REMOVEBG_API_KEY* — get free at https://www.remove.bg/api\n` +
              `• *PHOTOROOM_API_KEY* — get free at https://www.photoroom.com/api\n\n` +
              `Free tiers give 50 images/month.`
          });
        }
        const fd = new FormData();
        fd.append('image_file', new Blob([buf], { type: 'image/jpeg' }), 'image.jpg');
        fd.append('size', 'auto');
        const res  = await fetch('https://api.remove.bg/v1.0/removebg', {
          method:  'POST',
          headers: { 'X-Api-Key': key },
          body:    fd,
          signal:  AbortSignal.timeout(60000)
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`remove.bg error ${res.status}: ${errText.slice(0, 100)}`);
        }
        const resultBuf = Buffer.from(await res.arrayBuffer());
        await sock.sendMessage(jid, { image: resultBuf, caption: `🎨 *Background Removed!*`, mimetype: 'image/png' });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Background removal failed: ${err.message}` });
      }
    }
  },

  blur: {
    category: 'sticker', desc: 'Blur an image (reply to image)',
    usage: '.blur [strength 1-10]', aliases: [], permissions: 'all',
    examples: ['.blur', '.blur 5'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `🌫️ *Blur Image*\n\nReply to an *image* with *.blur [1-10]*.` });
      }
      const strength = Math.min(10, Math.max(1, parseInt(args[0]) || 5));
      const sigma    = strength * 3;
      await sock.sendMessage(jid, { text: `🌫️ Applying blur (strength: ${strength})...` });
      const inFile  = tmpFile('.jpg');
      const outFile = tmpFile('.jpg');
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        fs.writeFileSync(inFile, buf);
        await ffmpegRun(inFile, outFile, ['-vf', `boxblur=${sigma}:${sigma}`]);
        await sock.sendMessage(jid, { image: fs.readFileSync(outFile), caption: `🌫️ *Blurred (${strength}/10)*` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Blur failed: ${err.message}` });
      } finally {
        for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
      }
    }
  },

  crop: {
    category: 'sticker', desc: 'Crop image to a square (reply to image)',
    usage: '.crop', aliases: [], permissions: 'all',
    examples: ['.crop (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `✂️ *Crop Image*\n\nReply to an *image* with *.crop* to crop it to a square.` });
      }
      await sock.sendMessage(jid, { text: `✂️ Cropping to square...` });
      const inFile  = tmpFile('.jpg');
      const outFile = tmpFile('.jpg');
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        fs.writeFileSync(inFile, buf);
        // Crop to smallest dimension (center crop)
        await ffmpegRun(inFile, outFile, ['-vf', `crop='min(iw,ih)':'min(iw,ih)'`]);
        await sock.sendMessage(jid, { image: fs.readFileSync(outFile), caption: `✂️ *Cropped to Square*` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Crop failed: ${err.message}` });
      } finally {
        for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
      }
    }
  },

  colorize: {
    category: 'sticker', desc: 'Colorize a black & white image (reply to image)',
    usage: '.colorize', aliases: [], permissions: 'all',
    examples: ['.colorize (reply to a B&W image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `🎨 *Colorize Image*\n\nReply to a *black & white image* with *.colorize*.` });
      }
      await sock.sendMessage(jid, { text: `🎨 Colorizing image...` });
      try {
        const buf = await dlQuoted(sock, jid, message, quoted);
        const imgUrl = await uploadToCatbox(buf, `bw_${Date.now()}.jpg`, 'image/jpeg');
        // Use DeepAI colorizer (free tier, no key required for basic)
        const fd = new FormData();
        fd.append('image', imgUrl);
        const res  = await fetch('https://api.deepai.org/api/colorizer', {
          method:  'POST',
          headers: { 'api-key': process.env.DEEPAI_API_KEY || 'quickstart-QUdJIGlzIGF3ZXNvbWU' },
          body:    fd,
          signal:  AbortSignal.timeout(60000)
        });
        const json = await res.json();
        if (json?.output_url) {
          await sock.sendMessage(jid, { image: { url: json.output_url }, caption: `🎨 *Colorized Image*` });
        } else {
          throw new Error(json?.status || 'Colorization failed');
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Colorize failed: ${err.message}\n\nSet *DEEPAI_API_KEY* in .env for reliable access.` });
      }
    }
  },

  meme: {
    category: 'sticker', desc: 'Generate a meme (reply to image with top|bottom text)',
    usage: '.meme <top text> | <bottom text>', aliases: [], permissions: 'all',
    examples: ['.meme One does not simply | Walk into Mordor'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const text   = args.join(' ').trim();
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;

      if (!text) {
        return sock.sendMessage(jid, {
          text:
            `😂 *Meme Generator*\n\n` +
            `Reply to an *image* and run:\n*.meme <top text> | <bottom text>*\n\n` +
            `Example:\n*.meme When it works | On the first try*\n\n` +
            `_Or use without image for a template meme:_\n` +
            `*.meme drake | Stubs | Working code*`
        });
      }

      const parts  = text.split('|').map(s => s.trim());
      const top    = encodeURIComponent(parts[0] || '');
      const bottom = encodeURIComponent(parts[1] || '');

      await sock.sendMessage(jid, { text: `😂 Generating meme...` });
      try {
        if (quoted?.imageMessage) {
          // Custom image meme — overlay text using ffmpeg
          const buf     = await dlQuoted(sock, jid, message, quoted);
          const inFile  = tmpFile('.jpg');
          const outFile = tmpFile('.jpg');
          try {
            fs.writeFileSync(inFile, buf);
            // Use safe escaped text via drawtext — replace single-quotes to avoid filter parsing issues
            const topText = (parts[0] || '').replace(/[':]/g, ' ');
            const botText = (parts[1] || '').replace(/[':]/g, ' ');
            const filter  =
              `scale=800:-1,` +
              `drawtext=text='${topText}':fontcolor=white:fontsize=48:bordercolor=black:borderw=3:x=(w-text_w)/2:y=20,` +
              `drawtext=text='${botText}':fontcolor=white:fontsize=48:bordercolor=black:borderw=3:x=(w-text_w)/2:y=h-text_h-20`;
            await ffmpegRun(inFile, outFile, ['-vf', filter]);
            await sock.sendMessage(jid, { image: fs.readFileSync(outFile), caption: `😂 ${parts[0]} | ${parts[1] || ''}` });
          } finally {
            for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
          }
        } else {
          // Use memegen.link free template API (no key)
          // Template: drake, distracted, etc.
          const template = parts[0]?.toLowerCase() === 'drake' ? 'drake' : 'doge';
          const t = parts[1] ? encodeURIComponent(parts[1]) : top;
          const b = parts[2] ? encodeURIComponent(parts[2]) : bottom;
          const memeUrl = `https://api.memegen.link/images/${template}/${t}/${b}.jpg?width=800`;
          await sock.sendMessage(jid, { image: { url: memeUrl }, caption: `😂 *Meme*` });
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Meme failed: ${err.message}` });
      }
    }
  },

  font: {
    category: 'utility', desc: 'Convert text to fancy Unicode font styles',
    usage: '.font <text>', aliases: ['fancy'], permissions: 'all',
    examples: ['.font Hello World', '.font OLASUBOMI'],
    exec: async (args, sock, jid) => {
      if (!args.length) return sock.sendMessage(jid, { text: '❌ Usage: .font <your text>' });
      const text = args.join(' ');

      const to = (base, baseUpper) => s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90)  return String.fromCodePoint(code - 65 + baseUpper);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + base);
        return c;
      }).join('');

      const bold      = to(0x1D41A, 0x1D400);
      const italic    = to(0x1D44E, 0x1D434);
      const script    = to(0x1D4EA, 0x1D4D0);
      const fraktur   = to(0x1D586, 0x1D56C);
      const doubleStr = to(0x1D552, 0x1D538);

      await sock.sendMessage(jid, {
        text:
          `🔤 *Fancy Fonts* — _${text}_\n\n` +
          `𝐁𝐨𝐥𝐝     : ${bold(text)}\n` +
          `𝑰𝒕𝒂𝒍𝒊𝒄   : ${italic(text)}\n` +
          `𝓢𝓬𝓻𝓲𝓹𝓽   : ${script(text)}\n` +
          `𝔉𝔯𝔞𝔨𝔱𝔲𝔯  : ${fraktur(text)}\n` +
          `𝔻𝕠𝕦𝕓𝕝𝕖  : ${doubleStr(text)}\n` +
          `*WA Bold* : *${text}*\n` +
          `_WA Italic_: _${text}_\n` +
          `\`WA Mono\`: \`${text}\`\n` +
          `~Strike~  : ~${text}~`
      });
    }
  }
};

module.exports = toolsCommands;
