'use strict';
// commands/games.js — Mini-games with in-memory state

// ── In-memory game state ──────────────────────────────────
// Each entry includes an `expires` timestamp so abandoned games are
// automatically swept out — prevents indefinite memory growth.
const GAME_TTL_MS    = 15 * 60 * 1000; // 15 minutes of inactivity
const ticTacToeGames = new Map(); // jid → { board, turn, players, expires }
const hangmanGames   = new Map(); // jid → { word, guessed, lives, expires }
const guessGames     = new Map(); // jid → { number, tries, expires }

function touch(map, jid) {
  const entry = map.get(jid);
  if (entry) entry.expires = Date.now() + GAME_TTL_MS;
}

function sweepExpired() {
  const now = Date.now();
  for (const map of [ticTacToeGames, hangmanGames, guessGames]) {
    for (const [key, val] of map) {
      if (val.expires && val.expires < now) map.delete(key);
    }
  }
}

// Run sweep every 5 minutes
setInterval(sweepExpired, 5 * 60 * 1000).unref();

// ── Trivia questions ──────────────────────────────────────
const TRIVIA = [
  { q: 'What is the capital of Nigeria?',        a: ['abuja'] },
  { q: 'What is 7 × 8?',                          a: ['56'] },
  { q: 'Which planet is known as the Red Planet?',a: ['mars'] },
  { q: 'What language is WhatsApp written in?',   a: ['erlang'] },
  { q: 'How many sides does a hexagon have?',      a: ['6', 'six'] },
  { q: 'Who invented the telephone?',              a: ['bell', 'alexander graham bell', 'graham bell'] },
  { q: 'What is the boiling point of water in °C?',a: ['100'] },
  { q: 'Which ocean is the largest?',              a: ['pacific', 'pacific ocean'] },
  { q: 'What does HTML stand for?',
    a: ['hypertext markup language', 'hyper text markup language'] },
  { q: 'How many bytes in a kilobyte?',            a: ['1024'] },
  { q: 'What color do you get mixing blue and yellow?', a: ['green'] },
  { q: 'What is the fastest land animal?',         a: ['cheetah'] },
  { q: 'What year did World War II end?',           a: ['1945'] },
  { q: 'Who wrote Romeo and Juliet?',              a: ['shakespeare', 'william shakespeare'] },
  { q: 'What is the square root of 144?',          a: ['12'] }
];
const activeTrivia = new Map(); // jid → { q, a, asker }

// ── Hangman words ─────────────────────────────────────────
const HANGMAN_WORDS = [
  'javascript', 'typescript', 'python', 'algorithm', 'database',
  'network', 'security', 'framework', 'variable', 'function',
  'whatsapp', 'programming', 'developer', 'interface', 'keyboard',
  'monitor', 'software', 'hardware', 'internet', 'blockchain'
];

function renderTTT(board) {
  const s = ['1','2','3','4','5','6','7','8','9'];
  return board.map((v, i) => v || s[i]).reduce((acc, v, i) => {
    acc += v === 'X' ? `❌` : v === 'O' ? `⭕` : `${v}️⃣`;
    if ((i + 1) % 3 === 0) acc += '\n';
    return acc;
  }, '');
}

function checkTTTWin(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return lines.some(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]);
}

function renderHangman(game) {
  const display = game.word.split('').map(c => game.guessed.has(c) ? c : '_').join(' ');
  const wrong   = [...game.guessed].filter(c => !game.word.includes(c));
  return (
    `💀 *Hangman* — ${game.lives} lives left\n\n` +
    `Word : ${display}\n` +
    `Wrong: ${wrong.join(', ') || '—'}\n` +
    `Guessed: ${[...game.guessed].join(', ') || '—'}`
  );
}

