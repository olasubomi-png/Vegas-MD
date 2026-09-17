'use strict';
// commands/general.js — General utility commands
const db = require('../lib/database');
const { resolveIsOwner, normalizeJid } = require('../lib/helpers');
const { downloadMediaMessage } = require('baileys');
const { revealViewOnceToChat } = require('../lib/view-once');
const repoInternals = require('./repo')._internals;

// Extract contextInfo from any message type in Baileys v7.
// In Baileys v7 the contextInfo block can live inside ANY message kind
// (extendedTextMessage, imageMessage, videoMessage, etc.).  Checking only
// extendedTextMessage was the root cause of ".vv says not a view-once".
function getCtx(message) {
  const msg = message?.message;
  if (!msg) return null;
  return (
    msg.extendedTextMessage?.contextInfo  ||
    msg.imageMessage?.contextInfo         ||
    msg.videoMessage?.contextInfo         ||
    msg.audioMessage?.contextInfo         ||
    msg.stickerMessage?.contextInfo       ||
    msg.documentMessage?.contextInfo      ||
    null
  );
}

const generalCommands = {

  // ── .vv  ────────────────────────────────────────────────
  // Reveal view-once media IN THE SAME CHAT (not owner DM).
  // You can also react with any emoji on a view-once message to unlock it.
  vv: {
    category:    'owner',
    desc:        'Reveal a view-once image/video/voice in this chat (reply to it)',
    usage:       '.vv',
    aliases:     ['viewonce', 'vv2', 'vv3'],
    permissions: 'all',
    examples:    ['.vv (reply to a view-once message)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx = getCtx(message);
      const quoted = ctx?.quotedMessage;

      if (!quoted) {
        return sock.sendMessage(jid, {
          text:
            `👁️ *View Once*\n\n` +
            `• Reply with *.vv* → unlocks *in this chat*\n` +
            `• React with any emoji → sends to *your private DM*`
        });
      }

      try {
        const revealed = await revealViewOnceToChat(sock, message, jid, {
          allowQuotedMedia: true,
          caption: '👁️ *View once unlocked*',
        });
        if (!revealed) {
          return sock.sendMessage(jid, {
            text:
              `❌ That reply is not a view-once image, video, or voice note.\n\n` +
              `_Reply directly to the view-once message, or react to it with an emoji._`
          });
        }
      } catch (dlErr) {
        console.error('[vv] reveal failed:', dlErr.message);
        await sock.sendMessage(jid, {
          text:
            `❌ Could not unlock the view-once media.\n\n` +
            `_It may have expired or been deleted from WhatsApp's servers._`
        });
      }
    }
  },

  // ── .setpp  — set the BOT's own profile picture ─────────
  // Different from .setgpp (group profile picture, in group.js).
  setpp: {
    category:    'owner',
    desc:        'Set the bot\'s profile picture (reply to an image)',
    usage:       '.setpp',
    aliases:     [],
    permissions: 'owner',
    examples:    ['.setpp (reply to an image)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;

      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, {
          text: `🖼️ *Set Bot Profile Picture*\n\nReply to an *image* with *.setpp* to set it as the bot's profile picture.`
        });
      }

      await sock.sendMessage(jid, { text: `🖼️ Updating bot profile picture...` });

      try {
        const fakeMsg = {
          key:     { remoteJid: jid, id: ctx.stanzaId || message.key.id, participant: ctx.participant, fromMe: false },
          message: quoted
        };
        const buffer = await downloadMediaMessage(fakeMsg, 'buffer', { reuploadRequest: sock.updateMediaMessage });
        const botJid = sock.user?.id || sock.user?.jid || jid;
        await sock.updateProfilePicture(botJid, buffer);
        await sock.sendMessage(jid, { text: `✅ *Bot profile picture updated successfully!*` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed to set profile picture: ${err.message}` });
      }
    }
  },

  jid: {
    category:    'utility',
    desc:        'Show your WhatsApp JID (ID)',
    usage:       '.jid',
    aliases:     ['id', 'myid'],
    permissions: 'all',
    examples:    ['.jid'],
    exec: async (args, sock, jid, isGroup, sender) => {
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 🆔 *JID Info* 〕━━┓\n` +
          `┃  👤 Your JID : ${sender}\n` +
          `┃  💬 Chat JID : ${jid}\n` +
          `┃  🌐 Type     : ${isGroup ? 'Group' : 'Private'}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  runtime: {
    category:    'utility',
    desc:        'Show detailed bot runtime information',
    usage:       '.runtime',
    aliases:     ['info', 'botinfo'],
    permissions: 'all',
    examples:    ['.runtime'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg    = botConfig || global.botConfig || {};
      const mem    = process.memoryUsage();
      const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
      const rssMB  = Math.round(mem.rss       / 1024 / 1024);
      const s      = Math.floor((Date.now() - (global.botStartTime || Date.now())) / 1000);
      const d      = Math.floor(s / 86400);
      const h      = Math.floor((s % 86400) / 3600);
      const m      = Math.floor((s % 3600) / 60);
      const sec    = s % 60;
      const uptime = [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(' ');

      await sock.sendMessage(jid, {
        text:
          `┏━━〔 ⚙️ *Runtime Info* 〕━━┓\n` +
          `┃  🤖 Bot      : ${cfg.name || 'OLASUBOMI-MD'}\n` +
          `┃  🏷️  Version  : v${require('../package.json').version || '3.0.0'}\n` +
          `┃  ⏱️  Uptime   : ${uptime}\n` +
          `┃  💾 Heap     : ${heapMB} MB\n` +
          `┃  📦 RSS      : ${rssMB} MB\n` +
          `┃  🔧 Node.js  : ${process.version}\n` +
          `┃  🖥️  Platform : ${process.platform}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  repo: {
    category:    'utility',
    desc:        'Show the bot GitHub repository link',
    usage:       '.repo',
    aliases:     ['source'],
    permissions: 'all',
    examples:    ['.repo'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      // Keep `.repo` as a backwards-compatible repository-link command, but
      // route subcommands to the new protected workspace implementation.
      if (args.length && typeof repoInternals?.handleRepo === 'function') {
        if (!resolveIsOwner(message, sender, botConfig)) {
          const ownerNum = normalizeJid(botConfig?.ownerNumber || global.botConfig?.ownerNumber || '');
          return sock.sendMessage(jid, {
            text: ownerNum ? '🔒 Repository and coding controls are *owner-only*.' : '🔒 Owner not configured. Set OWNER_NUMBER first.'
          });
        }
        return repoInternals.handleRepo(args, sock, jid, isGroup, sender, message, botConfig);
      }
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 📦 *Bot Repository* 〕━━┓\n` +
          `┃\n` +
          `┃  🤖 OLASUBOMI-MD\n` +
          `┃  Advanced WhatsApp Bot\n` +
          `┃\n` +
          `┃  🔗 https://github.com/olasubomi-png/Vegas-MD\n` +
          `┃\n` +
          `┃  ⭐ Star if you like it!\n` +
          `┃  🍴 Fork to customize!\n` +
          `┃\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  }
};

module.exports = generalCommands;
