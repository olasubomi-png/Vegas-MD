'use strict';
// commands/converter.js — Format/media conversion helpers
const axios = require('axios');

const converterCommands = {

  toimg: {
    category: 'converter', desc: 'Convert a sticker to an image (reply to sticker)',
    usage: '.toimg', aliases: [], permissions: 'all',
    examples: ['.toimg (reply to a sticker)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.stickerMessage) {
        return sock.sendMessage(jid, {
          text: `🖼️ *Sticker → Image*\n\nReply to a *sticker* with *.toimg* to convert it to an image.`
        });
      }
      await sock.sendMessage(jid, { text: `🖼️ Converting sticker to image...\n\n_Full sticker-to-image conversion requires sharp/canvas. Coming soon._` });
    }
  },

  tomp3: {
    category: 'converter', desc: 'Convert a video/voice to MP3 audio (reply to media)',
    usage: '.tomp3', aliases: [], permissions: 'all',
    examples: ['.tomp3 (reply to a video)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasMedia = quoted?.videoMessage || quoted?.audioMessage;
      if (!hasMedia) {
        return sock.sendMessage(jid, {
          text: `🎵 *Video → MP3*\n\nReply to a *video* or *audio* message with *.tomp3* to extract the audio.`
        });
      }
      await sock.sendMessage(jid, { text: `🎵 Converting to MP3...\n\n_Audio extraction requires ffmpeg. Coming soon._` });
    }
  },

  tovn: {
    category: 'converter', desc: 'Convert an audio file to a WhatsApp voice note',
    usage: '.tovn', aliases: [], permissions: 'all',
    examples: ['.tovn (reply to audio)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.audioMessage) {
        return sock.sendMessage(jid, {
          text: `🎤 *Audio → Voice Note*\n\nReply to an *audio file* with *.tovn* to convert it to a WhatsApp voice note.`
        });
      }
      await sock.sendMessage(jid, { text: `🎤 Converting to voice note...\n\n_Voice note conversion requires ffmpeg. Coming soon._` });
    }
  },

  tourl: {
    category: 'converter', desc: 'Upload media and get a direct download URL',
    usage: '.tourl', aliases: [], permissions: 'all',
    examples: ['.tourl (reply to any media)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = message.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      if (!quoted) {
        return sock.sendMessage(jid, {
          text: `🔗 *Media → URL*\n\nReply to any media (image, video, audio, document) with *.tourl* to get a direct download link.`
        });
      }
      await sock.sendMessage(jid, { text: `🔗 Uploading media...\n\n_Media hosting requires an upload API key. Coming soon._` });
    }
  },

  qr: {
    category: 'converter', desc: 'Generate a QR code from text or URL',
    usage: '.qr <text or URL>', aliases: ['genqr', 'makeqr'], permissions: 'all',
    examples: ['.qr https://github.com', '.qr Hello World', '.qr wa.me/2348012345678'],
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .qr <text or URL>' });
      await sock.sendMessage(jid, { text: `📷 Generating QR code for: _"${text}"_...` });
      try {
        // Use a free public QR API
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
        await sock.sendMessage(jid, {
          image:   { url: qrUrl },
          caption: `📷 *QR Code*\n\n_Content:_ ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`
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
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, {
          text: `📷 *QR Code Reader*\n\nReply to an *image* containing a QR code with *.readqr*.\n\nI'll decode it and show you the content.`
        });
      }
      await sock.sendMessage(jid, { text: `📷 Reading QR code...\n\n_QR decoding requires image processing. Coming soon._` });
    }
  }
};

module.exports = converterCommands;
