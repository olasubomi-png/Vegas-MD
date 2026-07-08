'use strict';
// commands/group.js — Group management + protection toggles
const db = require('../lib/database');
const { getMentionedJid, isGroupAdmin, normalizeJid, toggleEmoji, resolveIsOwner } = require('../lib/helpers');

async function requireAdmin(sock, jid, isGroup, sender, message, botConfig) {
  if (!isGroup) {
    await sock.sendMessage(jid, { text: '❌ This command only works in groups.' });
    return false;
  }
  if (resolveIsOwner(message, sender, botConfig)) return true;
  const admin = await isGroupAdmin(sock, jid, sender);
  if (!admin) {
    await sock.sendMessage(jid, { text: '❌ Only group admins can use this command.' });
    return false;
  }
  return true;
}

function makeToggle(fieldKey, label, emoji) {
  return {
    category: 'group', desc: `Toggle ${label} on/off`,
    usage: `.${fieldKey}`, aliases: [], permissions: 'admin',
    examples: [`.${fieldKey}`],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const val = db.toggleGroup(jid, fieldKey);
      await sock.sendMessage(jid, { text: `${emoji} ${label}: ${val ? '✅ Enabled' : '❌ Disabled'}` });
    }
  };
}

const groupCommands = {

  // ─── Member management ────────────────────────────────────
  promote: {
    category: 'group', desc: 'Promote a member to admin',
    usage: '.promote @user', aliases: [], permissions: 'admin',
    examples: ['.promote @user'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .promote @user' });
      try {
        await sock.groupParticipantsUpdate(jid, [target], 'promote');
        await sock.sendMessage(jid, {
          text: `⬆️ @${target.split('@')[0]} promoted to *admin*!`, mentions: [target]
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  demote: {
    category: 'group', desc: 'Demote an admin to member',
    usage: '.demote @user', aliases: [], permissions: 'admin',
    examples: ['.demote @user'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .demote @user' });
      try {
        await sock.groupParticipantsUpdate(jid, [target], 'demote');
        await sock.sendMessage(jid, {
          text: `⬇️ @${target.split('@')[0]} has been *demoted*.`, mentions: [target]
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  kick: {
    category: 'group', desc: 'Remove a member from the group',
    usage: '.kick @user', aliases: ['remove'], permissions: 'admin',
    examples: ['.kick @user'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const target = getMentionedJid(message);
      if (!target) return sock.sendMessage(jid, { text: '❌ Usage: .kick @user' });
      try {
        await sock.groupParticipantsUpdate(jid, [target], 'remove');
        await sock.sendMessage(jid, {
          text: `👢 @${target.split('@')[0]} was *removed* from the group.`, mentions: [target]
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  mute: {
    category: 'group', desc: 'Mute the group (only admins can send)',
    usage: '.mute', aliases: [], permissions: 'admin',
    examples: ['.mute'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      try {
        await sock.groupSettingUpdate(jid, 'announcement');
        await sock.sendMessage(jid, { text: '🔇 Group *muted* — only admins can send messages.' });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  unmute: {
    category: 'group', desc: 'Unmute the group (everyone can send)',
    usage: '.unmute', aliases: [], permissions: 'admin',
    examples: ['.unmute'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      try {
        await sock.groupSettingUpdate(jid, 'not_announcement');
        await sock.sendMessage(jid, { text: '🔊 Group *unmuted* — everyone can send messages.' });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  tagall: {
    category: 'group', desc: 'Tag (mention) all group members',
    usage: '.tagall [message]', aliases: ['all'], permissions: 'admin',
    examples: ['.tagall', '.tagall Please read the announcement!'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      try {
        const meta    = await sock.groupMetadata(jid);
        const members = meta.participants.map(p => p.id);
        const text    = args.join(' ') || '📢 Attention everyone!';
        const tags    = members.map(m => `@${m.split('@')[0]}`).join(' ');
        await sock.sendMessage(jid, { text: `${text}\n\n${tags}`, mentions: members });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  hidetag: {
    category: 'group', desc: 'Tag all members silently (hidden mention)',
    usage: '.hidetag [message]', aliases: [], permissions: 'admin',
    examples: ['.hidetag Read the pinned message!'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      try {
        const meta    = await sock.groupMetadata(jid);
        const members = meta.participants.map(p => p.id);
        const text    = args.join(' ') || '📢 Message for all members.';
        // Send with mentions but no visible @tags in the text
        await sock.sendMessage(jid, { text, mentions: members });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  ginfo: {
    category: 'group', desc: 'Show group information',
    usage: '.ginfo', aliases: ['groupinfo'], permissions: 'all',
    examples: ['.ginfo'],
    exec: async (args, sock, jid, isGroup) => {
      if (!isGroup) return sock.sendMessage(jid, { text: '❌ Groups only.' });
      try {
        const meta    = await sock.groupMetadata(jid);
        const admins  = meta.participants.filter(p => p.admin).map(p => `@${p.id.split('@')[0]}`).join(', ') || 'None';
        const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown';
        await sock.sendMessage(jid, {
          text:
            `┏━━〔 📊 *Group Info* 〕━━┓\n` +
            `┃  📛 Name    : ${meta.subject}\n` +
            `┃  👥 Members : ${meta.participants.length}\n` +
            `┃  👑 Admins  : ${admins}\n` +
            `┃  📅 Created : ${created}\n` +
            `┃  🔗 JID     : ${jid}\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  groupsettings: {
    category: 'group', desc: 'View all group protection settings',
    usage: '.groupsettings', aliases: ['settings'], permissions: 'all',
    examples: ['.groupsettings'],
    exec: async (args, sock, jid, isGroup) => {
      if (!isGroup) return sock.sendMessage(jid, { text: '❌ Groups only.' });
      const g = db.getGroup(jid);
      await sock.sendMessage(jid, {
        text:
          `⚙️ *Group Settings*\n\n` +
          `${toggleEmoji(g.welcome)}  Welcome messages\n` +
          `${toggleEmoji(g.goodbye)}  Goodbye messages\n` +
          `${toggleEmoji(g.antiLink)}  Anti-link\n` +
          `${toggleEmoji(g.antiDelete)}  Anti-delete\n` +
          `${toggleEmoji(g.antiSpam)}  Anti-spam\n` +
          `${toggleEmoji(g.antiViewOnce)}  Anti-view-once\n` +
          `${toggleEmoji(g.autoReact)}  Auto-react\n` +
          `⚠️ Max warnings: ${g.maxWarnings || 3}\n\n` +
          `_Toggle with the respective commands_`
      });
    }
  },

  resetlink: {
    category: 'group', desc: 'Reset / revoke the group invite link',
    usage: '.resetlink', aliases: ['revokelink'], permissions: 'admin',
    examples: ['.resetlink'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      try {
        const newCode = await sock.groupRevokeInvite(jid);
        await sock.sendMessage(jid, {
          text: `🔄 *Invite link reset!*\n\nNew link: https://chat.whatsapp.com/${newCode}`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  setname: {
    category: 'group', desc: 'Change the group name',
    usage: '.setname <new name>', aliases: [], permissions: 'admin',
    examples: ['.setname OLASUBOMI Fan Club'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const name = args.join(' ').trim();
      if (!name) return sock.sendMessage(jid, { text: '❌ Usage: .setname <new group name>' });
      try {
        await sock.groupUpdateSubject(jid, name);
        await sock.sendMessage(jid, { text: `✅ Group name changed to: *${name}*` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  setdesc: {
    category: 'group', desc: 'Change the group description',
    usage: '.setdesc <description>', aliases: [], permissions: 'admin',
    examples: ['.setdesc Welcome to our group! Be respectful.'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const desc = args.join(' ').trim();
      if (!desc) return sock.sendMessage(jid, { text: '❌ Usage: .setdesc <description>' });
      try {
        await sock.groupUpdateDescription(jid, desc);
        await sock.sendMessage(jid, { text: `✅ Group description updated.` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  },

  setpp: {
    category: 'group', desc: 'Change the group profile picture (reply to an image)',
    usage: '.setpp', aliases: [], permissions: 'admin',
    examples: ['.setpp (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: '🖼️ Reply to an *image* with *.setpp* to set it as the group picture.' });
      }
      await sock.sendMessage(jid, { text: `🖼️ Setting group profile picture...\n\n_Requires downloading the image. Coming soon._` });
    }
  },

  // ─── Simple toggles ───────────────────────────────────────
  welcome:      makeToggle('welcome',     'Welcome messages', '👋'),
  goodbye:      makeToggle('goodbye',     'Goodbye messages', '🚪'),
  antidelete:   makeToggle('antiDelete',  'Anti-delete',      '🗑️'),
  antispam:     makeToggle('antiSpam',    'Anti-spam',        '🚨'),
  antiviewonce: makeToggle('antiViewOnce','Anti-view-once',   '👁️'),
  autoreact:    makeToggle('autoReact',   'Auto-react',       '❤️'),

  // ─── Antilink (on / off / set <action> / status) ─────────
  antilink: {
    category: 'group',
    desc: 'Configure anti-link protection (on/off/set delete|kick|warn/status)',
    usage: '.antilink <on|off|set delete|kick|warn|status>',
    aliases: [],
    permissions: 'admin',
    examples: [
      '.antilink on',
      '.antilink off',
      '.antilink set kick',
      '.antilink set warn',
      '.antilink set delete',
      '.antilink status'
    ],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;

      const sub    = (args[0] || '').toLowerCase();
      const prefix = (botConfig || global.botConfig)?.prefix || '.';

      // ── Status ───────────────────────────────────────────
      if (!sub || sub === 'status') {
        const g      = db.getGroup(jid);
        const state  = g.antiLink ? '✅ Enabled' : '❌ Disabled';
        const action = g.antiLinkAction || 'delete';
        return sock.sendMessage(jid, {
          text:
            `🔗 *Anti-Link Status*\n\n` +
            `State  : ${state}\n` +
            `Action : *${action}*\n\n` +
            `_${prefix}antilink on/off  ·  ${prefix}antilink set delete|kick|warn_`
        });
      }

      // ── On / Off ─────────────────────────────────────────
      if (sub === 'on') {
        db.updateGroup(jid, { antiLink: true });
        const action = db.getGroup(jid).antiLinkAction || 'delete';
        return sock.sendMessage(jid, {
          text: `🔗 *Anti-Link: ✅ Enabled*\nAction: *${action}*\n\n_Change action with: ${prefix}antilink set delete|kick|warn_`
        });
      }

      if (sub === 'off') {
        db.updateGroup(jid, { antiLink: false });
        return sock.sendMessage(jid, { text: '🔗 *Anti-Link: ❌ Disabled*' });
      }

      // ── Set action ───────────────────────────────────────
      if (sub === 'set') {
        const action = (args[1] || '').toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(action)) {
          return sock.sendMessage(jid, {
            text:
              `❌ Invalid action. Choose one:\n\n` +
              `• *delete* — remove link, notify only\n` +
              `• *kick*   — remove link + kick sender immediately\n` +
              `• *warn*   — remove link + warn (kick at max warnings)\n\n` +
              `Usage: *${prefix}antilink set delete|kick|warn*`
          });
        }
        db.updateGroup(jid, { antiLinkAction: action, antiLink: true });
        const descriptions = {
          delete: 'Link removed, sender notified.',
          kick:   'Link removed, sender immediately kicked.',
          warn:   `Link removed, sender warned (kicked at ${db.getGroup(jid).maxWarnings || 3} warnings).`
        };
        return sock.sendMessage(jid, {
          text:
            `🔗 *Anti-Link Updated*\n\n` +
            `Action : *${action.toUpperCase()}*\n` +
            `Effect : ${descriptions[action]}\n` +
            `State  : ✅ Enabled`
        });
      }

      // ── Unknown sub-command ───────────────────────────────
      return sock.sendMessage(jid, {
        text:
          `❓ Unknown sub-command.\n\n` +
          `Usage: *${prefix}antilink <on|off|set delete|kick|warn|status>*`
      });
    }
  },
};

module.exports = groupCommands;
