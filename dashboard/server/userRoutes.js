// Account routes for regular (Google-signed-in) users: sign in, daily coin
// claim, and self-service bot deployment (pair a number, deploy, watch it
// auto-renew every 3 days as long as the account has coins).
const express = require('express');
const crypto = require('crypto');
const { User, Setting } = require('./mongo');
const bot = require('./botClient');
const googleAuth = require('./googleAuth');
const { issueUserToken, requireUser } = require('./userAuth');
const { DEPLOY_COST, CYCLE_MS } = require('./deployScheduler');

const router = express.Router();
const DAILY_CLAIM_COINS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 5 * 60 * 1000;
const STATE_COOKIE = 'oauth_state';

// OAuth state is bound to the initiating browser via a short-lived, signed,
// HttpOnly cookie — not just a global "was this ever issued" pool. The
// callback only succeeds if the state in the query string matches the state
// in *that browser's* cookie, which prevents an attacker from harvesting a
// valid {code,state} pair and replaying it into a victim's browser.
function signState(state) {
  const sig = crypto.createHmac('sha256', require('./auth').JWT_SECRET).update(state).digest('hex');
  return `${state}.${sig}`;
}
function verifySignedState(signed) {
  if (!signed || !signed.includes('.')) return null;
  const [state, sig] = signed.split('.');
  const expected = crypto.createHmac('sha256', require('./auth').JWT_SECRET).update(state).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? state : null;
  } catch {
    return null;
  }
}

// ── Google sign-in ──────────────────────────────────────────────────────
router.get('/auth/google', (req, res) => {
  if (!googleAuth.isConfigured()) {
    return res.status(500).send('Google sign-in is not configured (missing GOOGLE_CLIENT_ID/SECRET).');
  }
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, signState(state), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: STATE_TTL_MS,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
  res.redirect(googleAuth.buildAuthUrl(req, state));
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) throw new Error('missing code');
    const cookieState = verifySignedState(req.cookies?.[STATE_COOKIE]);
    res.clearCookie(STATE_COOKIE);
    if (!cookieState || !state || cookieState !== state) throw new Error('invalid or expired state');
    const profile = await googleAuth.exchangeCodeForProfile(req, code);

    let user = await User.findOne({ googleId: profile.googleId });
    if (!user) {
      user = await User.create({
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      });
    } else {
      user.name = profile.name;
      user.picture = profile.picture;
      await user.save();
    }

    const token = issueUserToken(user);
    res.redirect(`/account?token=${token}`);
  } catch (err) {
    console.error('[google-auth] callback failed:', err.message);
    res.redirect('/account/login?error=google_auth_failed');
  }
});

router.use(requireUser);

// ── Profile / balance ────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'account not found' });
  res.json({
    email: user.email,
    name: user.name,
    picture: user.picture,
    coins: user.coins,
    lastClaimAt: user.lastClaimAt,
    pendingNumber: user.pendingNumber,
    deployment: user.deployment,
    canClaim: !user.lastClaimAt || Date.now() - new Date(user.lastClaimAt).getTime() >= DAY_MS,
    deployCost: DEPLOY_COST,
  });
});

// ── Daily coin claim ─────────────────────────────────────────────────────
// Atomic: the eligibility check (lastClaimAt older than 24h, or unset) and
// the credit + timestamp update happen in a single conditional update, so
// two concurrent claim requests can't both pass the check and double-credit.
router.post('/coins/claim', async (req, res) => {
  const cutoff = new Date(Date.now() - DAY_MS);
  const updated = await User.findOneAndUpdate(
    { _id: req.userId, $or: [{ lastClaimAt: { $exists: false } }, { lastClaimAt: null }, { lastClaimAt: { $lte: cutoff } }] },
    { $inc: { coins: DAILY_CLAIM_COINS }, $set: { lastClaimAt: new Date() } },
    { new: true }
  );
  if (updated) return res.json({ ok: true, coins: updated.coins });

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'account not found' });
  const nextAt = new Date(new Date(user.lastClaimAt).getTime() + DAY_MS);
  res.status(429).json({ error: 'already claimed today', nextClaimAt: nextAt });
});

