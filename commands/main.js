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

// ── Ping quality label ────────────────────────────────────
function pingLabel(ms) {
  if (ms == null) return '— ms  ⚪';
  if (ms < 100)  return `${ms} ms  🟢`;
  if (ms < 300)  return `${ms} ms  🟡`;
  return `${ms} ms  🔴`;
}

// ── Category display metadata ─────────────────────────────
const CATEGORY_META = {
  general:    { emoji: '🏠', label: 'General' },
  ai:         { emoji: '🤖', label: 'Artificial Intelligence' },
  downloader: { emoji: '⬇️',  label: 'Downloader' },
  search:     { emoji: '🔍', label: 'Search' },
  converter:  { emoji: '🔄', label: 'Converter' },
  sticker:    { emoji: '🎨', label: 'Sticker & Image' },
  group:      { emoji: '👥', label: 'Group Tools' },
  moderation: { emoji: '🛡️',  label: 'Moderation' },
  fun:        { emoji: '😂', label: 'Fun' },
  games:      { emoji: '🎯', label: 'Games' },
  economy:    { emoji: '💰', label: 'Economy' },
  audio:      { emoji: '🎵', label: 'Audio Effects' },
  utility:    { emoji: '🔧', label: 'Utility' },
  owner:      { emoji: '👑', label: 'Owner' },
};

// ─────────────────────────────────────────────────────────
// PREMIUM MAIN MENU
// ─────────────────────────────────────────────────────────
function buildMainMenu(cfg, allCmds, catReg, catOrder) {
  const prefix  = cfg?.prefix    || '.';
  const botName = cfg?.name      || 'OLASUBOMI-MD';
  const owner   = cfg?.ownerName || 'Olasubomi';
  const mode    = cfg?.mode      || 'private';
  const total   = allCmds ? Object.keys(allCmds).length : 0;
  const ping    = pingLabel(_lastPing);
  const uptime  = getUptime();
  const now     = new Date().toLocaleString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    day:  '2-digit', month: 'short', year: 'numeric'
  });

  let out =
    `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃  🤖  *${botName}*\n` +
    `┃  ─────────────────────────\n` +
    `┃  👑  Owner    »  ${owner}\n` +
    `┃  🔖  Prefix   »  [ ${prefix} ]\n` +
    `┃  🔒  Mode     »  ${mode.charAt(0).toUpperCase() + mode.slice(1)}\n` +
    `┃  🏷️   Version  »  v${PKG_VERSION}\n` +
    `┃  📦  Commands »  ${total} loaded\n` +
    `┃  ⏱️   Uptime   »  ${uptime}\n` +
    `┃  🚀  Ping     »  ${ping}\n` +
    `┃  🕐  Time     »  ${now}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;

  // Category list
  const order = catOrder || Object.keys(catReg);
  const cats  = order.filter(c => catReg[c]?.length);

  for (let i = 0; i < cats.length; i++) {
    const cat    = cats[i];
    const cmds   = catReg[cat] || [];
    const meta   = CATEGORY_META[cat] || { emoji: '•', label: cat };
    const count  = cmds.length;
    const isLast = i === cats.length - 1;

    // Show up to 5 commands as a preview row
    const preview = cmds.slice(0, 5).map(c => `\`${prefix}${c}\``).join('  ');
    const more    = count > 5 ? `  _+${count - 5}_` : '';

    out +=
      `${isLast ? '╰' : '├'}─  ${meta.emoji}  *${meta.label}*  _(${count})_\n` +
      `│    ${preview}${more}\n` +
      (isLast ? '' : `│\n`);
  }

  out +=
    `\n> 💡 *${prefix}menu <category>*  ·  *${prefix}help <command>*`;

  return out;
}

