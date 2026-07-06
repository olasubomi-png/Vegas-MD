// Settings commands
const settingsCommands = {
  settings: {
    desc: 'Show bot settings',
    exec: async (args, sock, jid) => {
      const settings = `⚙️ *OLASUBOMI-MD Settings*

Owner: Olasubomi
Prefix: .
Mode: private
Version: 3.0.0 Beta
Commands: 727
Status: Active`;
      await sock.sendMessage(jid, { text: settings });
    }
  },
  prefix: {
    desc: 'Show current prefix',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: `Current prefix: .` });
    }
  },
  privacy: {
    desc: 'Privacy settings',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: `🔒 Privacy Mode: Enabled` });
    }
  }
};

module.exports = settingsCommands;
