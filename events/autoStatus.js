// Auto-view status updates + optional auto-react to statuses
// Per-user: if the poster has autoStatus:true in their user record, their
// status is auto-viewed.  The global/owner autoStatus setting is also honoured
// as a fallback (enables auto-view for everyone).

const db = require('../lib/database');

const STATUS_REACT_EMOJIS = ['❤️', '🔥', '😍', '💯', '👏', '✨'];

function getOwnerJid() {
  // Prefer live botConfig, fall back to env
  const fromCfg = global.botConfig?.ownerJid || '';
  if (fromCfg) return fromCfg;
  const num = String(process.env.OWNER_NUMBER || '').replace(/\D/g, '');
  return num ? `${num}@s.whatsapp.net` : '';
}

function isAutoStatusEnabled() {
  const ownerJid = getOwnerJid();
  // Owner setting (what .autostatus on writes)
  if (ownerJid && db.getOwnerSetting(ownerJid, 'autoStatus', false)) return true;
  // Legacy global setting
  if (db.getSetting('autoStatus', false)) return true;
  return false;
}

function isAutoStatusReactEnabled() {
  const ownerJid = getOwnerJid();
  if (ownerJid && db.getOwnerSetting(ownerJid, 'autoStatusReact', false)) return true;
  if (db.getSetting('autoStatusReact', false)) return true;
  return false;
}

async function handleStatusUpdate(sock, update) {
  // update is an array of messages in the 'status' broadcast list jid
  const messages = Array.isArray(update) ? update : [update];

  const globalAutoStatus = isAutoStatusEnabled();
  const globalAutoReact  = isAutoStatusReactEnabled();

  for (const message of messages) {
    if (!message?.key) continue;

    const statusJid = message.key.remoteJid; // 'status@broadcast'
    if (statusJid !== 'status@broadcast') continue;

    // Skip our own statuses
    if (message.key.fromMe) continue;

    const poster = message.key.participant || message.key.remoteJid;

    // ── Decide whether to auto-view ──────────────────────────────
    // Priority 1: per-user setting — the person who posted the status
    //             has turned on autoStatus for themselves
    let shouldView  = globalAutoStatus;
    let shouldReact = globalAutoReact;

    if (poster && poster !== 'status@broadcast') {
      try {
        const posterUser = db.getUser(poster);
        if (posterUser.autoStatus) {
          // The poster opted in — always auto-view their statuses
          shouldView = true;
        }
      } catch (_) { /* poster might not be in DB yet — ignore */ }
    }

    if (!shouldView) continue;

    try {
      // Mark as read (auto-view)
      await sock.readMessages([message.key]);
      console.log(`[autoStatus] viewed status from ${poster}`);

      // Auto-react to status
      if (shouldReact && poster) {
        const emoji = STATUS_REACT_EMOJIS[Math.floor(Math.random() * STATUS_REACT_EMOJIS.length)];
        await sock.sendMessage(statusJid, {
          react: { text: emoji, key: message.key }
        });
        console.log(`[autoStatus] reacted ${emoji} to status from ${poster}`);
      }
    } catch (err) {
      console.error('[autoStatus] error:', err.message);
    }
  }
}

module.exports = { handleStatusUpdate };
