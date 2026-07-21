// ── Load .env FIRST so every subsequent require sees the vars ────────────────
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// ─── Single-instance lock ─────────────────────────────────────────────────────
// Prevents two PM2 processes from running simultaneously and fighting over
// auth_info_baileys/, which causes duplicate pairing codes and "Couldn't link
// device" errors.
const LOCK_FILE = '.bot.lock';
(function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0); // throws if process is dead
        console.error(`[lock] Another instance is already running (PID ${pid}). Exiting.`);
        process.exit(1);
      } catch (_) {
        // Stale lock — previous process is gone, safe to take over
        console.warn(`[lock] Stale lock for PID ${pid} — taking over.`);
      }
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  // Remove lock on exit so a clean restart can start immediately
  const releaseLock = () => { try { fs.unlinkSync(LOCK_FILE); } catch (_) {} };
  process.on('exit',    releaseLock);
  process.on('SIGINT',  () => { releaseLock(); process.exit(0); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(0); });
})();

// ─── Pairing-attempt rate-limit guard ────────────────────────────────────────
// WhatsApp rate-limits a number that has too many failed pairing attempts in
// a short period — every extra attempt makes the lockout longer. This counter
// persists across PM2 restarts (stored in .pairing_attempts.json) and stops
// the bot from re-hammering WhatsApp after repeated 401s.
//
// Behaviour:
//   • Each 401-while-unregistered increments the counter.
//   • After MAX_PAIRING_FAILURES the bot logs a clear message and exits
//     WITHOUT reconnecting.  PM2 will try to restart it once more; on that
//     restart the counter is still ≥ MAX so the bot exits immediately again —
//     PM2's max_restarts cap then halts further restarts.
//   • A successful link (connection === 'open') resets the counter to 0.
//   • Counter auto-resets after PAIRING_COOLDOWN_MS (24 h) so the user can
//     try again the next day without manual file deletion.
const PAIRING_ATTEMPTS_FILE  = '.pairing_attempts.json';
const MAX_PAIRING_FAILURES   = 10;                    // raised — enough retries to handle transient WA hiccups
const PAIRING_COOLDOWN_MS    = 60 * 60 * 1000;       // 1 hour cooldown (was 24 h) for faster recovery

// ── Safe parse: always returns a validated { count, firstAttemptAt } object ──
// • `count` is coerced to a non-negative integer (NaN/non-numeric → 0).
// • `firstAttemptAt` must be a positive number; anything else → null.
// • On invalid JSON or missing file, returns the safe-default object.
// Invalid shapes are treated as "no attempts" so a corrupt file never
// creates a permanent lockout that the user cannot escape without SSH.
function readPairingAttempts() {
  try {
    const raw = fs.readFileSync(PAIRING_ATTEMPTS_FILE, 'utf8');
    const obj = JSON.parse(raw);
    const count          = Math.max(0, parseInt(obj?.count, 10) || 0);
    const firstAttemptAt = (typeof obj?.firstAttemptAt === 'number' && obj.firstAttemptAt > 0)
                             ? obj.firstAttemptAt
                             : null;
    return { count, firstAttemptAt };
  } catch (_) {
    return { count: 0, firstAttemptAt: null };
  }
}
function writePairingAttempts(data) {
  try {
    fs.writeFileSync(PAIRING_ATTEMPTS_FILE, JSON.stringify(data));
  } catch (err) {
    console.error('[pairing-guard] ⚠  Could not write attempt counter:', err.message);
  }
}
function resetPairingAttempts() {
  writePairingAttempts({ count: 0, firstAttemptAt: null });
}
function incrementPairingAttempts() {
  let data = readPairingAttempts();
  const now = Date.now();
  // Auto-reset if cooldown has passed
  if (data.firstAttemptAt && (now - data.firstAttemptAt) > PAIRING_COOLDOWN_MS) {
    data = { count: 0, firstAttemptAt: null };
  }
  data.count += 1;
  if (!data.firstAttemptAt) data.firstAttemptAt = now;
  writePairingAttempts(data);
  return data.count;
}

function printPairingSuspendedBanner(hLeft) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error('║  ⏸  PAIRING TEMPORARILY SUSPENDED                           ║');
  console.error('╠══════════════════════════════════════════════════════════════╣');
  console.error(`║  ${MAX_PAIRING_FAILURES} failed pairing attempts detected. WhatsApp is            ║`);
  console.error('║  rate-limiting this number — more attempts make it worse.   ║');
  console.error('║                                                             ║');
  console.error(`║  ⏳ Wait ~${String(hLeft).padEnd(2)} hour(s), then run on your server:           ║`);
  console.error('║                                                             ║');
  console.error('║    pm2 delete olasubomi                                     ║');
  console.error('║    rm -f .pairing_attempts.json                             ║');
  console.error('║    rm -rf auth_info_baileys/                                ║');
  console.error('║    pm2 start main.js --name olasubomi                       ║');
  console.error('║                                                             ║');
  console.error('║  Enter the NEW code in WhatsApp IMMEDIATELY after it shows. ║');
  console.error('╚══════════════════════════════════════════════════════════════╝');
  console.error('');
}

