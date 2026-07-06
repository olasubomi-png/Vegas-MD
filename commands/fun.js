// Fun Commands
const funCommands = {
  joke: {
    desc: 'Get a random joke',
    exec: async (args, sock, jid) => {
      const jokes = [
        '😂 Why did the bot go to school? To improve its debugging skills!',
        '🤖 What do you call a bot that tells jokes? Artificial Intelligence!',
        '😆 Why did the programmer quit his job? He didn\'t get arrays!',
        '🎭 What\'s a programmer\'s favorite hangout place? Foo Bar!'
      ];
      const joke = jokes[Math.floor(Math.random() * jokes.length)];
      sock.sendMessage(jid, { text: joke });
    }
  },
  quote: {
    desc: 'Get an inspirational quote',
    exec: async (args, sock, jid) => {
      const quotes = [
        '💭 "Code is like humor. When you have to explain it, it\'s bad." - Cory House',
        '💭 "Every message processed is a step to perfection." - OLASUBOMI-MD',
        '💭 "First, solve the problem. Then, write the code." - John Johnson'
      ];
      const quote = quotes[Math.floor(Math.random() * quotes.length)];
      sock.sendMessage(jid, { text: quote });
    }
  },
  ship: {
    desc: 'Calculate ship percentage',
    exec: async (args, sock, jid) => {
      const ship = Math.floor(Math.random() * 100);
      sock.sendMessage(jid, { text: `💕 Ship Level: ${ship}%` });
    }
  },
  dare: {
    desc: 'Get a dare',
    exec: async (args, sock, jid) => {
      const dares = [
        '😈 Dare: Send a funny meme!',
        '😈 Dare: Sing a song!',
        '😈 Dare: Send a compliment to everyone!'
      ];
      const dare = dares[Math.floor(Math.random() * dares.length)];
      sock.sendMessage(jid, { text: dare });
    }
  },
  truth: {
    desc: 'Get a truth question',
    exec: async (args, sock, jid) => {
      const truths = [
        '🎭 Truth: What\'s your favorite programming language?',
        '🎭 Truth: What\'s your biggest fear?',
        '🎭 Truth: What\'s your dream job?'
      ];
      const truth = truths[Math.floor(Math.random() * truths.length)];
      sock.sendMessage(jid, { text: truth });
    }
  }
};

module.exports = funCommands;
