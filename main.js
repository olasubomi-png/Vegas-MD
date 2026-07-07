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

// ─── Bot configuration (immutable after startup) ──────────
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
global.botConfig    = botConfig;   // kept for legacy command reads only
global.db           = db;

// ─── Socket state — single source of truth ────────────────
//  Only `connect()` may write these variables.
let currentSock    = null;   // THE live socket at any moment
let isConnecting   = false;  // mutual-exclusion flag
let reconnectTimer = null;   // pending setTimeout handle

// ─────────────────────────────────────────────────────────
// 1. destroySocket(sock)
//    Fully tears down a socket so its event emitter and WS
//    connection cannot fire again.
// ─────────────────────────────────────────────────────────
function destroySocket(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch (_) {}
  try { sock.end(null); }              catch (_) {}
}

// ─────────────────────────────────────────────────────────
// 2. createSocket(state)
//    Constructs and returns a bare Baileys socket.
//    No listeners are attached here.
// ─────────────────────────────────────────────────────────
function createSocket(state) {
  return makeWASocket({
    auth:                  state,
    printQRInTerminal:     false,
    browser:               ['Ubuntu', 'Chrome', '121.0.6167.160'],
    connectTimeoutMs:      60_000,   // allow slow handshakes
    keepAliveIntervalMs:   25_000,   // ping every 25 s → prevents 408 idle drops
    retryRequestDelayMs:   3_000,
    maxMsListenerCount:    30,       // realistic ceiling; high values mask leaks
  });
}

// ─────────────────────────────────────────────────────────
// 3. attachHandlers(sock, saveCreds)
//    Registers EVERY event listener on the socket that is
//    passed in.  All closures capture THIS local `sock`
//    variable — they never read `currentSock` or any other
//    outer mutable reference.  If the socket is replaced,
//    these listeners become inert because the old socket's
//    ev emitter is destroyed first.
// ─────────────────────────────────────────────────────────
function attachHandlers(sock, saveCreds) {
  const sockId = sock?.authState?.creds?.me?.id || '(not yet paired)';
  console.log(`[WA] attachHandlers — socket: ${sockId}`);

  // ── Credentials ──────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Connection lifecycle ──────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ── Pairing code ──
    if (qr) {
      console.log('\n⚠️  QR detected — requesting pairing code...');
      const phoneNumber = await askPhoneNumber();
      console.log(`✅ Number entered: ${phoneNumber}`);
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n📱 PAIRING CODE: ${code}`);
        console.log('WhatsApp → Settings → Linked Devices → Link Device → Enter code\n');
      } catch (err) {
        console.error('[WA] Pairing code request failed:', err.message);
      }
    }

    // ── Disconnected ──
    if (connection === 'close') {
      const statusCode    = lastDisconnect?.error?.output?.statusCode;
      const reasonName    = Object.keys(DisconnectReason).find(
                              k => DisconnectReason[k] === statusCode
                            ) || statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[WA] Closed — code: ${statusCode} (${reasonName}), ` +
        `reconnect: ${shouldReconnect}`
      );

      if (!shouldReconnect) {
        console.log('[WA] Logged out permanently. Remove auth_info_baileys/ and restart.');
        return;
      }

      // 408 = server-side keep-alive timeout → give it more recovery time
      const backoffMs = statusCode === 408 ? 15_000 : 5_000;
      console.log(`[WA] Will reconnect in ${backoffMs / 1000}s...`);
      scheduleReconnect(backoffMs);
    }

    // ── Connected ──
    if (connection === 'open') {
      console.log(`\n✅ ${botConfig.name} connected!`);
      console.log('═'.repeat(34));
      console.log(`  Version  : ${botConfig.version} ${botConfig.beta}`);
      console.log(`  Prefix   : ${botConfig.prefix}`);
      console.log(`  Mode     : ${botConfig.mode}`);
      console.log(`  Commands : ${Object.keys(allCommands).length}`);
      console.log(`  Owner    : ${botConfig.ownerNumber || '⚠ Not set'}`);
      console.log('═'.repeat(34) + '\n');
    }
  });

  // ── Incoming messages ─────────────────────────────────
  // Log every fire so we can confirm the listener survives reconnects.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log(`[WA] messages.upsert — type: ${type}, count: ${messages.length}`);
    if (type !== 'notify') return;

    for (const message of messages) {
      if (!message.message) continue;

      const jid    = message.key.remoteJid;
      const sender = message.key.participant || jid;

      // Cache every message for anti-delete (own messages too)
      cacheMessage(message);

      if (message.key.fromMe) continue;

      // Status updates
      if (jid === 'status@broadcast') {
        await handleStatusUpdate(sock, [message]).catch(e =>
          console.error('[handler] autoStatus:', e.message)
        );
        continue;
      }

      // Banned users
      if (db.isBanned(sender)) continue;

      // Protection (group-only; sock is passed explicitly)
      await handleAutoReact(sock, message).catch(e =>
        console.error('[handler] autoReact:', e.message)
      );
      await handleAntiViewOnce(sock, message).catch(e =>
        console.error('[handler] antiViewOnce:', e.message)
      );

      const text =
        message.message.conversation ||
        message.message.extendedTextMessage?.text || '';

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

      // Commands
      if (!text.startsWith(prefix)) continue;

      const parts   = text.slice(prefix.length).trim().split(/ +/);
      const command = parts.shift().toLowerCase();
      if (!command) continue;

      handleCommand(command, parts, message, sock, botConfig).catch(err =>
        console.error(`[cmd] .${command} unhandled:`, err.message)
      );
    }
  });

  // ── Deleted messages ──────────────────────────────────
  sock.ev.on('messages.delete', async (item) => {
    const keys = 'keys' in item
      ? item.keys
      : [{ id: item.ids?.[0], remoteJid: item.jid }];
    await handleAntiDelete(sock, keys).catch(e =>
      console.error('[handler] antiDelete:', e.message)
    );
  });

  // ── Group participant changes ─────────────────────────
  sock.ev.on('group-participants.update', async (update) => {
    await handleParticipantUpdate(sock, update).catch(e =>
      console.error('[handler] participantUpdate:', e.message)
    );
  });
}

