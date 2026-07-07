// Anti-delete · Anti-link · Anti-spam · Anti-view-once · Auto-react
// All handlers receive `sock` as an explicit parameter.
// handleAntiLink and handleAntiSpam also receive `botConfig`
// so they never touch global.botConfig.

const db = require('../lib/database');
const { hasURL, normalizeJid, isGroupAdmin, resolveIsOwner } = require('../lib/helpers');
const { downloadMediaMessage } = require('baileys');

// ─── In-memory stores ─────────────────────────────────────
const msgCache  = new Map();  // msgId → { jid, sender, text, ts }
const MAX_CACHE = 1000;

const spamMap        = new Map();  // senderJid → [timestamps]
const SPAM_WINDOW_MS = 5_000;
const SPAM_MAX_MSGS  = 6;

// ─── cacheMessage ─────────────────────────────────────────
function cacheMessage(message) {
  const id = message.key?.id;
  if (!id) return;

  const jid    = message.key?.remoteJid;
  const sender = message.key?.participant || jid;
  const msg    = message.message || {};

  // Unwrap ephemeral / disappearing wrappers
  const inner =
    msg.ephemeralMessage?.message     ||
    msg.viewOnceMessage?.message      ||
    msg.viewOnceMessageV2?.message    ||
    msg.viewOnceMessageV2Extension?.message ||
    msg;

  const text =
    inner.conversation                           ||
    inner.extendedTextMessage?.text              ||
    inner.imageMessage?.caption                  ||
    inner.videoMessage?.caption                  ||
    inner.documentMessage?.caption               ||
    inner.buttonsResponseMessage?.selectedDisplayText ||
    inner.listResponseMessage?.title             ||
    inner.templateButtonReplyMessage?.selectedDisplayText ||
    (inner.stickerMessage   ? '[sticker]'  : null) ||
    (inner.audioMessage     ? '[audio]'    : null) ||
    (inner.videoMessage     ? '[video]'    : null) ||
    (inner.imageMessage     ? '[image]'    : null) ||
    (inner.documentMessage  ? '[document]' : null) ||
    '[message]';

  msgCache.set(id, { jid, sender, text, ts: Date.now() });

  if (msgCache.size > MAX_CACHE) {
    // Evict oldest entry
    const oldest = [...msgCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) msgCache.delete(oldest[0]);
  }
}

// ─── handleAntiDelete ─────────────────────────────────────
async function handleAntiDelete(sock, deletedKeys) {
  for (const key of deletedKeys) {
    const cached = msgCache.get(key.id);
    if (!cached) continue;

    const chatJid   = key.remoteJid || cached.jid;
    const isGroup   = chatJid?.endsWith('@g.us');

    // Groups: respect per-group antiDelete toggle
    if (isGroup) {
      const settings = db.getGroup(chatJid);
      if (!settings.antiDelete) continue;
    } else {
      // DMs: use global antiDelete setting
      const globalAntiDelete = db.getSetting('antiDelete', null);
      if (!globalAntiDelete) continue;
    }

    try {
      const senderNum = cached.sender.split('@')[0];
      if (isGroup) {
        await sock.sendMessage(chatJid, {
          text: `🗑️ *Anti-Delete Alert*\n\n@${senderNum} deleted a message:\n\n"${cached.text}"`,
          mentions: [cached.sender]
        });
      } else {
        // In a DM the sender IS the chat — just reply
        await sock.sendMessage(chatJid, {
          text: `🗑️ *Anti-Delete Alert*\n\nYou deleted a message:\n\n"${cached.text}"`
        });
      }
    } catch (err) {
      console.error('[antiDelete]', err.message);
    }

    msgCache.delete(key.id);
  }
}

// ─── handleAntiLink ───────────────────────────────────────
// botConfig passed explicitly — no global reads
async function handleAntiLink(sock, message, botConfig) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return false;

  const settings = db.getGroup(jid);
  if (!settings.antiLink) return false;

  const text =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text || '';

  if (!hasURL(text)) return false;

  const sender = message.key?.participant || jid;

  // Owner (fromMe or matching OWNER_NUMBER) is never penalised by anti-link
  if (resolveIsOwner(message, sender, botConfig)) return false;

  const senderIsAdmin = await isGroupAdmin(sock, jid, sender);
  if (senderIsAdmin) return false;

  try {
    await sock.sendMessage(jid, { delete: message.key });

    const count      = db.addWarning(sender);
    const maxWarn    = settings.maxWarnings || 3;
    const senderName = sender.split('@')[0];

    await sock.sendMessage(jid, {
      text: `🔗 *Anti-Link*\n\n@${senderName} sent a link and it was removed.\n⚠️ Warning: ${count}/${maxWarn}`,
      mentions: [sender]
    });

    if (count >= maxWarn) {
      await sock.groupParticipantsUpdate(jid, [sender], 'remove');
      await sock.sendMessage(jid, {
        text: `🚫 @${senderName} was kicked for reaching the warning limit.`,
        mentions: [sender]
      });
      db.clearWarnings(sender);
    }
  } catch (err) {
    console.error('[antiLink]', err.message);
  }
  return true;
}

