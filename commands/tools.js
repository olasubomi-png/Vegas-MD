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

const MAX_IMAGE_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_INPUT_BYTES = 45 * 1024 * 1024;
const MAX_VIDEO_OUTPUT_BYTES = 64 * 1024 * 1024;

function imageQualityFilter(operation = 'enhance', scaleFactor = 4) {
  const scale = `scale='ceil(max(iw,min(2560,iw*${scaleFactor}))/2)*2':'ceil(max(ih,min(2560,ih*${scaleFactor}))/2)*2':force_original_aspect_ratio=decrease:flags=lanczos`;
  if (operation === 'dehaze') return `${scale},eq=contrast=1.12:brightness=0.025:saturation=1.10,cas=0.35,unsharp=5:5:0.45:5:5:0`;
  if (operation === 'recolor') return `${scale},eq=saturation=1.35:contrast=1.05,cas=0.30,unsharp=3:3:0.25:3:3:0`;
  return `${scale},eq=contrast=1.07:saturation=1.09,cas=0.48,unsharp=5:5:0.52:5:5:0`;
}

function videoQualityFilter(scaleFactor = 2) {
  return `scale='ceil(max(iw,min(2560,iw*${scaleFactor}))/2)*2':'ceil(max(ih,min(2560,ih*${scaleFactor}))/2)*2':force_original_aspect_ratio=decrease:flags=lanczos,hqdn3d=1.25:1.25:2.5:2.5,eq=contrast=1.07:saturation=1.09,cas=0.45,unsharp=5:5:0.42:5:5:0`;
}

function imageMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

function validImageOutput(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 500 && Boolean(imageMimeFromBuffer(buffer));
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

// ── Fallback: local ffmpeg enhancement ─────────────────────────────────────
// Applied when the external enhancer is unavailable. It enlarges smaller images
// up to 4× while preserving aspect ratio and avoids aggressive sharpening that
// can create halos or false detail.
async function enhanceLocal(imageBuffer, operation, { scaleFactor = 4 } = {}) {
  const inFile  = tmpFile('.jpg');
  const outFile = tmpFile('.jpg');
  fs.writeFileSync(inFile, imageBuffer);
  try {
    await ffmpegRun(inFile, outFile, [
      '-vf', imageQualityFilter(operation, scaleFactor),
      '-frames:v', '1',
      '-q:v', '1',
      '-pix_fmt', 'yuvj420p',
    ]);
    const result = fs.readFileSync(outFile);
    if (!validImageOutput(result)) throw new Error('Local enhancement produced an invalid image output');
    return result;
  } finally {
    for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
  }
}

async function finishEnhancedImage(imageBuffer, operation) {
  // Preserve an AI provider's dimensions while applying a local final pass for
  // contrast-adaptive clarity. This prevents weak provider output from bypassing
  // the bot's visible quality treatment.
  return enhanceLocal(imageBuffer, operation, { scaleFactor: 1 });
}

// ── Robust enhance: try Vyro AI, fall back to local ────────────────────────
async function enhanceImage(imageBuffer, operation) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < 500) {
    throw new Error('The quoted image is empty or invalid');
  }
  if (imageBuffer.length > MAX_IMAGE_INPUT_BYTES) {
    throw new Error('Image is too large to enhance safely. Keep it below 15 MB.');
  }

  // 1. Try Vyro AI (primary)
  try {
    const result = await vyroAiRequest(imageBuffer, operation === 'upscale' ? 'enhance' : operation);
    if (!validImageOutput(result)) throw new Error('Vyro AI returned an invalid image output');
    // Provider output is not sent straight to WhatsApp. A no-resize finishing
    // pass keeps its dimensions while applying the same visible clarity tuning
    // as the local fallback, so a weak provider result cannot bypass it.
    return await finishEnhancedImage(result, operation);
  } catch (e1) {
    console.warn(`[enhance] Vyro AI failed (${e1.message}), trying local fallback...`);
  }

  // 2. Local ffmpeg fallback — detect missing ffmpeg and give a clear user-facing message
  try {
    return await enhanceLocal(imageBuffer, operation);
  } catch (e2) {
    // ffmpegRun throws the literal string 'ffmpeg not installed…' when ENOENT fires.
    // Match that exact phrase to avoid misclassifying other ffmpeg runtime errors.
    const isMissingFfmpeg = e2.message.startsWith('ffmpeg not installed');
    if (isMissingFfmpeg) {
      throw new Error(
        'The AI enhancer (Vyro) is unavailable and ffmpeg is not installed for local fallback.\n\n' +
        '📌 *Fix:* Ask your bot admin to install ffmpeg (add `ffmpeg` to replit.nix packages).'
      );
    }
    throw new Error(`Enhancement failed: ${e2.message}`);
  }
}

