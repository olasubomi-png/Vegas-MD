// Example plugin — copy this file to add your own commands
// File name: plugins/myfeature.js
// The bot auto-loads all .js files from the plugins/ folder on startup.

const commands = {
  hello: {
    desc: 'Say hello (example plugin command)',
    exec: async (args, sock, jid, isGroup, sender) => {
      const name = sender.split('@')[0];
      await sock.sendMessage(jid, {
        text: `👋 Hello, @${name}! I'm OLASUBOMI-MD.\n\nThis response is from the *example plugin* in /plugins/example.js.\nEdit or replace it to add your own commands!`,
        mentions: [sender]
      });
    }
  },

  echo: {
    desc: 'Echo your message back (example)',
    exec: async (args, sock, jid) => {
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(jid, { text: '❌ Usage: .echo <message>' });
      await sock.sendMessage(jid, { text: `🔁 ${text}` });
    }
  }
};

module.exports = { commands };
