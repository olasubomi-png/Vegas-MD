'use strict';
// commands/main.js — Anime-styled menu UI
const fs   = require('fs');
const path = require('path');

// Menu banner paths (custom owner image wins)
const ASSETS_DIR        = path.join(__dirname, '..', 'assets');
const MENU_IMAGE_CUSTOM = path.join(ASSETS_DIR, 'menu-custom.jpg');
const MENU_IMAGE_PNG    = path.join(ASSETS_DIR, 'menu.png');
const MENU_IMAGE_JPG    = path.join(ASSETS_DIR, 'menu.jpg');

function resolveMenuImagePath() {
  if (fs.existsSync(MENU_IMAGE_CUSTOM)) return MENU_IMAGE_CUSTOM;
  if (fs.existsSync(MENU_IMAGE_PNG)) return MENU_IMAGE_PNG;
  if (fs.existsSync(MENU_IMAGE_JPG)) return MENU_IMAGE_JPG;
  return null;
}

const db = require('../lib/database');

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

// ── Category display metadata (high-energy labels) ────────
const CATEGORY_META = {
  moderation: { label: 'ADMIN',      icon: '🛡️' },
  ai:         { label: 'AI POWER',   icon: '⚡' },
  audio:      { label: 'AUDIO LAB',  icon: '🔊' },
  downloader: { label: 'DOWNLOAD',   icon: '🚀' },
  fun:        { label: 'FUN ZONE',   icon: '🔥' },
  games:      { label: 'GAMES',      icon: '🎯' },
  group:      { label: 'GROUP',      icon: '👥' },
  general:    { label: 'GENERAL',    icon: '🏠' },
  economy:    { label: 'ECONOMY',    icon: '💎' },
  owner:      { label: 'OWNER',      icon: '👑' },
  search:     { label: 'SEARCH',     icon: '🔎' },
  converter:  { label: 'CONVERT',    icon: '♻️' },
  sticker:    { label: 'TOOLS',      icon: '🛠️' },
  utility:    { label: 'UTILITY',    icon: '⚙️' },
  movies:     { label: 'MOVIES',     icon: '🎬' },
  anime:      { label: 'ANIME',      icon: '🎌' },
  sports:     { label: 'SPORTS',     icon: '⚽' },
  religion:   { label: 'RELIGION',   icon: '📿' },
  canvas:     { label: 'CANVAS',     icon: '🎨' },
};

// ─────────────────────────────────────────────────────────
// MAIN MENU  (.menu)
// ─────────────────────────────────────────────────────────
function buildMainMenu(cfg, allCmds, catReg, catOrder, { isOwner = false } = {}) {
  const prefix  = cfg?.prefix    || '.';
  const botName = cfg?.name      || 'OLASUBOMI-MD';
  const owner   = cfg?.ownerName || 'Olasubomi';
  const mode    = cfg?.mode      || 'private';
  const modeCap = mode.charAt(0).toUpperCase() + mode.slice(1);
  const uptime  = getUptime();

  const visibleName = (name) => {
    if (!name || typeof name !== 'string' || !name.trim()) return false;
    const cmd = allCmds?.[name];
    if (!cmd || typeof cmd.exec !== 'function') return false;
    const perm = String(cmd.permissions || 'all').toLowerCase();
    if (perm === 'owner' && !isOwner) return false;
    return true;
  };

  const order = catOrder || Object.keys(catReg);
  let visibleCount = 0;
  let body = '';
  let catIndex = 0;

  for (const cat of order) {
    if (cat === 'owner' && !isOwner) continue;
    const cmds = [...new Set(catReg[cat] || [])].filter(visibleName).sort();
    if (!cmds.length) continue;
    visibleCount += cmds.length;
    catIndex += 1;

    const meta = CATEGORY_META[cat] || {
      label: String(cat).toUpperCase(),
      icon: '⭐'
    };
    const icon = meta.icon || '⭐';

    body += `\n*╔═ ${icon} ${meta.label} ═╗*\n`;
    for (const name of cmds) {
      body += `*║*  ⚡ *${prefix}${name}*\n`;
    }
    body += `*╚════════════╝*\n`;
  }

  let out =
    `*⚡━━━━━━━━━━━━━━━━⚡*\n` +
    `*   🔥 ${botName} 🔥*\n` +
    `*   FULL POWER MENU*\n` +
    `*⚡━━━━━━━━━━━━━━━━⚡*\n` +
    `\n` +
    `👤 Owner     » *${owner}*\n` +
    `📦 Commands  » *${visibleCount}*\n` +
    `⏱️ Runtime   » *${uptime}*\n` +
    `🔖 Prefix    » *${prefix}*\n` +
    `🌐 Mode      » *${modeCap}*\n` +
    `🚀 Version   » *v${PKG_VERSION}*\n` +
    `\n` +
    `*💥 TAP A COMMAND & GO 💥*\n`;

  out += body;
  out +=
    `\n*⚡━━━━━━━━━━━━━━━━⚡*\n` +
    `🔎 *${prefix}menu ai*  ·  *${prefix}menu anime*\n` +
    `📖 *${prefix}help play* for details\n` +
    `*⚡ ${botName} · STAY POWERED ⚡*`;
  return out;
}

