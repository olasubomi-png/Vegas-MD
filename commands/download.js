// Download Commands
const downloadCommands = {
  tiktok: {
    desc: 'Download TikTok video',
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url) return await sock.sendMessage(jid, { text: '❌ Please provide a TikTok URL\n\n*Usage:*\n.tiktok <url>' });
      if (!url.includes('tiktok') && !url.includes('vm.tiktok')) {
        return await sock.sendMessage(jid, { text: '❌ Invalid TikTok URL\n\nPlease use a valid TikTok link' });
      }
      await sock.sendMessage(jid, { text: '⬇️ *Downloading TikTok video...*\n\nPlease wait, this may take a moment.' });
    }
  },
  fb: {
    desc: 'Download Facebook video',
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url) return await sock.sendMessage(jid, { text: '❌ Please provide a Facebook URL\n\n*Usage:*\n.fb <url>' });
      if (!url.includes('facebook') && !url.includes('fb.com')) {
        return await sock.sendMessage(jid, { text: '❌ Invalid Facebook URL' });
      }
      await sock.sendMessage(jid, { text: '⬇️ *Downloading Facebook video...*\n\nPlease wait, this may take a moment.' });
    }
  },
  igdl: {
    desc: 'Download Instagram',
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url) return await sock.sendMessage(jid, { text: '❌ Please provide an Instagram URL\n\n*Usage:*\n.igdl <url>' });
      if (!url.includes('instagram') && !url.includes('ig.me') && !url.includes('instagr.am')) {
        return await sock.sendMessage(jid, { text: '❌ Invalid Instagram URL' });
      }
      await sock.sendMessage(jid, { text: '⬇️ *Downloading Instagram media...*\n\nPlease wait, this may take a moment.' });
    }
  },
  yt: {
    desc: 'Download YouTube',
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url) return await sock.sendMessage(jid, { text: '❌ Please provide a YouTube URL\n\n*Usage:*\n.yt <url>' });
      if (!url.includes('youtube') && !url.includes('youtu.be')) {
        return await sock.sendMessage(jid, { text: '❌ Invalid YouTube URL' });
      }
      await sock.sendMessage(jid, { text: '⬇️ *Downloading YouTube video...*\n\nPlease wait, this may take a moment.' });
    }
  },
  play: {
    desc: 'Search and download music',
    exec: async (args, sock, jid) => {
      const query = args.join(' ');
      if (!query) return await sock.sendMessage(jid, { text: '❌ Please provide a song name\n\n*Usage:*\n.play <song name>' });
      await sock.sendMessage(jid, { text: `🎵 *Searching for: ${query}*\n\nPlease wait, searching and downloading music...` });
    }
  }
};

module.exports = downloadCommands;
