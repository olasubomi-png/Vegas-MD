// Shared utility functions

// NOTE: no global flag — global flag mutates lastIndex on .test(), causing alternating results
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|wa\.me\/[^\s]+|chat\.whatsapp\.com\/[^\s]+)/i;

function normalizeJid(jid = '') {
  // Strip leading + (present when user sets OWNER_NUMBER with country code prefix)
  // then strip everything from @ or : onward (the WhatsApp server suffix)
  return jid.replace(/^\+/, '').replace(/[@:].*/g, '');
}

// ─── Single source of truth for owner detection ───────────────────────────
// Rule 1: fromMe === true  → the message came from the bot's own WhatsApp
//         account (i.e. the owner typed it from their device). Always owner.
// Rule 2: senderJid matches the configured OWNER_NUMBER (after normalisation).
//
// Usage:
//   const isOwner = resolveIsOwner(message, sender, botConfig);
//
// Pass the raw Baileys message object so fromMe can be inspected.
// senderJid should be message.key.participant || message.key.remoteJid.
function resolveIsOwner(message, senderJid, botConfig) {
  // Guard: message or key may be absent when called from protection handlers
  // that receive a synthetic or partially-built message object.
  if (message != null && message.key?.fromMe === true) return true;
  const ownerNum = normalizeJid(
    botConfig?.ownerNumber || global.botConfig?.ownerNumber || ''
  );
  if (!ownerNum) return false;
  return normalizeJid(senderJid) === ownerNum;
}

function getMentionedJid(message) {
  const ctx = message.message?.extendedTextMessage?.contextInfo;
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx?.participant) return ctx.participant;
  return null;
}

function getQuotedMessage(message) {
  return message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
}

function hasURL(text = '') {
  return URL_REGEX.test(text);
}

function getMessageText(message) {
  // Unwrap ephemeral / view-once containers — same logic as main.js inline extraction
  const inner =
    message.message?.ephemeralMessage?.message              ||
    message.message?.ephemeralMessageV2Extension?.message   ||
    message.message?.viewOnceMessage?.message               ||
    message.message?.viewOnceMessageV2?.message             ||
    message.message?.viewOnceMessageV2Extension?.message    ||
    message.message;
  return (
    inner?.conversation ||
    inner?.extendedTextMessage?.text ||
    inner?.imageMessage?.caption ||
    inner?.videoMessage?.caption ||
    ''
  );
}

function formatNumber(n) {
  return n?.toLocaleString?.() ?? String(n);
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}

function isSameDay(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function cooldownLeft(lastStr, cooldownMs) {
  if (!lastStr) return 0;
  const elapsed = Date.now() - new Date(lastStr).getTime();
  return Math.max(0, cooldownMs - elapsed);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function toggleEmoji(val) {
  return val ? '✅' : '❌';
}

async function isGroupAdmin(sock, jid, senderJid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta.participants.some(
      p => p.id === senderJid && (p.admin === 'admin' || p.admin === 'superadmin')
    );
  } catch {
    return false;
  }
}

async function getBotJid(sock) {
  try {
    return sock.user?.id || '';
  } catch {
    return '';
  }
}

module.exports = {
  normalizeJid, resolveIsOwner, getMentionedJid, getQuotedMessage,
  hasURL, getMessageText, formatNumber, formatDuration,
  msUntilMidnight, isSameDay, cooldownLeft, pickRandom,
  chunk, toggleEmoji, isGroupAdmin, getBotJid, URL_REGEX
};
