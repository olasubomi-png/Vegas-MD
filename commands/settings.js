// Settings Commands
const settingsCommands = {
  settings: {
    desc: 'Show bot settings',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      const settings = `⚙️ *OLASUBOMI-MD Settings*

Owner  : ${cfg.ownerName || 'Olasubomi'}
Prefix : ${cfg.prefix || '.'}
Mode   : ${cfg.mode || 'private'}
Version: ${cfg.version || '3.0.0'} ${cfg.beta || 'Beta'}
Status : Active ✅`;
      await sock.sendMessage(jid, { text: settings });
    }
  },
  prefix: {
    desc: 'Show current prefix',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      await sock.sendMessage(jid, { text: `🔤 Current prefix: *${cfg.prefix || '.'}*\n\nExample: *${cfg.prefix || '.'}menu*` });
    }
  },
  privacy: {
    desc: 'Show privacy mode',
    exec: async (args, sock, jid, isGroup, sender, message, botConfig) => {
      const cfg = botConfig || global.botConfig || {};
      const mode = cfg.mode || 'private';
      await sock.sendMessage(jid, {
        text: `🔒 *Privacy Mode*\n\nCurrent mode: *${mode}*\n\n${mode === 'private' ? '🔒 Bot only responds to the owner.' : '🌐 Bot responds to everyone.'}`
      });
    }
  }
};

module.exports = settingsCommands;
