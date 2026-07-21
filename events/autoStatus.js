// Auto-view status updates + optional auto-react to statuses
// Per-user: if the poster has autoStatus:true in their user record, their
// status is auto-viewed.  The global autoStatus setting is also honoured
// as a fallback (enables auto-view for everyone).

const db = require('../lib/database');

const STATUS_REACT_EMOJIS = ['❤️', '🔥', '😍', '💯', '👏', '✨'];

async function handleStatusUpdate(sock, update) {
  // update is an array of messages in the 'status' broadcast list jid
  const messages = Array.isArray(update) ? update : [update];

  for (const message of messages) {
    if (!message?.key) continue;

    const statusJid = message.key.remoteJid; // 'status@broadcast'
    if (statusJid !== 'status@broadcast') continue;

    const poster = message.key.participant || message.key.remoteJid;

    // ── Decide whether to auto-view ──────────────────────────────
    // Priority 1: per-user setting — the person who posted the status
    //             has turned on autoStatus for themselves
    const globalAutoStatus = db.getSetting('autoStatus', false);
    const globalAutoReact  = db.getSetting('autoStatusReact', false);

    let shouldView  = globalAutoStatus;
    let shouldReact = globalAutoReact;

    if (poster && poster !== 'status@broadcast') {
      try {
        const posterUser = db.getUser(poster);
        if (posterUser.autoStatus) {
          // The poster opted in — always auto-view their statuses
          shouldView  = true;
          // React only if they also have a react preference, or fall back to global
          shouldReact = shouldReact || false;
        }
      } catch (_) { /* poster might not be in DB yet — ignore */ }
    }

    if (!shouldView) continue;

    try {
      // Mark as read (auto-view)
      await sock.readMessages([message.key]);

      // Auto-react to status
      if (shouldReact && poster) {
        const emoji = STATUS_REACT_EMOJIS[Math.floor(Math.random() * STATUS_REACT_EMOJIS.length)];
        await sock.sendMessage(statusJid, {
          react: { text: emoji, key: message.key }
        });
      }
    } catch (err) {
      console.error('Auto-status error:', err.message);
    }
  }
}

module.exports = { handleStatusUpdate };
