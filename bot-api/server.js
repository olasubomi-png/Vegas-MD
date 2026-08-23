// Lightweight local management API. It is designed to stay bound to localhost
// and be reached through an HTTPS reverse proxy. Legacy dashboard endpoints use
// x-api-key; the new /v1/dashboard surface uses a separate HMAC-signed contract.
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const state = require('./state');

const MAX_DASHBOARD_BODY_BYTES = '128kb';
const DASHBOARD_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DASHBOARD_NONCE_TTL_MS = 10 * 60 * 1000;
const seenDashboardNonces = new Map();
const SAFE_GROUP_ID = /^[A-Za-z0-9._-]{4,180}(?:@g\.us)?$/;
const BOOLEAN_GROUP_KEYS = new Set([
  'antiLink', 'antiDelete', 'antiSpam', 'antiViewOnce', 'antiChannel', 'autoReact', 'autoStatus'
]);

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function makeDashboardSignature({ signingSecret, timestamp, nonce, method, path, body }) {
  return crypto
    .createHmac('sha256', signingSecret)
    .update([timestamp, nonce, method.toUpperCase(), path, body || ''].join('.'))
    .digest('hex');
}

function pruneNonces(now = Date.now()) {
  for (const [nonce, expiresAt] of seenDashboardNonces) {
    if (expiresAt <= now) seenDashboardNonces.delete(nonce);
  }
}

function dashboardCredentials() {
  const sharedSecret = process.env.BOT_API_SHARED_SECRET || '';
  const signingSecret = process.env.BOT_API_SIGNING_SECRET || '';
  return sharedSecret && signingSecret ? { sharedSecret, signingSecret } : null;
}

function rejectDashboardRequest(res, status = 401) {
  return res.status(status).json({ error: 'dashboard request rejected' });
}

function requireSignedDashboardRequest(req, res, next) {
  const credentials = dashboardCredentials();
  if (!credentials) return res.status(503).json({ error: 'dashboard API is not configured' });

  const timestamp = String(req.headers['x-vegas-timestamp'] || '');
  const nonce = String(req.headers['x-vegas-nonce'] || '');
  const providedSignature = String(req.headers['x-vegas-signature'] || '');
  const providedSharedSecret = String(req.headers['x-vegas-shared-secret'] || '');
  const timestampMs = Date.parse(timestamp);
  const now = Date.now();

  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > DASHBOARD_CLOCK_SKEW_MS) {
    return rejectDashboardRequest(res);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)) {
    return rejectDashboardRequest(res);
  }
  pruneNonces(now);
  if (seenDashboardNonces.has(nonce) || !safeEqual(providedSharedSecret, credentials.sharedSecret)) {
    return rejectDashboardRequest(res);
  }

  const expectedSignature = makeDashboardSignature({
    signingSecret: credentials.signingSecret,
    timestamp,
    nonce,
    method: req.method,
    path: req.originalUrl,
    body: req.rawBody || '',
  });
  if (!safeEqual(providedSignature, expectedSignature)) return rejectDashboardRequest(res);

  seenDashboardNonces.set(nonce, now + DASHBOARD_NONCE_TTL_MS);
  return next();
}

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!process.env.DASHBOARD_API_KEY) {
    return res.status(500).json({ error: 'DASHBOARD_API_KEY not configured on bot' });
  }
  if (!safeEqual(key, process.env.DASHBOARD_API_KEY)) {
    return res.status(401).json({ error: 'invalid api key' });
  }
  return next();
}

function getHealth() {
  if (state.connection === 'open') return 'online';
  if (state.connection === 'connecting' || state.connection === 'pairing') return 'degraded';
  if (state.connection === 'close') return 'offline';
  return 'unknown';
}

function configured(...keys) {
  return keys.some(key => Boolean(process.env[key]?.trim()));
}

function getProviderStates() {
  const checkedAt = new Date().toISOString();
  const make = (id, name, isConfigured) => ({
    id,
    name,
    configured: isConfigured,
    health: isConfigured ? 'unknown' : 'unavailable',
    checkedAt,
    message: isConfigured ? 'Configured; remote health check pending.' : 'Not configured on the bot host.',
  });
  return [
    make('zst', 'ZST Labs', configured('ZST_API_KEY')),
    make('openai', 'OpenAI', configured('OPENAI_API_KEY', 'OPEN_API_KEY')),
    make('pinterest', 'Pinterest', configured('PINTEREST_API_URL', 'DAVID_CYRIL_API_BASE')),
    make('david-cyril', 'David Cyril', configured('DAVID_CYRIL_API_BASE')),
    make('music', 'Music delivery', configured('INVIDIOUS_SEARCH_URL', 'DAVID_CYRIL_API_BASE')),
    make('image', 'Image generation', configured('ZST_IMAGE_API_URL', 'OPENAI_API_KEY', 'OPEN_API_KEY')),
  ];
}

function groupIdWithDomain(groupId) {
  return groupId.endsWith('@g.us') ? groupId : `${groupId}@g.us`;
}