// ── Pair a WhatsApp number (step 1 — no coins spent yet) ─────────────────
router.post('/pair', async (req, res) => {
  const { number } = req.body || {};
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits || digits.length < 8) return res.status(400).json({ error: 'a valid number with country code is required' });
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'account not found' });
  user.pendingNumber = digits;
  await user.save();
  res.json({ ok: true, pendingNumber: digits });
});

// This bot only supports one live WhatsApp session at a time. The lock is a
// single Setting document; we acquire it atomically (findOneAndUpdate with a
// filter that requires it to be free or already ours) so two concurrent
// deploy requests can't both "win" and double-allocate the one bot process.
async function acquireGlobalLock(userId) {
  const uid = String(userId);
  try {
    const doc = await Setting.findOneAndUpdate(
      { key: 'activeDeploymentUser', $or: [{ value: null }, { value: { $exists: false } }, { value: uid }] },
      { key: 'activeDeploymentUser', value: uid },
      { upsert: true, new: true }
    );
    return doc?.value === uid;
  } catch (err) {
    // Two concurrent first-time acquisitions can both miss the filter (no
    // document yet) and race on the upsert, tripping the unique index on
    // `key` with E11000. That means someone else won the race — the lock is
    // simply not ours, not a server error.
    if (err?.code === 11000) return false;
    throw err;
  }
}

async function releaseGlobalLockIfOwner(userId) {
  const uid = String(userId);
  await Setting.findOneAndUpdate({ key: 'activeDeploymentUser', value: uid }, { value: null });
}

// ── Deploy the bot with the paired number (step 2 — spends coins) ────────
router.post('/deploy', async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'account not found' });

  if (user.deployment?.active) {
    return res.status(400).json({ error: 'you already have an active deployment on this account' });
  }
  if (!user.pendingNumber) {
    return res.status(400).json({ error: 'pair a WhatsApp number first' });
  }
  if (user.coins < DEPLOY_COST) {
    return res.status(402).json({ error: `not enough coins — deploying costs ${DEPLOY_COST} coins`, coins: user.coins });
  }

  const gotLock = await acquireGlobalLock(user._id);
  if (!gotLock) {
    return res.status(409).json({ error: 'another account currently has an active deployment — try again once it ends' });
  }

  // Reserve the coins/deployment slot with a single conditional update
  // (require coins >= cost and deployment not already active in the same
  // write) so two concurrent deploy requests from the same account can't
  // both pass the earlier in-memory checks and both trigger a bot pairing.
  const reserved = await User.findOneAndUpdate(
    { _id: user._id, coins: { $gte: DEPLOY_COST }, 'deployment.active': { $ne: true } },
    {
      $inc: { coins: -DEPLOY_COST },
      $set: {
        deployment: {
          active: true,
          ownerNumber: user.pendingNumber,
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + CYCLE_MS),
          renewals: 0,
          lastNote: 'Pairing…',
        },
      },
    },
    { new: true }
  );
  if (!reserved) {
    await releaseGlobalLockIfOwner(user._id);
    return res.status(409).json({ error: 'deployment already in progress on this account' });
  }
  user.coins = reserved.coins;
  user.deployment = reserved.deployment;

  // Automatically make the paired number the bot's owner and trigger pairing.
  const result = await bot.updateSettings({ ownerNumber: user.pendingNumber, requestPairing: true });
  if (result?.error || result?.offline) {
    // Roll back — the bot never actually took the deployment, so don't
    // charge the account or hold the global lock.
    user.coins += DEPLOY_COST;
    user.deployment = { active: false, lastNote: `Deploy failed: ${result.error || 'bot unreachable'}` };
    await user.save();
    await releaseGlobalLockIfOwner(user._id);
    return res.status(502).json({ error: result.error || 'bot is unreachable — try again shortly', coins: user.coins });
  }

  user.deployment.lastNote = 'Deployed';
  await user.save();

  res.json({ ok: true, coins: user.coins, deployment: user.deployment, botResult: result });
});

router.get('/deploy/status', async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'account not found' });
  res.json({ deployment: user.deployment, coins: user.coins });
});

module.exports = router;
