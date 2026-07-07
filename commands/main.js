'use strict';
// commands/main.js — Premium menu system, help, ping, alive, uptime, status
const fs   = require('fs');
const path = require('path');
const db   = require('../lib/database');

// ── Version from package.json ─────────────────────────────
let PKG_VERSION = '3.0.0';
try {
  PKG_VERSION = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  ).version || PKG_VERSION;
} catch (_) {}

// ── Store last measured ping for menu header ──────────────
let _lastPing = null;

// ── Uptime helper ─────────────────────────────────────────
function getUptime() {
  const s   = Math.floor((Date.now() - (global.botStartTime || Date.now())) / 1000);
  const d   = Math.floor(s / 86400);
  const h   = Math.floor((s % 86400) / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(' ');
}

// ── Count only real commands (exclude registry meta-keys) ─
function countCmds(allCmds) {
  if (!allCmds) return 0;
  return Object.keys(allCmds).filter(k => typeof allCmds[k]?.exec === 'function').length;
}

// ── Memory usage string ───────────────────────────────────
function memStr() {
  return `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`;
}

// ── Category display metadata ─────────────────────────────
const CATEGORY_META = {
  general:    { emoji: '🌐', label: 'General' },
  ai:         { emoji: '🤖', label: 'AI' },
  downloader: { emoji: '⬇️',  label: 'Downloader' },
  search:     { emoji: '🔍', label: 'Search' },
  converter:  { emoji: '🔄', label: 'Converter' },
  sticker:    { emoji: '🎨', label: 'Tools' },
  group:      { emoji: '👥', label: 'Group' },
  moderation: { emoji: '🛡️',  label: 'Admin' },
  fun:        { emoji: '😄', label: 'Fun' },
  games:      { emoji: '🎮', label: 'Games' },
  economy:    { emoji: '💰', label: 'Economy' },
  audio:      { emoji: '🎵', label: 'Audio' },
  utility:    { emoji: '🔧', label: 'Utility' },
  owner:      { emoji: '👑', label: 'Owner' },
};

// ── Permission label helper ───────────────────────────────
function permLabel(perm) {
  if (perm === 'owner') return 'Owner';
  if (perm === 'admin') return 'Admin';
  return 'User';
}

// ─────────────────────────────────────────────────────────
// SIGMA-MD STYLE MAIN MENU
// ─────────────────────────────────────────────────────────
function buildMainMenu(cfg, allCmds, catReg, catOrder) {
  const prefix  = cfg?.prefix    || '.';
  const botName = cfg?.name      || 'OLASUBOMI-MD';
  const owner   = cfg?.ownerName || 'Olasubomi';
  const mode    = cfg?.mode      || 'private';
  const total   = countCmds(allCmds);
  const s       = Math.floor((Date.now() - (global.botStartTime || Date.now())) / 1000);
  const h       = Math.floor(s / 3600);
  const m       = Math.floor((s % 3600) / 60);
  const sec     = s % 60;
  const runtime = `${h}h ${m}m ${sec}s`;

  // ── Header (SIGMA-MD style) ───────────────────────────────
  let out =
    `*╭┈───〔 ${botName} 〕┈───⊷*\n` +
    `*├⬗ Owner:* ${owner}\n` +
    `*├⬗ Commands:* ${total}\n` +
    `*├⬗ Runtime:* ${runtime}\n` +
    `*├⬗ Prefix:* ${prefix}\n` +
    `*├⬗ Mode:* ${mode}\n` +
    `*├⬗ Version:* ${PKG_VERSION} Bᴇᴛᴀ\n` +
    `*╰───────────────────⊷*\n\n`;

  // ── Category blocks ───────────────────────────────────────
  const order = catOrder || Object.keys(catReg);
  const cats  = order.filter(c => catReg[c]?.length);

  for (const cat of cats) {
    const cmds  = catReg[cat] || [];
    const meta  = CATEGORY_META[cat] || { label: cat.toUpperCase() };

    out += `\`『 ${meta.label} 』\`\n`;
    out += `╭───────────────────⊷\n`;
    for (const name of cmds) {
      out += `*┋ ▸ ${name}*\n`;
    }
    out += `╰───────────────────⊷\n\n`;
  }

  out += `> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}*`;
  return out;
}

// ─────────────────────────────────────────────────────────
// SIGMA-MD STYLE CATEGORY MENU
// ─────────────────────────────────────────────────────────
function buildCategoryMenu(catKey, cfg, allCmds, catReg) {
  const meta = CATEGORY_META[catKey];
  if (!meta) return null;
  const prefix = cfg?.prefix || '.';
  const cmds   = catReg[catKey];
  if (!cmds?.length) return null;

  let out = `\`『 ${meta.label} 』\`\n╭───────────────────⊷\n`;
  for (const name of cmds) {
    out += `*┋ ▸ ${name}*\n`;
  }
  out += `╰───────────────────⊷\n\n`;
  out += `> 💡 *${prefix}help <command>* for full details`;
  return out;
}

// ─────────────────────────────────────────────────────────
// HELP CARD
// ─────────────────────────────────────────────────────────
function buildHelpCard(name, cmd, cfg) {
  const prefix    = cfg?.prefix || '.';
  const perm      = cmd.permissions || 'all';
  const permStr   = perm === 'owner' ? '👑 Owner only'
                  : perm === 'admin' ? '🛡️ Admins only'
                  : '👥 All users';
  const cat       = cmd.category
    ? (CATEGORY_META[cmd.category]
        ? CATEGORY_META[cmd.category].label
        : cmd.category.toUpperCase())
    : '—';
  const usage     = cmd.usage   || `${prefix}${name}`;
  const aliases   = cmd.aliases?.length ? cmd.aliases.map(a => `${prefix}${a}`).join(', ') : '—';
  const examples  = cmd.examples?.length
    ? cmd.examples.map(e => `┃   ↳ \`${e}\``).join('\n')
    : `┃   ↳ \`${usage}\``;

  return (
    `┏━━〔 📖 *${prefix}${name}* 〕━━┓\n` +
    `┃\n` +
    `┃ 📝 *Description*\n` +
    `┃   ${cmd.desc || 'No description available.'}\n` +
    `┃\n` +
    `┃ 🔧 *Usage*\n` +
    `┃   \`${usage}\`\n` +
    `┃\n` +
    `┃ 💡 *Examples*\n` +
    `${examples}\n` +
    `┃\n` +
    `┃ 🗂️ *Category*   » ${cat}\n` +
    `┃ 🔗 *Aliases*    » ${aliases}\n` +
    `┃ 🔒 *Permission* » ${permStr}\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
  );
}

// ─────────────────────────────────────────────────────────
// COMMANDS
// ─────────────────────────────────────────────────────────
const mainCommands = {

  menu: {
    category:    'general',
    desc:        'Show the full command menu or a specific category',
    usage:       '.menu [category]',
    aliases:     [],
    permissions: 'all',
    examples:    ['.menu', '.menu ai', '.menu group', '.menu owner'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const { categoryRegistry: catReg, CATEGORY_ORDER: catOrder } = require('./index');
      const allCmds = require('./index');
      const cfg     = botConfig || global.botConfig;
      const prefix  = cfg?.prefix || '.';
      const catKey  = args[0]?.toLowerCase();

      if (catKey) {
        if (!CATEGORY_META[catKey]) {
          const available = Object.keys(CATEGORY_META).join(', ');
          return sock.sendMessage(jid, {
            text: `❌ Unknown category: *${catKey}*\n\nAvailable:\n${available}`
          });
        }
        const page = buildCategoryMenu(catKey, cfg, allCmds, catReg);
        if (!page) {
          return sock.sendMessage(jid, {
            text: `⚠️ No commands available in *${catKey}* yet.`
          });
        }
        return sock.sendMessage(jid, { text: page });
      }

      const text = buildMainMenu(cfg, allCmds, catReg, catOrder);
      await sendMenu(sock, jid, text);
    }
  },

  help: {
    category:    'general',
    desc:        'Detailed info for a specific command',
    usage:       '.help <command>',
    aliases:     [],
    permissions: 'all',
    examples:    ['.help gpt', '.help tagall', '.help warn'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const allCmds = require('./index');
      const cfg     = botConfig || global.botConfig;
      const prefix  = cfg?.prefix || '.';
      const name    = args[0]?.toLowerCase();

      if (!name) {
        return sock.sendMessage(jid, {
          text:
            `┏━━〔 🤖 *OLASUBOMI-MD Help* 〕━━┓\n` +
            `┃\n` +
            `┃  *${prefix}menu*           — Full command list\n` +
            `┃  *${prefix}menu ai*        — AI commands\n` +
            `┃  *${prefix}menu group*     — Group commands\n` +
            `┃  *${prefix}help <cmd>*     — Command details\n` +
            `┃\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
        });
      }

      const cmd = allCmds[name];
      if (!cmd) {
        return sock.sendMessage(jid, {
          text: `❌ Command *${prefix}${name}* not found.\n\nType *${prefix}menu* to browse all commands.`
        });
      }

      await sock.sendMessage(jid, { text: buildHelpCard(name, cmd, cfg) });
    }
  },

  ping: {
    category:    'general',
    desc:        'Check bot response speed and status',
    usage:       '.ping',
    aliases:     ['speed'],
    permissions: 'all',
    examples:    ['.ping'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const t0   = Date.now();
      await sock.sendMessage(jid, { text: '🏓 Pinging...' });
      _lastPing  = Date.now() - t0;

      const allCmds = require('./index');
      const total   = countCmds(allCmds);
      const version = botConfig?.version || PKG_VERSION;

      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🤖 *OLASUBOMI-MD* 〕━━┓\n` +
          `┃ 🟢 Status   : Online\n` +
          `┃ 🚀 Ping     : ${_lastPing} ms\n` +
          `┃ ⏱️ Uptime   : ${getUptime()}\n` +
          `┃ 💾 Memory   : ${memStr()}\n` +
          `┃ 📦 Commands : ${total}\n` +
          `┃ 🔖 Version  : v${version}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  alive: {
    category:    'general',
    desc:        'Check if the bot is online',
    usage:       '.alive',
    aliases:     ['on'],
    permissions: 'all',
    examples:    ['.alive'],
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 ✅ *Bot Status* 〕━━┓\n` +
          `┃ 🟢 Status   : Online\n` +
          `┃ ⏱️ Uptime   : ${getUptime()}\n` +
          `┃ 🔖 Version  : v${PKG_VERSION}\n` +
          `┃ 🕐 Time     : ${new Date().toLocaleTimeString()}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  uptime: {
    category:    'general',
    desc:        'Show how long the bot has been running',
    usage:       '.uptime',
    aliases:     [],
    permissions: 'all',
    examples:    ['.uptime'],
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, {
        text: `⏱️  *Uptime:* ${getUptime()}`
      });
    }
  },

  status: {
    category:    'utility',
    desc:        'Full bot status and database report',
    usage:       '.status',
    aliases:     [],
    permissions: 'all',
    examples:    ['.status'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg   = botConfig || global.botConfig || {};
      const stats = db.stats();
      const total = countCmds(require('./index'));
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🟢 *Bot Status* 〕━━┓\n` +
          `┃ ⏱️ Uptime    : ${getUptime()}\n` +
          `┃ 🚀 Ping      : ${_lastPing != null ? `${_lastPing} ms` : '— ms'}\n` +
          `┃ 💾 Memory    : ${memStr()}\n` +
          `┃ 🔒 Mode      : ${cfg.mode || 'private'}\n` +
          `┃ 📦 Commands  : ${total}\n` +
          `┃ ─────────────────────────\n` +
          `┃ 👤 Users     : ${stats.users}\n` +
          `┃ 👥 Groups    : ${stats.groups}\n` +
          `┃ 🚫 Banned    : ${stats.banned}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  }
};

module.exports = mainCommands;
