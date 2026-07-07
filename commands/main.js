'use strict';
// commands/main.js — Menu system, help, ping, alive, uptime, status
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

// ── Category display metadata (order = CATEGORY_ORDER in index.js) ──
const CATEGORY_META = {
  general:    { emoji: '🏠', label: 'GENERAL' },
  ai:         { emoji: '🤖', label: 'AI' },
  downloader: { emoji: '⬇️',  label: 'DOWNLOADER' },
  search:     { emoji: '🔍', label: 'SEARCH' },
  converter:  { emoji: '🔄', label: 'CONVERTER' },
  sticker:    { emoji: '🎨', label: 'STICKER & IMAGE' },
  group:      { emoji: '👥', label: 'GROUP' },
  moderation: { emoji: '🛡️',  label: 'MODERATION' },
  fun:        { emoji: '🎮', label: 'FUN' },
  games:      { emoji: '🎯', label: 'GAMES' },
  economy:    { emoji: '💰', label: 'ECONOMY' },
  audio:      { emoji: '🎵', label: 'AUDIO' },
  utility:    { emoji: '🔧', label: 'UTILITY' },
  owner:      { emoji: '👑', label: 'OWNER' },
};

// ── Build full overview menu ──────────────────────────────
function buildMainMenu(cfg, allCmds, catReg, catOrder) {
  const prefix  = cfg?.prefix   || '.';
  const botName = cfg?.name     || 'OLASUBOMI-MD';
  const version = PKG_VERSION;
  const owner   = cfg?.ownerName || 'Olasubomi';
  const mode    = (cfg?.mode    || 'private').charAt(0).toUpperCase() +
                  (cfg?.mode    || 'private').slice(1);
  const total   = allCmds ? Object.keys(allCmds).length : 0;
  const ping    = _lastPing != null ? `${_lastPing}ms` : '—';

  // Header
  let out =
    `╔══════════════════════════════╗\n` +
    `║    🤖  *${botName}*    ║\n` +
    `╚══════════════════════════════╝\n\n` +
    `┌──────────────────────────────┐\n` +
    `│  👑 Owner    : ${owner}\n` +
    `│  🔖 Prefix   : ${prefix}\n` +
    `│  🔒 Mode     : ${mode}\n` +
    `│  🏷️  Version  : v${version}\n` +
    `│  📦 Commands : ${total}\n` +
    `│  ⏱️  Uptime   : ${getUptime()}\n` +
    `│  🚀 Speed    : ${ping}\n` +
    `└──────────────────────────────┘\n\n`;

  // Category previews
  const order = catOrder || Object.keys(catReg);
  for (const cat of order) {
    const cmds = catReg[cat];
    if (!cmds || !cmds.length) continue;
    const meta  = CATEGORY_META[cat] || { emoji: '•', label: cat.toUpperCase() };
    // Preview: up to 8 commands joined with dots
    const preview = cmds.slice(0, 8).map(c => `${prefix}${c}`).join('  ');
    const more    = cmds.length > 8 ? ` +${cmds.length - 8} more` : '';
    out +=
      `*〔 ${meta.emoji} ${meta.label} 〕* _(${cmds.length})_\n` +
      `${preview}${more}\n\n`;
  }

  out += `_Type ${prefix}menu <category> for details · ${prefix}help <cmd> for info_`;
  return out;
}

// ── Build single-category menu ────────────────────────────
function buildCategoryMenu(catKey, cfg, allCmds, catReg) {
  const meta   = CATEGORY_META[catKey];
  if (!meta) return null;
  const prefix = cfg?.prefix || '.';
  const cmds   = catReg[catKey];
  if (!cmds || !cmds.length) return null;

  let out =
    `╔══〔 ${meta.emoji} *${meta.label}* 〕══╗\n\n`;

  for (const name of cmds) {
    const cmd  = allCmds[name];
    const desc = cmd?.desc || '—';
    out += `  ▸ *${prefix}${name}* — ${desc}\n`;
  }

  out +=
    `\n╚══════════════════════════════╝\n` +
    `_${prefix}help <command> for detailed info_`;
  return out;
}