// Check the counter at startup — if already at the limit, refuse to run.
// Note: PM2 with autorestart:true will still restart up to max_restarts times,
// but each restart exits here immediately (no WA connection attempted), so
// WhatsApp is not hammered further. PM2 eventually marks the app unstable.
(function checkPairingLimitAtStartup() {
  const data = readPairingAttempts();
  if (data.count < MAX_PAIRING_FAILURES) return; // under limit — allow startup
  const now = Date.now();

  // If firstAttemptAt is missing/invalid but count is at limit, the file is
  // in a bad state.  Reset it so a corrupt file can never permanently block
  // the bot — the user would be stuck with no way out short of SSH.
  if (!data.firstAttemptAt) {
    console.warn('[pairing-guard] Counter at limit but timestamp missing — resetting to allow startup.');
    resetPairingAttempts();
    return;
  }

  if ((now - data.firstAttemptAt) > PAIRING_COOLDOWN_MS) {
    resetPairingAttempts();
    return; // cooldown passed — allow startup
  }

  const msLeft = PAIRING_COOLDOWN_MS - (now - data.firstAttemptAt);
  const hLeft  = Math.max(1, Math.ceil(msLeft / 3_600_000));
  printPairingSuspendedBanner(hLeft);
  process.exit(0);
})();

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
const botState = require('./bot-api/state');

// ── Mirror all console output into the dashboard's live-log buffer ─────────
(function wireDashboardLogs() {
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.log = (...args) => { botState.log('info', args.join(' ')); origLog(...args); };
  console.error = (...args) => { botState.log('error', args.join(' ')); origErr(...args); };
  console.warn = (...args) => { botState.log('warn', args.join(' ')); origWarn(...args); };
})();

// ── Start the internal dashboard API (same process, separate port) ─────────
if (process.env.DASHBOARD_API_ENABLED !== 'false') {
  try {
    const { startBotApi } = require('./bot-api/server');
    startBotApi({
      port: parseInt(process.env.DASHBOARD_API_PORT || '8090', 10),
      database: db,
      getUsers: async () => Object.entries(db.data.users || {}).map(([id, u]) => ({ id, ...u })),
      getGroups: async () => Object.entries(db.data.groups || {}).map(([id, g]) => ({ id, ...g })),
      getPlugins: () => {
        try {
          return fs.readdirSync(path.join(__dirname, 'plugins')).filter(f => f.endsWith('.js'));
        } catch { return []; }
      },
      broadcast: async (message, target) => {
        if (!currentSock) throw new Error('bot not connected');
        const jids = target === 'groups'
          ? Object.keys(db.data.groups || {})
          : Object.keys(db.data.users || {}).map(id => `${id}@s.whatsapp.net`);
        let sent = 0;
        for (const jid of jids) {
          try { await currentSock.sendMessage(jid, { text: message }); sent++; } catch (_) {}
        }
        return { sent, total: jids.length };
      },
      restart: async () => { process.exit(0); },
      setSetting: async (k, v) => db.setSetting?.(k, v),
    });
  } catch (err) {
    console.error('[bot-api] failed to start:', err.message);
  }
}
const { normalizeJid, getMessageText, resolveIsOwner } = require('./lib/helpers');
const { applyFontStyle } = require('./lib/font');
const { handleParticipantUpdate } = require('./events/welcome');
const {
  cacheMessage,
  handleAntiDelete,
  handleAntiDeleteRevocation,
  handleAntiLink,
  handleAntiSpam,
  handleAntiViewOnce,
  handleAutoReact,
  handleAntiCall,
  handleAntiChannel,
  handleAntiStatus,
} = require('./events/protection');
const { handleStatusUpdate } = require('./events/autoStatus');
const allCommands    = require('./commands/index');
const sessionManager = require('./lib/sessionManager');

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

