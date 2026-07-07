'use strict';
// commands/download.js — Downloader commands
// All downloads are stubs that validate URLs and show processing messages.
// Wire up a real download API (e.g. cobalt.tools, rapid API) to complete them.

function validateUrl(url, patterns, name) {
  if (!url) return `❌ Provide a ${name} URL.\n\n*Usage:* .${name.toLowerCase()} <url>`;
  if (patterns && !patterns.some(p => url.includes(p))) return `❌ Invalid ${name} URL.`;
  return null;
}

function stub(label, emoji, patterns, note = '') {
  return async (args, sock, jid) => {
    const url = args[0];
    const err = validateUrl(url, patterns, label);
    if (err) return sock.sendMessage(jid, { text: err });
    await sock.sendMessage(jid, {
      text: `${emoji} *Downloading ${label}...*\n\n🔗 ${url}\n\n⏳ Please wait...${note ? '\n\n' + note : ''}`
    });
  };
}

function queryStub(label, emoji) {
  return async (args, sock, jid) => {
    const q = args.join(' ').trim();
    if (!q) return sock.sendMessage(jid, { text: `❌ Usage: .${label.toLowerCase()} <song/query>` });
    await sock.sendMessage(jid, {
      text: `${emoji} *Searching: ${q}*\n\n⏳ Please wait...`
    });
  };
}

const downloadCommands = {
  tiktok: {
    category: 'downloader', desc: 'Download TikTok video (no watermark)',
    usage: '.tiktok <url>', aliases: ['tt'], permissions: 'all',
    examples: ['.tiktok https://vm.tiktok.com/xxx'],
    exec: stub('TikTok', '⬇️', ['tiktok', 'vm.tiktok'])
  },
  facebook: {
    category: 'downloader', desc: 'Download Facebook video',
    usage: '.facebook <url>', aliases: [], permissions: 'all',
    examples: ['.facebook https://fb.com/video/...'],
    exec: stub('Facebook', '⬇️', ['facebook', 'fb.com', 'fb.watch'])
  },
  fb: {
    category: 'downloader', desc: 'Download Facebook video (alias)',
    usage: '.fb <url>', aliases: ['facebook'], permissions: 'all',
    examples: ['.fb https://fb.com/video/...'],
    exec: stub('Facebook', '⬇️', ['facebook', 'fb.com', 'fb.watch'])
  },
  instagram: {
    category: 'downloader', desc: 'Download Instagram photo or video',
    usage: '.instagram <url>', aliases: ['ig'], permissions: 'all',
    examples: ['.instagram https://www.instagram.com/p/xxx'],
    exec: stub('Instagram', '⬇️', ['instagram', 'ig.me', 'instagr.am'])
  },
  igdl: {
    category: 'downloader', desc: 'Download Instagram (alias)',
    usage: '.igdl <url>', aliases: ['instagram'], permissions: 'all',
    examples: ['.igdl https://www.instagram.com/p/xxx'],
    exec: stub('Instagram', '⬇️', ['instagram', 'ig.me', 'instagr.am'])
  },
  twitter: {
    category: 'downloader', desc: 'Download Twitter / X video',
    usage: '.twitter <url>', aliases: ['x'], permissions: 'all',
    examples: ['.twitter https://twitter.com/user/status/xxx'],
    exec: stub('Twitter/X', '⬇️', ['twitter.com', 'x.com', 't.co'])
  },
  ytmp3: {
    category: 'downloader', desc: 'Download YouTube audio (MP3)',
    usage: '.ytmp3 <url>', aliases: [], permissions: 'all',
    examples: ['.ytmp3 https://youtu.be/xxx'],
    exec: stub('YouTube MP3', '🎵', ['youtube', 'youtu.be'])
  },
  ytmp4: {
    category: 'downloader', desc: 'Download YouTube video (MP4)',
    usage: '.ytmp4 <url>', aliases: [], permissions: 'all',
    examples: ['.ytmp4 https://youtu.be/xxx'],
    exec: stub('YouTube MP4', '🎬', ['youtube', 'youtu.be'])
  },
  yt: {
    category: 'downloader', desc: 'Download YouTube video',
    usage: '.yt <url>', aliases: ['ytmp4'], permissions: 'all',
    examples: ['.yt https://youtu.be/xxx'],
    exec: stub('YouTube', '🎬', ['youtube', 'youtu.be'])
  },
  song: {
    category: 'downloader', desc: 'Search and download a song (audio)',
    usage: '.song <title>', aliases: ['ytmp3'], permissions: 'all',
    examples: ['.song Blinding Lights', '.song Bohemian Rhapsody'],
    exec: queryStub('song', '🎵')
  },
  video: {
    category: 'downloader', desc: 'Search and download a video',
    usage: '.video <title>', aliases: ['ytmp4'], permissions: 'all',
    examples: ['.video funny cats compilation'],
    exec: queryStub('video', '🎬')
  },
  play: {
    category: 'downloader', desc: 'Search YouTube and play music',
    usage: '.play <song name>', aliases: [], permissions: 'all',
    examples: ['.play Shape of You', '.play Despacito'],
    exec: queryStub('play', '▶️')
  },
  spotify: {
    category: 'downloader', desc: 'Download Spotify track',
    usage: '.spotify <url>', aliases: [], permissions: 'all',
    examples: ['.spotify https://open.spotify.com/track/xxx'],
    exec: stub('Spotify', '🎧', ['spotify.com', 'open.spotify'])
  },
  mediafire: {
    category: 'downloader', desc: 'Download file from MediaFire',
    usage: '.mediafire <url>', aliases: ['mf'], permissions: 'all',
    examples: ['.mediafire https://www.mediafire.com/file/xxx'],
    exec: stub('MediaFire', '📁', ['mediafire.com'])
  }
};

module.exports = downloadCommands;
