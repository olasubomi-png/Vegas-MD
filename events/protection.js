'use strict';
// events/protection.js
// Anti-delete · Anti-link (delete/kick/warn) · Anti-spam · Anti-view-once · Auto-react
// All handlers receive sock + botConfig as explicit parameters — no global reads.

const db = require('../lib/database');
const { hasURL, normalizeJid, isGroupAdmin, resolveIsOwner } = require('../lib/helpers');
const { downloadMediaMessage } = require('baileys');

// ─── In-memory message cache (for anti-delete) ────────────
// Keyed by message ID.  Stores enough info to re-post deleted messages.
const msgCache  = new Map();  // id → { jid, sender, text, mediaType, ts }
const MAX_CACHE = 2000;

// ─── Anti-spam rate tracking ──────────────────────────────
const spamMap        = new Map();  // senderJid → [timestamps]
const SPAM_WINDOW_MS = 5_000;
const SPAM_MAX_MSGS  = 6;

// ─────────────────────────────────────────────────────────
// cacheMessage — called on every incoming message so we can
// repost it if the sender deletes it later.
// ─────────────────────────────────────────────────────────
function cacheMessage(message) {
  const id = message.key?.id;
  if (!id) return;

  // Skip protocol/revoke messages — they are not real content
  if (message.message?.protocolMessage) return;

  const jid    = message.key?.remoteJid;
  const sender = message.key?.participant || jid;

  const msg = message.message || {};

  // Unwrap ephemeral / disappearing wrappers so we cache the real content
  const inner =
    msg.ephemeralMessage?.message              ||
    msg.ephemeralMessageV2Extension?.message   ||
    msg.viewOnceMessage?.message               ||
    msg.viewOnceMessageV2?.message             ||
    msg.viewOnceMessageV2Extension?.message    ||
    msg;

  // Detect media type against the UNWRAPPED inner payload
  // so ephemeral/disappearing messages are cached correctly.
  let text      = '';
  let mediaType = null; // 'image' | 'video' | 'audio' | 'sticker' | 'document' | null

  if      (inner.conversation)                       text = inner.conversation;
  else if (inner.extendedTextMessage?.text)           text = inner.extendedTextMessage.text;
  else if (inner.imageMessage)                        { mediaType = 'image';    text = inner.imageMessage.caption   || ''; }
  else if (inner.videoMessage)                        { mediaType = 'video';    text = inner.videoMessage.caption   || ''; }
  else if (inner.audioMessage)                        { mediaType = 'audio';    text = '[Voice/Audio]'; }
  else if (inner.stickerMessage)                      { mediaType = 'sticker';  text = '[Sticker]'; }
  else if (inner.documentMessage)                     { mediaType = 'document'; text = inner.documentMessage.fileName || '[Document]'; }
  else                                                text = '[Media]';

  // Store the raw message node that corresponds to inner for download.
  // If inner === msg the raw message is the original; otherwise we need
  // a synthetic node pointing at the unwrapped content so that
  // downloadMediaMessage receives the right payload.
  const rawNode = (inner === msg)
    ? message
    : { key: message.key, message: inner };

  msgCache.set(id, { jid, sender, text, mediaType, rawMessage: rawNode, ts: Date.now() });

  // Evict oldest entries when cache is full
  if (msgCache.size > MAX_CACHE) {
    const oldest = [...msgCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) msgCache.delete(oldest[0]);
  }
}

