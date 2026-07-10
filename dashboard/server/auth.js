const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'insecure-dev-secret-change-me';
const ADMIN_PASSWORD = process.env.DASHBOARD_PASSWORD || 'mickyp007';

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
