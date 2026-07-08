'use strict';
// commands/main.js — Premium menu UI  (architecture unchanged)
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

// ── Memory helper ─────────────────────────────────────────
function getMemMB() {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}

// ── Ping quality ─────────────────────────────────────────
function fmtPing(ms) {
  if (ms == null) return '—';
  return `${ms} ms`;
}

// ── Permission label ──────────────────────────────────────
function permLabel(p) {
  if (p === 'owner') return 'Owner';
  if (p === 'admin') return 'Admin';
  return 'User';
}

// ── Category display metadata ─────────────────────────────
const CATEGORY_META = {
  general:    { emoji: '🏠', label: 'GENERAL' },
  ai:         { emoji: '🤖', label: 'AI' },
  downloader: { emoji: '⬇️',  label: 'DOWNLOADER' },
  search:     { emoji: '🔍', label: 'SEARCH' },
  converter:  { emoji: '🔄', label: 'CONVERTER' },
  sticker:    { emoji: '🎨', label: 'STICKER & IMAGE' },
  group:      { emoji: '👥', label: 'GROUP' },
  moderation: { emoji: '🛡️',  label: 'MODERATION' },
  fun:        { emoji: '😂', label: 'FUN' },
  games:      { emoji: '🎯', label: 'GAMES' },
  economy:    { emoji: '💰', label: 'ECONOMY' },
  audio:      { emoji: '🎵', label: 'AUDIO' },
  utility:    { emoji: '🔧', label: 'UTILITY' },
  owner:      { emoji: '👑', label: 'OWNER' },
};

// ─────────────────────────────────────────────────────────
// MAIN MENU  (.menu)
// ─────────────────────────────────────────────────────────
function buildMainMenu(cfg, allCmds, catReg, catOrder) {
  const prefix  = cfg?.prefix    || '.';
  const botName = cfg?.name      || 'OLASUBOMI-MD';
  const owner   = cfg?.ownerName || 'Olasubomi';
  const mode    = cfg?.mode      || 'private';
  const modeCap = mode.charAt(0).toUpperCase() + mode.slice(1);
  const total   = allCmds ? Object.keys(allCmds).length : 0;
  const ping    = fmtPing(_lastPing);
  const uptime  = getUptime();
  const mem     = getMemMB();

  // ── Header card ──────────────────────────────────────────
  let out =
    `┏━━〔 🤖 *${botName}* 〕━━┓\n` +
    `┃ 👑 Owner    : ${owner}\n` +
    `┃ 🔖 Prefix   : ${prefix}\n` +
    `┃ 🔒 Mode     : ${modeCap}\n` +
    `┃ 🏷️  Version  : v${PKG_VERSION}\n` +
    `┃ 🚀 Ping     : ${ping}\n` +
    `┃ ⏱️  Uptime   : ${uptime}\n` +
    `┃ 💾 Memory   : ${mem} MB\n` +
    `┃ 📦 Commands : ${total}\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━┛\n`;

  // ── Category previews ────────────────────────────────────
  const order = catOrder || Object.keys(catReg);
  const cats  = order.filter(c => catReg[c]?.length);

  for (const cat of cats) {
    // deduplicate and sort alphabetically
    const cmds = [...new Set(catReg[cat])].sort();
    if (!cmds.length) continue;

    const meta = CATEGORY_META[cat] || { emoji: '•', label: cat.toUpperCase() };
    out += `\n╭─${meta.emoji} *${meta.label}* (${cmds.length})\n`;

    for (let i = 0; i < cmds.length; i++) {
      const name    = cmds[i];
      const cmd     = allCmds[name];
      const desc    = cmd?.desc || 'No description available.';
      const isLast  = i === cmds.length - 1;
      // pad command name to 14 chars for alignment
      const padded  = `${prefix}${name}`.padEnd(14);
      out += `${isLast ? '└' : '├'} ${padded} ${desc}\n`;
    }
  }

  out += `\n_Type *${prefix}menu <category>* or *${prefix}help <command>*_`;
  return out;
}

