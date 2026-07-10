// Talks to the bot's internal API (bot-api/server.js), which may run in the
// same process (local dev) or on a remote host (e.g. the AWS box running the
// live bot). Configured via BOT_API_URL + BOT_API_KEY, changeable at runtime
// from the Settings page (persisted to Mongo when available).
const axios = require('axios');

let config = {
  url: process.env.BOT_API_URL || 'http://localhost:8090',
  apiKey: process.env.DASHBOARD_API_KEY || '',
};

const changeListeners = [];

function onConfigChange(fn) {
  changeListeners.push(fn);
}

function configure({ url, apiKey }) {
  let changed = false;
  if (url && url !== config.url) { config.url = url; changed = true; }
  if (apiKey && apiKey !== config.apiKey) { config.apiKey = apiKey; changed = true; }
  if (changed) changeListeners.forEach((fn) => { try { fn(config); } catch (_) {} });
}

function getConfig() {
  return { ...config };
}

function client() {
  return axios.create({
    baseURL: config.url,
    timeout: 8000,
    headers: { 'x-api-key': config.apiKey },
  });
}

async function safeCall(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    const error = err.response?.data?.error || err.message;
    if (Array.isArray(fallback)) return fallback; // keep array shape so callers can safely .map()
    return { error, offline: true, ...(fallback || {}) };
  }
}

module.exports = {
  configure,
  getConfig,
  onConfigChange,
  getStatus: () => safeCall(async () => (await client().get('/status')).data, { connection: 'unknown' }),
  getLogs: () => safeCall(async () => (await client().get('/logs')).data, []),
  getUsers: () => safeCall(async () => (await client().get('/users')).data, []),
  getGroups: () => safeCall(async () => (await client().get('/groups')).data, []),
  getPlugins: () => safeCall(async () => (await client().get('/plugins')).data, []),
  broadcast: (message, target) => safeCall(async () => (await client().post('/broadcast', { message, target })).data),
  restart: () => safeCall(async () => (await client().post('/restart')).data),
  updateSettings: (updates) => safeCall(async () => (await client().post('/settings', updates)).data),
  backup: () => safeCall(async () => (await client().get('/backup')).data),
  restore: (data) => safeCall(async () => (await client().post('/restore', data)).data),
};
