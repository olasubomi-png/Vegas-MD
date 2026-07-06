// Tools & Utilities Commands
const toolsCommands = {
  font: {
    desc: 'Generate fancy text',
    exec: async (args, sock, jid) => {
      if (!args.length) return await sock.sendMessage(jid, { text: '❌ Please provide text\n\nUsage: .font <text>' });
      const text = args.join(' ');
      
      // Various fancy text styles
      const styles = {
        fancy: text.split('').map(c => {
          const code = c.charCodeAt(0);
          if (code >= 97 && code <= 122) return String.fromCharCode(code - 97 + 0x1D5F5);
          return c;
        }).join(''),
        bold: `*${text}*`,
        italic: `_${text}_`,
        strike: `~${text}~`,
        mono: `\`${text}\``
      };
      
      const response = `🔤 *Fancy Text Styles*\n\nFancy: ${styles.fancy}\nBold: ${styles.bold}\nItalic: ${styles.italic}\nStrike: ${styles.strike}\nMono: ${styles.mono}`;
      await sock.sendMessage(jid, { text: response });
    }
  },
  sticker: {
    desc: 'Convert to sticker',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: '📌 *Sticker Converter*\n\nReply to an image with this command to convert it to a sticker.\n\n*Usage:*\nReply to image → .sticker' });
    }
  },
  enhance: {
    desc: 'Enhance image',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: '🖼️ *Image Enhancement*\n\nReply to an image with this command to enhance it.\n\n*Usage:*\nReply to image → .enhance' });
    }
  },
  upscale: {
    desc: 'Upscale image',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: '📈 *Image Upscaler*\n\nReply to an image with this command to upscale it.\n\n*Usage:*\nReply to image → .upscale' });
    }
  },
  removebg: {
    desc: 'Remove background',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: '🎨 *Background Remover*\n\nReply to an image with this command to remove its background.\n\n*Usage:*\nReply to image → .removebg' });
    }
  },
  blur: {
    desc: 'Blur image',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: '🌫️ *Image Blur*\n\nReply to an image with this command to blur it.\n\n*Usage:*\nReply to image → .blur' });
    }
  },
  colorize: {
    desc: 'Add colors to image',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: '🎨 *Image Colorizer*\n\nReply to an image with this command to add colors.\n\n*Usage:*\nReply to image → .colorize' });
    }
  }
};

module.exports = toolsCommands;