// ─────────────────────────────────────────────────────────
// CATEGORY MENU  (.menu ai)
// ─────────────────────────────────────────────────────────
function buildCategoryMenu(catKey, cfg, allCmds, catReg) {
  const meta   = CATEGORY_META[catKey];
  if (!meta) return null;
  const prefix = cfg?.prefix || '.';
  const cmds   = [...new Set(catReg[catKey] || [])].sort();
  if (!cmds.length) return null;

  let out =
    `┏━━〔 ${meta.emoji} *${meta.label} COMMANDS* 〕━━┓\n\n`;

  for (let i = 0; i < cmds.length; i++) {
    const name    = cmds[i];
    const cmd     = allCmds[name];
    const desc    = cmd?.desc    || 'No description available.';
    const usage   = cmd?.usage   || `${prefix}${name}`;
    const perm    = cmd?.permissions || 'all';
    const isLast  = i === cmds.length - 1;

    out +=
      `├ *${prefix}${name}*\n` +
      `│  ↳ ${desc}\n` +
      `│  Usage: ${usage}\n` +
      `│  Permission: ${permLabel(perm)}\n`;

    if (!isLast) out += `│\n`;
  }

  out +=
    `\n┗━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    `_Type *${prefix}help <command>* for full details_`;

  return out;
}

// ─────────────────────────────────────────────────────────
// HELP CARD  (.help <command>)
// ─────────────────────────────────────────────────────────
function buildHelpCard(name, cmd, cfg) {
  const prefix    = cfg?.prefix || '.';
  const perm      = cmd.permissions || 'all';
  const cat       = cmd.category
    ? (CATEGORY_META[cmd.category]?.label || cmd.category.toUpperCase())
    : '—';
  const usage     = cmd.usage   || `${prefix}${name}`;
  const aliases   = cmd.aliases?.length
    ? cmd.aliases.map(a => `${prefix}${a}`).join(', ')
    : 'None';
  const examples  = cmd.examples?.length
    ? cmd.examples.join('\n┃    ')
    : usage;

  return (
    `┏━━〔 📖 *${prefix}${name.toUpperCase()}* 〕━━┓\n` +
    `┃\n` +
    `┃ 📝 Description\n` +
    `┃    ${cmd.desc || 'No description available.'}\n` +
    `┃\n` +
    `┃ 🔧 Usage\n` +
    `┃    ${usage}\n` +
    `┃\n` +
    `┃ 💡 Examples\n` +
    `┃    ${examples}\n` +
    `┃\n` +
    `┃ 🗂️  Category   : ${cat}\n` +
    `┃ 🔗 Aliases    : ${aliases}\n` +
    `┃ 🔒 Permission : ${permLabel(perm)}\n` +
    `┃\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━┛`
  );
}

// ─────────────────────────────────────────────────────────
// COMMANDS  (exec functions only — architecture unchanged)
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
            text: `❌ Unknown category: *${catKey}*\n\nAvailable: ${available}`
          });
        }
        const page = buildCategoryMenu(catKey, cfg, allCmds, catReg);
        if (!page) {
          return sock.sendMessage(jid, {
            text: `⚠️ No commands in *${catKey}* yet.`
          });
        }
        return sock.sendMessage(jid, { text: page });
      }

      const text = buildMainMenu(cfg, allCmds, catReg, catOrder);
      await sock.sendMessage(jid, { text });
    }
  },

  help: {
    category:    'general',
    desc:        'Get detailed info for any command',
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
            `┏━━〔 🤖 *OLASUBOMI-MD* 〕━━┓\n` +
            `┃\n` +
            `┃  *${prefix}menu*          Full command list\n` +
            `┃  *${prefix}menu ai*       AI commands\n` +
            `┃  *${prefix}menu group*    Group commands\n` +
            `┃  *${prefix}help <cmd>*    Command details\n` +
            `┃\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━┛`
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
      const t0  = Date.now();
      await sock.sendMessage(jid, { text: '🏓 Pinging...' });
      _lastPing = Date.now() - t0;

      const cfg     = botConfig || global.botConfig || {};
      const total   = Object.keys(require('./index')).length;

      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🤖 *OLASUBOMI-MD* 〕━━┓\n` +
          `┃ 🟢 Status   : Online\n` +
          `┃ 🚀 Ping     : ${_lastPing} ms\n` +
          `┃ ⏱️  Uptime   : ${getUptime()}\n` +
          `┃ 💾 Memory   : ${getMemMB()} MB\n` +
          `┃ 📦 Commands : ${total}\n` +
          `┃ 🔖 Version  : v${cfg.version || PKG_VERSION}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━┛`
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
          `┃ ⏱️  Uptime   : ${getUptime()}\n` +
          `┃ 🏷️  Version  : v${PKG_VERSION}\n` +
          `┃ 🕐 Time     : ${new Date().toLocaleTimeString()}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━┛`
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
        text: `⏱️ *Uptime:* ${getUptime()}`
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
      const total = Object.keys(require('./index')).length;
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🟢 *Bot Status* 〕━━┓\n` +
          `┃ ⏱️  Uptime    : ${getUptime()}\n` +
          `┃ 🚀 Ping      : ${fmtPing(_lastPing)}\n` +
          `┃ 💾 Memory    : ${getMemMB()} MB\n` +
          `┃ 🔒 Mode      : ${cfg.mode || 'private'}\n` +
          `┃ 📦 Commands  : ${total}\n` +
          `┃ ─────────────────────\n` +
          `┃ 👤 Users     : ${stats.users}\n` +
          `┃ 👥 Groups    : ${stats.groups}\n` +
          `┃ 🚫 Banned    : ${stats.banned}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  }
};

module.exports = mainCommands;
