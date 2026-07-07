// commands/main.js — Main & menu commands
// Changes: new Unicode-box menu layout, professional ping status card,
//          dynamic command filtering (only shows cmds that actually exist),
//          version read from package.json, shared helpers DRY-ed up.

const fs   = require('fs');
const path = require('path');
const db   = require('../lib/database');

// ── Version from package.json (falls back to botConfig.version) ──────────────
let PKG_VERSION = '3.0.0';
try {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );
  PKG_VERSION = pkg.version || PKG_VERSION;
} catch (_) {}

// ── Uptime helper ─────────────────────────────────────────────────────────────
function getUptime() {
  const s   = Math.floor((Date.now() - (global.botStartTime || Date.now())) / 1000);
  const d   = Math.floor(s / 86400);
  const h   = Math.floor((s % 86400) / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(' ');
}

// ── Category definitions ──────────────────────────────────────────────────────
const CATEGORIES = {
  main:     { emoji: '🏠', label: 'MAIN',       key: 'main' },
  ai:       { emoji: '🤖', label: 'AI',         key: 'ai' },
  download: { emoji: '⬇️',  label: 'DOWNLOAD',   key: 'download' },
  group:    { emoji: '👥', label: 'GROUP',       key: 'group' },
  mod:      { emoji: '🛡️',  label: 'MODERATION', key: 'mod' },
  fun:      { emoji: '🎮', label: 'FUN',         key: 'fun' },
  economy:  { emoji: '💰', label: 'ECONOMY',    key: 'economy' },
  audio:    { emoji: '🎵', label: 'AUDIO',       key: 'audio' },
  tools:    { emoji: '🔧', label: 'TOOLS',       key: 'tools' },
  owner:    { emoji: '👑', label: 'OWNER',       key: 'owner' },
};

// ── Command catalogue ─────────────────────────────────────────────────────────
// Each entry's `cmd` must match an exported key in the command registry.
// Any entry whose `cmd` is absent from the live registry is silently omitted
// from all menus at render time — no broken listings.
const CATEGORY_COMMANDS = {
  main: [
    { cmd: 'menu',    desc: 'Browse all commands' },
    { cmd: 'help',    desc: 'Usage guide' },
    { cmd: 'ping',    desc: 'Response time' },
    { cmd: 'alive',   desc: 'Is bot online?' },
    { cmd: 'uptime',  desc: 'Running time' },
    { cmd: 'status',  desc: 'Full status' },
    { cmd: 'profile', desc: 'Your profile' },
  ],
  ai: [
    { cmd: 'ai',        desc: 'Ask AI (auto model)' },
    { cmd: 'gpt',       desc: 'ChatGPT (GPT-3.5)' },
    { cmd: 'gpt4',      desc: 'GPT-4o' },
    { cmd: 'claude',    desc: 'Anthropic Claude' },
    { cmd: 'gemini',    desc: 'Google Gemini' },
    { cmd: 'copilot',   desc: 'GitHub Copilot' },
    { cmd: 'chatgpt',   desc: 'Alias for gpt' },
    { cmd: 'imagine',   desc: 'AI image description' },
    { cmd: 'translate', desc: '<lang>|<text>' },
    { cmd: 'summarize', desc: 'Summarize text' },
  ],
  download: [
    { cmd: 'tiktok', desc: 'Download TikTok' },
    { cmd: 'fb',     desc: 'Download Facebook' },
    { cmd: 'igdl',   desc: 'Download Instagram' },
    { cmd: 'yt',     desc: 'Download YouTube' },
    { cmd: 'play',   desc: 'Download music' },
  ],
  group: [
    { cmd: 'promote',       desc: '@user — Make admin' },
    { cmd: 'demote',        desc: '@user — Remove admin' },
    { cmd: 'kick',          desc: '@user — Remove member' },
    { cmd: 'mute',          desc: 'Admins-only chat' },
    { cmd: 'unmute',        desc: 'Everyone can chat' },
    { cmd: 'tagall',        desc: '[msg] — Tag all members' },
    { cmd: 'ginfo',         desc: 'Group information' },
    { cmd: 'groupsettings', desc: 'View all toggles' },
    { cmd: 'welcome',       desc: 'Toggle welcome msgs' },
    { cmd: 'goodbye',       desc: 'Toggle goodbye msgs' },
    { cmd: 'antilink',      desc: 'Toggle anti-link' },
    { cmd: 'antidelete',    desc: 'Toggle anti-delete' },
    { cmd: 'antispam',      desc: 'Toggle anti-spam' },
    { cmd: 'antiviewonce',  desc: 'Toggle anti-VOC' },
    { cmd: 'autoreact',     desc: 'Toggle auto-reactions' },
  ],
  mod: [
    { cmd: 'warn',       desc: '@user [reason] — Add warning' },
    { cmd: 'unwarn',     desc: '@user — Clear warnings' },
    { cmd: 'warnings',   desc: '@user — Check warnings' },
    { cmd: 'setmaxwarn', desc: '<n> — Set warning limit' },
    { cmd: 'setwelcome', desc: '<msg> — Custom welcome' },
    { cmd: 'setgoodbye', desc: '<msg> — Custom goodbye' },
  ],
  fun: [
    { cmd: 'joke',       desc: 'Random joke' },
    { cmd: 'quote',      desc: 'Inspirational quote' },
    { cmd: 'ship',       desc: 'Compatibility %' },
    { cmd: 'dare',       desc: 'Get a dare' },
    { cmd: 'truth',      desc: 'Truth question' },
    { cmd: '8ball',      desc: '<q> — Magic 8-ball' },
    { cmd: 'roast',      desc: 'Get roasted' },
    { cmd: 'compliment', desc: 'Get a compliment' },
  ],
  economy: [
    { cmd: 'balance',       desc: 'Check your coins' },
    { cmd: 'daily',         desc: 'Claim daily reward (+500)' },
    { cmd: 'work',          desc: 'Work for coins (3h cd)' },
    { cmd: 'pay',           desc: '@user <amt> — Send coins' },
    { cmd: 'leaderboard',   desc: 'Top 10 richest' },
    { cmd: 'xpleaderboard', desc: 'Top 10 XP' },
    { cmd: 'profile',       desc: 'Full stats' },
  ],
  audio: [
    { cmd: 'bass',     desc: 'Bass boost (reply to audio)' },
    { cmd: 'deep',     desc: 'Deep voice effect' },
    { cmd: 'fast',     desc: 'Speed up audio' },
    { cmd: 'slow',     desc: 'Slow down audio' },
    { cmd: 'reverse',  desc: 'Reverse audio' },
    { cmd: 'robot',    desc: 'Robot voice' },
    { cmd: 'chipmunk', desc: 'Chipmunk voice' },
    { cmd: 'smooth',   desc: 'Smooth effect' },
  ],
  tools: [
    { cmd: 'font',     desc: '<text> — Fancy text styles' },
    { cmd: 'sticker',  desc: 'Image → sticker' },
    { cmd: 'enhance',  desc: 'Enhance image' },
    { cmd: 'upscale',  desc: 'Upscale image' },
    { cmd: 'removebg', desc: 'Remove background' },
    { cmd: 'blur',     desc: 'Blur image' },
    { cmd: 'colorize', desc: 'Colorize image' },
  ],
  owner: [
    { cmd: 'dashboard',       desc: 'Full bot dashboard' },
    { cmd: 'setmode',         desc: 'public | private' },
    { cmd: 'setprefix',       desc: '<symbol>' },
    { cmd: 'ban',             desc: '@user — Ban from bot' },
    { cmd: 'unban',           desc: '@user — Unban user' },
    { cmd: 'broadcast',       desc: '<msg> — All groups' },
    { cmd: 'autostatus',      desc: 'Toggle status view' },
    { cmd: 'autostatusreact', desc: 'Toggle status react' },
    { cmd: 'addbalance',      desc: '@user <amt>' },
    { cmd: 'listplugins',     desc: 'All loaded commands' },
  ],
};

// ── Menu builders ─────────────────────────────────────────────────────────────

/**
 * Build a single-category command list.
 * @param {string}  catKey   - one of the CATEGORIES keys
 * @param {string}  prefix   - active bot prefix
 * @param {object}  allCmds  - live command registry (for existence check)
 */
function buildCategoryMenu(catKey, prefix, allCmds) {
  const cat = CATEGORIES[catKey];
  if (!cat) return null;

  const entries = (CATEGORY_COMMANDS[catKey] || [])
    .filter(e => !allCmds || Object.prototype.hasOwnProperty.call(allCmds, e.cmd));

  if (!entries.length) return null;

  const lines = entries.map(e => `┃  ▸ ${prefix}${e.cmd} — ${e.desc}`).join('\n');

  return (
    `┏━━〔 *${cat.emoji} ${cat.label}* 〕━━┓\n` +
    `${lines}\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
    `_Type ${prefix}menu to see all categories_`
  );
}

/**
 * Build the main overview menu.
 * @param {object} cfg      - botConfig
 * @param {object} allCmds  - live command registry (for counts + existence checks)
 */
function buildMainMenu(cfg, allCmds) {
  const prefix   = cfg?.prefix   || '.';
  const botName  = cfg?.name     || 'OLASUBOMI-MD';
  const version  = PKG_VERSION;
  const owner    = cfg?.ownerName || 'Olasubomi';
  const mode     = cfg?.mode     || 'private';
  const uptime   = getUptime();
  const total    = allCmds ? Object.keys(allCmds).length : 0;

  // Category index — skip categories that have zero live commands
  const catLines = Object.values(CATEGORIES)
    .map(c => {
      const count = (CATEGORY_COMMANDS[c.key] || [])
        .filter(e => !allCmds || Object.prototype.hasOwnProperty.call(allCmds, e.cmd))
        .length;
      return count > 0
        ? `┃  ${c.emoji}  *${prefix}menu ${c.key.padEnd(8)}* — ${c.label} *(${count})*`
        : null;
    })
    .filter(Boolean)
    .join('\n');

  return (
    `┏━━━〔 🤖 *${botName}* 〕━━━┓\n` +
    `┃  👑 Owner    : ${owner}\n` +
    `┃  🔖 Prefix   : ${prefix}\n` +
    `┃  🔒 Mode     : ${mode}\n` +
    `┃  🏷️  Version  : v${version}\n` +
    `┃  ⏱️  Uptime   : ${uptime}\n` +
    `┃  📦 Commands : ${total}\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
    `*📂 Command Categories*\n\n` +
    `${catLines}\n\n` +
    `> _© ${botName} v${version} — Type ${prefix}menu <category>_`
  );
}

// ── Exported commands ─────────────────────────────────────────────────────────

const mainCommands = {

  menu: {
    desc: 'Show command menu or a category',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      // Lazy-require index to avoid circular-dependency issues at load time.
      const allCmds = require('./index');
      const cfg     = botConfig || global.botConfig;
      const prefix  = cfg?.prefix || '.';
      const catKey  = args[0]?.toLowerCase();

      if (catKey && CATEGORIES[catKey]) {
        const page = buildCategoryMenu(catKey, prefix, allCmds);
        if (!page) {
          return sock.sendMessage(jid, {
            text: `⚠️ No commands are currently available in the *${catKey}* category.`
          });
        }
        return sock.sendMessage(jid, { text: page });
      }

      if (catKey && !CATEGORIES[catKey]) {
        return sock.sendMessage(jid, {
          text: `❌ Unknown category: *${catKey}*\n\nAvailable: ${Object.keys(CATEGORIES).join(', ')}`
        });
      }

      await sock.sendMessage(jid, { text: buildMainMenu(cfg, allCmds) });
    }
  },

  help: {
    desc: 'Usage guide',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const prefix = botConfig?.prefix || global.botConfig?.prefix || '.';
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🤖 *OLASUBOMI-MD Help* 〕━━┓\n` +
          `┃  Use *${prefix}* before every command.\n` +
          `┃\n` +
          `┃  *Quick examples:*\n` +
          `┃  • ${prefix}menu — Browse all categories\n` +
          `┃  • ${prefix}menu ai — All AI commands\n` +
          `┃  • ${prefix}gpt What is JavaScript?\n` +
          `┃  • ${prefix}tiktok <url>\n` +
          `┃  • ${prefix}daily — Claim 500 coins\n` +
          `┃  • ${prefix}warn @user — Warn in group\n` +
          `┃  • ${prefix}antilink — Toggle anti-link\n` +
          `┃\n` +
          `┃  *Tips:*\n` +
          `┃  • AI falls back to free tier without an API key\n` +
          `┃  • Group protection is per-group and persists\n` +
          `┃  • Set API keys as Replit Secrets for real AI\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  ping: {
    desc: 'Check response time',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const t0 = Date.now();
      // Send a lightweight probe message to measure round-trip latency.
      await sock.sendMessage(jid, { text: '🏓 Pinging...' });
      const latency = Date.now() - t0;
      const version = (botConfig?.version) || PKG_VERSION;

      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🤖 *OLASUBOMI-MD* 〕━━┓\n` +
          `┃  🚀 Ping    : *${latency} ms*\n` +
          `┃  ⏱️  Uptime  : *${getUptime()}*\n` +
          `┃  🔖 Version : *v${version}*\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  alive: {
    desc: 'Check if bot is running',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 ✅ *Bot Alive* 〕━━┓\n` +
          `┃  📅 ${new Date().toLocaleString()}\n` +
          `┃  ⏱️  Uptime : ${getUptime()}\n` +
          `┃  🔌 Status : Connected\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
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
      const cfg   = botConfig || global.botConfig || {};
      const stats = db.stats();
      const mem   = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const total = Object.keys(require('./index')).length;

      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🟢 *Bot Status* 〕━━┓\n` +
          `┃  ✅ Online\n` +
          `┃  ⏱️  Uptime   : ${getUptime()}\n` +
          `┃  💾 Memory   : ${mem} MB\n` +
          `┃  👤 Mode     : ${cfg.mode || 'private'}\n` +
          `┃  📦 Commands : ${total}\n` +
          `┃  🧑 Users    : ${stats.users}\n` +
          `┃  👥 Groups   : ${stats.groups}\n` +
          `┃  🚫 Banned   : ${stats.banned}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  }

};

module.exports = mainCommands;
