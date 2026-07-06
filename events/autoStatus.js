// Auto-view status updates + optional auto-react to statuses

const db = require('../lib/database');

const STATUS_REACT_EMOJIS = ['❤️', '🔥', '😍', '💯', '👏', '✨'];

async function handleStatusUpdate(sock, update) {
  // Global auto-status setting
  const autoStatus = db.getSetting('autoStatus', false);
  const autoStatusReact = db.getSetting('autoStatusReact', false);

  if (!autoStatus) return;

  // update is an array of messages in the 'status' broadcast list jid
  const messages = Array.isArray(update) ? update : [update];

  for (const message of messages) {
    if (!message?.key) continue;

    const statusJid = message.key.remoteJid; // Usually 'status@broadcast'
    if (statusJid !== 'status@broadcast') continue;

    const poster = message.key.participant || message.key.remoteJid;

    try {
      // Mark as read (auto-view)
      await sock.readMessages([message.key]);

      // Auto-react to status
      if (autoStatusReact && poster) {
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
