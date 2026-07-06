// Main & Utility Commands

function getUptime() {
  const uptime = Math.floor((Date.now() - (global.botStartTime || Date.now())) / 1000);
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

const mainCommands = {
  menu: {
    desc: 'Show all commands',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      const menu = `╭┈───〔 *OLASUBOMI-MD* 〕───⊷
├⬗ Owner  : ${cfg.ownerName || 'Olasubomi'}
├⬗ Prefix : ${cfg.prefix || '.'}
├⬗ Mode   : ${cfg.mode || 'private'}
├⬗ Version: ${cfg.version || '3.0.0'} ${cfg.beta || 'Beta'}
├⬗ Uptime : ${getUptime()}
╰────────────────────⊷

*『 MAIN 』*
┋ ▸ .menu — Show this menu
┋ ▸ .help — Usage guide
┋ ▸ .ping — Response time
┋ ▸ .alive — Is bot online?
┋ ▸ .uptime — How long running
┋ ▸ .owner — Owner info
┋ ▸ .status — Full bot status
┋ ▸ .settings — Bot settings

*『 AI 』*
┋ ▸ .ai <question> — Ask AI (alias: .gpt)
┋ ▸ .gpt <question> — Ask ChatGPT
┋ ▸ .gemini <question> — Google Gemini
┋ ▸ .claude <question> — Claude AI
┋ ▸ .copilot <question> — GitHub Copilot
┋ ▸ .chatgpt <question> — ChatGPT
┋ ▸ .imagine <prompt> — AI image description

*『 DOWNLOAD 』*
┋ ▸ .tiktok <url> — Download TikTok
┋ ▸ .fb <url> — Download Facebook
┋ ▸ .igdl <url> — Download Instagram
┋ ▸ .yt <url> — Download YouTube
┋ ▸ .play <song> — Download music

*『 FUN 』*
┋ ▸ .joke — Random joke
┋ ▸ .quote — Inspirational quote
┋ ▸ .ship — Compatibility %
┋ ▸ .dare — Truth or dare
┋ ▸ .truth — Truth question
┋ ▸ .8ball <q> — Magic 8-ball
┋ ▸ .roast — Get roasted
┋ ▸ .compliment — Get a compliment

*『 GROUP 』*
┋ ▸ .promote @user — Make admin
┋ ▸ .demote @user — Remove admin
┋ ▸ .kick @user — Remove member
┋ ▸ .mute — Mute group chat
┋ ▸ .unmute — Unmute group chat
┋ ▸ .tagall [msg] — Tag everyone
┋ ▸ .ginfo — Group info

*『 AUDIO 』*
┋ ▸ .bass — Bass boost audio
┋ ▸ .deep — Deep voice effect
┋ ▸ .fast — Speed up audio
┋ ▸ .slow — Slow down audio
┋ ▸ .reverse — Reverse audio
┋ ▸ .robot — Robot voice
┋ ▸ .chipmunk — Chipmunk voice
┋ ▸ .smooth — Smooth effect

*『 TOOLS 』*
┋ ▸ .font <text> — Fancy text styles
┋ ▸ .sticker — Image → sticker
┋ ▸ .enhance — Enhance image
┋ ▸ .upscale — Upscale image
┋ ▸ .removebg — Remove background
┋ ▸ .blur — Blur image
┋ ▸ .colorize — Colorize image

*『 SETTINGS 』*
┋ ▸ .settings — Bot configuration
┋ ▸ .prefix — Current prefix
┋ ▸ .privacy — Privacy mode

> *© OLASUBOMI-MD v3.0.0 Beta*`;

      await sock.sendMessage(jid, { text: menu });
    }
  },

  help: {
    desc: 'Show help guide',
    exec: async (args, sock, jid) => {
      const help = `🤖 *OLASUBOMI-MD Help*

Use the dot (.) prefix before every command.

*Examples:*
• .menu — See all commands
• .gpt What is the capital of France?
• .tiktok https://vm.tiktok.com/xxx
• .joke
• .promote @user (in a group)

*Tips:*
• All AI commands require a question after the command
• Download commands need a valid URL
• Group commands only work inside groups
• For audio/image tools, reply to the media first

Type *.menu* to see the full command list.`;
      await sock.sendMessage(jid, { text: help });
    }
  },

  ping: {
    desc: 'Check response time',
    exec: async (args, sock, jid) => {
      const start = Date.now();
      await sock.sendMessage(jid, { text: '🏓 Pinging...' });
      const ms = Date.now() - start;
      await sock.sendMessage(jid, { text: `🏓 *Pong!*\n⚡ Response time: *${ms}ms*` });
    }
  },

  alive: {
    desc: 'Check if bot is alive',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, {
        text: `✅ *OLASUBOMI-MD is Alive!*\n\n📅 Time   : ${new Date().toLocaleString()}\n⏱️ Uptime : ${getUptime()}\n🔌 Status : Connected\n🤖 Version: 3.0.0 Beta`
      });
    }
  },

  uptime: {
    desc: 'Show how long bot has been running',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: `⏱️ *Bot Uptime*\n\n${getUptime()}` });
    }
  },

  owner: {
    desc: 'Get owner information',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      await sock.sendMessage(jid, {
        text: `👤 *Owner Information*\n\nName   : ${cfg.ownerName || 'Olasubomi'}\nNumber : ${cfg.ownerNumber || 'Not set'}\nBot    : OLASUBOMI-MD v3.0.0\nPrefix : ${cfg.prefix || '.'}`
      });
    }
  },

  status: {
    desc: 'Full bot status',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      const memUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      await sock.sendMessage(jid, {
        text: `🟢 *OLASUBOMI-MD Status*\n\n✅ Status   : Online\n⏱️ Uptime   : ${getUptime()}\n💾 Memory   : ${memUsed} MB\n📊 Commands : ${Object.keys(require('./index')).length}\n🔌 Mode     : ${cfg.mode || 'private'}\n📝 Version  : 3.0.0 Beta\n👤 Owner    : ${cfg.ownerName || 'Olasubomi'}`
      });
    }
  }
};

module.exports = mainCommands;
