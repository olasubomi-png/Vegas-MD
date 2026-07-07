'use strict';
// lib/sessionManager.js — Multi-session manager for secondary WhatsApp accounts.
// The primary session continues to use auth_info_baileys/ and main.js connect().
// Each additional number gets its own sessions/<number>/ folder and Baileys socket.

const fs   = require('fs');
const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
} = require('baileys');
const { getMessageText, normalizeJid, resolveIsOwner } = require('./helpers');

const SESSIONS_DIR          = path.join(process.cwd(), 'sessions');
const VERSION_CACHE_TTL_MS  = 6 * 60 * 60 * 1000;
const RECONNECT_DELAY_MS    = 5_000;

// ── Shared WA version cache (shared with primary session) ─────────────────────
let _cachedVersion = null;

async function getWaVersion() {
  const age = _cachedVersion ? Date.now() - _cachedVersion.fetchedAt : Infinity;
  if (!_cachedVersion || age > VERSION_CACHE_TTL_MS) {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    _cachedVersion = { version, isLatest, fetchedAt: Date.now() };
  }
  return _cachedVersion.version;
}

// ── Silent logger (mirrors main.js) ──────────────────────────────────────────
const SILENT_LOGGER = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {}, warn: () => {},
  error: (...a) => console.error('[sm:baileys]', ...a),
  fatal: (...a) => console.error('[sm:baileys]', ...a),
  child() { return this; },
};

// ── Active secondary sessions ─────────────────────────────────────────────────
// Map<phoneNumber (digits only), SessionState>
// SessionState: { sock, isConnecting, reconnectTimer, pairingCodeRequested,
//                 connected, notifyJid, primarySock }
const _sessions = new Map();

let _sockSeq = 1000; // offset from main.js sequence

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

function sessionDir(num) {
  return path.join(SESSIONS_DIR, num);
}

function destroySock(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch (_) {}
  try { sock.end(null);              } catch (_) {}
}

function scheduleReconnect(num, delayMs = RECONNECT_DELAY_MS, freshLogin = false) {
  const s = _sessions.get(num);
  if (!s) return;
  if (s.reconnectTimer) { clearTimeout(s.reconnectTimer); s.reconnectTimer = null; }
  if (freshLogin) s.pairingCodeRequested = false;
  s.reconnectTimer = setTimeout(() => {
    s.reconnectTimer = null;
    _connect(num);
  }, delayMs);
}

async function _notify(s, text) {
  // Send a message back to the person who ran .pair, via the primary socket.
  if (!s.notifyJid || !s.primarySock) return;
  try {
    await s.primarySock.sendMessage(s.notifyJid, { text });
  } catch (_) {}
}

function _routeMessage(message, sock, num) {
  const handleCommand = global._smHandleCommand;
  const botConfig     = global.botConfig;
  if (!handleCommand || !botConfig) return;

  if (!message.message) return;

  const jid    = message.key.remoteJid;
  const sender = message.key.participant || jid;

  if (jid === 'status@broadcast') return;

  const db = global.db;
  if (db && !message.key.fromMe && db.isBanned(sender)) return;

  const text   = getMessageText(message);
  const prefix = db?.getSetting('prefix') || botConfig.prefix || '.';

  if (!text || !text.startsWith(prefix)) return;

  const parts   = text.slice(prefix.length).trim().split(/ +/);
  const command = parts.shift().toLowerCase();
  if (!command) return;

  console.log(`[sm:${num}] dispatching .${command}`);
  handleCommand(command, parts, message, sock, botConfig).catch(err =>
    console.error(`[sm:${num}] .${command} error:`, err.message)
  );
}

