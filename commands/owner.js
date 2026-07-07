// Owner Dashboard Commands — owner-only controls
const db = require('../lib/database');
const { resolveIsOwner, getMentionedJid, formatNumber, normalizeJid } = require('../lib/helpers');

function ownerOnly(exec) {
  return async (args, sock, jid, isGroup, sender, message, botConfig) => {
    // resolveIsOwner: fromMe === true OR sender matches OWNER_NUMBER
    if (resolveIsOwner(message, sender, botConfig)) {
      return exec(args, sock, jid, isGroup, sender, message, botConfig);
    }
    // Not the owner — give a helpful message if the issue is misconfiguration
    const ownerNum = normalizeJid(botConfig?.ownerNumber || global.botConfig?.ownerNumber || '');
    if (!ownerNum) {
      return sock.sendMessage(jid, {
        text: '🔒 Owner not configured.\n\nSet *OWNER_NUMBER* as a Replit Secret to enable owner commands.'
      });
    }
    return sock.sendMessage(jid, { text: '🔒 This command is *owner-only*.' });
  };
}

const ownerCommands = {
  owner: {
    desc: 'Owner info',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      await sock.sendMessage(jid, {
        text: `👤 *Bot Owner*\n\nName  : ${cfg.ownerName || 'Olasubomi'}\nNumber: ${cfg.ownerNumber || 'Not set'}\nBot   : OLASUBOMI-MD v3.0.0`
      });
    }
  },

  dashboard: {
    desc: 'Owner control dashboard',
    exec: ownerOnly(async (args, sock, jid) => {
      const stats = db.stats();
      const cfg = global.botConfig || {};
      const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const uptime = Math.floor((Date.now() - (global.botStartTime || Date.now())) / 1000);
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);

      await sock.sendMessage(jid, {
        text: `🛠️ *Owner Dashboard*\n\n` +
          `*Bot Info*\n` +
          `├ Mode   : ${cfg.mode || 'private'}\n` +
          `├ Prefix : ${cfg.prefix || '.'}\n` +
          `├ Uptime : ${h}h ${m}m\n` +
          `└ Memory : ${memMB} MB\n\n` +
          `*Database*\n` +
          `├ Users  : ${stats.users}\n` +
          `├ Groups : ${stats.groups}\n` +
          `└ Banned : ${stats.banned}\n\n` +
          `*Global Settings*\n` +
          `├ AutoStatus      : ${db.getSetting('autoStatus', false) ? '✅' : '❌'}\n` +
          `└ AutoStatusReact : ${db.getSetting('autoStatusReact', false) ? '✅' : '❌'}\n\n` +
          `*Owner Commands*\n` +
          `.setmode · .setprefix · .ban · .unban\n` +
          `.broadcast · .autostatus · .autostatusreact\n` +
          `.addbalance · .restart`
      });
    })
  },

  setmode: {
    desc: 'Set bot mode (public/private)',
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const mode = args[0]?.toLowerCase();
      if (!['public', 'private'].includes(mode)) {
        return sock.sendMessage(jid, { text: '❌ Usage: .setmode public OR .setmode private' });
      }
      if (botConfig) botConfig.mode = mode;
      if (global.botConfig) global.botConfig.mode = mode;
      db.setSetting('mode', mode);
      await sock.sendMessage(jid, { text: `✅ Bot mode set to *${mode}*` });
    })
  },

  setprefix: {
    desc: 'Change the command prefix',
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const prefix = args[0];
      if (!prefix || prefix.length > 3) {
        return sock.sendMessage(jid, { text: '❌ Usage: .setprefix <symbol>\nExample: .setprefix !' });
      }
      if (botConfig) botConfig.prefix = prefix;
      if (global.botConfig) global.botConfig.prefix = prefix;
      db.setSetting('prefix', prefix);
      await sock.sendMessage(jid, { text: `✅ Prefix changed to *${prefix}*\n\nNew command: *${prefix}menu*` });
    })
  },

  ban: {
    desc: 'Ban a user from using the bot',
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message) => {
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Mention a user to ban. Usage: .ban @user' });
      db.banUser(target);
      await sock.sendMessage(jid, {
        text: `🚫 @${target.split('@')[0]} has been *banned* from using the bot.`,
        mentions: [target]
      });
    })
  },

  unban: {
    desc: 'Unban a user',
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message) => {
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Mention a user to unban. Usage: .unban @user' });
      db.unbanUser(target);
      await sock.sendMessage(jid, {
        text: `✅ @${target.split('@')[0]} has been *unbanned*.`,
        mentions: [target]
      });
    })
  },

  broadcast: {
    desc: 'Send a message to all known groups',
    exec: ownerOnly(async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .broadcast <message>' });

      const groups = Object.values(db.data.groups);
      if (!groups.length) return sock.sendMessage(jid, { text: '❌ No groups in the database yet.' });

      let sent = 0;
      for (const g of groups) {
        try {
          await sock.sendMessage(`${g.id}@g.us`, {
            text: `📢 *Broadcast from Owner*\n\n${text}`
          });
          sent++;
        } catch {}
      }
      await sock.sendMessage(jid, { text: `✅ Broadcast sent to *${sent}/${groups.length}* groups.` });
    })
  },

  autostatus: {
    desc: 'Toggle auto-viewing status updates',
    exec: ownerOnly(async (args, sock, jid) => {
      const current = db.getSetting('autoStatus', false);
      db.setSetting('autoStatus', !current);
      await sock.sendMessage(jid, {
        text: `👁️ Auto-Status: ${!current ? '✅ Enabled' : '❌ Disabled'}`
      });
    })
  },

  autostatusreact: {
    desc: 'Toggle auto-reacting to status updates',
    exec: ownerOnly(async (args, sock, jid) => {
      const current = db.getSetting('autoStatusReact', false);
      db.setSetting('autoStatusReact', !current);
      await sock.sendMessage(jid, {
        text: `❤️ Auto-Status React: ${!current ? '✅ Enabled' : '❌ Disabled'}`
      });
    })
  },

  addbalance: {
    desc: 'Add coins to a user (owner only)',
    exec: ownerOnly(async (args, sock, jid, isGroup, sender, message) => {
      const target = getMentionedJid(message) || sender;
      const amount = parseInt(args.find(a => /^\d+$/.test(a)) || '0', 10);
      if (!amount) return sock.sendMessage(jid, { text: '❌ Usage: .addbalance @user <amount>' });
      db.addBalance(target, amount);
      await sock.sendMessage(jid, {
        text: `✅ Added *${formatNumber(amount)}* coins to @${target.split('@')[0]}.\nNew balance: ${formatNumber(db.getUser(target).balance)}`,
        mentions: [target]
      });
    })
  },

  listplugins: {
    desc: 'List all loaded plugins',
    exec: ownerOnly(async (args, sock, jid) => {
      const allCmds = require('./index');
      const total = Object.keys(allCmds).length;
      await sock.sendMessage(jid, {
        text: `🔌 *Loaded Commands*\n\nTotal: ${total}\n\n${Object.keys(allCmds).sort().join(', ')}`
      });
    })
  }
};

module.exports = ownerCommands;
