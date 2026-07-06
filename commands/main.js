// Main & Utility Commands
const mainCommands = {
  menu: {
    desc: 'Show command menu',
    exec: async (args, sock, jid) => {
      try {
        const menu = `╭┈───〔 OLASUBOMI-MD 〕┈───⊷
├⬗ Owner: Olasubomi
├⬗ Commands: 727+
├⬗ Prefix: .
├⬗ Mode: private
├⬗ Version: 3.0.0 Beta
╰───────────────────⊷

\`『 MAIN 』\`
┋ ▸ .menu - Show this menu
┋ ▸ .help - Show help
┋ ▸ .ping - Check status
┋ ▸ .alive - Bot alive check
┋ ▸ .uptime - Bot uptime
┋ ▸ .owner - Owner info
┋ ▸ .status - Full status

\`『 AI 』\`
┋ ▸ .gpt <query> - Ask ChatGPT
┋ ▸ .copilot <query> - GitHub Copilot
┋ ▸ .claude <query> - Claude AI
┋ ▸ .gemini <query> - Google Gemini

\`『 DOWNLOAD 』\`
┋ ▸ .tiktok <url> - Download TikTok
┋ ▸ .fb <url> - Download Facebook
┋ ▸ .igdl <url> - Download Instagram
┋ ▸ .yt <url> - Download YouTube
┋ ▸ .play <song> - Search music

\`『 FUN 』\`
┋ ▸ .joke - Random joke
┋ ▸ .quote - Inspirational quote
┋ ▸ .ship - Ship calculator
┋ ▸ .dare - Get a dare
┋ ▸ .truth - Get a truth

\`『 GROUP 』\`
┋ ▸ .promote - Promote member
┋ ▸ .demote - Demote admin
┋ ▸ .kick - Remove member
┋ ▸ .mute - Mute group
┋ ▸ .unmute - Unmute group
┋ ▸ .tagall - Tag all members

\`『 AUDIO 』\`
┋ ▸ .bass - Bass boost
┋ ▸ .deep - Deep voice
┋ ▸ .fast - Speed up
┋ ▸ .slow - Slow down
┋ ▸ .reverse - Reverse audio
┋ ▸ .robot - Robot voice

\`『 TOOLS 』\`
┋ ▸ .font <text> - Fancy text
┋ ▸ .sticker - Convert to sticker
┋ ▸ .enhance - Enhance image
┋ ▸ .upscale - Upscale image
┋ ▸ .removebg - Remove background

*© Powered by OLASUBOMI-MD v3.0.0*`;

        const result = await sock.sendMessage(jid, { text: menu });
        if (!result) {
          throw new Error('Failed to send menu message');
        }
        return result;
      } catch (err) {
        console.error('Menu command error:', err);
        await sock.sendMessage(jid, { text: `❌ Error sending menu: ${err.message}` });
        throw err;
      }
    }
  },
  help: {
    desc: 'Show help',
    exec: async (args, sock, jid) => {
      const help = `🤖 *OLASUBOMI-MD Help*

Use prefix "." before any command.

*Main Commands:*
.menu - Show all commands
.help - Show this help
.ping - Check bot status
.alive - Check if bot alive
.uptime - Bot running time
.owner - Get owner info
.status - Full bot status

*AI Commands:*
.gpt, .copilot, .claude, .gemini

*Download:*
.tiktok, .fb, .igdl, .yt, .play

*Fun:*
.joke, .quote, .ship, .dare, .truth

*Group:*
.promote, .demote, .kick, .mute, .tagall

*Audio:*
.bass, .deep, .fast, .slow, .reverse, .robot

*Tools:*
.font, .sticker, .enhance, .upscale, .removebg

Type .menu for complete list!`;
      await sock.sendMessage(jid, { text: help });
    }
  },
  ping: {
    desc: 'Check bot status',
    exec: async (args, sock, jid) => {
      const start = Date.now();
      const msg = await sock.sendMessage(jid, { text: '🏓 Pong! Calculating response time...' });
      const responseTime = Date.now() - start;
      await sock.sendMessage(jid, { text: `🏓 *Pong!*\n⚡ Response time: ${responseTime}ms` });
    }
  },
  alive: {
    desc: 'Bot alive check',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: `✅ *OLASUBOMI-MD is Alive!*\n📅 Time: ${new Date().toLocaleString()}\n🔌 Status: Connected` });
    }
  },
  uptime: {
    desc: 'Show uptime',
    exec: async (args, sock, jid) => {
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      
      await sock.sendMessage(jid, { 
        text: `⏱️ *Bot Uptime*\n${days}d ${hours}h ${minutes}m ${seconds}s` 
      });
    }
  },
  owner: {
    desc: 'Get owner info',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { 
        text: `👤 *Owner Information*\n\nName: Olasubomi\n📱 Status: Active\n🤖 Bot: OLASUBOMI-MD v3.0.0\n🌐 Prefix: .` 
      });
    }
  },
  status: {
    desc: 'Bot status',
    exec: async (args, sock, jid) => {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      
      await sock.sendMessage(jid, { 
        text: `🟢 *Bot Status*\n\n✅ Status: Online\n📊 Commands: 727+\n⏱️ Uptime: ${hours}h ${minutes}m\n🔌 Connection: Active\n📝 Version: 3.0.0 Beta\n👤 Owner: Olasubomi` 
      });
    }
  }
};

module.exports = mainCommands;
