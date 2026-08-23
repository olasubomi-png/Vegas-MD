'use strict';

const { downloadMediaMessage } = require('baileys');

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
  return { inner, wrapped: inner !== node && Boolean(
    node.viewOnceMessage || node.viewOnceMessageV2 || node.viewOnceMessageV2Extension
  ) };
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
  if (!media || (!explicitlyMarked && !(options.allowQuotedMedia && Boolean(quoted)))) return null;

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

function dedupeKey(info) {
  return `${info.sourceJid || ''}:${info.stanzaId || ''}:${info.mediaType}`;
}

function pruneDedupe() {
  const cutoff = Date.now() - DEDUPE_TTL_MS;
  for (const [key, timestamp] of forwardedKeys) {
    if (timestamp < cutoff) forwardedKeys.delete(key);
  }
}

async function forwardViewOnceToOwner(sock, message, botConfig, options = {}) {
  const info = getViewOncePayload(message, options);
  if (!info) return false;

  const ownerJid = getOwnerJid(botConfig);
  if (!ownerJid) {
    console.warn('[viewOnce] owner JID unavailable; refusing to forward media');
    return false;
  }

  pruneDedupe();
  const key = dedupeKey(info);
  if (forwardedKeys.has(key)) return true;

  const fakeMessage = {
    key: {
      remoteJid: info.sourceJid || message.key?.remoteJid,
      id: info.stanzaId || message.key?.id,
      participant: info.participant || undefined,
      fromMe: false,
    },
    message: info.inner,
  };
  const buffer = await downloadMediaMessage(fakeMessage, 'buffer', {
    reuploadRequest: sock.updateMediaMessage,
  });
  if (!buffer || !buffer.length) throw new Error('view-once media download returned an empty buffer');

  const prefix = options.caption || '👁️ *View-once media forwarded privately*';
  if (info.mediaType === 'image') {
    await sock.sendMessage(ownerJid, {
      image: buffer,
      caption: prefix,
      mimetype: info.media.mimetype || 'image/jpeg',
    });
  } else if (info.mediaType === 'video') {
    await sock.sendMessage(ownerJid, {
      video: buffer,
      caption: prefix,
      mimetype: info.media.mimetype || 'video/mp4',
    });
  } else {
    await sock.sendMessage(ownerJid, {
      audio: buffer,
      mimetype: info.media.mimetype || 'audio/ogg; codecs=opus',
      ptt: true,
    });
  }

  forwardedKeys.set(key, Date.now());
  return true;
}

module.exports = {
  getOwnerJid,
  getViewOncePayload,
  forwardViewOnceToOwner,
  _forwardedKeys: forwardedKeys,
};
