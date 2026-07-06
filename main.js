const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
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

// ─── Single socket reference + concurrency guards ─────────
let sock = null;
let isConnecting = false;   // prevents simultaneous connectToWhatsApp() calls
let reconnectTimer = null;  // holds the pending setTimeout so we can cancel it

// ─── Connection ───────────────────────────────────────────
async function connectToWhatsApp() {
  // ── Guard: never run two connect attempts at the same time ──
  if (isConnecting) {
    console.log('[WA] Connection attempt already in progress, skipping.');
    return;
  }
  isConnecting = true;

  // ── Cancel any queued reconnect ──
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // ── Tear down the old socket cleanly before creating a new one ──
  if (sock) {
    try { sock.ev.removeAllListeners(); } catch (_) {}
    try { sock.end(null); } catch (_) {}
    sock = null;
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const newSock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '121.0.6167.160'],
      connectTimeoutMs: 60_000,      // give server 60s to accept the handshake
      keepAliveIntervalMs: 25_000,   // ping every 25s to prevent 408 timeouts
      retryRequestDelayMs: 3_000,    // internal Baileys retry spacing
      maxMsListenerCount: 50         // sane cap; 1000 was a sign of listener leaks
    });

    // Assign globally only after successful construction
    sock = newSock;
    isConnecting = false;

    // ── Register all listeners on `newSock` (captured in closure) ──
    // Using `newSock` instead of `sock` means stale listeners from a previous
    // cycle cannot accidentally affect a newer socket after reassignment.

    newSock.ev.on('connection.update', async (update) => {
      // Stale-socket guard: ignore events from a socket that's no longer current
      if (newSock !== sock) return;

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n⚠️  QR detected — requesting pairing code...');
        const phoneNumber = await askPhoneNumber();
        console.log(`✅ Number: ${phoneNumber}`);
        try {
          const code = await newSock.requestPairingCode(phoneNumber);
          console.log(`\n📱 PAIRING CODE: ${code}`);
          console.log('WhatsApp → Settings → Linked Devices → Link Device → Enter code\n');
        } catch (err) {
          console.error('Pairing code failed:', err.message);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = Object.keys(DisconnectReason).find(
          k => DisconnectReason[k] === statusCode
        ) || statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WA] Connection closed — reason: ${reason} (${statusCode}), reconnect: ${shouldReconnect}`);

        if (!shouldReconnect) {
          console.log('[WA] Logged out. Delete auth_info_baileys/ and restart to re-pair.');
          return;
        }

        // 408 = server-side timeout; give it more breathing room
        const backoffMs = statusCode === 408 ? 15_000 : 5_000;
        console.log(`[WA] Reconnecting in ${backoffMs / 1000}s...`);

        // Use setTimeout — never call connectToWhatsApp() directly inside the
        // event handler, that stacks async calls and causes duplicate sessions
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectToWhatsApp();
        }, backoffMs);

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

    newSock.ev.on('creds.update', saveCreds);

    // ── Incoming messages ──
    newSock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (newSock !== sock) return; // stale-socket guard
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
          await handleStatusUpdate(newSock, [message]);
          continue;
        }

        // Check if user is banned
        if (db.isBanned(sender)) continue;

        // Auto-react (fires before command check)
        await handleAutoReact(newSock, message);

        // Anti-view-once
        await handleAntiViewOnce(newSock, message);

        const text =
          message.message.conversation ||
          message.message.extendedTextMessage?.text || '';

        // Refresh prefix from db/config in case it was changed at runtime
        const prefix = db.getSetting('prefix') || botConfig.prefix || '.';

        // Anti-link (check all messages with text)
        if (text && isJidGroup(jid)) {
          const blocked = await handleAntiLink(newSock, message);
          if (blocked) continue;
          await handleAntiSpam(newSock, message);
        }

        // Commands
        if (!text.startsWith(prefix)) continue;

        const args = text.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        if (!command) continue;

        try {
          await handleCommand(command, args, message, newSock, botConfig);
        } catch (err) {
          console.error(`Command "${command}" threw:`, err.message);
        }
      }
    });

    // ── Deleted messages ──
    newSock.ev.on('messages.delete', async (item) => {
      if (newSock !== sock) return;
      if ('keys' in item) {
        await handleAntiDelete(newSock, item.keys);
      } else if ('jid' in item) {
        await handleAntiDelete(newSock, [{ id: item.ids?.[0], remoteJid: item.jid }]);
      }
    });

    // ── Group participant events ──
    newSock.ev.on('group-participants.update', async (update) => {
      if (newSock !== sock) return;
      try {
        await handleParticipantUpdate(newSock, update);
      } catch (err) {
        console.error('Participant update error:', err.message);
      }
    });

  } catch (err) {
    // Release the lock even on startup failure so a retry is possible
    isConnecting = false;
    console.error('[WA] connectToWhatsApp() failed:', err.message);
    console.log('[WA] Retrying in 10s...');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectToWhatsApp();
    }, 10_000);
  }
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
