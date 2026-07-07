'use strict';
// commands/tools.js — Sticker & Image tools

function imgReplyStub(name, emoji, desc) {
  return {
    category: 'sticker', desc,
    usage: `.${name}`, aliases: [], permissions: 'all',
    examples: [`.${name} (reply to an image)`],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, {
          text: `${emoji} *${desc}*\n\nReply to an *image* with *.${name}* to use this tool.`
        });
      }
      await sock.sendMessage(jid, { text: `${emoji} Processing...\n\n_${desc} requires an image processing API. Coming soon._` });
    }
  };
}

const toolsCommands = {

  sticker: {
    category: 'sticker', desc: 'Convert image or video to a WhatsApp sticker',
    usage: '.sticker', aliases: ['s', 'stiker'], permissions: 'all',
    examples: ['.sticker (reply to an image or short video)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasImg   = quoted?.imageMessage;
      const hasVideo = quoted?.videoMessage || quoted?.stickerMessage;
      if (!hasImg && !hasVideo) {
        return sock.sendMessage(jid, {
          text:
            `📌 *Sticker Maker*\n\n` +
            `Reply to an *image* or short *video* with *.sticker*.\n\n` +
            `*Steps:*\n` +
            `1️⃣ Find an image or video in the chat\n` +
            `2️⃣ Reply to it with *.sticker*\n\n` +
            `_Sticker creation requires image processing (coming soon)._`
        });
      }
      await sock.sendMessage(jid, {
        text: `📌 *Converting to sticker...*\n\n_Sticker conversion requires sharp + ffmpeg. Coming soon._`
      });
    }
  },

  take: {
    category: 'sticker', desc: 'Steal/copy a sticker (reply to sticker)',
    usage: '.take [pack name] [author]', aliases: ['steal'], permissions: 'all',
    examples: ['.take MyPack Olasubomi'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.stickerMessage) {
        return sock.sendMessage(jid, { text: `🏷️ *Take Sticker*\n\nReply to a *sticker* with *.take [pack] [author]* to save it to your own sticker pack.` });
      }
      const pack   = args[0] || 'OLASUBOMI-MD';
      const author = args[1] || 'Olasubomi';
      await sock.sendMessage(jid, {
        text: `🏷️ Saving sticker...\n_Pack: ${pack} | Author: ${author}_\n\n_Sticker re-packaging requires the Baileys sticker API. Coming soon._`
      });
    }
  },

  remini: {
    category: 'sticker', desc: 'Enhance/restore image quality with AI (reply to image)',
    usage: '.remini', aliases: ['hd'], permissions: 'all',
    examples: ['.remini (reply to a blurry image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `✨ *AI Image Enhance (Remini)*\n\nReply to an *image* with *.remini* to restore and enhance its quality.` });
      }
      await sock.sendMessage(jid, { text: `✨ Enhancing image with AI...\n\n_Image enhancement requires Remini / deep-image API key. Coming soon._` });
    }
  },

  removebg: imgReplyStub('removebg', '🎨', 'Remove image background'),

  crop: {
    category: 'sticker', desc: 'Crop an image to a square (reply to image)',
    usage: '.crop', aliases: [], permissions: 'all',
    examples: ['.crop (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: `✂️ *Crop Image*\n\nReply to an *image* with *.crop* to crop it to a square.` });
      }
      await sock.sendMessage(jid, { text: `✂️ Cropping image...\n\n_Image cropping requires sharp. Coming soon._` });
    }
  },

  blur: imgReplyStub('blur', '🌫️', 'Blur an image'),
  enhance: imgReplyStub('enhance', '📈', 'Enhance image quality'),
  upscale: imgReplyStub('upscale', '📈', 'Upscale image resolution'),
  colorize: imgReplyStub('colorize', '🎨', 'Colorize a black & white image'),

  meme: {
    category: 'sticker', desc: 'Generate a meme (reply to image with top|bottom text)',
    usage: '.meme <top text> | <bottom text>', aliases: [], permissions: 'all',
    examples: ['.meme One does not simply | Walk into Mordor'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const text   = args.join(' ').trim();
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage || !text) {
        return sock.sendMessage(jid, {
          text:
            `😂 *Meme Generator*\n\n` +
            `1️⃣ Reply to an *image*\n` +
            `2️⃣ *.meme <top text> | <bottom text>*\n\n` +
            `Example: *.meme When it works | On the first try*`
        });
      }
      const [top, bottom] = text.split('|').map(s => s.trim());
      await sock.sendMessage(jid, {
        text: `😂 Creating meme...\n_Top: "${top}" | Bottom: "${bottom || ''}"_\n\n_Meme generation requires canvas/jimp. Coming soon._`
      });
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

      const bold        = to(0x1D41A, 0x1D400);
      const italic      = to(0x1D44E, 0x1D434);
      const script      = to(0x1D4EA, 0x1D4D0);
      const fraktur     = to(0x1D586, 0x1D56C);
      const doubleStr   = to(0x1D552, 0x1D538);

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
