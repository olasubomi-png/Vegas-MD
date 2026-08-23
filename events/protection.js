'use strict';
// events/protection.js
// Anti-delete · Anti-link (delete/kick/warn) · Anti-spam · Anti-view-once · Auto-react
// All handlers receive sock + botConfig as explicit parameters — no global reads.

const db = require('../lib/database');
const { hasURL, normalizeJid, isGroupAdmin, resolveIsOwner, getMessageText } = require('../lib/helpers');
const { downloadMediaMessage } = require('baileys');
const { getOwnerJid, forwardViewOnceToOwner } = require('../lib/view-once');

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
async function handleAntiDelete(sock, deletedKeys, botConfig) {
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
      // DMs: check the session owner's own antiDelete setting (did THEY enable it for their session?)
      const ownerJidCheck = botConfig?.ownerJid || null;
      const ownerEnabled  = ownerJidCheck ? db.getOwnerSetting(ownerJidCheck, 'antiDelete', false) : false;
      if (!ownerEnabled) continue;
    }

    const senderNum = cached.sender.split('@')[0];

    // All recoveries go to the configured owner’s personal DM. Never post the
    // recovered message back into the source group or the other participant’s DM.
    // Fail closed when the owner target is unavailable rather than leaking content.
    const ownerJid = getOwnerJid(botConfig);
    if (!ownerJid) {
      console.warn('[antiDelete] owner JID unavailable; refusing to resend deleted content');
      msgCache.delete(msgId);
      continue;
    }

    try {
      const contextLabel = isGroup ? 'group' : 'private chat';
      const caption = `🗑️ *Anti-Delete* — recovered a deleted ${contextLabel} message.` +
        (cached.text ? `\n\n${cached.text}` : '');

      if (cached.mediaType && cached.rawMessage) {
        const buffer = await downloadMediaMessage(cached.rawMessage, 'buffer', {
          reuploadRequest: sock.updateMediaMessage,
        });
        const original = cached.rawMessage.message || {};
        const mediaNode = original[`${cached.mediaType}Message`] || {};
        if (cached.mediaType === 'image') {
          await sock.sendMessage(ownerJid, {
            image: buffer,
            caption,
            mimetype: mediaNode.mimetype || 'image/jpeg',
          });
        } else if (cached.mediaType === 'video') {
          await sock.sendMessage(ownerJid, {
            video: buffer,
            caption,
            mimetype: mediaNode.mimetype || 'video/mp4',
          });
        } else if (cached.mediaType === 'audio') {
          await sock.sendMessage(ownerJid, {
            audio: buffer,
            mimetype: mediaNode.mimetype || 'audio/ogg; codecs=opus',
            ptt: Boolean(mediaNode.ptt),
          });
          if (caption) await sock.sendMessage(ownerJid, { text: caption });
        } else if (cached.mediaType === 'sticker') {
          await sock.sendMessage(ownerJid, { sticker: buffer });
          if (caption) await sock.sendMessage(ownerJid, { text: caption });
        } else if (cached.mediaType === 'document') {
          await sock.sendMessage(ownerJid, {
            document: buffer,
            mimetype: mediaNode.mimetype || 'application/octet-stream',
            fileName: mediaNode.fileName || 'recovered-document',
            caption,
          });
        } else {
          await sock.sendMessage(ownerJid, { document: buffer, fileName: 'recovered-media', caption });
        }
      } else {
        await sock.sendMessage(ownerJid, { text: caption });
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
async function handleAntiDeleteRevocation(sock, message, botConfig) {
  const proto = message.message?.protocolMessage;
  if (!proto || proto.type !== 0) return; // 0 = REVOKE

  // Don't re-post the bot's own deletions
  if (message.key?.fromMe) return;

  const revokedKey = proto.key;
  if (!revokedKey?.id) return;

  await handleAntiDelete(sock, [{ id: revokedKey.id, remoteJid: message.key?.remoteJid }], botConfig);
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

  // Use getMessageText() so links in image/video captions and
  // ephemeral messages are also detected, not just plain text.
  const text = getMessageText(message);

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
async function handleAntiViewOnce(sock, message, botConfig) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return false;

  const settings = db.getGroup(jid);
  if (!settings.antiViewOnce) return false;

  try {
    const forwarded = await forwardViewOnceToOwner(sock, message, botConfig, {
      caption: '👁️ *View-once media forwarded privately*',
    });
    return Boolean(forwarded);
  } catch (err) {
    console.error('[antiViewOnce]', err.message);
    return false;
  }
}

// Forward an owner’s quoted view-once reply to the owner’s personal DM. This
// runs independently of the group antiViewOnce toggle so `.vv` and an owner
// reply work even when the owner did not issue a command prefix.
async function handleOwnerViewOnceForward(sock, message, botConfig) {
  if (!message?.key?.fromMe) return false;
  try {
    return Boolean(await forwardViewOnceToOwner(sock, message, botConfig, {
      caption: '👁️ *View-once media forwarded privately*',
    }));
  } catch (err) {
    console.error('[viewOnce owner forward]', err.message);
    return false;
  }
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
async function handleAntiCall(sock, calls, botConfig) {
  const ownerJid  = botConfig?.ownerJid || null;
  const antiVoice = db.getOwnerSetting(ownerJid, 'antiCall',      false);
  const antiVideo = db.getOwnerSetting(ownerJid, 'antiVideoCall', false);
  const callMode  = db.getOwnerSetting(ownerJid, 'antiCallMode',  'cut');

  if (!antiVoice && !antiVideo) return;

  for (const call of calls) {
    // Intercept incoming offers only
    if (call.status !== 'offer') continue;

    const isVideo = call.isVideo === true;

    // Check if this call type is protected
    if (isVideo  && !antiVideo) continue;
    if (!isVideo && !antiVoice) continue;

    const caller = call.from;

    let rejected = false;

    // ── Reject the call ─────────────────────────────────
    if (typeof sock.rejectCall === 'function') {
      try {
        await sock.rejectCall(call.id, caller);
        rejected = true;
        console.log(`[antiCall] Rejected ${isVideo ? 'video' : 'voice'} call from ${caller}`);
      } catch (rejectErr) {
        console.error('[antiCall] rejectCall failed:', rejectErr.message);
      }
    } else {
      console.warn('[antiCall] sock.rejectCall is not available in this Baileys build');
    }

    // ── Block the caller (if block mode) ─────────────────
    if (callMode === 'block' && typeof sock.updateBlockStatus === 'function') {
      try {
        await sock.updateBlockStatus(caller, 'block');
        console.log(`[antiCall] Blocked ${caller}`);
      } catch (blockErr) {
        console.warn('[antiCall] updateBlockStatus failed:', blockErr.message);
      }
    }

    // ── Notify owner via DM ──────────────────────────────
    const _rawOwner = botConfig?.ownerJid
      ? botConfig.ownerJid.replace(/[@:].*/g, '')
      : (process.env.OWNER_NUMBER || '').replace(/\D/g, '');
    const ownerNum = _rawOwner;
    if (ownerNum) {
      const ownerJid = `${ownerNum}@s.whatsapp.net`;
      const actionLabel = (() => {
        const parts = [];
        if (rejected)                parts.push('Rejected ✂️');
        if (callMode === 'block')    parts.push('Blocked 🚫');
        if (!rejected && parts.length === 0) parts.push('Rejection failed ⚠️');
        return parts.join(' + ');
      })();
      await sock.sendMessage(ownerJid, {
        text:
          `📵 *Anti-Call Triggered*\n\n` +
          `📞 Type   : ${isVideo ? 'Video 📹' : 'Voice 🔊'} Call\n` +
          `👤 From   : @${caller.split('@')[0]}\n` +
          `⚙️  Action : ${actionLabel}`
      }).catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────────────────
// handleAntiChannel — delete WhatsApp channel links
// Detects links of the form: whatsapp.com/channel/...
// Toggle: antiChannel per-group boolean.
// ─────────────────────────────────────────────────────────
const CHANNEL_LINK_RE = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9_-]+/i;

async function handleAntiChannel(sock, message, botConfig) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return false;

  const settings = db.getGroup(jid);
  if (!settings.antiChannel) return false;

  const text = getMessageText(message);
  if (!CHANNEL_LINK_RE.test(text)) return false;

  const sender = message.key?.participant || jid;
  if (resolveIsOwner(message, sender, botConfig)) return false;
  if (await isGroupAdmin(sock, jid, sender)) return false;

  const senderName = sender.split('@')[0];
  try {
    await sock.sendMessage(jid, { delete: message.key });
    await sock.sendMessage(jid, {
      text:     `📢 *Anti-Channel*\n\n@${senderName} sent a WhatsApp channel link — it was removed.`,
      mentions: [sender]
    });
  } catch (err) {
    console.error('[antiChannel]', err.message);
  }
  return true;
}

// ─────────────────────────────────────────────────────────
// handleAntiStatus — delete messages forwarded from
// WhatsApp Status (stories / broadcast).
// Detects: contextInfo.remoteJid === 'status@broadcast'
// or contextInfo.participant that is a status broadcast JID.
// Toggle: antiStatus per-group boolean.
// ─────────────────────────────────────────────────────────
async function handleAntiStatus(sock, message, botConfig) {
  const jid = message.key?.remoteJid;
  if (!jid?.endsWith('@g.us')) return false;

  const settings = db.getGroup(jid);
  if (!settings.antiStatus) return false;

  const sender = message.key?.participant || jid;
  if (resolveIsOwner(message, sender, botConfig)) return false;
  if (await isGroupAdmin(sock, jid, sender)) return false;

  // A message forwarded from WhatsApp Status has its origin in
  // 'status@broadcast'. Check all contextInfo locations.
  const m = message.message || {};
  const ctxList = [
    m.extendedTextMessage?.contextInfo,
    m.imageMessage?.contextInfo,
    m.videoMessage?.contextInfo,
    m.audioMessage?.contextInfo,
    m.stickerMessage?.contextInfo,
    m.documentMessage?.contextInfo,
  ];

  const isFromStatus = ctxList.some(ctx =>
    ctx?.remoteJid === 'status@broadcast' ||
    ctx?.participant?.endsWith('@s.whatsapp.net') === false && // broadcast
    ctx?.remoteJid?.endsWith('@broadcast')
  );

  // Also catch the explicit forwardingScore path — status reposts are
  // almost always marked as forwarded.
  const anyCtx = ctxList.find(Boolean);
  const isStatusForward =
    isFromStatus ||
    (anyCtx?.isForwarded && anyCtx?.remoteJid === 'status@broadcast');

  if (!isStatusForward) return false;

  const senderName = sender.split('@')[0];
  try {
    await sock.sendMessage(jid, { delete: message.key });
    await sock.sendMessage(jid, {
      text:     `📵 *Anti-Status*\n\n@${senderName} forwarded a WhatsApp Status — it was removed.`,
      mentions: [sender]
    });
  } catch (err) {
    console.error('[antiStatus]', err.message);
  }
  return true;
}

module.exports = {
  cacheMessage,
  handleAntiDelete,
  handleAntiDeleteRevocation,
  handleAntiLink,
  handleAntiSpam,
  handleAntiViewOnce,
  handleOwnerViewOnceForward,
  handleAutoReact,
  handleAntiCall,
  handleAntiChannel,
  handleAntiStatus,
};