// ─── handleAntiSpam ───────────────────────────────────────
// botConfig passed explicitly — no global reads
async function handleAntiSpam(sock, message, botConfig) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return false;

  const settings = db.getGroup(jid);
  if (!settings.antiSpam) return false;

  const sender = message.key?.participant || jid;

  // Owner (fromMe or matching OWNER_NUMBER) is never penalised by anti-spam
  if (resolveIsOwner(message, sender, botConfig)) return false;

  const now   = Date.now();
  const times = (spamMap.get(sender) || []).filter(t => now - t < SPAM_WINDOW_MS);
  times.push(now);
  spamMap.set(sender, times);

  if (times.length < SPAM_MAX_MSGS) return false;

  const senderIsAdmin = await isGroupAdmin(sock, jid, sender);
  if (senderIsAdmin) { spamMap.set(sender, []); return false; }

  spamMap.set(sender, []); // Reset before acting

  try {
    const count      = db.addWarning(sender);
    const maxWarn    = settings.maxWarnings || 3;
    const senderName = sender.split('@')[0];

    await sock.sendMessage(jid, {
      text: `🚨 *Anti-Spam*\n\n@${senderName} is sending messages too fast!\n⚠️ Warning: ${count}/${maxWarn}`,
      mentions: [sender]
    });

    if (count >= maxWarn) {
      await sock.groupParticipantsUpdate(jid, [sender], 'remove');
      await sock.sendMessage(jid, {
        text: `🚫 @${senderName} was kicked for spamming.`,
        mentions: [sender]
      });
      db.clearWarnings(sender);
    }
  } catch (err) {
    console.error('[antiSpam]', err.message);
  }
  return true;
}

// ─── handleAntiViewOnce ───────────────────────────────────
async function handleAntiViewOnce(sock, message) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return false;

  const settings = db.getGroup(jid);
  if (!settings.antiViewOnce) return false;

  const msg = message.message;
  const viewOnceMsg =
    msg?.viewOnceMessage?.message ||
    msg?.viewOnceMessageV2?.message ||
    msg?.viewOnceMessageV2Extension?.message;

  if (!viewOnceMsg) return false;

  const sender     = message.key?.participant || jid;
  const senderName = sender.split('@')[0];

  try {
    const fakeMsg = { key: message.key, message: viewOnceMsg };

    if (viewOnceMsg.imageMessage) {
      const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
      await sock.sendMessage(jid, {
        image:    buffer,
        caption:  `👁️ *Anti-View-Once*\nOriginally sent by @${senderName}`,
        mentions: [sender]
      });
    } else if (viewOnceMsg.videoMessage) {
      const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
      await sock.sendMessage(jid, {
        video:    buffer,
        caption:  `👁️ *Anti-View-Once*\nOriginally sent by @${senderName}`,
        mentions: [sender]
      });
    } else {
      await sock.sendMessage(jid, {
        text:     `👁️ *Anti-View-Once*\n@${senderName} sent a view-once message (unsupported media type).`,
        mentions: [sender]
      });
    }
  } catch (err) {
    console.error('[antiViewOnce]', err.message);
  }
  return true;
}

// ─── handleAutoReact ──────────────────────────────────────
const REACT_EMOJIS = ['❤️', '🔥', '😂', '👍', '🎉', '💯', '✨', '🙌', '😍', '🤩'];

async function handleAutoReact(sock, message) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return;

  const settings = db.getGroup(jid);
  if (!settings.autoReact) return;

  const emoji = REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
  try {
    await sock.sendMessage(jid, {
      react: { text: emoji, key: message.key }
    });
  } catch (_) {
    // Ignore react errors silently
  }
}

module.exports = {
  cacheMessage,
  handleAntiDelete,
  handleAntiLink,
  handleAntiSpam,
  handleAntiViewOnce,
  handleAutoReact
};
