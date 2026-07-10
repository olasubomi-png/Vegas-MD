// Talks to the bot's internal API (bot-api/server.js), which may run in the
// same process (local dev) or on a remote host (e.g. the AWS box running the
// live bot). Configured via BOT_API_URL + BOT_API_KEY, changeable at runtime
// from the Settings page (persisted to Mongo when available).
const axios = require('axios');

let config = {
  url: process.env.BOT_API_URL || 'http://localhost:8090',
  apiKey: process.env.DASHBOARD_API_KEY || '',
};

function configure({ url, apiKey }) {
  if (url) config.url = url;
  if (apiKey) config.apiKey = apiKey;
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
    return { error: err.response?.data?.error || err.message, offline: true, ...(fallback || {}) };
  }
}

module.exports = {
  configure,
  getConfig,
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
