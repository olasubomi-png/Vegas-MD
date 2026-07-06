// AI Commands Handler
const aiCommands = {
  gpt: {
    desc: 'Ask ChatGPT',
    exec: async (args, sock, jid) => {
      const query = args.join(' ');
      if (!query) return await sock.sendMessage(jid, { text: '❌ Please provide a question\n\n*Usage:*\n.gpt <question>' });
      await sock.sendMessage(jid, { text: `🤖 *ChatGPT Query*\n\nQuestion: ${query}\n\n⏳ Processing... (API integration needed)` });
    }
  },
  copilot: {
    desc: 'GitHub Copilot',
    exec: async (args, sock, jid) => {
      const query = args.join(' ');
      if (!query) return await sock.sendMessage(jid, { text: '❌ Please provide a query\n\n*Usage:*\n.copilot <query>' });
      await sock.sendMessage(jid, { text: `🤖 *GitHub Copilot*\n\nQuery: ${query}\n\n⏳ Processing... (API integration needed)` });
    }
  },
  claude: {
    desc: 'Claude AI',
    exec: async (args, sock, jid) => {
      const query = args.join(' ');
      if (!query) return await sock.sendMessage(jid, { text: '❌ Please provide a question\n\n*Usage:*\n.claude <question>' });
      await sock.sendMessage(jid, { text: `🤖 *Claude AI*\n\nQuestion: ${query}\n\n⏳ Processing... (API integration needed)` });
    }
  },
  chatgpt: {
    desc: 'ChatGPT',
    exec: async (args, sock, jid) => {
      const query = args.join(' ');
      if (!query) return await sock.sendMessage(jid, { text: '❌ Please provide a query\n\n*Usage:*\n.chatgpt <query>' });
      await sock.sendMessage(jid, { text: `🤖 *ChatGPT*\n\nQuery: ${query}\n\n⏳ Processing... (API integration needed)` });
    }
  },
  gemini: {
    desc: 'Google Gemini',
    exec: async (args, sock, jid) => {
      const query = args.join(' ');
      if (!query) return await sock.sendMessage(jid, { text: '❌ Please provide a query\n\n*Usage:*\n.gemini <query>' });
      await sock.sendMessage(jid, { text: `🤖 *Google Gemini*\n\nQuery: ${query}\n\n⏳ Processing... (API integration needed)` });
    }
  }
};

module.exports = aiCommands;
