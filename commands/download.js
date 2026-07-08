'use strict';
// commands/download.js — Working downloader commands
// Uses free public APIs + yt-dlp (if installed) for YouTube
const { exec } = require('child_process');
const { promisify } = require('util');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const axios = require('axios');

const execAsync = promisify(exec);
const { execFile } = require('child_process');
const execFileAsync = promisify(execFile);

function tmpFile(ext) {
  return path.join(os.tmpdir(), `olamd_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
}

// Strict YouTube URL validation — rejects shell metacharacters
function assertYouTubeUrl(url) {
  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[\w\-?=&#%.+/]+$/.test(url)) {
    throw new Error('Invalid YouTube URL');
  }
}

// ── cobalt.tools — multi-platform downloader (YouTube, Twitter, Instagram, FB) ──
async function cobaltFetch(url, downloadMode = 'auto', audioFormat = 'mp3') {
  const { data } = await axios.post(
    'https://api.cobalt.tools/',
    { url, downloadMode, audioFormat, filenameStyle: 'basic', quality: '720' },
    {
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        'User-Agent':   'OLASUBOMI-MD/3.0'
      },
      timeout: 30000
    }
  );
  // Normalise all response shapes to a single URL string
  if (data.status === 'error') throw new Error(data.error?.code || 'cobalt error');
  if (data.status === 'picker') {
    // picker is an array of items; take the first media URL
    const item = Array.isArray(data.picker) ? data.picker[0] : null;
    const picked = item?.url || item?.thumb || null;
    if (!picked) throw new Error('cobalt returned an empty picker list');
    return picked;
  }
  // 'stream', 'redirect', 'tunnel' — all have a single url field
  const resolved = typeof data.url === 'string' ? data.url
                 : Array.isArray(data.url)       ? data.url[0]
                 : null;
  if (!resolved) throw new Error('cobalt returned no usable URL');
  return resolved;
}

// ── yt-dlp helper — uses execFile (no shell) to prevent injection ──────────
async function ytDlpAvailable() {
  try { await execFileAsync('yt-dlp', ['--version']); return true; } catch { return false; }
}

async function ytDlpDownload(url, format = 'audio', quality = '720') {
  // Validate URL strictly — no shell is involved, but belt-and-braces
  assertYouTubeUrl(url);

  const outTemplate = tmpFile('');          // base path without extension
  const args = format === 'audio'
    ? ['-x', '--audio-format', 'mp3', '--audio-quality', '5',
       '-o', outTemplate + '.%(ext)s', url,
       '--no-playlist', '--max-filesize', '90m']
    : ['-f', `best[height<=${quality}][ext=mp4]/best[height<=${quality}]/best[ext=mp4]/best`,
       '-o', outTemplate + '.%(ext)s', url,
       '--no-playlist', '--max-filesize', '90m'];

  await execFileAsync('yt-dlp', args, { timeout: 180000 });

  // yt-dlp may choose a different extension — find the actual output file
  const dir   = path.dirname(outTemplate);
  const base  = path.basename(outTemplate);
  const found = fs.readdirSync(dir).find(f => f.startsWith(base) && f !== base);
  if (!found) throw new Error('yt-dlp produced no output file');
  return path.join(dir, found);
}

// ── TikTok via tikwm.com ───────────────────────────────────────────────────
async function tikwmFetch(url) {
  const { data } = await axios.post(
    'https://www.tikwm.com/api/',
    new URLSearchParams({ url, hd: '1' }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
  );
  if (data.code !== 0) throw new Error(data.msg || 'TikTok API error');
  const d = data.data;
  // Prefer HD no-watermark → play no-watermark → play
  return {
    videoUrl: d.hdplay || d.play || d.wmplay,
    audioUrl: d.music,
    title:    d.title   || 'TikTok Video',
    author:   d.author?.nickname || 'Unknown',
    duration: d.duration,
    cover:    d.cover
  };
}

// ── MediaFire scrape ───────────────────────────────────────────────────────
async function mediaFireDl(url) {
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000
  });
  const match = html.match(/href="(https:\/\/download\d+\.mediafire\.com\/[^"]+)"/);
  if (!match) throw new Error('Could not extract MediaFire download link');
  return match[1];
}

// ── Spotify oEmbed info ────────────────────────────────────────────────────
async function spotifyInfo(url) {
  const { data } = await axios.get(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
    { timeout: 10000 }
  );
  return { title: data.title, thumbnail: data.thumbnail_url };
}

// ── Generic send helpers ───────────────────────────────────────────────────
async function sendVideoFromUrl(sock, jid, videoUrl, caption) {
  await sock.sendMessage(jid, { video: { url: videoUrl }, caption, mimetype: 'video/mp4' });
}

async function sendAudioFromUrl(sock, jid, audioUrl, caption) {
  await sock.sendMessage(jid, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false });
  if (caption) await sock.sendMessage(jid, { text: caption });
}

async function sendAudioFromFile(sock, jid, filePath, caption) {
  const buf = fs.readFileSync(filePath);
  await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: false });
  if (caption) await sock.sendMessage(jid, { text: caption });
}

async function sendVideoFromFile(sock, jid, filePath, caption) {
  const buf = fs.readFileSync(filePath);
  await sock.sendMessage(jid, { video: buf, caption, mimetype: 'video/mp4' });
}

// ── Commands ───────────────────────────────────────────────────────────────
const downloadCommands = {

  // ── TikTok ──────────────────────────────────────────────
  tiktok: {
    category: 'downloader', desc: 'Download TikTok video without watermark',
    usage: '.tiktok <url>', aliases: ['tt'], permissions: 'all',
    examples: ['.tiktok https://vm.tiktok.com/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !url.includes('tiktok')) {
        return sock.sendMessage(jid, { text: `⬇️ *TikTok Downloader*\n\nUsage: *.tiktok <url>*\n\nExample:\n.tiktok https://vm.tiktok.com/xxx` });
      }
      await sock.sendMessage(jid, { text: `⏳ Fetching TikTok video...` });
      try {
        const info = await tikwmFetch(url);
        await sock.sendMessage(jid, {
          image:   { url: info.cover },
          caption: `🎵 *${info.title}*\n👤 ${info.author}\n⏱️ ${info.duration}s\n\n📥 Downloading video...`
        });
        await sendVideoFromUrl(sock, jid, info.videoUrl, `🎵 *${info.title}*\n👤 ${info.author}`);
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ TikTok download failed: ${err.message}` });
      }
    }
  },

  // ── Facebook ────────────────────────────────────────────
  facebook: {
    category: 'downloader', desc: 'Download Facebook video',
    usage: '.facebook <url>', aliases: ['fb'], permissions: 'all',
    examples: ['.facebook https://fb.com/video/...'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/facebook\.com|fb\.com|fb\.watch/.test(url)) {
        return sock.sendMessage(jid, { text: `⬇️ *Facebook Downloader*\n\nUsage: *.facebook <url>*` });
      }
      await sock.sendMessage(jid, { text: `⏳ Fetching Facebook video...` });
      try {
        const dlUrl = await cobaltFetch(url, 'auto');
        if (!dlUrl) throw new Error('No download link returned');
        await sendVideoFromUrl(sock, jid, dlUrl, `📘 *Facebook Video*`);
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Facebook download failed: ${err.message}\n\n_Try a direct video URL (right-click → copy video URL)._` });
      }
    }
  },

  fb: {
    category: 'downloader', desc: 'Download Facebook video (alias)',
    usage: '.fb <url>', aliases: ['facebook'], permissions: 'all',
    examples: ['.fb https://fb.com/video/...'],
    exec: async (args, sock, jid) => {
      // Reuse facebook exec
      return downloadCommands.facebook.exec(args, sock, jid);
    }
  },

  // ── Instagram ────────────────────────────────────────────
  instagram: {
    category: 'downloader', desc: 'Download Instagram photo or video',
    usage: '.instagram <url>', aliases: ['ig', 'igdl'], permissions: 'all',
    examples: ['.instagram https://www.instagram.com/p/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/instagram\.com|instagr\.am/.test(url)) {
        return sock.sendMessage(jid, { text: `⬇️ *Instagram Downloader*\n\nUsage: *.instagram <url>*\n\nWorks with posts, reels, and stories.` });
      }
      await sock.sendMessage(jid, { text: `⏳ Fetching Instagram media...` });
      try {
        const dlUrl = await cobaltFetch(url, 'auto');
        if (!dlUrl) throw new Error('No download link returned');
        // Try as video first, fall back to image
        try {
          await sendVideoFromUrl(sock, jid, dlUrl, `📸 *Instagram Media*`);
        } catch {
          await sock.sendMessage(jid, { image: { url: dlUrl }, caption: `📸 *Instagram Photo*` });
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Instagram download failed: ${err.message}` });
      }
    }
  },

  igdl: {
    category: 'downloader', desc: 'Download Instagram (alias)',
    usage: '.igdl <url>', aliases: ['instagram'], permissions: 'all',
    examples: ['.igdl https://www.instagram.com/p/xxx'],
    exec: async (args, sock, jid) => downloadCommands.instagram.exec(args, sock, jid)
  },

  // ── Twitter / X ──────────────────────────────────────────
  twitter: {
    category: 'downloader', desc: 'Download Twitter / X video',
    usage: '.twitter <url>', aliases: ['x', 'xvideo'], permissions: 'all',
    examples: ['.twitter https://twitter.com/user/status/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/twitter\.com|x\.com|t\.co/.test(url)) {
        return sock.sendMessage(jid, { text: `⬇️ *Twitter/X Downloader*\n\nUsage: *.twitter <url>*` });
      }
      await sock.sendMessage(jid, { text: `⏳ Fetching Twitter/X video...` });
      try {
        const dlUrl = await cobaltFetch(url, 'auto');
        if (!dlUrl) throw new Error('No download link returned');
        await sendVideoFromUrl(sock, jid, dlUrl, `🐦 *Twitter/X Video*`);
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Twitter download failed: ${err.message}` });
      }
    }
  },

  // ── YouTube MP3 ──────────────────────────────────────────
  ytmp3: {
    category: 'downloader', desc: 'Download YouTube audio (MP3)',
    usage: '.ytmp3 <url>', aliases: [], permissions: 'all',
    examples: ['.ytmp3 https://youtu.be/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/youtube\.com|youtu\.be/.test(url)) {
        return sock.sendMessage(jid, { text: `🎵 *YouTube MP3 Downloader*\n\nUsage: *.ytmp3 <url>*` });
      }
      await sock.sendMessage(jid, { text: `⏳ Downloading YouTube audio...` });
      try {
        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(url, 'audio');
            await sendAudioFromFile(sock, jid, filePath, `🎵 *YouTube Audio*\n🔗 ${url}`);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          // Fallback: cobalt audio
          const dlUrl = await cobaltFetch(url, 'audio', 'mp3');
          if (!dlUrl) throw new Error('No audio link returned');
          await sendAudioFromUrl(sock, jid, dlUrl, `🎵 *YouTube Audio*\n🔗 ${url}`);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Audio download failed: ${err.message}\n\n💡 Install yt-dlp on your server for best results:\n\`sudo pip install yt-dlp\`` });
      }
    }
  },

  // ── YouTube MP4 ──────────────────────────────────────────
  ytmp4: {
    category: 'downloader', desc: 'Download YouTube video (MP4)',
    usage: '.ytmp4 <url>', aliases: [], permissions: 'all',
    examples: ['.ytmp4 https://youtu.be/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !/youtube\.com|youtu\.be/.test(url)) {
        return sock.sendMessage(jid, { text: `🎬 *YouTube MP4 Downloader*\n\nUsage: *.ytmp4 <url>*` });
      }
      await sock.sendMessage(jid, { text: `⏳ Downloading YouTube video (up to 720p)...` });
      try {
        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(url, 'video', '720');
            await sendVideoFromFile(sock, jid, filePath, `🎬 *YouTube Video*\n🔗 ${url}`);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          const dlUrl = await cobaltFetch(url, 'auto');
          if (!dlUrl) throw new Error('No video link returned');
          await sendVideoFromUrl(sock, jid, dlUrl, `🎬 *YouTube Video*\n🔗 ${url}`);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Video download failed: ${err.message}\n\n💡 Install yt-dlp on your server:\n\`sudo pip install yt-dlp\`` });
      }
    }
  },

  yt: {
    category: 'downloader', desc: 'Download YouTube video',
    usage: '.yt <url>', aliases: [], permissions: 'all',
    examples: ['.yt https://youtu.be/xxx'],
    exec: async (args, sock, jid) => downloadCommands.ytmp4.exec(args, sock, jid)
  },

  // ── Song search (query → YouTube audio) ─────────────────
  song: {
    category: 'downloader', desc: 'Search and download a song by name',
    usage: '.song <song name>', aliases: [], permissions: 'all',
    examples: ['.song Blinding Lights', '.song Bohemian Rhapsody'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: `❌ Usage: .song <song name>` });
      await sock.sendMessage(jid, { text: `🎵 Searching: _"${q}"_...` });
      try {
        // Get first YouTube result via Invidious (open-source YouTube frontend)
        const { data } = await axios.get(
          `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title,author,lengthSeconds`,
          { timeout: 15000 }
        );
        if (!data?.length) throw new Error('No results found');
        const video   = data[0];
        const ytUrl   = `https://youtu.be/${video.videoId}`;
        const caption = `🎵 *${video.title}*\n👤 ${video.author}\n⏱️ ${Math.floor(video.lengthSeconds / 60)}:${String(video.lengthSeconds % 60).padStart(2, '0')}`;
        await sock.sendMessage(jid, { text: `${caption}\n\n⏳ Downloading...` });

        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(ytUrl, 'audio');
            await sendAudioFromFile(sock, jid, filePath, caption);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          const dlUrl = await cobaltFetch(ytUrl, 'audio', 'mp3');
          await sendAudioFromUrl(sock, jid, dlUrl, caption);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Song download failed: ${err.message}` });
      }
    }
  },

  play: {
    category: 'downloader', desc: 'Search YouTube and play music',
    usage: '.play <song name>', aliases: [], permissions: 'all',
    examples: ['.play Shape of You', '.play Despacito'],
    exec: async (args, sock, jid) => downloadCommands.song.exec(args, sock, jid)
  },

  // ── Video search (query → YouTube video) ─────────────────
  video: {
    category: 'downloader', desc: 'Search and download a video by name',
    usage: '.video <title>', aliases: [], permissions: 'all',
    examples: ['.video funny cats compilation'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: `❌ Usage: .video <title>` });
      await sock.sendMessage(jid, { text: `🎬 Searching: _"${q}"_...` });
      try {
        const { data } = await axios.get(
          `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title,author,lengthSeconds`,
          { timeout: 15000 }
        );
        if (!data?.length) throw new Error('No results found');
        const video   = data[0];
        const ytUrl   = `https://youtu.be/${video.videoId}`;
        const caption = `🎬 *${video.title}*\n👤 ${video.author}`;
        await sock.sendMessage(jid, { text: `${caption}\n\n⏳ Downloading...` });

        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(ytUrl, 'video', '480');
            await sendVideoFromFile(sock, jid, filePath, caption);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          const dlUrl = await cobaltFetch(ytUrl, 'auto');
          await sendVideoFromUrl(sock, jid, dlUrl, caption);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Video download failed: ${err.message}` });
      }
    }
  },

  // ── Spotify ────────────────────────────────────────────────
  spotify: {
    category: 'downloader', desc: 'Get Spotify track info and download audio',
    usage: '.spotify <url or song name>', aliases: [], permissions: 'all',
    examples: ['.spotify https://open.spotify.com/track/xxx', '.spotify Blinding Lights The Weeknd'],
    exec: async (args, sock, jid) => {
      const input = args.join(' ').trim();
      if (!input) return sock.sendMessage(jid, { text: `❌ Usage: .spotify <url or song name>` });
      await sock.sendMessage(jid, { text: `🎧 Processing Spotify request...` });
      try {
        let title, thumbnail;
        if (input.includes('spotify.com')) {
          const info = await spotifyInfo(input);
          title     = info.title;
          thumbnail = info.thumbnail;
        } else {
          title = input;
        }
        await sock.sendMessage(jid, { text: `🎧 Found: *${title}*\n\n⏳ Downloading via YouTube...` });
        // Search YouTube for the track and download
        const { data } = await axios.get(
          `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(title)}&type=video&fields=videoId,title,author`,
          { timeout: 15000 }
        );
        if (!data?.length) throw new Error('Track not found on YouTube');
        const ytUrl = `https://youtu.be/${data[0].videoId}`;
        if (await ytDlpAvailable()) {
          let filePath;
          try {
            filePath = await ytDlpDownload(ytUrl, 'audio');
            await sendAudioFromFile(sock, jid, filePath, `🎧 *${title}*`);
          } finally {
            if (filePath) try { fs.unlinkSync(filePath); } catch {}
          }
        } else {
          const dlUrl = await cobaltFetch(ytUrl, 'audio', 'mp3');
          await sendAudioFromUrl(sock, jid, dlUrl, `🎧 *${title}*`);
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Spotify download failed: ${err.message}` });
      }
    }
  },

  // ── MediaFire ─────────────────────────────────────────────
  mediafire: {
    category: 'downloader', desc: 'Download file from MediaFire',
    usage: '.mediafire <url>', aliases: ['mf'], permissions: 'all',
    examples: ['.mediafire https://www.mediafire.com/file/xxx'],
    exec: async (args, sock, jid) => {
      const url = args[0];
      if (!url || !url.includes('mediafire.com')) {
        return sock.sendMessage(jid, { text: `📁 *MediaFire Downloader*\n\nUsage: *.mediafire <url>*` });
      }
      await sock.sendMessage(jid, { text: `📁 Extracting MediaFire download link...` });
      try {
        const dlUrl = await mediaFireDl(url);
        const filename = decodeURIComponent(dlUrl.split('/').pop().split('?')[0]);
        await sock.sendMessage(jid, {
          text:
            `📁 *MediaFire Download Ready*\n\n` +
            `📎 *File:* ${filename}\n\n` +
            `🔗 *Direct Link:*\n${dlUrl}\n\n` +
            `_Click the link to download directly._`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ MediaFire failed: ${err.message}` });
      }
    }
  }
};

module.exports = downloadCommands;
