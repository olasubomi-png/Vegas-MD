// Shared in-memory state for the bot, exposed to the dashboard via bot-api/server.js.
// This module is required directly by main.js so it always reflects live bot state.
const EventEmitter = require('events');

const MAX_LOGS = 500;
const MAX_DASHBOARD_ACTIVITY = 100;
const MAX_DASHBOARD_TESTS = 25;

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
    this.dashboardActivity = [];
    this.dashboardTests = [];
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

  recordDashboardActivity(type, status, message) {
    const entry = {
      id: `activity-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type: String(type).slice(0, 120),
      status: ['success', 'warning', 'error', 'info'].includes(status) ? status : 'info',
      message: String(message).slice(0, 500),
      occurredAt: new Date().toISOString(),
    };
    this.dashboardActivity.push(entry);
    if (this.dashboardActivity.length > MAX_DASHBOARD_ACTIVITY) this.dashboardActivity.shift();
    return entry;
  }

  getDashboardActivity() {
    return this.dashboardActivity.slice(-MAX_DASHBOARD_ACTIVITY).reverse();
  }

  recordDashboardTest({ id, name, status, details }) {
    const entry = {
      id: String(id || `test-${Date.now()}`).slice(0, 120),
      name: String(name || 'Bot diagnostic').slice(0, 180),
      status: ['passed', 'failed', 'running', 'unknown'].includes(status) ? status : 'unknown',
      details: String(details || '').slice(0, 500),
      completedAt: new Date().toISOString(),
    };
    this.dashboardTests = this.dashboardTests.filter(test => test.id !== entry.id);
    this.dashboardTests.push(entry);
    if (this.dashboardTests.length > MAX_DASHBOARD_TESTS) this.dashboardTests.shift();
    return entry;
  }

  getDashboardTests() {
    return this.dashboardTests.slice(-MAX_DASHBOARD_TESTS).reverse();
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
