'use strict';
// commands/group.js — Group management + protection toggles
const { downloadMediaMessage } = require('baileys');
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

  setgpp: {
    category: 'group', desc: 'Change the group profile picture (reply to an image)',
    usage: '.setgpp', aliases: [], permissions: 'admin',
    examples: ['.setgpp (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: '🖼️ Reply to an *image* with *.setgpp* to set it as the group picture.' });
      }
      await sock.sendMessage(jid, { text: `🖼️ Setting group profile picture...` });
      try {
        const ctx = message.message?.extendedTextMessage?.contextInfo;
        const fake = {
          key: {
            remoteJid:   jid,
            id:          ctx?.stanzaId || message.key.id,
            participant: ctx?.participant || message.key.participant,
            fromMe:      false
          },
          message: quoted
        };
        const buf = await downloadMediaMessage(fake, 'buffer', { reuploadRequest: sock.updateMediaMessage });
        await sock.updateProfilePicture(jid, buf);
        await sock.sendMessage(jid, { text: `✅ *Group profile picture updated!*` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed to set group picture: ${err.message}\n\n_Make sure the bot is an admin._` });
      }
    }
  },

  addall: {
    category: 'group', desc: 'Add all members from this group to another group in the same community',
    usage: '.addall <target-group-JID>', aliases: [], permissions: 'admin',
    examples: ['.addall 1234567890-1234567890@g.us'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      if (!await requireAdmin(sock, jid, isGroup, sender, message, botConfig)) return;
      const rawTarget = (args[0] || '').trim();
      if (!rawTarget) {
        return sock.sendMessage(jid, {
          text:
            `➕ *Add All (Community)*\n\n` +
            `Adds every member of *this* group to another group that shares the same community.\n\n` +
            `Usage: *.addall <target-group-JID>*\n` +
            `Example: *.addall 12345678901234-1234567890@g.us*\n\n` +
            `_Use .ginfo in the target group to get its JID._`
        });
      }
      const targetJid = rawTarget.includes('@g.us') ? rawTarget : `${rawTarget}@g.us`;
      if (targetJid === jid) {
        return sock.sendMessage(jid, { text: '❌ Target group cannot be the same as this group.' });
      }
      try {
        await sock.sendMessage(jid, { text: `🔍 Checking community membership...` });
        const [srcMeta, tgtMeta] = await Promise.all([
          sock.groupMetadata(jid),
          sock.groupMetadata(targetJid).catch(() => null)
        ]);
        if (!tgtMeta) {
          return sock.sendMessage(jid, { text: `❌ Cannot access the target group. Make sure the bot is a member there.\n\nJID: ${targetJid}` });
        }
        // Verify both groups belong to the same community (linkedParent)
        const srcCommunity = srcMeta.linkedParent;
        const tgtCommunity = tgtMeta.linkedParent;
        if (!srcCommunity || !tgtCommunity || srcCommunity !== tgtCommunity) {
          return sock.sendMessage(jid, {
            text:
              `❌ Both groups must be in the *same community*.\n\n` +
              `This group's community : ${srcCommunity || 'none'}\n` +
              `Target group's community: ${tgtCommunity || 'none'}`
          });
        }
        // Collect members not already in target group
        const tgtIds = new Set(tgtMeta.participants.map(p => p.id));
        const toAdd  = srcMeta.participants.map(p => p.id).filter(id => !tgtIds.has(id));
        if (!toAdd.length) {
          return sock.sendMessage(jid, { text: `✅ All ${srcMeta.participants.length} members are already in *${tgtMeta.subject}*.` });
        }
        await sock.sendMessage(jid, {
          text: `➕ Adding *${toAdd.length}* member(s) to *${tgtMeta.subject}*...\n_(Already there: ${tgtIds.size})_`
        });
        // Add in batches of 5 — WhatsApp's per-request add limit
        let added = 0, failed = 0;
        for (let i = 0; i < toAdd.length; i += 5) {
          const batch = toAdd.slice(i, i + 5);
          try {
            await sock.groupParticipantsUpdate(targetJid, batch, 'add');
            added += batch.length;
          } catch (_) {
            failed += batch.length;
          }
          // Small delay to avoid hitting WhatsApp rate limits
          if (i + 5 < toAdd.length) await new Promise(r => setTimeout(r, 1500));
        }
        await sock.sendMessage(jid, {
          text:
            `✅ *Add All Complete!*\n\n` +
            `📍 Target group : *${tgtMeta.subject}*\n` +
            `➕ Added        : ${added}\n` +
            `❌ Failed       : ${failed}\n` +
            `⏩ Already there: ${tgtIds.size}`
        });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
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
