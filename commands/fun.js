'use strict';
// commands/fun.js — Fun commands

const jokes = [
  '😂 Why did the bot go to therapy? It had too many unresolved promises!',
  '🤖 Why don\'t bots ever get lost? They always follow the right path!',
  '😆 Why did the programmer quit? He didn\'t get arrays!',
  '🎭 What\'s a programmer\'s favorite hangout? Foo Bar!',
  '😂 How many programmers to change a light bulb? None — that\'s a hardware problem.',
  '🤣 I told my wife she drew her eyebrows too high. She looked surprised.',
  '😄 Why do Java devs wear glasses? Because they don\'t C#!',
  '😂 A SQL query walks into a bar and asks two tables: "Can I join you?"',
  '🤖 Why was the JS dev sad? He didn\'t know how to null his feelings.',
  '😆 What do you call a sleeping dinosaur? A dino-snore!'
];

const quotes = [
  '💭 "Code is like humor. When you have to explain it, it\'s bad." — Cory House',
  '💭 "First, solve the problem. Then, write the code." — John Johnson',
  '💭 "Any fool can write code a computer understands. Good programmers write code humans understand." — Martin Fowler',
  '💭 "Simplicity is the soul of efficiency." — Austin Freeman',
  '💭 "Make it work, make it right, make it fast." — Kent Beck',
  '💭 "Talk is cheap. Show me the code." — Linus Torvalds',
  '💭 "It\'s not a bug — it\'s an undocumented feature." — Anonymous',
  '💭 "The best error message is the one that never shows up." — Thomas Fuchs'
];

const dares = [
  '😈 Dare: Send a voice note singing your favorite song!',
  '😈 Dare: Change your display name to something funny for 1 hour!',
  '😈 Dare: Send a compliment to every member in this chat!',
  '😈 Dare: Type the next 10 messages using only emojis!',
  '😈 Dare: Send a message in a foreign language!',
  '😈 Dare: Tell a joke right now, no matter how bad!',
  '😈 Dare: Share the most embarrassing photo in your gallery!',
  '😈 Dare: Let someone else pick your profile picture for a day!'
];

const truths = [
  '🎭 Truth: What\'s your most embarrassing moment?',
  '🎭 Truth: What\'s the last lie you told?',
  '🎭 Truth: What\'s your biggest fear?',
  '🎭 Truth: What\'s your most used app?',
  '🎭 Truth: Have you ever pretended to be offline to avoid someone?',
  '🎭 Truth: What\'s something you\'ve never told anyone?',
  '🎭 Truth: What\'s your dream job?',
  '🎭 Truth: Who was your first celebrity crush?'
];

const eightBall = [
  '🎱 It is certain.', '🎱 Without a doubt.', '🎱 Yes, definitely.',
  '🎱 You may rely on it.', '🎱 As I see it, yes.', '🎱 Most likely.',
  '🎱 Outlook good.', '🎱 Signs point to yes.', '🎱 Reply hazy, try again.',
  '🎱 Ask again later.', '🎱 Better not tell you now.', '🎱 Cannot predict now.',
  '🎱 Don\'t count on it.', '🎱 My reply is no.', '🎱 Outlook not so good.',
  '🎱 Very doubtful.'
];

const roasts = [
  '🔥 You\'re the reason they put instructions on shampoo bottles.',
  '🔥 I\'d agree with you, but then we\'d both be wrong.',
  '🔥 You\'re like a software update — whenever I see you I think "not now."',
  '🔥 You bring everyone joy… when you leave the room.',
  '🔥 You\'re proof that evolution can go in reverse.',
  '🔥 If brains were petrol, you couldn\'t power an ant\'s motorcycle.'
];

const compliments = [
  '💖 You\'re the reason bots were invented — to tell you how amazing you are!',
  '💖 Your kindness is like a good API — reliable and always returns something great!',
  '💖 You light up every room you walk into!',
  '💖 You\'re one of a kind — no duplicate in the database!',
  '💖 If you were a function, you\'d have zero bugs and perfect documentation.'
];

const insults = [
  '😤 You\'re like a `404 error` — completely useless and hard to find.',
  '😤 If stupidity was a language, you\'d be fluent.',
  '😤 You\'re as sharp as a `null pointer`.',
  '😤 Your brain must be `undefined` — it returns nothing useful.',
  '😤 Even Google can\'t find a reason to like you.',
  '😤 You remind me of `Internet Explorer` — slow, outdated, and nobody wants you.'
];

