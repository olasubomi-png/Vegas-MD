// Fun Commands

const jokes = [
  '😂 Why did the bot go to therapy? It had too many unresolved promises!',
  '🤖 Why don\'t bots ever get lost? They always follow the right path!',
  '😆 Why did the programmer quit his job? He didn\'t get arrays!',
  '🎭 What\'s a programmer\'s favorite hangout place? Foo Bar!',
  '😂 How many programmers does it take to change a light bulb? None — that\'s a hardware problem.',
  '🤣 I told my wife she was drawing her eyebrows too high. She looked surprised.',
  '😄 Why do Java developers wear glasses? Because they don\'t C#!',
  '😂 A SQL query walks into a bar, walks up to two tables and asks: "Can I join you?"',
  '🤖 Why was the JavaScript developer sad? Because he didn\'t know how to null his feelings.',
  '😆 What do you call a sleeping dinosaur? A dino-snore!'
];

const quotes = [
  '💭 "Code is like humor. When you have to explain it, it\'s bad." — Cory House',
  '💭 "First, solve the problem. Then, write the code." — John Johnson',
  '💭 "Any fool can write code that a computer can understand. Good programmers write code humans can understand." — Martin Fowler',
  '💭 "The best error message is the one that never shows up." — Thomas Fuchs',
  '💭 "Simplicity is the soul of efficiency." — Austin Freeman',
  '💭 "Make it work, make it right, make it fast." — Kent Beck',
  '💭 "Talk is cheap. Show me the code." — Linus Torvalds',
  '💭 "Your most unhappy customers are your greatest source of learning." — Bill Gates',
  '💭 "It\'s not a bug — it\'s an undocumented feature." — Anonymous',
  '💭 "Without requirements or design, programming is the art of adding bugs to an empty text file." — Louis Srygley'
];

const dares = [
  '😈 Dare: Send a voice note singing your favorite song!',
  '😈 Dare: Change your display name to something funny for 1 hour!',
  '😈 Dare: Send a compliment to every member in this chat!',
  '😈 Dare: Share the most embarrassing photo on your phone!',
  '😈 Dare: Type the next 10 messages using only emojis!',
  '😈 Dare: Send a message in a foreign language!',
  '😈 Dare: Let someone else pick your profile picture for a day!',
  '😈 Dare: Tell a joke right now, no matter how bad it is!'
];

const truths = [
  '🎭 Truth: What\'s your most embarrassing moment?',
  '🎭 Truth: What\'s the last lie you told?',
  '🎭 Truth: What\'s your biggest fear?',
  '🎭 Truth: What\'s your most used app on your phone?',
  '🎭 Truth: Have you ever pretended to be offline to avoid someone?',
  '🎭 Truth: What\'s something you\'ve never told anyone?',
  '🎭 Truth: What\'s your dream job?',
  '🎭 Truth: Who was your first celebrity crush?'
];

const eightBallResponses = [
  '🎱 It is certain.',
  '🎱 Without a doubt.',
  '🎱 Yes, definitely.',
  '🎱 You may rely on it.',
  '🎱 As I see it, yes.',
  '🎱 Most likely.',
  '🎱 Outlook good.',
  '🎱 Yes.',
  '🎱 Signs point to yes.',
  '🎱 Reply hazy, try again.',
  '🎱 Ask again later.',
  '🎱 Better not tell you now.',
  '🎱 Cannot predict now.',
  '🎱 Concentrate and ask again.',
  '🎱 Don\'t count on it.',
  '🎱 My reply is no.',
  '🎱 My sources say no.',
  '🎱 Outlook not so good.',
  '🎱 Very doubtful.'
];

const roasts = [
  '🔥 You\'re the reason they put instructions on shampoo bottles.',
  '🔥 I\'d agree with you, but then we\'d both be wrong.',
  '🔥 You\'re like a software update — whenever I see you I think "not now."',
  '🔥 You bring everyone so much joy… when you leave the room.',
  '🔥 I\'ve seen better arguments in a Terms & Conditions page.',
  '🔥 You\'re proof that evolution can go in reverse.',
  '🔥 If brains were petrol, you wouldn\'t have enough to power an ant\'s motorcycle.',
  '🔥 You must have been born on a highway — that\'s where most accidents happen.'
];

const compliments = [
  '💖 You\'re the reason bots were invented — to tell you how amazing you are!',
  '💖 Your kindness is like a good API — reliable and always returns something great!',
  '💖 You light up every room you walk into, even this chat!',
  '💖 You\'re one of a kind — seriously, there\'s no duplicate in the database!',
  '💖 The world is genuinely a better place with you in it.',
  '💖 You have the energy of someone who actually enjoys Mondays. Rare and impressive.',
  '💖 If you were a function, you\'d have zero bugs and perfect documentation.'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const funCommands = {
  joke: {
    desc: 'Get a random joke',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: pick(jokes) });
    }
  },
  quote: {
    desc: 'Get an inspirational quote',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: pick(quotes) });
    }
  },
  ship: {
    desc: 'Calculate ship/compatibility percentage',
    exec: async (args, sock, jid) => {
      const pct = Math.floor(Math.random() * 101);
      let rating = '💀 Terrible';
      if (pct >= 90) rating = '💘 Soulmates!';
      else if (pct >= 70) rating = '❤️ Great match!';
      else if (pct >= 50) rating = '💛 Pretty good!';
      else if (pct >= 30) rating = '💙 Meh, could work...';
      await sock.sendMessage(jid, {
        text: `💕 *Ship Calculator*\n\nCompatibility: *${pct}%*\nVerdict: ${rating}`
      });
    }
  },
  dare: {
    desc: 'Get a dare',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: pick(dares) });
    }
  },
  truth: {
    desc: 'Get a truth question',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: pick(truths) });
    }
  },
  '8ball': {
    desc: 'Ask the magic 8-ball',
    exec: async (args, sock, jid) => {
      const question = args.join(' ').trim();
      if (!question) {
        return await sock.sendMessage(jid, { text: '❓ Ask me something!\n\n*Usage:* .8ball Will I win today?' });
      }
      await sock.sendMessage(jid, {
        text: `🎱 *Magic 8-Ball*\n\n❓ ${question}\n\n${pick(eightBallResponses)}`
      });
    }
  },
  roast: {
    desc: 'Get roasted',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: pick(roasts) });
    }
  },
  compliment: {
    desc: 'Get a compliment',
    exec: async (args, sock, jid) => {
      await sock.sendMessage(jid, { text: pick(compliments) });
    }
  }
};

module.exports = funCommands;