// ── Build .help <command> card ────────────────────────────
function buildHelpCard(name, cmd, cfg) {
  const prefix = cfg?.prefix || '.';
  const perm   = cmd.permissions || 'all';
  const permLabel =
    perm === 'owner' ? '👑 Owner only' :
    perm === 'admin' ? '🛡️ Admins only' : '👥 All users';
  const cat    = cmd.category ? (CATEGORY_META[cmd.category]?.label || cmd.category) : '—';
  const usage  = cmd.usage   || `${prefix}${name}`;
  const ex     = cmd.examples?.length ? cmd.examples.join('\n    ') : usage;
  const aliases = cmd.aliases?.length ? cmd.aliases.join(', ') : '—';

  return (
    `┏━━〔 📖 *HELP: ${prefix}${name}* 〕━━┓\n` +
    `┃  📝 Desc    : ${cmd.desc || '—'}\n` +
    `┃  🔧 Usage   : ${usage}\n` +
    `┃  📂 Category: ${cat}\n` +
    `┃  👥 Access  : ${permLabel}\n` +
    `┃  🔗 Aliases : ${aliases}\n` +
    `┃  💡 Example :\n` +
    `┃    ${ex}\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
  );
}

// ── Commands ──────────────────────────────────────────────
const mainCommands = {

  menu: {
    category:    'general',
    desc:        'Show full menu or a specific category',
    usage:       '.menu [category]',
    aliases:     ['help'],
    permissions: 'all',
    examples:    ['.menu', '.menu ai', '.menu group'],
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
      await sock.sendMessage(jid, { text });
    }
  },

  help: {
    category:    'general',
    desc:        'Detailed info for a specific command',
    usage:       '.help <command>',
    aliases:     [],
    permissions: 'all',
    examples:    ['.help gpt', '.help tagall'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const allCmds = require('./index');
      const cfg     = botConfig || global.botConfig;
      const prefix  = cfg?.prefix || '.';
      const name    = args[0]?.toLowerCase();

      if (!name) {
        return sock.sendMessage(jid, {
          text:
            `┏━━〔 🤖 *OLASUBOMI-MD Help* 〕━━┓\n` +
            `┃  Use *${prefix}* before every command.\n` +
            `┃\n` +
            `┃  ${prefix}menu           — Full command menu\n` +
            `┃  ${prefix}menu ai        — AI commands\n` +
            `┃  ${prefix}menu group     — Group commands\n` +
            `┃  ${prefix}help <cmd>     — Command details\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
        });
      }

      const cmd = allCmds[name];
      if (!cmd) {
        return sock.sendMessage(jid, {
          text: `❌ Command *${prefix}${name}* not found.\n\nType *${prefix}menu* to see all commands.`
        });
      }

      await sock.sendMessage(jid, { text: buildHelpCard(name, cmd, cfg) });
    }
  },

  ping: {
    category:    'general',
    desc:        'Check bot response time',
    usage:       '.ping',
    aliases:     ['speed'],
    permissions: 'all',
    examples:    ['.ping'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const t0 = Date.now();
      await sock.sendMessage(jid, { text: '🏓 Pinging...' });
      _lastPing = Date.now() - t0;
      const version = (botConfig?.version) || PKG_VERSION;
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🤖 *OLASUBOMI-MD* 〕━━┓\n` +
          `┃  🚀 Ping    : *${_lastPing} ms*\n` +
          `┃  ⏱️  Uptime  : *${getUptime()}*\n` +
          `┃  🔖 Version : *v${version}*\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  alive: {
    category:    'general',
    desc:        'Check if bot is online',
    usage:       '.alive',
    aliases:     ['on'],
    permissions: 'all',
    examples:    ['.alive'],
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 ✅ *Bot Status* 〕━━┓\n` +
          `┃  🟢 Online\n` +
          `┃  📅 ${new Date().toLocaleString()}\n` +
          `┃  ⏱️  Uptime : ${getUptime()}\n` +
          `┃  🔖 Version: v${PKG_VERSION}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  uptime: {
    category:    'general',
    desc:        'Show how long the bot has been running',
    usage:       '.uptime',
    aliases:     ['runtime'],
    permissions: 'all',
    examples:    ['.uptime'],
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: `⏱️ *Uptime:* ${getUptime()}` });
    }
  },

  status: {
    category:    'utility',
    desc:        'Full bot status report',
    usage:       '.status',
    aliases:     [],
    permissions: 'all',
    examples:    ['.status'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg   = botConfig || global.botConfig || {};
      const stats = db.stats();
      const mem   = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const total = Object.keys(require('./index')).length;
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🟢 *Bot Status* 〕━━┓\n` +
          `┃  ✅ Online\n` +
          `┃  ⏱️  Uptime    : ${getUptime()}\n` +
          `┃  💾 Memory    : ${mem} MB\n` +
          `┃  👤 Mode      : ${cfg.mode || 'private'}\n` +
          `┃  📦 Commands  : ${total}\n` +
          `┃  🧑 Users     : ${stats.users}\n` +
          `┃  👥 Groups    : ${stats.groups}\n` +
          `┃  🚫 Banned    : ${stats.banned}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  }
};

module.exports = mainCommands;
