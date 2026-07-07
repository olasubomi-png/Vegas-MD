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
  name:        process.env.BOT_NAME   || 'OLASUBOMI-MD',
  version:     '3.0.0',
  beta:        'Beta',
  prefix:      db.getSetting('prefix', null) || process.env.BOT_PREFIX || '.',
  mode:        db.getSetting('mode',   null) || process.env.BOT_MODE   || 'private',
  ownerNumber: process.env.OWNER_NUMBER || '',
  ownerName:   process.env.OWNER_NAME  || 'Olasubomi',
  description: 'Advanced WhatsApp Bot'
};

global.botStartTime = Date.now();
global.botConfig    = botConfig;
global.db           = db;

// ─── Socket state — one socket at a time ──────────────────
let currentSock    = null;
let isConnecting   = false;
let reconnectTimer = null;

// ─────────────────────────────────────────────────────────
// destroySocket — remove all listeners then close the WS
// ─────────────────────────────────────────────────────────
function destroySocket(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch (_) {}
  try { sock.end(null); }              catch (_) {}
}

// ─────────────────────────────────────────────────────────
// createSocket — construct Baileys socket with no listeners
//
// Key options explained:
//   syncFullHistory: false
//     Tells Baileys to skip the full history sync on first
//     connection.  Without this, Baileys calls ev.buffer()
//     and holds ALL events (including messages.upsert) frozen
//     until the sync completes.  On accounts with many
//     messages this can stall indefinitely.
//
//   getMessage: async () => undefined
//     Required by Baileys for message-retry logic.
//     Returning undefined is safe and matches the default.
// ─────────────────────────────────────────────────────────
function createSocket(state) {
  return makeWASocket({
    auth:                state,
    printQRInTerminal:   false,
    browser:             ['Ubuntu', 'Chrome', '121.0.6167.160'],
    connectTimeoutMs:    60_000,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 250,
    maxMsListenerCount:  50,
    // ── CRITICAL FIX #1 ───────────────────────────────────
    // Skip full history sync so the event buffer is never held
    // open waiting for a sync notification that may never come.
    syncFullHistory:     false,
    // Provide a getMessage fallback so retry logic never throws
    getMessage:          async () => undefined,
  });
}

