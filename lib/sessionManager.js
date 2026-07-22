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
//                 pairingCodeIssuedOnce, connected, notifyJid, primarySock }
//
// pairingCodeRequested   — in-flight guard for the CURRENT socket: true while
//                           a requestPairingCode() call is awaiting/has just
//                           succeeded, so a QR-refresh flood on the same
//                           socket can't fire a second concurrent request.
// pairingCodeIssuedOnce  — one-shot lock for this pairing ATTEMPT: true once
//                           a code has actually been shown to the user (sent
//                           via _notify). Once true, no further code is ever
//                           auto-issued for this session object — not on QR
//                           refresh, not on a mid-pairing reconnect/retry.
//                           Only an explicit `.pair <number>` re-run (which
//                           creates a fresh reset in addSession()) re-arms it.
const _sessions = new Map();

let _sockSeq = 1000; // offset from main.js sequence

// ── Global pairing queue ──────────────────────────────────────────────────────
// Serialises new pairing starts with a 5 s gap between each new socket creation.
// Without this, running .pair twice in quick succession fires two simultaneous
// WA noise handshakes from the same IP — WA rate-limits both and neither gets
// a QR.  Already-connected sessions reconnecting after a drop are NOT queued
// (they go direct to _connect) so this only slows the first-time pair flow.
let _pairingQueueBusy = false;
const _pairingQueue   = []; // [{ num, resolve }]

function _enqueuePairing(num) {
  return new Promise(resolve => {
    _pairingQueue.push({ num, resolve });
    _drainPairingQueue();
  });
}

function _drainPairingQueue() {
  if (_pairingQueueBusy || _pairingQueue.length === 0) return;
  _pairingQueueBusy = true;
  const { resolve } = _pairingQueue.shift();
  resolve();
  // Hold the slot for 5 s before allowing the next queued pair to start.
  setTimeout(() => {
    _pairingQueueBusy = false;
    _drainPairingQueue();
  }, 5_000);
}

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
  // Returns true only if the message was actually delivered — callers that
  // arm the one-shot pairing lock must not do so on a swallowed send failure,
  // or the user could be locked out of ever seeing the code they were sent.
  if (!s.notifyJid || !s.primarySock) return false;
  try {
    await s.primarySock.sendMessage(s.notifyJid, { text });
    return true;
  } catch (err) {
    console.error(`[sm] _notify failed:`, err.message);
    return false;
  }
}

