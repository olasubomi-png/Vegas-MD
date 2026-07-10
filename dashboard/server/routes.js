const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { execFile } = require('child_process');
const { requireAuth, login } = require('./auth');
const bot = require('./botClient');
const { Setting, BroadcastLog, ActivityLog } = require('./mongo');

const router = express.Router();
const ROOT = path.join(__dirname, '..', '..');

async function logActivity(actor, action, detail) {
  try { await ActivityLog.create({ actor, action, detail }); } catch (_) {}
}

// ── Auth ─────────────────────────────────────────────────────────────────
router.post('/auth/login', (req, res) => {
  const { password } = req.body || {};
  const token = login(password);
  if (!token) return res.status(401).json({ error: 'invalid password' });
  res.json({ token });
});

router.use(requireAuth);

// ── Bot status / logs / stats ───────────────────────────────────────────
router.get('/status', async (req, res) => res.json(await bot.getStatus()));
router.get('/logs', async (req, res) => res.json(await bot.getLogs()));
router.get('/users', async (req, res) => res.json(await bot.getUsers()));
router.get('/groups', async (req, res) => res.json(await bot.getGroups()));
router.get('/plugins', async (req, res) => {
  const remote = await bot.getPlugins();
  if (Array.isArray(remote) && remote.length) return res.json(remote);
  try {
    res.json(fs.readdirSync(path.join(ROOT, 'plugins')).filter(f => f.endsWith('.js')));
  } catch {
    res.json([]);
  }
});

// ── System monitor (dashboard host machine) ─────────────────────────────
router.get('/system', (req, res) => {
  const cpus = os.cpus();
  const load = os.loadavg();
  res.json({
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model,
    loadavg: load,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    uptime: os.uptime(),
    platform: os.platform(),
    hostname: os.hostname(),
  });
});

// ── Broadcast ────────────────────────────────────────────────────────────
router.post('/broadcast', async (req, res) => {
  const { message, target } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message is required' });
  const result = await bot.broadcast(message, target || 'users');
  try { await BroadcastLog.create({ message, target, result }); } catch (_) {}
  await logActivity('admin', 'broadcast', { target, length: message.length });
  res.json(result);
});

router.get('/broadcast/history', async (req, res) => {
  try { res.json(await BroadcastLog.find().sort({ createdAt: -1 }).limit(50)); } catch { res.json([]); }
});

// ── Bot control ──────────────────────────────────────────────────────────
router.post('/bot/restart', async (req, res) => {
  await logActivity('admin', 'restart-bot', {});
  res.json(await bot.restart());
});

// ── Settings ─────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const docs = await Setting.find();
    const map = Object.fromEntries(docs.map(d => [d.key, d.value]));
    res.json({ ...map, botApi: bot.getConfig() });
  } catch {
    res.json({ botApi: bot.getConfig() });
  }
});

router.post('/settings', async (req, res) => {
  const updates = req.body || {};
  if (updates.botApiUrl || updates.botApiKey) {
    bot.configure({ url: updates.botApiUrl, apiKey: updates.botApiKey });
  }
  const forwardable = { ...updates };
  delete forwardable.botApiUrl;
  delete forwardable.botApiKey;
  try {
    for (const [k, v] of Object.entries(forwardable)) {
      await Setting.findOneAndUpdate({ key: k }, { value: v }, { upsert: true });
    }
  } catch (_) {}
  const remoteResult = Object.keys(forwardable).length ? await bot.updateSettings(forwardable) : { ok: true };
  await logActivity('admin', 'update-settings', updates);
  res.json({ ok: true, remoteResult });
});

// ── Owner management ─────────────────────────────────────────────────────
router.get('/owner', async (req, res) => {
  try {
    const doc = await Setting.findOne({ key: 'owners' });
    res.json({ owners: doc?.value || [] });
  } catch {
    res.json({ owners: [] });
  }
});

router.post('/owner', async (req, res) => {
  const { owners } = req.body || {};
  try { await Setting.findOneAndUpdate({ key: 'owners' }, { value: owners }, { upsert: true }); } catch (_) {}
  await logActivity('admin', 'update-owners', { count: owners?.length });
  res.json({ ok: true });
});

// ── Pair new number ──────────────────────────────────────────────────────
router.post('/pair', async (req, res) => {
  const { number } = req.body || {};
  if (!number) return res.status(400).json({ error: 'number is required' });
  const result = await bot.updateSettings({ ownerNumber: number, requestPairing: true });
  await logActivity('admin', 'pair-request', { number });
  res.json(result);
});

// ── Sessions ─────────────────────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const dir = path.join(ROOT, 'auth_info_baileys');
    const exists = fs.existsSync(dir);
    const files = exists ? fs.readdirSync(dir) : [];
    res.json({ primary: { exists, fileCount: files.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Menu image upload ────────────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(ROOT, 'assets'),
    filename: (req, file, cb) => cb(null, 'menu' + path.extname(file.originalname || '.jpg')),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.post('/menu-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image file is required' });
  await logActivity('admin', 'upload-menu-image', { filename: req.file.filename });
  res.json({ ok: true, filename: req.file.filename });
});

// ── Database backup / restore ────────────────────────────────────────────
router.get('/backup', async (req, res) => res.json(await bot.backup()));
router.post('/restore', async (req, res) => {
  const result = await bot.restore(req.body || {});
  await logActivity('admin', 'restore-db', {});
  res.json(result);
});

// ── GitHub updates ───────────────────────────────────────────────────────
function git(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT, timeout: 20000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout?.toString() || '', stderr: (stderr || err?.message || '').toString() });
    });
  });
}

router.get('/github/status', async (req, res) => {
  const [branch, status, log, remote] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD']),
    git(['status', '--porcelain']),
    git(['log', '-5', '--pretty=format:%h|%an|%ad|%s', '--date=iso']),
    git(['remote', '-v']),
  ]);
  res.json({
    branch: branch.stdout.trim(),
    dirty: status.stdout.trim().length > 0,
    commits: log.stdout.split('\n').filter(Boolean).map(l => {
      const [hash, author, date, ...msg] = l.split('|');
      return { hash, author, date, message: msg.join('|') };
    }),
    remotes: remote.stdout,
  });
});

router.post('/github/pull', async (req, res) => {
  const result = await git(['pull', '--ff-only']);
  await logActivity('admin', 'github-pull', result);
  res.json(result);
});

// ── Activity log ─────────────────────────────────────────────────────────
router.get('/activity', async (req, res) => {
  try { res.json(await ActivityLog.find().sort({ createdAt: -1 }).limit(100)); } catch { res.json([]); }
});

module.exports = router;