// ─── WA protocol version cache ────────────────────────────────────────────────
// Fetching inside connect() on every reconnect adds a live network round-trip
// that is especially dangerous during mid-pairing reconnects (the handshake
// window is tight — a stall or failure delays reconnect by 10 s, giving
// WhatsApp no companion_hello and aborting the link).
//
// Strategy:
//   • Fetch once at startup (before the first connect) and cache with a timestamp.
//   • On each non-pairing reconnect, refresh the cache if it is older than
//     VERSION_CACHE_TTL_MS (6 h) so long-lived bots don't drift from the
//     current WA protocol version.
//   • During an active pairing attempt (pairingCodeRequested=true) ALWAYS use
//     the cached value to protect the handshake window — a version re-fetch is
//     never worth risking the pairing flow.
const VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let cachedWaVersion = null; // { version, isLatest, fetchedAt }

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

// ─── Post-logout wipe grace flag ──────────────────────────
// Set to true by wipAndRepair() after a clean logout-triggered
// wipe. If the VERY NEXT connect attempt gets a 401 (WA server
// hasn't fully cleared the old session yet), we treat it as a
// transient rejection rather than a real pairing failure so it
// doesn't burn the failure counter or trigger a long backoff.
// Cleared immediately after it is consumed (one-use flag).
let _freshWipeGrace = false;

// ─── New-login session backup flag ────────────────────────
// Set to true in connect() when creds.registered === false,
// meaning this is a brand-new pairing rather than a reconnect.
// Consumed (set back to false) the moment connection === 'open'
// fires so the backup is sent exactly once per new login.
let _isNewLogin = false;

