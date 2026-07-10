// Minimal "Sign in with Google" flow using google-auth-library's OAuth2Client.
// No passport dependency — we just build the consent URL, exchange the code,
// and fetch basic profile info (id, email, name, picture) from Google.
const { OAuth2Client } = require('google-auth-library');

function stripKeyPrefix(name, value) {
  if (!value) return value;
  const prefix = `${name}=`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

const CLIENT_ID = stripKeyPrefix('GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID);
const CLIENT_SECRET = stripKeyPrefix('GOOGLE_CLIENT_SECRET', process.env.GOOGLE_CLIENT_SECRET);

function callbackUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/api/user/auth/google/callback`;
}

function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function client(redirectUri) {
  return new OAuth2Client({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri });
}

function buildAuthUrl(req, state) {
  const oauth2 = client(callbackUrl(req));
  return oauth2.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state,
  });
}

async function exchangeCodeForProfile(req, code) {
  const oauth2 = client(callbackUrl(req));
  const { tokens } = await oauth2.getToken(code);
  const ticket = await oauth2.verifyIdToken({ idToken: tokens.id_token, audience: CLIENT_ID });
  const payload = ticket.getPayload();
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture || '',
  };
}

module.exports = { isConfigured, buildAuthUrl, exchangeCodeForProfile };
