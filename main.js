const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  isJidGroup,
  fetchLatestBaileysVersion,
} = require('baileys');

// Minimal pino-compatible logger — suppresses Baileys' noisy output while
// still surfacing genuine errors. Baileys requires a .child() method.
const SILENT_LOGGER = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {}, warn: () => {},
  error: (...a) => console.error('[baileys:error]', ...a),
  fatal: (...a) => console.error('[baileys:fatal]', ...a),
  child() { return this; }
};
const db = require('./lib/database');
const { normalizeJid, getMessageText, resolveIsOwner } = require('./lib/helpers');
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
let currentSock          = null;
let isConnecting         = false;
let reconnectTimer       = null;
let _sockSeq             = 0;   // monotonically increasing socket ID for identity tracing

// ─── Pairing-code guard ───────────────────────────────────
// Reset to false at the start of every connect() call so each
// fresh socket gets exactly one pairing-code request.
// Set to true after the first successful requestPairingCode().
// Never reset while waiting for the user to link — doing so
// would generate a second code and invalidate the first.
let pairingCodeRequested = false;

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
function createSocket(state, version) {
  const sockId = ++_sockSeq;
  console.log(`[WA] createSocket — sock#${sockId} | WA version: ${version?.join('.')}`);
  const sock = makeWASocket({
    auth:                       state,
    version,                              // resolved via fetchLatestBaileysVersion()
    printQRInTerminal:          false,
    // Do NOT override `browser` — Baileys' default ["Mac OS","Chrome","14.4.1"]
    // is specifically chosen to pass WhatsApp's browser-fingerprint check during
    // the pairing handshake.  A custom string (e.g. Ubuntu/Chrome 121) causes
    // "Couldn't link device" because WA rejects unrecognised browser profiles.
    logger:                     SILENT_LOGGER,
    connectTimeoutMs:           60_000,
    keepAliveIntervalMs:        25_000,
    defaultQueryTimeoutMs:      60_000,
    retryRequestDelayMs:        250,
    maxMsgRetryCount:           5,
    syncFullHistory:            false,
    generateHighQualityLinkPreview: false,
    getMessage:                 async () => undefined,
  });
  sock._id = sockId;
  return sock;
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
  const sockId = sock._id;
  console.log(`[WA] attachHandlers: sock#${sockId} — currentSock#${currentSock?._id ?? 'none'}`);

  // ── Wrap sock.sendMessage to trace every send attempt ──
  const _origSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const preview = JSON.stringify(content).slice(0, 120);
    console.log(`[send] sock#${sockId} → ${jid} | ${preview}`);
    try {
      const res = await _origSend(jid, content, options);
      console.log(`[send] ✅ sock#${sockId} → ${jid} OK (msgId: ${res?.key?.id})`);
      return res;
    } catch (err) {
      console.error(`[send] ❌ sock#${sockId} → ${jid} FAILED:\n${err.stack || err.message}`);
      throw err;
    }
  };

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

      // Always log every connection.update for full traceability.
      const registered = sock.authState?.creds?.registered;
      console.log(
        `[WA] connection.update sock#${sockId}` +
        ` — state: ${connection ?? '(none)'}` +
        ` | registered: ${registered}` +
        ` | hasQR: ${!!qr}` +
        ` | pairingCodeRequested: ${pairingCodeRequested}`
      );

      // ── Pairing-code request: ONCE per socket, ONCE per connect() ──────
      //
      // ROOT CAUSE OF PREVIOUS FAILURE:
      //   Baileys re-emits `qr` in connection.update every ~20-30 s while
      //   waiting for a QR scan.  Without a guard, requestPairingCode() was
      //   called on EVERY QR refresh — each call immediately invalidates the
      //   previous code, so the user could never enter one in time.
      //
      // FIX: pairingCodeRequested is set to true after the first successful
      //   call and is only reset in connect() (i.e. on a fresh socket).
      //   Subsequent QR refreshes are logged and silently ignored so the
      //   first code stays valid until the user links or the socket dies.
      if (qr) {
        if (pairingCodeRequested) {
          console.log(
            '[WA] QR refresh — pairing code already requested for this socket.' +
            ' Ignoring. Waiting for the user to link the device...'
          );
        } else {
          // Phone number priority: Replit Secret → persisted db setting → fail clearly.
          const phoneNumber = process.env.OWNER_NUMBER
                           || db.getSetting('ownerNumber', null)
                           || '';

          if (!phoneNumber) {
            console.log('[WA] ⚠  Cannot request pairing code — phone number not set.');
            console.log('[WA]    Add OWNER_NUMBER as a Replit Secret (country code + digits,');
            console.log('[WA]    no + or spaces, e.g. 2349061198658) then restart the bot.');
          } else {
            // Set flag BEFORE the async call so a concurrent QR event
            // cannot race through the guard while we await the code.
            pairingCodeRequested = true;
            console.log(`[WA] Requesting pairing code for ${phoneNumber} (one-time per socket)...`);
            try {
              const code = await sock.requestPairingCode(phoneNumber);
              console.log(`\n📱 PAIRING CODE: ${code}`);
              console.log('    WhatsApp → Settings → Linked Devices → Link a Device → Enter code above');
              console.log('    ⏳ Waiting for you to link. Do NOT restart the bot.\n');
            } catch (err) {
              console.error('[WA] Pairing code request failed:', err.message);
              // Reset only on failure so a retry fires on the next QR refresh.
              // On success pairingCodeRequested stays true forever for this socket:
              // a second requestPairingCode() would invalidate the code the user
              // is actively trying to enter.
              pairingCodeRequested = false;
              console.log('[WA] Will retry pairing code on next QR refresh...');
            }
          }
        }
      }

      if (connection === 'close') {
        const statusCode    = lastDisconnect?.error?.output?.statusCode;
        const reasonName    = Object.keys(DisconnectReason).find(
                                k => DisconnectReason[k] === statusCode
                              ) || statusCode;
        // connectionReplaced (440): another process already owns this session.
        // Reconnecting would kick that process → infinite kick-loop. Stop here.
        if (statusCode === DisconnectReason.connectionReplaced) {
          console.log('[WA] connectionReplaced — another instance took over. Stopping this duplicate.');
          return;
        }

        // loggedOut (401): credentials were revoked (device removed, re-registered, etc.).
        // Wipe the stale session so the next connect() starts a fresh pairing-code flow.
        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WA] Logged out (401) — clearing stale session and starting fresh login...');
          try {
            fs.rmSync('auth_info_baileys', { recursive: true, force: true });
            console.log('[WA] auth_info_baileys/ cleared.');
          } catch (e) {
            console.error('[WA] Could not clear auth_info_baileys/:', e.message);
          }
          console.log('[WA] Reconnecting in 3s to start new pairing-code flow...');
          scheduleReconnect(3_000);
          return;
        }

        console.log(`[WA] Connection closed — ${reasonName}(${statusCode}), reconnecting...`);
        const backoffMs = statusCode === 408 ? 15_000 : 5_000;
        console.log(`[WA] Reconnecting in ${backoffMs / 1000}s...`);
        scheduleReconnect(backoffMs);
      }

      if (connection === 'open') {
        console.log(`\n✅ ${botConfig.name} connected! (sock#${sockId})`);
        console.log('═'.repeat(52));
        console.log(`  Version  : ${botConfig.version} ${botConfig.beta}`);
        console.log(`  Prefix   : ${botConfig.prefix}`);
        console.log(`  Mode     : ${botConfig.mode}`);
        console.log(`  Owner    : ${botConfig.ownerNumber || '⚠  Not set — set OWNER_NUMBER secret'}`);
        const cmdNames = Object.keys(allCommands).sort();
        console.log(`  Commands : ${cmdNames.length} registered`);
        console.log(`  List     : ${cmdNames.join(', ')}`);
        console.log('═'.repeat(52) + '\n');
      }
    }

    // ── Incoming messages ─────────────────────────────────
    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];

      console.log(`[WA] messages.upsert sock#${sockId} — type: ${type}, count: ${messages.length}`);

      // NOTE: do NOT `return` here — that would abort the entire process()
      // callback and skip messages.delete / group-participants.update that
      // may be in the same event batch.
      if (type !== 'notify') {
        console.log(`[WA] skipping non-notify upsert (type: ${type})`);
      } else {
        for (const message of messages) {
          console.log(`[WA] msg key: jid=${message.key?.remoteJid} fromMe=${message.key?.fromMe} id=${message.key?.id}`);

          if (!message.message) {
            console.log('[WA] skipping: message.message is null (stub/protocol msg)');
            continue;
          }

          const jid    = message.key.remoteJid;
          const sender = message.key.participant || jid;

          cacheMessage(message);

          // ── fromMe handling ───────────────────────────────────────
          // fromMe=true means the bot's own WhatsApp account sent this
          // message.  Two cases:
          //   a) Owner typed a command (.ping, .menu …) from their phone
          //      → must reach handleCommand, treated as owner
          //   b) Bot's own automatic reply (sock.sendMessage)
          //      → will not start with the prefix, so prefix check below
          //        discards it naturally — no explicit skip needed here
          //
          // Protection handlers (autoReact, antiViewOnce, antiLink,
          // antiSpam) are skipped for fromMe — the bot's own messages
          // must never trigger moderation.
          const isFromMe = message.key.fromMe === true;
          if (isFromMe) {
            console.log('[WA] fromMe=true — owner command candidate, skipping protection handlers');
          }

          // Status updates
          if (jid === 'status@broadcast') {
            await handleStatusUpdate(sock, [message]).catch(e =>
              console.error('[handler] autoStatus:', e.stack || e.message)
            );
            continue;
          }

          // Banned users (fromMe messages are never banned)
          if (!isFromMe && db.isBanned(sender)) {
            console.log(`[WA] skipping: ${sender} is banned`);
            continue;
          }

          if (!isFromMe) {
            await handleAutoReact(sock, message).catch(e =>
              console.error('[handler] autoReact:', e.stack || e.message)
            );
            await handleAntiViewOnce(sock, message).catch(e =>
              console.error('[handler] antiViewOnce:', e.stack || e.message)
            );
          }

          // ── Extract text (single source of truth: lib/helpers.js) ──
          // getMessageText() unwraps ephemeral/view-once containers
          // so .ping works even when disappearing messages are ON.
          const text = getMessageText(message);

          console.log(`[WA] extracted text: "${text}"`);

          const prefix = db.getSetting('prefix') || botConfig.prefix || '.';
          console.log(`[WA] active prefix: "${prefix}"`);

          if (!isFromMe && text && isJidGroup(jid)) {
            const blocked = await handleAntiLink(sock, message, botConfig).catch(e => {
              console.error('[handler] antiLink:', e.stack || e.message);
              return false;
            });
            if (blocked) { console.log('[WA] antiLink blocked message'); continue; }
            await handleAntiSpam(sock, message, botConfig).catch(e =>
              console.error('[handler] antiSpam:', e.stack || e.message)
            );
          }

          if (!text.startsWith(prefix)) {
            console.log(`[WA] not a command — text does not start with prefix "${prefix}"`);
            continue;
          }

          const parts   = text.slice(prefix.length).trim().split(/ +/);
          const command = parts.shift().toLowerCase();
          if (!command) { console.log('[WA] empty command after prefix'); continue; }

          console.log(`[WA] dispatching .${command} to handleCommand (sock#${sockId})`);

          handleCommand(command, parts, message, sock, botConfig).catch(err =>
            console.error(`[cmd] .${command} unhandled exception:\n${err.stack || err.message}`)
          );
        }
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
  // Reset per-socket pairing flag so every fresh connect() gets
  // exactly one pairing-code attempt if creds are not registered.
  pairingCodeRequested = false;
  console.log('[WA] connect() starting — pairingCodeRequested reset to false');

  if (currentSock) {
    console.log('[WA] Destroying previous socket...');
    destroySocket(currentSock);
    currentSock = null;
  }

  try {
    // Resolve the latest Baileys-known WA protocol version.
    // This avoids using a stale hardcoded version if the library
    // was installed a while ago.
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WA] WA version: ${version.join('.')} (isLatest: ${isLatest})`);

    // Ensure auth directory exists — prevents ENOENT on fresh deployments
    fs.mkdirSync('auth_info_baileys', { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    console.log(`[WA] Auth state loaded — creds.registered: ${state.creds.registered}`);
    if (state.creds.registered) {
      console.log('[WA] Existing credentials found — resuming session (no pairing code needed).');
    } else {
      console.log('[WA] No registered session — will request ONE pairing code when QR event fires.');
    }

    const sock = createSocket(state, version);
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
  const jid       = message.key.remoteJid;
  const isGroup   = isJidGroup(jid);
  const sender    = message.key.participant || jid;
  const senderNum = normalizeJid(sender);
  const ownerNum  = normalizeJid(botConfig.ownerNumber);
  // resolveIsOwner: fromMe === true OR sender matches OWNER_NUMBER
  const isOwner   = resolveIsOwner(message, sender, botConfig);

  // Verify socket identity: handleCommand should always receive the live socket
  console.log(`[cmd] handleCommand entered — .${command} | sock#${sock?._id} currentSock#${currentSock?._id}`);
  console.log(`[cmd]   jid      : ${jid}`);
  console.log(`[cmd]   sender   : ${sender} → normalised: "${senderNum}"`);
  console.log(`[cmd]   owner    : "${botConfig.ownerNumber}" → normalised: "${ownerNum}"`);
  console.log(`[cmd]   mode     : ${botConfig.mode}`);
  console.log(`[cmd]   isGroup  : ${isGroup}`);
  console.log(`[cmd]   isOwner  : ${isOwner} (fromMe=${message.key.fromMe})`);

  // ── Permission check: private mode ─────────────────────
  if (botConfig.mode === 'private') {
    if (isOwner) {
      console.log('[cmd]   private mode: owner — allowed');
    } else if (!ownerNum) {
      console.log('[cmd]   private mode: OWNER_NUMBER not set — sending warning');
      return sock.sendMessage(jid, {
        text: '🔒 Bot is in *private mode* but OWNER_NUMBER is not set.\n\n' +
              'Add it as a Replit Secret to activate the bot.'
      });
    } else {
      console.log(`[cmd]   private mode: BLOCKED — sender "${senderNum}" ≠ owner "${ownerNum}"`);
      return;
    }
  }

  // ── Command lookup ──────────────────────────────────────
  const registeredNames = Object.keys(allCommands);
  console.log(`[cmd]   registered commands (${registeredNames.length}): ${registeredNames.join(', ')}`);
  const cmd = allCommands[command];
  if (!cmd) {
    console.log(`[cmd]   command ".${command}" NOT FOUND in registry`);
    return sock.sendMessage(jid, {
      text: `❌ Unknown command: *${command}*\nType *${botConfig.prefix}menu* for help.`
    });
  }
  console.log(`[cmd]   command ".${command}" FOUND — exec type: ${typeof cmd.exec}`);

  // ── Inject helpers onto message ─────────────────────────
  message._isOwner      = isOwner;
  message._isGroupAdmin = isGroup
    ? () => isGroupAdmin(jid, sender)
    : async () => false;

  console.log(`[cmd]   _isOwner: ${message._isOwner}`);

  // ── Execute ─────────────────────────────────────────────
  console.log(`[cmd]   calling cmd.exec for .${command}...`);
  try {
    await cmd.exec(args, sock, jid, isGroup, sender, message, botConfig);
    console.log(`[cmd]   .${command} exec completed OK`);
  } catch (err) {
    console.error(`[cmd]   .${command} THREW:\n${err.stack || err.message}`);
    await sock.sendMessage(jid, {
      text: `❌ Error in .${command}: ${err.message}`
    }).catch(e2 => console.error('[cmd]   sendMessage (error reply) also failed:', e2.stack || e2.message));
  }
}

// ─── Start ────────────────────────────────────────────────
console.log('🚀 Starting OLASUBOMI-MD...');
connect().catch(err => console.error('[startup] Fatal:', err.message));
