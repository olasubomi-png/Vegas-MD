// JWT auth for regular (Google-signed-in) accounts — separate from the
// single admin password login in auth.js. Uses the same JWT_SECRET but a
// distinct payload shape ({ role: 'user', uid }) so tokens can't be mixed up.
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');

function issueUserToken(user) {
  return jwt.sign({ role: 'user', uid: String(user._id) }, JWT_SECRET, { expiresIn: '30d' });
}

function verifyUserToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.role === 'user' ? payload : null;
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  const payload = token && verifyUserToken(token);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.userId = payload.uid;
  next();
}

module.exports = { issueUserToken, verifyUserToken, requireUser };
