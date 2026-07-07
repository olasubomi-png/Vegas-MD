'use strict';
// commands/settings.js — Bot settings display
const settingsCommands = {
  settings: {
    category: 'utility', desc: 'Show current bot settings',
    usage: '.settings', aliases: ['config'], permissions: 'all',
    examples: ['.settings'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      await sock.sendMessage(jid, {
        text:
          `⚙️ *OLASUBOMI-MD Settings*\n\n` +
          `👑 Owner   : ${cfg.ownerName || 'Olasubomi'}\n` +
          `🔖 Prefix  : ${cfg.prefix || '.'}\n` +
          `🔒 Mode    : ${cfg.mode || 'private'}\n` +
          `🏷️  Version : v${cfg.version || '3.0.0'}\n` +
          `✅ Status  : Active`
      });
    }
  },
  prefix: {
    category: 'utility', desc: 'Show the current command prefix',
    usage: '.prefix', aliases: [], permissions: 'all',
    examples: ['.prefix'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const p = (botConfig || global.botConfig || {}).prefix || '.';
      await sock.sendMessage(jid, { text: `🔤 Current prefix: *${p}*\n\nExample: *${p}menu*` });
    }
  },
  privacy: {
    category: 'utility', desc: 'Show current bot privacy mode',
    usage: '.privacy', aliases: [], permissions: 'all',
    examples: ['.privacy'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const mode = (botConfig || global.botConfig || {}).mode || 'private';
      await sock.sendMessage(jid, {
        text: `🔒 *Privacy Mode*\n\nCurrent: *${mode}*\n\n${mode === 'private' ? '🔒 Bot only responds to the owner.' : '🌐 Bot responds to everyone.'}`
      });
    }
  }
};
module.exports = settingsCommands;
