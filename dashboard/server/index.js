require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const { connectMongo } = require('./mongo');
const routes = require('./routes');
const bot = require('./botClient');
const { verifyToken } = require('./auth');

const PORT = parseInt(process.env.PORT || '5000', 10);
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

async function main() {
  await connectMongo().catch(err => console.error('[mongo] connect failed:', err.message));

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.use('/api', routes);

  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('/*splat', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  } else {
    app.get('/', (req, res) => res.send('Dashboard client not built yet. Run `npm run build` in dashboard/client.'));
  }

  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const payload = token && verifyToken(token);
    if (!payload) return next(new Error('unauthorized'));
    next();
  });

  // Bridge: relay live events from the bot's internal socket to dashboard clients.
  let botSocket = null;
  function connectBotSocket() {
    const { url, apiKey } = bot.getConfig();
    try {
      botSocket?.disconnect();
    } catch (_) {}
    botSocket = ioClient(url, { auth: { apiKey }, reconnection: true, timeout: 5000 });
    ['status', 'log', 'stats', 'connection'].forEach((evt) => {
      botSocket.on(evt, (payload) => io.emit(evt, payload));
    });
    botSocket.on('connect_error', () => {}); // bot may be offline/unreachable — dashboard still loads
  }
  connectBotSocket();
  setInterval(() => {
    if (!botSocket?.connected) connectBotSocket();
  }, 15000);

  io.on('connection', (socket) => {
    socket.emit('hello', { connectedAt: Date.now() });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[dashboard] listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[dashboard] fatal startup error:', err);
  process.exit(1);
});