// ─────────────────────────────────────────────────────────
// scheduleReconnect(delayMs)
//   Always uses setTimeout — never calls connect() from
//   inside an event handler (avoids stacked async calls).
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
// connect()
//   Orchestrates the full lifecycle in strict order:
//     1. Acquire lock
//     2. Destroy old socket
//     3. Create new socket
//     4. Assign to currentSock
//     5. Attach handlers
//     6. Release lock
// ─────────────────────────────────────────────────────────
async function connect() {
  if (isConnecting) {
    console.log('[WA] connect() already in progress — skipping duplicate call.');
    return;
  }
  isConnecting = true;
  console.log('[WA] connect() starting...');

  // Step 1: Destroy old socket
  if (currentSock) {
    console.log('[WA] Destroying previous socket...');
    destroySocket(currentSock);
    currentSock = null;
  }

  try {
    // Step 2: Load persisted auth
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // Step 3: Create fresh socket (no listeners yet)
    const sock = createSocket(state);

    // Step 4: Register as the single live socket
    currentSock = sock;

    // Step 5: Attach all listeners using the local reference
    attachHandlers(sock, saveCreds);

    console.log('[WA] Socket ready and handlers attached.');
  } catch (err) {
    console.error('[WA] connect() error:', err.message);
    scheduleReconnect(10_000);
  } finally {
    // Step 6: Always release the lock so future reconnects work
    isConnecting = false;
  }
}

// ─── Phone number prompt ──────────────────────────────────
// Singleton: only one readline prompt ever, result cached for all reconnects.
let _phoneNumber = null;
let _phoneNumberPromise = null;

async function askPhoneNumber() {
  if (_phoneNumber) return _phoneNumber;             // already answered
  if (_phoneNumberPromise) return _phoneNumberPromise; // prompt already showing

  _phoneNumberPromise = new Promise((resolve) => {
    const rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout
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
// Uses currentSock only for metadata lookup (read-only, non-critical).
async function isGroupAdmin(jid, senderJid) {
  const s = currentSock;
  if (!s) return false;
  try {
    const meta = await s.groupMetadata(jid);
    return meta.participants.some(
      p => p.id === senderJid &&
           (p.admin === 'admin' || p.admin === 'superadmin')
    );
  } catch { return false; }
}

// ─── Command dispatcher ───────────────────────────────────
// `sock` here is the parameter passed from attachHandlers —
// never read from the outer currentSock variable.
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
    if (senderNum !== ownerNum) return;
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
