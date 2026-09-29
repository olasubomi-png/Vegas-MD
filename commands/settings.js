'use strict';
// commands/settings.js — Bot settings display
const db = require('../lib/database');
const settingsCommands = {
  settings: {
    category: 'utility', desc: 'Show current bot settings',
    usage: '.settings', aliases: ['config'], permissions: 'all',
    examples: ['.settings'],
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
            const oj = cfg.ownerJid;
      const on = (k) => db.getOwnerSetting(oj, k, false) || db.getSetting(k, false);
      await sock.sendMessage(jid, {
        text:
          `⚙️ *𝑺𝑼𝑩𝑩𝒀-𝑴𝑫 Settings*\n\n` +
          `👑 Owner      : ${cfg.ownerName || '𝑺𝑼𝑩𝑩𝒀'}\n` +
          `🔖 Prefix     : ${cfg.prefix || '.'}\n` +
          `🔒 Mode       : ${cfg.mode || 'private'}\n` +
          `🏷️  Version    : v${cfg.version || '3.0.0'}\n\n` +
          `*Automation*\n` +
          `👁️ AutoStatus : ${on('autoStatus') ? 'ON' : 'OFF'}\n` +
          `❤️ AutoReact  : ${on('autoStatusReact') ? 'ON' : 'OFF'}\n` +
          `⌨️ AutoTyping : ${on('autoTyping') ? 'ON' : 'OFF'}\n` +
          `📖 AutoRead   : ${on('autoRead') ? 'ON' : 'OFF'}\n` +
          `💬 FreeChat   : ${on('freeChat') ? 'ON' : 'OFF'}\n` +
          `🗑️ AntiDelete : ${on('antiDelete') ? 'ON' : 'OFF'}\n\n` +
          `✅ Status     : Active`
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
