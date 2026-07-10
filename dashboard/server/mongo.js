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

const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
const BroadcastLog = mongoose.models.BroadcastLog || mongoose.model('BroadcastLog', broadcastLogSchema);
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);

module.exports = { connectMongo, Setting, BroadcastLog, ActivityLog, mongoose };
