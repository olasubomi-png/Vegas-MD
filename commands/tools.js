'use strict';
// commands/tools.js — Working sticker & image tools
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const https = require('https');
const http  = require('http');
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

// ── Vyro AI (inferenceengine.vyro.ai) — free, no API key ──────────────────
// Operations: 'enhance' | 'recolor' | 'dehaze'
// Mirrors the okhttp/4.9.3 multipart request used by the reference repo.
function vyroAiRequest(imageBuffer, operation) {
  return new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${Date.now().toString(16)}`;

    // model_version part — must come before image
    const mvPart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model_version"\r\n` +
      `Content-Transfer-Encoding: binary\r\n` +
      `Content-Type: multipart/form-data; charset=utf-8\r\n\r\n` +
      `1\r\n`
    );
    // image part header
    const imgHeader = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="enhance_image_body.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`
    );
    const imgFooter = Buffer.from(`\r\n--${boundary}--\r\n`);

    const body = Buffer.concat([mvPart, imgHeader, imageBuffer, imgFooter]);

    const options = {
      hostname: 'inferenceengine.vyro.ai',
      path:     `/${operation}`,
      method:   'POST',
      headers:  {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'User-Agent':     'okhttp/4.9.3',
        'Connection':     'Keep-Alive'
        // Note: no Accept-Encoding header — Node https.request does NOT
        // auto-decompress, so requesting gzip would give us raw compressed bytes
      }
    };

    const req = https.request(options, res => {
      // Guard against non-2xx
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // drain
        return reject(new Error(`Vyro AI HTTP ${res.statusCode} for /${operation}`));
      }
      const chunks = [];
      res.on('data',  c  => chunks.push(c));
      res.on('end',   ()  => {
        const result = Buffer.concat(chunks);
        if (result.length < 200) return reject(new Error(`Vyro AI returned empty response (${result.length} bytes)`));
        resolve(result);
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Vyro AI timeout after 60 s')); });
    req.write(body);
    req.end();
  });
}

// ── Remove background — free public fallback chain ────────────────────────
// 1. api.theresav.biz.id (free, no key)
// 2. api.nexray.eu.cc    (URL-based, free)
// 3. api.princetechn.com (URL-based, free)
async function removeBgFree(imageBuffer) {
  // Attempt 1 — direct buffer upload to theresav API
  try {
    const fd = new FormData();
    fd.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');
    const res = await fetch('https://api.theresav.biz.id/tools/removebg', {
      method:  'POST',
      headers: { 'x-api-key': 'X4cCB' },
      body:    fd,
      signal:  AbortSignal.timeout(30000)
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 500) return buf;
    }
  } catch (_) {}

  // Attempt 2 & 3 — upload to catbox first to get a public URL
  const imgUrl = await uploadToCatbox(imageBuffer, `rmbg_${Date.now()}.jpg`, 'image/jpeg');

  const urlApis = [
    `https://api.nexray.eu.cc/tools/removebg?url=${encodeURIComponent(imgUrl)}`,
    `https://api.princetechn.com/api/tools/removebg?apikey=prince&url=${encodeURIComponent(imgUrl)}`
  ];

  for (const apiUrl of urlApis) {
    try {
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      // Different APIs return result in different fields
      const resultUrl = json?.result || json?.url || json?.data?.url || json?.output;
      if (resultUrl) {
        const imgRes = await fetch(resultUrl, { signal: AbortSignal.timeout(20000) });
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.length > 500) return buf;
        }
      }
    } catch (_) {}
  }

  throw new Error('All background removal services failed. Try again later.');
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
    category: 'sticker', desc: 'Enhance/upscale image quality with AI — no API key needed (reply to image)',
    usage: '.remini [enhance|recolor|dehaze]', aliases: ['hd'], permissions: 'all',
    examples: ['.remini (reply to image)', '.remini recolor', '.remini dehaze'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, {
          text:
            `✨ *Remini AI Image Enhancer*\n\n` +
            `Reply to an image with:\n` +
            `• *.remini* — enhance quality\n` +
            `• *.remini recolor* — add color to B&W photos\n` +
            `• *.remini dehaze* — remove fog/haze\n\n` +
            `_Powered by Vyro AI — free, no API key needed_`
        });
      }
      const op = ['enhance', 'recolor', 'dehaze'].includes(args[0]) ? args[0] : 'enhance';
      await sock.sendMessage(jid, { text: `✨ Enhancing image with AI (${op})...` });
      try {
        const buf    = await dlQuoted(sock, jid, message, quoted);
        const result = await vyroAiRequest(buf, op);
        await sock.sendMessage(jid, { image: result, caption: `✨ *AI Enhanced Image* (${op})` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Enhancement failed: ${err.message}` });
      }
    }
  },

  enhance: {
    category: 'sticker', desc: 'Enhance image quality with AI (alias for remini)',
    usage: '.enhance', aliases: [], permissions: 'all',
    examples: ['.enhance (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => toolsCommands.remini.exec(args, sock, jid, isGroup, sender, message)
  },

  upscale: {
    category: 'sticker', desc: 'Upscale image resolution with AI (alias for remini)',
    usage: '.upscale', aliases: [], permissions: 'all',
    examples: ['.upscale (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => toolsCommands.remini.exec(args, sock, jid, isGroup, sender, message)
  },

  dehaze: {
    category: 'sticker', desc: 'Remove haze/fog from an image with AI (reply to image)',
    usage: '.dehaze', aliases: [], permissions: 'all',
    examples: ['.dehaze (reply to a hazy image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `🌫️ *Dehaze Image*\n\nReply to a *hazy or foggy image* with *.dehaze* to clear it up.` });
      }
      await sock.sendMessage(jid, { text: `🌫️ Removing haze with AI...` });
      try {
        const buf    = await dlQuoted(sock, jid, message, quoted);
        const result = await vyroAiRequest(buf, 'dehaze');
        await sock.sendMessage(jid, { image: result, caption: `🌫️ *Dehazed Image*` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Dehaze failed: ${err.message}` });
      }
    }
  },

  removebg: {
    category: 'sticker', desc: 'Remove image background — free, no API key (reply to image)',
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
        const buf       = await dlQuoted(sock, jid, message, quoted);
        const resultBuf = await removeBgFree(buf);
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
    category: 'sticker', desc: 'Colorize a black & white image with AI — no API key (reply to image)',
    usage: '.colorize', aliases: ['recolor'], permissions: 'all',
    examples: ['.colorize (reply to a B&W image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `🎨 *Colorize Image*\n\nReply to a *black & white image* with *.colorize*.\n\n_Powered by Vyro AI — free, no API key needed_` });
      }
      await sock.sendMessage(jid, { text: `🎨 Colorizing image with AI...` });
      try {
        const buf    = await dlQuoted(sock, jid, message, quoted);
        const result = await vyroAiRequest(buf, 'recolor');
        await sock.sendMessage(jid, { image: result, caption: `🎨 *AI Colorized Image*` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Colorize failed: ${err.message}` });
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