async function enhanceVideoLocal(videoBuffer, { scaleFactor = 2 } = {}) {
  if (!Buffer.isBuffer(videoBuffer) || videoBuffer.length < 1_000) {
    throw new Error('The quoted video is empty or invalid');
  }
  if (videoBuffer.length > MAX_VIDEO_INPUT_BYTES) {
    throw new Error('Video is too large to enhance safely. Keep it below 45 MB.');
  }

  const inFile = tmpFile('.mp4');
  const outFile = tmpFile('.mp4');
  fs.writeFileSync(inFile, videoBuffer);
  try {
    await ffmpegRun(inFile, outFile, [
      '-map', '0:v:0', '-map', '0:a?',
      '-vf', videoQualityFilter(scaleFactor),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
    ]);
    const result = fs.readFileSync(outFile);
    if (result.length < 1_000) throw new Error('Video enhancement produced an invalid output');
    if (result.length > MAX_VIDEO_OUTPUT_BYTES) {
      throw new Error('Enhanced video is too large for reliable WhatsApp delivery. Use a shorter or smaller source video.');
    }
    return result;
  } finally {
    for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
  }
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

// Convert any image buffer to a static WebP sticker via ffmpeg.
// Key fixes vs the old version:
//   • Use codec libwebp (not libwebp_anim) so WhatsApp accepts it as a static sticker.
//   • Drop -loop 0 — that flag forces animated encoding which WhatsApp shows as
//     "file not found" for static stickers.
//   • Drop -vsync 0 (deprecated in ffmpeg 6+) — not needed for a single-frame image.
//   • Use white padding instead of transparent (#00000000) — avoids colour-space
//     warnings on JPEG inputs that have no alpha channel.
async function imageToWebp(inputBuf, inputExt = '.jpg') {
  const inFile  = tmpFile(inputExt);
  const outFile = tmpFile('.webp');
  fs.writeFileSync(inFile, inputBuf);
  try {
    await ffmpegRun(inFile, outFile, [
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:white',
      '-codec:v', 'libwebp', '-quality', '80', '-an'
    ]);
    return fs.readFileSync(outFile);
  } finally {
    for (const f of [inFile, outFile]) try { fs.unlinkSync(f); } catch {}
  }
}

// Convert video buffer to an animated WebP sticker via ffmpeg.
// Key fixes:
//   • Explicit codec libwebp_anim (animated) for clarity.
//   • -fps_mode passthrough replaces deprecated -vsync 0 (ffmpeg 6+).
//   • White padding; max 7 s.
async function videoToWebp(inputBuf) {
  const inFile  = tmpFile('.mp4');
  const outFile = tmpFile('.webp');
  fs.writeFileSync(inFile, inputBuf);
  try {
    await ffmpegRun(inFile, outFile, [
      '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:white',
      '-codec:v', 'libwebp_anim', '-loop', '0', '-preset', 'default', '-an', '-t', '7',
      '-fps_mode', 'passthrough'
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
    usage: '.remini [enhance|upscale|recolor|dehaze]', aliases: ['hd'], permissions: 'all',
    examples: ['.remini (reply to image)', '.remini upscale', '.remini recolor', '.remini dehaze'],
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
      const op = ['enhance', 'upscale', 'recolor', 'dehaze'].includes(args[0]) ? args[0] : 'enhance';
      await sock.sendMessage(jid, { text: `✨ Enhancing image with AI (${op})...` });
      try {
        const buf    = await dlQuoted(sock, jid, message, quoted);
        const result = await enhanceImage(buf, op);
        await sock.sendMessage(jid, { image: result, caption: `✨ *AI Enhanced Image* (${op})` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Enhancement failed: ${err.message}` });
      }
    }
  },

  enhance: {
    category: 'sticker', desc: 'Enhance image or video quality in HD (reply to media)',
    usage: '.enhance', aliases: [], permissions: 'all',
    examples: ['.enhance (reply to an image)', '.enhance (reply to a video)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = getCtx(message)?.quotedMessage;
      if (quoted?.videoMessage) return toolsCommands.enhancevideo.exec(args, sock, jid, isGroup, sender, message);
      return toolsCommands.remini.exec(args, sock, jid, isGroup, sender, message);
    }
  },

  upscale: {
    category: 'sticker', desc: 'Upscale image resolution in HD (reply to image)',
    usage: '.upscale', aliases: [], permissions: 'all',
    examples: ['.upscale (reply to an image)'],
    exec: async (_args, sock, jid, isGroup, sender, message) => toolsCommands.remini.exec(['upscale'], sock, jid, isGroup, sender, message)
  },

  enhancevideo: {
    category: 'tools',
    desc: 'Enhance a replied video in HD without reducing its source resolution',
    usage: '.enhancevideo', aliases: ['hdvideo', 'videohd'], permissions: 'all',
    examples: ['.enhancevideo (reply to a video)', '.enhancevideo 4x (reply to a video)', '.enhance (reply to a video)'],
    exec: async (args, sock, jid, _isGroup, _sender, message) => {
      const quoted = getCtx(message)?.quotedMessage;
      if (!quoted?.videoMessage) {
        return sock.sendMessage(jid, {
          text: '🎞️ *HD Video Enhance*\n\nReply to a video with *.enhancevideo* or *.enhance*.\nUse *.enhancevideo 4x* for stronger upscaling.\n\nVideos must be below 45 MB; processing never reduces source resolution.'
        });
      }
      const scaleFactor = String(args[0] || '').toLowerCase() === '4x' ? 4 : 2;
      await sock.sendMessage(jid, { text: `🎞️ Enhancing video quality in ${scaleFactor}× HD… This can take a few minutes.` });
      try {
        const source = await dlQuoted(sock, jid, message, quoted);
        const result = await enhanceVideoLocal(source, { scaleFactor });
        await sock.sendMessage(jid, {
          video: result,
          mimetype: 'video/mp4',
          caption: `🎞️ *${scaleFactor}× HD Enhanced Video*\n\nResolution preserved or increased; detail, contrast, and noise handling improved.`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Video enhancement failed: ${err.message}` });
      }
    }
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
        const result = await enhanceImage(buf, 'dehaze');
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
        const result = await enhanceImage(buf, 'recolor');
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
    category: 'utility',
    desc: 'Set your permanent font style. All your messages are automatically converted. Use .font <1-10> to set, .font default to reset.',
    usage: '.font [number|default]',
    aliases: ['fancy'],
    permissions: 'all',
    examples: ['.font', '.font 3', '.font default'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const db = require('../lib/database');
      const { FONT_STYLES, applyFontStyle } = require('../lib/font');
      const styles = FONT_STYLES;

      const SAMPLE  = 'Hello';
      const ownerJid = botConfig?.ownerJid || global.botConfig?.ownerJid;

      // When saving the PERMANENT font (which the pre-send hook reads from ownerJid),
      // we must write to ownerJid — not sender — so the lookup key always matches.
      // In DM context sender resolves to the remote JID, not the owner's own JID.
      //
      // Security: only map to ownerJid when the caller is actually the owner.
      //   • message.key.fromMe === true  → owner typed this from their phone (any chat)
      //   • sender === ownerJid          → owner's number matches in group context
      // For all other callers the save goes to their own sender JID, which the
      // pre-send hook never reads, so they cannot affect global outgoing formatting.
      const isOwner  = message?.key?.fromMe === true || sender === ownerJid;
      const userJid  = isOwner && ownerJid ? ownerJid : (sender || jid);

      // ── No args: show the full menu ───────────────────────────────
      if (!args.length) {
        const user = db.getUser(userJid);
        const current = user.fontStyle || 0;
        console.log(`[font] menu shown for userJid=${userJid} currentStyle=${current}`);
        const currentLabel = current === 0
          ? 'Plain (default)'
          : `Font ${current} — ${styles[current - 1].name}`;
        const lines = styles.map((s, i) =>
          `*${i + 1}.* ${s.fn(SAMPLE)} — _${s.name}_`
        ).join('\n');
        return sock.sendMessage(jid, {
          text:
            `🔤 *Font Styles*\n\n${lines}\n\n` +
            `📌 Your current font: *${currentLabel}*\n\n` +
            `• *.font <1–10>* — set a permanent font (auto-applied to all your messages)\n` +
            `• *.font default* — reset to plain text`
        });
      }

      const first = args[0].toLowerCase();

      // ── .font default — reset ─────────────────────────────────────
      if (first === 'default' || first === '0') {
        db.updateUser(userJid, { fontStyle: 0 });
        console.log(`[font] reset to plain for userJid=${userJid}`);
        return sock.sendMessage(jid, { text: `🔤 Your font has been reset to *plain* (default).` });
      }

      // ── .font <number> — set permanent font ───────────────────────
      const num = parseInt(first, 10);
      if (!isNaN(num) && args.length === 1) {
        if (num < 1 || num > styles.length) {
          return sock.sendMessage(jid, {
            text: `❌ Choose a font number between *1* and *${styles.length}*.\nType *.font* to see the full list.`
          });
        }
        db.updateUser(userJid, { fontStyle: num });
        console.log(`[font] saved style ${num} (${styles[num - 1].name}) for userJid=${userJid}`);
        const s = styles[num - 1];
        return sock.sendMessage(jid, {
          text:
            `✅ *Font ${num} set permanently!*\n\n` +
            `Style   : ${s.name}\n` +
            `Preview : ${s.fn('Hello World')}\n\n` +
            `_Your font stays active in all chats until you type .font default_`
        });
      }

      // ── .font <text> — convert using current saved font ───────────
      const text = args.join(' ');
      const user = db.getUser(userJid);
      const savedStyle = user.fontStyle || 0;

      if (savedStyle === 0) {
        // No font set — show all conversions
        const lines = styles.map((s, i) => `*${i + 1}.* ${s.fn(text)} — _${s.name}_`).join('\n');
        return sock.sendMessage(jid, {
          text:
            `🔤 *"${text}"* in all styles:\n\n${lines}\n\n` +
            `_Tip: use .font <1–${styles.length}> to set a permanent style_`
        });
      }

      const s = styles[savedStyle - 1];
      await sock.sendMessage(jid, {
        text: `${s.fn(text)}\n\n_Font ${savedStyle}: ${s.name}_`
      });
    }
  },

  // ── Text-to-Speech (Google TTS → OGG/Opus via ffmpeg) ──
  tts: {
    category: 'tools', desc: 'Convert text to a voice note',
    usage: '.tts <text>', aliases: ['speak', 'voice'], permissions: 'all',
    examples: ['.tts Hello world', '.tts (reply to a message)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      // Accept text from args OR from a quoted reply
      let text = args.join(' ').trim();
      if (!text) {
        const q = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        text = q?.conversation || q?.extendedTextMessage?.text || '';
      }
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .tts <text>  or reply to a message with .tts' });
      if (text.length > 200) return sock.sendMessage(jid, { text: '❌ Text too long — keep it under 200 characters.' });

      await sock.sendMessage(jid, { text: `🎤 Converting to voice note...` });

      const mp3File = tmpFile('.mp3');
      const oggFile = tmpFile('.ogg');
      try {
        // 1. Download MP3 from Google TTS
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
        const { data } = await axios.get(ttsUrl, {
          responseType: 'arraybuffer',
          timeout: 20000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        fs.writeFileSync(mp3File, Buffer.from(data));

        // 2. Convert MP3 → OGG/Opus (WhatsApp PTT requires this format)
        await new Promise((resolve, reject) => {
          const proc = spawn('ffmpeg', [
            '-y', '-i', mp3File,
            '-vn', '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1',
            oggFile
          ]);
          let stderr = '';
          proc.stderr.on('data', d => { stderr += d.toString(); });
          proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg: ${stderr.slice(-200)}`)));
          proc.on('error', () => reject(new Error('ffmpeg not found — run: sudo apt install ffmpeg')));
        });

        // 3. Send as PTT voice note
        await sock.sendMessage(jid, {
          audio:    fs.readFileSync(oggFile),
          mimetype: 'audio/ogg; codecs=opus',
          ptt:      true
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ TTS failed: ${err.message}` });
      } finally {
        // Clean up temp files
        [mp3File, oggFile].forEach(f => { try { fs.unlinkSync(f); } catch {} });
      }
    }
  }
};

Object.defineProperty(toolsCommands, '_internals', {
  enumerable: false,
  value: {
    enhanceLocal,
    finishEnhancedImage,
    enhanceVideoLocal,
    imageQualityFilter,
    videoQualityFilter,
    validImageOutput,
  },
});

module.exports = toolsCommands;
