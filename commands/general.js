'use strict';
// commands/general.js — General utility commands
const db = require('../lib/database');
const { downloadMediaMessage } = require('baileys');

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

  // ── .pair  ──────────────────────────────────────────────
  // Generates a real WhatsApp pairing code for the given number.
  // Usage:  .pair <phone number with country code>
  // e.g.:   .pair 2349112097911
  pair: {
    category:    'owner',
    desc:        'Add a new WhatsApp number as a secondary bot session',
    usage:       '.pair <number>',
    aliases:     [],
    permissions: 'owner',
    examples:    ['.pair 2349112097911'],
    exec: async (args, sock, jid) => {
      const raw    = args[0] || '';
      const number = raw.replace(/\D/g, '');

      if (!number) {
        return sock.sendMessage(jid, {
          text:
            `📱 *Multi-Session Pairing*\n\n` +
            `Usage: *.pair <number>*\n\n` +
            `Example:\n  *.pair 2349112097911*\n\n` +
            `_Include country code, no + or spaces._\n` +
            `_The pairing code will be sent here._`
        });
      }

      await sock.sendMessage(jid, {
        text: `⏳ Starting new session for *+${number}*...\nThe pairing code will appear here shortly.`
      });

      try {
        const sessionManager = require('../lib/sessionManager');
        const result = await sessionManager.addSession(number, { notifyJid: jid, primarySock: sock });

        if (result.alreadyConnected) {
          await sock.sendMessage(jid, {
            text: `✅ *+${number}* is already connected as a secondary session.`
          });
        }
        // Pairing code is sent automatically by sessionManager when the QR fires
      } catch (err) {
        await sock.sendMessage(jid, {
          text: `❌ *Failed to start session for +${number}*\n\n${err.message}`
        });
      }
    }
  },

  // ── .vv  ────────────────────────────────────────────────
  // Reveals a view-once image or video by downloading + re-sending it.
  //
  // ROOT CAUSE OF "not a view-once message" BUG:
  //   1. contextInfo only checked in extendedTextMessage — but the user's
  //      reply might be any message type (image, video, sticker …).
  //   2. In Baileys v7, the viewOnce wrapper is stripped in quotedMessage
  //      for some WhatsApp clients, exposing imageMessage/videoMessage directly.
  //   Both cases are now handled.
  vv: {
    category:    'owner',
    desc:        'Reveal a view-once image or video (reply to it)',
    usage:       '.vv',
    aliases:     ['viewonce', 'vv2', 'vv3'],
    permissions: 'all',
    examples:    ['.vv (reply to a view-once message)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      // Step 1: get contextInfo regardless of message type
      const ctx    = getCtx(message);
      const quoted = ctx?.quotedMessage;

      if (!quoted) {
        return sock.sendMessage(jid, {
          text: `👁️ *View Once Revealer*\n\nReply to a *view-once* image or video with *.vv* to reveal it.`
        });
      }

      // Step 2: unwrap viewOnce container (V1 / V2 / V2Extension)
      const voMsg =
        quoted.viewOnceMessage?.message          ||
        quoted.viewOnceMessageV2?.message         ||
        quoted.viewOnceMessageV2Extension?.message;

      // Step 3: in some Baileys v7 builds the wrapper is already stripped —
      //         the inner imageMessage/videoMessage appears at the top level.
      const imgMsg   = voMsg?.imageMessage   || quoted.imageMessage;
      const videoMsg = voMsg?.videoMessage   || quoted.videoMessage;

      if (!imgMsg && !videoMsg) {
        return sock.sendMessage(jid, {
          text: `❌ The replied message doesn't contain a view-once image or video.\n\n_Make sure you are replying directly to the view-once message._`
        });
      }

      // Step 4: build the synthetic Baileys message for downloadMediaMessage.
      //   Use ctx.stanzaId (the original message ID) so Baileys can re-request
      //   a fresh CDN URL when the original has expired.
      const fakeMsg = {
        key: {
          remoteJid:   jid,
          id:          ctx.stanzaId || message.key.id,
          participant: ctx.participant || message.key.participant,
          fromMe:      false
        },
        message: voMsg || quoted
      };

      const reuploaderCtx = { reuploadRequest: sock.updateMediaMessage };

      try {
        if (imgMsg) {
          const buffer = await downloadMediaMessage(fakeMsg, 'buffer', reuploaderCtx);
          await sock.sendMessage(jid, {
            image:    buffer,
            caption:  `👁️ *Revealed view-once image*`,
            mimetype: imgMsg.mimetype || 'image/jpeg'
          });
        } else {
          const buffer = await downloadMediaMessage(fakeMsg, 'buffer', reuploaderCtx);
          await sock.sendMessage(jid, {
            video:    buffer,
            caption:  `👁️ *Revealed view-once video*`,
            mimetype: videoMsg.mimetype || 'video/mp4'
          });
        }
      } catch (dlErr) {
        console.error('[vv] downloadMediaMessage failed:', dlErr.message);
        await sock.sendMessage(jid, {
          text: `❌ Could not download the view-once media.\n\n_The media may have expired or been deleted from WhatsApp's servers._`
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
    aliases:     ['github', 'source'],
    permissions: 'all',
    examples:    ['.repo'],
    exec: async (args, sock, jid) => {
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
