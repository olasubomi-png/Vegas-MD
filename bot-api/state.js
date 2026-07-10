// Shared in-memory state for the bot, exposed to the dashboard via bot-api/server.js.
// This module is required directly by main.js so it always reflects live bot state.
const EventEmitter = require('events');

const MAX_LOGS = 500;

class BotState extends EventEmitter {
  constructor() {
    super();
    this.startedAt = Date.now();
    this.connection = 'connecting'; // connecting | open | close
    this.pairingCode = null;
    this.ownerNumber = process.env.OWNER_NUMBER || null;
    this.botNumber = null;
    this.prefix = '.';
    this.mode = 'private';
    this.logs = [];
    this.stats = { commandsRun: 0, messagesSeen: 0, groupsSeen: 0, usersSeen: 0 };
    this.sockRef = null; // set by main.js once baileys sock is created
  }

  setSock(sock) {
    this.sockRef = sock;
  }

  setConnection(state, extra = {}) {
    this.connection = state;
    Object.assign(this, extra);
    this.emit('connection', { state, ...extra });
  }

  log(level, message) {
    const entry = { ts: Date.now(), level, message: String(message) };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) this.logs.shift();
    this.emit('log', entry);
  }

  bumpStat(key, by = 1) {
    if (this.stats[key] === undefined) this.stats[key] = 0;
    this.stats[key] += by;
    this.emit('stats', this.stats);
  }

  getUptimeSeconds() {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  getSnapshot() {
    return {
      connection: this.connection,
      pairingCode: this.pairingCode,
      ownerNumber: this.ownerNumber,
      botNumber: this.botNumber,
      prefix: this.prefix,
      mode: this.mode,
      uptimeSeconds: this.getUptimeSeconds(),
      stats: this.stats,
      pid: process.pid,
      memory: process.memoryUsage(),
    };
  }
}

module.exports = new BotState();
