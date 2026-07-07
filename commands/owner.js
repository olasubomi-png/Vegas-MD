'use strict';
// commands/owner.js — Owner-only control commands
const fs   = require('fs');
const path = require('path');
const db   = require('../lib/database');
const { resolveIsOwner, getMentionedJid, formatNumber, normalizeJid } = require('../lib/helpers');

function ownerOnly(exec) {
  return async (args, sock, jid, isGroup, sender, message, botConfig) => {
    if (resolveIsOwner(message, sender, botConfig)) {
      return exec(args, sock, jid, isGroup, sender, message, botConfig);
    }
    const ownerNum = normalizeJid(botConfig?.ownerNumber || global.botConfig?.ownerNumber || '');
    return sock.sendMessage(jid, {
      text: ownerNum
        ? '🔒 This command is *owner-only*.'
        : '🔒 Owner not configured.\n\nSet *OWNER_NUMBER* as a Replit Secret to enable owner commands.'
    });
  };
}

const ownerCommands = {

  owner: {
    category: 'general', desc: 'Show bot owner information',
    usage: '.owner', aliases: [], permissions: 'all',
    examples: ['.owner'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 👑 *Bot Owner* 〕━━┓\n` +
          `┃  👤 Name  : ${cfg.ownerName || 'Olasubomi'}\n` +
          `┃  📞 Number: ${cfg.ownerNumber || 'Not set'}\n` +
          `┃  🤖 Bot   : OLASUBOMI-MD v${require('../package.json').version || '3.0.0'}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  dashboard: {
    category: 'owner', desc: 'Full owner control dashboard',
    usage: '.dashboard', aliases: ['dash'], permissions: 'owner',
    examples: ['.dashboard'],
    exec: ownerOnly(async (args, sock, jid) => {
      const stats  = db.stats();
      const cfg    = global.botConfig || {};
      const memMB  = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const s      = Math.floor((Date.now() - (global.botStartTime || Date.now())) / 1000);
      const h      = Math.floor(s / 3600);
      const m      = Math.floor((s % 3600) / 60);
      const _idx   = require('./index');
      const total  = Object.keys(_idx).filter(k => typeof _idx[k]?.exec === 'function').length;
      await sock.sendMessage(jid, {
        text:
          `🛠️ *Owner Dashboard*\n\n` +
          `*📦 Bot Info*\n` +
          `├ Mode     : ${cfg.mode || 'private'}\n` +
          `├ Prefix   : ${cfg.prefix || '.'}\n` +
          `├ Uptime   : ${h}h ${m}m\n` +
          `├ Memory   : ${memMB} MB\n` +
          `└ Commands : ${total}\n\n` +
          `*📊 Database*\n` +
          `├ Users    : ${stats.users}\n` +
          `├ Groups   : ${stats.groups}\n` +
          `└ Banned   : ${stats.banned}\n\n` +
          `*⚙️ Global Settings*\n` +
          `├ AutoStatus  : ${db.getSetting('autoStatus', false) ? '✅' : '❌'}\n` +
          `├ AutoReact   : ${db.getSetting('autoStatusReact', false) ? '✅' : '❌'}\n` +
          `├ AutoRead    : ${db.getSetting('autoRead', false) ? '✅' : '❌'}\n` +
          `├ AutoTyping  : ${db.getSetting('autoTyping', false) ? '✅' : '❌'}\n` +
          `└ AntiCall    : ${db.getSetting('antiCall', false) ? '✅' : '❌'}`
      });
    })
  },

  mode: {
    category: 'owner', desc: 'Set bot mode (public/private)',
    usage: '.mode <public|private>', aliases: [], permissions: 'owner',
    examples: ['.mode public', '.mode private'],
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const m = args[0]?.toLowerCase();
      if (!['public', 'private'].includes(m)) {
        return sock.sendMessage(jid, { text: '❌ Usage: .mode public OR .mode private' });
      }
      if (botConfig)       botConfig.mode       = m;
      if (global.botConfig) global.botConfig.mode = m;
      db.setSetting('mode', m);
      await sock.sendMessage(jid, { text: `✅ Bot mode set to *${m}*` });
    })
  },

  setmode: {
    category: 'owner', desc: 'Set bot mode (alias for .mode)',
    usage: '.setmode <public|private>', aliases: ['mode'], permissions: 'owner',
    examples: ['.setmode public'],
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const m = args[0]?.toLowerCase();
      if (!['public', 'private'].includes(m)) {
        return sock.sendMessage(jid, { text: '❌ Usage: .setmode public OR .setmode private' });
      }
      if (botConfig)        botConfig.mode        = m;
      if (global.botConfig) global.botConfig.mode = m;
      db.setSetting('mode', m);
      await sock.sendMessage(jid, { text: `✅ Bot mode set to *${m}*` });
    })
  },

  setprefix: {
    category: 'owner', desc: 'Change the command prefix',
    usage: '.setprefix <symbol>', aliases: [], permissions: 'owner',
    examples: ['.setprefix !', '.setprefix /'],
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const prefix = args[0];
      if (!prefix || prefix.length > 3) {
        return sock.sendMessage(jid, { text: '❌ Usage: .setprefix <symbol>\nExample: .setprefix !' });
      }
      if (botConfig)        botConfig.prefix        = prefix;
      if (global.botConfig) global.botConfig.prefix = prefix;
      db.setSetting('prefix', prefix);
      await sock.sendMessage(jid, { text: `✅ Prefix changed to *${prefix}*\n\nNew command: *${prefix}menu*` });
    })
  },

  ban: {
    category: 'owner', desc: 'Ban a user from using the bot',
    usage: '.ban @user', aliases: [], permissions: 'owner',
    examples: ['.ban @user'],
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message) => {
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .ban @user' });
      db.banUser(target);
      await sock.sendMessage(jid, {
        text: `🚫 @${target.split('@')[0]} has been *banned*.`, mentions: [target]
      });
    })
  },

  unban: {
    category: 'owner', desc: 'Unban a user',
    usage: '.unban @user', aliases: [], permissions: 'owner',
    examples: ['.unban @user'],
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message) => {
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .unban @user' });
      db.unbanUser(target);
      await sock.sendMessage(jid, {
        text: `✅ @${target.split('@')[0]} has been *unbanned*.`, mentions: [target]
      });
    })
  },

  broadcast: {
    category: 'owner', desc: 'Broadcast a message to all known groups',
    usage: '.broadcast <message>', aliases: ['bc'], permissions: 'owner',
    examples: ['.broadcast Server maintenance at 10pm tonight!'],
    exec: ownerOnly(async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .broadcast <message>' });
      const groups = Object.values(db.data.groups);
      if (!groups.length) return sock.sendMessage(jid, { text: '❌ No groups in the database yet.' });
      let sent = 0;
      for (const g of groups) {
        try {
          await sock.sendMessage(`${g.id}@g.us`, { text: `📢 *Broadcast from Owner*\n\n${text}` });
          sent++;
        } catch {}
      }
      await sock.sendMessage(jid, { text: `✅ Broadcast sent to *${sent}/${groups.length}* groups.` });
    })
  },

  autostatus: {
    category: 'owner', desc: 'Toggle auto-viewing of status updates',
    usage: '.autostatus', aliases: [], permissions: 'owner',
    examples: ['.autostatus'],
    exec: ownerOnly(async (args, sock, jid) => {
      const v = !db.getSetting('autoStatus', false);
      db.setSetting('autoStatus', v);
      await sock.sendMessage(jid, { text: `👁️ Auto-Status: ${v ? '✅ Enabled' : '❌ Disabled'}` });
    })
  },

  autostatusreact: {
    category: 'owner', desc: 'Toggle auto-reacting to status updates',
    usage: '.autostatusreact', aliases: [], permissions: 'owner',
    examples: ['.autostatusreact'],
    exec: ownerOnly(async (args, sock, jid) => {
      const v = !db.getSetting('autoStatusReact', false);
      db.setSetting('autoStatusReact', v);
      await sock.sendMessage(jid, { text: `❤️ Auto-Status React: ${v ? '✅ Enabled' : '❌ Disabled'}` });
    })
  },

  autoread: {
    category: 'owner', desc: 'Toggle auto-reading (mark messages as read)',
    usage: '.autoread', aliases: [], permissions: 'owner',
    examples: ['.autoread'],
    exec: ownerOnly(async (args, sock, jid) => {
      const v = !db.getSetting('autoRead', false);
      db.setSetting('autoRead', v);
      await sock.sendMessage(jid, { text: `📖 Auto-Read: ${v ? '✅ Enabled' : '❌ Disabled'}` });
    })
  },

  autotyping: {
    category: 'owner', desc: 'Toggle auto-typing indicator when processing commands',
    usage: '.autotyping', aliases: [], permissions: 'owner',
    examples: ['.autotyping'],
    exec: ownerOnly(async (args, sock, jid) => {
      const v = !db.getSetting('autoTyping', false);
      db.setSetting('autoTyping', v);
      await sock.sendMessage(jid, { text: `⌨️ Auto-Typing: ${v ? '✅ Enabled' : '❌ Disabled'}` });
    })
  },

  anticall: {
    category: 'owner', desc: 'Toggle auto-rejecting incoming calls',
    usage: '.anticall', aliases: [], permissions: 'owner',
    examples: ['.anticall'],
    exec: ownerOnly(async (args, sock, jid) => {
      const v = !db.getSetting('antiCall', false);
      db.setSetting('antiCall', v);
      await sock.sendMessage(jid, { text: `📵 Anti-Call: ${v ? '✅ Enabled — calls will be rejected' : '❌ Disabled'}` });
    })
  },

  antidelete: {
    category: 'owner', desc: 'Toggle global anti-delete (DMs + any chat)',
    usage: '.antidelete', aliases: [], permissions: 'owner',
    examples: ['.antidelete'],
    exec: ownerOnly(async (args, sock, jid) => {
      const v = !db.getSetting('antiDelete', false);
      db.setSetting('antiDelete', v);
      await sock.sendMessage(jid, {
        text: `🗑️ *Global Anti-Delete:* ${v ? '✅ Enabled' : '❌ Disabled'}\n\n` +
              (v
                ? '_Bot will reveal deleted messages in DMs and all chats._\n_For groups, also run .antidelete inside the group._'
                : '_Anti-delete is now off globally._')
      });
    })
  },

  addbalance: {
    category: 'owner', desc: 'Add coins to a user\'s balance',
    usage: '.addbalance @user <amount>', aliases: [], permissions: 'owner',
    examples: ['.addbalance @user 1000'],
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message) => {
      const target = getMentionedJid(message) || sender;
      const amount = parseInt(args.find(a => /^\d+$/.test(a)) || '0', 10);
      if (!amount) return sock.sendMessage(jid, { text: '❌ Usage: .addbalance @user <amount>' });
      db.addBalance(target, amount);
      await sock.sendMessage(jid, {
        text:
          `✅ Added *${formatNumber(amount)}* coins to @${target.split('@')[0]}.\n` +
          `New balance: ${formatNumber(db.getUser(target).balance)}`,
        mentions: [target]
      });
    })
  },

  restart: {
    category: 'owner', desc: 'Restart the bot process',
    usage: '.restart', aliases: [], permissions: 'owner',
    examples: ['.restart'],
    exec: ownerOnly(async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: '🔄 *Restarting bot...*\n\nBe right back!' });
      // Exit with code 1 (non-zero) so PM2 / any process manager treats this
      // as an abnormal exit and auto-restarts. exit(0) signals a clean finish
      // which some supervisors honour by NOT restarting. On Replit without PM2,
      // any exit kills the process permanently — add a process manager or use
      // Replit's built-in workflow restart to recover from .restart.
      setTimeout(() => process.exit(1), 1500);
    })
  },

  update: {
    category: 'owner', desc: 'Show bot version and update info',
    usage: '.update', aliases: [], permissions: 'owner',
    examples: ['.update'],
    exec: ownerOnly(async (args, sock, jid) => {
      const pkg = require('../package.json');
      await sock.sendMessage(jid, {
        text:
          `🔄 *Bot Update Info*\n\n` +
          `🏷️  Current Version : v${pkg.version}\n` +
          `📦 Package         : ${pkg.name}\n` +
          `👤 Author          : ${pkg.author || 'Olasubomi'}\n\n` +
          `📁 To update, run:\n\`git pull && npm install\`\n\n` +
          `🔗 Repo: https://github.com/olasubomi-png/Vegas-MD`
      });
    })
  },

  backup: {
    category: 'owner', desc: 'Create a backup of the bot database',
    usage: '.backup', aliases: [], permissions: 'owner',
    examples: ['.backup'],
    exec: ownerOnly(async (args, sock, jid) => {
      try {
        const dbPath  = path.join(__dirname, '../data/database.json');
        const bakPath = path.join(__dirname, `../data/database_backup_${Date.now()}.json`);
        fs.copyFileSync(dbPath, bakPath);
        const sizeKB = Math.round(fs.statSync(bakPath).size / 1024);
        await sock.sendMessage(jid, {
          text:
            `✅ *Database Backed Up*\n\n` +
            `📁 File: ${path.basename(bakPath)}\n` +
            `📦 Size: ${sizeKB} KB\n` +
            `📅 Time: ${new Date().toLocaleString()}`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Backup failed: ${err.message}` });
      }
    })
  },

  restore: {
    category: 'owner', desc: 'List available database backups',
    usage: '.restore', aliases: [], permissions: 'owner',
    examples: ['.restore'],
    exec: ownerOnly(async (args, sock, jid) => {
      const dataDir = path.join(__dirname, '../data');
      const backups = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('database_backup_') && f.endsWith('.json'))
        .sort().reverse().slice(0, 5);
      if (!backups.length) {
        return sock.sendMessage(jid, { text: '❌ No backups found.\n\nUse *.backup* to create one.' });
      }
      const list = backups.map((f, i) => {
        const ts = parseInt(f.replace('database_backup_', '').replace('.json', ''), 10);
        return `${i + 1}. ${new Date(ts).toLocaleString()} — ${Math.round(fs.statSync(path.join(dataDir, f)).size / 1024)} KB`;
      }).join('\n');
      await sock.sendMessage(jid, {
        text: `📂 *Available Backups*\n\n${list}\n\n_To restore manually, replace database.json with the backup file._`
      });
    })
  },

  clearsession: {
    category: 'owner', desc: 'Clear WhatsApp auth session (forces re-login)',
    usage: '.clearsession', aliases: [], permissions: 'owner',
    examples: ['.clearsession'],
    exec: ownerOnly(async (args, sock, jid) => {
      await sock.sendMessage(jid, {
        text:
          `⚠️ *Clear Session*\n\n` +
          `This will delete *auth_info_baileys/* and restart the bot.\n` +
          `You will need to re-pair with a new pairing code.\n\n` +
          `Send *.clearsession confirm* to proceed.`
      });
    })
  },

  listplugins: {
    category: 'owner', desc: 'List all loaded commands and plugins',
    usage: '.listplugins', aliases: ['plugins'], permissions: 'owner',
    examples: ['.listplugins'],
    exec: ownerOnly(async (args, sock, jid) => {
      const allCmds = require('./index');
      const sorted  = Object.keys(allCmds).filter(k => typeof allCmds[k]?.exec === 'function').sort();
      const total   = sorted.length;
      await sock.sendMessage(jid, {
        text: `🔌 *Loaded Commands* — Total: ${total}\n\n${sorted}`
      });
    })
  },

  sessions: {
    category: 'owner', desc: 'List all active secondary bot sessions',
    usage: '.sessions', aliases: ['listsessions'], permissions: 'owner',
    examples: ['.sessions'],
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const sessionManager = require('../lib/sessionManager');
      const list = sessionManager.listSessions();
      const primaryNum = (botConfig?.ownerNumber || global.botConfig?.ownerNumber || '').replace(/\D/g, '');

      let text =
        `┏━━〔 📱 *Active Sessions* 〕━━┓\n` +
        `┃\n` +
        `┃ 🟢 *Primary* : +${primaryNum || 'unknown'} (always on)\n`;

      if (!list.length) {
        text += `┃\n┃ No secondary sessions.\n`;
      } else {
        for (const s of list) {
          const icon = s.connected ? '🟢' : s.pairing ? '🟡' : '🔴';
          const status = s.connected ? 'Connected' : s.pairing ? 'Pairing…' : 'Disconnected';
          text += `┃ ${icon} *Secondary* : +${s.phoneNumber} — ${status}\n`;
        }
      }

      text +=
        `┃\n` +
        `┃ *.pair <number>*   — Add a number\n` +
        `┃ *.unpair <number>* — Remove a number\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;

      await sock.sendMessage(jid, { text });
    })
  },

  unpair: {
    category: 'owner', desc: 'Remove a secondary session / disconnect a paired number',
    usage: '.unpair <number>', aliases: ['removesession'], permissions: 'owner',
    examples: ['.unpair 2349112097911'],
    exec: ownerOnly(async (args, sock, jid) => {
      const raw    = (args[0] || '').replace(/\D/g, '');
      if (!raw) {
        return sock.sendMessage(jid, {
          text: `Usage: *.unpair <number>*\nExample: *.unpair 2349112097911*\n\nUse *.sessions* to see active sessions.`
        });
      }
      const sessionManager = require('../lib/sessionManager');
      const removed = sessionManager.removeSession(raw);
      await sock.sendMessage(jid, {
        text: removed
          ? `✅ Session *+${raw}* has been removed and disconnected.`
          : `❌ No active session found for *+${raw}*.\n\nUse *.sessions* to see active sessions.`
      });
    })
  }
};

module.exports = ownerCommands;