// ─────────────────────────────────────────────────────────
// destroySocket — remove all listeners then close the WS
// ─────────────────────────────────────────────────────────
// sendSessionBackup — zip auth_info_baileys/ and send to owner
//
// Called ONCE per new login (not on reconnects).
// Uses `tar` (always available on Linux) to create a .tar.gz.
// Runs in background so it never delays the connection.
// ─────────────────────────────────────────────────────────
async function sendSessionBackup(sock) {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  const os   = require('os');
  const path = require('path');

  const ownerNum = String(
    process.env.OWNER_NUMBER || botConfig.ownerNumber || ''
  ).replace(/\D/g, '');

  if (!ownerNum) {
    console.warn('[backup] OWNER_NUMBER not set — skipping session backup.');
    return;
  }

  const ownerJid  = `${ownerNum}@s.whatsapp.net`;
  const authDir   = path.resolve('auth_info_baileys');
  const now       = new Date();
  const stamp     = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `session_${botConfig.name}_${stamp}.tar.gz`;
  const outPath   = path.join(os.tmpdir(), filename);

  console.log('[backup] New login detected — preparing session backup...');

  // Wait a few seconds to ensure creds are fully flushed to disk
  await new Promise(r => setTimeout(r, 5000));

  try {
    // Create tarball of the auth directory (parent dir as base)
    await execFileAsync('tar', [
      '-czf', outPath,
      '-C',   path.dirname(authDir),
      path.basename(authDir)
    ]);

    const buf      = fs.readFileSync(outPath);
    const sizekb   = (buf.length / 1024).toFixed(1);
    const device   = sock.user?.name || sock.user?.id?.split(':')[0] || 'Unknown device';
    const loginAt  = now.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour12: false });

    const caption =
      `✅ *New WhatsApp Session Created*\n\n` +
      `📱 Device   : ${device}\n` +
      `🕐 Time     : ${loginAt} (WAT)\n` +
      `🤖 Bot      : ${botConfig.name} v${botConfig.version} ${botConfig.beta}\n` +
      `📦 Size     : ${sizekb} KB\n\n` +
      `⚠️ *Keep this file safe — it contains your session credentials.*\n` +
      `_To restore: unzip and replace your auth_info_baileys/ folder._`;

    await sock.sendMessage(ownerJid, {
      document: buf,
      mimetype: 'application/gzip',
      fileName: filename,
      caption
    });

    console.log(`[backup] Session backup sent to owner (${sizekb} KB) — ${filename}`);
  } catch (err) {
    console.error('[backup] Failed to create/send session backup:', err.message);
  } finally {
    try { fs.unlinkSync(outPath); } catch {}
  }
}

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
          // ── ROOT CAUSE FIX ────────────────────────────────────────────────
          // Baileys' requestPairingCode() passes the number directly to
          // jidEncode(phoneNumber, 's.whatsapp.net').  Any non-digit character
          // ('+', spaces, dashes, parentheses) produces an invalid JID such as
          // "+234...@s.whatsapp.net", which WhatsApp rejects immediately.
          // The rejection throws, pairingCodeRequested resets to false, and the
          // bot retries on every QR refresh in an infinite failure loop — the
          // user never sees a working pairing code.
          // Fix: strip every non-digit character before handing to Baileys.
          // Coerce to string before replacing — db.getSetting() could return a
          // non-string (e.g. a stored number) which would throw on .replace().
          const rawNumber = String(
            process.env.OWNER_NUMBER || db.getSetting('ownerNumber', null) || ''
          );
          const phoneNumber = rawNumber.replace(/\D/g, ''); // digits only

          if (!phoneNumber) {
            console.log('[WA] ⚠  Cannot request pairing code — phone number not set.');
            console.log('[WA]    Add OWNER_NUMBER as a Replit Secret (country code + digits,');
            console.log('[WA]    no + or spaces, e.g. 2349061198658) then restart the bot.');
          } else {
            if (rawNumber !== phoneNumber) {
              console.log(`[WA] Phone number sanitised: "${rawNumber}" → "${phoneNumber}" (non-digits stripped)`);
            }
            // Set flag BEFORE the async call so a concurrent QR event
            // cannot race through the guard while we await the code.
            pairingCodeRequested = true;
            console.log(`[WA] Requesting pairing code for ${phoneNumber} (one-time per socket)...`);
            try {
              const code = await sock.requestPairingCode(phoneNumber);
              console.log(`\n📱 PAIRING CODE: ${code}`);
              botState.setConnection('pairing', { pairingCode: code });
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
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reasonName = Object.keys(DisconnectReason).find(
                             k => DisconnectReason[k] === statusCode
                           ) || statusCode;

        console.log(`[WA] Connection closed — ${reasonName}(${statusCode}) | registered: ${registered}`);
        botState.setConnection('close');

        // ── 440 connectionReplaced: always stop, regardless of state ────────
        // Another instance has taken over the session. Reconnecting would kick
        // that instance → infinite kick-loop.
        if (statusCode === DisconnectReason.connectionReplaced) {
          console.log('[WA] connectionReplaced — another instance took over. Halting this duplicate.');
          return;
        }

        // ── NOT YET REGISTERED — two distinct sub-cases ────────────────────
        if (!registered) {
          if (statusCode === DisconnectReason.loggedOut) {
            // ── 401 + unregistered = CORRUPT / STALE AUTH STATE ─────────────
            //
            // Root cause of the "401 loop" failure mode:
            //   auth_info_baileys/ contains noise keys + identity material
            //   from a previous failed pairing attempt.  On reconnect Baileys
            //   loads them and presents them to WhatsApp during the noise
            //   handshake.  WhatsApp sees keys it doesn't recognise (because
            //   pairing never completed) and immediately rejects with 401 —
            //   before it ever emits a QR event.  hasQR stays false, the
            //   pairing-code branch is never reached, and the bot loops.
            //
            // Fix: treat 401-while-unregistered exactly like 401-while-
            //   registered: wipe auth_info_baileys/ and restart with a clean
            //   slate so a fresh noise handshake and new pairing code can begin.
            console.log('[WA] ⚠  401 loggedOut while unregistered — auth state is corrupt/stale.');

            // Grace period: wipAndRepair() sets _freshWipeGrace=true after a clean
            // logout wipe.  The FIRST post-wipe connect may still get a 401 because
            // WA's server hasn't fully processed the logout yet.  Skip the failure
            // counter and use a short 10 s retry instead of the full backoff ladder.
            if (_freshWipeGrace) {
              _freshWipeGrace = false; // consume — only one free pass
              console.log('[WA]    Grace pass: this 401 is a server-side delay after clean logout wipe.');
              console.log('[WA]    Not counted as a pairing failure. Retrying in 10s...');
              try {
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
              } catch (_) {}
              scheduleReconnect(10_000, { freshLogin: true });
              return;
            }

            console.log('[WA]    This means a previous failed pairing left partial keys that');
            console.log('[WA]    WhatsApp is rejecting at the noise-handshake level (no QR emitted).');

            const failCount = incrementPairingAttempts();
            console.log(`[WA]    Pairing failure #${failCount} of ${MAX_PAIRING_FAILURES} allowed.`);

            if (failCount >= MAX_PAIRING_FAILURES) {
              printPairingSuspendedBanner(Math.max(1, Math.ceil(PAIRING_COOLDOWN_MS / 3_600_000)));
              process.exit(0); // PM2 will restart a few more times but exits immediately each time
              return;
            }

            console.log('[WA]    Wiping auth_info_baileys/ and starting a clean pairing flow...');
            try {
              fs.rmSync('auth_info_baileys', { recursive: true, force: true });
              console.log('[WA] auth_info_baileys/ cleared.');
            } catch (e) {
              console.error('[WA] Could not clear auth_info_baileys/:', e.message);
            }
            // Exponential backoff: 15s, 30s, 60s, 120s … capped at 5 min.
            // Rapid reconnects after a 401 make WhatsApp keep rejecting at the
            // noise-handshake level before it can emit a QR — giving it more
            // breathing room between attempts lets the next attempt succeed.
            const backoffMs = Math.min(15_000 * Math.pow(2, failCount - 1), 300_000);
            console.log(`[WA]    Waiting ${Math.round(backoffMs / 1000)}s before next attempt (backoff #${failCount})...`);
            scheduleReconnect(backoffMs, { freshLogin: true });
            return;
          }

          // ── Any other close reason while unregistered = mid-pairing drop ──
          //
          // WhatsApp delivers the identity keys over the active WebSocket when
          // the user enters the code.  Without a live socket the handshake
          // cannot complete.  Do NOT wipe auth_info_baileys/ (it holds the
          // identity keys WA uses to recognise this bot instance) and do NOT
          // request a new code (freshLogin=false keeps pairingCodeRequested).
          console.log(
            `[WA] ⚠  Connection dropped during pairing — ${reasonName}(${statusCode}).` +
            ` | pairingCodeRequested: ${pairingCodeRequested}` +
            ` | registered: ${registered}`
          );
          console.log('[WA]    Reconnecting silently in 5s (preserving pairing state — no new code).');
          console.log('[WA]    auth_info_baileys/ NOT wiped — partial pairing state preserved.');
          scheduleReconnect(5_000);   // freshLogin defaults to false → pairingCodeRequested preserved
          return;
        }

        // ── REGISTERED — normal post-link reconnect logic ───────────────────

        // Helper: wipe auth and start a fresh pairing flow.
        // Also resets the pairing-attempts counter because a legitimate logout
        // should always allow a clean re-pair — it is NOT a failed pairing attempt.
        function wipAndRepair(reason) {
          console.log('');
          console.log('╔══════════════════════════════════════════════════════════════╗');
          console.log('║  🔓  MAIN SESSION LOGGED OUT — AUTO RE-PAIRING              ║');
          console.log('╠══════════════════════════════════════════════════════════════╣');
          console.log(`║  Reason : ${reason.slice(0, 51).padEnd(51)}║`);
          console.log('║                                                              ║');
          console.log('║  The bot will request a NEW pairing code in ~10 seconds.    ║');
          console.log('║  ✅ Enter it in WhatsApp IMMEDIATELY when it appears.        ║');
          console.log('║  ⛔ Do NOT restart the bot — it will re-pair automatically. ║');
          console.log('╚══════════════════════════════════════════════════════════════╝');
          console.log('');

          try {
            fs.rmSync('auth_info_baileys', { recursive: true, force: true });
            console.log('[WA] auth_info_baileys/ cleared.');
          } catch (e) {
            console.error('[WA] Could not clear auth_info_baileys/:', e.message);
          }
          resetPairingAttempts(); // fresh slate — don't count logout as a pairing failure
          console.log('[WA] Pairing-attempts counter reset (clean logout, not a failure).');

          // Notify the owner via any connected secondary session so they get a
          // WhatsApp message even when they aren't watching the server logs.
          const ownerNum = String(process.env.OWNER_NUMBER || db?.getSetting('ownerNumber', '') || '').replace(/\D/g, '');
          if (ownerNum) {
            const ownerJid = `${ownerNum}@s.whatsapp.net`;
            sessionManager.notifyViaSecondary(ownerJid,
              `🔓 *Main session logged out!*\n\n` +
              `Reason: ${reason}\n\n` +
              `The bot is re-pairing automatically.\n` +
              `A new pairing code will appear in the server logs in ~10 seconds.\n\n` +
              `✅ Enter it in WhatsApp → Settings → Linked Devices → Link a Device`
            ).catch(() => {});
          }

          // Grace flag: if WA still rejects on the very next connect, treat it
          // as a transient server-side delay — not a real pairing failure.
          _freshWipeGrace = true;

          // Wait 10 s before reconnecting — gives WhatsApp's server time to
          // fully clear the old session so the new socket gets a fresh QR
          // instead of an immediate 401 noise-handshake rejection.
          scheduleReconnect(10_000, { freshLogin: true });
        }

        // 401 loggedOut: device was removed or session revoked.
        if (statusCode === DisconnectReason.loggedOut) {
          wipAndRepair('Logged out (401) — session revoked or number removed');
          return;
        }

        // 403 forbidden: number was banned by WhatsApp.
        // The old session is permanently invalid — looping is pointless.
        // Wipe auth_info_baileys/ and start a fresh pairing flow so the
        // owner can link a new (unbanned) number without manual intervention.
        if (statusCode === 403) {
          console.log('[WA] ⚠  403 forbidden — the linked WhatsApp number has likely been banned.');
          console.log('[WA]    The existing session is permanently invalid.');
          wipAndRepair('Banned number (403)');
          return;
        }

        // All other close reasons (timedOut, restart, etc.) while registered
        // — standard backoff reconnect, preserve nothing special.
        console.log(`[WA] Reconnecting in 5s...`);
        scheduleReconnect(5_000);
      }

      if (connection === 'open') {
        // Successful link — reset the pairing-attempt counter so the user
        // can always re-pair cleanly after a future logout.
        resetPairingAttempts();
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

        botState.setSock(sock);
        botState.prefix = botConfig.prefix;
        botState.mode = botConfig.mode;
        botState.botNumber = sock?.user?.id?.split(':')[0] || botState.botNumber;
        botState.setConnection('open', { pairingCode: null });

        // ── Session backup — only on brand-new logins ──────────────
        if (_isNewLogin) {
          _isNewLogin = false;   // consume immediately — one-shot
          // Run async in background so it never blocks the connection
          sendSessionBackup(sock).catch(err =>
            console.error('[backup] sendSessionBackup failed (non-fatal):', err.message)
          );
        }
      }
    }

    // ── Incoming messages ─────────────────────────────────
    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];

      console.log(`[WA] messages.upsert sock#${sockId} — type: ${type}, count: ${messages.length}`);
      botState.bumpStat('messagesSeen', messages.length);

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

          // ── Protocol REVOKE = "delete for everyone" ───────────────
          // This is how WhatsApp delivers user-initiated deletions.
          // Route them to anti-delete BEFORE any other processing.
          if (message.message?.protocolMessage?.type === 0) {
            await handleAntiDeleteRevocation(sock, message).catch(e =>
              console.error('[handler] antiDeleteRevocation:', e.message)
            );
            continue; // protocol messages are not commands
          }

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

          // ── Auto-Read: mark incoming messages as read when enabled ──
          if (!isFromMe && db.getSetting('autoRead', false)) {
            sock.readMessages([message.key]).catch(e =>
              console.error('[handler] autoRead:', e.message)
            );
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

          if (!isFromMe && isJidGroup(jid)) {
            const chBlocked = await handleAntiChannel(sock, message, botConfig).catch(e => {
              console.error('[handler] antiChannel:', e.stack || e.message);
              return false;
            });
            if (chBlocked) { console.log('[WA] antiChannel blocked message'); continue; }

            const stBlocked = await handleAntiStatus(sock, message, botConfig).catch(e => {
              console.error('[handler] antiStatus:', e.stack || e.message);
              return false;
            });
            if (stBlocked) { console.log('[WA] antiStatus blocked message'); continue; }
          }

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
            // ── Permanent font: auto-echo non-command text in the user's saved font ──
            // Only fires in DMs (not groups) so groups aren't spammed with echoes.
            if (isFromMe && text && !isJidGroup(jid)) {
              try {
                const fontUser = db.getUser(sender);
                if (fontUser.fontStyle && fontUser.fontStyle > 0) {
                  const converted = applyFontStyle(text, fontUser.fontStyle);
                  if (converted && converted !== text) {
                    sock.sendMessage(jid, { text: converted }).catch(() => {});
                  }
                }
              } catch (_) {}
            }
            console.log(`[WA] not a command — text does not start with prefix "${prefix}"`);
            continue;
          }

          const parts   = text.slice(prefix.length).trim().split(/ +/);
          const command = parts.shift().toLowerCase();
          if (!command) { console.log('[WA] empty command after prefix'); continue; }

          console.log(`[WA] dispatching .${command} to handleCommand (sock#${sockId})`);

          // ── Auto-Typing: show a typing indicator while a command runs ──
          if (db.getSetting('autoTyping', false)) {
            sock.sendPresenceUpdate('composing', jid).catch(e =>
              console.error('[handler] autoTyping:', e.message)
            );
          }

          handleCommand(command, parts, message, sock, botConfig).catch(err =>
            console.error(`[cmd] .${command} unhandled exception:\n${err.stack || err.message}`)
          ).finally(() => {
            if (db.getSetting('autoTyping', false)) {
              sock.sendPresenceUpdate('paused', jid).catch(() => {});
            }
          });
        }
      }
    }

    // ── Deleted messages ──────────────────────────────────
    if (events['messages.delete']) {
      // Baileys may emit { keys: [...] } or a plain array — handle both
      const raw  = events['messages.delete'];
      const keys = Array.isArray(raw) ? raw : (raw.keys || []);
      await handleAntiDelete(sock, keys).catch(e =>
        console.error('[handler] antiDelete:', e.message)
      );
    }

    // ── Incoming calls (anti-call / anti-video-call) ──────
    if (events['call']) {
      await handleAntiCall(sock, events['call']).catch(e =>
        console.error('[handler] antiCall:', e.message)
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
// inside an event handler, to prevent stacked async calls.
//
// opts.freshLogin = true  → connect() resets all pairing state
//                           (use only after a confirmed post-link logout)
// opts.freshLogin = false → connect() preserves pairingCodeRequested
//                           so no second pairing code is generated when
//                           we silently reconnect during an active pairing
// ─────────────────────────────────────────────────────────
function scheduleReconnect(delayMs, opts = {}) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(opts);
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
// opts.freshLogin = true  → used after a confirmed post-link 401 logout;
//                           resets all pairing state so a new code is requested.
// opts.freshLogin = false → silent reconnect during an active pairing attempt;
//                           pairingCodeRequested is preserved so the existing
//                           code stays valid and no second code is generated.
async function connect({ freshLogin = false } = {}) {
  if (isConnecting) {
    console.log('[WA] connect() already in progress — skipping.');
    return;
  }
  isConnecting = true;

  // Only reset pairingCodeRequested on an explicit freshLogin (post-link 401
  // logout).  During any other reconnect — including silent socket restarts
  // while the user is still entering the pairing code — the flag must be
  // preserved so no second code is generated and the existing code stays valid.
  if (freshLogin) {
    console.log('[WA] Resetting pairingCodeRequested because freshLogin=true');
    pairingCodeRequested = false;
  }

  if (pairingCodeRequested) {
    console.log('[WA] connect() — preserving pairingCodeRequested=true (silent reconnect during pairing)');
  } else {
    console.log(`[WA] connect() — pairingCodeRequested = false (freshLogin: ${freshLogin})`);
  }

  if (currentSock) {
    console.log('[WA] Destroying previous socket...');
    destroySocket(currentSock);
    currentSock = null;
  }

  try {
    // Resolve the WA protocol version from cache (see VERSION_CACHE_TTL_MS).
    // Rules:
    //   1. No cache at all → fetch now (first connect after startup fetch failed).
    //   2. pairingCodeRequested=true → ALWAYS use cache; never risk the pairing
    //      handshake window on a network round-trip.
    //   3. Cache older than VERSION_CACHE_TTL_MS (6 h) → refresh now (normal
    //      reconnect on a long-lived bot; WA protocol updates need to be picked up).
    const preFetchAgeMs = cachedWaVersion ? Date.now() - cachedWaVersion.fetchedAt : Infinity;
    const cacheStale    = preFetchAgeMs > VERSION_CACHE_TTL_MS;
    if (!cachedWaVersion || (cacheStale && !pairingCodeRequested)) {
      const reason = !cachedWaVersion ? 'no cache' : `cache stale (${Math.round(preFetchAgeMs / 3_600_000)}h old)`;
      console.log(`[WA] Refreshing WA version — ${reason}...`);
      const { version: v, isLatest: il } = await fetchLatestBaileysVersion();
      cachedWaVersion = { version: v, isLatest: il, fetchedAt: Date.now() };
    }
    const { version, isLatest } = cachedWaVersion;
    // Log age AFTER any refresh so the reported value is always accurate.
    const cacheAgeMs = Date.now() - cachedWaVersion.fetchedAt;
    console.log(`[WA] WA version: ${version.join('.')} (isLatest: ${isLatest}, cacheAgeMs: ${Math.round(cacheAgeMs)})`);

    // Ensure auth directory exists — prevents ENOENT on fresh deployments
    fs.mkdirSync('auth_info_baileys', { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    console.log(`[WA] Auth state loaded — creds.registered: ${state.creds.registered}`);
    if (state.creds.registered) {
      console.log('[WA] Existing credentials found — resuming session (no pairing code needed).');
      _isNewLogin = false;
    } else {
      console.log('[WA] No registered session — will request ONE pairing code when QR event fires.');
      _isNewLogin = true;   // flag: send backup on first successful open
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
  botState.bumpStat('commandsRun');
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
    // Silently ignore — prefix present but no matching command
    console.log(`[cmd]   command ".${command}" NOT FOUND — ignoring silently`);
    return;
  }
  console.log(`[cmd]   command ".${command}" FOUND — exec type: ${typeof cmd.exec}`);

  // ── Inject helpers onto message ─────────────────────────
  message._isOwner      = isOwner;
  message._isGroupAdmin = isGroup
    ? () => isGroupAdmin(jid, sender)
    : async () => false;

  // _react(emoji): send/update a reaction on the command message.
  // Fire-and-forget — never throws; reactions are best-effort.
  message._react = (emoji) =>
    sock.sendMessage(jid, { react: { text: emoji, key: message.key } }).catch(() => {});

  console.log(`[cmd]   _isOwner: ${message._isOwner}`);

  // ── Per-category reaction emoji ──────────────────────────
  // Sent as soon as the command is recognised, so the user gets instant
  // visual feedback that the bot received and is processing their request.
  const CATEGORY_EMOJI = {
    downloader: '⏬', audio:    '🎵', ai:       '🤖',
    fun:        '😄', games:    '🎮', group:    '👥',
    general:    'ℹ️', economy:  '💰', owner:    '👑',
    search:     '🔍', converter:'🔄', tools:    '🔧',
    utility:    '⚙️', admin:    '🛡️', movies:   '🎬',
    anime:      '🎌', sports:   '⚽', religion: '📖',
    canvas:     '🎨',
  };
  // Use the command's own reaction emoji if defined, otherwise fall back to
  // the category emoji. This lets each command signal exactly what it does
  // (🎌 for animedl, 🎵 for song, 🎬 for yt, etc.) rather than a generic
  // category icon. The reaction is sent once and never updated on success —
  // the user sees the command-specific emoji for the lifetime of the message.
  const cmdEmoji = cmd.reaction || CATEGORY_EMOJI[cmd.category] || '⚡';
  message._react(cmdEmoji);

  // ── Execute ─────────────────────────────────────────────
  console.log(`[cmd]   calling cmd.exec for .${command}...`);
  try {
    await cmd.exec(args, sock, jid, isGroup, sender, message, botConfig);
    console.log(`[cmd]   .${command} exec completed OK`);
    // Intentionally NOT updating the reaction to ✅ — the command-specific
    // emoji already tells the user what was done; overwriting it with ✅
    // removes that context.
  } catch (err) {
    console.error(`[cmd]   .${command} THREW:\n${err.stack || err.message}`);
    message._react('❌');
    await sock.sendMessage(jid, {
      text: `❌ Error in .${command}: ${err.message}`
    }).catch(e2 => console.error('[cmd]   sendMessage (error reply) also failed:', e2.stack || e2.message));
  }
}

// ─── Start ────────────────────────────────────────────────
// Fetch the WA protocol version ONCE at startup, before the first connect().
// All reconnects (including mid-pairing ones) reuse this cached value so no
// extra network round-trip is added inside the handshake window.
console.log('🚀 Starting OLASUBOMI-MD...');
(async () => {
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    cachedWaVersion = { version, isLatest, fetchedAt: Date.now() };
    console.log(`[WA] WA version pre-fetched: ${version.join('.')} (isLatest: ${isLatest})`);
  } catch (err) {
    console.warn(`[WA] Could not pre-fetch WA version: ${err.message} — will retry inside connect()`);
  }

  // ── Auto-reset pairing counter when auth dir is absent or empty ───────────
  // When the user manually deletes auth_info_baileys/ and restarts, the
  // .pairing_attempts.json counter is still at its old value (e.g. 8/10).
  // Without this reset the bot immediately hits the high-backoff path even
  // though it has a completely clean slate to work from.
  try {
    const authDir    = 'auth_info_baileys';
    const dirExists  = fs.existsSync(authDir);
    const dirEmpty   = dirExists && fs.readdirSync(authDir).length === 0;
    if (!dirExists || dirEmpty) {
      const prev = readPairingAttempts();
      if (prev.count > 0) {
        resetPairingAttempts();
        console.log(`[pairing-guard] auth_info_baileys/ is clean — reset stale failure counter (was ${prev.count}).`);
      }
    }
  } catch (_) {}

  // ── Expose handleCommand globally so sessionManager can route secondary sessions ──
  global._smHandleCommand = handleCommand;

  // ── Start primary WhatsApp session ────────────────────────────────────────
  connect().catch(err => console.error('[startup] Fatal:', err.message));

  // ── Resume any previously saved secondary sessions ─────────────────────────
  sessionManager.init(handleCommand);
  sessionManager.loadSavedSessions().catch(err =>
    console.error('[startup] sessionManager.loadSavedSessions error:', err.message)
  );

  // ── Start Telegram bot if token is configured ──────────────────────────────
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const { start: startTelegram } = require('./telegram');
      startTelegram();
      console.log('[startup] Telegram bot started.');
    } catch (err) {
      console.error('[startup] Telegram bot failed to start:', err.message);
    }
  } else {
    console.log('[startup] TELEGRAM_BOT_TOKEN not set — Telegram bot skipped.');
  }
})();
