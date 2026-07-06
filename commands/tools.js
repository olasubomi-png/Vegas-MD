// Tools & Utilities Commands

const toolsCommands = {
  font: {
    desc: 'Generate fancy text styles',
    exec: async (args, sock, jid) => {
      if (!args.length) {
        return await sock.sendMessage(jid, { text: '❌ Please provide text.\n\n*Usage:* .font <your text>' });
      }
      const text = args.join(' ');

      // Unicode bold/italic helpers
      const toBold = s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(code - 65 + 0x1D400);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D41A);
        return c;
      }).join('');

      const toItalic = s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(code - 65 + 0x1D434);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D44E);
        return c;
      }).join('');

      const toScript = s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(code - 65 + 0x1D4D0);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D4EA);
        return c;
      }).join('');

      const toFraktur = s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(code - 65 + 0x1D56C);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D586);
        return c;
      }).join('');

      const toDoubleStruck = s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(code - 65 + 0x1D538);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D552);
        return c;
      }).join('');

      const response =
        `🔤 *Fancy Text Styles for:* _${text}_\n\n` +
        `*Bold:* ${toBold(text)}\n` +
        `*Italic:* ${toItalic(text)}\n` +
        `*Script:* ${toScript(text)}\n` +
        `*Fraktur:* ${toFraktur(text)}\n` +
        `*Double:* ${toDoubleStruck(text)}\n` +
        `*WA Bold:* *${text}*\n` +
        `*WA Italic:* _${text}_\n` +
        `*WA Mono:* \`${text}\`\n` +
        `*WA Strike:* ~${text}~`;

      await sock.sendMessage(jid, { text: response });
    }
  },

  sticker: {
    desc: 'Convert image/video to sticker',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasImage = quoted?.imageMessage;
      const hasVideo = quoted?.videoMessage || quoted?.stickerMessage;

      if (!hasImage && !hasVideo) {
        return await sock.sendMessage(jid, {
          text: `📌 *Sticker Maker*\n\nReply to an *image* or short *video* with *.sticker* to convert it.\n\n*Steps:*\n1. Find an image in the chat\n2. Reply to it with .sticker`
        });
      }

      await sock.sendMessage(jid, {
        text: `📌 *Converting to sticker...*\n\n_Note: Sticker creation requires image processing libraries. Feature coming soon._`
      });
    }
  },

  enhance: {
    desc: 'Enhance image quality',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return await sock.sendMessage(jid, {
          text: `🖼️ *Image Enhancer*\n\nReply to an *image* with *.enhance*\n\n*Steps:*\n1. Find an image\n2. Reply to it with .enhance`
        });
      }
      await sock.sendMessage(jid, { text: `🖼️ *Enhancing image...*\n\n_Image enhancement requires an AI image API. Coming soon._` });
    }
  },

  upscale: {
    desc: 'Upscale image resolution',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return await sock.sendMessage(jid, {
          text: `📈 *Image Upscaler*\n\nReply to an *image* with *.upscale*\n\n*Steps:*\n1. Find an image\n2. Reply to it with .upscale`
        });
      }
      await sock.sendMessage(jid, { text: `📈 *Upscaling image...*\n\n_Upscaling requires a super-resolution API. Coming soon._` });
    }
  },

  removebg: {
    desc: 'Remove image background',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return await sock.sendMessage(jid, {
          text: `🎨 *Background Remover*\n\nReply to an *image* with *.removebg*\n\n*Steps:*\n1. Find an image\n2. Reply to it with .removebg`
        });
      }
      await sock.sendMessage(jid, { text: `🎨 *Removing background...*\n\n_Background removal requires remove.bg API key. Coming soon._` });
    }
  },

  blur: {
    desc: 'Blur an image',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return await sock.sendMessage(jid, { text: `🌫️ *Image Blur*\n\nReply to an *image* with *.blur*` });
      }
      await sock.sendMessage(jid, { text: `🌫️ *Blurring image...*\n\n_Coming soon._` });
    }
  },

  colorize: {
    desc: 'Colorize a black & white image',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return await sock.sendMessage(jid, { text: `🎨 *Image Colorizer*\n\nReply to a *black & white image* with *.colorize*` });
      }
      await sock.sendMessage(jid, { text: `🎨 *Colorizing image...*\n\n_Coming soon._` });
    }
  }
};

module.exports = toolsCommands;
