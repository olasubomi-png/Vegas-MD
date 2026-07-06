// Main & menu commands — paginated category menus
const db = require('../lib/database');

function getUptime() {
  const s = Math.floor((Date.now() - (global.botStartTime || Date.now())) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(' ');
}

const CATEGORIES = {
  main:     { emoji: '🏠', label: 'MAIN',      key: 'main' },
  ai:       { emoji: '🤖', label: 'AI',        key: 'ai' },
  download: { emoji: '⬇️', label: 'DOWNLOAD',  key: 'download' },
  group:    { emoji: '👥', label: 'GROUP',      key: 'group' },
  mod:      { emoji: '🛡️', label: 'MODERATION', key: 'mod' },
  fun:      { emoji: '🎮', label: 'FUN',        key: 'fun' },
  economy:  { emoji: '💰', label: 'ECONOMY',   key: 'economy' },
  audio:    { emoji: '🎵', label: 'AUDIO',      key: 'audio' },
  tools:    { emoji: '🔧', label: 'TOOLS',      key: 'tools' },
  owner:    { emoji: '👑', label: 'OWNER',      key: 'owner' }
};

const CATEGORY_COMMANDS = {
  main: [
    '.menu [category] — Browse all commands',
    '.help — Usage guide',
    '.ping — Response time',
    '.alive — Is bot online?',
    '.uptime — Running time',
    '.status — Full status',
    '.profile — Your profile'
  ],
  ai: [
    '.ai <q> — Ask AI (auto model)',
    '.gpt <q> — ChatGPT (GPT-3.5)',
    '.gpt4 <q> — GPT-4o',
    '.claude <q> — Anthropic Claude',
    '.gemini <q> — Google Gemini',
    '.copilot <q> — GitHub Copilot',
    '.chatgpt <q> — Alias for .gpt',
    '.imagine <desc> — AI image description',
    '.translate <lang>|<text>',
    '.summarize <text>'
  ],
  download: [
    '.tiktok <url> — Download TikTok',
    '.fb <url> — Download Facebook',
    '.igdl <url> — Download Instagram',
    '.yt <url> — Download YouTube',
    '.play <song> — Download music'
  ],
  group: [
    '.promote @user — Make admin',
    '.demote @user — Remove admin',
    '.kick @user — Remove member',
    '.mute — Admins-only chat',
    '.unmute — Everyone can chat',
    '.tagall [msg] — Tag all members',
    '.ginfo — Group information',
    '.groupsettings — View all toggles',
    '.welcome — Toggle welcome msgs',
    '.goodbye — Toggle goodbye msgs',
    '.antilink — Toggle anti-link',
    '.antidelete — Toggle anti-delete',
    '.antispam — Toggle anti-spam',
    '.antiviewonce — Toggle anti-VOC',
    '.autoreact — Toggle auto-reactions'
  ],
  mod: [
    '.warn @user [reason] — Add warning',
    '.unwarn @user — Clear warnings',
    '.warnings @user — Check warnings',
    '.setmaxwarn <n> — Set warning limit',
    '.setwelcome <msg> — Custom welcome',
    '.setgoodbye <msg> — Custom goodbye'
  ],
  fun: [
    '.joke — Random joke',
    '.quote — Inspirational quote',
    '.ship — Compatibility %',
    '.dare — Get a dare',
    '.truth — Truth question',
    '.8ball <q> — Magic 8-ball',
    '.roast — Get roasted',
    '.compliment — Get a compliment'
  ],
  economy: [
    '.balance — Check your coins',
    '.daily — Claim daily reward (+500)',
    '.work — Work for coins (3h cd)',
    '.pay @user <amt> — Send coins',
    '.leaderboard — Top 10 richest',
    '.xpleaderboard — Top 10 XP',
    '.profile — Full stats'
  ],
  audio: [
    '.bass — Bass boost (reply to audio)',
    '.deep — Deep voice effect',
    '.fast — Speed up audio',
    '.slow — Slow down audio',
    '.reverse — Reverse audio',
    '.robot — Robot voice',
    '.chipmunk — Chipmunk voice',
    '.smooth — Smooth effect'
  ],
  tools: [
    '.font <text> — Fancy text styles',
    '.sticker — Image → sticker',
    '.enhance — Enhance image',
    '.upscale — Upscale image',
    '.removebg — Remove background',
    '.blur — Blur image',
    '.colorize — Colorize image'
  ],
  owner: [
    '.dashboard — Full bot dashboard',
    '.setmode public|private',
    '.setprefix <symbol>',
    '.ban @user — Ban from bot',
    '.unban @user — Unban user',
    '.broadcast <msg> — All groups',
    '.autostatus — Toggle status view',
    '.autostatusreact — Toggle status react',
    '.addbalance @user <amt>',
    '.listplugins — All loaded commands'
  ]
};

function buildCategoryMenu(catKey) {
  const cat = CATEGORIES[catKey];
  if (!cat) return null;
  const cmds = CATEGORY_COMMANDS[catKey] || [];
  const lines = cmds.map(c => `┋ ▸ ${c}`).join('\n');
  return `╭┈───〔 *${cat.emoji} ${cat.label}* 〕───⊷\n${lines}\n╰────────────────────⊷\n\n_Type .menu to see all categories_`;
}

function buildMainMenu(cfg) {
  const catList = Object.values(CATEGORIES)
    .map(c => `${c.emoji} *.menu ${c.key}* — ${c.label}`)
    .join('\n');

  const totalCmds = Object.values(CATEGORY_COMMANDS).flat().length;

  return `╭┈───〔 *OLASUBOMI-MD* 〕───⊷
├⬗ Owner  : ${cfg?.ownerName || 'Olasubomi'}
├⬗ Prefix : ${cfg?.prefix || '.'}
├⬗ Mode   : ${cfg?.mode || 'private'}
├⬗ Version: 3.0.0 Beta
├⬗ Uptime : ${getUptime()}
├⬗ Commands: ${totalCmds}+
╰────────────────────⊷

*📂 Command Categories*

${catList}

> *© OLASUBOMI-MD v3.0.0 — Type .menu <category>*`;
}

const mainCommands = {
  menu: {
    desc: 'Show command menu or a category',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig;
      const catKey = args[0]?.toLowerCase();

      if (catKey && CATEGORIES[catKey]) {
        const page = buildCategoryMenu(catKey);
        return sock.sendMessage(jid, { text: page });
      }

      if (catKey && !CATEGORIES[catKey]) {
        return sock.sendMessage(jid, {
          text: `❌ Unknown category: *${catKey}*\n\nAvailable: ${Object.keys(CATEGORIES).join(', ')}`
        });
      }

      await sock.sendMessage(jid, { text: buildMainMenu(cfg) });
    }
  },

  help: {
    desc: 'Usage guide',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const prefix = botConfig?.prefix || global.botConfig?.prefix || '.';
      await sock.sendMessage(jid, {
        text: `🤖 *OLASUBOMI-MD Help*\n\n` +
          `Use *${prefix}* before every command.\n\n` +
          `*Quick examples:*\n` +
          `• ${prefix}menu — Browse all categories\n` +
          `• ${prefix}menu ai — All AI commands\n` +
          `• ${prefix}gpt What is JavaScript?\n` +
          `• ${prefix}tiktok https://vm.tiktok.com/xxx\n` +
          `• ${prefix}daily — Claim 500 coins\n` +
          `• ${prefix}warn @user — Warn in group\n` +
          `• ${prefix}antilink — Toggle anti-link (admin)\n\n` +
          `*Tips:*\n` +
          `• AI commands fall back to free tier if no API key is set\n` +
          `• Group protection features are per-group and persist after restart\n` +
          `• Set API keys as Replit Secrets for real AI responses`
      });
    }
  },

  ping: {
    desc: 'Check response time',
    exec: async (args, sock, jid) => {
      const start = Date.now();
      await sock.sendMessage(jid, { text: '🏓 Pinging...' });
      await sock.sendMessage(jid, { text: `🏓 *Pong!* ⚡ ${Date.now() - start}ms` });
    }
  },

  alive: {
    desc: 'Check if bot is running',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, {
        text: `✅ *OLASUBOMI-MD is Alive!*\n\n📅 ${new Date().toLocaleString()}\n⏱️ Uptime: ${getUptime()}\n🔌 Status: Connected`
      });
    }
  },

  uptime: {
    desc: 'How long the bot has been running',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: `⏱️ *Uptime:* ${getUptime()}` });
    }
  },

  status: {
    desc: 'Full bot status',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      const stats = db.stats();
      const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      await sock.sendMessage(jid, {
        text: `🟢 *OLASUBOMI-MD Status*\n\n` +
          `✅ Online\n⏱️ Uptime  : ${getUptime()}\n💾 Memory  : ${mem} MB\n` +
          `👤 Mode    : ${cfg.mode || 'private'}\n📊 Commands: ${Object.keys(require('./index')).length}\n` +
          `🧑 Users   : ${stats.users}\n👥 Groups  : ${stats.groups}\n🚫 Banned  : ${stats.banned}`
      });
    }
  }
};

module.exports = mainCommands;
