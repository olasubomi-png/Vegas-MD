// Group Management Commands

// Extract the first mentioned JID from a message
function getMentionedJid(message) {
  const ctx = message.message?.extendedTextMessage?.contextInfo;
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx?.participant) return ctx.participant;
  return null;
}

const groupCommands = {
  promote: {
    desc: 'Promote member to admin',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      if (!isGroup) return await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });

      const isAdmin = message._isOwner || await message._isGroupAdmin();
      if (!isAdmin) {
        return await sock.sendMessage(jid, { text: '❌ Only group admins or the bot owner can use this command.' });
      }

      const target = getMentionedJid(message);
      if (!target) {
        return await sock.sendMessage(jid, {
          text: '❌ Please mention the user to promote.\n\n*Usage:* .promote @user'
        });
      }

      try {
        await sock.groupParticipantsUpdate(jid, [target], 'promote');
        await sock.sendMessage(jid, {
          text: `✅ @${target.split('@')[0]} has been promoted to admin!`,
          mentions: [target]
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed to promote: ${err.message}` });
      }
    }
  },

  demote: {
    desc: 'Demote admin to member',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      if (!isGroup) return await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });

      const isAdmin = message._isOwner || await message._isGroupAdmin();
      if (!isAdmin) {
        return await sock.sendMessage(jid, { text: '❌ Only group admins or the bot owner can use this command.' });
      }

      const target = getMentionedJid(message);
      if (!target) {
        return await sock.sendMessage(jid, {
          text: '❌ Please mention the user to demote.\n\n*Usage:* .demote @user'
        });
      }

      try {
        await sock.groupParticipantsUpdate(jid, [target], 'demote');
        await sock.sendMessage(jid, {
          text: `✅ @${target.split('@')[0]} has been demoted to member.`,
          mentions: [target]
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed to demote: ${err.message}` });
      }
    }
  },

  kick: {
    desc: 'Remove member from group',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      if (!isGroup) return await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });

      const isAdmin = message._isOwner || await message._isGroupAdmin();
      if (!isAdmin) {
        return await sock.sendMessage(jid, { text: '❌ Only group admins or the bot owner can use this command.' });
      }

      const target = getMentionedJid(message);
      if (!target) {
        return await sock.sendMessage(jid, {
          text: '❌ Please mention the user to kick.\n\n*Usage:* .kick @user'
        });
      }

      try {
        await sock.groupParticipantsUpdate(jid, [target], 'remove');
        await sock.sendMessage(jid, {
          text: `👢 @${target.split('@')[0]} has been removed from the group.`,
          mentions: [target]
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed to kick: ${err.message}` });
      }
    }
  },

  mute: {
    desc: 'Mute group (admins only can send)',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      if (!isGroup) return await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });

      const isAdmin = message._isOwner || await message._isGroupAdmin();
      if (!isAdmin) {
        return await sock.sendMessage(jid, { text: '❌ Only group admins or the bot owner can use this command.' });
      }

      try {
        await sock.groupSettingUpdate(jid, 'announcement');
        await sock.sendMessage(jid, { text: '🔇 Group has been *muted*. Only admins can send messages.' });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed to mute: ${err.message}` });
      }
    }
  },

  unmute: {
    desc: 'Unmute group (everyone can send)',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      if (!isGroup) return await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });

      const isAdmin = message._isOwner || await message._isGroupAdmin();
      if (!isAdmin) {
        return await sock.sendMessage(jid, { text: '❌ Only group admins or the bot owner can use this command.' });
      }

      try {
        await sock.groupSettingUpdate(jid, 'not_announcement');
        await sock.sendMessage(jid, { text: '🔊 Group has been *unmuted*. Everyone can send messages.' });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed to unmute: ${err.message}` });
      }
    }
  },

  tagall: {
    desc: 'Tag all members in the group',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      if (!isGroup) return await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });

      const isAdmin = message._isOwner || await message._isGroupAdmin();
      if (!isAdmin) {
        return await sock.sendMessage(jid, { text: '❌ Only group admins or the bot owner can use this command.' });
      }

      try {
        const metadata = await sock.groupMetadata(jid);
        const members = metadata.participants.map(p => p.id);
        const customMsg = args.join(' ') || '📢 Attention everyone!';

        const mentions = members.map(m => `@${m.split('@')[0]}`).join(' ');
        const text = `${customMsg}\n\n${mentions}`;

        await sock.sendMessage(jid, { text, mentions: members });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed to tag all: ${err.message}` });
      }
    }
  },

  ginfo: {
    desc: 'Get group info',
    exec: async (args, sock, jid, isGroup) => {
      if (!isGroup) return await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });

      try {
        const meta = await sock.groupMetadata(jid);
        const admins = meta.participants.filter(p => p.admin).map(p => `@${p.id.split('@')[0]}`).join(', ');
        const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown';

        await sock.sendMessage(jid, {
          text: `📊 *Group Information*\n\n📛 Name     : ${meta.subject}\n👥 Members  : ${meta.participants.length}\n👑 Admins   : ${admins || 'None listed'}\n📅 Created  : ${created}\n🆔 JID      : ${jid}`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed to get group info: ${err.message}` });
      }
    }
  }
};

module.exports = groupCommands;