// ─────────────────────────────────────────────────────────
// handleAntiDelete — called when:
//   (a) events['messages.delete'] fires (bulk clear)
//   (b) a REVOKE protocolMessage arrives in messages.upsert
//       (the normal "delete for everyone" path)
// ─────────────────────────────────────────────────────────
async function handleAntiDelete(sock, deletedKeys) {
  for (const key of deletedKeys) {
    const msgId = typeof key === 'string' ? key : key.id;
    if (!msgId) continue;

    const cached = msgCache.get(msgId);
    if (!cached) continue;

    // Support both groups and DMs
    const chatJid = (typeof key === 'object' ? key.remoteJid : null) || cached.jid;
    if (!chatJid) continue;
    const isGroup = chatJid.endsWith('@g.us');

    // Groups: respect per-group antiDelete toggle
    if (isGroup) {
      const settings = db.getGroup(chatJid);
      if (!settings.antiDelete) continue;
    } else {
      // DMs: use global antiDelete setting
      const globalAntiDelete = db.getSetting('antiDelete', null);
      if (!globalAntiDelete) continue;
    }

    const senderNum = cached.sender.split('@')[0];

    try {
      if (isGroup) {
        // Groups: try to re-post the deleted media if possible
        if (cached.mediaType && cached.rawMessage) {
          try {
            const buffer = await downloadMediaMessage(cached.rawMessage, 'buffer', {});
            if (cached.mediaType === 'image') {
              await sock.sendMessage(chatJid, {
                image:    buffer,
                caption:  `🗑️ *Anti-Delete* — @${senderNum} deleted:\n${cached.text}`,
                mentions: [cached.sender]
              });
            } else if (cached.mediaType === 'video') {
              await sock.sendMessage(chatJid, {
                video:    buffer,
                caption:  `🗑️ *Anti-Delete* — @${senderNum} deleted:\n${cached.text}`,
                mentions: [cached.sender]
              });
            } else if (cached.mediaType === 'audio') {
              await sock.sendMessage(chatJid, {
                audio:    buffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt:      true,
              });
              await sock.sendMessage(chatJid, {
                text:     `🗑️ *Anti-Delete* — @${senderNum} deleted a voice note`,
                mentions: [cached.sender]
              });
            } else if (cached.mediaType === 'sticker') {
              await sock.sendMessage(chatJid, { sticker: buffer });
              await sock.sendMessage(chatJid, {
                text:     `🗑️ *Anti-Delete* — @${senderNum} deleted a sticker`,
                mentions: [cached.sender]
              });
            } else {
              await sock.sendMessage(chatJid, {
                text:     `🗑️ *Anti-Delete Alert*\n\n@${senderNum} deleted: _${cached.text}_`,
                mentions: [cached.sender]
              });
            }
          } catch (_mediaErr) {
            await sock.sendMessage(chatJid, {
              text:     `🗑️ *Anti-Delete Alert*\n\n@${senderNum} deleted a ${cached.mediaType} message.`,
              mentions: [cached.sender]
            });
          }
        } else {
          // Plain text in group
          await sock.sendMessage(chatJid, {
            text:     `🗑️ *Anti-Delete Alert*\n\n@${senderNum} deleted:\n\n"${cached.text}"`,
            mentions: [cached.sender]
          });
        }
      } else {
        // DM — simple text notification (media re-post not needed in DMs)
        await sock.sendMessage(chatJid, {
          text: `🗑️ *Anti-Delete Alert*\n\nYou deleted a message:\n\n"${cached.text}"`
        });
      }
    } catch (err) {
      console.error('[antiDelete]', err.message);
    }

    msgCache.delete(msgId);
  }
}

// ─────────────────────────────────────────────────────────
// handleAntiDeleteRevocation — called from messages.upsert
// when a protocolMessage with type REVOKE (0) arrives.
// This is the standard "delete for everyone" path.
// ─────────────────────────────────────────────────────────
async function handleAntiDeleteRevocation(sock, message) {
  const proto = message.message?.protocolMessage;
  if (!proto || proto.type !== 0) return; // 0 = REVOKE

  // Don't re-post the bot's own deletions
  if (message.key?.fromMe) return;

  const revokedKey = proto.key;
  if (!revokedKey?.id) return;

  await handleAntiDelete(sock, [{ id: revokedKey.id, remoteJid: message.key?.remoteJid }]);
}

// ─────────────────────────────────────────────────────────
// handleAntiLink — delete links; action = delete | kick | warn
// botConfig passed explicitly — no global reads.
// ─────────────────────────────────────────────────────────
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

  // Owner and admins are never penalised
  if (resolveIsOwner(message, sender, botConfig)) return false;
  const senderIsAdmin = await isGroupAdmin(sock, jid, sender);
  if (senderIsAdmin) return false;

  const action     = settings.antiLinkAction || 'delete'; // 'delete' | 'kick' | 'warn'
  const maxWarn    = settings.maxWarnings || 3;
  const senderName = sender.split('@')[0];

  try {
    // Always delete the offending message first
    await sock.sendMessage(jid, { delete: message.key });

    if (action === 'kick') {
      // Immediate removal — no warning counter touched
      await sock.groupParticipantsUpdate(jid, [sender], 'remove');
      await sock.sendMessage(jid, {
        text:     `🔗 *Anti-Link*\n\n@${senderName} sent a link and was *kicked*.`,
        mentions: [sender]
      });

    } else if (action === 'warn') {
      // Only increment warnings in warn mode — prevents hidden buildup
      // when the action is later changed to 'delete' or 'kick'
      const count = db.addWarning(sender);
      await sock.sendMessage(jid, {
        text:     `🔗 *Anti-Link*\n\n@${senderName} sent a link.\n⚠️ Warning: ${count}/${maxWarn}`,
        mentions: [sender]
      });
      if (count >= maxWarn) {
        await sock.groupParticipantsUpdate(jid, [sender], 'remove');
        await sock.sendMessage(jid, {
          text:     `🚫 @${senderName} was *kicked* after reaching ${maxWarn} warnings.`,
          mentions: [sender]
        });
        db.clearWarnings(sender);
      }

    } else {
      // 'delete' — remove message and notify; no warning recorded
      await sock.sendMessage(jid, {
        text:     `🔗 *Anti-Link*\n\n@${senderName} sent a link and it was removed.`,
        mentions: [sender]
      });
    }
  } catch (err) {
    console.error('[antiLink]', err.message);
  }
  return true;
}