// ─────────────────────────────────────────────────────────
// CATEGORY MENU  (.menu ai)
// ─────────────────────────────────────────────────────────
function buildCategoryMenu(catKey, cfg, allCmds, catReg, { isOwner = false } = {}) {
  const meta   = CATEGORY_META[catKey];
  if (!meta) return null;
  if (catKey === 'owner' && !isOwner) return null;
  const prefix = cfg?.prefix || '.';
  const cmds   = [...new Set(catReg[catKey] || [])]
    .filter((name) => {
      const cmd = allCmds?.[name];
      if (!cmd) return false;
      const perm = String(cmd.permissions || 'all').toLowerCase();
      if (perm === 'owner' && !isOwner) return false;
      return true;
    })
    .sort();
  if (!cmds.length) return null;

  let out =
    `*⚡━━ ${meta.icon || '⭐'} ${meta.label} ━━⚡*\n\n`;

  for (let i = 0; i < cmds.length; i++) {
    const name = cmds[i];
    if (!name) continue;
    const cmd  = allCmds[name];
    const desc = cmd?.desc || 'No description available.';
    const usage = cmd?.usage || `${prefix}${name}`;
    const perm = cmd?.permissions || 'all';

    out +=
      `⚡ *${prefix}${name}*\n` +
      `   ${desc}\n` +
      `   📌 ${usage} · 🔒 ${permLabel(perm)}\n\n`;
  }

  out +=
    `*⚡━━━━━━━━━━━━⚡*\n` +
    `_Use *${prefix}help <command>* for full info_`;

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
      const isOwner = message?._isOwner === true;

      if (catKey) {
        if (!CATEGORY_META[catKey]) {
          const available = Object.keys(CATEGORY_META)
            .filter((k) => k !== 'owner' || isOwner)
            .join(', ');
          return sock.sendMessage(jid, {
            text: `❌ Unknown category: *${catKey}*\n\nAvailable: ${available}`
          });
        }
        const page = buildCategoryMenu(catKey, cfg, allCmds, catReg, { isOwner });
        if (!page) {
          return sock.sendMessage(jid, {
            text: `⚠️ No commands in *${catKey}* yet.`
          });
        }
        return sock.sendMessage(jid, { text: page });
      }

      const text = buildMainMenu(cfg, allCmds, catReg, catOrder, { isOwner });
      const menuPath = resolveMenuImagePath();

      // Send menu with banner image if available
      if (menuPath) {
        const menuMime = menuPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        await sock.sendMessage(jid, {
          image:    fs.readFileSync(menuPath),
          caption:  text,
          mimetype: menuMime
        });
      } else {
        await sock.sendMessage(jid, { text });
      }
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
      await sock.sendMessage(jid, { text: 'pong' });
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