function _routeMessage(message, sock, num) {
  const handleCommand  = global._smHandleCommand;
  const primaryConfig  = global.botConfig;
  if (!handleCommand || !primaryConfig) return;

  if (!message.message) return;

  const jid      = message.key.remoteJid;
  const sender   = message.key.participant || jid;
  const isFromMe = message.key.fromMe === true;

  if (jid === 'status@broadcast') return;

  const db = global.db;
  if (db && !isFromMe && db.isBanned(sender)) return;

  // ── Build a per-session botConfig for this secondary number ──────────────
  // Each secondary user gets their own settings (mode, prefix, etc.) stored
  // under their ownerJid — completely independent of the primary session.
  const ownerJid     = num ? `${num}@s.whatsapp.net` : '';
  const sessionConfig = {
    ...primaryConfig,
    ownerNumber: num,
    ownerJid,
    mode:   db?.getOwnerSetting(ownerJid, 'mode',   primaryConfig.mode)   || primaryConfig.mode,
    prefix: db?.getOwnerSetting(ownerJid, 'prefix', primaryConfig.prefix) || primaryConfig.prefix,
  };

  const text   = getMessageText(message);
  const prefix = sessionConfig.prefix || '.';

  // ── Font auto-apply for this session owner's own outgoing messages ────────
  // Mirrors the same logic in main.js for the primary session: delete the
  // plain original and resend in the owner's chosen font style.
  if (isFromMe && text && !text.startsWith(prefix)) {
    try {
      const fontUser = db?.getUser(ownerJid);
      if (fontUser?.fontStyle && fontUser.fontStyle > 0) {
        const { applyFontStyle } = require('./font');
        const converted = applyFontStyle(text, fontUser.fontStyle);
        if (converted && converted !== text) {
          sock.sendMessage(jid, { delete: message.key }).catch(() => {});
          sock.sendMessage(jid, { text: converted }).catch(() => {});
        }
      }
    } catch (_) {}
  }

  if (!text || !text.startsWith(prefix)) return;

  const parts   = text.slice(prefix.length).trim().split(/ +/);
  const command = parts.shift().toLowerCase();
  if (!command) return;

  console.log(`[sm:${num}] dispatching .${command}`);
  handleCommand(command, parts, message, sock, sessionConfig).catch(err =>
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

      // ── Pairing code — ONE-SHOT per pairing attempt ─────────────────────
      // pairingCodeIssuedOnce gates the whole attempt: once a code has been
      // shown to the user, it is never re-issued automatically for any
      // reason (QR refresh, reconnect, retry). Only an explicit `.pair`
      // re-run resets it (see addSession()). pairingCodeRequested is just
      // the narrower in-flight guard for the current socket/await.
      if (qr && s.pairingCodeIssuedOnce) {
        console.log(`[sm:${num}] QR refresh — pairing code already issued for this attempt (one-shot lock). Run .pair +${num} again for a new one.`);
      } else if (qr && s.pairingCodeRequested) {
        console.log(`[sm:${num}] QR refresh — request already in flight for this socket, ignoring.`);
      } else if (qr) {
        s.pairingCodeRequested = true;
        const clean = num.replace(/\D/g, '');
        try {
          const code = await sock.requestPairingCode(clean);
          // Arm the one-shot lock immediately — requestPairingCode() actually
          // invalidated any prior code and issued this one, so from WhatsApp's
          // perspective this attempt is now "used" regardless of whether the
          // DM notification below succeeds. The code is always printed to the
          // server console (next line) as a guaranteed fallback channel, same
          // as the primary session's pairing flow in main.js — an operator
          // watching logs never loses access to it even if _notify() fails.
          s.pairingCodeIssuedOnce = true;
          console.log(`[sm:${num}] 📱 PAIRING CODE: ${code}`);
          const delivered = await _notify(s,
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
            `┃  ⚠️  If it expires, run *.pair +${clean}* again —\n` +
            `┃      a new code is NOT sent automatically.\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`
          );
          if (!delivered) {
            console.log(`[sm:${num}] ⚠  Code delivered to console only — DM notify failed. Check server logs for the code above.`);
          }
        } catch (err) {
          console.error(`[sm:${num}] pairing code error:`, err.message);
          // No code was ever shown — safe to retry on the next QR event.
          s.pairingCodeRequested = false;
          await _notify(s, `❌ Failed to generate pairing code for +${clean}:\n${err.message}`);
        }
        // NOTE: no early return here — remaining event handlers (messages,
        // group-participants) must still run if present in the same flush.
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

        // 440 connectionReplaced: another instance of the same number has taken
        // over this session.  Reconnecting would kick THAT instance → infinite
        // kick-loop that can also destabilise other sessions on the same process.
        // Remove silently; the owner can run .pair again if needed.
        if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
          console.log(`[sm:${num}] connectionReplaced (440) — another instance of +${num} is active. Removing to avoid kick-loop.`);
          await _notify(s,
            `⚠️ Session *+${num}* was replaced by another WhatsApp connection.\n` +
            `This usually means the same number is open on two devices simultaneously.\n` +
            `Run *.pair +${num}* again when you're ready to reconnect.`
          );
          removeSession(num);
          return;
        }

        // 500 badSession: auth state is corrupt — wipe and let the owner re-pair.
        if (statusCode === DisconnectReason.badSession || statusCode === 500) {
          console.log(`[sm:${num}] badSession (500) — corrupt auth state, wiping`);
          try { fs.rmSync(sessionDir(num), { recursive: true, force: true }); } catch (_) {}
          _sessions.delete(num);
          await _notify(s,
            `⚠️ Session *+${num}* has a corrupt auth state and was removed.\n` +
            `Run *.pair +${num}* to reconnect it.`
          );
          return;
        }

        // 515 restartRequired: WA server asks for a clean reconnect — no wipe needed.
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(`[sm:${num}] restartRequired (515) — reconnecting in 5s`);
          scheduleReconnect(num, 5_000, false);
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
            await _notify(s,
              `🔓 Session *+${num}* was logged out (removed from linked devices).\n` +
              `Run *.pair +${num}* to reconnect it.`
            );
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

            if (!s.notifyJid || s.pairingCodeIssuedOnce) {
              // Either an auto-loaded orphan session (no one to send a code
              // to), or a code was already shown once for this attempt — the
              // one-shot lock means retrying here would never actually issue
              // a new code anyway. Remove the session; the owner must run
              // .pair again (an explicit re-pair) to start a fresh attempt.
              const reason = s.pairingCodeIssuedOnce
                ? 'a pairing code was already issued for this attempt (one-shot lock)'
                : 'no one to send a code to (auto-loaded orphan)';
              console.log(`[sm:${num}] 401 during pairing — ${reason}. Removing, run .pair to re-pair.`);
              _sessions.delete(num);
              if (s.pairingCodeIssuedOnce) {
                await _notify(s,
                  `⚠️ The pairing code for *+${num}* expired or the connection dropped before you linked.\n` +
                  `A new code is not sent automatically — run *.pair +${num}* again when you're ready.`
                );
              }
            } else {
              // Manually triggered, but no code was ever successfully shown
              // yet (e.g. corrupt auth hit before the QR/pairing handshake
              // completed) — safe to retry since the one-shot lock hasn't
              // armed. Use a short exponential backoff (10s, 20s, 40s … cap
              // 120s) so WhatsApp has breathing room before the next attempt.
              s._pairingRetries = (s._pairingRetries || 0) + 1;
              const backoffMs = Math.min(10_000 * Math.pow(2, s._pairingRetries - 1), 120_000);
              console.log(`[sm:${num}] 401 during pairing — stale auth (code not yet issued), wiping and restarting in ${Math.round(backoffMs / 1000)}s`);
              await _notify(s,
                `⚠️ Connection dropped while preparing to pair *+${num}*.\n` +
                `Retrying shortly...`
              );
              scheduleReconnect(num, backoffMs, true); // freshLogin=true → retry allowed (no code issued yet)
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

  // Guard: block pairing the primary bot number as a secondary session.
  // If the bot's own number is added as a secondary, both sockets share the
  // same WhatsApp identity — WA sends connectionReplaced (440) to one of them
  // and logs it out, taking the primary session down with it.
  const primaryNum = String(process.env.OWNER_NUMBER || '').replace(/\D/g, '');
  if (primaryNum && num === primaryNum) {
    throw new Error(
      `Cannot pair +${num} as a secondary session — that is the primary bot number.\n` +
      `The primary session (auth_info_baileys/) already handles this number.\n` +
      `Use a DIFFERENT phone number with .pair.`
    );
  }

  if (_sessions.has(num)) {
    const s = _sessions.get(num);
    if (s.connected) return { alreadyConnected: true };
    // The user explicitly re-ran .pair — this IS the "number is paired
    // again" trigger, so it's the one place allowed to re-arm the one-shot
    // lock and request a brand new code. Without resetting both flags here,
    // a previous attempt's pairingCodeIssuedOnce=true would silently block
    // the new code forever. Reconnects for already-known sessions skip the
    // queue — they are not new pairing starts, just restoring a connection.
    s.notifyJid              = notifyJid   || s.notifyJid;
    s.primarySock            = primarySock || s.primarySock;
    s.pairingCodeRequested   = false;
    s.pairingCodeIssuedOnce  = false;
    await _connect(num);
    return { reconnecting: true };
  }

  // New session: wait for a slot in the pairing queue so simultaneous .pair
  // commands don't fire two WA noise handshakes at the same time.
  await _enqueuePairing(num);

  _sessions.set(num, {
    phoneNumber:            num,
    sock:                   null,
    isConnecting:           false,
    reconnectTimer:         null,
    pairingCodeRequested:   false,
    pairingCodeIssuedOnce:  false,
    connected:              false,
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
    pairing:     (s.pairingCodeRequested || s.pairingCodeIssuedOnce) && !s.connected,
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

/**
 * Send a message to a JID via any currently-connected secondary session.
 * Used by main.js to notify the owner when the primary session logs out.
 * Returns true if a session was found and the message was sent, false otherwise.
 */
async function notifyViaSecondary(ownerJid, text) {
  for (const [, s] of _sessions) {
    if (s.connected && s.sock) {
      try {
        await s.sock.sendMessage(ownerJid, { text });
        return true;
      } catch (_) {}
    }
  }
  return false;
}

module.exports = { init, addSession, removeSession, listSessions, loadSavedSessions, notifyViaSecondary };