function _attachHandlers(sock, saveCreds, num) {
  const s = _sessions.get(num);
  if (!s) return;

  sock.ev.process(async (events) => {

    // ── Creds ──────────────────────────────────────────────────────────────
    if (events['creds.update']) {
      await saveCreds();
    }

    // ── Connection lifecycle ───────────────────────────────────────────────
    if (events['connection.update']) {
      const { connection, lastDisconnect, qr } = events['connection.update'];
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      console.log(`[sm:${num}] connection: ${connection ?? '(none)'} | qr:${!!qr} | code:${statusCode}`);

      // ── Pairing code (once per socket) ────────────────────────────────
      // Guard: only request one code per socket. Subsequent QR refreshes
      // (WhatsApp re-emits qr every ~20-30 s) are silently ignored so the
      // first code stays valid until the user links or the socket closes.
      if (qr && !s.pairingCodeRequested) {
        s.pairingCodeRequested = true;
        const clean = num.replace(/\D/g, '');
        try {
          const code = await sock.requestPairingCode(clean);
          console.log(`[sm:${num}] 📱 PAIRING CODE: ${code}`);
          await _notify(s,
            `┏━━〔 📱 *New Session Pairing* 〕━━┓\n` +
            `┃\n` +
            `┃  📞 Number : +${clean}\n` +
            `┃  🔑 Code   : *${code}*\n` +
            `┃\n` +
            `┃  *Steps to link:*\n` +
            `┃  1️⃣ Open WhatsApp on that phone\n` +
            `┃  2️⃣ Settings → Linked Devices\n` +
            `┃  3️⃣ Link a Device → Enter code above\n` +
            `┃\n` +
            `┃  ⏳ Code expires in ~60 seconds\n` +
            `┃  ⚠️  Do NOT restart the bot.\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
          );
        } catch (err) {
          console.error(`[sm:${num}] pairing code error:`, err.message);
          s.pairingCodeRequested = false;
          await _notify(s, `❌ Failed to generate pairing code for +${clean}:\n${err.message}`);
        }
        // NOTE: no early return here — remaining event handlers (messages,
        // group-participants) must still run if present in the same flush.
      } else if (qr && s.pairingCodeRequested) {
        console.log(`[sm:${num}] QR refresh — pairing code already sent, ignoring.`);
      }

      if (connection === 'open') {
        console.log(`[sm:${num}] ✅ Connected!`);
        s.connected = true;
        s.pairingCodeRequested = false;
        await _notify(s, `✅ Session *+${num}* is now connected! Commands work on this number too.`);
        // Clear notifyJid/primarySock so future reconnects don't spam
        s.notifyJid  = null;
        s.primarySock = null;
      }

      if (connection === 'close') {
        const wasConnected = s.connected;
        s.connected = false;

        // 403 forbidden: number is banned — no point retrying.
        if (statusCode === DisconnectReason.forbidden || statusCode === 403) {
          console.log(`[sm:${num}] banned — removing session`);
          await _notify(s, `⛔ Session *+${num}* was banned by WhatsApp and has been removed.`);
          removeSession(num);
          return;
        }

        if (wasConnected) {
          // ── Post-link disconnect: session was fully connected ─────────────
          // 401 loggedOut means the number was removed from linked devices.
          // For all other codes, just reconnect and restore the session.
          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            console.log(`[sm:${num}] logged out after being connected — wiping and waiting for .pair`);
            try { fs.rmSync(sessionDir(num), { recursive: true, force: true }); } catch (_) {}
            // Don't auto-reconnect — user needs to run .pair again to re-pair.
            _sessions.delete(num);
          } else {
            console.log(`[sm:${num}] disconnected (${statusCode}) — reconnecting in ${RECONNECT_DELAY_MS}ms`);
            scheduleReconnect(num, RECONNECT_DELAY_MS, false);
          }
        } else {
          // ── Mid-pairing disconnect: user hasn't linked yet ────────────────
          //
          //   401 loggedOut = corrupt/stale auth keys. Two sub-cases:
          //
          //   a) Session was auto-loaded from sessions/ on startup (notifyJid
          //      is null). Pairing never completed — nobody can receive a new
          //      code anyway. Clean up and stop. Owner runs .pair manually.
          //
          //   b) Session was manually started via .pair (notifyJid is set).
          //      Wipe dir, reconnect, send fresh code to the operator.
          //
          //   Any other close code = transient network drop while the code
          //   window is open. Preserve session dir + pairingCodeRequested so
          //   the same code stays valid on reconnect (same noise keys).
          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            try { fs.rmSync(sessionDir(num), { recursive: true, force: true }); } catch (_) {}

            if (!s.notifyJid) {
              // Auto-loaded orphan session — no one to send a code to.
              // Remove from memory; owner must run .pair again.
              console.log(`[sm:${num}] 401 on auto-loaded session (no notifyJid) — removing orphan, run .pair to re-pair`);
              _sessions.delete(num);
            } else {
              // Manually triggered — notify and reconnect with fresh code.
              console.log(`[sm:${num}] 401 during pairing — stale auth, wiping and restarting`);
              await _notify(s,
                `⚠️ Connection dropped while waiting for you to link *+${num}*.\n` +
                `A new pairing code will be sent shortly — please enter it *immediately* when it arrives.`
              );
              scheduleReconnect(num, 3_000, true); // freshLogin=true → new code on reconnect
            }
          } else {
            // Transient drop — keep auth state + keep pairingCodeRequested so
            // the same code is still valid when we reconnect.
            console.log(`[sm:${num}] transient drop during pairing (${statusCode}) — silent reconnect, code preserved`);
            scheduleReconnect(num, 5_000, false); // freshLogin=false → pairingCodeRequested preserved
          }
        }
      }
    }

    // ── Messages ───────────────────────────────────────────────────────────
    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];
      if (type !== 'notify') return;
      for (const message of messages) {
        _routeMessage(message, sock, num);
      }
    }

    // ── Group participant updates ───────────────────────────────────────────
    if (events['group-participants.update']) {
      const { handleParticipantUpdate } = require('../events/welcome');
      await handleParticipantUpdate(sock, events['group-participants.update']).catch(() => {});
    }
  });
}

async function _connect(num) {
  const s = _sessions.get(num);
  if (!s || s.isConnecting) return;
  s.isConnecting = true;

  destroySock(s.sock);
  s.sock = null;

  try {
    const version = await getWaVersion();
    const dir     = sessionDir(num);
    fs.mkdirSync(dir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(dir);

    const sockId = ++_sockSeq;
    const sock   = makeWASocket({
      auth:                          state,
      version,
      printQRInTerminal:             false,
      logger:                        SILENT_LOGGER,
      connectTimeoutMs:              300_000,   // 5 min — gives user plenty of time to enter pairing code
      keepAliveIntervalMs:           25_000,
      defaultQueryTimeoutMs:         60_000,
      retryRequestDelayMs:           250,
      maxMsgRetryCount:              5,
      syncFullHistory:               false,
      generateHighQualityLinkPreview: false,
      getMessage:                    async () => undefined,
    });
    sock._id = sockId;
    s.sock   = sock;

    _attachHandlers(sock, saveCreds, num);
    console.log(`[sm:${num}] socket#${sockId} created`);
  } catch (err) {
    console.error(`[sm:${num}] connect error:`, err.message);
    scheduleReconnect(num, 10_000);
  } finally {
    s.isConnecting = false;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Register the main.js handleCommand function so secondary sessions can route
 * messages to the same command handler.
 * Call this before addSession().
 */
function init(handleCommandFn) {
  global._smHandleCommand = handleCommandFn;
}

/**
 * Add and connect a new secondary session.
 * notifyJid   — the JID to send the pairing code / success message to
 * primarySock — the primary socket to use for those notifications
 */
async function addSession(phoneNumber, { notifyJid, primarySock } = {}) {
  const num = phoneNumber.replace(/\D/g, '');
  if (!num) throw new Error('Invalid phone number');

  if (_sessions.has(num)) {
    const s = _sessions.get(num);
    if (s.connected) return { alreadyConnected: true };
    // Update notify targets, reset pairing flag so a fresh code is requested,
    // then reconnect.  Without the reset, pairingCodeRequested=true from a
    // previous attempt would silently block the new code request.
    s.notifyJid             = notifyJid   || s.notifyJid;
    s.primarySock           = primarySock || s.primarySock;
    s.pairingCodeRequested  = false;
    await _connect(num);
    return { reconnecting: true };
  }

  _sessions.set(num, {
    phoneNumber:          num,
    sock:                 null,
    isConnecting:         false,
    reconnectTimer:       null,
    pairingCodeRequested: false,
    connected:            false,
    notifyJid,
    primarySock,
  });

  await _connect(num);
  return { started: true };
}

/**
 * Disconnect and permanently remove a session (deletes its auth folder).
 */
function removeSession(phoneNumber) {
  const num = phoneNumber.replace(/\D/g, '');
  const s   = _sessions.get(num);
  if (!s) return false;

  if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
  destroySock(s.sock);
  _sessions.delete(num);

  // Remove auth folder so it doesn't reload on next startup
  try { fs.rmSync(sessionDir(num), { recursive: true, force: true }); } catch (_) {}
  console.log(`[sm] Session ${num} removed`);
  return true;
}

/**
 * List all secondary sessions and their status.
 */
function listSessions() {
  return [..._sessions.entries()].map(([num, s]) => ({
    phoneNumber: num,
    connected:   s.connected,
    pairing:     s.pairingCodeRequested && !s.connected,
  }));
}

/**
 * Load all previously saved sessions from the sessions/ directory on startup.
 *
 * Only loads sessions where pairing previously completed (creds.json exists
 * and has a registered=true credential, meaning the number was fully linked).
 * Orphan folders from incomplete pairing attempts are cleaned up silently.
 *
 * Sessions are staggered 5 s apart to avoid simultaneous auth attempts that
 * trigger WhatsApp rate-limiting ("Couldn't link device").
 */
async function loadSavedSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  let dirs = [];
  try {
    dirs = fs.readdirSync(SESSIONS_DIR).filter(d =>
      fs.statSync(path.join(SESSIONS_DIR, d)).isDirectory()
    );
  } catch (_) { return; }

  if (!dirs.length) return;

  // Filter to only folders that have completed creds (creds.json with me field)
  const validDirs = [];
  for (const d of dirs) {
    const credsPath = path.join(SESSIONS_DIR, d, 'creds.json');
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      if (creds?.me?.id) {
        validDirs.push(d);
      } else {
        console.log(`[sm] Skipping ${d} — creds.json has no linked account (incomplete pairing). Cleaning up.`);
        try { fs.rmSync(path.join(SESSIONS_DIR, d), { recursive: true, force: true }); } catch (_) {}
      }
    } catch (_) {
      console.log(`[sm] Skipping ${d} — no valid creds.json found (incomplete pairing). Cleaning up.`);
      try { fs.rmSync(path.join(SESSIONS_DIR, d), { recursive: true, force: true }); } catch (_) {}
    }
  }

  if (!validDirs.length) {
    console.log('[sm] No fully-linked secondary sessions to restore.');
    return;
  }

  console.log(`[sm] Restoring ${validDirs.length} linked session(s): ${validDirs.join(', ')}`);
  for (let i = 0; i < validDirs.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 5_000)); // stagger — avoid simultaneous WA auth
    await addSession(validDirs[i]);
  }
}

module.exports = { init, addSession, removeSession, listSessions, loadSavedSessions };
