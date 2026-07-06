// Economy System — balance, daily, work, pay, leaderboard
const db = require('../lib/database');
const { getMentionedJid, formatNumber, isSameDay, cooldownLeft, formatDuration, pickRandom } = require('../lib/helpers');

const DAILY_AMOUNT = 500;
const WORK_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours
const WORK_MIN = 50;
const WORK_MAX = 300;

const WORK_MESSAGES = [
  'You delivered packages and earned 💰 *@coins* coins!',
  'You fixed bugs for a client and earned 💰 *@coins* coins!',
  'You ran errands all day and earned 💰 *@coins* coins!',
  'You sold some old electronics and earned 💰 *@coins* coins!',
  'You won a small online tournament and earned 💰 *@coins* coins!',
  'You completed a freelance gig and earned 💰 *@coins* coins!'
];

const economyCommands = {
  balance: {
    desc: 'Check your coin balance (or mention a user)',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      // If a user is mentioned, show their balance; otherwise show sender's
      const target = getMentionedJid(message) || sender;
      const user = db.getUser(target);
      const name = target.split('@')[0];
      await sock.sendMessage(jid, {
        text: `💰 *Balance*\n\n👤 User  : @${name}\n💵 Coins : ${formatNumber(user.balance)}\n⭐ XP    : ${formatNumber(user.xp)}\n🏅 Level : ${user.level}`,
        mentions: [target]
      });
    }
  },

  daily: {
    desc: 'Claim your daily coin reward',
    exec: async (args, sock, jid, isGroup, sender) => {
      const user = db.getUser(sender);

      if (isSameDay(user.lastDaily)) {
        const ms = cooldownLeft(user.lastDaily, 86400000);
        return sock.sendMessage(jid, {
          text: `⏳ You already claimed your daily reward.\n\nCome back in *${formatDuration(ms)}*!`
        });
      }

      db.updateUser(sender, { lastDaily: new Date().toISOString() });
      db.addBalance(sender, DAILY_AMOUNT);
      db.addXP(sender, 50);

      await sock.sendMessage(jid, {
        text: `🎁 *Daily Reward*\n\n✅ You claimed *${formatNumber(DAILY_AMOUNT)}* coins!\n💰 Balance: ${formatNumber(db.getUser(sender).balance)}\n\nCome back tomorrow for more!`
      });
    }
  },

  work: {
    desc: 'Work to earn coins (3h cooldown)',
    exec: async (args, sock, jid, isGroup, sender) => {
      const user = db.getUser(sender);
      const remaining = cooldownLeft(user.lastWork, WORK_COOLDOWN_MS);

      if (remaining > 0) {
        return sock.sendMessage(jid, {
          text: `⏳ You're tired from working.\n\nRest for *${formatDuration(remaining)}* before working again.`
        });
      }

      const coins = Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
      db.updateUser(sender, { lastWork: new Date().toISOString() });
      db.addBalance(sender, coins);
      db.addXP(sender, 20);

      const msg = pickRandom(WORK_MESSAGES).replace('@coins', formatNumber(coins));
      await sock.sendMessage(jid, {
        text: `💼 *Work Result*\n\n${msg}\n💰 Balance: ${formatNumber(db.getUser(sender).balance)}`
      });
    }
  },

  pay: {
    desc: 'Pay coins to another user',
    exec: async (args, sock, jid, isGroup, sender, message) => {
      const target = getMentionedJid(message);
      const amountStr = args.find(a => /^\d+$/.test(a));

      if (!target || !amountStr) {
        return sock.sendMessage(jid, {
          text: '❌ Usage: .pay @user <amount>\nExample: .pay @friend 100'
        });
      }

      const amount = parseInt(amountStr, 10);
      if (amount <= 0) return sock.sendMessage(jid, { text: '❌ Amount must be positive.' });

      const payer = db.getUser(sender);
      if (payer.balance < amount) {
        return sock.sendMessage(jid, {
          text: `❌ Insufficient funds.\nYour balance: *${formatNumber(payer.balance)}* coins`
        });
      }

      db.addBalance(sender, -amount);
      db.addBalance(target, amount);

      await sock.sendMessage(jid, {
        text: `💸 *Payment Sent!*\n\n@${sender.split('@')[0]} → @${target.split('@')[0]}\n💰 Amount: ${formatNumber(amount)} coins`,
        mentions: [sender, target]
      });
    }
  },

  leaderboard: {
    desc: 'Top 10 richest users',
    exec: async (args, sock, jid) => {
      const top = db.getLeaderboard('balance', 10);
      if (!top.length) return sock.sendMessage(jid, { text: '📊 No users in the leaderboard yet.' });

      const medals = ['🥇', '🥈', '🥉'];
      const rows = top.map((u, i) => {
        const medal = medals[i] || `${i + 1}.`;
        return `${medal} @${u.id} — ${formatNumber(u.balance)} coins`;
      }).join('\n');

      const mentions = top.map(u => `${u.id}@s.whatsapp.net`);

      await sock.sendMessage(jid, {
        text: `🏆 *Coin Leaderboard*\n\n${rows}`,
        mentions
      });
    }
  },

  xpleaderboard: {
    desc: 'Top 10 highest XP users',
    exec: async (args, sock, jid) => {
      const top = db.getLeaderboard('xp', 10);
      if (!top.length) return sock.sendMessage(jid, { text: '📊 No users yet.' });

      const rows = top.map((u, i) => `${i + 1}. @${u.id} — ${formatNumber(u.xp)} XP (Lv.${u.level})`).join('\n');
      const mentions = top.map(u => `${u.id}@s.whatsapp.net`);

      await sock.sendMessage(jid, { text: `⭐ *XP Leaderboard*\n\n${rows}`, mentions });
    }
  },

  profile: {
    desc: 'View your full profile',
    exec: async (args, sock, jid, isGroup, sender) => {
      const user = db.getUser(sender);
      const xpNext = (user.level * 500) - user.xp;
      await sock.sendMessage(jid, {
        text: `👤 *Profile — @${sender.split('@')[0]}*\n\n` +
          `💰 Balance : ${formatNumber(user.balance)} coins\n` +
          `⭐ XP      : ${formatNumber(user.xp)}\n` +
          `🏅 Level   : ${user.level}\n` +
          `📈 Next Lv : ${formatNumber(Math.max(0, xpNext))} XP needed\n` +
          `⚠️ Warnings: ${user.warnings}\n` +
          `📅 Joined  : ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}`,
        mentions: [sender]
      });
    }
  }
};

module.exports = economyCommands;
