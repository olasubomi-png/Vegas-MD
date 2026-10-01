'use strict';

const { downloadMediaMessage, downloadContentFromMessage } = require('baileys');

const forwardedKeys = new Map();
const DEDUPE_TTL_MS = 10 * 60 * 1000;

function getOwnerJid(botConfig) {
  const raw = botConfig?.ownerJid || process.env.OWNER_NUMBER || '';
  const number = String(raw).replace(/\D/g, '');
  return number ? `${number}@s.whatsapp.net` : null;
}

function unwrapMessageNode(node) {
  if (!node || typeof node !== 'object') return { inner: null, wrapped: false };
  const inner =
    node.viewOnceMessage?.message ||
    node.viewOnceMessageV2?.message ||
    node.viewOnceMessageV2Extension?.message ||
    node.ephemeralMessage?.message ||
    node.ephemeralMessageV2Extension?.message ||
    node.documentWithCaptionMessage?.message ||
    node;
  return {
    inner,
    wrapped: inner !== node && Boolean(
      node.viewOnceMessage || node.viewOnceMessageV2 || node.viewOnceMessageV2Extension
    )
  };
}

function contextLocations(message) {
  const root = message?.message || {};
  return [
    root.extendedTextMessage?.contextInfo,
    root.imageMessage?.contextInfo,
    root.videoMessage?.contextInfo,
    root.audioMessage?.contextInfo,
    root.stickerMessage?.contextInfo,
    root.documentMessage?.contextInfo,
  ].filter(Boolean);
}

function getViewOncePayload(message, options = {}) {
  const root = message?.message || null;
  if (!root) return null;

  const contexts = contextLocations(message);
  const replyContext = contexts.find(ctx => ctx.quotedMessage);
  const quoted = replyContext?.quotedMessage || null;
  const candidate = quoted || root;
  const { inner, wrapped } = unwrapMessageNode(candidate);
  if (!inner) return null;

  const media = inner.imageMessage || inner.videoMessage || inner.audioMessage || null;
  const explicitlyMarked = wrapped || Boolean(
    media?.viewOnce === true ||
    media?.viewOnceMessage === true ||
    quoted?.viewOnceMessage ||
    quoted?.viewOnceMessageV2 ||
    quoted?.viewOnceMessageV2Extension ||
    replyContext?.viewOnce === true
  );
  // allowQuotedMedia: treat quoted media as unlockable even without viewOnce flag
  // forceMedia: unlock any image/video/audio in this message (used for cached view-once)
  if (!media) return null;
  if (!explicitlyMarked && !options.allowQuotedMedia && !options.forceMedia) return null;
  if (!explicitlyMarked && options.allowQuotedMedia && !quoted && !options.forceMedia) return null;

  const mediaType = inner.imageMessage ? 'image' : inner.videoMessage ? 'video' : 'audio';
  const sourceJid = message.key?.remoteJid || null;
  const stanzaId = replyContext?.stanzaId || message.key?.id || null;
  const participant = replyContext?.participant || message.key?.participant || null;
  return {
    inner,
    media,
    mediaType,
    sourceJid,
    stanzaId,
    participant,
    isReply: Boolean(quoted),
  };
}

function dedupeKey(info, targetJid) {
  return `${targetJid || ''}:${info.sourceJid || ''}:${info.stanzaId || ''}:${info.mediaType}`;
}

function pruneDedupe() {
  const cutoff = Date.now() - DEDUPE_TTL_MS;
  for (const [key, timestamp] of forwardedKeys) {
    if (timestamp < cutoff) forwardedKeys.delete(key);
  }
}

/**
 * Download media buffer — try content stream first, then downloadMediaMessage.
 */