// ─────────────────────────────────────────────────────────
// handleAntiSpam
// ─────────────────────────────────────────────────────────
async function handleAntiSpam(sock, message, botConfig) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return false;

  const settings = db.getGroup(jid);
  if (!settings.antiSpam) return false;

  const sender = message.key?.participant || jid;
  if (resolveIsOwner(message, sender, botConfig)) return false;

  const now   = Date.now();
  const times = (spamMap.get(sender) || []).filter(t => now - t < SPAM_WINDOW_MS);
  times.push(now);
  spamMap.set(sender, times);

  if (times.length < SPAM_MAX_MSGS) return false;

  const senderIsAdmin = await isGroupAdmin(sock, jid, sender);
  if (senderIsAdmin) { spamMap.set(sender, []); return false; }

  spamMap.set(sender, []);

  try {
    const count      = db.addWarning(sender);
    const maxWarn    = settings.maxWarnings || 3;
    const senderName = sender.split('@')[0];

    await sock.sendMessage(jid, {
      text:     `🚨 *Anti-Spam*\n\n@${senderName} is sending messages too fast!\n⚠️ Warning: ${count}/${maxWarn}`,
      mentions: [sender]
    });

    if (count >= maxWarn) {
      await sock.groupParticipantsUpdate(jid, [sender], 'remove');
      await sock.sendMessage(jid, {
        text:     `🚫 @${senderName} was kicked for spamming.`,
        mentions: [sender]
      });
      db.clearWarnings(sender);
    }
  } catch (err) {
    console.error('[antiSpam]', err.message);
  }
  return true;
}

// ─────────────────────────────────────────────────────────
// handleAntiViewOnce
// ─────────────────────────────────────────────────────────
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
        text:     `👁️ *Anti-View-Once*\n@${senderName} sent a view-once message (unsupported type).`,
        mentions: [sender]
      });
    }
  } catch (err) {
    console.error('[antiViewOnce]', err.message);
  }
  return true;
}

// ─────────────────────────────────────────────────────────
// handleAutoReact
// ─────────────────────────────────────────────────────────
const REACT_EMOJIS = ['❤️', '🔥', '😂', '👍', '🎉', '💯', '✨', '🙌', '😍', '🤩'];

async function handleAutoReact(sock, message) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return;

  const settings = db.getGroup(jid);
  if (!settings.autoReact) return;

  const emoji = REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
  try {
    await sock.sendMessage(jid, { react: { text: emoji, key: message.key } });
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────
// handleAntiCall — called from the 'call' event
// Rejects (and optionally blocks) all incoming voice/video calls.
// Settings stored in global bot settings (not per-group):
//   antiCall      : boolean
//   antiVideoCall : boolean
//   antiCallMode  : 'cut' | 'block'
// ─────────────────────────────────────────────────────────
async function handleAntiCall(sock, calls) {
  const antiVoice  = db.getSetting('antiCall',      false);
  const antiVideo  = db.getSetting('antiVideoCall',  false);
  const callMode   = db.getSetting('antiCallMode',  'cut');

  if (!antiVoice && !antiVideo) return;

  for (const call of calls) {
    if (call.status !== 'offer') continue; // only intercept incoming offers

    const isVideo = call.isVideo === true;

    // Check if this call type is protected
    if (isVideo  && !antiVideo) continue;
    if (!isVideo && !antiVoice) continue;

    const caller = call.from;

    try {
      // Always reject the call
      await sock.rejectCall(call.id, caller);
      console.log(`[antiCall] Rejected ${isVideo ? 'video' : 'voice'} call from ${caller}`);

      // Block mode — also block the caller
      if (callMode === 'block') {
        await sock.updateBlockStatus(caller, 'block');
        console.log(`[antiCall] Blocked ${caller}`);
      }

      // Notify the owner's DM
      const ownerNum = process.env.OWNER_NUMBER;
      if (ownerNum) {
        const ownerJid = `${ownerNum.replace(/\D/g, '')}@s.whatsapp.net`;
        await sock.sendMessage(ownerJid, {
          text:
            `📵 *Anti-Call Triggered*\n\n` +
            `📞 Type   : ${isVideo ? 'Video' : 'Voice'} Call\n` +
            `👤 From   : @${caller.split('@')[0]}\n` +
            `⚙️  Action : ${callMode === 'block' ? 'Rejected + Blocked' : 'Rejected'}`
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[antiCall]', err.message);
    }
  }
}

module.exports = {
  cacheMessage,
  handleAntiDelete,
  handleAntiDeleteRevocation,
  handleAntiLink,
  handleAntiSpam,
  handleAntiViewOnce,
  handleAutoReact,
  handleAntiCall,
};