const gamesCommands = {

  tictactoe: {
    category: 'games', desc: 'Play Tic-Tac-Toe (reply to start)',
    usage: '.tictactoe [@opponent | <1-9>]', aliases: ['ttt', 'tic'],
    permissions: 'all',
    examples: ['.tictactoe @user — start a game', '.tictactoe 5 — place a move on square 5'],
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const game = ticTacToeGames.get(jid);
      const { getMentionedJid } = require('../lib/helpers');
      const opponent = getMentionedJid(message);

      // ── Start a new game ──────────────────────────────────
      if (!game && opponent && opponent !== sender) {
        const newGame = {
          board:   Array(9).fill(null),
          turn:    'X',
          players: { X: sender, O: opponent },
          expires: Date.now() + GAME_TTL_MS
        };
        ticTacToeGames.set(jid, newGame);
        return sock.sendMessage(jid, {
          text:
            `🎮 *Tic-Tac-Toe Started!*\n\n` +
            `❌ @${sender.split('@')[0]} vs ⭕ @${opponent.split('@')[0]}\n\n` +
            `${renderTTT(newGame.board)}\n\n` +
            `@${sender.split('@')[0]}'s turn (❌)\nUse *.tictactoe <1-9>* to place your mark.`,
          mentions: [sender, opponent]
        });
      }

      // ── Make a move ───────────────────────────────────────
      if (game) {
        const move = parseInt(args[0], 10);
        if (!move || move < 1 || move > 9) {
          return sock.sendMessage(jid, { text: `❌ Use *.tictactoe <1-9>* to place your mark.\n\n${renderTTT(game.board)}` });
        }
        const currentPlayer = game.players[game.turn];
        if (sender !== currentPlayer) {
          return sock.sendMessage(jid, { text: `⏳ It's not your turn! Waiting for @${currentPlayer.split('@')[0]}`, mentions: [currentPlayer] });
        }
        const idx = move - 1;
        if (game.board[idx]) {
          return sock.sendMessage(jid, { text: `❌ Square ${move} is already taken! Choose another.` });
        }
        game.board[idx] = game.turn;
        touch(ticTacToeGames, jid);

        if (checkTTTWin(game.board)) {
          ticTacToeGames.delete(jid);
          return sock.sendMessage(jid, {
            text: `🏆 *@${sender.split('@')[0]} wins!*\n\n${renderTTT(game.board)}`,
            mentions: [sender]
          });
        }
        if (game.board.every(Boolean)) {
          ticTacToeGames.delete(jid);
          return sock.sendMessage(jid, { text: `🤝 *It's a draw!*\n\n${renderTTT(game.board)}` });
        }

        game.turn = game.turn === 'X' ? 'O' : 'X';
        const next = game.players[game.turn];
        return sock.sendMessage(jid, {
          text:
            `${renderTTT(game.board)}\n\n` +
            `@${next.split('@')[0]}'s turn (${game.turn === 'X' ? '❌' : '⭕'})`,
          mentions: [next]
        });
      }

      // ── No game, no opponent ──────────────────────────────
      await sock.sendMessage(jid, {
        text: `🎮 *Tic-Tac-Toe*\n\nMention an opponent to start:\n*.tictactoe @user*\n\nCurrently no active game.`
      });
    }
  },

  hangman: {
    category: 'games', desc: 'Play Hangman (guess letters one by one)',
    usage: '.hangman [start | <letter>]', aliases: ['hm'],
    permissions: 'all',
    examples: ['.hangman start — begin a new game', '.hangman a — guess letter a'],
    exec: async (args, sock, jid) => {
      const input = (args[0] || '').toLowerCase();

      if (input === 'start' || !hangmanGames.has(jid)) {
        const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
        hangmanGames.set(jid, { word, guessed: new Set(), lives: 6, expires: Date.now() + GAME_TTL_MS });
        return sock.sendMessage(jid, {
          text:
            `🔤 *Hangman Started!*\n\n${renderHangman(hangmanGames.get(jid))}\n\n` +
            `Guess a letter: *.hangman <a-z>*`
        });
      }

      const game = hangmanGames.get(jid);
      if (!input || input.length !== 1 || !/[a-z]/.test(input)) {
        return sock.sendMessage(jid, { text: `❌ Guess a single letter.\n\n${renderHangman(game)}` });
      }
      if (game.guessed.has(input)) {
        return sock.sendMessage(jid, { text: `⚠️ You already guessed *${input}*.\n\n${renderHangman(game)}` });
      }

      game.guessed.add(input);
      touch(hangmanGames, jid);
      if (!game.word.includes(input)) game.lives--;

      const solved = game.word.split('').every(c => game.guessed.has(c));
      if (solved) {
        hangmanGames.delete(jid);
        return sock.sendMessage(jid, {
          text: `🎉 *You won!* The word was *${game.word.toUpperCase()}*!\n\nType *.hangman start* to play again.`
        });
      }
      if (game.lives <= 0) {
        hangmanGames.delete(jid);
        return sock.sendMessage(jid, {
          text: `💀 *Game over!* The word was *${game.word.toUpperCase()}*.\n\nType *.hangman start* to try again.`
        });
      }

      await sock.sendMessage(jid, {
        text: `${renderHangman(game)}\n\n${game.word.includes(input) ? `✅ Good guess! _${input}_ is in the word.` : `❌ Wrong! _${input}_ is not in the word.`}`
      });
    }
  },

  trivia: {
    category: 'games', desc: 'Answer a random trivia question',
    usage: '.trivia [answer]', aliases: ['quiz'],
    permissions: 'all',
    examples: ['.trivia — get a question', '.trivia Abuja — answer a question'],
    exec: async (args, sock, jid, isGroup, sender) => {
      const current = activeTrivia.get(jid);

      // ── Answering ─────────────────────────────────────────
      if (current && args.length) {
        const userAns = args.join(' ').toLowerCase().trim();
        if (current.answers.some(a => a === userAns)) {
          activeTrivia.delete(jid);
          return sock.sendMessage(jid, {
            text: `🎉 *Correct!* @${sender.split('@')[0]}\n\n✅ Answer: *${current.answers[0].toUpperCase()}*`,
            mentions: [sender]
          });
        }
        return sock.sendMessage(jid, {
          text: `❌ Wrong! Try again.\n\n❓ ${current.question}\n\n_Type *.trivia <answer>*_`
        });
      }

      // ── New question ──────────────────────────────────────
      if (current) {
        return sock.sendMessage(jid, {
          text: `⏳ There\'s an active question!\n\n❓ ${current.question}\n\n_Type *.trivia <answer>* to respond._`
        });
      }

      const item = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
      activeTrivia.set(jid, { question: item.q, answers: item.a });
      setTimeout(() => activeTrivia.delete(jid), 60000); // expire after 60s

      await sock.sendMessage(jid, {
        text: `🧠 *Trivia Question*\n\n❓ ${item.q}\n\n_Type *.trivia <answer>* — expires in 60s_`
      });
    }
  },

  guess: {
    category: 'games', desc: 'Guess the secret number (1–100)',
    usage: '.guess [start | <number>]', aliases: ['number', 'numguess'],
    permissions: 'all',
    examples: ['.guess start — begin game', '.guess 42 — guess the number'],
    exec: async (args, sock, jid, isGroup, sender) => {
      const input = (args[0] || '').toLowerCase();

      if (input === 'start' || !guessGames.has(jid)) {
        guessGames.set(jid, {
          number:  Math.floor(Math.random() * 100) + 1,
          tries:   0,
          expires: Date.now() + GAME_TTL_MS
        });
        return sock.sendMessage(jid, {
          text:
            `🎰 *Number Guessing Game!*\n\n` +
            `I'm thinking of a number between *1 and 100*.\n\n` +
            `Type *.guess <number>* to make a guess!\n` +
            `You have *10 attempts*.`
        });
      }

      const game   = guessGames.get(jid);
      const n      = parseInt(args[0], 10);
      if (!n || n < 1 || n > 100) {
        return sock.sendMessage(jid, { text: `❌ Please guess a number between 1 and 100.\n\nAttempts used: ${game.tries}/10` });
      }

      game.tries++;
      touch(guessGames, jid);

      if (n === game.number) {
        guessGames.delete(jid);
        return sock.sendMessage(jid, {
          text: `🎉 *@${sender.split('@')[0]} got it!* The number was *${game.number}*!\n\nAttempts: ${game.tries}\n\nType *.guess start* to play again.`,
          mentions: [sender]
        });
      }

      if (game.tries >= 10) {
        guessGames.delete(jid);
        return sock.sendMessage(jid, {
          text: `💀 *Game over!* The number was *${game.number}*.\n\nType *.guess start* to try again.`
        });
      }

      const hint = n < game.number ? '📈 Too low!' : '📉 Too high!';
      await sock.sendMessage(jid, {
        text: `${hint} Guess: *${n}*\n\nAttempts: ${game.tries}/10 — Keep trying!`
      });
    }
  }
};

module.exports = gamesCommands;