// ─────────────────────────────────────────────────────────
// PREMIUM CATEGORY MENU
// ─────────────────────────────────────────────────────────
function buildCategoryMenu(catKey, cfg, allCmds, catReg) {
  const meta   = CATEGORY_META[catKey];
  if (!meta) return null;
  const prefix = cfg?.prefix || '.';
  const cmds   = catReg[catKey];
  if (!cmds?.length) return null;

  let out =
    `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃  ${meta.emoji}  *${meta.label.toUpperCase()}*  _(${cmds.length} commands)_\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;

  for (let i = 0; i < cmds.length; i++) {
    const name   = cmds[i];
    const cmd    = allCmds[name];
    const desc   = cmd?.desc || '—';
    const perm   = cmd?.permissions || 'all';
    const lock   = perm === 'owner' ? ' 👑' : perm === 'admin' ? ' 🛡️' : '';
    const isLast = i === cmds.length - 1;
    out += `${isLast ? '╰' : '├'}  *${prefix}${name}*${lock}\n`;
    out += `${isLast ? '  ' : '│'}   ↳ _${desc}_\n`;
    if (!isLast) out += `│\n`;
  }

  out += `\n> 💡 *${prefix}help <command>* for full usage details`;
  return out;
}

// ─────────────────────────────────────────────────────────
// HELP CARD
// ─────────────────────────────────────────────────────────
function buildHelpCard(name, cmd, cfg) {
  const prefix    = cfg?.prefix || '.';
  const perm      = cmd.permissions || 'all';
  const permLabel = perm === 'owner' ? '👑 Owner only'
                  : perm === 'admin' ? '🛡️  Admins only'
                  : '👥 All users';
  const cat       = cmd.category ? (CATEGORY_META[cmd.category]?.label || cmd.category) : '—';
  const usage     = cmd.usage    || `${prefix}${name}`;
  const aliases   = cmd.aliases?.length ? cmd.aliases.join(', ') : '—';
  const examples  = cmd.examples?.length ? cmd.examples.join('\n  ↳ ') : usage;

  return (
    `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃  📖  *${prefix}${name}*\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n` +
    `\n` +
    `📝  *Description*\n` +
    `  ${cmd.desc || '—'}\n` +
    `\n` +
    `🔧  *Usage*\n` +
    `  ${usage}\n` +
    `\n` +
    `💡  *Examples*\n` +
    `  ↳ ${examples}\n` +
    `\n` +
    `🗂️   *Category*   »  ${cat}\n` +
    `🔗  *Aliases*    »  ${aliases}\n` +
    `🔒  *Access*     »  ${permLabel}`
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
            text: `❌ Unknown category: *${catKey}*\n\nAvailable categories:\n${available}`
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
    examples:    ['.help gpt', '.help tagall', '.help warn'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const allCmds = require('./index');
      const cfg     = botConfig || global.botConfig;
      const prefix  = cfg?.prefix || '.';
      const name    = args[0]?.toLowerCase();

      if (!name) {
        return sock.sendMessage(jid, {
          text:
            `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
            `┃  🤖  *OLASUBOMI-MD Help*\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n` +
            `\n` +
            `├  *${prefix}menu*           — Full command list\n` +
            `├  *${prefix}menu ai*        — AI commands\n` +
            `├  *${prefix}menu group*     — Group commands\n` +
            `╰  *${prefix}help <cmd>*     — Command details`
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
      const sent = await sock.sendMessage(jid, { text: '🏓 ...' });
      _lastPing  = Date.now() - t0;
      const version = botConfig?.version || PKG_VERSION;
      const mem     = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const mode    = (botConfig || global.botConfig)?.mode || 'private';
      await sock.sendMessage(jid, {
        text:
          `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
          `┃  🤖  *OLASUBOMI-MD*\n` +
          `┃  ─────────────────────────\n` +
          `┃  🚀  Ping     »  ${pingLabel(_lastPing)}\n` +
          `┃  ⏱️   Uptime   »  ${getUptime()}\n` +
          `┃  💾  Memory   »  ${mem} MB\n` +
          `┃  🔒  Mode     »  ${mode.charAt(0).toUpperCase() + mode.slice(1)}\n` +
          `┃  🏷️   Version  »  v${version}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
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
          `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
          `┃  ✅  *Bot is Online*\n` +
          `┃  ─────────────────────────\n` +
          `┃  🟢  Status   »  Active\n` +
          `┃  ⏱️   Uptime   »  ${getUptime()}\n` +
          `┃  🏷️   Version  »  v${PKG_VERSION}\n` +
          `┃  🕐  Time     »  ${new Date().toLocaleTimeString()}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
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
      const mem   = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const total = Object.keys(require('./index')).length;
      await sock.sendMessage(jid, {
        text:
          `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
          `┃  🟢  *Bot Status*\n` +
          `┃  ─────────────────────────\n` +
          `┃  ⏱️   Uptime    »  ${getUptime()}\n` +
          `┃  🚀  Ping      »  ${pingLabel(_lastPing)}\n` +
          `┃  💾  Memory    »  ${mem} MB\n` +
          `┃  🔒  Mode      »  ${cfg.mode || 'private'}\n` +
          `┃  📦  Commands  »  ${total}\n` +
          `┃  ─────────────────────────\n` +
          `┃  👤  Users     »  ${stats.users}\n` +
          `┃  👥  Groups    »  ${stats.groups}\n` +
          `┃  🚫  Banned    »  ${stats.banned}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
      });
    }
  }
};

module.exports = mainCommands;
