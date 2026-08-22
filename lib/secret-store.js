'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET_FILE = process.env.SECRETS_FILE || path.join(process.cwd(), '.secrets.enc.json');
const BLOCKED_KEYS = new Set([
  'PATH', 'HOME', 'PWD', 'OLDPWD', 'SHELL', 'NODE_OPTIONS', 'LD_PRELOAD', 'BASH_ENV',
  'ENV', 'CDPATH', 'GIT_CONFIG_GLOBAL', 'NPM_CONFIG_USERCONFIG',
  'SECRET_STORE_KEY', 'VEGAS_MASTER_KEY', 'SECRETS_FILE', 'REPO_WORKSPACE'
]);

function getMasterKey() {
  const value = process.env.SECRET_STORE_KEY || process.env.VEGAS_MASTER_KEY || '';
  if (!value) throw new Error('SECRET_STORE_KEY is not configured on the server');
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function assertKeyName(name) {
  const key = String(name || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(key) || BLOCKED_KEYS.has(key)) {
    throw new Error('Invalid or blocked secret name');
  }
  return key;
}

function encrypt(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decrypt(payload) {
  if (!payload || payload.version !== 1 || payload.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported encrypted secret file');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid secret payload');
  return parsed;
}

function readSecrets() {
  if (!fs.existsSync(SECRET_FILE)) return {};
  return decrypt(JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8')));
}

function writeSecrets(secrets) {
  const dir = path.dirname(SECRET_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const temp = `${SECRET_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(encrypt(secrets)), { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, SECRET_FILE);
  try { fs.chmodSync(SECRET_FILE, 0o600); } catch {}
}

function setSecret(name, value) {
  const key = assertKeyName(name);
  const secret = String(value || '').trim();
  if (!secret) throw new Error('Secret value cannot be empty');
  const secrets = readSecrets();
  secrets[key] = secret;
  writeSecrets(secrets);
  process.env[key] = secret;
  return key;
}

function removeSecret(name) {
  const key = assertKeyName(name);
  const secrets = readSecrets();
  const existed = Object.prototype.hasOwnProperty.call(secrets, key);
  delete secrets[key];
  if (existed) writeSecrets(secrets);
  delete process.env[key];
  return existed;
}

function listSecretNames() {
  return Object.keys(readSecrets()).sort();
}

function loadSecretsIntoEnv() {
  if (!process.env.SECRET_STORE_KEY && !process.env.VEGAS_MASTER_KEY) return [];
  try {
    const secrets = readSecrets();
    for (const [key, value] of Object.entries(secrets)) {
      if (typeof value === 'string' && !process.env[key]) process.env[key] = value;
    }
    return Object.keys(secrets);
  } catch (error) {
    console.error(`[secrets] encrypted store could not be loaded: ${error.message}`);
    return [];
  }
}

module.exports = {
  SECRET_FILE,
  assertKeyName,
  setSecret,
  removeSecret,
  listSecretNames,
  loadSecretsIntoEnv,
};
