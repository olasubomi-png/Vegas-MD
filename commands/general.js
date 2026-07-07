'use strict';
// commands/general.js — General utility commands
const db = require('../lib/database');
const { downloadMediaMessage } = require('baileys');

const REPO_URL = 'https://github.com/olasubomi-png/Vegas-MD';

const generalCommands = {

  pair: {
    category:    'general',
    desc:        'Show how to link WhatsApp with a pairing code',
    usage:       '.pair',
    aliases:     [],
    permissions: 'all',
    examples:    ['.pair'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      await sock.sendMessage(jid, {
        text:
          `┏━━〔 📱 *Pairing Guide* 〕━━┓\n` +
          `┃\n` +
          `┃  To link WhatsApp to this bot:\n` +
          `┃\n` +
          `┃  1️⃣  Open WhatsApp on your phone\n` +
          `┃  2️⃣  Go to *Settings → Linked Devices*\n` +
          `┃  3️⃣  Tap *Link a Device*\n` +
          `┃  4️⃣  Enter the 8-digit pairing code\n` +
          `┃      shown in the bot terminal\n` +
          `┃\n` +
          `┃  🔖 Bot: *${cfg.name || 'OLASUBOMI-MD'}*\n` +
          `┃  👑 Owner: ${cfg.ownerName || 'Olasubomi'}\n` +
          `┃\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
      });
    }
  },

  vv: {
    category:    'general',
    desc:        'Reveal a view-once image or video (reply to it)',
    usage:       '.vv',
    aliases:     ['viewonce'],
    permissions: 'all',
    examples:    ['.vv (reply to a view-once message)'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const ctx    = message.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;

      if (!quoted) {
        return sock.sendMessage(jid, {
          text: `👁️ *View Once Revealer*\n\nReply to a *view-once* image or video with *.vv* to reveal it.`
        });
      }

      const voMsg =
        quoted.viewOnceMessage?.message ||
        quoted.viewOnceMessageV2?.message ||
        quoted.viewOnceMessageV2Extension?.message;

      if (!voMsg) {
        return sock.sendMessage(jid, {
          text: `❌ The replied message is not a view-once message.`
        });
      }

      const imgMsg   = voMsg.imageMessage;
      const videoMsg = voMsg.videoMessage;

      // Build a synthetic Baileys message object that downloadMediaMessage can
      // use to locate, fetch, and decrypt the encrypted CDN media.
      // The key must point to the ORIGINAL message (not the quoting one) so
      // Baileys can request a media re-upload if the CDN URL has expired.
      const fakeMsg = {
        key:     ctx?.stanzaId
          ? { ...message.key, id: ctx.stanzaId, participant: ctx.participant || message.key.participant }
          : message.key,
        message: voMsg
      };

      // Reupload context lets Baileys request a fresh CDN URL from WhatsApp
      // when the original URL has expired (common for older view-once media).
      const reuploaderCtx = { reuploadRequest: sock.updateMediaMessage };

      try {
        if (imgMsg) {
          // Must decrypt via downloadMediaMessage — imgMsg.url is the raw
          // encrypted CDN URL and cannot be passed directly to sock.sendMessage.
          const buffer = await downloadMediaMessage(fakeMsg, 'buffer', reuploaderCtx);
          await sock.sendMessage(jid, {
            image:    buffer,
            caption:  `👁️ *Revealed view-once image*`,
            mimetype: imgMsg.mimetype
          });
        } else if (videoMsg) {
          const buffer = await downloadMediaMessage(fakeMsg, 'buffer', reuploaderCtx);
          await sock.sendMessage(jid, {
            video:    buffer,
            caption:  `👁️ *Revealed view-once video*`,
            mimetype: videoMsg.mimetype
          });
        } else {
          await sock.sendMessage(jid, { text: `❌ Could not reveal this view-once message.` });
        }
      } catch (dlErr) {
        console.error('[vv] downloadMediaMessage failed:', dlErr.message);
        await sock.sendMessage(jid, {
          text: `❌ Could not download the view-once media.\n\n_The media may have expired or been deleted from WhatsApp's servers._`
        });
      }
    }
  },

  jid: {
    category:    'general',
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
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
        isGroup
      });
    }
  },

  runtime: {
    category:    'general',
    desc:        'Show detailed bot runtime information',
    usage:       '.runtime',
    aliases:     ['info', 'botinfo'],
    permissions: 'all',
    examples:    ['.runtime'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg   = botConfig || global.botConfig || {};
      const mem   = process.memoryUsage();
      const heapMB = Math.round(mem.heapUsed  / 1024 / 1024);
      const rssMB  = Math.round(mem.rss        / 1024 / 1024);
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
    category:    'general',
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
          `┃  🔗 ${REPO_URL}\n` +
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