async function downloadViewOnceBuffer(sock, info, message) {
  // Strategy 1: downloadContentFromMessage (most reliable for view-once)
  try {
    const kind = info.mediaType === 'image' ? 'image'
      : info.mediaType === 'video' ? 'video'
      : 'audio';
    const stream = await downloadContentFromMessage(info.media, kind);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    if (buf.length > 0) return buf;
  } catch (e1) {
    console.warn('[viewOnce] content stream failed:', e1.message);
  }

  // Strategy 2: downloadMediaMessage with reconstructed key
  const fakeMessage = {
    key: {
      remoteJid: info.sourceJid || message.key?.remoteJid,
      id: info.stanzaId || message.key?.id,
      participant: info.participant || message.key?.participant || undefined,
      fromMe: Boolean(message.key?.fromMe),
    },
    message: info.inner,
  };
  try {
    const buffer = await downloadMediaMessage(fakeMessage, 'buffer', {
      reuploadRequest: sock.updateMediaMessage,
    });
    if (buffer && buffer.length) return buffer;
  } catch (e2) {
    console.warn('[viewOnce] downloadMediaMessage failed:', e2.message);
  }

  // Strategy 3: try with fromMe flipped
  try {
    fakeMessage.key.fromMe = !fakeMessage.key.fromMe;
    const buffer = await downloadMediaMessage(fakeMessage, 'buffer', {
      reuploadRequest: sock.updateMediaMessage,
    });
    if (buffer && buffer.length) return buffer;
  } catch (e3) {
    console.warn('[viewOnce] downloadMediaMessage fromMe flip failed:', e3.message);
  }

  throw new Error('Could not download view-once media from WhatsApp');
}

/**
 * Send revealed view-once media to targetJid (DM or same chat).
 */
async function revealViewOnceToChat(sock, message, targetJid, options = {}) {
  const info = getViewOncePayload(message, options);
  if (!info) return false;
  if (!targetJid) return false;

  pruneDedupe();
  const key = dedupeKey(info, targetJid);
  if (forwardedKeys.has(key) && !options.force) return true;

  const buffer = await downloadViewOnceBuffer(sock, info, message);
  const caption = options.caption || '👁️ *View once unlocked*';

  if (info.mediaType === 'image') {
    await sock.sendMessage(targetJid, {
      image: buffer,
      caption,
      mimetype: info.media.mimetype || 'image/jpeg',
    });
  } else if (info.mediaType === 'video') {
    await sock.sendMessage(targetJid, {
      video: buffer,
      caption,
      mimetype: info.media.mimetype || 'video/mp4',
    });
  } else {
    await sock.sendMessage(targetJid, {
      audio: buffer,
      mimetype: info.media.mimetype || 'audio/ogg; codecs=opus',
      ptt: true,
    });
    if (caption) await sock.sendMessage(targetJid, { text: caption });
  }

  forwardedKeys.set(key, Date.now());
  return true;
}

/** Legacy: forward privately to owner DM (used by antiViewOnce group toggle only) */
async function forwardViewOnceToOwner(sock, message, botConfig, options = {}) {
  const ownerJid = getOwnerJid(botConfig);
  if (!ownerJid) {
    console.warn('[viewOnce] owner JID unavailable; refusing to forward media');
    return false;
  }
  return revealViewOnceToChat(sock, message, ownerJid, {
    ...options,
    caption: options.caption || '👁️ *View-once media forwarded privately*',
  });
}

/**
 * Build a synthetic message object from a cached raw node so getViewOncePayload works.
 */
function messageFromCache(cached, msgId) {
  if (!cached?.rawMessage) return null;
  const msgNode = cached.rawMessage.message
    ? cached.rawMessage
    : { key: { remoteJid: cached.jid, id: msgId, participant: cached.sender }, message: cached.rawMessage };
  return {
    key: {
      remoteJid: cached.jid || msgNode.key?.remoteJid,
      id: msgId || msgNode.key?.id,
      participant: cached.sender || msgNode.key?.participant,
      fromMe: false,
    },
    message: msgNode.message || msgNode,
  };
}

module.exports = {
  getOwnerJid,
  getViewOncePayload,
  revealViewOnceToChat,
  forwardViewOnceToOwner,
  messageFromCache,
  downloadViewOnceBuffer,
  _forwardedKeys: forwardedKeys,
};
