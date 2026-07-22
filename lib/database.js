// Pure-JS JSON database — no native compilation needed
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/database.json');

function defaults() {
  return {
    users: {},
    groups: {},
    settings: {},
    ownerSettings: {},   // per-owner bot settings keyed by normalised phone number
    bannedUsers: []
  };
}

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch {}
  return defaults();
}

class Database {
  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.data = load();
  }

  save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
  }

  // ─── Users ────────────────────────────────────────────────
  _uid(jid) { return jid.replace(/[@:].*/g, ''); }

  getUser(jid) {
    const id = this._uid(jid);
    if (!this.data.users[id]) {
      this.data.users[id] = {
        id, name: '', balance: 0, xp: 0, level: 1,
        lastDaily: null, lastWork: null,
        warnings: 0, banned: false,
        // Per-user feature toggles
        antiDelete: false,   // track deleted messages in this user's DM
        autoStatus: false,   // auto-view this user's status updates
        fontStyle: 0,        // 0 = plain; 1-10 = Unicode style index
        createdAt: new Date().toISOString()
      };
      this.save();
    }
    // Back-fill missing fields for users created before these defaults existed
    const u = this.data.users[id];
    let dirty = false;
    if (!('antiDelete' in u)) { u.antiDelete = false; dirty = true; }
    if (!('autoStatus' in u)) { u.autoStatus = false; dirty = true; }
    if (!('fontStyle'  in u)) { u.fontStyle  = 0;     dirty = true; }
    if (dirty) this.save();
    return this.data.users[id];
  }

  updateUser(jid, updates) {
    const id = this._uid(jid);
    this.getUser(jid);
    Object.assign(this.data.users[id], updates);
    this.save();
    return this.data.users[id];
  }

  addBalance(jid, amount) {
    const user = this.getUser(jid);
    const bal = Math.max(0, (user.balance || 0) + amount);
    return this.updateUser(jid, { balance: bal });
  }

  addXP(jid, amount) {
    const user = this.getUser(jid);
    const xp = (user.xp || 0) + amount;
    const level = Math.floor(xp / 500) + 1;
    return this.updateUser(jid, { xp, level });
  }

  getLeaderboard(field = 'balance', limit = 10) {
    return Object.values(this.data.users)
      .filter(u => !u.banned)
      .sort((a, b) => (b[field] || 0) - (a[field] || 0))
      .slice(0, limit);
  }

  // ─── Groups ───────────────────────────────────────────────
  _gid(jid) { return jid.replace(/@.*/g, ''); }

  getGroup(jid) {
    const id = this._gid(jid);
    if (!this.data.groups[id]) {
      this.data.groups[id] = {
        id,
        welcome: false,       goodbye: false,
        welcomeMsg: '👋 Welcome @user to *@group*! You are member #@count.',
        goodbyeMsg: '👋 *@user* has left the group.',
        antiLink: false,      antiDelete: false,
        antiLinkAction: 'delete',            // 'delete' | 'kick' | 'warn'
        antiSpam: false,      antiViewOnce: false,
        antiChannel: false,   antiStatus: false,
        autoReact: false,     autoStatus: false,
        maxWarnings: 3,       muteLink: false
      };
      this.save();
    }
    return this.data.groups[id];
  }

  updateGroup(jid, updates) {
    const id = this._gid(jid);
    this.getGroup(jid);
    Object.assign(this.data.groups[id], updates);
    this.save();
    return this.data.groups[id];
  }

  toggleGroup(jid, key) {
    const g = this.getGroup(jid);
    const val = !g[key];
    this.updateGroup(jid, { [key]: val });
    return val;
  }

  // ─── Bot settings (global / legacy) ──────────────────────────────────────
  getSetting(key, fallback = null) {
    return key in this.data.settings ? this.data.settings[key] : fallback;
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }

  // ─── Per-owner settings ───────────────────────────────────────────────────
  // Each session owner (primary or secondary) has their own independent
  // settings for mode, antidelete, autoread, autotyping, anticall, etc.
  // Key is stored under the normalised phone number (digits only).
  getOwnerSetting(ownerJid, key, fallback = null) {
    const id = ownerJid ? this._uid(ownerJid) : null;
    if (id && this.data.ownerSettings?.[id] && key in this.data.ownerSettings[id]) {
      return this.data.ownerSettings[id][key];
    }
    return fallback;
  }

  setOwnerSetting(ownerJid, key, value) {
    const id = ownerJid ? this._uid(ownerJid) : null;
    if (!id) return;
    if (!this.data.ownerSettings) this.data.ownerSettings = {};
    if (!this.data.ownerSettings[id]) this.data.ownerSettings[id] = {};
    this.data.ownerSettings[id][key] = value;
    this.save();
  }

  // ─── Bans ─────────────────────────────────────────────────
  banUser(jid) {
    const id = this._uid(jid);
    this.updateUser(jid, { banned: true });
    if (!this.data.bannedUsers.includes(id)) {
      this.data.bannedUsers.push(id);
      this.save();
    }
  }

  unbanUser(jid) {
    const id = this._uid(jid);
    this.updateUser(jid, { banned: false });
    this.data.bannedUsers = this.data.bannedUsers.filter(u => u !== id);
    this.save();
  }

  isBanned(jid) {
    return this.data.bannedUsers.includes(this._uid(jid));
  }

  // ─── Warnings ─────────────────────────────────────────────
  addWarning(jid) {
    const user = this.getUser(jid);
    const warnings = (user.warnings || 0) + 1;
    this.updateUser(jid, { warnings });
    return warnings;
  }

  clearWarnings(jid) {
    return this.updateUser(jid, { warnings: 0 });
  }

  stats() {
    return {
      users: Object.keys(this.data.users).length,
      groups: Object.keys(this.data.groups).length,
      banned: this.data.bannedUsers.length
    };
  }

  // ─── Dashboard support ──────────────────────────────────────
  exportAll() {
    return JSON.parse(JSON.stringify(this.data));
  }

  importAll(data) {
    if (!data || typeof data !== 'object') throw new Error('invalid backup data');
    this.data = { ...defaults(), ...data };
    this.save();
    return this.data;
  }
}

module.exports = new Database();
