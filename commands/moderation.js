'use strict';
// commands/moderation.js — Warn, ban, welcome/goodbye configuration
const db = require('../lib/database');
const { getMentionedJid, isGroupAdmin, resolveIsOwner } = require('../lib/helpers');

async function requireAdmin(sock, jid, isGroup, sender, message, botConfig) {
  if (!isGroup) { await sock.sendMessage(jid, { text: '❌ This command only works in groups.' }); return false; }
  if (resolveIsOwner(message, sender, botConfig)) return true;
  if (!await isGroupAdmin(sock, jid, sender)) {
    await sock.sendMessage(jid, { text: '❌ Only group admins can use this command.' }); return false;
  }
  return true;
}

const moderationCommands = {
  warn: {
    category: 'moderation', desc: 'Issue a warning to a member',
    usage: '.warn @user [reason]', aliases: [], permissions: 'admin',
    examples: ['.warn @user Spamming', '.warn @user'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .warn @user [reason]' });
      const reason   = args.filter(a => !a.startsWith('@')).join(' ') || 'No reason given';
      const count    = db.addWarning(target);
      const settings = db.getGroup(jid);
      const maxWarn  = settings.maxWarnings || 3;
      let extra = '';
      if (count >= maxWarn) {
        try { await sock.groupParticipantsUpdate(jid, [target], 'remove'); extra = `\n\n🚫 Reached ${maxWarn} warnings — *kicked*.`; db.clearWarnings(target); }
        catch (err) { extra = `\n\n⚠️ Could not kick: ${err.message}`; }
      }
      await sock.sendMessage(jid, {
        text: `⚠️ *Warning Issued*\n\n👤 User   : @${target.split('@')[0]}\n📝 Reason : ${reason}\n🔢 Count  : ${count}/${maxWarn}${extra}`,
        mentions: [target]
      });
    }
  },

  unwarn: {
    category: 'moderation', desc: 'Clear all warnings for a member',
    usage: '.unwarn @user', aliases: [], permissions: 'admin',
    examples: ['.unwarn @user'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .unwarn @user' });
      db.clearWarnings(target);
      await sock.sendMessage(jid, { text: `✅ All warnings cleared for @${target.split('@')[0]}`, mentions: [target] });
    }
  },

  warnings: {
    category: 'moderation', desc: 'Check warning count for a user',
    usage: '.warnings [@user]', aliases: ['checkwarn'], permissions: 'all',
    examples: ['.warnings @user', '.warnings'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const target = getMentionedJid(message) || sender;
      const user   = db.getUser(target);
      const max    = isGroup ? (db.getGroup(jid).maxWarnings || 3) : 3;
      await sock.sendMessage(jid, {
        text: `⚠️ *Warnings*\n\n👤 User   : @${target.split('@')[0]}\n🔢 Count  : ${user.warnings}/${max}`,
        mentions: [target]
      });
    }
  },

  setmaxwarn: {
    category: 'moderation', desc: 'Set the maximum warnings before auto-kick',
    usage: '.setmaxwarn <1–20>', aliases: [], permissions: 'admin',
    examples: ['.setmaxwarn 3', '.setmaxwarn 5'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const max = parseInt(args[0], 10);
      if (!max || max < 1 || max > 20) return sock.sendMessage(jid, { text: '❌ Usage: .setmaxwarn <1–20>' });
      db.updateGroup(jid, { maxWarnings: max });
      await sock.sendMessage(jid, { text: `✅ Max warnings set to *${max}*` });
    }
  },

  setwelcome: {
    category: 'moderation', desc: 'Set a custom welcome message (@user, @group, @count)',
    usage: '.setwelcome <message>', aliases: [], permissions: 'admin',
    examples: ['.setwelcome Welcome @user to @group! We now have @count members.'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const msg = args.join(' ').trim();
      if (!msg) return sock.sendMessage(jid, { text: '❌ Usage: .setwelcome <message>\nVariables: @user @group @count' });
      db.updateGroup(jid, { welcomeMsg: msg });
      await sock.sendMessage(jid, { text: `✅ Welcome message updated:\n\n_${msg}_` });
    }
  },

  setgoodbye: {
    category: 'moderation', desc: 'Set a custom goodbye message (@user)',
    usage: '.setgoodbye <message>', aliases: [], permissions: 'admin',
    examples: ['.setgoodbye Goodbye @user, we\'ll miss you!'],
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