function serializeGroup(record) {
  const id = String(record.id || '').replace(/@g\.us$/, '');
  return {
    id,
    name: record.name || `Group ${id.slice(0, 12)}`,
    participantCount: Number.isInteger(record.participantCount) ? record.participantCount : undefined,
    welcomeEnabled: Boolean(record.welcome),
    goodbyeEnabled: Boolean(record.goodbye),
    welcomeTemplate: typeof record.welcomeMsg === 'string' ? record.welcomeMsg.slice(0, 2000) : undefined,
    goodbyeTemplate: typeof record.goodbyeMsg === 'string' ? record.goodbyeMsg.slice(0, 2000) : undefined,
    moderation: {
      antiLink: Boolean(record.antiLink),
      antiDelete: Boolean(record.antiDelete),
      antiSpam: Boolean(record.antiSpam),
      antiViewOnce: Boolean(record.antiViewOnce),
      antiChannel: Boolean(record.antiChannel),
    },
    automation: { autoReact: Boolean(record.autoReact), autoStatus: Boolean(record.autoStatus) },
  };
}

function getDashboardTests() {
  const health = getHealth();
  const completedAt = new Date().toISOString();
  const dashboardConfigured = Boolean(dashboardCredentials());
  return [
    {
      id: 'runtime-connection',
      name: 'WhatsApp runtime connection',
      status: health === 'online' ? 'passed' : health === 'offline' ? 'failed' : 'running',
      completedAt,
      details: health === 'online' ? 'Bot runtime is connected.' : `Current runtime state: ${String(state.connection || 'unknown')}.`,
    },
    {
      id: 'dashboard-auth',
      name: 'Signed dashboard API configuration',
      status: dashboardConfigured ? 'passed' : 'failed',
      completedAt,
      details: dashboardConfigured ? 'Shared-secret and HMAC signing configuration are present.' : 'Bot API signing secrets are missing on the bot host.',
    },
    ...state.getDashboardTests(),
  ].slice(0, 100);
}

function dashboardActivity({ groups = [], providers = [] } = {}) {
  const occurredAt = new Date().toISOString();
  const health = getHealth();
  const status = health === 'online' ? 'success' : health === 'offline' ? 'error' : 'warning';
  // Do not serialize arbitrary process logs: a provider error can contain user
  // data or a secret. This deliberately emits only controlled runtime state.
  const events = [{
    id: `runtime-${state.startedAt}`,
    type: 'Bot runtime',
    status,
    message: `WhatsApp connection state: ${String(state.connection || 'unknown')}.`,
    occurredAt,
  }];
  events.push(...state.getDashboardActivity());
  const welcomeGroups = groups.filter(group => group.welcome).length;
  const goodbyeGroups = groups.filter(group => group.goodbye).length;
  events.push({
    id: `group-automation-${state.startedAt}`,
    type: 'Group automation',
    status: 'info',
    message: `Welcome automation is enabled in ${welcomeGroups} group(s); goodbye automation is enabled in ${goodbyeGroups} group(s).`,
    occurredAt,
  });
  for (const provider of providers.filter(item => item.configured === false)) {
    events.push({
      id: `provider-${provider.id}-${state.startedAt}`,
      type: 'Provider configuration',
      status: 'warning',
      message: `${provider.name} is not configured on the bot host.`,
      occurredAt,
    });
  }
  return events.slice(0, 20);
}

function groupUpdateFromDashboard(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid group settings');
  const update = {};
  if (typeof body.welcomeEnabled === 'boolean') update.welcome = body.welcomeEnabled;
  if (typeof body.goodbyeEnabled === 'boolean') update.goodbye = body.goodbyeEnabled;
  if (typeof body.welcomeTemplate === 'string') {
    if (body.welcomeTemplate.length > 2000) throw new Error('welcome template is too long');
    update.welcomeMsg = body.welcomeTemplate;
  }
  if (typeof body.goodbyeTemplate === 'string') {
    if (body.goodbyeTemplate.length > 2000) throw new Error('goodbye template is too long');
    update.goodbyeMsg = body.goodbyeTemplate;
  }
  for (const section of ['moderation', 'automation']) {
    if (body[section] === undefined) continue;
    if (!body[section] || typeof body[section] !== 'object' || Array.isArray(body[section])) throw new Error(`invalid ${section} settings`);
    for (const [key, value] of Object.entries(body[section])) {
      if (BOOLEAN_GROUP_KEYS.has(key) && typeof value === 'boolean') update[key] = value;
    }
  }
  if (!Object.keys(update).length) throw new Error('no supported group settings supplied');
  return update;
}

