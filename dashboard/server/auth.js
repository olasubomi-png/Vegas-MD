const jwt = require('jsonwebtoken');

// Defensive: strip an accidentally-pasted "KEY=" prefix from an env value
// (e.g. a secret saved as "JWT_SECRET=abc123" instead of just "abc123").
function stripKeyPrefix(name, value) {
  if (!value) return value;
  const prefix = `${name}=`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

const JWT_SECRET = stripKeyPrefix('JWT_SECRET', process.env.JWT_SECRET);
const ADMIN_PASSWORD = stripKeyPrefix('DASHBOARD_PASSWORD', process.env.DASHBOARD_PASSWORD);

if (!JWT_SECRET || !ADMIN_PASSWORD) {
  throw new Error(
    'JWT_SECRET and DASHBOARD_PASSWORD must be set (as secrets) before starting the dashboard. ' +
    'No insecure defaults are used.'
  );
}

function login(password) {
  if (password !== ADMIN_PASSWORD) return null;
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.user = payload;
  next();
}

module.exports = { login, verifyToken, requireAuth, JWT_SECRET };