const flirts = [
  '😍 Are you a JavaScript error? Because you\'ve got my attention.',
  '😍 Are you a `while(true)` loop? Because I can\'t stop thinking about you.',
  '😍 You must be a `return` statement — you always come back to me.',
  '😍 Is your name Wi-Fi? Because I feel a connection.',
  '😍 Are you a keyboard? Because you\'re just my type.',
  '😍 You must be a good algorithm — beautifully optimized.'
];

const facts = [
  '💡 Honey never spoils. Archaeologists found 3000-year-old honey in Egyptian tombs.',
  '💡 A day on Venus is longer than a year on Venus.',
  '💡 The first computer bug was an actual bug — a moth found in a relay in 1947.',
  '💡 Bananas are slightly radioactive due to potassium-40.',
  '💡 Cleopatra lived closer in time to the Moon landing than to the construction of the pyramids.',
  '💡 The total weight of all ants on Earth once exceeded the total weight of all humans.',
  '💡 Hot water freezes faster than cold water — this is called the Mpemba effect.',
  '💡 Octopuses have three hearts and blue blood.'
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const funCommands = {
  joke: {
    category: 'fun', desc: 'Get a random joke',
    usage: '.joke', aliases: ['jokes'], permissions: 'all', examples: ['.joke'],
    exec: async (args, sock, jid) => sock.sendMessage(jid, { text: pick(jokes) })
  },
  quote: {
    category: 'fun', desc: 'Get an inspirational quote',
    usage: '.quote', aliases: ['quotes', 'q'], permissions: 'all', examples: ['.quote'],
    exec: async (args, sock, jid) => sock.sendMessage(jid, { text: pick(quotes) })
  },
  ship: {
    category: 'fun', desc: 'Calculate compatibility percentage',
    usage: '.ship', aliases: ['love', 'lovecalc'], permissions: 'all', examples: ['.ship'],
    exec: async (args, sock, jid) => {
      const pct  = Math.floor(Math.random() * 101);
      const rank = pct >= 90 ? '💘 Soulmates!' : pct >= 70 ? '❤️ Great match!' :
                   pct >= 50 ? '💛 Pretty good!' : pct >= 30 ? '💙 Meh, could work...' : '💀 Terrible match.';
      await sock.sendMessage(jid, { text: `💕 *Ship Calculator*\n\nCompatibility: *${pct}%*\nVerdict: ${rank}` });
    }
  },
  dare: {
    category: 'fun', desc: 'Get a dare challenge',
    usage: '.dare', aliases: [], permissions: 'all', examples: ['.dare'],
    exec: async (args, sock, jid) => sock.sendMessage(jid, { text: pick(dares) })
  },
  truth: {
    category: 'fun', desc: 'Get a truth question',
    usage: '.truth', aliases: [], permissions: 'all', examples: ['.truth'],
    exec: async (args, sock, jid) => sock.sendMessage(jid, { text: pick(truths) })
  },
  '8ball': {
    category: 'fun', desc: 'Ask the magic 8-ball a yes/no question',
    usage: '.8ball <question>', aliases: [], permissions: 'all',
    examples: ['.8ball Will I win today?', '.8ball Is today my lucky day?'],
    exec: async (args, sock, jid) => {
      const q = args.join(' ').trim();
      if (!q) return sock.sendMessage(jid, { text: '❓ Ask me something!\n\n*Usage:* .8ball <question>' });
      await sock.sendMessage(jid, { text: `🎱 *Magic 8-Ball*\n\n❓ ${q}\n\n${pick(eightBall)}` });
    }
  },
  roast: {
    category: 'fun', desc: 'Get roasted',
    usage: '.roast', aliases: [], permissions: 'all', examples: ['.roast'],
    exec: async (args, sock, jid) => sock.sendMessage(jid, { text: pick(roasts) })
  },
  compliment: {
    category: 'fun', desc: 'Receive a compliment',
    usage: '.compliment', aliases: ['comp'], permissions: 'all', examples: ['.compliment'],
    exec: async (args, sock, jid) => sock.sendMessage(jid, { text: pick(compliments) })
  },
  insult: {
    category: 'fun', desc: 'Get a (lighthearted) insult',
    usage: '.insult', aliases: [], permissions: 'all', examples: ['.insult'],
    exec: async (args, sock, jid) => sock.sendMessage(jid, { text: pick(insults) })
  },
  flirt: {
    category: 'fun', desc: 'Get a nerdy flirt line',
    usage: '.flirt', aliases: [], permissions: 'all', examples: ['.flirt'],
    exec: async (args, sock, jid) => sock.sendMessage(jid, { text: pick(flirts) })
  },
  fact: {
    category: 'fun', desc: 'Learn a random interesting fact',
    usage: '.fact', aliases: ['facts', 'randomfact'], permissions: 'all', examples: ['.fact'],
    exec: async (args, sock, jid) => sock.sendMessage(jid, { text: pick(facts) })
  },
  iq: {
    category: 'fun', desc: 'Check your (fake) IQ score',
    usage: '.iq', aliases: [], permissions: 'all', examples: ['.iq'],
    exec: async (args, sock, jid, isGroup, sender) => {
      const iq     = Math.floor(Math.random() * 101) + 60; // 60–160
      const label  = iq >= 140 ? '🧠 Genius' : iq >= 120 ? '✨ Very smart' :
                     iq >= 100 ? '📚 Average' : iq >= 80  ? '😐 Below average' : '💀 Yikes...';
      await sock.sendMessage(jid, {
        text: `🧠 *IQ Test*\n\n@${sender.split('@')[0]}, your IQ is *${iq}*\n\n${label}\n\n_Disclaimer: This is just for fun!_`,
        mentions: [sender]
      });
    }
  },
  // ── Riddle game (from reference repo) ──────────────────
  riddle: {
    category: 'fun', desc: 'Start a riddle — reply with .riddle A/B/C/D to answer',
    usage: '.riddle [A|B|C|D]', aliases: [], permissions: 'all',
    examples: ['.riddle', '.riddle B'],
    exec: (() => {
      const RIDDLES = [
        { q: 'What has keys but no locks, space but no room, and you can enter but not go inside?', options: ['A) Computer','B) Keyboard','C) Piano','D) House'], answer: 'B' },
        { q: "I'm tall when I'm young, and short when I'm old. What am I?", options: ['A) Tree','B) Building','C) Candle','D) Person'], answer: 'C' },
        { q: 'What gets wet while drying?', options: ['A) Soap','B) Towel','C) Hair','D) Clothes'], answer: 'B' },
        { q: 'What has one eye but cannot see?', options: ['A) Cyclops','B) Camera','C) Storm','D) Needle'], answer: 'D' },
        { q: 'What goes up but never comes down?', options: ['A) Balloon','B) Age','C) Smoke','D) Airplane'], answer: 'B' },
        { q: 'The more you take, the more you leave behind. What am I?', options: ['A) Time','B) Money','C) Footsteps','D) Breath'], answer: 'C' },
        { q: 'What has a head, a tail, but no body?', options: ['A) Snake','B) Coin','C) Arrow','D) River'], answer: 'B' },
        { q: 'What can travel around the world while staying in a corner?', options: ['A) Shadow','B) Stamp','C) Spider','D) Clock'], answer: 'B' }
      ];
      const active = new Map(); // jid → riddle
      return async (args, sock, jid) => {
        const guess = (args[0] || '').toUpperCase();
        if (guess.match(/^[ABCD]$/)) {
          const r = active.get(jid);
          if (!r) return sock.sendMessage(jid, { text: '❓ No active riddle. Send *.riddle* to start one.' });
          if (guess === r.answer) {
            active.delete(jid);
            return sock.sendMessage(jid, { text: `🎉 Correct! The answer was *${r.answer}*.\n\nSend *.riddle* for another one!` });
          } else {
            return sock.sendMessage(jid, { text: `❌ Wrong! Try again (${r.options.join(' / ')}) or send *.riddle* to skip.` });
          }
        }
        const r = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
        active.set(jid, r);
        await sock.sendMessage(jid, {
          text: `🧩 *Riddle Time!*\n\n${r.q}\n\n${r.options.join('\n')}\n\n_Reply with .riddle A / B / C / D_`
        });
      };
    })()
  },

  hack: {
    category: 'fun', desc: 'Fake-hack someone (for fun)',
    usage: '.hack [@user]', aliases: [], permissions: 'all',
    examples: ['.hack @friend'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const { getMentionedJid } = require('../lib/helpers');
      const target  = getMentionedJid(message) || sender;
      const name    = target.split('@')[0];
      await sock.sendMessage(jid, {
        text:
          `💻 *Hacking @${name}...*\n\n` +
          `[▓▓░░░░░░░░] 20% - Scanning ports...\n` +
          `[▓▓▓▓▓░░░░░] 50% - Bypassing firewall...\n` +
          `[▓▓▓▓▓▓▓▓░░] 80% - Accessing database...\n` +
          `[▓▓▓▓▓▓▓▓▓▓] 100% - Done!\n\n` +
          `✅ Successfully hacked @${name}!\n` +
          `📧 Emails stolen: ${Math.floor(Math.random() * 9999)}\n` +
          `💳 Cards found: ${Math.floor(Math.random() * 5)}\n` +
          `🔑 Passwords: ************\n\n` +
          `_This is just for fun. Stay safe online! 😄_`,
        mentions: [target]
      });
    }
  }
};

module.exports = funCommands;
