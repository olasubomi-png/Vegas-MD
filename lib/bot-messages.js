// lib/bot-messages.js — short-lived registry of messages sent by the bot.
// This prevents opt-in free chat from replying to its own outbound messages,
// while still allowing the owner to use free chat in a WhatsApp self-chat.

const MAX_IDS = 2_000;
const ids = new Set();

function remember(id) {
  if (!id) return;
  ids.add(String(id));
  while (ids.size > MAX_IDS) ids.delete(ids.values().next().value);
}

function isBotGenerated(id) {
  return Boolean(id && ids.has(String(id)));
}

module.exports = { remember, isBotGenerated };
