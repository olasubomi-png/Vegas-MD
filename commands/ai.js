// AI Commands — uses pollinations.ai (free, no key required)
const axios = require('axios');

async function queryAI(prompt, model = 'openai') {
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${model}&seed=${Math.floor(Math.random() * 10000)}`;
  const response = await axios.get(url, {
    timeout: 45000,
    headers: { 'User-Agent': 'OLASUBOMI-MD/3.0.0' }
  });
  return String(response.data).trim();
}

async function handleAICommand(args, sock, jid, label, model) {
  const query = args.join(' ').trim();
  if (!query) {
    return await sock.sendMessage(jid, {
      text: `❌ Please provide a question.\n\n*Usage:* .${label.toLowerCase()} <your question>`
    });
  }

  await sock.sendMessage(jid, { text: `🤖 *${label}* is thinking...\n\n_"${query}"_` });

  try {
    const answer = await queryAI(query, model);
    if (!answer) throw new Error('Empty response from AI');
    await sock.sendMessage(jid, {
      text: `🤖 *${label}*\n\n❓ *Question:* ${query}\n\n💬 *Answer:*\n${answer}`
    });
  } catch (err) {
    console.error(`AI command error (${label}):`, err.message);
    await sock.sendMessage(jid, {
      text: `❌ *${label} failed:* ${err.message}\n\nPlease try again in a moment.`
    });
  }
}

const aiCommands = {
  // .ai is the main alias
  ai: {
    desc: 'Ask AI a question (alias for .gpt)',
    exec: async (args, sock, jid) => handleAICommand(args, sock, jid, 'AI Assistant', 'openai')
  },
  gpt: {
    desc: 'Ask ChatGPT',
    exec: async (args, sock, jid) => handleAICommand(args, sock, jid, 'ChatGPT', 'openai')
  },
  chatgpt: {
    desc: 'Ask ChatGPT',
    exec: async (args, sock, jid) => handleAICommand(args, sock, jid, 'ChatGPT', 'openai')
  },
  gemini: {
    desc: 'Ask Google Gemini',
    exec: async (args, sock, jid) => handleAICommand(args, sock, jid, 'Gemini', 'mistral')
  },
  claude: {
    desc: 'Ask Claude AI',
    exec: async (args, sock, jid) => handleAICommand(args, sock, jid, 'Claude', 'claude')
  },
  copilot: {
    desc: 'Ask GitHub Copilot',
    exec: async (args, sock, jid) => handleAICommand(args, sock, jid, 'Copilot', 'openai')
  },
  imagine: {
    desc: 'Generate an AI image description',
    exec: async (args, sock, jid) => {
      const prompt = args.join(' ').trim();
      if (!prompt) {
        return await sock.sendMessage(jid, { text: '❌ Provide a description.\n\n*Usage:* .imagine <description>' });
      }
      await sock.sendMessage(jid, { text: `🎨 *AI Image Prompt*\n\n_"${prompt}"_\n\n⏳ Generating response...` });
      try {
        const answer = await queryAI(`Describe in vivid detail an image of: ${prompt}`, 'openai');
        await sock.sendMessage(jid, { text: `🎨 *Image Description*\n\n${answer}` });
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Failed: ${err.message}` });
      }
    }
  }
};

module.exports = aiCommands;
