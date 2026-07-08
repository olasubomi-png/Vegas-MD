'use strict';
// lib/media.js — Shared media download + ffmpeg processing helpers
//
// downloadContentFromMessage(mediaMsg, type) decrypts WhatsApp CDN media.
// It requires an active WhatsApp socket session (available on the AWS server).
// In tests without a live session it will throw — that is expected.

const { downloadContentFromMessage } = require('baileys');
const { execFile }                   = require('child_process');
const fs                             = require('fs');
const os                             = require('os');
const { promisify }                  = require('util');

const execFileAsync = promisify(execFile);

// ─── Stream → Buffer ──────────────────────────────────────
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ─── Download the media content from a quoted message ─────
// quotedMsg  : message.message.extendedTextMessage.contextInfo.quotedMessage
// mediaType  : 'audio' | 'video' | 'image' | 'sticker' | 'document'
// Returns    : Buffer
async function downloadQuotedMedia(quotedMsg, mediaType) {
  const mediaMsg =
    quotedMsg.audioMessage   ||
    quotedMsg.videoMessage   ||
    quotedMsg.imageMessage   ||
    quotedMsg.stickerMessage ||
    quotedMsg.documentMessage;

  if (!mediaMsg) throw new Error('No downloadable media in the quoted message.');

  const stream = await downloadContentFromMessage(mediaMsg, mediaType);
  return streamToBuffer(stream);
}

// ─── Download by explicit message type ────────────────────
async function downloadAudio(quotedMsg) {
  const m = quotedMsg.audioMessage || quotedMsg.videoMessage;
  if (!m) throw new Error('No audio or video in the quoted message.');
  const type = quotedMsg.audioMessage ? 'audio' : 'video';
  return streamToBuffer(await downloadContentFromMessage(m, type));
}

async function downloadImage(quotedMsg) {
  const m = quotedMsg.imageMessage;
  if (!m) throw new Error('No image in the quoted message.');
  return streamToBuffer(await downloadContentFromMessage(m, 'image'));
}

async function downloadSticker(quotedMsg) {
  const m = quotedMsg.stickerMessage;
  if (!m) throw new Error('No sticker in the quoted message.');
  return streamToBuffer(await downloadContentFromMessage(m, 'sticker'));
}

async function downloadVideo(quotedMsg) {
  const m = quotedMsg.videoMessage;
  if (!m) throw new Error('No video in the quoted message.');
  return streamToBuffer(await downloadContentFromMessage(m, 'video'));
}

// ─── FFmpeg helper ────────────────────────────────────────
// Writes inputBuffer to a temp file, runs ffmpeg with the given
// args (NOT including -i <input> or <output>), returns output buffer.
// Both temp files are deleted whether or not the conversion succeeds.
async function runFfmpeg(inputBuffer, inputExt, outputExt, ffmpegArgs) {
  const tag    = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpIn  = `${os.tmpdir()}/wa_${tag}_in.${inputExt}`;
  const tmpOut = `${os.tmpdir()}/wa_${tag}_out.${outputExt}`;

  fs.writeFileSync(tmpIn, inputBuffer);
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', tmpIn,
      ...ffmpegArgs,
      tmpOut
    ], { timeout: 60_000 });
    return fs.readFileSync(tmpOut);
  } finally {
    for (const f of [tmpIn, tmpOut]) { try { fs.unlinkSync(f); } catch {} }
  }
}

module.exports = {
  streamToBuffer,
  downloadQuotedMedia,
  downloadAudio,
  downloadImage,
  downloadSticker,
  downloadVideo,
  runFfmpeg,
};
