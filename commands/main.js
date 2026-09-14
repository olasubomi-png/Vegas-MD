'use strict';
// commands/main.js — Custom Vegas-MD / OLASUBOMI-MD menu UI
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

// ── Category display metadata (custom markers per section) ─
const CATEGORY_META = {
  moderation: { label: 'Admin',      mark: '01' },
  ai:         { label: 'AI',         mark: '02' },
  audio:      { label: 'Audio',      mark: '03' },
  downloader: { label: 'Downloader', mark: '04' },
  fun:        { label: 'Fun',        mark: '05' },
  games:      { label: 'Games',      mark: '06' },
  group:      { label: 'Group',      mark: '07' },
  general:    { label: 'General',    mark: '08' },
  economy:    { label: 'Economy',    mark: '09' },
  owner:      { label: 'Owner',      mark: '10' },
  search:     { label: 'Search',     mark: '11' },
  converter:  { label: 'Converter',  mark: '12' },
  sticker:    { label: 'Tools',      mark: '13' },
  utility:    { label: 'Utility',    mark: '14' },
  movies:     { label: 'Movies',     mark: '15' },
  anime:      { label: 'Anime',      mark: '16' },
  sports:     { label: 'Sports',     mark: '17' },
  religion:   { label: 'Religion',   mark: '18' },
  canvas:     { label: 'Canvas',     mark: '19' },
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatWatTime() {
  try {
    return new Date().toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }) + ' WAT';
  } catch {
    return new Date().toUTCString();
  }
}

// ─────────────────────────────────────────────────────────
// MAIN MENU  (.menu) — custom OLASUBOMI / VEGAS frame
// ─────────────────────────────────────────────────────────
function buildMainMenu(cfg, allCmds, catReg, catOrder, { isOwner = false } = {}) {
  const prefix  = cfg?.prefix    || '.';
  const botName = cfg?.name      || process.env.BOT_NAME || 'OLASUBOMI-MD';
  const owner   = cfg?.ownerName || process.env.OWNER_NAME || 'Olasubomi';
  const mode    = cfg?.mode      || 'private';
  const modeCap = mode.charAt(0).toUpperCase() + mode.slice(1);
  const uptime  = getUptime();
  const mem     = getMemMB();
  const ping    = fmtPing(_lastPing);
  const clock   = formatWatTime();
  const hasCustomBanner = fs.existsSync(MENU_IMAGE_CUSTOM);

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
  let sectionNo = 0;
  let body = '';

  for (const cat of order) {
    if (cat === 'owner' && !isOwner) continue;
    const cmds = [...new Set(catReg[cat] || [])].filter(visibleName).sort();
    if (!cmds.length) continue;
    visibleCount += cmds.length;
    sectionNo += 1;

    const meta = CATEGORY_META[cat] || { label: String(cat), mark: pad2(sectionNo) };
    const mark = meta.mark || pad2(sectionNo);

    body += `\n*⿻ ${mark}｜${meta.label}*\n`;
    body += `*╭───────────────╮*\n`;
    for (const name of cmds) {
      body += `*│* ◈ *${prefix}${name}*\n`;
    }
    body += `*╰───────────────╯*\n`;
  }

  // Header — unique to this bot
  let out =
    `*╔═══════『 ${botName} 』═══════╗*\n` +
    `*║*  WhatsApp MD  ·  Custom Build\n` +
    `*║*  Crafted for *${owner}*\n` +
    `*╠═══════════════════════════╣*\n` +
    `*║* Owner     : *${owner}*\n` +
    `*║* Commands  : *${visibleCount}*\n` +
    `*║* Runtime   : *${uptime}*\n` +
    `*║* Prefix    : *${prefix}*\n` +
    `*║* Mode      : *${modeCap}*\n` +
    `*║* Version   : *v${PKG_VERSION}*\n` +
    `*║* Memory    : *${mem} MB*\n` +
    `*║* Ping      : *${ping}*\n` +
    `*║* Time      : *${clock}*\n` +
    `*║* Banner    : *${hasCustomBanner ? 'Custom' : 'Default'}*\n` +
    `*╚═══════════════════════════╝*\n` +
    `\n*▾ Command Library ▾*\n`;

  out += body;

  out +=
    `\n*╔════『 Quick Guide 』════╗*\n` +
    `*║* ${prefix}menu ai\n` +
    `*║* ${prefix}menu downloader\n` +
    `*║* ${prefix}help play\n` +
    `*║* ${prefix}setmenupic  _(owner)_\n` +
    `*╚══════════════════════╝*\n` +
    `\n_*${botName}*_  ·  _private arsenal_\n` +
    `> © ${owner} × ${botName}`;

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
  const botName = cfg?.name || process.env.BOT_NAME || 'OLASUBOMI-MD';
  const cmds   = [...new Set(catReg[catKey] || [])]
    .filter((name) => {
      if (!name || !name.trim()) return false;
      const cmd = allCmds?.[name];
      if (!cmd || typeof cmd.exec !== 'function') return false;
      const perm = String(cmd.permissions || 'all').toLowerCase();
      if (perm === 'owner' && !isOwner) return false;
      return true;
    })
    .sort();
  if (!cmds.length) return null;

  let out =
    `*╔══『 ${meta.mark || '--'}｜${meta.label} 』══╗*\n` +
    `*║*  ${cmds.length} command${cmds.length === 1 ? '' : 's'}  ·  ${botName}\n` +
    `*╠════════════════════╣*\n`;

  for (const name of cmds) {
    const cmd = allCmds[name];
    const desc = cmd?.desc || 'No description';
    out += `*║* ◈ *${prefix}${name}*\n`;
    out += `*║*    ${desc}\n`;
  }

  out +=
    `*╚════════════════════╝*\n` +
    `\n_Use *${prefix}help ${cmds[0]}* for full details_`;
  return out;
}

// ─────────────────────────────────────────────────────────
// HELP CARD  (.help <command>)
// ─────────────────────────────────────────────────────────
function buildHelpCard(name, cmd, cfg) {
  const prefix    = cfg?.prefix || '.';
  const botName   = cfg?.name || process.env.BOT_NAME || 'OLASUBOMI-MD';
  const perm      = cmd.permissions || 'all';
  const cat       = cmd.category
    ? (CATEGORY_META[cmd.category]?.label || cmd.category.toUpperCase())
    : '—';
  const usage     = cmd.usage   || `${prefix}${name}`;
  const aliases   = cmd.aliases?.length
    ? cmd.aliases.map(a => `${prefix}${a}`).join(', ')
    : 'None';
  const examples  = cmd.examples?.length
    ? cmd.examples.join('\n*║*    ')
    : usage;

  return (
    `*╔══『 ${prefix}${name} 』══╗*\n` +
    `*║*  ${botName} help\n` +
    `*╠════════════════╣*\n` +
    `*║* Description\n` +
    `*║*  ${cmd.desc || 'No description available.'}\n` +
    `*║*\n` +
    `*║* Usage\n` +
    `*║*  ${usage}\n` +
    `*║*\n` +
    `*║* Examples\n` +
    `*║*    ${examples}\n` +
    `*║*\n` +
    `*║* Category   : ${cat}\n` +
    `*║* Aliases    : ${aliases}\n` +
    `*║* Permission : ${permLabel(perm)}\n` +
    `*╚════════════════╝*`
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
