// Group Management + Protection Toggle Commands
const db = require('../lib/database');
const { getMentionedJid, isGroupAdmin, normalizeJid, toggleEmoji } = require('../lib/helpers');

async function requireAdmin(sock, jid, isGroup, sender, botConfig) {
  if (!isGroup) {
    await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });
    return false;
  }
  const ownerNum = normalizeJid(botConfig?.ownerNumber || global.botConfig?.ownerNumber || '');
  if (ownerNum && normalizeJid(sender) === ownerNum) return true;
  const admin = await isGroupAdmin(sock, jid, sender);
  if (!admin) {
    await sock.sendMessage(jid, { text: '❌ Only group admins can use this command.' });
    return false;
  }
  return true;
}

const groupCommands = {
  // ─── Member management ──────────────────────────────────
  promote: {
    desc: 'Promote member to admin',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .promote @user' });
      try {
        await sock.groupParticipantsUpdate(jid, [target], 'promote');
        await sock.sendMessage(jid, {
          text: `✅ @${target.split('@')[0]} has been promoted to *admin*!`,
          mentions: [target]
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  demote: {
    desc: 'Demote admin to member',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .demote @user' });
      try {
        await sock.groupParticipantsUpdate(jid, [target], 'demote');
        await sock.sendMessage(jid, {
          text: `✅ @${target.split('@')[0]} has been demoted.`,
          mentions: [target]
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  kick: {
    desc: 'Remove a member from the group',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .kick @user' });
      try {
        await sock.groupParticipantsUpdate(jid, [target], 'remove');
        await sock.sendMessage(jid, {
          text: `👢 @${target.split('@')[0]} was removed from the group.`,
          mentions: [target]
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  mute: {
    desc: 'Mute group (only admins can send)',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      try {
        await sock.groupSettingUpdate(jid, 'announcement');
        await sock.sendMessage(jid, { text: '🔇 Group *muted* — only admins can send messages.' });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  unmute: {
    desc: 'Unmute group (everyone can send)',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      try {
        await sock.groupSettingUpdate(jid, 'not_announcement');
        await sock.sendMessage(jid, { text: '🔊 Group *unmuted* — everyone can send messages.' });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  tagall: {
    desc: 'Tag all group members',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      try {
        const meta = await sock.groupMetadata(jid);
        const members = meta.participants.map(p => p.id);
        const custom = args.join(' ') || '📢 Attention everyone!';
        const tags = members.map(m => `@${m.split('@')[0]}`).join(' ');
        await sock.sendMessage(jid, { text: `${custom}\n\n${tags}`, mentions: members });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  ginfo: {
    desc: 'Show group information',
    exec: async (args, sock, jid, isGroup) => {
      if (!isGroup) return sock.sendMessage(jid, { text: '❌ Groups only.' });
      try {
        const meta = await sock.groupMetadata(jid);
        const admins = meta.participants
          .filter(p => p.admin)
          .map(p => `@${p.id.split('@')[0]}`).join(', ') || 'None';
        const created = meta.creation
          ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown';
        await sock.sendMessage(jid, {
          text: `📊 *Group Info*\n\n📛 Name    : ${meta.subject}\n👥 Members : ${meta.participants.length}\n👑 Admins  : ${admins}\n📅 Created : ${created}\n🔗 JID     : ${jid}`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  // ─── Protection toggles ──────────────────────────────────
  groupsettings: {
    desc: 'Show all group protection settings',
    exec: async (args, sock, jid, isGroup) => {
      if (!isGroup) return sock.sendMessage(jid, { text: '❌ Groups only.' });
      const g = db.getGroup(jid);
      await sock.sendMessage(jid, {
        text: `⚙️ *Group Settings*\n\n` +
          `${toggleEmoji(g.welcome)} Welcome messages\n` +
          `${toggleEmoji(g.goodbye)} Goodbye messages\n` +
          `${toggleEmoji(g.antiLink)} Anti-link\n` +
          `${toggleEmoji(g.antiDelete)} Anti-delete\n` +
          `${toggleEmoji(g.antiSpam)} Anti-spam\n` +
          `${toggleEmoji(g.antiViewOnce)} Anti-view-once\n` +
          `${toggleEmoji(g.autoReact)} Auto-react\n` +
          `⚠️ Max warnings: ${g.maxWarnings || 3}\n\n` +
          `Toggle with: .welcome · .goodbye · .antilink · .antidelete · .antispam · .antiviewonce · .autoreact`
      });
    }
  },

  welcome: {
    desc: 'Toggle welcome messages on/off',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const val = db.toggleGroup(jid, 'welcome');
      await sock.sendMessage(jid, { text: `👋 Welcome messages: ${val ? '✅ Enabled' : '❌ Disabled'}` });
    }
  },

  goodbye: {
    desc: 'Toggle goodbye messages on/off',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const val = db.toggleGroup(jid, 'goodbye');
      await sock.sendMessage(jid, { text: `👋 Goodbye messages: ${val ? '✅ Enabled' : '❌ Disabled'}` });
    }
  },

  antilink: {
    desc: 'Toggle anti-link protection',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const val = db.toggleGroup(jid, 'antiLink');
      await sock.sendMessage(jid, { text: `🔗 Anti-link: ${val ? '✅ Enabled' : '❌ Disabled'}` });
    }
  },

  antidelete: {
    desc: 'Toggle anti-delete (reveal deleted messages)',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const val = db.toggleGroup(jid, 'antiDelete');
      await sock.sendMessage(jid, { text: `🗑️ Anti-delete: ${val ? '✅ Enabled' : '❌ Disabled'}` });
    }
  },

  antispam: {
    desc: 'Toggle anti-spam protection',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const val = db.toggleGroup(jid, 'antiSpam');
      await sock.sendMessage(jid, { text: `🚨 Anti-spam: ${val ? '✅ Enabled' : '❌ Disabled'}` });
    }
  },

  antiviewonce: {
    desc: 'Toggle anti-view-once (reveal view-once media)',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const val = db.toggleGroup(jid, 'antiViewOnce');
      await sock.sendMessage(jid, { text: `👁️ Anti-view-once: ${val ? '✅ Enabled' : '❌ Disabled'}` });
    }
  },

  autoreact: {
    desc: 'Toggle auto-reactions to messages in this group',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, botConfig)) return;
      const val = db.toggleGroup(jid, 'autoReact');
      await sock.sendMessage(jid, { text: `❤️ Auto-react: ${val ? '✅ Enabled' : '❌ Disabled'}` });
    }
  }
};

module.exports = groupCommands;
