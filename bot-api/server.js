// Lightweight internal API the dashboard talks to. Runs inside the SAME process
// as the bot (started from main.js) so it always has live access to bot state
// and the baileys socket. Protected by a shared API key — never expose this
// port publicly without a reverse proxy / firewall.
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const state = require('./state');

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!process.env.DASHBOARD_API_KEY) {
    return res.status(500).json({ error: 'DASHBOARD_API_KEY not configured on bot' });
  }
  if (key !== process.env.DASHBOARD_API_KEY) {
    return res.status(401).json({ error: 'invalid api key' });
  }
  next();
}

function startBotApi({ port, database, getUsers, getGroups, getPlugins, broadcast, restart, setSetting } = {}) {
  const app = express();
  app.use(express.json());
  app.use(requireApiKey);

  app.get('/status', (req, res) => res.json(state.getSnapshot()));

  app.get('/logs', (req, res) => res.json(state.logs));

  app.get('/users', async (req, res) => {
    try {
      res.json((await getUsers?.()) || []);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/groups', async (req, res) => {
    try {
      res.json((await getGroups?.()) || []);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/plugins', (req, res) => {
    try {
      res.json((getPlugins && getPlugins()) || []);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/broadcast', async (req, res) => {
    try {
      const { message, target } = req.body || {};
      if (!message) return res.status(400).json({ error: 'message is required' });
      const result = await broadcast?.(message, target);
      res.json({ ok: true, result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/restart', async (req, res) => {
    res.json({ ok: true, restarting: true });
    setTimeout(async () => {
      try {
        await restart?.();
      } catch (_) {
        process.exit(0); // let a process manager (PM2 / workflow) bring it back up
      }
    }, 300);
  });

  app.post('/settings', async (req, res) => {
    try {
      const updates = req.body || {};
      for (const [k, v] of Object.entries(updates)) {
        if (k === 'prefix') state.prefix = v;
        if (k === 'mode') state.mode = v;
        await setSetting?.(k, v);
      }
      res.json({ ok: true, prefix: state.prefix, mode: state.mode });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/backup', (req, res) => {
    try {
      const data = database ? database.exportAll?.() : null;
      res.json({ ok: true, data: data || {} });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/restore', (req, res) => {
    try {
      database?.importAll?.(req.body || {});
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: '*' } });

  io.use((socket, next) => {
    if (socket.handshake.auth?.apiKey === process.env.DASHBOARD_API_KEY) return next();
    next(new Error('unauthorized'));
  });

  io.on('connection', (socket) => {
    socket.emit('status', state.getSnapshot());
    const onLog = (entry) => socket.emit('log', entry);
    const onStats = (stats) => socket.emit('stats', stats);
    const onConnection = (payload) => socket.emit('connection', payload);
    state.on('log', onLog);
    state.on('stats', onStats);
    state.on('connection', onConnection);
    socket.on('disconnect', () => {
      state.off('log', onLog);
      state.off('stats', onStats);
      state.off('connection', onConnection);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    state.log('info', `[bot-api] listening on port ${port}`);
  });

  return { app, server, io };
}

module.exports = { startBotApi, state };