// ─────────────────────────────────────────────────────────
// attachHandlers — subscribe to ALL events via sock.ev.process()
//
// WHY process() instead of sock.ev.on():
//   Baileys v7 buffers events and flushes them as a single
//   map via nativeEv.emit('event', map).  sock.ev.process()
//   subscribes *directly* to that native 'event' emission.
//   sock.ev.on(eventName, cb) relies on an internal re-emitter
//   that converts the map back to individual events — one extra
//   indirection that can silently break.  process() removes
//   that layer.
// ─────────────────────────────────────────────────────────
function attachHandlers(sock, saveCreds) {
  console.log('[WA] attachHandlers: attaching via sock.ev.process()');

  // ── CRITICAL FIX #2 ──────────────────────────────────
  // Use sock.ev.process() — direct subscriber to the flushed
  // event map.  All event types handled in one place.
  sock.ev.process(async (events) => {

    // ── Credentials ──────────────────────────────────────
    if (events['creds.update']) {
      await saveCreds();
    }

    // ── Connection lifecycle ──────────────────────────────
    if (events['connection.update']) {
      const { connection, lastDisconnect, qr } = events['connection.update'];

      if (qr) {
        console.log('\n⚠️  QR — requesting pairing code...');
        const phoneNumber = await askPhoneNumber();
        console.log(`✅ Number: ${phoneNumber}`);
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          console.log(`\n📱 PAIRING CODE: ${code}`);
          console.log('WhatsApp → Settings → Linked Devices → Link Device → Enter code\n');
        } catch (err) {
          console.error('[WA] Pairing code failed:', err.message);
        }
      }

      if (connection === 'close') {
        const statusCode    = lastDisconnect?.error?.output?.statusCode;
        const reasonName    = Object.keys(DisconnectReason).find(
                                k => DisconnectReason[k] === statusCode
                              ) || statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WA] Connection closed — ${reasonName}(${statusCode}), reconnect: ${shouldReconnect}`);

        if (!shouldReconnect) {
          console.log('[WA] Logged out. Delete auth_info_baileys/ and restart.');
          return;
        }
        const backoffMs = statusCode === 408 ? 15_000 : 5_000;
        console.log(`[WA] Reconnecting in ${backoffMs / 1000}s...`);
        scheduleReconnect(backoffMs);
      }

      if (connection === 'open') {
        console.log(`\n✅ ${botConfig.name} connected!`);
        console.log('═'.repeat(36));
        console.log(`  Version  : ${botConfig.version} ${botConfig.beta}`);
        console.log(`  Prefix   : ${botConfig.prefix}`);
        console.log(`  Mode     : ${botConfig.mode}`);
        console.log(`  Commands : ${Object.keys(allCommands).length}`);
        console.log(`  Owner    : ${botConfig.ownerNumber || '⚠  Not set'}`);
        console.log('═'.repeat(36) + '\n');
      }
    }

    // ── Incoming messages ─────────────────────────────────
    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];

      // Log EVERY upsert so we can verify the listener fires after reconnect
      console.log(`[WA] messages.upsert — type: ${type}, count: ${messages.length}`);

      if (type !== 'notify') {
        console.log(`[WA] skipping non-notify type: ${type}`);
        return;
      }

      for (const message of messages) {
        // Log raw message key for debugging
        console.log(`[WA] msg key: jid=${message.key?.remoteJid} fromMe=${message.key?.fromMe} id=${message.key?.id}`);

        if (!message.message) {
          console.log('[WA] skipping: message.message is null (stub/protocol)');
          continue;
        }

        const jid    = message.key.remoteJid;
        const sender = message.key.participant || jid;

        // Cache for anti-delete
        cacheMessage(message);

        if (message.key.fromMe) {
          console.log('[WA] skipping: fromMe');
          continue;
        }

        // Status updates
        if (jid === 'status@broadcast') {
          await handleStatusUpdate(sock, [message]).catch(e =>
            console.error('[handler] autoStatus:', e.message)
          );
          continue;
        }

        // Banned users
        if (db.isBanned(sender)) {
          console.log(`[WA] skipping: sender ${sender} is banned`);
          continue;
        }

        await handleAutoReact(sock, message).catch(e =>
          console.error('[handler] autoReact:', e.message)
        );
        await handleAntiViewOnce(sock, message).catch(e =>
          console.error('[handler] antiViewOnce:', e.message)
        );

        const text =
          message.message.conversation ||
          message.message.extendedTextMessage?.text ||
          message.message.imageMessage?.caption     || '';

        console.log(`[WA] text: "${text}"`);

        const prefix = db.getSetting('prefix') || botConfig.prefix || '.';

        if (text && isJidGroup(jid)) {
          const blocked = await handleAntiLink(sock, message, botConfig).catch(e => {
            console.error('[handler] antiLink:', e.message);
            return false;
          });
          if (blocked) continue;
          await handleAntiSpam(sock, message, botConfig).catch(e =>
            console.error('[handler] antiSpam:', e.message)
          );
        }

        // Command routing
        if (!text.startsWith(prefix)) {
          console.log(`[WA] not a command (prefix "${prefix}" not matched)`);
          continue;
        }

        const parts   = text.slice(prefix.length).trim().split(/ +/);
        const command = parts.shift().toLowerCase();
        if (!command) continue;

        console.log(`[WA] dispatching command: .${command}`);

        handleCommand(command, parts, message, sock, botConfig).catch(err =>
          console.error(`[cmd] .${command} unhandled:`, err.message)
        );
      }
    }

    // ── Deleted messages ──────────────────────────────────
    if (events['messages.delete']) {
      // consolidateEvents always produces { keys: [...] }
      const keys = events['messages.delete'].keys || [];
      await handleAntiDelete(sock, keys).catch(e =>
        console.error('[handler] antiDelete:', e.message)
      );
    }

    // ── Group participant changes ─────────────────────────
    if (events['group-participants.update']) {
      await handleParticipantUpdate(sock, events['group-participants.update']).catch(e =>
        console.error('[handler] participantUpdate:', e.message)
      );
    }
  });
}

// ─────────────────────────────────────────────────────────
// scheduleReconnect — always via setTimeout, never from
// inside an event handler, to prevent stacked async calls
// ─────────────────────────────────────────────────────────
function scheduleReconnect(delayMs) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delayMs);
}

// ─────────────────────────────────────────────────────────
// connect — orchestrates the full socket lifecycle
//   1. Acquire mutex
//   2. Destroy old socket
//   3. Create new socket
//   4. Assign to currentSock
//   5. Attach handlers
//   6. Release mutex
// ─────────────────────────────────────────────────────────
async function connect() {
  if (isConnecting) {
    console.log('[WA] connect() already in progress — skipping.');
    return;
  }
  isConnecting = true;
  console.log('[WA] connect() starting...');

  if (currentSock) {
    console.log('[WA] Destroying previous socket...');
    destroySocket(currentSock);
    currentSock = null;
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = createSocket(state);
    currentSock = sock;

    attachHandlers(sock, saveCreds);
    console.log('[WA] Socket created and handlers attached.');
  } catch (err) {
    console.error('[WA] connect() error:', err.message);
    scheduleReconnect(10_000);
  } finally {
    isConnecting = false;
  }
}

// ─── Phone number prompt (singleton) ─────────────────────
// Only ever opens ONE readline interface across all reconnects.
let _phoneNumber = null;
let _phoneNumberPromise = null;

async function askPhoneNumber() {
  if (_phoneNumber)        return _phoneNumber;
  if (_phoneNumberPromise) return _phoneNumberPromise;

  _phoneNumberPromise = new Promise((resolve) => {
    const rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
    });
    rl.question(
      '📱 Enter WhatsApp number (with country code, digits only): ',
      (ans) => {
        rl.close();
        _phoneNumber = ans.trim().replace(/\D/g, '');
        _phoneNumberPromise = null;
        resolve(_phoneNumber);
      }
    );
  });
  return _phoneNumberPromise;
}

// ─── Group admin check ────────────────────────────────────
async function isGroupAdmin(jid, senderJid) {
  const s = currentSock;
  if (!s) return false;
  try {
    const meta = await s.groupMetadata(jid);
    return meta.participants.some(
      p => p.id === senderJid && (p.admin === 'admin' || p.admin === 'superadmin')
    );
  } catch { return false; }
}

// ─── Command dispatcher ───────────────────────────────────
async function handleCommand(command, args, message, sock, botConfig) {
  const jid      = message.key.remoteJid;
  const isGroup  = isJidGroup(jid);
  const sender   = message.key.participant || jid;
  const senderNum = normalizeJid(sender);
  const ownerNum  = normalizeJid(botConfig.ownerNumber);

  // Private mode guard
  if (botConfig.mode === 'private') {
    if (!ownerNum) {
      return sock.sendMessage(jid, {
        text: '🔒 Bot is in *private mode* but OWNER_NUMBER is not set.\n\n' +
              'Add it as a Replit Secret to activate the bot.'
      });
    }
    if (senderNum !== ownerNum) {
      console.log(`[WA] private mode: blocked ${senderNum} (owner: ${ownerNum})`);
      return;
    }
  }

  const cmd = allCommands[command];
  if (!cmd) {
    return sock.sendMessage(jid, {
      text: `❌ Unknown command: *${command}*\nType *${botConfig.prefix}menu* for help.`
    });
  }

  message._isOwner      = ownerNum ? senderNum === ownerNum : false;
  message._isGroupAdmin = isGroup
    ? () => isGroupAdmin(jid, sender)
    : async () => false;

  try {
    await cmd.exec(args, sock, jid, isGroup, sender, message, botConfig);
  } catch (err) {
    console.error(`[cmd] .${command} error:`, err.message);
    await sock.sendMessage(jid, {
      text: `❌ Error in .${command}: ${err.message}`
    }).catch(() => {});
  }
}

// ─── Start ────────────────────────────────────────────────
console.log('🚀 Starting OLASUBOMI-MD...');
connect().catch(err => console.error('[startup] Fatal:', err.message));
