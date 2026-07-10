// Periodically checks active deployments. Each deployment runs for 3 days;
// when it expires we try to auto-renew by deducting 10 coins from the
// account's balance. If the balance is insufficient the deployment is marked
// inactive (the account can redeploy once they have coins again).
const { User, Setting } = require('./mongo');

const DEPLOY_COST = 10;
const CYCLE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // check every 10 minutes

async function releaseGlobalLock(userId) {
  try {
    const lock = await Setting.findOne({ key: 'activeDeploymentUser' });
    if (lock?.value === String(userId)) {
      await Setting.findOneAndUpdate({ key: 'activeDeploymentUser' }, { value: null });
    }
  } catch (_) {}
}

async function checkExpiredDeployments() {
  let due;
  try {
    due = await User.find({ 'deployment.active': true, 'deployment.expiresAt': { $lte: new Date() } });
  } catch (err) {
    console.error('[deploy-scheduler] lookup failed:', err.message);
    return;
  }

  for (const user of due) {
    // Only the account currently holding the global single-instance lock is
    // allowed to renew — if an admin (or a lock bug) moved ownership
    // elsewhere, this account's "active" flag is stale and should just be
    // closed out instead of billing them for a bot they no longer control.
    const lock = await Setting.findOne({ key: 'activeDeploymentUser' });
    const ownsLock = lock?.value === String(user._id);

    if (ownsLock && user.coins >= DEPLOY_COST) {
      user.coins -= DEPLOY_COST;
      user.deployment.expiresAt = new Date(Date.now() + CYCLE_MS);
      user.deployment.renewals = (user.deployment.renewals || 0) + 1;
      user.deployment.lastNote = `Auto-renewed for another 3 days (-${DEPLOY_COST} coins) on ${new Date().toISOString()}`;
      await user.save();
      console.log(`[deploy-scheduler] renewed deployment for ${user.email}, ${user.coins} coins left`);
    } else {
      user.deployment.active = false;
      user.deployment.lastNote = ownsLock
        ? `Deployment stopped: insufficient coins to renew on ${new Date().toISOString()}`
        : `Deployment stopped: bot instance was reassigned by an admin on ${new Date().toISOString()}`;
      await user.save();
      if (ownsLock) await releaseGlobalLock(user._id);
      console.log(`[deploy-scheduler] stopped deployment for ${user.email} — ${ownsLock ? 'out of coins' : 'lock lost'}`);
    }
  }
}

function startDeployScheduler() {
  checkExpiredDeployments().catch((err) => console.error('[deploy-scheduler] initial check failed:', err.message));
  setInterval(() => {
    checkExpiredDeployments().catch((err) => console.error('[deploy-scheduler] check failed:', err.message));
  }, CHECK_INTERVAL_MS);
}

module.exports = { startDeployScheduler, DEPLOY_COST, CYCLE_MS };
