const mongoose = require('mongoose');

let connected = false;

async function connectMongo() {
  if (connected) return mongoose.connection;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[mongo] MONGODB_URI not set — dashboard will run without persistent storage for logs/broadcasts.');
    return null;
  }
  await mongoose.connect(uri);
  connected = true;
  console.log('[mongo] connected');
  return mongoose.connection;
}

const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true, index: true },
  value: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const broadcastLogSchema = new mongoose.Schema({
  message: String,
  target: String,
  sentBy: String,
  result: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const activityLogSchema = new mongoose.Schema({
  actor: String,
  action: String,
  detail: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// ── User accounts (Google sign-in, coin balance, bot deployments) ─────────
const deploymentSchema = new mongoose.Schema({
  active: { type: Boolean, default: false },
  ownerNumber: String,
  startedAt: Date,
  expiresAt: Date,
  renewals: { type: Number, default: 0 },
  lastNote: String,
}, { _id: false });

const userSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, index: true },
  email: { type: String, unique: true, index: true },
  name: String,
  picture: String,
  coins: { type: Number, default: 10 }, // new accounts start with one day's worth of coins
  lastClaimAt: Date,
  pendingNumber: String, // number entered on the Pair page, before Deploy is confirmed
  deployment: { type: deploymentSchema, default: () => ({}) },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
const BroadcastLog = mongoose.models.BroadcastLog || mongoose.model('BroadcastLog', broadcastLogSchema);
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);

module.exports = { connectMongo, Setting, BroadcastLog, ActivityLog, User, mongoose };