function startBotApi({ port, database, getUsers, getGroups, getPlugins, getCommandCount, broadcast, restart, setSetting } = {}) {
  const app = express();
  app.use(express.json({
    limit: MAX_DASHBOARD_BODY_BYTES,
    verify: (req, _res, buffer) => { req.rawBody = buffer.toString('utf8'); },
  }));

  // Signed, strictly allowlisted API for the separately deployed control center.
  app.use('/v1/dashboard', requireSignedDashboardRequest);
  app.get('/v1/dashboard/snapshot', async (_req, res) => {
    try {
      const groups = (await getGroups?.()) || [];
      const health = getHealth();
      const providers = getProviderStates();
      res.json({
        health,
        uptimeSeconds: state.getUptimeSeconds(),
        commandCount: Number.isInteger(getCommandCount?.()) ? getCommandCount() : 0,
        deployment: {
          status: health === 'online' ? 'connected' : health === 'offline' ? 'disconnected' : 'degraded',
          message: health === 'online' ? 'Bot runtime is connected to WhatsApp.' : 'Bot runtime is not fully connected to WhatsApp.',
        },
        activity: dashboardActivity({ groups, providers }),
        providers,
        groups: groups.slice(0, 200).map(serializeGroup),
        tests: getDashboardTests(),
      });
    } catch (_error) {
      res.status(500).json({ error: 'unable to build dashboard snapshot' });
    }
  });
  app.post('/v1/dashboard/groups/:groupId/settings', async (req, res) => {
    try {
      const groupId = decodeURIComponent(req.params.groupId || '');
      if (!SAFE_GROUP_ID.test(groupId)) return res.status(400).json({ error: 'invalid group id' });
      if (!database?.updateGroup) return res.status(503).json({ error: 'group settings are unavailable' });
      const updates = groupUpdateFromDashboard(req.body);
      const saved = database.updateGroup(groupIdWithDomain(groupId), updates);
      state.log('info', `[dashboard] updated protected group configuration for ${groupId.replace(/[^0-9]/g, '').slice(-6)}`);
      return res.json({ ok: true, group: serializeGroup(saved) });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'invalid group settings' });
    }
  });
  app.post('/v1/dashboard/diagnostics', (_req, res) => {
    // Read-only local checks only; never execute shell or repository commands.
    return res.json({ tests: getDashboardTests(), checkedAt: new Date().toISOString() });
  });

  // Existing local dashboard API remains compatible, but it is authenticated
  // separately and should never be exposed without an additional access layer.
  app.use(requireApiKey);
  app.get('/status', (_req, res) => res.json(state.getSnapshot()));
  app.get('/logs', (_req, res) => res.json(state.logs));
  app.get('/users', async (_req, res) => {
    try { res.json((await getUsers?.()) || []); } catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.get('/groups', async (_req, res) => {
    try { res.json((await getGroups?.()) || []); } catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.get('/plugins', (_req, res) => {
    try { res.json((getPlugins && getPlugins()) || []); } catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.post('/broadcast', async (req, res) => {
    try {
      const { message, target } = req.body || {};
      if (!message) return res.status(400).json({ error: 'message is required' });
      const result = await broadcast?.(message, target);
      return res.json({ ok: true, result });
    } catch (error) { return res.status(500).json({ error: error.message }); }
  });
  app.post('/restart', async (_req, res) => {
    res.json({ ok: true, restarting: true });
    setTimeout(async () => { try { await restart?.(); } catch (_) { process.exit(0); } }, 300);
  });
  app.post('/settings', async (req, res) => {
    try {
      const updates = req.body || {};
      const wantsPairing = updates.requestPairing === true;
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'requestPairing') continue;
        if (key === 'prefix') state.prefix = value;
        if (key === 'mode') state.mode = value;
        await setSetting?.(key, value);
      }
      if (wantsPairing) {
        res.json({ ok: true, prefix: state.prefix, mode: state.mode, restarting: true });
        setTimeout(async () => { try { await restart?.(); } catch (_) { process.exit(0); } }, 300);
        return;
      }
      res.json({ ok: true, prefix: state.prefix, mode: state.mode });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.get('/backup', (_req, res) => {
    try { res.json({ ok: true, data: database ? database.exportAll?.() || {} : {} }); } catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.post('/restore', (req, res) => {
    try { database?.importAll?.(req.body || {}); res.json({ ok: true }); } catch (error) { res.status(500).json({ error: error.message }); }
  });

  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: '*' } });
  io.use((socket, next) => safeEqual(socket.handshake.auth?.apiKey, process.env.DASHBOARD_API_KEY) ? next() : next(new Error('unauthorized')));
  io.on('connection', socket => {
    socket.emit('status', state.getSnapshot());
    const onLog = entry => socket.emit('log', entry);
    const onStats = stats => socket.emit('stats', stats);
    const onConnection = payload => socket.emit('connection', payload);
    state.on('log', onLog); state.on('stats', onStats); state.on('connection', onConnection);
    socket.on('disconnect', () => { state.off('log', onLog); state.off('stats', onStats); state.off('connection', onConnection); });
  });

  const host = process.env.DASHBOARD_API_BIND_HOST || '127.0.0.1';
  server.listen(port, host, () => state.log('info', `[bot-api] listening on ${host}:${port}`));
  return { app, server, io };
}

module.exports = {
  startBotApi,
  state,
  __test__: { makeDashboardSignature, safeEqual, groupUpdateFromDashboard, serializeGroup },
};
