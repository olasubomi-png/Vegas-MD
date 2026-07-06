// Moderation Commands — warn, unwarn, ban in group context
const db = require('../lib/database');
const { getMentionedJid, isGroupAdmin, normalizeJid } = require('../lib/helpers');

async function requireAdmin(sock, jid, isGroup, sender, message, botConfig) {
  if (!isGroup) {
    await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });
    return false;
  }
  const ownerNum = normalizeJid(botConfig?.ownerNumber || global.botConfig?.ownerNumber || '');
  const senderNum = normalizeJid(sender);
  if (ownerNum && senderNum === ownerNum) return true;
  const admin = await isGroupAdmin(sock, jid, sender);
  if (!admin) {
    await sock.sendMessage(jid, { text: '❌ Only group admins can use this command.' });
    return false;
  }
  return true;
}

const moderationCommands = {
  warn: {
    desc: 'Warn a member',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;

      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .warn @user [reason]' });

      const reason = args.filter(a => !a.startsWith('@')).join(' ') || 'No reason given';
      const count = db.addWarning(target);
      const settings = db.getGroup(jid);
      const maxWarn = settings.maxWarnings || 3;
      const targetName = target.split('@')[0];

      let extra = '';
      if (count >= maxWarn) {
        try {
          await sock.groupParticipantsUpdate(jid, [target], 'remove');
          extra = `\n\n🚫 Reached ${maxWarn} warnings — *kicked from group*.`;
          db.clearWarnings(target);
        } catch (err) {
          extra = `\n\n⚠️ Could not kick: ${err.message}`;
        }
      }

      await sock.sendMessage(jid, {
        text: `⚠️ *Warning Issued*\n\n👤 User   : @${targetName}\n📝 Reason : ${reason}\n🔢 Count  : ${count}/${maxWarn}${extra}`,
        mentions: [target]
      });
    }
  },

  unwarn: {
    desc: 'Remove a warning from a member',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;

      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .unwarn @user' });

      db.clearWarnings(target);
      await sock.sendMessage(jid, {
        text: `✅ All warnings cleared for @${target.split('@')[0]}`,
        mentions: [target]
      });
    }
  },

  warnings: {
    desc: 'Check warnings for a user',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const target = getMentionedJid(message) || sender;
      const user = db.getUser(target);
      const settings = isGroup ? db.getGroup(jid) : { maxWarnings: 3 };
      await sock.sendMessage(jid, {
        text: `⚠️ *Warnings*\n\n👤 User   : @${target.split('@')[0]}\n🔢 Count  : ${user.warnings}/${settings.maxWarnings || 3}`,
        mentions: [target]
      });
    }
  },

  setmaxwarn: {
    desc: 'Set max warnings before auto-kick',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const max = parseInt(args[0], 10);
      if (!max || max < 1 || max > 20) {
        return sock.sendMessage(jid, { text: '❌ Usage: .setmaxwarn <1–20>' });
      }
      db.updateGroup(jid, { maxWarnings: max });
      await sock.sendMessage(jid, { text: `✅ Max warnings set to *${max}*` });
    }
  },

  setwelcome: {
    desc: 'Set custom welcome message (@user, @group, @count)',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const msg = args.join(' ').trim();
      if (!msg) return sock.sendMessage(jid, { text: '❌ Usage: .setwelcome <message>\nVariables: @user @group @count' });
      db.updateGroup(jid, { welcomeMsg: msg });
      await sock.sendMessage(jid, { text: `✅ Welcome message updated:\n\n_${msg}_` });
    }
  },

  setgoodbye: {
    desc: 'Set custom goodbye message (@user)',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const msg = args.join(' ').trim();
      if (!msg) return sock.sendMessage(jid, { text: '❌ Usage: .setgoodbye <message>\nVariables: @user' });
      db.updateGroup(jid, { goodbyeMsg: msg });
      await sock.sendMessage(jid, { text: `✅ Goodbye message updated:\n\n_${msg}_` });
    }
  }
};

module.exports = moderationCommands;
