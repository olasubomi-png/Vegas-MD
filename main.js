const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  isJidGroup
} = require('baileys');
const readline = require('readline');
const db = require('./lib/database');
const { normalizeJid } = require('./lib/helpers');
const { handleParticipantUpdate } = require('./events/welcome');
const {
  cacheMessage,
  handleAntiDelete,
  handleAntiLink,
  handleAntiSpam,
  handleAntiViewOnce,
  handleAutoReact
} = require('./events/protection');
const { handleStatusUpdate } = require('./events/autoStatus');
const allCommands = require('./commands/index');
require('dotenv').config();

// ─── Bot configuration ────────────────────────────────────
const botConfig = {
  name: process.env.BOT_NAME || 'OLASUBOMI-MD',
  version: '3.0.0',
  beta: 'Beta',
  prefix: db.getSetting('prefix', null) || process.env.BOT_PREFIX || '.',
  mode: db.getSetting('mode', null) || process.env.BOT_MODE || 'private',
  ownerNumber: process.env.OWNER_NUMBER || '',
  ownerName: process.env.OWNER_NAME || 'Olasubomi',
  description: 'Advanced WhatsApp Bot'
};

global.botStartTime = Date.now();
global.botConfig = botConfig;
global.db = db;

let sock;

// ─── Connection ───────────────────────────────────────────
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '121.0.6167.160'],
    maxMsListenerCount: 1000
  });

  // ── Connection state ──
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n⚠️  QR detected — requesting pairing code...');
      const phoneNumber = await askPhoneNumber();
      console.log(`✅ Number: ${phoneNumber}`);
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n📱 PAIRING CODE: ${code}`);
        console.log('WhatsApp → Settings → Linked Devices → Link Device → Enter code\n');
      } catch (err) {
        console.error('Pairing code failed:', err.message);
      }
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      const reconnect = status !== DisconnectReason.loggedOut;
      console.log(`Connection closed (${status}). Reconnect: ${reconnect}`);
      if (reconnect) { await delay(3000); connectToWhatsApp(); }
    } else if (connection === 'open') {
      console.log(`\n✅ ${botConfig.name} Connected!`);
      console.log('═'.repeat(32));
      console.log(`Name    : ${botConfig.name}`);
      console.log(`Version : ${botConfig.version} ${botConfig.beta}`);
      console.log(`Prefix  : ${botConfig.prefix}`);
      console.log(`Mode    : ${botConfig.mode}`);
      console.log(`Commands: ${Object.keys(allCommands).length}`);
      console.log(`Owner   : ${botConfig.ownerNumber || 'Not set'}`);
      console.log('═'.repeat(32) + '\n');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Incoming messages ──
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const message of messages) {
      if (!message.message) continue;

      const jid = message.key.remoteJid;
      const sender = message.key.participant || jid;
      const fromMe = message.key.fromMe;

      // Cache for anti-delete (all messages, including own)
      cacheMessage(message);

      if (fromMe) continue;

      // Auto-status view
      if (jid === 'status@broadcast') {
        await handleStatusUpdate(sock, [message]);
        continue;
      }

      // Check if user is banned
      if (db.isBanned(sender)) continue;

      // Auto-react (fires before command check)
      await handleAutoReact(sock, message);

      // Anti-view-once
      await handleAntiViewOnce(sock, message);

      const text =
        message.message.conversation ||
        message.message.extendedTextMessage?.text || '';

      // Refresh prefix from db/config in case it was changed at runtime
      const prefix = db.getSetting('prefix') || botConfig.prefix || '.';

      // Anti-link (check all messages with text)
      if (text && isJidGroup(jid)) {
        const blocked = await handleAntiLink(sock, message);
        if (blocked) continue;

        await handleAntiSpam(sock, message);
      }

      // Commands
      if (!text.startsWith(prefix)) continue;

      const args = text.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();
      if (!command) continue;

      try {
        await handleCommand(command, args, message, sock, botConfig);
      } catch (err) {
        console.error(`Command "${command}" threw:`, err.message);
      }
    }
  });

  // ── Deleted messages ──
  sock.ev.on('messages.delete', async (item) => {
    if ('keys' in item) {
      await handleAntiDelete(sock, item.keys);
    } else if ('jid' in item) {
      await handleAntiDelete(sock, [{ id: item.ids?.[0], remoteJid: item.jid }]);
    }
  });

  // ── Group participant events ──
  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handleParticipantUpdate(sock, update);
    } catch (err) {
      console.error('Participant update error:', err.message);
    }
  });
}

// ─── Phone number prompt ──────────────────────────────────
async function askPhoneNumber() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('📱 Enter WhatsApp number (with country code, digits only): ', (ans) => {
      rl.close();
      resolve(ans.trim().replace(/\D/g, ''));
    });
  });
}

// ─── Authorization helpers ────────────────────────────────
async function isGroupAdmin(jid, senderJid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta.participants.some(
      p => p.id === senderJid && (p.admin === 'admin' || p.admin === 'superadmin')
    );
  } catch { return false; }
}

// ─── Command dispatcher ───────────────────────────────────
async function handleCommand(command, args, message, sock, botConfig) {
  const jid = message.key.remoteJid;
  const isGroup = isJidGroup(jid);
  const sender = message.key.participant || jid;
  const senderNum = normalizeJid(sender);
  const ownerNum = normalizeJid(botConfig.ownerNumber);

  // Enforce private mode — fail-safe: if private and no owner configured, block everyone
  if (botConfig.mode === 'private') {
    if (!ownerNum) {
      return sock.sendMessage(jid, {
        text: `🔒 Bot is in *private mode* but OWNER_NUMBER is not set.\n\nAdd it as a Replit Secret to activate the bot.`
      });
    }
    if (senderNum !== ownerNum) return; // Silently ignore non-owners
  }

  const cmd = allCommands[command];

  if (!cmd) {
    return sock.sendMessage(jid, {
      text: `❌ Unknown command: *${command}*\nType *${botConfig.prefix}menu* for help.`
    });
  }

  // Attach helpers to message object for use in command handlers
  message._isOwner = ownerNum ? senderNum === ownerNum : false;
  message._isGroupAdmin = isGroup ? () => isGroupAdmin(jid, sender) : async () => false;

  try {
    await cmd.exec(args, sock, jid, isGroup, sender, message, botConfig);
  } catch (err) {
    console.error(`Error in .${command}:`, err.message);
    await sock.sendMessage(jid, { text: `❌ Error in .${command}: ${err.message}` });
  }
}

// ─── Start ────────────────────────────────────────────────
console.log('🚀 Starting OLASUBOMI-MD...');
connectToWhatsApp().catch(err => console.error('Startup failed:', err.message));
