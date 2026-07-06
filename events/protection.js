// Anti-delete · Anti-link · Anti-spam · Anti-view-once

const db = require('../lib/database');
const { hasURL, normalizeJid, isGroupAdmin } = require('../lib/helpers');

// ─── In-memory stores ─────────────────────────────────────
// message cache for anti-delete: msgId → { jid, sender, content }
const msgCache = new Map();
const MAX_CACHE = 1000;

// spam tracker: senderJid → [timestamps]
const spamMap = new Map();
const SPAM_WINDOW_MS = 5000;
const SPAM_MAX_MSGS = 6;

function cacheMessage(message) {
  const id = message.key?.id;
  if (!id) return;
  const jid = message.key?.remoteJid;
  const sender = message.key?.participant || jid;
  const text =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    '[media]';

  msgCache.set(id, { jid, sender, text, ts: Date.now() });

  // Trim oldest if over limit
  if (msgCache.size > MAX_CACHE) {
    const oldest = [...msgCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) msgCache.delete(oldest[0]);
  }
}

// ─── Anti-delete ──────────────────────────────────────────
async function handleAntiDelete(sock, deletedKeys) {
  for (const key of deletedKeys) {
    const msgId = key.id;
    const cached = msgCache.get(msgId);
    if (!cached) continue;

    const groupJid = key.remoteJid;
    if (!groupJid?.endsWith('@g.us')) continue;

    const settings = db.getGroup(groupJid);
    if (!settings.antiDelete) continue;

    try {
      const senderNum = cached.sender.split('@')[0];
      await sock.sendMessage(groupJid, {
        text: `🗑️ *Anti-Delete Alert*\n\n@${senderNum} deleted a message:\n\n"${cached.text}"`,
        mentions: [cached.sender]
      });
    } catch (err) {
      console.error('Anti-delete error:', err.message);
    }

    msgCache.delete(msgId);
  }
}

// ─── Anti-link ────────────────────────────────────────────
async function handleAntiLink(sock, message) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return false;

  const settings = db.getGroup(jid);
  if (!settings.antiLink) return false;

  const text =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text || '';

  if (!hasURL(text)) return false;

  const sender = message.key?.participant || jid;

  // Admins and bot owner are exempt
  const ownerNum = normalizeJid(global.botConfig?.ownerNumber || '');
  const senderNum = normalizeJid(sender);
  if (ownerNum && senderNum === ownerNum) return false;

  const senderIsAdmin = await isGroupAdmin(sock, jid, sender);
  if (senderIsAdmin) return false;

  try {
    // Delete the message
    await sock.sendMessage(jid, { delete: message.key });
    // Warn
    const count = db.addWarning(sender);
    const maxWarn = settings.maxWarnings || 3;
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
    console.error('Anti-link error:', err.message);
  }
  return true;
}

// ─── Anti-spam ────────────────────────────────────────────
async function handleAntiSpam(sock, message) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return false;

  const settings = db.getGroup(jid);
  if (!settings.antiSpam) return false;

  const sender = message.key?.participant || jid;

  // Exempt owner and admins
  const ownerNum = normalizeJid(global.botConfig?.ownerNumber || '');
  if (normalizeJid(sender) === ownerNum) return false;

  const now = Date.now();
  const times = (spamMap.get(sender) || []).filter(t => now - t < SPAM_WINDOW_MS);
  times.push(now);
  spamMap.set(sender, times);

  if (times.length < SPAM_MAX_MSGS) return false;

  // Spamming detected
  const senderIsAdmin = await isGroupAdmin(sock, jid, sender);
  if (senderIsAdmin) return false;

  spamMap.set(sender, []); // Reset

  try {
    const count = db.addWarning(sender);
    const maxWarn = settings.maxWarnings || 3;
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
    console.error('Anti-spam error:', err.message);
  }
  return true;
}

// ─── Anti-view-once ───────────────────────────────────────
const { downloadMediaMessage } = require('baileys');

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

  const sender = message.key?.participant || jid;
  const senderName = sender.split('@')[0];

  try {
    // Build a minimal message object that downloadMediaMessage can handle
    const fakeMsg = {
      key: message.key,
      message: viewOnceMsg
    };

    if (viewOnceMsg.imageMessage) {
      const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
      await sock.sendMessage(jid, {
        image: buffer,
        caption: `👁️ *Anti-View-Once*\nOriginally sent by @${senderName}`,
        mentions: [sender]
      });
    } else if (viewOnceMsg.videoMessage) {
      const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
      await sock.sendMessage(jid, {
        video: buffer,
        caption: `👁️ *Anti-View-Once*\nOriginally sent by @${senderName}`,
        mentions: [sender]
      });
    } else {
      // Unknown media type — just notify
      await sock.sendMessage(jid, {
        text: `👁️ *Anti-View-Once*\n@${senderName} sent a view-once message (unsupported media type).`,
        mentions: [sender]
      });
    }
  } catch (err) {
    console.error('Anti-view-once error:', err.message);
  }
  return true;
}

// ─── Auto-react ───────────────────────────────────────────
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
  } catch {
    // Ignore react errors
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
